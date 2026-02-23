/**
 * seed-conversation.ts — Programmatic conversation seed + verify tool
 *
 * Creates a real conversation through the ConversationEngine/SQLite pipeline
 * and verifies persistence without requiring a running dashboard server.
 *
 * Usage:
 *   npx ts-node scripts/seed-conversation.ts              # Seed + verify
 *   npx ts-node scripts/seed-conversation.ts --cleanup     # Remove seeded data
 *   npx ts-node scripts/seed-conversation.ts --dry-run     # Show plan only
 *   npx ts-node scripts/seed-conversation.ts --json        # JSON output
 *
 * Environment:
 *   VENTUREOS_RPG_DB     Path to RPG SQLite database
 *   CONVERSATION_PERSIST_DIR  Filesystem persist directory
 *
 * Fixes #183
 */

import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';

import { ConversationEngine, type ConversationState } from '../lib/conversation-engine';
import { ConversationAPI } from '../lib/conversation-api';
import { SqliteConversationStore } from '../lib/sqlite-conversation-store';
import { InteractionLogger } from '../lib/interaction-logger';

// ── Configuration ───────────────────────────────────────────────────────────

const DB_PATH =
  process.env.VENTUREOS_RPG_DB ??
  path.join(os.homedir(), 'clawd', 'agents', 'ventureos-rpg.db');

const PERSIST_DIR =
  process.env.CONVERSATION_PERSIST_DIR ??
  path.join(os.homedir(), 'clawd', 'ventureos', 'runtime', 'conversations');

const SEED_TAG = 'pipeline-verification';
const SEED_CREATOR = 'verify-script';

interface VerifyResult {
  step: string;
  status: 'pass' | 'fail' | 'warn' | 'info';
  detail: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function log(prefix: string, msg: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${prefix} ${msg}`);
}

function findExistingVerifyConversation(db: Database.Database): string | null {
  try {
    const row = db
      .prepare(
        `SELECT id FROM conversations WHERE metadata LIKE ? LIMIT 1`,
      )
      .get(`%${SEED_TAG}%`) as { id: string } | undefined;
    return row?.id ?? null;
  } catch {
    return null;
  }
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

async function cleanup(dryRun: boolean): Promise<void> {
  log('CLEANUP', `DB: ${DB_PATH}`);

  const db = new Database(DB_PATH, { readonly: false });
  db.pragma('journal_mode = WAL');

  const rows = db
    .prepare(
      `SELECT id FROM conversations WHERE metadata LIKE ? OR metadata LIKE ?`,
    )
    .all(`%${SEED_TAG}%`, `%${SEED_CREATOR}%`) as { id: string }[];

  if (rows.length === 0) {
    log('CLEANUP', 'No verification conversations found.');
    db.close();
    return;
  }

  log('CLEANUP', `Found ${rows.length} verification conversation(s):`);
  for (const row of rows) {
    log('CLEANUP', `  - ${row.id}`);
  }

  if (dryRun) {
    log('DRY-RUN', 'Would delete the above conversations.');
    db.close();
    return;
  }

  const deleteAll = db.transaction(() => {
    for (const row of rows) {
      db.prepare('DELETE FROM conversation_messages WHERE conversation_id = ?').run(row.id);
      db.prepare('DELETE FROM conversation_participants WHERE conversation_id = ?').run(row.id);
      db.prepare('DELETE FROM conversation_turn_state WHERE conversation_id = ?').run(row.id);
      db.prepare('DELETE FROM interaction_logs WHERE session_id = ?').run(row.id);
      db.prepare('DELETE FROM conversations WHERE id = ?').run(row.id);
      log('CLEANUP', `  Removed: ${row.id}`);
    }
  });

  deleteAll();
  db.close();
  log('CLEANUP', 'Done.');
}

// ── Seed + Verify ───────────────────────────────────────────────────────────

async function seedAndVerify(
  dryRun: boolean,
  jsonOutput: boolean,
): Promise<void> {
  const results: VerifyResult[] = [];

  const emit = (step: string, status: VerifyResult['status'], detail: string) => {
    results.push({ step, status, detail });
    if (!jsonOutput) {
      const icon = { pass: '✓', fail: '✗', warn: '⚠', info: 'ℹ' }[status];
      log(step, `${icon} ${detail}`);
    }
  };

  // Step 1: Check DB exists
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const tables = db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type='table' AND name IN ('conversations','conversation_messages','conversation_participants','conversation_turn_state','interaction_logs')`,
      )
      .get() as { cnt: number };
    emit('1-db-check', 'pass', `RPG database: ${DB_PATH} (${tables.cnt}/5 tables)`);
    db.close();
  } catch (err: any) {
    emit('1-db-check', 'fail', `Cannot open RPG database: ${err.message}`);
    if (jsonOutput) console.log(JSON.stringify({ results }, null, 2));
    process.exit(1);
  }

  if (dryRun) {
    emit('dry-run', 'info', 'Would create conversation, send 2 messages, and verify persistence.');
    if (jsonOutput) console.log(JSON.stringify({ results }, null, 2));
    return;
  }

  // Step 2: Initialize engine with SQLite store
  const store = new SqliteConversationStore(DB_PATH);
  const engine = ConversationEngine.createWithDefaults({
    config: { persistDir: PERSIST_DIR },
    store,
  });
  const api = new ConversationAPI(engine);

  // Wire interaction logger
  const logger = new InteractionLogger(DB_PATH);
  api.on('message', (evt: { message: any; state: any }) => {
    const msg = evt.message;
    if (!msg || msg.from === 'system') return;
    const recipients = (msg.deliveredTo ?? msg.to ?? []).filter(
      (r: string) => r !== 'user' && r !== 'system' && r !== 'broadcast',
    );
    if (recipients.length === 0) return;
    logger.logHandoff({
      from: msg.from,
      to: recipients,
      type: msg.payload?.type ?? 'message',
      outcome: msg.status ?? 'success',
      conversationId: msg.conversationId,
      description: msg.content?.slice(0, 200),
    });
  });

  api.on('conversation_started', (evt: { state: any }) => {
    const state = evt.state;
    if (!state || state.participants.length < 2) return;
    logger.logHandoff({
      from: state.participants[0],
      to: state.participants[1],
      type: 'conversation_start',
      outcome: 'success',
      conversationId: state.conversationId,
      description: `Conversation started with ${state.participants.length} participants`,
    });
  });

  emit('2-engine', 'pass', 'ConversationEngine initialized with SQLite store');

  // Step 3: Check for existing verification conversation (idempotent)
  const db = new Database(DB_PATH, { readonly: true });
  const existingId = findExistingVerifyConversation(db);
  db.close();

  let convId: string;
  let state: ConversationState;
  let createdNew = false;

  if (existingId) {
    emit('3-idempotent', 'info', `Existing verification conversation: ${existingId}`);
    state = await api.getConversation(existingId);
    convId = existingId;
  } else {
    state = await api.startConversation({
      participants: ['echo', 'nexus', 'oracle'],
      currentTurn: 'echo',
      metadata: {
        purpose: SEED_TAG,
        created_by: SEED_CREATOR,
        title: 'Pipeline Verification Conversation',
        created_at: new Date().toISOString(),
      },
    });
    convId = state.conversationId;
    createdNew = true;
    emit('3-create', 'pass', `Created conversation: ${convId}`);
  }

  // Step 4: Send verification messages (only if we created new)
  if (createdNew) {
    // Count interaction logs before messages
    const dbRW = new Database(DB_PATH, { readonly: true });
    const preLogs = (
      dbRW
        .prepare('SELECT COUNT(*) AS cnt FROM interaction_logs WHERE session_id = ?')
        .get(convId) as { cnt: number }
    ).cnt;
    dbRW.close();

    // Message 1: user → echo (user messages bypass handoff validation,
    // mirroring the real production ingest path where users initiate)
    const msg1 = await api.sendMessage({
      conversationId: convId,
      from: 'user',
      to: ['echo'],
      content:
        'Pipeline verification message 1 — confirming ingest path is functional.',
    });
    emit(
      '4a-msg1',
      msg1.status === 'delivered' ? 'pass' : 'warn',
      `Message 1 (user→echo): status=${msg1.status}`,
    );

    // Message 2: user → nexus (second message to a different participant)
    const msg2 = await api.sendMessage({
      conversationId: convId,
      from: 'user',
      to: ['nexus'],
      content:
        'Pipeline verification message 2 — confirming multi-participant routing.',
    });
    emit(
      '4b-msg2',
      msg2.status === 'delivered' ? 'pass' : 'warn',
      `Message 2 (user→nexus): status=${msg2.status}`,
    );

    // Step 5: Verify interaction log increment
    const dbRW2 = new Database(DB_PATH, { readonly: true });
    const postLogs = (
      dbRW2
        .prepare('SELECT COUNT(*) AS cnt FROM interaction_logs WHERE session_id = ?')
        .get(convId) as { cnt: number }
    ).cnt;
    dbRW2.close();

    const delta = postLogs - preLogs;
    emit(
      '5-interaction-logs',
      delta > 0 ? 'pass' : 'warn',
      `Interaction logs: ${preLogs} → ${postLogs} (Δ${delta})`,
    );
  } else {
    emit('4-skip', 'info', 'Skipped message send (conversation already exists)');
  }

  // Step 6: Verify SQLite persistence
  const verifyDb = new Database(DB_PATH, { readonly: true });

  const convRow = verifyDb
    .prepare('SELECT id, status, title FROM conversations WHERE id = ?')
    .get(convId) as { id: string; status: string; title: string } | undefined;

  emit(
    '6a-conv-table',
    convRow ? 'pass' : 'fail',
    convRow
      ? `conversations row: id=${convRow.id} status=${convRow.status}`
      : `Conversation ${convId} not in conversations table`,
  );

  const msgCount = (
    verifyDb
      .prepare('SELECT COUNT(*) AS cnt FROM conversation_messages WHERE conversation_id = ?')
      .get(convId) as { cnt: number }
  ).cnt;

  emit(
    '6b-messages',
    msgCount >= 1 ? 'pass' : createdNew ? 'fail' : 'info',
    `conversation_messages: ${msgCount} message(s)`,
  );

  const partCount = (
    verifyDb
      .prepare('SELECT COUNT(*) AS cnt FROM conversation_participants WHERE conversation_id = ?')
      .get(convId) as { cnt: number }
  ).cnt;

  emit(
    '6c-participants',
    partCount >= 2 ? 'pass' : 'fail',
    `conversation_participants: ${partCount} participant(s)`,
  );

  verifyDb.close();

  // Step 7: Verify API list includes conversation
  const ids = await api.listConversations();
  emit(
    '7-list-api',
    ids.includes(convId) ? 'pass' : 'fail',
    `listConversations() includes ${convId}: ${ids.includes(convId)} (${ids.length} total)`,
  );

  // Close resources
  store.close();
  logger.close();

  // Summary
  const failed = results.filter((r) => r.status === 'fail');

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          conversationId: convId,
          createdNew,
          results,
          passed: failed.length === 0,
        },
        null,
        2,
      ),
    );
  } else {
    console.log('');
    console.log('=== Seed + Verify Complete ===');
    console.log(`Conversation ID: ${convId}`);
    console.log(`Created new:     ${createdNew}`);
    console.log(
      `Result:          ${failed.length === 0 ? 'ALL CHECKS PASSED ✓' : `${failed.length} CHECK(S) FAILED ✗`}`,
    );
    console.log('');
    console.log('Cleanup: npx ts-node scripts/seed-conversation.ts --cleanup');
  }

  if (failed.length > 0) process.exit(1);
}

// ── CLI Entry ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const doCleanup = args.includes('--cleanup');
const dryRun = args.includes('--dry-run');
const jsonOutput = args.includes('--json');

(async () => {
  try {
    if (doCleanup) {
      await cleanup(dryRun);
    } else {
      await seedAndVerify(dryRun, jsonOutput);
    }
  } catch (err: any) {
    console.error(`FATAL: ${err.message}`);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
})();

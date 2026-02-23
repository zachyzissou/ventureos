/**
 * Tests for seed-conversation verification pipeline
 *
 * Validates that the seed + verify workflow correctly:
 * - Creates conversations through the ConversationEngine
 * - Persists to SQLite via SqliteConversationStore
 * - Logs interactions via InteractionLogger
 * - Supports idempotent re-runs
 * - Supports cleanup
 *
 * Fixes #183
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';

import { ConversationEngine } from '../conversation-engine';
import { ConversationAPI } from '../conversation-api';
import { SqliteConversationStore } from '../sqlite-conversation-store';
import { InteractionLogger } from '../interaction-logger';

describe('Conversation seed + verify pipeline (Issue #183)', () => {
  let tmpDir: string;
  let dbPath: string;
  let persistDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ventureos-seed-test-'));
    dbPath = path.join(tmpDir, 'test-rpg.db');
    persistDir = path.join(tmpDir, 'conversations');
    fs.mkdirSync(persistDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createStack() {
    const store = new SqliteConversationStore(dbPath);
    const engine = ConversationEngine.createWithDefaults({
      config: { persistDir },
      store,
    });
    const api = new ConversationAPI(engine);
    const logger = new InteractionLogger(dbPath);

    // Wire interaction logging (mirrors production wiring in conversation-http.ts)
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

    return { store, engine, api, logger };
  }

  test('full seed pipeline: create → message → verify persistence', async () => {
    const { store, api, logger } = createStack();

    // Create conversation with verification metadata
    const state = await api.startConversation({
      participants: ['echo', 'nexus', 'oracle'],
      currentTurn: 'echo',
      metadata: {
        purpose: 'pipeline-verification',
        created_by: 'verify-script',
        title: 'Pipeline Verification Conversation',
      },
    });

    expect(state.conversationId).toBeTruthy();
    expect(state.participants).toEqual(['echo', 'nexus', 'oracle']);
    expect(state.status).toBe('active');

    // Send message 1: user → echo (user messages bypass handoff validation,
    // mirroring the real production ingest path)
    const msg1 = await api.sendMessage({
      conversationId: state.conversationId,
      from: 'user',
      to: ['echo'],
      content: 'Verification message 1 — confirming ingest path is functional.',
    });
    expect(msg1.status).toBe('delivered');

    // Send message 2: user → nexus
    const msg2 = await api.sendMessage({
      conversationId: state.conversationId,
      from: 'user',
      to: ['nexus'],
      content: 'Verification message 2 — confirming multi-agent routing.',
    });
    expect(msg2.status).toBe('delivered');

    // Verify SQLite persistence
    const db = new Database(dbPath, { readonly: true });

    // Conversation row exists
    const convRow = db
      .prepare('SELECT id, status FROM conversations WHERE id = ?')
      .get(state.conversationId) as any;
    expect(convRow).toBeTruthy();
    expect(convRow.status).toBe('active');

    // Messages persisted
    const msgCount = (
      db
        .prepare('SELECT COUNT(*) AS cnt FROM conversation_messages WHERE conversation_id = ?')
        .get(state.conversationId) as any
    ).cnt;
    expect(msgCount).toBeGreaterThanOrEqual(2);

    // Participants persisted
    const partCount = (
      db
        .prepare('SELECT COUNT(*) AS cnt FROM conversation_participants WHERE conversation_id = ?')
        .get(state.conversationId) as any
    ).cnt;
    expect(partCount).toBe(3);

    // Turn state persisted
    const turnRow = db
      .prepare('SELECT current_speaker FROM conversation_turn_state WHERE conversation_id = ?')
      .get(state.conversationId) as any;
    expect(turnRow).toBeTruthy();
    expect(turnRow.current_speaker).toBe('nexus'); // last recipient

    // Interaction logs exist
    const logCount = (
      db
        .prepare('SELECT COUNT(*) AS cnt FROM interaction_logs WHERE session_id = ?')
        .get(state.conversationId) as any
    ).cnt;
    expect(logCount).toBeGreaterThanOrEqual(1);

    // List API includes the conversation
    const ids = await api.listConversations();
    expect(ids).toContain(state.conversationId);

    db.close();
    store.close();
    logger.close();
  });

  test('idempotent: re-running does not create duplicate conversations', async () => {
    const { store, api, logger } = createStack();

    // First run: create
    const state1 = await api.startConversation({
      participants: ['echo', 'nexus'],
      metadata: {
        purpose: 'pipeline-verification',
        created_by: 'verify-script',
      },
    });

    // Simulate idempotency check: find existing by metadata
    const db = new Database(dbPath, { readonly: true });
    const existing = db
      .prepare(
        `SELECT id FROM conversations WHERE metadata LIKE '%pipeline-verification%' LIMIT 1`,
      )
      .get() as { id: string } | undefined;
    db.close();

    expect(existing).toBeTruthy();
    expect(existing!.id).toBe(state1.conversationId);

    // Second run: should find existing, not create new
    const state2 = await api.getConversation(existing!.id);
    expect(state2.conversationId).toBe(state1.conversationId);

    // Verify only one conversation exists
    const ids = await api.listConversations();
    const verifyIds = ids.filter((id) => id === state1.conversationId);
    expect(verifyIds).toHaveLength(1);

    store.close();
    logger.close();
  });

  test('cleanup removes verification data', async () => {
    const { store, api, logger } = createStack();

    // Seed
    const state = await api.startConversation({
      participants: ['echo', 'nexus'],
      metadata: {
        purpose: 'pipeline-verification',
        created_by: 'verify-script',
      },
    });

    await api.sendMessage({
      conversationId: state.conversationId,
      from: 'user',
      to: ['echo'],
      content: 'test message',
    });

    // Close engine resources first
    store.close();
    logger.close();

    // Cleanup: delete by metadata match
    const db = new Database(dbPath, { readonly: false });
    db.pragma('journal_mode = WAL');

    const rows = db
      .prepare(
        `SELECT id FROM conversations WHERE metadata LIKE '%pipeline-verification%'`,
      )
      .all() as { id: string }[];

    expect(rows.length).toBeGreaterThanOrEqual(1);

    const cleanup = db.transaction(() => {
      for (const row of rows) {
        db.prepare('DELETE FROM conversation_messages WHERE conversation_id = ?').run(row.id);
        db.prepare('DELETE FROM conversation_participants WHERE conversation_id = ?').run(row.id);
        db.prepare('DELETE FROM conversation_turn_state WHERE conversation_id = ?').run(row.id);
        db.prepare('DELETE FROM interaction_logs WHERE session_id = ?').run(row.id);
        db.prepare('DELETE FROM conversations WHERE id = ?').run(row.id);
      }
    });
    cleanup();

    // Verify cleanup
    const remaining = (
      db.prepare('SELECT COUNT(*) AS cnt FROM conversations').get() as any
    ).cnt;
    expect(remaining).toBe(0);

    const remainingMsgs = (
      db.prepare('SELECT COUNT(*) AS cnt FROM conversation_messages').get() as any
    ).cnt;
    expect(remainingMsgs).toBe(0);

    db.close();
  });

  test('verification metadata is clearly tagged', async () => {
    const { store, api, logger } = createStack();

    const state = await api.startConversation({
      participants: ['echo', 'nexus'],
      metadata: {
        purpose: 'pipeline-verification',
        created_by: 'verify-script',
        title: 'Pipeline Verification Conversation',
      },
    });

    const db = new Database(dbPath, { readonly: true });
    const row = db
      .prepare('SELECT metadata FROM conversations WHERE id = ?')
      .get(state.conversationId) as { metadata: string };

    const meta = JSON.parse(row.metadata);
    expect(meta.purpose).toBe('pipeline-verification');
    expect(meta.created_by).toBe('verify-script');

    db.close();
    store.close();
    logger.close();
  });

  test('dashboard API endpoints return non-empty results', async () => {
    const { store, api, logger } = createStack();

    // Seed conversation
    const state = await api.startConversation({
      participants: ['echo', 'nexus', 'oracle'],
      currentTurn: 'echo',
      metadata: {
        purpose: 'pipeline-verification',
        created_by: 'verify-script',
      },
    });

    await api.sendMessage({
      conversationId: state.conversationId,
      from: 'user',
      to: ['echo'],
      content: 'Verification message',
    });

    // Simulate /api/conversation/conversations
    const list = await api.listConversations();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list).toContain(state.conversationId);

    // Simulate /api/conversation/conversations/:id
    const conv = await api.getConversation(state.conversationId);
    expect(conv.status).toBe('active');
    expect(conv.messageCount).toBeGreaterThanOrEqual(1);

    // Simulate /api/rpg/conversations/active (SQLite query)
    const db = new Database(dbPath, { readonly: true });
    const activeRows = db
      .prepare(`SELECT id, status, title FROM conversations WHERE status = 'active'`)
      .all() as any[];
    expect(activeRows.length).toBeGreaterThanOrEqual(1);
    expect(activeRows.some((r: any) => r.id === state.conversationId)).toBe(true);

    db.close();
    store.close();
    logger.close();
  });
});

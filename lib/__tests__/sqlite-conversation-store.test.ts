/**
 * Tests for SqliteConversationStore — Issue #182
 *
 * Validates that conversation state is correctly persisted to and
 * loaded from the SQLite database.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { SqliteConversationStore } from '../sqlite-conversation-store';
import type { ConversationState, ConversationMessage } from '../conversation-engine';

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-conv-store-test-'));
  dbPath = path.join(tmpDir, 'test-rpg.db');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeState(overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    conversationId: 'conv-test-1',
    createdAt: '2026-02-17T12:00:00.000Z',
    updatedAt: '2026-02-17T12:01:00.000Z',
    status: 'active',
    participants: ['oracle', 'atlas', 'sentinel'],
    currentTurn: 'oracle',
    tokenBudget: 10000,
    tokensUsed: 250,
    messageCount: 2,
    challengeCount: 0,
    consecutiveChallenges: 0,
    injectionScores: [0.1, 0.05],
    policyViolationCount: 0,
    voiceRuleViolationCount: 0,
    affinity: {
      averageAffinity: 0.7,
      lowestAffinity: 0.5,
      lowestAffinityPair: ['oracle', 'sentinel'],
    },
    summaries: [],
    messages: [
      {
        messageId: 'msg-1',
        conversationId: 'conv-test-1',
        from: 'oracle',
        to: ['atlas'],
        deliveredTo: ['atlas'],
        content: 'Hello Atlas, please analyze this data.',
        createdAt: '2026-02-17T12:00:30.000Z',
        status: 'delivered',
      } as ConversationMessage,
      {
        messageId: 'msg-2',
        conversationId: 'conv-test-1',
        from: 'atlas',
        to: ['oracle'],
        deliveredTo: ['oracle'],
        content: 'Analysis complete. Revenue up 12%.',
        createdAt: '2026-02-17T12:01:00.000Z',
        payload: { type: 'analysis_result', format: 'natural_language' },
        status: 'delivered',
      } as ConversationMessage,
    ],
    metadata: { topic: 'Revenue Analysis' },
    ...overrides,
  };
}

describe('SqliteConversationStore', () => {
  test('creates required tables on initialization', () => {
    const store = new SqliteConversationStore(dbPath);
    store.close();

    const db = new Database(dbPath, { readonly: true });
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as any[];
    const tableNames = tables.map((t: any) => t.name);
    expect(tableNames).toContain('conversations');
    expect(tableNames).toContain('conversation_messages');
    expect(tableNames).toContain('conversation_participants');
    expect(tableNames).toContain('conversation_turn_state');
    db.close();
  });

  test('save and load roundtrip preserves state', async () => {
    const store = new SqliteConversationStore(dbPath);
    const state = makeState();

    await store.save(state);
    const loaded = await store.load('conv-test-1');

    expect(loaded).not.toBeNull();
    expect(loaded!.conversationId).toBe('conv-test-1');
    expect(loaded!.status).toBe('active');
    expect(loaded!.participants.sort()).toEqual(['atlas', 'oracle', 'sentinel']);
    expect(loaded!.currentTurn).toBe('oracle');
    expect(loaded!.messages).toHaveLength(2);
    expect(loaded!.messages[0].messageId).toBe('msg-1');
    expect(loaded!.messages[0].from).toBe('oracle');
    expect(loaded!.messages[0].content).toBe('Hello Atlas, please analyze this data.');
    expect(loaded!.messages[1].messageId).toBe('msg-2');
    expect(loaded!.messages[1].content).toBe('Analysis complete. Revenue up 12%.');
    expect(loaded!.tokenBudget).toBe(10000);
    expect(loaded!.tokensUsed).toBe(250);
    store.close();
  });

  test('load returns null for non-existent conversation', async () => {
    const store = new SqliteConversationStore(dbPath);
    const result = await store.load('nonexistent');
    expect(result).toBeNull();
    store.close();
  });

  test('list returns all conversation IDs', async () => {
    const store = new SqliteConversationStore(dbPath);

    await store.save(makeState({ conversationId: 'conv-a', updatedAt: '2026-02-17T12:00:00Z' }));
    await store.save(makeState({ conversationId: 'conv-b', updatedAt: '2026-02-17T13:00:00Z' }));
    await store.save(makeState({ conversationId: 'conv-c', updatedAt: '2026-02-17T11:00:00Z' }));

    const ids = await store.list();
    // Ordered by updated_at DESC
    expect(ids).toEqual(['conv-b', 'conv-a', 'conv-c']);
    store.close();
  });

  test('save upserts on conflict (update existing)', async () => {
    const store = new SqliteConversationStore(dbPath);

    const v1 = makeState({ status: 'active' });
    await store.save(v1);

    const v2 = makeState({
      status: 'paused',
      updatedAt: '2026-02-17T14:00:00.000Z',
      statusReason: 'HITL pause',
    });
    await store.save(v2);

    const loaded = await store.load('conv-test-1');
    expect(loaded!.status).toBe('paused');
    store.close();
  });

  test('persists to actual SQLite tables readable by raw queries', async () => {
    const store = new SqliteConversationStore(dbPath);
    await store.save(makeState());
    store.close();

    // Verify using raw SQL (this is what the dashboard adapter routes do)
    const db = new Database(dbPath, { readonly: true });
    const convRow = db.prepare('SELECT * FROM conversations WHERE id = ?').get('conv-test-1') as any;
    expect(convRow).toBeTruthy();
    expect(convRow.status).toBe('active');

    const msgRows = db.prepare(
      'SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY timestamp'
    ).all('conv-test-1') as any[];
    expect(msgRows).toHaveLength(2);
    expect(msgRows[0].agent).toBe('oracle');
    expect(msgRows[1].agent).toBe('atlas');

    const partRows = db.prepare(
      'SELECT * FROM conversation_participants WHERE conversation_id = ?'
    ).all('conv-test-1') as any[];
    expect(partRows).toHaveLength(3);
    const agents = partRows.map((r: any) => r.agent).sort();
    expect(agents).toEqual(['atlas', 'oracle', 'sentinel']);

    const turnRow = db.prepare(
      'SELECT * FROM conversation_turn_state WHERE conversation_id = ?'
    ).get('conv-test-1') as any;
    expect(turnRow.current_speaker).toBe('oracle');

    db.close();
  });

  test('preserves message metadata through roundtrip', async () => {
    const store = new SqliteConversationStore(dbPath);
    const state = makeState();
    state.messages[1].payload = { type: 'analysis_result', format: 'json', data: { revenue: 12 } };
    state.messages[1].security = {
      injectionScore: 0.05,
      structureValid: true,
      structureErrors: [],
      sanitizedModified: false,
      redactionCount: 0,
      rateLimitAllowed: true,
      policyWarningCount: 0,
      voiceViolationCount: 0,
      hitlAction: 'allow',
      hitlTriggered: false,
      hitlUrgency: 'none',
      hitlMatchedTriggerIds: [],
    };

    await store.save(state);
    const loaded = await store.load('conv-test-1');

    expect(loaded!.messages[1].payload).toEqual({ type: 'analysis_result', format: 'json', data: { revenue: 12 } });
    expect(loaded!.messages[1].security?.injectionScore).toBe(0.05);
    store.close();
  });

  test('works with pre-existing database tables', async () => {
    // Pre-create with existing data (like the real RPG DB)
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        metadata TEXT DEFAULT '{}'
      );
      INSERT INTO conversations (id, title, status, created_at, updated_at)
      VALUES ('existing-conv', 'Old Conversation', 'active', '2026-02-14T00:00:00Z', '2026-02-14T00:00:00Z');

      CREATE TABLE conversation_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        agent TEXT NOT NULL,
        type TEXT DEFAULT 'fact',
        text TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        injection_score REAL DEFAULT 0,
        violations TEXT DEFAULT '[]',
        metadata TEXT DEFAULT '{}'
      );

      CREATE TABLE conversation_participants (
        conversation_id TEXT NOT NULL,
        agent TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        joined_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_active TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (conversation_id, agent)
      );

      CREATE TABLE conversation_turn_state (
        conversation_id TEXT PRIMARY KEY,
        current_speaker TEXT,
        queue TEXT DEFAULT '[]',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.close();

    const store = new SqliteConversationStore(dbPath);
    const ids = await store.list();
    expect(ids).toContain('existing-conv');

    // Save new conversation alongside existing
    await store.save(makeState());
    const ids2 = await store.list();
    expect(ids2).toContain('existing-conv');
    expect(ids2).toContain('conv-test-1');
    store.close();
  });

  test('empty conversation (no messages) roundtrips correctly', async () => {
    const store = new SqliteConversationStore(dbPath);
    const state = makeState({
      messages: [],
      messageCount: 0,
    });
    await store.save(state);
    const loaded = await store.load(state.conversationId);
    expect(loaded!.messages).toHaveLength(0);
    expect(loaded!.participants.sort()).toEqual(['atlas', 'oracle', 'sentinel']);
    store.close();
  });
});

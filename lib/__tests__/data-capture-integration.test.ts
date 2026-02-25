/**
 * Integration test for Issues #181 + #182 — Data Capture Pipeline
 *
 * Verifies that:
 * 1. When conversations are created/messaged through ConversationAPI,
 *    they persist in SQLite and are visible via list/load.
 * 2. Agent handoffs produce interaction_logs entries.
 * 3. The /api/rpg/conversations/active adapter would return non-empty data.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { SqliteConversationStore } from '../sqlite-conversation-store';
import { InteractionLogger } from '../interaction-logger';
import { ConversationEngine } from '../conversation-engine';
import { ConversationAPI } from '../conversation-api';

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-capture-integration-'));
  dbPath = path.join(tmpDir, 'test-rpg.db');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Data capture integration (#181 + #182)', () => {
  test('conversation created via API is visible in SQLite and via list', async () => {
    const store = new SqliteConversationStore(dbPath);
    const engine = ConversationEngine.createWithDefaults({ store });
    const api = new ConversationAPI(engine);

    // Create a conversation
    const state = await api.startConversation({
      participants: ['oracle', 'atlas'],
      metadata: { topic: 'Integration test' },
    });

    expect(state.conversationId).toBeTruthy();
    expect(state.participants).toEqual(['oracle', 'atlas']);

    // Verify it's in SQLite
    const db = new Database(dbPath, { readonly: true });
    const convRow = db.prepare('SELECT * FROM conversations WHERE id = ?').get(state.conversationId) as any;
    expect(convRow).toBeTruthy();
    expect(convRow.status).toBe('active');

    // Verify it's visible via list
    const ids = await api.listConversations();
    expect(ids).toContain(state.conversationId);

    db.close();
    store.close();
  });

  test('interaction logger captures handoff events from ConversationAPI', async () => {
    const store = new SqliteConversationStore(dbPath);
    const engine = ConversationEngine.createWithDefaults({
      store,
      config: { enforceTurns: false },
    });
    const api = new ConversationAPI(engine);
    const logger = new InteractionLogger(dbPath);

    // Wire event listener (mirrors what conversation-http.ts does)
    api.on('message', (evt: { message: any }) => {
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

    // Create conversation and send a message
    const state = await api.startConversation({
      participants: ['user', 'oracle'],
      currentTurn: 'user',
    });

    await api.sendMessage({
      conversationId: state.conversationId,
      from: 'user',
      to: 'oracle',
      content: 'What are the Q4 numbers?',
    });

    // Verify interaction was logged
    const stats = logger.getStats();
    expect(stats.totalLogged).toBeGreaterThanOrEqual(1);

    // Verify in SQLite
    const db = new Database(dbPath, { readonly: true });
    const logs = db.prepare('SELECT * FROM interaction_logs').all() as any[];
    expect(logs.length).toBeGreaterThanOrEqual(1);

    const handoff = logs.find((l: any) => l.initiator_agent === 'user');
    expect(handoff).toBeTruthy();
    expect(handoff.recipient_agent).toBe('oracle');
    expect(handoff.interaction_type).toBe('message');

    db.close();
    logger.close();
    store.close();
  });

  test('full pipeline: create → message → list shows non-empty active conversations', async () => {
    const store = new SqliteConversationStore(dbPath);
    const engine = ConversationEngine.createWithDefaults({
      store,
      config: { enforceTurns: false },
    });
    const api = new ConversationAPI(engine);

    // Simulate what happens in production
    const conv = await api.startConversation({
      participants: ['nexus', 'oracle', 'atlas'],
      metadata: { topic: 'Dashboard data verification' },
    });

    await api.sendMessage({
      conversationId: conv.conversationId,
      from: 'nexus',
      to: ['oracle'],
      content: 'Generating performance report.',
    });

    // Verify list returns non-empty
    const convIds = await api.listConversations();
    expect(convIds.length).toBeGreaterThan(0);
    expect(convIds).toContain(conv.conversationId);

    // Verify individual conversation has messages
    const loaded = await api.getConversation(conv.conversationId);
    expect(loaded.messages.length).toBeGreaterThan(0);
    expect(loaded.participants).toContain('nexus');
    expect(loaded.participants).toContain('oracle');

    // Verify SQLite has the data for dashboard adapter routes
    const db = new Database(dbPath, { readonly: true });
    const sqlConvs = db.prepare('SELECT * FROM conversations').all() as any[];
    expect(sqlConvs.length).toBeGreaterThan(0);

    const sqlMsgs = db.prepare('SELECT * FROM conversation_messages').all() as any[];
    expect(sqlMsgs.length).toBeGreaterThan(0);

    const sqlParts = db.prepare('SELECT * FROM conversation_participants').all() as any[];
    expect(sqlParts.length).toBeGreaterThanOrEqual(3);

    db.close();
    store.close();
  });
});

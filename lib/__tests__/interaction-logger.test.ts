/**
 * Tests for InteractionLogger — Issue #181
 *
 * Validates that interaction events are correctly persisted to the
 * SQLite interaction_logs table.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { InteractionLogger } from '../interaction-logger';

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'interaction-logger-test-'));
  dbPath = path.join(tmpDir, 'test-rpg.db');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('InteractionLogger', () => {
  test('creates interaction_logs table on first write', () => {
    const logger = new InteractionLogger(dbPath);
    logger.logInteraction({
      initiatorAgent: 'oracle',
      recipientAgent: 'atlas',
      interactionType: 'handoff',
      outcome: 'success',
    });
    logger.close();

    const db = new Database(dbPath, { readonly: true });
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='interaction_logs'"
    ).all();
    expect(tables).toHaveLength(1);
    db.close();
  });

  test('persists interaction with all fields', () => {
    const logger = new InteractionLogger(dbPath);
    logger.logInteraction({
      initiatorAgent: 'nexus',
      recipientAgent: 'sentinel',
      interactionType: 'escalation',
      outcome: 'success',
      missionId: 'mission-42',
      sessionId: 'conv-abc',
      description: 'Escalation from nexus to sentinel',
    });
    logger.close();

    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare('SELECT * FROM interaction_logs').all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].initiator_agent).toBe('nexus');
    expect(rows[0].recipient_agent).toBe('sentinel');
    expect(rows[0].interaction_type).toBe('escalation');
    expect(rows[0].outcome).toBe('success');
    expect(rows[0].mission_id).toBe('mission-42');
    expect(rows[0].session_id).toBe('conv-abc');
    expect(rows[0].description).toBe('Escalation from nexus to sentinel');
    expect(rows[0].created_at).toBeTruthy();
    db.close();
  });

  test('logHandoff writes one row per recipient', () => {
    const logger = new InteractionLogger(dbPath);
    logger.logHandoff({
      from: 'oracle',
      to: ['atlas', 'sentinel'],
      type: 'message',
      outcome: 'success',
      conversationId: 'conv-xyz',
      description: 'Multi-recipient handoff',
    });
    logger.close();

    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare('SELECT * FROM interaction_logs ORDER BY id').all() as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0].initiator_agent).toBe('oracle');
    expect(rows[0].recipient_agent).toBe('atlas');
    expect(rows[1].initiator_agent).toBe('oracle');
    expect(rows[1].recipient_agent).toBe('sentinel');
    db.close();
  });

  test('logHandoff skips broadcast and empty recipients', () => {
    const logger = new InteractionLogger(dbPath);
    logger.logHandoff({
      from: 'oracle',
      to: ['broadcast', '', 'atlas'],
      type: 'message',
      outcome: 'success',
    });
    logger.close();

    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare('SELECT * FROM interaction_logs').all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].recipient_agent).toBe('atlas');
    db.close();
  });

  test('getStats returns correct counts', () => {
    const logger = new InteractionLogger(dbPath);
    expect(logger.getStats().totalLogged).toBe(0);
    expect(logger.getStats().lastWriteAt).toBeNull();

    logger.logInteraction({
      initiatorAgent: 'a',
      recipientAgent: 'b',
      interactionType: 'test',
      outcome: 'success',
    });

    const stats = logger.getStats();
    expect(stats.totalLogged).toBe(1);
    expect(stats.lastWriteAt).toBeTruthy();
    expect(stats.dbPath).toBe(dbPath);
    logger.close();
  });

  test('multiple writes accumulate correctly', () => {
    const logger = new InteractionLogger(dbPath);
    for (let i = 0; i < 5; i++) {
      logger.logInteraction({
        initiatorAgent: `agent-${i}`,
        recipientAgent: `agent-${i + 1}`,
        interactionType: 'collaboration',
        outcome: 'success',
      });
    }
    expect(logger.getStats().totalLogged).toBe(5);
    logger.close();

    const db = new Database(dbPath, { readonly: true });
    const count = (db.prepare('SELECT COUNT(*) as c FROM interaction_logs').get() as any).c;
    expect(count).toBe(5);
    db.close();
  });

  test('works with existing database that already has interaction_logs table', () => {
    // Pre-create database with existing table (different schema variant)
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE interaction_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        initiator_agent TEXT NOT NULL,
        recipient_agent TEXT NOT NULL,
        interaction_type TEXT NOT NULL,
        outcome TEXT NOT NULL,
        mission_id TEXT,
        session_id TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.prepare(
      'INSERT INTO interaction_logs (initiator_agent, recipient_agent, interaction_type, outcome) VALUES (?, ?, ?, ?)'
    ).run('existing', 'data', 'test', 'success');
    db.close();

    const logger = new InteractionLogger(dbPath);
    logger.logInteraction({
      initiatorAgent: 'new',
      recipientAgent: 'data',
      interactionType: 'handoff',
      outcome: 'success',
    });
    logger.close();

    const db2 = new Database(dbPath, { readonly: true });
    const count = (db2.prepare('SELECT COUNT(*) as c FROM interaction_logs').get() as any).c;
    expect(count).toBe(2);
    db2.close();
  });
});

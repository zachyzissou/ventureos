/**
 * Tests for ObservationStore — Issue #230
 *
 * Validates that observation records are correctly persisted to and
 * loaded from the SQLite database, including schema creation, CRUD,
 * querying, batch operations, and token usage aggregation.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { ObservationStore } from '../observation-store';
import type { Observation, ObservationCategory } from '../types/observation';

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'observation-store-test-'));
  dbPath = path.join(tmpDir, 'test-obs.db');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: `obs-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: '2026-02-18T00:00:00.000Z',
    category: 'fact',
    content: 'The user prefers dark mode.',
    source: {
      conversationId: 'conv-test-1',
      messageId: 'msg-abc',
      agentId: 'oracle',
      channel: 'discord',
    },
    status: 'pending',
    metadata: {},
    ...overrides,
  };
}

function makeTokenObservation(overrides: Partial<Observation> = {}): Observation {
  return makeObservation({
    category: 'token_usage',
    content: 'Token usage: 50 tokens',
    tokenUsage: {
      inputTokens: 25,
      outputTokens: 25,
      totalTokens: 50,
      model: 'gpt-4',
      estimatedCostUsd: 0.001,
    },
    ...overrides,
  });
}

describe('ObservationStore', () => {
  // ─── Schema ─────────────────────────────────────────────────────────

  test('creates observations table and indexes on initialization', () => {
    const store = new ObservationStore(dbPath);
    store.close();

    const db = new Database(dbPath, { readonly: true });

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='observations'",
    ).all() as any[];
    expect(tables).toHaveLength(1);

    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='observations'",
    ).all() as any[];
    const indexNames = indexes.map((i: any) => i.name);
    expect(indexNames).toContain('idx_observations_status');
    expect(indexNames).toContain('idx_observations_agent');
    expect(indexNames).toContain('idx_observations_conversation');
    expect(indexNames).toContain('idx_observations_created');
    expect(indexNames).toContain('idx_observations_category');

    db.close();
  });

  test('is safe to initialize on a database that already has the table', () => {
    // Pre-create the table
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE observations (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'other',
        content TEXT NOT NULL,
        source_conversation_id TEXT,
        source_message_id TEXT,
        source_agent_id TEXT NOT NULL,
        source_channel TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        token_input INTEGER,
        token_output INTEGER,
        token_total INTEGER,
        token_model TEXT,
        token_cost_usd REAL,
        metadata TEXT DEFAULT '{}'
      );
    `);
    db.prepare(
      "INSERT INTO observations (id, created_at, category, content, source_agent_id, status) VALUES (?, ?, ?, ?, ?, ?)",
    ).run('existing-obs', '2026-02-17T00:00:00Z', 'fact', 'Pre-existing data', 'atlas', 'pending');
    db.close();

    const store = new ObservationStore(dbPath);
    const existing = store.getById('existing-obs');
    expect(existing).not.toBeNull();
    expect(existing!.content).toBe('Pre-existing data');
    store.close();
  });

  // ─── Insert + GetById ─────────────────────────────────────────────

  test('insert and getById roundtrip preserves all fields', () => {
    const store = new ObservationStore(dbPath);
    const obs = makeObservation({
      id: 'obs-roundtrip',
      metadata: { importance: 'high', tags: ['ui', 'preference'] },
    });

    store.insert(obs);
    const loaded = store.getById('obs-roundtrip');

    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe('obs-roundtrip');
    expect(loaded!.createdAt).toBe('2026-02-18T00:00:00.000Z');
    expect(loaded!.category).toBe('fact');
    expect(loaded!.content).toBe('The user prefers dark mode.');
    expect(loaded!.source.conversationId).toBe('conv-test-1');
    expect(loaded!.source.messageId).toBe('msg-abc');
    expect(loaded!.source.agentId).toBe('oracle');
    expect(loaded!.source.channel).toBe('discord');
    expect(loaded!.status).toBe('pending');
    expect(loaded!.metadata).toEqual({ importance: 'high', tags: ['ui', 'preference'] });
    store.close();
  });

  test('insert preserves token usage data', () => {
    const store = new ObservationStore(dbPath);
    const obs = makeTokenObservation({ id: 'obs-token-1' });

    store.insert(obs);
    const loaded = store.getById('obs-token-1');

    expect(loaded!.tokenUsage).toBeDefined();
    expect(loaded!.tokenUsage!.inputTokens).toBe(25);
    expect(loaded!.tokenUsage!.outputTokens).toBe(25);
    expect(loaded!.tokenUsage!.totalTokens).toBe(50);
    expect(loaded!.tokenUsage!.model).toBe('gpt-4');
    expect(loaded!.tokenUsage!.estimatedCostUsd).toBe(0.001);
    store.close();
  });

  test('getById returns null for non-existent observation', () => {
    const store = new ObservationStore(dbPath);
    expect(store.getById('nonexistent')).toBeNull();
    store.close();
  });

  test('insert handles observation without optional fields', () => {
    const store = new ObservationStore(dbPath);
    const obs: Observation = {
      id: 'obs-minimal',
      createdAt: '2026-02-18T00:00:00.000Z',
      category: 'other',
      content: 'Minimal observation',
      source: { agentId: 'system' },
      status: 'pending',
    };

    store.insert(obs);
    const loaded = store.getById('obs-minimal');

    expect(loaded).not.toBeNull();
    expect(loaded!.source.conversationId).toBeUndefined();
    expect(loaded!.source.messageId).toBeUndefined();
    expect(loaded!.source.channel).toBeUndefined();
    expect(loaded!.tokenUsage).toBeUndefined();
    store.close();
  });

  // ─── Batch Insert ─────────────────────────────────────────────────

  test('insertBatch writes multiple observations atomically', () => {
    const store = new ObservationStore(dbPath);
    const observations = Array.from({ length: 5 }, (_, i) =>
      makeObservation({ id: `obs-batch-${i}`, content: `Batch item ${i}` }),
    );

    store.insertBatch(observations);
    expect(store.count()).toBe(5);

    for (let i = 0; i < 5; i++) {
      const loaded = store.getById(`obs-batch-${i}`);
      expect(loaded!.content).toBe(`Batch item ${i}`);
    }
    store.close();
  });

  test('insertBatch with empty array is a no-op', () => {
    const store = new ObservationStore(dbPath);
    store.insertBatch([]);
    expect(store.count()).toBe(0);
    store.close();
  });

  // ─── Query ────────────────────────────────────────────────────────

  test('query returns all observations when no filters', () => {
    const store = new ObservationStore(dbPath);
    store.insertBatch([
      makeObservation({ id: 'obs-q1' }),
      makeObservation({ id: 'obs-q2' }),
      makeObservation({ id: 'obs-q3' }),
    ]);

    const results = store.query();
    expect(results).toHaveLength(3);
    store.close();
  });

  test('query filters by category', () => {
    const store = new ObservationStore(dbPath);
    store.insertBatch([
      makeObservation({ id: 'obs-fact', category: 'fact' }),
      makeObservation({ id: 'obs-pref', category: 'preference' }),
      makeObservation({ id: 'obs-token', category: 'token_usage' }),
    ]);

    const facts = store.query({ category: 'fact' });
    expect(facts).toHaveLength(1);
    expect(facts[0].id).toBe('obs-fact');

    const prefs = store.query({ category: 'preference' });
    expect(prefs).toHaveLength(1);
    expect(prefs[0].id).toBe('obs-pref');
    store.close();
  });

  test('query filters by status', () => {
    const store = new ObservationStore(dbPath);
    store.insert(makeObservation({ id: 'obs-p', status: 'pending' }));
    store.insert(makeObservation({ id: 'obs-d', status: 'processed' }));

    const pending = store.query({ status: 'pending' });
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('obs-p');
    store.close();
  });

  test('query filters by agentId', () => {
    const store = new ObservationStore(dbPath);
    store.insert(makeObservation({ id: 'obs-oracle', source: { agentId: 'oracle' } }));
    store.insert(makeObservation({ id: 'obs-atlas', source: { agentId: 'atlas' } }));

    const oracleObs = store.query({ agentId: 'oracle' });
    expect(oracleObs).toHaveLength(1);
    expect(oracleObs[0].id).toBe('obs-oracle');
    store.close();
  });

  test('query filters by conversationId', () => {
    const store = new ObservationStore(dbPath);
    store.insert(makeObservation({
      id: 'obs-conv-a',
      source: { agentId: 'oracle', conversationId: 'conv-a' },
    }));
    store.insert(makeObservation({
      id: 'obs-conv-b',
      source: { agentId: 'oracle', conversationId: 'conv-b' },
    }));

    const convA = store.query({ conversationId: 'conv-a' });
    expect(convA).toHaveLength(1);
    expect(convA[0].id).toBe('obs-conv-a');
    store.close();
  });

  test('query filters by time range (since/before)', () => {
    const store = new ObservationStore(dbPath);
    store.insertBatch([
      makeObservation({ id: 'obs-old', createdAt: '2026-02-15T00:00:00Z' }),
      makeObservation({ id: 'obs-mid', createdAt: '2026-02-17T00:00:00Z' }),
      makeObservation({ id: 'obs-new', createdAt: '2026-02-19T00:00:00Z' }),
    ]);

    const sinceResult = store.query({ since: '2026-02-16T00:00:00Z' });
    expect(sinceResult).toHaveLength(2);

    const beforeResult = store.query({ before: '2026-02-18T00:00:00Z' });
    expect(beforeResult).toHaveLength(2);

    const rangeResult = store.query({
      since: '2026-02-16T00:00:00Z',
      before: '2026-02-18T00:00:00Z',
    });
    expect(rangeResult).toHaveLength(1);
    expect(rangeResult[0].id).toBe('obs-mid');
    store.close();
  });

  test('query respects limit and offset', () => {
    const store = new ObservationStore(dbPath);
    for (let i = 0; i < 10; i++) {
      store.insert(makeObservation({
        id: `obs-page-${i}`,
        createdAt: `2026-02-18T${String(i).padStart(2, '0')}:00:00Z`,
      }));
    }

    const page1 = store.query({ limit: 3, offset: 0 });
    expect(page1).toHaveLength(3);

    const page2 = store.query({ limit: 3, offset: 3 });
    expect(page2).toHaveLength(3);

    // Ensure no overlap
    const page1Ids = page1.map((o) => o.id);
    const page2Ids = page2.map((o) => o.id);
    for (const id of page2Ids) {
      expect(page1Ids).not.toContain(id);
    }
    store.close();
  });

  test('query limit is capped at 1000', () => {
    const store = new ObservationStore(dbPath);
    // Just verify it doesn't throw — we don't need 1000+ rows
    const results = store.query({ limit: 5000 });
    expect(results).toHaveLength(0);
    store.close();
  });

  test('query with multiple filters combined', () => {
    const store = new ObservationStore(dbPath);
    store.insertBatch([
      makeObservation({
        id: 'obs-match',
        category: 'fact',
        status: 'pending',
        source: { agentId: 'oracle', conversationId: 'conv-x' },
      }),
      makeObservation({
        id: 'obs-wrong-cat',
        category: 'preference',
        status: 'pending',
        source: { agentId: 'oracle', conversationId: 'conv-x' },
      }),
      makeObservation({
        id: 'obs-wrong-agent',
        category: 'fact',
        status: 'pending',
        source: { agentId: 'atlas', conversationId: 'conv-x' },
      }),
    ]);

    const results = store.query({
      category: 'fact',
      agentId: 'oracle',
      conversationId: 'conv-x',
    });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('obs-match');
    store.close();
  });

  // ─── Update Status ────────────────────────────────────────────────

  test('updateStatus changes the observation status', () => {
    const store = new ObservationStore(dbPath);
    store.insert(makeObservation({ id: 'obs-update', status: 'pending' }));

    store.updateStatus('obs-update', 'processed');
    const loaded = store.getById('obs-update');
    expect(loaded!.status).toBe('processed');
    store.close();
  });

  test('updateStatus is a no-op for non-existent observation', () => {
    const store = new ObservationStore(dbPath);
    // Should not throw
    store.updateStatus('nonexistent', 'processed');
    store.close();
  });

  // ─── Token Usage Summary ──────────────────────────────────────────

  test('getTokenUsageSummary aggregates token_usage observations', () => {
    const store = new ObservationStore(dbPath);
    store.insertBatch([
      makeTokenObservation({
        id: 'obs-t1',
        tokenUsage: { inputTokens: 100, outputTokens: 200, totalTokens: 300, estimatedCostUsd: 0.01 },
      }),
      makeTokenObservation({
        id: 'obs-t2',
        tokenUsage: { inputTokens: 50, outputTokens: 75, totalTokens: 125, estimatedCostUsd: 0.005 },
      }),
      // Non-token observation — should not be counted
      makeObservation({ id: 'obs-fact-ignored', category: 'fact' }),
    ]);

    const summary = store.getTokenUsageSummary();
    expect(summary.totalInputTokens).toBe(150);
    expect(summary.totalOutputTokens).toBe(275);
    expect(summary.totalTokens).toBe(425);
    expect(summary.totalEstimatedCostUsd).toBeCloseTo(0.015, 4);
    expect(summary.observationCount).toBe(2);
    store.close();
  });

  test('getTokenUsageSummary filters by agentId', () => {
    const store = new ObservationStore(dbPath);
    store.insertBatch([
      makeTokenObservation({
        id: 'obs-ta',
        source: { agentId: 'oracle', conversationId: 'c1' },
        tokenUsage: { inputTokens: 100, outputTokens: 100, totalTokens: 200 },
      }),
      makeTokenObservation({
        id: 'obs-tb',
        source: { agentId: 'atlas', conversationId: 'c1' },
        tokenUsage: { inputTokens: 50, outputTokens: 50, totalTokens: 100 },
      }),
    ]);

    const oracleSummary = store.getTokenUsageSummary({ agentId: 'oracle' });
    expect(oracleSummary.totalTokens).toBe(200);
    expect(oracleSummary.observationCount).toBe(1);
    store.close();
  });

  test('getTokenUsageSummary returns zeros when no data', () => {
    const store = new ObservationStore(dbPath);
    const summary = store.getTokenUsageSummary();
    expect(summary.totalInputTokens).toBe(0);
    expect(summary.totalOutputTokens).toBe(0);
    expect(summary.totalTokens).toBe(0);
    expect(summary.totalEstimatedCostUsd).toBe(0);
    expect(summary.observationCount).toBe(0);
    store.close();
  });

  // ─── Count ────────────────────────────────────────────────────────

  test('count returns total observations', () => {
    const store = new ObservationStore(dbPath);
    store.insertBatch([
      makeObservation({ id: 'obs-c1' }),
      makeObservation({ id: 'obs-c2' }),
      makeObservation({ id: 'obs-c3' }),
    ]);
    expect(store.count()).toBe(3);
    store.close();
  });

  test('count respects filters', () => {
    const store = new ObservationStore(dbPath);
    store.insertBatch([
      makeObservation({ id: 'obs-ca', category: 'fact' }),
      makeObservation({ id: 'obs-cb', category: 'fact' }),
      makeObservation({ id: 'obs-cc', category: 'preference' }),
    ]);
    expect(store.count({ category: 'fact' })).toBe(2);
    expect(store.count({ category: 'preference' })).toBe(1);
    expect(store.count({ category: 'decision' })).toBe(0);
    store.close();
  });

  // ─── Raw SQL Verification ────────────────────────────────────────

  test('data is readable via raw SQL queries', () => {
    const store = new ObservationStore(dbPath);
    store.insert(makeTokenObservation({
      id: 'obs-raw',
      source: { agentId: 'nexus', conversationId: 'conv-42' },
    }));
    store.close();

    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare('SELECT * FROM observations WHERE id = ?').get('obs-raw') as any;
    expect(row).toBeTruthy();
    expect(row.source_agent_id).toBe('nexus');
    expect(row.source_conversation_id).toBe('conv-42');
    expect(row.category).toBe('token_usage');
    expect(row.token_total).toBe(50);
    expect(row.token_model).toBe('gpt-4');
    db.close();
  });

  // ─── Edge Cases ───────────────────────────────────────────────────

  test('handles large content strings', () => {
    const store = new ObservationStore(dbPath);
    const largeContent = 'x'.repeat(100_000);
    store.insert(makeObservation({ id: 'obs-large', content: largeContent }));

    const loaded = store.getById('obs-large');
    expect(loaded!.content.length).toBe(100_000);
    store.close();
  });

  test('handles special characters in content', () => {
    const store = new ObservationStore(dbPath);
    const specialContent = "User said: \"Hello! It's a \\test\\ with 日本語 and emoji 🎉\"";
    store.insert(makeObservation({ id: 'obs-special', content: specialContent }));

    const loaded = store.getById('obs-special');
    expect(loaded!.content).toBe(specialContent);
    store.close();
  });

  test('handles malformed metadata JSON gracefully', () => {
    const store = new ObservationStore(dbPath);
    store.insert(makeObservation({ id: 'obs-meta-bad' }));
    store.close();

    // Corrupt the metadata directly
    const db = new Database(dbPath);
    db.prepare("UPDATE observations SET metadata = 'not-json' WHERE id = ?").run('obs-meta-bad');
    db.close();

    const store2 = new ObservationStore(dbPath);
    const loaded = store2.getById('obs-meta-bad');
    expect(loaded).not.toBeNull();
    expect(loaded!.metadata).toEqual({});
    store2.close();
  });

  // ─── Query ordering ──────────────────────────────────────────────

  test('query returns results ordered by created_at DESC', () => {
    const store = new ObservationStore(dbPath);
    store.insertBatch([
      makeObservation({ id: 'obs-old', createdAt: '2026-02-15T00:00:00Z' }),
      makeObservation({ id: 'obs-new', createdAt: '2026-02-19T00:00:00Z' }),
      makeObservation({ id: 'obs-mid', createdAt: '2026-02-17T00:00:00Z' }),
    ]);

    const results = store.query();
    expect(results[0].id).toBe('obs-new');
    expect(results[1].id).toBe('obs-mid');
    expect(results[2].id).toBe('obs-old');
    store.close();
  });
});

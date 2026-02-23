/**
 * Tests for ReflectorAgent — Issue #232 (Phase 3)
 *
 * Validates the reflection/GC pipeline: threshold detection, LLM-driven
 * decisions (keep/merge/discard), soft-delete via reflected_at, minimum
 * retained floor, mutex guard, reflection log, and memory_state update.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ObservationStore } from '../observation-store';
import { ObservationCache } from '../observation-cache';
import {
  ReflectorAgent,
  parseReflectorResponse,
  type ReflectorLLMClient,
} from '../reflector-agent';
import type { Observation, ReflectionLLMResult } from '../types/observation';

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reflector-test-'));
  dbPath = path.join(tmpDir, 'test-obs.db');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeObs(overrides: Partial<Observation> = {}): Observation {
  return {
    id: `obs-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: '2026-02-18T00:00:00.000Z',
    category: 'fact',
    content: 'Test observation',
    source: { agentId: 'oracle', conversationId: 'conv-1' },
    status: 'processed',
    priority: 'medium',
    metadata: {},
    ...overrides,
  };
}

function seedObservations(store: ObservationStore, count: number, agentId = 'oracle'): Observation[] {
  const obs: Observation[] = [];
  for (let i = 0; i < count; i++) {
    const o = makeObs({
      id: `obs-${i}`,
      content: `Observation number ${i} with content for testing reflection`,
      source: { agentId, conversationId: 'conv-1' },
      priority: i < 2 ? 'high' : i < 5 ? 'medium' : 'info',
    });
    obs.push(o);
  }
  store.insertBatch(obs);
  return obs;
}

function makeLLMClient(response: ReflectionLLMResult | string | Error): ReflectorLLMClient {
  return {
    chatCompletion: async () => {
      if (response instanceof Error) throw response;
      if (typeof response === 'string') return response;
      return JSON.stringify(response);
    },
  };
}

function makeKeepAllResponse(ids: string[]): ReflectionLLMResult {
  return {
    decisions: ids.map((id) => ({
      observationId: id,
      decision: 'keep' as const,
      reason: 'Still relevant',
    })),
    summary: 'All observations are still relevant',
  };
}

function makeDiscardResponse(keepIds: string[], discardIds: string[]): ReflectionLLMResult {
  return {
    decisions: [
      ...keepIds.map((id) => ({
        observationId: id,
        decision: 'keep' as const,
        reason: 'Still relevant',
      })),
      ...discardIds.map((id) => ({
        observationId: id,
        decision: 'discard' as const,
        reason: 'No longer relevant',
      })),
    ],
  };
}

function makeMergeResponse(
  keepIds: string[],
  mergeSource: string,
  mergeTarget: string,
  mergedContent: string,
): ReflectionLLMResult {
  return {
    decisions: [
      ...keepIds.map((id) => ({
        observationId: id,
        decision: 'keep' as const,
        reason: 'Still relevant',
      })),
      {
        observationId: mergeSource,
        decision: 'merge' as const,
        reason: 'Duplicate of another observation',
        mergeIntoId: mergeTarget,
        mergedContent,
      },
    ],
  };
}

describe('ReflectorAgent', () => {
  // ─── parseReflectorResponse ────────────────────────────────────────

  describe('parseReflectorResponse', () => {
    test('parses valid JSON response', () => {
      const input = JSON.stringify({
        decisions: [
          { observationId: 'obs-1', decision: 'keep', reason: 'still relevant' },
          { observationId: 'obs-2', decision: 'discard', reason: 'stale' },
        ],
        summary: 'Cleaned up stale observations',
      });

      const result = parseReflectorResponse(input);
      expect(result).not.toBeNull();
      expect(result!.decisions).toHaveLength(2);
      expect(result!.decisions[0].decision).toBe('keep');
      expect(result!.decisions[1].decision).toBe('discard');
      expect(result!.summary).toBe('Cleaned up stale observations');
    });

    test('handles markdown-fenced JSON', () => {
      const input = '```json\n{"decisions":[{"observationId":"obs-1","decision":"keep","reason":"ok"}]}\n```';
      const result = parseReflectorResponse(input);
      expect(result).not.toBeNull();
      expect(result!.decisions).toHaveLength(1);
    });

    test('extracts JSON from surrounding text', () => {
      const input = 'Here is my analysis:\n{"decisions":[{"observationId":"obs-1","decision":"discard","reason":"stale"}]}\nDone.';
      const result = parseReflectorResponse(input);
      expect(result).not.toBeNull();
      expect(result!.decisions).toHaveLength(1);
    });

    test('returns null for completely invalid input', () => {
      expect(parseReflectorResponse('not json at all')).toBeNull();
    });

    test('filters out invalid decisions', () => {
      const input = JSON.stringify({
        decisions: [
          { observationId: 'obs-1', decision: 'keep', reason: 'ok' },
          { observationId: 'obs-2', decision: 'invalid_decision', reason: 'bad' },
          { decision: 'keep', reason: 'missing id' },
        ],
      });
      const result = parseReflectorResponse(input);
      expect(result!.decisions).toHaveLength(1);
    });

    test('parses merge decisions with merge fields', () => {
      const input = JSON.stringify({
        decisions: [{
          observationId: 'obs-1',
          decision: 'merge',
          reason: 'duplicate',
          mergeIntoId: 'obs-2',
          mergedContent: 'Combined content',
        }],
      });
      const result = parseReflectorResponse(input);
      expect(result!.decisions[0].mergeIntoId).toBe('obs-2');
      expect(result!.decisions[0].mergedContent).toBe('Combined content');
    });
  });

  // ─── shouldReflect ─────────────────────────────────────────────────

  describe('shouldReflect', () => {
    test('returns false when no memory state exists', () => {
      const store = new ObservationStore(dbPath);
      const llm = makeLLMClient({ decisions: [] });
      const reflector = new ReflectorAgent(store, llm, { tokenBudgetThreshold: 100 });

      expect(reflector.shouldReflect('oracle')).toBe(false);
      store.close();
    });

    test('returns false when under threshold', () => {
      const store = new ObservationStore(dbPath);
      store.upsertMemoryState({
        agentId: 'oracle',
        observationsTokens: 50,
        rawBufferTokens: 0,
        lastObservationAt: null,
        lastReflectionAt: null,
        observationCount: 5,
      });

      const llm = makeLLMClient({ decisions: [] });
      const reflector = new ReflectorAgent(store, llm, { tokenBudgetThreshold: 100 });

      expect(reflector.shouldReflect('oracle')).toBe(false);
      store.close();
    });

    test('returns true when over threshold', () => {
      const store = new ObservationStore(dbPath);
      store.upsertMemoryState({
        agentId: 'oracle',
        observationsTokens: 200,
        rawBufferTokens: 0,
        lastObservationAt: null,
        lastReflectionAt: null,
        observationCount: 20,
      });

      const llm = makeLLMClient({ decisions: [] });
      const reflector = new ReflectorAgent(store, llm, { tokenBudgetThreshold: 100 });

      expect(reflector.shouldReflect('oracle')).toBe(true);
      store.close();
    });

    test('returns false when disabled', () => {
      const store = new ObservationStore(dbPath);
      store.upsertMemoryState({
        agentId: 'oracle',
        observationsTokens: 200,
        rawBufferTokens: 0,
        lastObservationAt: null,
        lastReflectionAt: null,
        observationCount: 20,
      });

      const llm = makeLLMClient({ decisions: [] });
      const reflector = new ReflectorAgent(store, llm, {
        enabled: false,
        tokenBudgetThreshold: 100,
      });

      expect(reflector.shouldReflect('oracle')).toBe(false);
      store.close();
    });
  });

  // ─── runReflectionPass ─────────────────────────────────────────────

  describe('runReflectionPass', () => {
    test('returns success with zero observations when none exist', async () => {
      const store = new ObservationStore(dbPath);
      const llm = makeLLMClient({ decisions: [] });
      const reflector = new ReflectorAgent(store, llm, { silent: true });

      const result = await reflector.runReflectionPass('oracle');

      expect(result.success).toBe(true);
      expect(result.observationsEvaluated).toBe(0);
      store.close();
    });

    test('keeps all observations when LLM says keep', async () => {
      const store = new ObservationStore(dbPath);
      const obs = seedObservations(store, 8);

      const llmResponse = makeKeepAllResponse(obs.map((o) => o.id));
      const llm = makeLLMClient(llmResponse);
      const reflector = new ReflectorAgent(store, llm, { silent: true });

      const result = await reflector.runReflectionPass('oracle');

      expect(result.success).toBe(true);
      expect(result.kept).toBe(8);
      expect(result.discarded).toBe(0);
      expect(result.merged).toBe(0);

      // All observations still active
      const active = store.getActiveObservations('oracle');
      expect(active).toHaveLength(8);
      store.close();
    });

    test('soft-deletes discarded observations via reflected_at', async () => {
      const store = new ObservationStore(dbPath);
      const obs = seedObservations(store, 8);

      const keepIds = obs.slice(0, 5).map((o) => o.id);
      const discardIds = obs.slice(5).map((o) => o.id);
      const llm = makeLLMClient(makeDiscardResponse(keepIds, discardIds));
      const reflector = new ReflectorAgent(store, llm, { silent: true });

      const result = await reflector.runReflectionPass('oracle');

      expect(result.success).toBe(true);
      expect(result.discarded).toBe(3);

      // Discarded observations have reflected_at set
      for (const id of discardIds) {
        const o = store.getById(id);
        expect(o).not.toBeNull();
        expect(o!.reflectedAt).toBeTruthy();
      }

      // Kept observations still active
      const active = store.getActiveObservations('oracle');
      expect(active).toHaveLength(5);
      store.close();
    });

    test('applies merge operations — updates target content and soft-deletes source', async () => {
      const store = new ObservationStore(dbPath);
      const obs = seedObservations(store, 6);

      const keepIds = obs.slice(0, 4).map((o) => o.id);
      const mergeSource = obs[4].id;
      const mergeTarget = obs[0].id;
      const mergedContent = 'Combined: observation 0 and observation 4';

      const llm = makeLLMClient(makeMergeResponse(keepIds, mergeSource, mergeTarget, mergedContent));
      // obs[5] gets no decision → defaults to keep
      const reflector = new ReflectorAgent(store, llm, { silent: true });

      const result = await reflector.runReflectionPass('oracle');

      expect(result.success).toBe(true);
      expect(result.merged).toBeGreaterThanOrEqual(1);

      // Source observation is soft-deleted
      const source = store.getById(mergeSource);
      expect(source!.reflectedAt).toBeTruthy();

      // Target observation has updated content
      const target = store.getById(mergeTarget);
      expect(target!.content).toBe(mergedContent);

      store.close();
    });

    test('enforces minimum retained observations floor', async () => {
      const store = new ObservationStore(dbPath);
      const obs = seedObservations(store, 6);

      // LLM wants to discard all but 2 — floor is 5
      const keepIds = obs.slice(0, 2).map((o) => o.id);
      const discardIds = obs.slice(2).map((o) => o.id);
      const llm = makeLLMClient(makeDiscardResponse(keepIds, discardIds));
      const reflector = new ReflectorAgent(store, llm, {
        silent: true,
        minRetainedObservations: 5,
      });

      const result = await reflector.runReflectionPass('oracle');

      expect(result.success).toBe(true);
      // At least 5 should be retained
      const active = store.getActiveObservations('oracle');
      expect(active.length).toBeGreaterThanOrEqual(5);
      store.close();
    });

    test('skips pass when already at or below minimum floor', async () => {
      const store = new ObservationStore(dbPath);
      seedObservations(store, 3); // Only 3 observations

      let llmCalled = false;
      const llm: ReflectorLLMClient = {
        chatCompletion: async () => {
          llmCalled = true;
          return '{"decisions":[]}';
        },
      };

      const reflector = new ReflectorAgent(store, llm, {
        silent: true,
        minRetainedObservations: 5,
      });

      const result = await reflector.runReflectionPass('oracle');

      expect(result.success).toBe(true);
      expect(result.kept).toBe(3);
      expect(llmCalled).toBe(false); // LLM was never called
      store.close();
    });

    test('mutex prevents concurrent runs', async () => {
      const store = new ObservationStore(dbPath);
      seedObservations(store, 10);

      // Slow LLM that takes time
      const llm: ReflectorLLMClient = {
        chatCompletion: async () => {
          await new Promise((r) => setTimeout(r, 100));
          return JSON.stringify(makeKeepAllResponse(
            Array.from({ length: 10 }, (_, i) => `obs-${i}`),
          ));
        },
      };

      const reflector = new ReflectorAgent(store, llm, { silent: true });

      // Start two passes concurrently
      const [result1, result2] = await Promise.all([
        reflector.runReflectionPass('oracle'),
        reflector.runReflectionPass('oracle'),
      ]);

      // One should succeed, one should be skipped
      const successes = [result1, result2].filter((r) => r.success);
      const skipped = [result1, result2].filter((r) => !r.success && r.error?.includes('already in progress'));
      expect(successes).toHaveLength(1);
      expect(skipped).toHaveLength(1);

      const metrics = reflector.getMetrics();
      expect(metrics.skippedDueToLock).toBe(1);
      store.close();
    });

    test('handles LLM failure gracefully', async () => {
      const store = new ObservationStore(dbPath);
      seedObservations(store, 8);

      const llm = makeLLMClient(new Error('API timeout'));
      const reflector = new ReflectorAgent(store, llm, {
        silent: true,
        maxRetries: 0, // No retries for faster test
      });

      const result = await reflector.runReflectionPass('oracle');

      expect(result.success).toBe(false);
      expect(result.error).toContain('API timeout');

      // All observations still active (no data loss)
      const active = store.getActiveObservations('oracle');
      expect(active).toHaveLength(8);

      const metrics = reflector.getMetrics();
      expect(metrics.llmFailures).toBe(1);
      store.close();
    });

    test('handles unparseable LLM response gracefully', async () => {
      const store = new ObservationStore(dbPath);
      seedObservations(store, 8);

      const llm = makeLLMClient('This is not valid JSON at all and cannot be parsed');
      const reflector = new ReflectorAgent(store, llm, { silent: true });

      const result = await reflector.runReflectionPass('oracle');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to parse');

      // All observations still active
      const active = store.getActiveObservations('oracle');
      expect(active).toHaveLength(8);
      store.close();
    });

    test('recalculates memory_state tokens after reflection', async () => {
      const store = new ObservationStore(dbPath);
      const obs = seedObservations(store, 10);

      // Set initial memory state
      store.upsertMemoryState({
        agentId: 'oracle',
        observationsTokens: 9999,
        rawBufferTokens: 0,
        lastObservationAt: '2026-02-18T00:00:00Z',
        lastReflectionAt: null,
        observationCount: 10,
      });

      // Discard 5 observations
      const keepIds = obs.slice(0, 5).map((o) => o.id);
      const discardIds = obs.slice(5).map((o) => o.id);
      const llm = makeLLMClient(makeDiscardResponse(keepIds, discardIds));
      const reflector = new ReflectorAgent(store, llm, { silent: true });

      await reflector.runReflectionPass('oracle');

      const state = store.getMemoryState('oracle');
      expect(state).not.toBeNull();
      expect(state!.observationsTokens).toBeLessThan(9999);
      expect(state!.lastReflectionAt).toBeTruthy();
      expect(state!.observationCount).toBe(5);
      store.close();
    });

    test('logs reflection run into reflection_log table', async () => {
      const store = new ObservationStore(dbPath);
      const obs = seedObservations(store, 8);

      const keepIds = obs.slice(0, 5).map((o) => o.id);
      const discardIds = obs.slice(5).map((o) => o.id);
      const llm = makeLLMClient(makeDiscardResponse(keepIds, discardIds));
      const reflector = new ReflectorAgent(store, llm, { silent: true });

      await reflector.runReflectionPass('oracle');

      const logs = store.getReflectionLogs('oracle');
      expect(logs.length).toBeGreaterThanOrEqual(1);

      const log = logs[0];
      expect(log.agentId).toBe('oracle');
      expect(log.observationsEvaluated).toBe(8);
      expect(log.observationsDiscarded).toBe(3);
      expect(log.modelUsed).toBe('gpt-4o-mini');
      expect(log.durationMs).toBeGreaterThanOrEqual(0);
      store.close();
    });

    test('invalidates observation cache after successful pass', async () => {
      const store = new ObservationStore(dbPath);
      const obs = seedObservations(store, 8);

      const cache = new ObservationCache(store, 'oracle');
      // Prime the cache
      cache.getSnapshot();

      const keepIds = obs.slice(0, 5).map((o) => o.id);
      const discardIds = obs.slice(5).map((o) => o.id);
      const llm = makeLLMClient(makeDiscardResponse(keepIds, discardIds));
      const reflector = new ReflectorAgent(store, llm, { silent: true }, cache);

      await reflector.runReflectionPass('oracle');

      // Cache should reflect the new state
      const snap = cache.getSnapshot();
      expect(snap.observations).toHaveLength(5);
      store.close();
    });
  });

  // ─── Metrics ──────────────────────────────────────────────────────

  describe('metrics', () => {
    test('tracks cumulative metrics across passes', async () => {
      const store = new ObservationStore(dbPath);
      seedObservations(store, 8);

      const keepAll = makeKeepAllResponse(
        Array.from({ length: 8 }, (_, i) => `obs-${i}`),
      );
      const llm = makeLLMClient(keepAll);
      const reflector = new ReflectorAgent(store, llm, { silent: true });

      await reflector.runReflectionPass('oracle');
      await reflector.runReflectionPass('oracle');

      const m = reflector.getMetrics();
      expect(m.passesAttempted).toBe(2);
      expect(m.passesCompleted).toBe(2);
      expect(m.observationsEvaluated).toBe(16); // 8 + 8
      expect(m.llmCalls).toBe(2);
      expect(m.lastPassAt).toBeTruthy();
      store.close();
    });
  });

  // ─── Store Methods (Phase 3 additions) ─────────────────────────────

  describe('ObservationStore Phase 3 methods', () => {
    test('getActiveObservations excludes reflected observations', () => {
      const store = new ObservationStore(dbPath);
      seedObservations(store, 5);

      store.markReflected(['obs-0', 'obs-1'], '2026-02-18T12:00:00Z');

      const active = store.getActiveObservations('oracle');
      expect(active).toHaveLength(3);
      const activeIds = active.map((o) => o.id);
      expect(activeIds).not.toContain('obs-0');
      expect(activeIds).not.toContain('obs-1');
      store.close();
    });

    test('markReflected returns count of changed rows', () => {
      const store = new ObservationStore(dbPath);
      seedObservations(store, 5);

      const changed = store.markReflected(['obs-0', 'obs-1', 'nonexistent'], '2026-02-18T12:00:00Z');
      expect(changed).toBe(2);

      // Marking again returns 0 (already reflected)
      const changed2 = store.markReflected(['obs-0'], '2026-02-18T13:00:00Z');
      expect(changed2).toBe(0);
      store.close();
    });

    test('insertReflectionLog and getReflectionLogs roundtrip', () => {
      const store = new ObservationStore(dbPath);

      store.insertReflectionLog({
        id: 'refl-1',
        agentId: 'oracle',
        runAt: '2026-02-18T12:00:00Z',
        observationsEvaluated: 10,
        observationsKept: 7,
        observationsMerged: 1,
        observationsDiscarded: 2,
        tokensBefore: 5000,
        tokensAfter: 3500,
        modelUsed: 'gpt-4o-mini',
        durationMs: 1200,
      });

      const logs = store.getReflectionLogs('oracle');
      expect(logs).toHaveLength(1);
      expect(logs[0].id).toBe('refl-1');
      expect(logs[0].observationsEvaluated).toBe(10);
      expect(logs[0].observationsKept).toBe(7);
      expect(logs[0].tokensBefore).toBe(5000);
      expect(logs[0].tokensAfter).toBe(3500);
      store.close();
    });

    test('getReflectionLogs returns newest first', () => {
      const store = new ObservationStore(dbPath);

      store.insertReflectionLog({
        id: 'refl-old',
        agentId: 'oracle',
        runAt: '2026-02-18T10:00:00Z',
        observationsEvaluated: 5,
        observationsKept: 5,
        observationsMerged: 0,
        observationsDiscarded: 0,
        tokensBefore: 1000,
        tokensAfter: 1000,
        modelUsed: 'gpt-4o-mini',
        durationMs: 500,
      });

      store.insertReflectionLog({
        id: 'refl-new',
        agentId: 'oracle',
        runAt: '2026-02-18T14:00:00Z',
        observationsEvaluated: 8,
        observationsKept: 6,
        observationsMerged: 0,
        observationsDiscarded: 2,
        tokensBefore: 2000,
        tokensAfter: 1500,
        modelUsed: 'gpt-4o-mini',
        durationMs: 800,
      });

      const logs = store.getReflectionLogs('oracle');
      expect(logs[0].id).toBe('refl-new');
      expect(logs[1].id).toBe('refl-old');
      store.close();
    });

    test('updateContent modifies observation content', () => {
      const store = new ObservationStore(dbPath);
      store.insert(makeObs({ id: 'obs-update', content: 'Original content' }));

      store.updateContent('obs-update', 'Updated merged content');

      const loaded = store.getById('obs-update');
      expect(loaded!.content).toBe('Updated merged content');
      store.close();
    });

    test('reflection_log table is created with indexes', () => {
      const store = new ObservationStore(dbPath);
      store.close();

      // Verify via raw SQL
      const Database = require('better-sqlite3');
      const db = new Database(dbPath, { readonly: true });

      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='reflection_log'",
      ).all() as any[];
      expect(tables).toHaveLength(1);

      const indexes = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='reflection_log'",
      ).all() as any[];
      const indexNames = indexes.map((i: any) => i.name);
      expect(indexNames).toContain('idx_reflection_log_agent');
      expect(indexNames).toContain('idx_reflection_log_run_at');

      db.close();
    });

    test('reflected_at column exists on observations table', () => {
      const store = new ObservationStore(dbPath);
      store.insert(makeObs({ id: 'obs-col-check' }));
      store.close();

      const Database = require('better-sqlite3');
      const db = new Database(dbPath, { readonly: true });
      const columns = db.prepare("PRAGMA table_info('observations')").all() as any[];
      const colNames = columns.map((c: any) => c.name);
      expect(colNames).toContain('reflected_at');
      db.close();
    });
  });
});

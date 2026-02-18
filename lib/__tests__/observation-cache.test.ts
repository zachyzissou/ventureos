/**
 * Tests for ObservationCache — Issue #232 (Phase 3)
 *
 * Validates prompt cache behavior: token-bounded loading, priority ordering,
 * prompt block formatting, invalidation, and budget checking.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ObservationStore } from '../observation-store';
import { ObservationCache } from '../observation-cache';
import type { Observation } from '../types/observation';

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-cache-test-'));
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
    content: 'Test observation content',
    source: { agentId: 'oracle', conversationId: 'conv-1' },
    status: 'processed',
    priority: 'medium',
    metadata: {},
    ...overrides,
  };
}

function insertProcessedObs(store: ObservationStore, overrides: Partial<Observation> = {}): Observation {
  const obs = makeObs(overrides);
  store.insert(obs);
  return obs;
}

describe('ObservationCache', () => {
  test('loads active observations from store', () => {
    const store = new ObservationStore(dbPath);
    insertProcessedObs(store, { id: 'obs-1', content: 'Active observation 1' });
    insertProcessedObs(store, { id: 'obs-2', content: 'Active observation 2' });

    const cache = new ObservationCache(store, 'oracle');
    const snapshot = cache.getSnapshot();

    expect(snapshot.observations).toHaveLength(2);
    expect(snapshot.generation).toBe(1);
    expect(snapshot.totalTokens).toBeGreaterThan(0);
    store.close();
  });

  test('excludes reflected (soft-deleted) observations', () => {
    const store = new ObservationStore(dbPath);
    insertProcessedObs(store, { id: 'obs-active', content: 'Active' });
    insertProcessedObs(store, { id: 'obs-reflected', content: 'Reflected' });

    // Soft-delete one
    store.markReflected(['obs-reflected'], '2026-02-18T12:00:00Z');

    const cache = new ObservationCache(store, 'oracle');
    const snapshot = cache.getSnapshot();

    expect(snapshot.observations).toHaveLength(1);
    expect(snapshot.observations[0].id).toBe('obs-active');
    store.close();
  });

  test('orders observations by priority then recency', () => {
    const store = new ObservationStore(dbPath);
    insertProcessedObs(store, { id: 'obs-info', priority: 'info', createdAt: '2026-02-18T03:00:00Z' });
    insertProcessedObs(store, { id: 'obs-high', priority: 'high', createdAt: '2026-02-18T01:00:00Z' });
    insertProcessedObs(store, { id: 'obs-med-old', priority: 'medium', createdAt: '2026-02-18T01:00:00Z' });
    insertProcessedObs(store, { id: 'obs-med-new', priority: 'medium', createdAt: '2026-02-18T02:00:00Z' });

    const cache = new ObservationCache(store, 'oracle');
    const obs = cache.getObservations();

    expect(obs[0].id).toBe('obs-high');
    expect(obs[1].id).toBe('obs-med-new');
    expect(obs[2].id).toBe('obs-med-old');
    expect(obs[3].id).toBe('obs-info');
    store.close();
  });

  test('trims observations to token budget', () => {
    const store = new ObservationStore(dbPath);
    // Each observation has ~25 chars / 4 ≈ 7 tokens
    for (let i = 0; i < 20; i++) {
      insertProcessedObs(store, {
        id: `obs-${i}`,
        content: `Observation number ${i} with some extra text to pad tokens`,
        priority: 'medium',
      });
    }

    // Very small budget — should trim
    const cache = new ObservationCache(store, 'oracle', { maxTokenBudget: 50 });
    const snapshot = cache.getSnapshot();

    expect(snapshot.observations.length).toBeLessThan(20);
    expect(snapshot.totalTokens).toBeLessThanOrEqual(50 + 20); // Allow slight overshoot for last included
    store.close();
  });

  test('invalidate forces rebuild on next access', () => {
    const store = new ObservationStore(dbPath);
    insertProcessedObs(store, { id: 'obs-1' });

    const cache = new ObservationCache(store, 'oracle');
    const snap1 = cache.getSnapshot();
    expect(snap1.generation).toBe(1);

    cache.invalidate();
    const snap2 = cache.getSnapshot();
    expect(snap2.generation).toBe(2);
    store.close();
  });

  test('does not rebuild when not dirty', () => {
    const store = new ObservationStore(dbPath);
    insertProcessedObs(store, { id: 'obs-1' });

    const cache = new ObservationCache(store, 'oracle');
    const snap1 = cache.getSnapshot();
    const snap2 = cache.getSnapshot();
    expect(snap1.generation).toBe(snap2.generation);
    store.close();
  });

  test('exceedsBudget reports correctly', () => {
    const store = new ObservationStore(dbPath);
    // ~50 chars → ~13 tokens at 4 chars/token
    insertProcessedObs(store, { id: 'obs-1', content: 'This is a test observation with some words in it.' });

    const cache = new ObservationCache(store, 'oracle', { maxTokenBudget: 10 });
    expect(cache.exceedsBudget()).toBe(true);

    const cache2 = new ObservationCache(store, 'oracle', { maxTokenBudget: 100 });
    expect(cache2.exceedsBudget()).toBe(false);
    store.close();
  });

  test('getPromptBlock formats observations by priority group', () => {
    const store = new ObservationStore(dbPath);
    insertProcessedObs(store, { id: 'obs-h', priority: 'high', content: 'Critical deadline tomorrow' });
    insertProcessedObs(store, { id: 'obs-m', priority: 'medium', content: 'User prefers dark mode' });
    insertProcessedObs(store, { id: 'obs-i', priority: 'info', content: 'Weather was nice today' });

    const cache = new ObservationCache(store, 'oracle');
    const block = cache.getPromptBlock();

    expect(block.count).toBe(3);
    expect(block.tokens).toBeGreaterThan(0);
    expect(block.text).toContain('## Active Observations');
    expect(block.text).toContain('🔴 High Priority');
    expect(block.text).toContain('Critical deadline tomorrow');
    expect(block.text).toContain('🟡 Medium Priority');
    expect(block.text).toContain('User prefers dark mode');
    expect(block.text).toContain('🟢 Info');
    expect(block.text).toContain('Weather was nice today');
    store.close();
  });

  test('getPromptBlock includes referenced dates', () => {
    const store = new ObservationStore(dbPath);
    insertProcessedObs(store, {
      id: 'obs-date',
      priority: 'high',
      content: 'Meeting scheduled',
      referencedDate: '2026-03-01',
    });

    const cache = new ObservationCache(store, 'oracle');
    const block = cache.getPromptBlock();

    expect(block.text).toContain('[ref: 2026-03-01]');
    store.close();
  });

  test('getPromptBlock returns empty for no observations', () => {
    const store = new ObservationStore(dbPath);
    const cache = new ObservationCache(store, 'oracle');
    const block = cache.getPromptBlock();

    expect(block.text).toBe('');
    expect(block.tokens).toBe(0);
    expect(block.count).toBe(0);
    store.close();
  });

  test('only loads observations for the specified agent', () => {
    const store = new ObservationStore(dbPath);
    insertProcessedObs(store, { id: 'obs-oracle', source: { agentId: 'oracle' } });
    insertProcessedObs(store, { id: 'obs-atlas', source: { agentId: 'atlas' } });

    const cache = new ObservationCache(store, 'oracle');
    const obs = cache.getObservations();

    expect(obs).toHaveLength(1);
    expect(obs[0].id).toBe('obs-oracle');
    store.close();
  });

  test('getTotalTokens returns accurate estimate', () => {
    const store = new ObservationStore(dbPath);
    // "Hello world" = 11 chars / 4 = 3 tokens (ceil)
    insertProcessedObs(store, { id: 'obs-1', content: 'Hello world' });

    const cache = new ObservationCache(store, 'oracle', { charsPerToken: 4 });
    expect(cache.getTotalTokens()).toBe(3);
    store.close();
  });
});

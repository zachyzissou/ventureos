/**
 * Tests for /observations command — Phase 4 (#233)
 *
 * Validates command output formatting, filtering, Discord char limits,
 * and graceful degradation when database is unavailable.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ObservationStore } from '../observation-store';
import {
  executeObservationsCommand,
  parseSinceFilter,
} from '../observations-command';
import type { Observation, ObservationPriority } from '../types/observation';

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-cmd-test-'));
  dbPath = path.join(tmpDir, 'test-obs.db');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: `obs-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
    category: 'fact',
    content: 'Test observation content.',
    source: {
      agentId: 'oracle',
      conversationId: 'conv-1',
    },
    status: 'processed',
    priority: 'medium',
    metadata: {},
    ...overrides,
  };
}

function seedStore(observations: Observation[]): void {
  const store = new ObservationStore(dbPath);
  store.insertBatch(observations);
  // Also update memory_state so the snapshot works
  if (observations.length > 0) {
    store.upsertMemoryState({
      agentId: observations[0].source.agentId,
      observationsTokens: 1000,
      rawBufferTokens: 500,
      lastObservationAt: observations[0].createdAt,
      lastReflectionAt: null,
      observationCount: observations.length,
    });
  }
  store.close();
}

describe('parseSinceFilter', () => {
  test('parses hour-based filters', () => {
    const result = parseSinceFilter('24h');
    expect(result).toBeTruthy();
    const parsed = new Date(result!);
    const diff = Date.now() - parsed.getTime();
    // Should be roughly 24 hours ago (within 5 seconds tolerance)
    expect(diff).toBeGreaterThan(23 * 3600_000);
    expect(diff).toBeLessThan(25 * 3600_000);
  });

  test('parses day-based filters', () => {
    const result = parseSinceFilter('7d');
    expect(result).toBeTruthy();
    const parsed = new Date(result!);
    const diff = Date.now() - parsed.getTime();
    expect(diff).toBeGreaterThan(6 * 86400_000);
    expect(diff).toBeLessThan(8 * 86400_000);
  });

  test('parses minute-based filters', () => {
    const result = parseSinceFilter('30m');
    expect(result).toBeTruthy();
    const parsed = new Date(result!);
    const diff = Date.now() - parsed.getTime();
    expect(diff).toBeGreaterThan(29 * 60_000);
    expect(diff).toBeLessThan(31 * 60_000);
  });

  test('returns ISO date unchanged', () => {
    const result = parseSinceFilter('2026-02-15T00:00:00Z');
    expect(result).toBe('2026-02-15T00:00:00Z');
  });

  test('returns null for invalid input', () => {
    expect(parseSinceFilter('')).toBeNull();
    expect(parseSinceFilter('abc')).toBeNull();
    expect(parseSinceFilter('24x')).toBeNull();
  });
});

describe('executeObservationsCommand', () => {
  test('returns friendly message when database does not exist', () => {
    const result = executeObservationsCommand({
      agentId: 'oracle',
      dbPath: path.join(tmpDir, 'nonexistent', 'nope.db'),
    });

    expect(result.enabled).toBe(false);
    expect(result.count).toBe(0);
    expect(result.output).toContain('not configured');
    expect(result.output.length).toBeLessThanOrEqual(2000);
  });

  test('returns friendly message when no observations exist', () => {
    // Create an empty store
    const store = new ObservationStore(dbPath);
    store.close();

    const result = executeObservationsCommand({
      agentId: 'oracle',
      dbPath,
    });

    expect(result.enabled).toBe(true);
    expect(result.count).toBe(0);
    expect(result.output).toContain('No observations recorded');
    expect(result.output.length).toBeLessThanOrEqual(2000);
  });

  test('displays observations with priority indicators', () => {
    const obs = [
      makeObservation({ id: 'obs-h1', priority: 'high', content: 'High priority item' }),
      makeObservation({ id: 'obs-m1', priority: 'medium', content: 'Medium priority item' }),
      makeObservation({ id: 'obs-i1', priority: 'info', content: 'Info item' }),
    ];
    seedStore(obs);

    const result = executeObservationsCommand({
      agentId: 'oracle',
      dbPath,
    });

    expect(result.enabled).toBe(true);
    expect(result.count).toBe(3);
    expect(result.output).toContain('🔴');
    expect(result.output).toContain('🟡');
    expect(result.output).toContain('🟢');
    expect(result.output).toContain('High priority item');
    expect(result.output).toContain('Observational Memory');
    expect(result.output.length).toBeLessThanOrEqual(2000);
  });

  test('filters by priority', () => {
    const obs = [
      makeObservation({ id: 'obs-h1', priority: 'high', content: 'High priority item' }),
      makeObservation({ id: 'obs-m1', priority: 'medium', content: 'Medium priority item' }),
    ];
    seedStore(obs);

    const result = executeObservationsCommand({
      agentId: 'oracle',
      priority: 'high',
      dbPath,
    });

    expect(result.count).toBe(1);
    expect(result.output).toContain('High priority item');
    expect(result.output).toContain('priority=high');
  });

  test('filters by since', () => {
    const oldDate = new Date(Date.now() - 48 * 3600_000).toISOString();
    const newDate = new Date().toISOString();

    const obs = [
      makeObservation({ id: 'obs-old', createdAt: oldDate, content: 'Old observation' }),
      makeObservation({ id: 'obs-new', createdAt: newDate, content: 'New observation' }),
    ];
    seedStore(obs);

    const result = executeObservationsCommand({
      agentId: 'oracle',
      since: '24h',
      dbPath,
    });

    expect(result.count).toBe(1);
    expect(result.output).toContain('New observation');
    expect(result.output).toContain('since=24h');
  });

  test('output never exceeds 2000 chars', () => {
    // Create many observations to push past the limit
    const obs = Array.from({ length: 50 }, (_, i) =>
      makeObservation({
        id: `obs-${i}`,
        content: `Observation number ${i}: ${('x').repeat(80)}`,
        priority: ['high', 'medium', 'info'][i % 3] as ObservationPriority,
      }),
    );
    seedStore(obs);

    const result = executeObservationsCommand({
      agentId: 'oracle',
      dbPath,
    });

    expect(result.output.length).toBeLessThanOrEqual(2000);
    // Should mention there are more
    expect(result.output).toMatch(/more observations|Active observations/);
  });

  test('shows summary counts in header', () => {
    const obs = [
      makeObservation({ id: 'obs-h1', priority: 'high' }),
      makeObservation({ id: 'obs-h2', priority: 'high' }),
      makeObservation({ id: 'obs-m1', priority: 'medium' }),
    ];
    seedStore(obs);

    const result = executeObservationsCommand({
      agentId: 'oracle',
      dbPath,
    });

    expect(result.output).toContain('🔴 2 high');
    expect(result.output).toContain('🟡 1 medium');
    expect(result.snapshot).not.toBeNull();
    expect(result.snapshot!.priorityCounts.high).toBe(2);
    expect(result.snapshot!.priorityCounts.medium).toBe(1);
  });

  test('truncates long observation content', () => {
    const longContent = 'A'.repeat(200);
    seedStore([makeObservation({ id: 'obs-long', content: longContent })]);

    const result = executeObservationsCommand({
      agentId: 'oracle',
      dbPath,
    });

    // Content should be truncated with ...
    expect(result.output).toContain('...');
    // Original 200-char string should NOT appear in full
    expect(result.output).not.toContain(longContent);
  });

  test('handles different agent IDs', () => {
    const obs = [
      makeObservation({ id: 'obs-oracle', source: { agentId: 'oracle', conversationId: 'c1' } }),
      makeObservation({ id: 'obs-atlas', source: { agentId: 'atlas', conversationId: 'c2' } }),
    ];
    const store = new ObservationStore(dbPath);
    store.insertBatch(obs);
    store.upsertMemoryState({
      agentId: 'oracle',
      observationsTokens: 500,
      rawBufferTokens: 0,
      lastObservationAt: new Date().toISOString(),
      lastReflectionAt: null,
      observationCount: 1,
    });
    store.upsertMemoryState({
      agentId: 'atlas',
      observationsTokens: 300,
      rawBufferTokens: 0,
      lastObservationAt: new Date().toISOString(),
      lastReflectionAt: null,
      observationCount: 1,
    });
    store.close();

    const oracleResult = executeObservationsCommand({
      agentId: 'oracle',
      dbPath,
    });
    const atlasResult = executeObservationsCommand({
      agentId: 'atlas',
      dbPath,
    });

    expect(oracleResult.count).toBe(1);
    expect(atlasResult.count).toBe(1);
  });
});

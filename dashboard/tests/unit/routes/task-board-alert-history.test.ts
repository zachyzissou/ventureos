/**
 * Alert History tests — Issue #219, Phase 10: Alert History / Timeline Baseline.
 *
 * Tests for:
 * - createAlertEvent() — event creation from evaluation
 * - isStateChange() — deduplication logic
 * - pruneAlertHistory() — retention pruning
 * - shouldRecordEvent() — cooldown logic
 * - maybeAppendAlertEvent() — main write path
 * - queryAlertTimeline() — timeline query with summary stats
 * - readAlertHistory() — file I/O robustness
 * - GET /api/task-board/alerts/timeline — API endpoint
 * - Alert event recording via GET /api/task-board/metrics (piggyback)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import {
  handleTaskBoard,
} from '../../../server/routes/task-board.js';
import {
  readAlertHistory,
  createAlertEvent,
  isStateChange,
  pruneAlertHistory,
  shouldRecordEvent,
  maybeAppendAlertEvent,
  queryAlertTimeline,
} from '../../../server/alert-history.js';
import {
  evaluateAlerts,
  DEFAULT_ALERT_CONFIG,
} from '../../../server/alert-rules.js';
import type {
  AlertEvaluation,
  AlertMetricsInput,
  AlertRulesConfig,
} from '../../../server/alert-rules.js';
import type { AlertHistoryEvent } from '../../../server/alert-history.js';
import type { TaskBoardDeps, TaskCard } from '../../../server/types.js';

const testDataDir = path.join('/tmp', 'test-alert-history-' + process.pid);

function createDeps(overrides: Partial<TaskBoardDeps> = {}): TaskBoardDeps {
  return {
    dataDir: testDataDir,
    sendJson: (res, data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    },
    readRequestBody: async () => '{}',
    ...overrides,
  };
}

function makeSampleCard(overrides: Partial<TaskCard> = {}): TaskCard {
  return {
    id: 'test-' + Math.random().toString(36).slice(2, 8),
    agentId: 'oracle',
    title: 'Test task',
    description: 'A test task',
    priority: 'medium',
    status: 'backlog',
    createdAt: Date.now(),
    queuedAt: null,
    startedAt: null,
    completedAt: null,
    resultSummary: null,
    tokensUsed: null,
    error: null,
    costEstimate: null,
    runtimeMs: null,
    ...overrides,
  };
}

function seedTasks(tasks: TaskCard[]): void {
  fs.mkdirSync(testDataDir, { recursive: true });
  fs.writeFileSync(
    path.join(testDataDir, 'task-board.json'),
    JSON.stringify({ tasks, updatedAt: Date.now() }),
  );
}

function metricsInput(overrides: Partial<AlertMetricsInput> = {}): AlertMetricsInput {
  return {
    statusCounts: { backlog: 0, queued: 0, running: 0, done: 0, failed: 0 },
    successRate: null,
    stuckCount: 0,
    avgRuntimeMs: null,
    total: 0,
    ...overrides,
  };
}

function makeEvaluation(overrides: {
  overallSeverity?: 'ok' | 'warning' | 'critical';
  stuckCount?: number;
  successRate?: number | null;
  evaluatedAt?: number;
} = {}): AlertEvaluation {
  const metrics = metricsInput({
    stuckCount: overrides.stuckCount ?? 0,
    successRate: overrides.successRate ?? null,
  });
  return evaluateAlerts(
    metrics,
    DEFAULT_ALERT_CONFIG,
    overrides.evaluatedAt ?? Date.now(),
  );
}

beforeEach(() => {
  fs.mkdirSync(testDataDir, { recursive: true });
  // Clean slate
  for (const f of ['task-board.json', 'task-board-alert-history.json', 'task-board-alert-rules.json']) {
    const fp = path.join(testDataDir, f);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
});

afterEach(() => {
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch {}
});

// ─── createAlertEvent — event creation ───────────────────────────────────────

describe('createAlertEvent', () => {
  it('creates event from OK evaluation', () => {
    const evaluation = makeEvaluation({ evaluatedAt: 1700000000000 });
    const event = createAlertEvent(evaluation);
    expect(event.ts).toBe(1700000000000);
    expect(event.overallSeverity).toBe('ok');
    expect(event.activeMessages).toHaveLength(0);
    expect(event.ruleSeverities).toBeDefined();
  });

  it('creates event from warning evaluation with messages', () => {
    const evaluation = makeEvaluation({ stuckCount: 3, evaluatedAt: 1700000000000 });
    const event = createAlertEvent(evaluation);
    expect(event.overallSeverity).toBe('warning');
    expect(event.activeMessages.length).toBeGreaterThan(0);
    expect(event.activeMessages.some(m => m.includes('Stuck Tasks'))).toBe(true);
    expect(event.ruleSeverities['stuckCount']).toBe('warning');
  });

  it('creates event from critical evaluation', () => {
    const evaluation = makeEvaluation({ stuckCount: 10, evaluatedAt: 1700000000000 });
    const event = createAlertEvent(evaluation);
    expect(event.overallSeverity).toBe('critical');
    expect(event.severityCounts.critical).toBeGreaterThan(0);
  });

  it('only includes enabled rules in ruleSeverities', () => {
    const config: AlertRulesConfig = {
      ...DEFAULT_ALERT_CONFIG,
      avgRuntime: { enabled: false, warning: 300000, critical: 600000 },
      queueDepth: { enabled: false, warning: 10, critical: 25 },
    };
    const evaluation = evaluateAlerts(metricsInput(), config, 1700000000000);
    const event = createAlertEvent(evaluation);
    // avgRuntime and queueDepth are disabled, should not appear
    expect(event.ruleSeverities).not.toHaveProperty('avgRuntime');
    expect(event.ruleSeverities).not.toHaveProperty('queueDepth');
  });
});

// ─── isStateChange — deduplication logic ─────────────────────────────────────

describe('isStateChange', () => {
  it('returns true when no last event', () => {
    const event = createAlertEvent(makeEvaluation());
    expect(isStateChange(event, undefined)).toBe(true);
  });

  it('returns false for identical consecutive events', () => {
    const eval1 = makeEvaluation({ evaluatedAt: 1700000000000 });
    const eval2 = makeEvaluation({ evaluatedAt: 1700000060000 });
    const event1 = createAlertEvent(eval1);
    const event2 = createAlertEvent(eval2);
    expect(isStateChange(event2, event1)).toBe(false);
  });

  it('returns true when overall severity changes', () => {
    const event1 = createAlertEvent(makeEvaluation({ stuckCount: 0 }));
    const event2 = createAlertEvent(makeEvaluation({ stuckCount: 3 }));
    expect(isStateChange(event2, event1)).toBe(true);
  });

  it('returns true when individual rule severity changes', () => {
    const event1 = createAlertEvent(makeEvaluation({ stuckCount: 3 })); // warning
    const event2 = createAlertEvent(makeEvaluation({ stuckCount: 6 })); // critical
    expect(isStateChange(event2, event1)).toBe(true);
  });

  it('returns false when values change but severities stay the same', () => {
    // stuckCount 3 → warning, stuckCount 4 → still warning
    const eval1 = makeEvaluation({ stuckCount: 3, evaluatedAt: 1700000000000 });
    const eval2 = makeEvaluation({ stuckCount: 4, evaluatedAt: 1700000060000 });
    const event1 = createAlertEvent(eval1);
    const event2 = createAlertEvent(eval2);
    expect(isStateChange(event2, event1)).toBe(false);
  });
});

// ─── pruneAlertHistory — retention pruning ───────────────────────────────────

describe('pruneAlertHistory', () => {
  const NOW = 1700000000000;

  function makeEvents(count: number, startTs: number = NOW - count * 60000): AlertHistoryEvent[] {
    return Array.from({ length: count }, (_, i) => ({
      ts: startTs + i * 60000,
      overallSeverity: 'ok' as const,
      severityCounts: { ok: 3, warning: 0, critical: 0 },
      ruleSeverities: { stuckCount: 'ok' as const },
      activeMessages: [],
    }));
  }

  it('returns empty array for empty input', () => {
    expect(pruneAlertHistory([], { now: NOW })).toEqual([]);
  });

  it('caps at maxEvents (keeps most recent)', () => {
    const events = makeEvents(50);
    const pruned = pruneAlertHistory(events, { maxEvents: 10, now: NOW });
    expect(pruned).toHaveLength(10);
    expect(pruned[0].ts).toBe(events[40].ts); // last 10
    expect(pruned[9].ts).toBe(events[49].ts);
  });

  it('removes events older than maxAgeMs', () => {
    const oldEvent: AlertHistoryEvent = {
      ts: NOW - 100 * 60 * 60 * 1000, // 100 hours ago
      overallSeverity: 'ok',
      severityCounts: { ok: 3, warning: 0, critical: 0 },
      ruleSeverities: {},
      activeMessages: [],
    };
    const recentEvent: AlertHistoryEvent = {
      ts: NOW - 1000,
      overallSeverity: 'warning',
      severityCounts: { ok: 2, warning: 1, critical: 0 },
      ruleSeverities: { stuckCount: 'warning' },
      activeMessages: ['test'],
    };
    const pruned = pruneAlertHistory([oldEvent, recentEvent], { maxAgeMs: 48 * 3600000, now: NOW });
    expect(pruned).toHaveLength(1);
    expect(pruned[0].overallSeverity).toBe('warning');
  });

  it('applies both age and count limits', () => {
    const events = makeEvents(300, NOW - 300 * 60000); // 300 events, 1 per minute
    const pruned = pruneAlertHistory(events, { maxEvents: 100, maxAgeMs: 2 * 3600000, now: NOW });
    // 2h = 120 minutes of events pass age filter, then capped at 100
    expect(pruned.length).toBeLessThanOrEqual(100);
    // All should be within 2h
    for (const e of pruned) {
      expect(NOW - e.ts).toBeLessThanOrEqual(2 * 3600000);
    }
  });

  it('does not mutate input array', () => {
    const events = makeEvents(50);
    const original = [...events];
    pruneAlertHistory(events, { maxEvents: 5, now: NOW });
    expect(events).toHaveLength(50);
    expect(events).toEqual(original);
  });
});

// ─── shouldRecordEvent — cooldown logic ──────────────────────────────────────

describe('shouldRecordEvent', () => {
  const NOW = 1700000000000;

  it('returns true for empty history', () => {
    expect(shouldRecordEvent([], { now: NOW })).toBe(true);
  });

  it('returns false if last event is too recent', () => {
    const events: AlertHistoryEvent[] = [{
      ts: NOW - 30000, // 30 seconds ago
      overallSeverity: 'ok',
      severityCounts: { ok: 3, warning: 0, critical: 0 },
      ruleSeverities: {},
      activeMessages: [],
    }];
    expect(shouldRecordEvent(events, { minIntervalMs: 60000, now: NOW })).toBe(false);
  });

  it('returns true if cooldown has elapsed', () => {
    const events: AlertHistoryEvent[] = [{
      ts: NOW - 120000, // 2 minutes ago
      overallSeverity: 'ok',
      severityCounts: { ok: 3, warning: 0, critical: 0 },
      ruleSeverities: {},
      activeMessages: [],
    }];
    expect(shouldRecordEvent(events, { minIntervalMs: 60000, now: NOW })).toBe(true);
  });

  it('uses default interval when not specified', () => {
    const events: AlertHistoryEvent[] = [{
      ts: NOW - 30000,
      overallSeverity: 'ok',
      severityCounts: { ok: 3, warning: 0, critical: 0 },
      ruleSeverities: {},
      activeMessages: [],
    }];
    // Default is 60 seconds, 30s ago should be too recent
    expect(shouldRecordEvent(events, { now: NOW })).toBe(false);
  });
});

// ─── maybeAppendAlertEvent — main write path ─────────────────────────────────

describe('maybeAppendAlertEvent', () => {
  const NOW = 1700000000000;

  it('appends first event to empty history', () => {
    const evaluation = makeEvaluation({ evaluatedAt: NOW });
    const result = maybeAppendAlertEvent(testDataDir, evaluation);
    expect(result).toBe(true);
    const history = readAlertHistory(testDataDir);
    expect(history.events).toHaveLength(1);
    expect(history.events[0].ts).toBe(NOW);
  });

  it('skips duplicate state within cooldown', () => {
    const eval1 = makeEvaluation({ evaluatedAt: NOW });
    const eval2 = makeEvaluation({ evaluatedAt: NOW + 30000 }); // 30s later, same state
    maybeAppendAlertEvent(testDataDir, eval1, { minIntervalMs: 60000 });
    const result = maybeAppendAlertEvent(testDataDir, eval2, { minIntervalMs: 60000 });
    expect(result).toBe(false);
    expect(readAlertHistory(testDataDir).events).toHaveLength(1);
  });

  it('records state transitions immediately (bypasses cooldown)', () => {
    const eval1 = makeEvaluation({ stuckCount: 0, evaluatedAt: NOW });
    const eval2 = makeEvaluation({ stuckCount: 3, evaluatedAt: NOW + 10000 }); // 10s later, severity changed
    maybeAppendAlertEvent(testDataDir, eval1, { minIntervalMs: 60000 });
    const result = maybeAppendAlertEvent(testDataDir, eval2, { minIntervalMs: 60000 });
    expect(result).toBe(true);
    const history = readAlertHistory(testDataDir);
    expect(history.events).toHaveLength(2);
    expect(history.events[0].overallSeverity).toBe('ok');
    expect(history.events[1].overallSeverity).toBe('warning');
  });

  it('records same state after cooldown elapses', () => {
    const eval1 = makeEvaluation({ evaluatedAt: NOW });
    const eval2 = makeEvaluation({ evaluatedAt: NOW + 120000 }); // 2min later, same state
    maybeAppendAlertEvent(testDataDir, eval1, { minIntervalMs: 60000 });
    const result = maybeAppendAlertEvent(testDataDir, eval2, { minIntervalMs: 60000 });
    expect(result).toBe(true);
    expect(readAlertHistory(testDataDir).events).toHaveLength(2);
  });

  it('prunes events on write', () => {
    // Pre-seed with many events
    const events: AlertHistoryEvent[] = Array.from({ length: 250 }, (_, i) => ({
      ts: NOW - (250 - i) * 120000,
      overallSeverity: 'ok' as const,
      severityCounts: { ok: 3, warning: 0, critical: 0 },
      ruleSeverities: { stuckCount: 'ok' as const },
      activeMessages: [],
    }));
    fs.writeFileSync(
      path.join(testDataDir, 'task-board-alert-history.json'),
      JSON.stringify({ version: 1, events }),
    );

    const evaluation = makeEvaluation({ evaluatedAt: NOW });
    maybeAppendAlertEvent(testDataDir, evaluation, { maxEvents: 100 });
    const history = readAlertHistory(testDataDir);
    expect(history.events.length).toBeLessThanOrEqual(100);
  });

  it('creates data directory if needed', () => {
    const deepDir = path.join(testDataDir, 'deep', 'nested');
    const evaluation = makeEvaluation({ evaluatedAt: NOW });
    maybeAppendAlertEvent(deepDir, evaluation);
    const history = readAlertHistory(deepDir);
    expect(history.events).toHaveLength(1);
  });
});

// ─── readAlertHistory — file I/O robustness ──────────────────────────────────

describe('readAlertHistory', () => {
  it('returns empty history when file does not exist', () => {
    const history = readAlertHistory(testDataDir);
    expect(history.version).toBe(1);
    expect(history.events).toEqual([]);
  });

  it('returns empty history for corrupted file', () => {
    fs.writeFileSync(
      path.join(testDataDir, 'task-board-alert-history.json'),
      'not valid json!!!',
    );
    const history = readAlertHistory(testDataDir);
    expect(history.events).toEqual([]);
  });

  it('returns empty history for wrong version', () => {
    fs.writeFileSync(
      path.join(testDataDir, 'task-board-alert-history.json'),
      JSON.stringify({ version: 99, events: [{ ts: 1 }] }),
    );
    const history = readAlertHistory(testDataDir);
    expect(history.events).toEqual([]);
  });

  it('reads valid history file', () => {
    const event: AlertHistoryEvent = {
      ts: 1700000000000,
      overallSeverity: 'warning',
      severityCounts: { ok: 2, warning: 1, critical: 0 },
      ruleSeverities: { stuckCount: 'warning' },
      activeMessages: ['Stuck Tasks: 3'],
    };
    fs.writeFileSync(
      path.join(testDataDir, 'task-board-alert-history.json'),
      JSON.stringify({ version: 1, events: [event] }),
    );
    const history = readAlertHistory(testDataDir);
    expect(history.events).toHaveLength(1);
    expect(history.events[0].overallSeverity).toBe('warning');
  });
});

// ─── queryAlertTimeline — timeline query with summary ────────────────────────

describe('queryAlertTimeline', () => {
  const NOW = 1700000000000;

  function seedEvents(events: AlertHistoryEvent[]): void {
    fs.writeFileSync(
      path.join(testDataDir, 'task-board-alert-history.json'),
      JSON.stringify({ version: 1, events }),
    );
  }

  it('returns empty summary when no events', () => {
    const result = queryAlertTimeline(testDataDir, { now: NOW });
    expect(result.totalEvents).toBe(0);
    expect(result.returnedEvents).toBe(0);
    expect(result.currentSeverity).toBe('ok');
    expect(result.events).toEqual([]);
    expect(result.transitionCount).toBe(0);
  });

  it('returns events in chronological order', () => {
    seedEvents([
      { ts: NOW - 3000, overallSeverity: 'ok', severityCounts: { ok: 3, warning: 0, critical: 0 }, ruleSeverities: {}, activeMessages: [] },
      { ts: NOW - 2000, overallSeverity: 'warning', severityCounts: { ok: 2, warning: 1, critical: 0 }, ruleSeverities: {}, activeMessages: [] },
      { ts: NOW - 1000, overallSeverity: 'ok', severityCounts: { ok: 3, warning: 0, critical: 0 }, ruleSeverities: {}, activeMessages: [] },
    ]);
    const result = queryAlertTimeline(testDataDir, { now: NOW });
    expect(result.events).toHaveLength(3);
    expect(result.events[0].ts).toBe(NOW - 3000);
    expect(result.events[2].ts).toBe(NOW - 1000);
  });

  it('respects limit parameter', () => {
    seedEvents(Array.from({ length: 100 }, (_, i) => ({
      ts: NOW - (100 - i) * 1000,
      overallSeverity: 'ok' as const,
      severityCounts: { ok: 3, warning: 0, critical: 0 },
      ruleSeverities: {},
      activeMessages: [],
    })));
    const result = queryAlertTimeline(testDataDir, { limit: 10, now: NOW });
    expect(result.returnedEvents).toBe(10);
    expect(result.totalEvents).toBe(100);
  });

  it('filters by sinceMs', () => {
    seedEvents([
      { ts: NOW - 7200000, overallSeverity: 'warning', severityCounts: { ok: 2, warning: 1, critical: 0 }, ruleSeverities: {}, activeMessages: [] },
      { ts: NOW - 1800000, overallSeverity: 'ok', severityCounts: { ok: 3, warning: 0, critical: 0 }, ruleSeverities: {}, activeMessages: [] },
    ]);
    const result = queryAlertTimeline(testDataDir, { sinceMs: 3600000, now: NOW }); // last 1h
    expect(result.totalEvents).toBe(1); // only the recent one
    expect(result.events[0].overallSeverity).toBe('ok');
  });

  it('filters by minSeverity', () => {
    seedEvents([
      { ts: NOW - 3000, overallSeverity: 'ok', severityCounts: { ok: 3, warning: 0, critical: 0 }, ruleSeverities: {}, activeMessages: [] },
      { ts: NOW - 2000, overallSeverity: 'warning', severityCounts: { ok: 2, warning: 1, critical: 0 }, ruleSeverities: {}, activeMessages: ['test'] },
      { ts: NOW - 1000, overallSeverity: 'critical', severityCounts: { ok: 1, warning: 0, critical: 2 }, ruleSeverities: {}, activeMessages: ['crit'] },
    ]);
    const result = queryAlertTimeline(testDataDir, { minSeverity: 'warning', now: NOW });
    expect(result.returnedEvents).toBe(2);
    expect(result.events.every(e => e.overallSeverity !== 'ok')).toBe(true);
  });

  it('computes currentSeverity from most recent event', () => {
    seedEvents([
      { ts: NOW - 2000, overallSeverity: 'warning', severityCounts: { ok: 2, warning: 1, critical: 0 }, ruleSeverities: {}, activeMessages: [] },
      { ts: NOW - 1000, overallSeverity: 'critical', severityCounts: { ok: 1, warning: 0, critical: 2 }, ruleSeverities: {}, activeMessages: [] },
    ]);
    const result = queryAlertTimeline(testDataDir, { now: NOW });
    expect(result.currentSeverity).toBe('critical');
  });

  it('counts severity transitions correctly', () => {
    seedEvents([
      { ts: NOW - 4000, overallSeverity: 'ok', severityCounts: { ok: 3, warning: 0, critical: 0 }, ruleSeverities: {}, activeMessages: [] },
      { ts: NOW - 3000, overallSeverity: 'warning', severityCounts: { ok: 2, warning: 1, critical: 0 }, ruleSeverities: {}, activeMessages: [] },
      { ts: NOW - 2000, overallSeverity: 'warning', severityCounts: { ok: 2, warning: 1, critical: 0 }, ruleSeverities: {}, activeMessages: [] },
      { ts: NOW - 1000, overallSeverity: 'ok', severityCounts: { ok: 3, warning: 0, critical: 0 }, ruleSeverities: {}, activeMessages: [] },
    ]);
    const result = queryAlertTimeline(testDataDir, { now: NOW });
    expect(result.transitionCount).toBe(2); // ok→warning, warning→ok
  });

  it('computes severity durations', () => {
    seedEvents([
      { ts: NOW - 6000, overallSeverity: 'ok', severityCounts: { ok: 3, warning: 0, critical: 0 }, ruleSeverities: {}, activeMessages: [] },
      { ts: NOW - 3000, overallSeverity: 'warning', severityCounts: { ok: 2, warning: 1, critical: 0 }, ruleSeverities: {}, activeMessages: [] },
    ]);
    const result = queryAlertTimeline(testDataDir, { now: NOW });
    // ok: 6000-3000 = 3000ms, warning: 3000-0 = 3000ms
    expect(result.severityDurations.ok).toBe(3000);
    expect(result.severityDurations.warning).toBe(3000);
    expect(result.severityDurations.critical).toBe(0);
  });

  it('sets lastTransitionAt to the most recent transition', () => {
    seedEvents([
      { ts: NOW - 4000, overallSeverity: 'ok', severityCounts: { ok: 3, warning: 0, critical: 0 }, ruleSeverities: {}, activeMessages: [] },
      { ts: NOW - 2000, overallSeverity: 'warning', severityCounts: { ok: 2, warning: 1, critical: 0 }, ruleSeverities: {}, activeMessages: [] },
      { ts: NOW - 1000, overallSeverity: 'ok', severityCounts: { ok: 3, warning: 0, critical: 0 }, ruleSeverities: {}, activeMessages: [] },
    ]);
    const result = queryAlertTimeline(testDataDir, { now: NOW });
    expect(result.lastTransitionAt).toBe(NOW - 1000);
  });

  it('clamps limit to max 200', () => {
    seedEvents(Array.from({ length: 250 }, (_, i) => ({
      ts: NOW - (250 - i) * 1000,
      overallSeverity: 'ok' as const,
      severityCounts: { ok: 3, warning: 0, critical: 0 },
      ruleSeverities: {},
      activeMessages: [],
    })));
    const result = queryAlertTimeline(testDataDir, { limit: 999, now: NOW });
    expect(result.returnedEvents).toBeLessThanOrEqual(200);
  });
});

// ─── GET /api/task-board/alerts/timeline — API endpoint ──────────────────────

describe('GET /api/task-board/alerts/timeline', () => {
  it('returns empty timeline when no history exists', async () => {
    seedTasks([]);
    const req = mockRequest({ url: '/api/task-board/alerts/timeline', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const body = parseJsonBody(res);
    expect(res._statusCode).toBe(200);
    expect(body.totalEvents).toBe(0);
    expect(body.events).toEqual([]);
    expect(body.currentSeverity).toBe('ok');
  });

  it('returns timeline with events', async () => {
    seedTasks([]);
    const NOW = Date.now();
    // Seed some alert history events
    const events: AlertHistoryEvent[] = [
      { ts: NOW - 5000, overallSeverity: 'ok', severityCounts: { ok: 3, warning: 0, critical: 0 }, ruleSeverities: {}, activeMessages: [] },
      { ts: NOW - 3000, overallSeverity: 'warning', severityCounts: { ok: 2, warning: 1, critical: 0 }, ruleSeverities: { stuckCount: 'warning' }, activeMessages: ['Stuck Tasks: 3'] },
    ];
    fs.writeFileSync(
      path.join(testDataDir, 'task-board-alert-history.json'),
      JSON.stringify({ version: 1, events }),
    );

    const req = mockRequest({ url: '/api/task-board/alerts/timeline', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const body = parseJsonBody(res);
    expect(body.totalEvents).toBe(2);
    expect(body.events).toHaveLength(2);
    expect(body.currentSeverity).toBe('warning');
    expect(body.transitionCount).toBe(1);
  });

  it('respects limit query param', async () => {
    seedTasks([]);
    const NOW = Date.now();
    const events = Array.from({ length: 50 }, (_, i) => ({
      ts: NOW - (50 - i) * 1000,
      overallSeverity: 'ok' as const,
      severityCounts: { ok: 3, warning: 0, critical: 0 },
      ruleSeverities: {},
      activeMessages: [],
    }));
    fs.writeFileSync(
      path.join(testDataDir, 'task-board-alert-history.json'),
      JSON.stringify({ version: 1, events }),
    );

    const req = mockRequest({ url: '/api/task-board/alerts/timeline?limit=5', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const body = parseJsonBody(res);
    expect(body.returnedEvents).toBe(5);
    expect(body.totalEvents).toBe(50);
  });

  it('respects sinceMs query param', async () => {
    seedTasks([]);
    const NOW = Date.now();
    const events = [
      { ts: NOW - 7200000, overallSeverity: 'warning' as const, severityCounts: { ok: 2, warning: 1, critical: 0 }, ruleSeverities: {}, activeMessages: [] },
      { ts: NOW - 1800000, overallSeverity: 'ok' as const, severityCounts: { ok: 3, warning: 0, critical: 0 }, ruleSeverities: {}, activeMessages: [] },
    ];
    fs.writeFileSync(
      path.join(testDataDir, 'task-board-alert-history.json'),
      JSON.stringify({ version: 1, events }),
    );

    const req = mockRequest({ url: '/api/task-board/alerts/timeline?sinceMs=3600000', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const body = parseJsonBody(res);
    expect(body.totalEvents).toBe(1);
    expect(body.events[0].overallSeverity).toBe('ok');
  });

  it('respects minSeverity query param', async () => {
    seedTasks([]);
    const NOW = Date.now();
    const events = [
      { ts: NOW - 3000, overallSeverity: 'ok' as const, severityCounts: { ok: 3, warning: 0, critical: 0 }, ruleSeverities: {}, activeMessages: [] },
      { ts: NOW - 2000, overallSeverity: 'warning' as const, severityCounts: { ok: 2, warning: 1, critical: 0 }, ruleSeverities: {}, activeMessages: ['test'] },
    ];
    fs.writeFileSync(
      path.join(testDataDir, 'task-board-alert-history.json'),
      JSON.stringify({ version: 1, events }),
    );

    const req = mockRequest({ url: '/api/task-board/alerts/timeline?minSeverity=warning', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const body = parseJsonBody(res);
    expect(body.totalEvents).toBe(1);
    expect(body.events[0].overallSeverity).toBe('warning');
  });
});

// ─── Alert event recording via GET /api/task-board/metrics (piggyback) ───────

describe('GET /api/task-board/metrics — alert history recording', () => {
  it('records alert event on metrics fetch', async () => {
    seedTasks([
      makeSampleCard({ status: 'running', startedAt: Date.now() - 3600000 * 2 }),
      makeSampleCard({ status: 'running', startedAt: Date.now() - 3600000 * 2 }),
      makeSampleCard({ status: 'running', startedAt: Date.now() - 3600000 * 2 }),
    ]);

    const req = mockRequest({ url: '/api/task-board/metrics', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    // Verify metrics response includes alerts
    const body = parseJsonBody(res);
    expect(body.alerts).toBeDefined();
    expect(body.alerts.overallSeverity).toBe('warning');

    // Verify alert history was written
    const history = readAlertHistory(testDataDir);
    expect(history.events.length).toBeGreaterThanOrEqual(1);
    expect(history.events[0].overallSeverity).toBe('warning');
  });

  it('does not record when alerts are excluded', async () => {
    seedTasks([]);
    const req = mockRequest({ url: '/api/task-board/metrics?includeAlerts=false', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const history = readAlertHistory(testDataDir);
    expect(history.events).toHaveLength(0);
  });
});

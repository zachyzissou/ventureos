/**
 * Task Board Metrics History — persistence, pruning, and API tests.
 * Issue #219, Phase 8: Persistent task metrics history / time-series baseline.
 *
 * Tests for:
 * - readHistory / writeHistory (via maybeAppendSnapshot)
 * - pruneSnapshots (retention by count and age)
 * - shouldSnapshot (cooldown logic)
 * - createSnapshot (compact extraction)
 * - maybeAppendSnapshot (end-to-end write path)
 * - queryHistory (read with limit/sinceMs filters)
 * - GET /api/task-board/metrics/history endpoint
 * - Snapshot side-effect on GET /api/task-board/metrics
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import {
  handleTaskBoard,
  computeMetrics,
} from '../../../server/routes/task-board.js';
import {
  readHistory,
  pruneSnapshots,
  shouldSnapshot,
  createSnapshot,
  maybeAppendSnapshot,
  queryHistory,
} from '../../../server/metrics-history.js';
import type { MetricsSnapshot, MetricsHistoryFile } from '../../../server/metrics-history.js';
import type { TaskBoardDeps, TaskCard, TaskStatus } from '../../../server/types.js';

const testDataDir = path.join('/tmp', 'test-metrics-history-' + process.pid);

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

function seedHistory(snapshots: MetricsSnapshot[]): void {
  fs.mkdirSync(testDataDir, { recursive: true });
  const data: MetricsHistoryFile = { version: 1, snapshots };
  fs.writeFileSync(
    path.join(testDataDir, 'task-board-metrics-history.json'),
    JSON.stringify(data),
  );
}

function makeSnapshot(overrides: Partial<MetricsSnapshot> = {}): MetricsSnapshot {
  return {
    ts: Date.now(),
    statusCounts: { backlog: 0, queued: 0, running: 0, done: 0, failed: 0 },
    total: 0,
    throughput: { last24h: 0, last7d: 0, last30d: 0 },
    avgRuntimeMs: null,
    medianRuntimeMs: null,
    successRate: null,
    stuckCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  fs.mkdirSync(testDataDir, { recursive: true });
  for (const f of ['task-board.json', 'task-board-metrics-history.json']) {
    const fp = path.join(testDataDir, f);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
});

afterEach(() => {
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch {}
});

// ─── readHistory ─────────────────────────────────────────────────────────────

describe('readHistory', () => {
  it('returns empty history when file does not exist', () => {
    const h = readHistory(testDataDir);
    expect(h.version).toBe(1);
    expect(h.snapshots).toHaveLength(0);
  });

  it('reads valid history file', () => {
    const snap = makeSnapshot({ ts: 1000, total: 5 });
    seedHistory([snap]);
    const h = readHistory(testDataDir);
    expect(h.snapshots).toHaveLength(1);
    expect(h.snapshots[0].total).toBe(5);
    expect(h.snapshots[0].ts).toBe(1000);
  });

  it('returns empty history for corrupt file', () => {
    fs.writeFileSync(
      path.join(testDataDir, 'task-board-metrics-history.json'),
      'NOT JSON',
    );
    const h = readHistory(testDataDir);
    expect(h.snapshots).toHaveLength(0);
  });

  it('returns empty history for wrong version', () => {
    fs.writeFileSync(
      path.join(testDataDir, 'task-board-metrics-history.json'),
      JSON.stringify({ version: 99, snapshots: [{ ts: 1 }] }),
    );
    const h = readHistory(testDataDir);
    expect(h.snapshots).toHaveLength(0);
  });
});

// ─── pruneSnapshots ──────────────────────────────────────────────────────────

describe('pruneSnapshots', () => {
  const NOW = 1700000000000;

  it('returns empty for empty input', () => {
    expect(pruneSnapshots([], { now: NOW })).toHaveLength(0);
  });

  it('prunes snapshots older than maxAgeMs', () => {
    const snapshots = [
      makeSnapshot({ ts: NOW - 10 * 86400000 }), // 10 days old — pruned
      makeSnapshot({ ts: NOW - 5 * 86400000 }),  // 5 days old — kept
      makeSnapshot({ ts: NOW - 1 * 86400000 }),  // 1 day old — kept
    ];
    const result = pruneSnapshots(snapshots, { maxAgeMs: 7 * 86400000, now: NOW });
    expect(result).toHaveLength(2);
    expect(result[0].ts).toBe(NOW - 5 * 86400000);
  });

  it('caps to maxPoints (keeps most recent)', () => {
    const snapshots = Array.from({ length: 10 }, (_, i) =>
      makeSnapshot({ ts: NOW - (10 - i) * 60000 }),
    );
    const result = pruneSnapshots(snapshots, { maxPoints: 3, now: NOW, maxAgeMs: 86400000 });
    expect(result).toHaveLength(3);
    // Should keep the 3 most recent
    expect(result[0].ts).toBe(snapshots[7].ts);
    expect(result[2].ts).toBe(snapshots[9].ts);
  });

  it('applies both age and count limits', () => {
    const snapshots = [
      makeSnapshot({ ts: NOW - 8 * 86400000 }), // too old
      ...Array.from({ length: 5 }, (_, i) =>
        makeSnapshot({ ts: NOW - (5 - i) * 3600000 }),
      ),
    ];
    const result = pruneSnapshots(snapshots, {
      maxAgeMs: 7 * 86400000,
      maxPoints: 3,
      now: NOW,
    });
    expect(result).toHaveLength(3); // 1 removed by age, then capped to 3
  });

  it('does not mutate input array', () => {
    const snapshots = [
      makeSnapshot({ ts: NOW - 10 * 86400000 }),
      makeSnapshot({ ts: NOW }),
    ];
    const orig = [...snapshots];
    pruneSnapshots(snapshots, { maxAgeMs: 86400000, now: NOW });
    expect(snapshots).toEqual(orig);
  });
});

// ─── shouldSnapshot ──────────────────────────────────────────────────────────

describe('shouldSnapshot', () => {
  const NOW = 1700000000000;

  it('returns true for empty snapshot list', () => {
    expect(shouldSnapshot([], { now: NOW })).toBe(true);
  });

  it('returns false if last snapshot is within cooldown', () => {
    const snapshots = [makeSnapshot({ ts: NOW - 60000 })]; // 1 min ago
    expect(shouldSnapshot(snapshots, { minIntervalMs: 300000, now: NOW })).toBe(false);
  });

  it('returns true if last snapshot is beyond cooldown', () => {
    const snapshots = [makeSnapshot({ ts: NOW - 600000 })]; // 10 min ago
    expect(shouldSnapshot(snapshots, { minIntervalMs: 300000, now: NOW })).toBe(true);
  });

  it('uses last element for comparison', () => {
    const snapshots = [
      makeSnapshot({ ts: NOW - 600000 }), // old
      makeSnapshot({ ts: NOW - 30000 }),   // recent (last)
    ];
    expect(shouldSnapshot(snapshots, { minIntervalMs: 300000, now: NOW })).toBe(false);
  });
});

// ─── createSnapshot ──────────────────────────────────────────────────────────

describe('createSnapshot', () => {
  it('extracts correct fields from full metrics', () => {
    const metrics = {
      updatedAt: 1700000000000,
      statusCounts: { backlog: 2, queued: 1, running: 3, done: 5, failed: 1 } as Record<TaskStatus, number>,
      total: 12,
      throughput: { last24h: 3, last7d: 10, last30d: 25 },
      avgRuntimeMs: 45000,
      medianRuntimeMs: 30000,
      successRate: 0.833,
      stuckCount: 1,
      // Fields that should NOT be in snapshot
      completionTrend7d: [],
      agentBreakdown: [],
      stuckTasks: [],
      stuckTimeoutMs: 1800000,
    };
    const snap = createSnapshot(metrics);
    expect(snap.ts).toBe(1700000000000);
    expect(snap.total).toBe(12);
    expect(snap.statusCounts.running).toBe(3);
    expect(snap.throughput.last24h).toBe(3);
    expect(snap.avgRuntimeMs).toBe(45000);
    expect(snap.successRate).toBe(0.833);
    expect(snap.stuckCount).toBe(1);
    // Ensure no extraneous fields
    expect(snap).not.toHaveProperty('completionTrend7d');
    expect(snap).not.toHaveProperty('agentBreakdown');
    expect(snap).not.toHaveProperty('stuckTasks');
  });

  it('does not share references with input', () => {
    const statusCounts = { backlog: 1, queued: 0, running: 0, done: 0, failed: 0 } as Record<TaskStatus, number>;
    const throughput = { last24h: 1, last7d: 2, last30d: 3 };
    const snap = createSnapshot({
      updatedAt: Date.now(),
      statusCounts,
      total: 1,
      throughput,
      avgRuntimeMs: null,
      medianRuntimeMs: null,
      successRate: null,
      stuckCount: 0,
    });
    // Mutate originals — snapshot should be unaffected
    statusCounts.backlog = 999;
    throughput.last24h = 999;
    expect(snap.statusCounts.backlog).toBe(1);
    expect(snap.throughput.last24h).toBe(1);
  });
});

// ─── maybeAppendSnapshot ─────────────────────────────────────────────────────

describe('maybeAppendSnapshot', () => {
  const NOW = 1700000000000;

  function makeMetrics(overrides: Partial<ReturnType<typeof computeMetrics>> = {}) {
    return {
      updatedAt: NOW,
      statusCounts: { backlog: 0, queued: 0, running: 0, done: 0, failed: 0 } as Record<TaskStatus, number>,
      total: 0,
      throughput: { last24h: 0, last7d: 0, last30d: 0 },
      avgRuntimeMs: null,
      medianRuntimeMs: null,
      successRate: null,
      stuckCount: 0,
      completionTrend7d: [],
      agentBreakdown: [],
      stuckTasks: [],
      stuckTimeoutMs: 1800000,
      ...overrides,
    };
  }

  it('writes first snapshot to empty history', () => {
    const metrics = makeMetrics({ total: 5 });
    const written = maybeAppendSnapshot(testDataDir, metrics, { minIntervalMs: 300000 });
    expect(written).toBe(true);
    const h = readHistory(testDataDir);
    expect(h.snapshots).toHaveLength(1);
    expect(h.snapshots[0].total).toBe(5);
  });

  it('skips write if cooldown has not elapsed', () => {
    // Seed with a recent snapshot
    seedHistory([makeSnapshot({ ts: NOW - 60000 })]);
    const metrics = makeMetrics({ updatedAt: NOW, total: 10 });
    const written = maybeAppendSnapshot(testDataDir, metrics, { minIntervalMs: 300000 });
    expect(written).toBe(false);
    const h = readHistory(testDataDir);
    expect(h.snapshots).toHaveLength(1); // no new snapshot
  });

  it('writes if cooldown has elapsed', () => {
    seedHistory([makeSnapshot({ ts: NOW - 600000 })]); // 10 min ago
    const metrics = makeMetrics({ updatedAt: NOW, total: 10 });
    const written = maybeAppendSnapshot(testDataDir, metrics, { minIntervalMs: 300000 });
    expect(written).toBe(true);
    const h = readHistory(testDataDir);
    expect(h.snapshots).toHaveLength(2);
  });

  it('prunes old snapshots on write', () => {
    // Seed with 5 snapshots, all old
    const oldSnapshots = Array.from({ length: 5 }, (_, i) =>
      makeSnapshot({ ts: NOW - (10 + i) * 86400000 }), // 10-14 days old
    );
    seedHistory(oldSnapshots);
    const metrics = makeMetrics({ updatedAt: NOW });
    const written = maybeAppendSnapshot(testDataDir, metrics, {
      minIntervalMs: 0, // no cooldown
      maxAgeMs: 7 * 86400000,
    });
    expect(written).toBe(true);
    const h = readHistory(testDataDir);
    // All 5 old snapshots pruned, only the new one remains
    expect(h.snapshots).toHaveLength(1);
    expect(h.snapshots[0].ts).toBe(NOW);
  });

  it('caps total snapshots to maxPoints', () => {
    const existing = Array.from({ length: 10 }, (_, i) =>
      makeSnapshot({ ts: NOW - (10 - i) * 300000 }),
    );
    seedHistory(existing);
    const metrics = makeMetrics({ updatedAt: NOW });
    maybeAppendSnapshot(testDataDir, metrics, {
      minIntervalMs: 0,
      maxPoints: 5,
      maxAgeMs: 86400000,
    });
    const h = readHistory(testDataDir);
    expect(h.snapshots.length).toBeLessThanOrEqual(5);
  });

  it('creates dataDir if it does not exist', () => {
    const newDir = path.join(testDataDir, 'nested', 'dir');
    const metrics = makeMetrics({ updatedAt: NOW });
    maybeAppendSnapshot(newDir, metrics, { minIntervalMs: 0 });
    expect(fs.existsSync(path.join(newDir, 'task-board-metrics-history.json'))).toBe(true);
  });
});

// ─── queryHistory ────────────────────────────────────────────────────────────

describe('queryHistory', () => {
  const NOW = 1700000000000;

  it('returns empty array when no history file exists', () => {
    const result = queryHistory(testDataDir, { now: NOW });
    expect(result).toHaveLength(0);
  });

  it('returns all snapshots within default limit', () => {
    const snaps = Array.from({ length: 5 }, (_, i) =>
      makeSnapshot({ ts: NOW - (5 - i) * 300000 }),
    );
    seedHistory(snaps);
    const result = queryHistory(testDataDir, { now: NOW });
    expect(result).toHaveLength(5);
    // Should be in chronological order (oldest first)
    expect(result[0].ts).toBeLessThan(result[4].ts);
  });

  it('respects limit parameter', () => {
    const snaps = Array.from({ length: 20 }, (_, i) =>
      makeSnapshot({ ts: NOW - (20 - i) * 300000 }),
    );
    seedHistory(snaps);
    const result = queryHistory(testDataDir, { limit: 5, now: NOW });
    expect(result).toHaveLength(5);
    // Should be the 5 most recent
    expect(result[0].ts).toBe(snaps[15].ts);
  });

  it('filters by sinceMs', () => {
    const snaps = [
      makeSnapshot({ ts: NOW - 3600000 * 3 }), // 3 hours ago
      makeSnapshot({ ts: NOW - 3600000 }),       // 1 hour ago
      makeSnapshot({ ts: NOW - 60000 }),          // 1 min ago
    ];
    seedHistory(snaps);
    const result = queryHistory(testDataDir, {
      sinceMs: 2 * 3600000, // last 2 hours
      now: NOW,
    });
    expect(result).toHaveLength(2);
    expect(result[0].ts).toBe(NOW - 3600000);
  });

  it('combines limit and sinceMs', () => {
    const snaps = Array.from({ length: 10 }, (_, i) =>
      makeSnapshot({ ts: NOW - (10 - i) * 60000 }),
    );
    seedHistory(snaps);
    const result = queryHistory(testDataDir, {
      sinceMs: 5 * 60000, // last 5 min
      limit: 2,
      now: NOW,
    });
    expect(result).toHaveLength(2);
  });
});

// ─── GET /api/task-board/metrics/history endpoint ────────────────────────────

describe('GET /api/task-board/metrics/history', () => {
  const NOW = 1700000000000;

  it('returns empty snapshots array when no history', async () => {
    seedTasks([]);
    const req = mockRequest({ url: '/api/task-board/metrics/history', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());
    const body = parseJsonBody(res);
    expect(res._statusCode).toBe(200);
    expect(body).toHaveProperty('snapshots');
    expect(body).toHaveProperty('count', 0);
    expect(body.snapshots).toHaveLength(0);
  });

  it('returns persisted snapshots', async () => {
    seedTasks([]);
    seedHistory([
      makeSnapshot({ ts: NOW - 600000, total: 3 }),
      makeSnapshot({ ts: NOW - 300000, total: 5 }),
      makeSnapshot({ ts: NOW, total: 7 }),
    ]);
    const req = mockRequest({ url: '/api/task-board/metrics/history', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());
    const body = parseJsonBody(res);
    expect(body.count).toBe(3);
    expect(body.snapshots).toHaveLength(3);
    expect(body.snapshots[0].total).toBe(3);
    expect(body.snapshots[2].total).toBe(7);
  });

  it('respects limit query param', async () => {
    seedTasks([]);
    const snaps = Array.from({ length: 20 }, (_, i) =>
      makeSnapshot({ ts: NOW - (20 - i) * 300000 }),
    );
    seedHistory(snaps);
    const req = mockRequest({ url: '/api/task-board/metrics/history?limit=5', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());
    const body = parseJsonBody(res);
    expect(body.count).toBe(5);
    expect(body.snapshots).toHaveLength(5);
  });

  it('respects sinceMs query param', async () => {
    seedTasks([]);
    // Use real timestamps relative to actual Date.now() so the API handler
    // (which defaults to Date.now()) filters correctly.
    const realNow = Date.now();
    seedHistory([
      makeSnapshot({ ts: realNow - 7200000 }), // 2h ago
      makeSnapshot({ ts: realNow - 1800000 }), // 30 min ago
      makeSnapshot({ ts: realNow }),
    ]);
    const req = mockRequest({ url: `/api/task-board/metrics/history?sinceMs=3600000`, method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());
    const body = parseJsonBody(res);
    expect(body.count).toBe(2); // 30 min + now
  });

  it('clamps limit to 500 max', async () => {
    seedTasks([]);
    seedHistory([makeSnapshot({ ts: NOW })]);
    const req = mockRequest({ url: '/api/task-board/metrics/history?limit=9999', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());
    // Should not error — just clamped
    const body = parseJsonBody(res);
    expect(body.count).toBe(1);
  });
});

// ─── Snapshot side-effect on GET /api/task-board/metrics ─────────────────────

describe('Metrics API snapshot side-effect', () => {
  it('persists a snapshot when metrics are fetched', async () => {
    seedTasks([
      makeSampleCard({ status: 'done', completedAt: Date.now() - 3600000, runtimeMs: 5000 }),
      makeSampleCard({ status: 'running', startedAt: Date.now() }),
    ]);

    const req = mockRequest({ url: '/api/task-board/metrics', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    // Verify metrics response is still correct
    const body = parseJsonBody(res);
    expect(body.total).toBe(2);

    // Verify a snapshot was written
    const h = readHistory(testDataDir);
    expect(h.snapshots.length).toBeGreaterThanOrEqual(1);
    expect(h.snapshots[h.snapshots.length - 1].total).toBe(2);
  });

  it('does not duplicate snapshot on rapid successive calls', async () => {
    seedTasks([makeSampleCard({ status: 'backlog' })]);

    // First call — should write
    const req1 = mockRequest({ url: '/api/task-board/metrics', method: 'GET' });
    const res1 = mockResponse();
    await handleTaskBoard(req1, res1, createDeps());

    // Second call immediately — should NOT write (cooldown)
    const req2 = mockRequest({ url: '/api/task-board/metrics', method: 'GET' });
    const res2 = mockResponse();
    await handleTaskBoard(req2, res2, createDeps());

    const h = readHistory(testDataDir);
    // Only 1 snapshot despite 2 API calls
    expect(h.snapshots).toHaveLength(1);
  });
});

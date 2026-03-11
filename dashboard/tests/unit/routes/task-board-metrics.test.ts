/**
 * Task Board Metrics & Stuck-Task Detection tests — Issue #219, Phase 7.
 *
 * Tests for:
 * - computeMetrics() — KPIs, throughput, runtime stats, trend, agent breakdown
 * - computeStuckTasks() — stuck-task identification and sorting
 * - GET /api/task-board/metrics endpoint
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import {
  handleTaskBoard,
  loadTasks,
  computeMetrics,
  computeStuckTasks,
} from '../../../server/routes/task-board.js';
import type { TaskBoardDeps, TaskCard, TaskStatus, TaskPriority } from '../../../server/types.js';

const testDataDir = path.join('/tmp', 'test-task-board-metrics-' + process.pid);

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

beforeEach(() => {
  fs.mkdirSync(testDataDir, { recursive: true });
  const fp = path.join(testDataDir, 'task-board.json');
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
});

afterEach(() => {
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch {}
});

// ─── computeStuckTasks ───────────────────────────────────────────────────────

describe('computeStuckTasks', () => {
  const NOW = 1700000000000;

  it('returns empty array when no tasks are running', () => {
    const tasks = [
      makeSampleCard({ status: 'backlog' }),
      makeSampleCard({ status: 'done' }),
    ];
    expect(computeStuckTasks(tasks, 30 * 60000, NOW)).toHaveLength(0);
  });

  it('returns empty when running tasks are within threshold', () => {
    const tasks = [
      makeSampleCard({
        status: 'running',
        startedAt: NOW - 10 * 60000, // 10 min ago
      }),
    ];
    expect(computeStuckTasks(tasks, 30 * 60000, NOW)).toHaveLength(0);
  });

  it('identifies a running task exceeding the threshold', () => {
    const tasks = [
      makeSampleCard({
        id: 'stuck-1',
        status: 'running',
        startedAt: NOW - 45 * 60000, // 45 min ago, threshold is 30 min
        title: 'Stuck task',
        agentId: 'nexus',
        priority: 'high',
      }),
    ];
    const stuck = computeStuckTasks(tasks, 30 * 60000, NOW);
    expect(stuck).toHaveLength(1);
    expect(stuck[0].id).toBe('stuck-1');
    expect(stuck[0].runningMs).toBe(45 * 60000);
    expect(stuck[0].thresholdMs).toBe(30 * 60000);
    expect(stuck[0].overshootRatio).toBe(1.5);
    expect(stuck[0].agentId).toBe('nexus');
    expect(stuck[0].priority).toBe('high');
  });

  it('sorts by overshoot ratio descending', () => {
    const tasks = [
      makeSampleCard({ id: 'a', status: 'running', startedAt: NOW - 40 * 60000 }), // 40 min
      makeSampleCard({ id: 'b', status: 'running', startedAt: NOW - 90 * 60000 }), // 90 min
      makeSampleCard({ id: 'c', status: 'running', startedAt: NOW - 60 * 60000 }), // 60 min
    ];
    const stuck = computeStuckTasks(tasks, 30 * 60000, NOW);
    expect(stuck).toHaveLength(3);
    expect(stuck[0].id).toBe('b'); // most stuck
    expect(stuck[1].id).toBe('c');
    expect(stuck[2].id).toBe('a');
  });

  it('ignores running tasks without startedAt', () => {
    const tasks = [
      makeSampleCard({ status: 'running', startedAt: null }),
    ];
    expect(computeStuckTasks(tasks, 30 * 60000, NOW)).toHaveLength(0);
  });

  it('respects custom timeout', () => {
    const tasks = [
      makeSampleCard({
        status: 'running',
        startedAt: NOW - 5 * 60000, // 5 min ago
      }),
    ];
    // 3 min timeout → should be stuck
    expect(computeStuckTasks(tasks, 3 * 60000, NOW)).toHaveLength(1);
    // 10 min timeout → not stuck
    expect(computeStuckTasks(tasks, 10 * 60000, NOW)).toHaveLength(0);
  });
});

// ─── computeMetrics ──────────────────────────────────────────────────────────

describe('computeMetrics', () => {
  const NOW = 1700000000000;
  const HOUR = 3600000;
  const DAY = 86400000;

  it('returns zero metrics for empty task list', () => {
    const m = computeMetrics([], { now: NOW });
    expect(m.total).toBe(0);
    expect(m.throughput.last24h).toBe(0);
    expect(m.throughput.last7d).toBe(0);
    expect(m.avgRuntimeMs).toBeNull();
    expect(m.medianRuntimeMs).toBeNull();
    expect(m.successRate).toBeNull();
    expect(m.stuckCount).toBe(0);
    expect(m.completionTrend7d).toHaveLength(7);
    expect(m.agentBreakdown).toHaveLength(0);
  });

  it('counts status correctly', () => {
    const tasks = [
      makeSampleCard({ status: 'backlog' }),
      makeSampleCard({ status: 'running' }),
      makeSampleCard({ status: 'running' }),
      makeSampleCard({ status: 'done' }),
    ];
    const m = computeMetrics(tasks, { now: NOW });
    expect(m.statusCounts.backlog).toBe(1);
    expect(m.statusCounts.running).toBe(2);
    expect(m.statusCounts.done).toBe(1);
    expect(m.total).toBe(4);
  });

  it('computes throughput for time windows', () => {
    const tasks = [
      makeSampleCard({ status: 'done', completedAt: NOW - 2 * HOUR }), // within 24h
      makeSampleCard({ status: 'done', completedAt: NOW - 3 * DAY }), // within 7d
      makeSampleCard({ status: 'failed', completedAt: NOW - 10 * DAY }), // within 30d
      makeSampleCard({ status: 'done', completedAt: NOW - 60 * DAY }), // outside 30d
    ];
    const m = computeMetrics(tasks, { now: NOW });
    expect(m.throughput.last24h).toBe(1);
    expect(m.throughput.last7d).toBe(2);
    expect(m.throughput.last30d).toBe(3);
  });

  it('computes average and median runtime', () => {
    const tasks = [
      makeSampleCard({ status: 'done', runtimeMs: 10000, completedAt: NOW - HOUR }),
      makeSampleCard({ status: 'done', runtimeMs: 30000, completedAt: NOW - HOUR }),
      makeSampleCard({ status: 'done', runtimeMs: 50000, completedAt: NOW - HOUR }),
    ];
    const m = computeMetrics(tasks, { now: NOW });
    expect(m.avgRuntimeMs).toBe(30000); // (10+30+50)/3
    expect(m.medianRuntimeMs).toBe(30000); // middle value
  });

  it('computes median for even number of runtimes', () => {
    const tasks = [
      makeSampleCard({ status: 'done', runtimeMs: 10000, completedAt: NOW - HOUR }),
      makeSampleCard({ status: 'done', runtimeMs: 20000, completedAt: NOW - HOUR }),
      makeSampleCard({ status: 'failed', runtimeMs: 30000, completedAt: NOW - HOUR }),
      makeSampleCard({ status: 'done', runtimeMs: 40000, completedAt: NOW - HOUR }),
    ];
    const m = computeMetrics(tasks, { now: NOW });
    expect(m.medianRuntimeMs).toBe(25000); // avg of 20000 and 30000
  });

  it('derives runtimeMs from startedAt/completedAt when not set', () => {
    const tasks = [
      makeSampleCard({
        status: 'done',
        startedAt: NOW - 60000,
        completedAt: NOW - 10000,
        runtimeMs: null,
      }),
    ];
    const m = computeMetrics(tasks, { now: NOW });
    expect(m.avgRuntimeMs).toBe(50000); // completedAt - startedAt
  });

  it('computes success rate', () => {
    const tasks = [
      makeSampleCard({ status: 'done', completedAt: NOW }),
      makeSampleCard({ status: 'done', completedAt: NOW }),
      makeSampleCard({ status: 'done', completedAt: NOW }),
      makeSampleCard({ status: 'failed', completedAt: NOW }),
    ];
    const m = computeMetrics(tasks, { now: NOW });
    expect(m.successRate).toBe(0.75);
  });

  it('populates 7-day trend with correct date keys', () => {
    const m = computeMetrics([], { now: NOW });
    expect(m.completionTrend7d).toHaveLength(7);
    // Check that dates are in order
    const dates = m.completionTrend7d.map(d => d.date);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] > dates[i - 1]).toBe(true);
    }
  });

  it('populates agent breakdown', () => {
    const tasks = [
      makeSampleCard({ agentId: 'nexus', status: 'done', runtimeMs: 10000, completedAt: NOW }),
      makeSampleCard({ agentId: 'nexus', status: 'running', startedAt: NOW }),
      makeSampleCard({ agentId: 'synth', status: 'failed', runtimeMs: 5000, completedAt: NOW }),
    ];
    const m = computeMetrics(tasks, { now: NOW });
    expect(m.agentBreakdown.length).toBeGreaterThanOrEqual(2);

    const nexus = m.agentBreakdown.find(a => a.agentId === 'nexus');
    expect(nexus).toBeDefined();
    expect(nexus!.done).toBe(1);
    expect(nexus!.running).toBe(1);
    expect(nexus!.avgRuntimeMs).toBe(10000);

    const synth = m.agentBreakdown.find(a => a.agentId === 'synth');
    expect(synth).toBeDefined();
    expect(synth!.failed).toBe(1);
  });

  it('includes stuck tasks with default threshold', () => {
    const tasks = [
      makeSampleCard({
        id: 'stuck-test',
        status: 'running',
        startedAt: NOW - 60 * 60000, // 1 hour, default threshold is 30 min
      }),
    ];
    const m = computeMetrics(tasks, { now: NOW });
    expect(m.stuckCount).toBe(1);
    expect(m.stuckTasks[0].id).toBe('stuck-test');
  });

  it('uses custom stuck timeout', () => {
    const tasks = [
      makeSampleCard({
        status: 'running',
        startedAt: NOW - 10 * 60000, // 10 min
      }),
    ];
    // 5 min timeout → stuck
    const m1 = computeMetrics(tasks, { now: NOW, stuckTimeoutMs: 5 * 60000 });
    expect(m1.stuckCount).toBe(1);

    // 15 min timeout → not stuck
    const m2 = computeMetrics(tasks, { now: NOW, stuckTimeoutMs: 15 * 60000 });
    expect(m2.stuckCount).toBe(0);
  });
});

// ─── GET /api/task-board/metrics endpoint ────────────────────────────────────

describe('GET /api/task-board/metrics', () => {
  it('returns 200 with metrics for empty board', async () => {
    seedTasks([]);
    const req = mockRequest({ url: '/api/task-board/metrics', method: 'GET' });
    const res = mockResponse();
    const deps = createDeps();

    await handleTaskBoard(req, res, deps);

    const body = parseJsonBody(res);
    expect(res.statusCode ?? 200).toBe(200);
    expect(body).toHaveProperty('total', 0);
    expect(body).toHaveProperty('throughput');
    expect(body).toHaveProperty('stuckTasks');
    expect(body).toHaveProperty('completionTrend7d');
    expect(body.completionTrend7d).toHaveLength(7);
  });

  it('returns metrics with task data', async () => {
    const now = Date.now();
    seedTasks([
      makeSampleCard({ status: 'done', completedAt: now - 3600000, runtimeMs: 5000 }),
      makeSampleCard({ status: 'running', startedAt: now - 3600000 * 2 }), // stuck (2h)
      makeSampleCard({ status: 'backlog' }),
    ]);

    const req = mockRequest({ url: '/api/task-board/metrics', method: 'GET' });
    const res = mockResponse();
    const deps = createDeps();

    await handleTaskBoard(req, res, deps);

    const body = parseJsonBody(res);
    expect(body.total).toBe(3);
    expect(body.statusCounts.done).toBe(1);
    expect(body.statusCounts.running).toBe(1);
    expect(body.statusCounts.backlog).toBe(1);
    expect(body.throughput.last24h).toBe(1);
    expect(body.avgRuntimeMs).toBe(5000);
    expect(body.stuckCount).toBe(1);
  });

  it('accepts stuckTimeoutMs query param', async () => {
    const now = Date.now();
    seedTasks([
      makeSampleCard({
        status: 'running',
        startedAt: now - 10 * 60000, // 10 min
      }),
    ]);

    // Default (30 min) → not stuck
    const req1 = mockRequest({ url: '/api/task-board/metrics', method: 'GET' });
    const res1 = mockResponse();
    await handleTaskBoard(req1, res1, createDeps());
    expect(parseJsonBody(res1).stuckCount).toBe(0);

    // Custom 5 min → stuck
    const req2 = mockRequest({ url: '/api/task-board/metrics?stuckTimeoutMs=300000', method: 'GET' });
    const res2 = mockResponse();
    await handleTaskBoard(req2, res2, createDeps());
    expect(parseJsonBody(res2).stuckCount).toBe(1);
  });

  it('clamps stuckTimeoutMs within safe bounds', async () => {
    seedTasks([]);
    // Test that extremely small timeout is clamped to 1000ms
    const req = mockRequest({ url: '/api/task-board/metrics?stuckTimeoutMs=100', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());
    const body = parseJsonBody(res);
    expect(body.stuckTimeoutMs).toBe(1000);
  });
});

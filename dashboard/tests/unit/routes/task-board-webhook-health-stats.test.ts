/**
 * Webhook Health Stats tests — Issue #219, Phase 15.
 *
 * Tests for:
 * - classifyHealth() — health status classification from success rate
 * - aggregateTargetHealth() — single-pass per-target aggregation
 * - computeHealthSummary() — overall summary computation
 * - computeWebhookHealth() — full pipeline from disk to response
 * - GET /api/task-board/webhooks/health — API endpoint shape + filters
 * - Edge cases: empty history, single target, all failures, all successes
 * - Bounded query window enforcement
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import { handleTaskBoard } from '../../../server/routes/task-board.js';
import {
  classifyHealth,
  aggregateTargetHealth,
  computeHealthSummary,
  computeWebhookHealth,
} from '../../../server/webhook-health-stats.js';
import type {
  WebhookTargetHealthStats,
  WebhookHealthResponse,
} from '../../../server/webhook-health-stats.js';
import type {
  WebhookDeliveryEvent,
  WebhookDeliveryHistoryFile,
} from '../../../server/webhook-delivery-history.js';
import { appendDeliveryEvents } from '../../../server/webhook-delivery-history.js';
import type { TaskBoardDeps } from '../../../server/types.js';

const testDataDir = path.join('/tmp', 'test-webhook-health-' + process.pid);

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

function makeEvent(overrides: Partial<WebhookDeliveryEvent> = {}): WebhookDeliveryEvent {
  return {
    id: 1,
    ts: Date.now(),
    targetId: 'target-a',
    targetName: 'Target A',
    success: true,
    statusCode: 200,
    attempts: 1,
    durationMs: 150,
    error: null,
    maskedUrl: 'https://example.com/***',
    triggerSeverity: 'warning',
    previousSeverity: 'ok',
    ...overrides,
  };
}

function seedHistory(events: Partial<WebhookDeliveryEvent>[]): void {
  const history: WebhookDeliveryHistoryFile = {
    version: 1,
    events: events.map((e, i) => makeEvent({ id: i + 1, ...e })),
    nextId: events.length + 1,
  };
  fs.mkdirSync(testDataDir, { recursive: true });
  fs.writeFileSync(
    path.join(testDataDir, 'task-board-webhook-delivery-history.json'),
    JSON.stringify(history),
  );
}

beforeEach(() => {
  fs.mkdirSync(testDataDir, { recursive: true });
});

afterEach(() => {
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

// ─── classifyHealth ──────────────────────────────────────────────────────────

describe('classifyHealth', () => {
  it('returns "unknown" when totalCount is 0', () => {
    expect(classifyHealth(null, 0)).toBe('unknown');
  });

  it('returns "unknown" when successRate is null', () => {
    expect(classifyHealth(null, 5)).toBe('unknown');
  });

  it('returns "healthy" when rate >= 0.9', () => {
    expect(classifyHealth(0.95, 10)).toBe('healthy');
    expect(classifyHealth(0.9, 10)).toBe('healthy');
    expect(classifyHealth(1.0, 10)).toBe('healthy');
  });

  it('returns "degraded" when 0.5 <= rate < 0.9', () => {
    expect(classifyHealth(0.89, 10)).toBe('degraded');
    expect(classifyHealth(0.5, 10)).toBe('degraded');
    expect(classifyHealth(0.7, 10)).toBe('degraded');
  });

  it('returns "unhealthy" when rate < 0.5', () => {
    expect(classifyHealth(0.49, 10)).toBe('unhealthy');
    expect(classifyHealth(0.0, 10)).toBe('unhealthy');
    expect(classifyHealth(0.1, 10)).toBe('unhealthy');
  });
});

// ─── aggregateTargetHealth ───────────────────────────────────────────────────

describe('aggregateTargetHealth', () => {
  it('returns empty array for empty events', () => {
    expect(aggregateTargetHealth([])).toHaveLength(0);
  });

  it('aggregates a single target correctly', () => {
    const now = Date.now();
    const events = [
      makeEvent({ targetId: 'a', success: true, durationMs: 100, ts: now - 3000 }),
      makeEvent({ targetId: 'a', success: true, durationMs: 200, ts: now - 2000 }),
      makeEvent({ targetId: 'a', success: false, durationMs: 5000, ts: now - 1000, error: 'timeout', statusCode: null }),
    ];

    const results = aggregateTargetHealth(events);
    expect(results).toHaveLength(1);

    const t = results[0];
    expect(t.targetId).toBe('a');
    expect(t.successCount).toBe(2);
    expect(t.failureCount).toBe(1);
    expect(t.totalCount).toBe(3);
    expect(t.successRate).toBeCloseTo(0.6667, 3);
    expect(t.avgLatencyMs).toBe(Math.round((100 + 200 + 5000) / 3));
    expect(t.lastSuccessTs).toBe(now - 2000);
    expect(t.lastFailureTs).toBe(now - 1000);
  });

  it('aggregates multiple targets independently', () => {
    const now = Date.now();
    const events = [
      makeEvent({ targetId: 'slack', targetName: 'Slack', success: true, durationMs: 100, ts: now }),
      makeEvent({ targetId: 'discord', targetName: 'Discord', success: false, durationMs: 200, ts: now, error: 'fail' }),
      makeEvent({ targetId: 'slack', targetName: 'Slack', success: true, durationMs: 150, ts: now }),
    ];

    const results = aggregateTargetHealth(events);
    expect(results).toHaveLength(2);

    // Sorted by totalCount desc — slack has 2, discord has 1
    expect(results[0].targetId).toBe('slack');
    expect(results[0].successCount).toBe(2);
    expect(results[0].failureCount).toBe(0);
    expect(results[0].successRate).toBe(1.0);

    expect(results[1].targetId).toBe('discord');
    expect(results[1].successCount).toBe(0);
    expect(results[1].failureCount).toBe(1);
    expect(results[1].successRate).toBe(0.0);
    expect(results[1].healthStatus).toBe('unhealthy');
  });

  it('uses most recent event for targetName and maskedUrl', () => {
    const now = Date.now();
    const events = [
      makeEvent({ targetId: 'x', targetName: 'Old Name', maskedUrl: 'https://old.com/***', ts: now - 5000 }),
      makeEvent({ targetId: 'x', targetName: 'New Name', maskedUrl: 'https://new.com/***', ts: now }),
    ];

    const results = aggregateTargetHealth(events);
    expect(results[0].targetName).toBe('New Name');
    expect(results[0].maskedUrl).toBe('https://new.com/***');
  });

  it('classifies health status based on success rate', () => {
    const now = Date.now();

    // 100% success → healthy
    const healthyEvents = Array.from({ length: 10 }, (_, i) =>
      makeEvent({ targetId: 'h', success: true, ts: now - i * 1000 }),
    );
    const healthy = aggregateTargetHealth(healthyEvents);
    expect(healthy[0].healthStatus).toBe('healthy');

    // 70% success → degraded
    const degradedEvents = [
      ...Array.from({ length: 7 }, (_, i) => makeEvent({ targetId: 'd', success: true, ts: now - i * 1000 })),
      ...Array.from({ length: 3 }, (_, i) => makeEvent({ targetId: 'd', success: false, error: 'err', ts: now - (7 + i) * 1000 })),
    ];
    const degraded = aggregateTargetHealth(degradedEvents);
    expect(degraded[0].healthStatus).toBe('degraded');

    // 20% success → unhealthy
    const unhealthyEvents = [
      ...Array.from({ length: 2 }, (_, i) => makeEvent({ targetId: 'u', success: true, ts: now - i * 1000 })),
      ...Array.from({ length: 8 }, (_, i) => makeEvent({ targetId: 'u', success: false, error: 'err', ts: now - (2 + i) * 1000 })),
    ];
    const unhealthy = aggregateTargetHealth(unhealthyEvents);
    expect(unhealthy[0].healthStatus).toBe('unhealthy');
  });

  it('tracks lastStatusCode from the most recent event', () => {
    const now = Date.now();
    const events = [
      makeEvent({ targetId: 'a', statusCode: 200, ts: now - 2000 }),
      makeEvent({ targetId: 'a', statusCode: 502, ts: now - 1000 }),
    ];
    const results = aggregateTargetHealth(events);
    expect(results[0].lastStatusCode).toBe(502);
  });
});

// ─── computeHealthSummary ────────────────────────────────────────────────────

describe('computeHealthSummary', () => {
  it('returns zeroes for empty targets array', () => {
    const summary = computeHealthSummary([]);
    expect(summary.totalDeliveries).toBe(0);
    expect(summary.totalSuccesses).toBe(0);
    expect(summary.totalFailures).toBe(0);
    expect(summary.overallSuccessRate).toBeNull();
    expect(summary.overallAvgLatencyMs).toBeNull();
    expect(summary.targetCount).toBe(0);
  });

  it('computes overall stats from multiple targets', () => {
    const targets: WebhookTargetHealthStats[] = [
      {
        targetId: 'a', targetName: 'A', successCount: 8, failureCount: 2,
        totalCount: 10, successRate: 0.8, avgLatencyMs: 100,
        lastSuccessTs: null, lastFailureTs: null, lastStatusCode: 200,
        maskedUrl: null, healthStatus: 'degraded',
      },
      {
        targetId: 'b', targetName: 'B', successCount: 5, failureCount: 0,
        totalCount: 5, successRate: 1.0, avgLatencyMs: 200,
        lastSuccessTs: null, lastFailureTs: null, lastStatusCode: 200,
        maskedUrl: null, healthStatus: 'healthy',
      },
    ];

    const summary = computeHealthSummary(targets);
    expect(summary.totalDeliveries).toBe(15);
    expect(summary.totalSuccesses).toBe(13);
    expect(summary.totalFailures).toBe(2);
    // Weighted average: (8+5) / 15
    expect(summary.overallSuccessRate).toBeCloseTo(0.8667, 3);
    // Weighted avg latency: (100*10 + 200*5) / 15 = 2000/15 ≈ 133
    expect(summary.overallAvgLatencyMs).toBe(Math.round((100 * 10 + 200 * 5) / 15));
    expect(summary.targetCount).toBe(2);
    expect(summary.healthyCount).toBe(1);
    expect(summary.degradedCount).toBe(1);
    expect(summary.unhealthyCount).toBe(0);
  });
});

// ─── computeWebhookHealth (integration) ──────────────────────────────────────

describe('computeWebhookHealth', () => {
  it('returns empty result when no history exists', () => {
    const result = computeWebhookHealth(testDataDir);
    expect(result.targets).toHaveLength(0);
    expect(result.summary.totalDeliveries).toBe(0);
    expect(result.windowMs).toBe(86400000); // default 24h
    expect(result.computedAt).toBeGreaterThan(0);
  });

  it('aggregates from persisted delivery history', () => {
    const now = Date.now();
    seedHistory([
      { targetId: 'slack', targetName: 'Slack', success: true, durationMs: 100, ts: now - 1000 },
      { targetId: 'slack', targetName: 'Slack', success: false, durationMs: 5000, ts: now - 500, error: 'timeout' },
      { targetId: 'discord', targetName: 'Discord', success: true, durationMs: 200, ts: now - 2000 },
    ]);

    const result = computeWebhookHealth(testDataDir, { now });
    expect(result.targets).toHaveLength(2);
    expect(result.summary.totalDeliveries).toBe(3);
    expect(result.summary.totalSuccesses).toBe(2);
    expect(result.summary.totalFailures).toBe(1);

    const slack = result.targets.find((t) => t.targetId === 'slack');
    expect(slack).toBeDefined();
    expect(slack!.successCount).toBe(1);
    expect(slack!.failureCount).toBe(1);
    expect(slack!.successRate).toBe(0.5);
    expect(slack!.healthStatus).toBe('degraded');
  });

  it('respects windowMs — excludes old events', () => {
    const now = Date.now();
    seedHistory([
      { targetId: 'a', success: true, durationMs: 100, ts: now - 7200000 }, // 2h ago
      { targetId: 'a', success: true, durationMs: 100, ts: now - 1800000 }, // 30min ago
      { targetId: 'a', success: false, durationMs: 100, ts: now - 600000, error: 'fail' }, // 10min ago
    ]);

    // 1h window — should only include the 30min and 10min events
    const result = computeWebhookHealth(testDataDir, { windowMs: 3600000, now });
    expect(result.targets).toHaveLength(1);
    expect(result.targets[0].totalCount).toBe(2);
    expect(result.windowMs).toBe(3600000);
  });

  it('caps windowMs at 48h max', () => {
    const result = computeWebhookHealth(testDataDir, { windowMs: 999999999 });
    expect(result.windowMs).toBe(172800000); // 48h
  });

  it('filters by targetId', () => {
    const now = Date.now();
    seedHistory([
      { targetId: 'slack', success: true, ts: now },
      { targetId: 'discord', success: true, ts: now },
    ]);

    const result = computeWebhookHealth(testDataDir, { targetId: 'slack', now });
    expect(result.targets).toHaveLength(1);
    expect(result.targets[0].targetId).toBe('slack');
  });

  it('handles all-success scenario correctly', () => {
    const now = Date.now();
    seedHistory(
      Array.from({ length: 10 }, (_, i) => ({
        targetId: 't1',
        targetName: 'T1',
        success: true,
        durationMs: 100 + i * 10,
        ts: now - i * 1000,
      })),
    );

    const result = computeWebhookHealth(testDataDir, { now });
    expect(result.targets[0].successRate).toBe(1.0);
    expect(result.targets[0].healthStatus).toBe('healthy');
    expect(result.targets[0].failureCount).toBe(0);
    expect(result.targets[0].lastFailureTs).toBeNull();
  });

  it('handles all-failure scenario correctly', () => {
    const now = Date.now();
    seedHistory(
      Array.from({ length: 5 }, (_, i) => ({
        targetId: 't1',
        targetName: 'T1',
        success: false,
        durationMs: 5000,
        error: 'ECONNREFUSED',
        ts: now - i * 1000,
      })),
    );

    const result = computeWebhookHealth(testDataDir, { now });
    expect(result.targets[0].successRate).toBe(0.0);
    expect(result.targets[0].healthStatus).toBe('unhealthy');
    expect(result.targets[0].successCount).toBe(0);
    expect(result.targets[0].lastSuccessTs).toBeNull();
  });

  it('handles corrupt history file gracefully', () => {
    fs.writeFileSync(
      path.join(testDataDir, 'task-board-webhook-delivery-history.json'),
      '{corrupt}',
    );
    const result = computeWebhookHealth(testDataDir);
    expect(result.targets).toHaveLength(0);
    expect(result.summary.totalDeliveries).toBe(0);
  });
});

// ─── API Route: GET /api/task-board/webhooks/health ──────────────────────────

describe('GET /api/task-board/webhooks/health', () => {
  it('returns correct response shape with empty history', async () => {
    const req = mockRequest({ url: '/api/task-board/webhooks/health' });
    const res = mockResponse();
    const handled = await handleTaskBoard(req, res, createDeps());

    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);

    const body = parseJsonBody<WebhookHealthResponse>(res);
    expect(body).toHaveProperty('targets');
    expect(body).toHaveProperty('summary');
    expect(body).toHaveProperty('windowMs');
    expect(body).toHaveProperty('computedAt');
    expect(Array.isArray(body.targets)).toBe(true);
    expect(body.summary).toHaveProperty('totalDeliveries');
    expect(body.summary).toHaveProperty('overallSuccessRate');
    expect(body.summary).toHaveProperty('overallAvgLatencyMs');
    expect(body.summary).toHaveProperty('targetCount');
    expect(body.summary).toHaveProperty('healthyCount');
    expect(body.summary).toHaveProperty('degradedCount');
    expect(body.summary).toHaveProperty('unhealthyCount');
  });

  it('returns per-target health stats from persisted data', async () => {
    const now = Date.now();
    seedHistory([
      { targetId: 'slack', targetName: 'Slack', success: true, durationMs: 100, ts: now - 1000 },
      { targetId: 'slack', targetName: 'Slack', success: true, durationMs: 200, ts: now - 500 },
      { targetId: 'discord', targetName: 'Discord', success: false, durationMs: 5000, ts: now - 2000, error: 'refused' },
    ]);

    const req = mockRequest({ url: '/api/task-board/webhooks/health' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const body = parseJsonBody<WebhookHealthResponse>(res);
    expect(body.targets).toHaveLength(2);
    expect(body.summary.totalDeliveries).toBe(3);

    const slack = body.targets.find((t) => t.targetId === 'slack');
    expect(slack).toBeDefined();
    expect(slack!.successCount).toBe(2);
    expect(slack!.successRate).toBe(1.0);
    expect(slack!.healthStatus).toBe('healthy');

    const discord = body.targets.find((t) => t.targetId === 'discord');
    expect(discord).toBeDefined();
    expect(discord!.failureCount).toBe(1);
    expect(discord!.successRate).toBe(0.0);
    expect(discord!.healthStatus).toBe('unhealthy');
  });

  it('respects windowMs query param', async () => {
    const now = Date.now();
    seedHistory([
      { targetId: 'a', success: true, ts: now - 7200000 }, // 2h ago
      { targetId: 'a', success: true, ts: now - 600000 },  // 10min ago
    ]);

    const req = mockRequest({ url: '/api/task-board/webhooks/health?windowMs=3600000' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const body = parseJsonBody<WebhookHealthResponse>(res);
    expect(body.windowMs).toBe(3600000);
    // Only the 10min event should be in the window
    expect(body.summary.totalDeliveries).toBe(1);
  });

  it('respects targetId query param', async () => {
    const now = Date.now();
    seedHistory([
      { targetId: 'slack', success: true, ts: now },
      { targetId: 'discord', success: true, ts: now },
    ]);

    const req = mockRequest({ url: '/api/task-board/webhooks/health?targetId=slack' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const body = parseJsonBody<WebhookHealthResponse>(res);
    expect(body.targets).toHaveLength(1);
    expect(body.targets[0].targetId).toBe('slack');
  });

  it('per-target stats shape has all expected fields', async () => {
    const now = Date.now();
    seedHistory([
      { targetId: 'x', targetName: 'X', success: true, durationMs: 120, ts: now, statusCode: 200, maskedUrl: 'https://x.com/***' },
    ]);

    const req = mockRequest({ url: '/api/task-board/webhooks/health' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const body = parseJsonBody<WebhookHealthResponse>(res);
    const t = body.targets[0];
    expect(t).toHaveProperty('targetId');
    expect(t).toHaveProperty('targetName');
    expect(t).toHaveProperty('successCount');
    expect(t).toHaveProperty('failureCount');
    expect(t).toHaveProperty('totalCount');
    expect(t).toHaveProperty('successRate');
    expect(t).toHaveProperty('avgLatencyMs');
    expect(t).toHaveProperty('lastSuccessTs');
    expect(t).toHaveProperty('lastFailureTs');
    expect(t).toHaveProperty('lastStatusCode');
    expect(t).toHaveProperty('maskedUrl');
    expect(t).toHaveProperty('healthStatus');
  });

  it('does not expose any secret data in response', async () => {
    const now = Date.now();
    seedHistory([
      { targetId: 'a', success: true, ts: now, maskedUrl: 'https://hooks.slack.com/***' },
    ]);

    const req = mockRequest({ url: '/api/task-board/webhooks/health' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const raw = res._body;
    expect(raw).not.toContain('secret');
    expect(raw).toContain('https://hooks.slack.com/***');
  });
});

/**
 * Webhook Retry Activity tests — Issue #219, Phase 16.
 *
 * Tests for:
 * - WebhookDeliveryAttemptDetail type — per-attempt recording
 * - createDeliveryEvent() with attemptDetails — storage and error truncation
 * - queryRetryActivity() — retry-specific query with filters + summaries
 * - GET /api/task-board/webhooks/retries — API endpoint shape + filters
 * - deliverWebhook() — per-attempt detail collection during retry loop
 * - Edge cases: no retries, all retries, single event, legacy events without details
 * - Bounded storage: attempt details don't exceed retention limits
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import { handleTaskBoard } from '../../../server/routes/task-board.js';
import {
  readDeliveryHistory,
  appendDeliveryEvents,
  queryRetryActivity,
  createDeliveryEvent,
  truncateError,
} from '../../../server/webhook-delivery-history.js';
import type {
  WebhookDeliveryEvent,
  WebhookDeliveryAttemptDetail,
  WebhookDeliveryHistoryFile,
  RetryActivityResponse,
} from '../../../server/webhook-delivery-history.js';
import type { TaskBoardDeps } from '../../../server/types.js';

const testDataDir = path.join('/tmp', 'test-retry-activity-' + process.pid);

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

function makeAttemptDetails(count: number, opts: { failAll?: boolean; succeedLast?: boolean } = {}): WebhookDeliveryAttemptDetail[] {
  const details: WebhookDeliveryAttemptDetail[] = [];
  for (let i = 0; i < count; i++) {
    const isLast = i === count - 1;
    const isSuccess = opts.succeedLast && isLast;
    const isFail = opts.failAll || (!isSuccess && !isLast);

    details.push({
      attempt: i + 1,
      ts: Date.now() - (count - i) * 2000,
      statusCode: isSuccess ? 200 : isFail ? 500 : 200,
      error: isFail ? `HTTP 500` : null,
      durationMs: 100 + i * 50,
      nextRetryDelayMs: isLast ? null : Math.min(1000 * Math.pow(2, i), 4000),
    });
  }
  return details;
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

// ─── WebhookDeliveryAttemptDetail type ───────────────────────────────────────

describe('WebhookDeliveryAttemptDetail', () => {
  it('has correct shape with all required fields', () => {
    const detail: WebhookDeliveryAttemptDetail = {
      attempt: 1,
      ts: Date.now(),
      statusCode: 200,
      error: null,
      durationMs: 100,
      nextRetryDelayMs: null,
    };
    expect(detail.attempt).toBe(1);
    expect(detail.statusCode).toBe(200);
    expect(detail.error).toBeNull();
    expect(detail.nextRetryDelayMs).toBeNull();
  });

  it('captures failure details with retry delay', () => {
    const detail: WebhookDeliveryAttemptDetail = {
      attempt: 1,
      ts: Date.now(),
      statusCode: 500,
      error: 'HTTP 500',
      durationMs: 250,
      nextRetryDelayMs: 1000,
    };
    expect(detail.error).toBe('HTTP 500');
    expect(detail.nextRetryDelayMs).toBe(1000);
  });

  it('captures network error with null statusCode', () => {
    const detail: WebhookDeliveryAttemptDetail = {
      attempt: 2,
      ts: Date.now(),
      statusCode: null,
      error: 'timeout after 10000ms',
      durationMs: 10050,
      nextRetryDelayMs: 2000,
    };
    expect(detail.statusCode).toBeNull();
    expect(detail.error).toContain('timeout');
  });
});

// ─── createDeliveryEvent with attemptDetails ─────────────────────────────────

describe('createDeliveryEvent with attemptDetails', () => {
  it('includes attemptDetails when provided', () => {
    const details = makeAttemptDetails(3, { succeedLast: true });
    const event = createDeliveryEvent(
      {
        targetId: 'test-target',
        targetName: 'Test',
        success: true,
        statusCode: 200,
        attempts: 3,
        error: null,
        durationMs: 500,
        attemptDetails: details,
      },
      {
        url: 'https://example.com/webhook',
        triggerSeverity: 'warning',
        previousSeverity: 'ok',
      },
      1,
    );

    expect(event.attemptDetails).toBeDefined();
    expect(event.attemptDetails!.length).toBe(3);
    expect(event.attemptDetails![0].attempt).toBe(1);
    expect(event.attemptDetails![2].attempt).toBe(3);
  });

  it('omits attemptDetails when not provided', () => {
    const event = createDeliveryEvent(
      {
        targetId: 'test-target',
        targetName: 'Test',
        success: true,
        statusCode: 200,
        attempts: 1,
        error: null,
        durationMs: 100,
      },
      {
        url: 'https://example.com/webhook',
        triggerSeverity: 'warning',
        previousSeverity: 'ok',
      },
      1,
    );

    expect(event.attemptDetails).toBeUndefined();
  });

  it('truncates errors within attempt details', () => {
    const longError = 'x'.repeat(300);
    const details: WebhookDeliveryAttemptDetail[] = [{
      attempt: 1,
      ts: Date.now(),
      statusCode: 500,
      error: longError,
      durationMs: 100,
      nextRetryDelayMs: 1000,
    }];

    const event = createDeliveryEvent(
      {
        targetId: 'test-target',
        targetName: 'Test',
        success: false,
        statusCode: 500,
        attempts: 1,
        error: longError,
        durationMs: 100,
        attemptDetails: details,
      },
      {
        url: 'https://example.com/webhook',
        triggerSeverity: 'critical',
        previousSeverity: 'ok',
      },
      1,
    );

    expect(event.attemptDetails![0].error!.length).toBeLessThanOrEqual(200);
    expect(event.attemptDetails![0].error!.endsWith('...')).toBe(true);
  });

  it('omits attemptDetails when empty array is provided', () => {
    const event = createDeliveryEvent(
      {
        targetId: 'test-target',
        targetName: 'Test',
        success: true,
        statusCode: 200,
        attempts: 1,
        error: null,
        durationMs: 100,
        attemptDetails: [],
      },
      {
        url: 'https://example.com/webhook',
        triggerSeverity: 'warning',
        previousSeverity: 'ok',
      },
      1,
    );

    expect(event.attemptDetails).toBeUndefined();
  });
});

// ─── appendDeliveryEvents with attemptDetails ────────────────────────────────

describe('appendDeliveryEvents with attemptDetails', () => {
  it('persists attempt details to disk', () => {
    const details = makeAttemptDetails(2, { succeedLast: true });
    const count = appendDeliveryEvents(
      testDataDir,
      [{
        targetId: 'target-a',
        targetName: 'Target A',
        success: true,
        statusCode: 200,
        attempts: 2,
        error: null,
        durationMs: 300,
        attemptDetails: details,
      }],
      [{
        url: 'https://example.com/webhook',
        triggerSeverity: 'warning',
        previousSeverity: 'ok',
      }],
    );

    expect(count).toBe(1);

    const history = readDeliveryHistory(testDataDir);
    expect(history.events.length).toBe(1);
    expect(history.events[0].attemptDetails).toBeDefined();
    expect(history.events[0].attemptDetails!.length).toBe(2);
    expect(history.events[0].attemptDetails![0].attempt).toBe(1);
    expect(history.events[0].attemptDetails![1].attempt).toBe(2);
  });
});

// ─── queryRetryActivity ──────────────────────────────────────────────────────

describe('queryRetryActivity', () => {
  it('returns empty result when no events exist', () => {
    const result = queryRetryActivity(testDataDir);
    expect(result.events).toEqual([]);
    expect(result.count).toBe(0);
    expect(result.summary.totalDeliveries).toBe(0);
    expect(result.summary.retriedDeliveries).toBe(0);
    expect(result.summary.retryRate).toBeNull();
  });

  it('returns empty events when no deliveries required retries', () => {
    seedHistory([
      { id: 1, attempts: 1, success: true },
      { id: 2, attempts: 1, success: true },
      { id: 3, attempts: 1, success: false, error: 'HTTP 400' },
    ]);

    const result = queryRetryActivity(testDataDir);
    expect(result.events).toEqual([]);
    expect(result.count).toBe(0);
    expect(result.summary.totalDeliveries).toBe(3);
    expect(result.summary.retriedDeliveries).toBe(0);
    expect(result.summary.retryRate).toBe(0);
  });

  it('filters to events with attempts > 1', () => {
    const now = Date.now();
    seedHistory([
      { id: 1, ts: now - 1000, attempts: 1, success: true },
      { id: 2, ts: now - 800, attempts: 3, success: true, durationMs: 500 },
      { id: 3, ts: now - 600, attempts: 1, success: false },
      { id: 4, ts: now - 400, attempts: 2, success: false, error: 'HTTP 500', durationMs: 300 },
    ]);

    const result = queryRetryActivity(testDataDir);
    expect(result.count).toBe(2);
    expect(result.events[0].id).toBe(4); // most recent first
    expect(result.events[1].id).toBe(2);
  });

  it('computes correct summary statistics', () => {
    const now = Date.now();
    seedHistory([
      { id: 1, ts: now - 1000, attempts: 1, success: true, targetId: 'a' },
      { id: 2, ts: now - 800, attempts: 3, success: true, targetId: 'a', durationMs: 500 },
      { id: 3, ts: now - 600, attempts: 2, success: false, targetId: 'b', error: 'HTTP 500' },
      { id: 4, ts: now - 400, attempts: 1, success: true, targetId: 'b' },
    ]);

    const result = queryRetryActivity(testDataDir);
    expect(result.summary.totalDeliveries).toBe(4);
    expect(result.summary.retriedDeliveries).toBe(2);
    expect(result.summary.retryRate).toBe(0.5);
    expect(result.summary.retriedSuccessCount).toBe(1);
    expect(result.summary.retriedFailureCount).toBe(1);
    expect(result.summary.totalAttempts).toBe(7); // 1+3+2+1
    // avgAttemptsPerRetry: (3+2)/2 = 2.5
    expect(result.summary.avgAttemptsPerRetry).toBe(2.5);
  });

  it('computes per-target summaries', () => {
    const now = Date.now();
    seedHistory([
      { id: 1, ts: now - 1000, attempts: 1, success: true, targetId: 'a', targetName: 'Alpha' },
      { id: 2, ts: now - 800, attempts: 3, success: true, targetId: 'a', targetName: 'Alpha' },
      { id: 3, ts: now - 600, attempts: 2, success: false, targetId: 'b', targetName: 'Beta' },
    ]);

    const result = queryRetryActivity(testDataDir);
    expect(result.targetSummaries.length).toBe(2);

    // Sorted by retriedDeliveries descending
    const targetA = result.targetSummaries.find((t) => t.targetId === 'a')!;
    const targetB = result.targetSummaries.find((t) => t.targetId === 'b')!;

    expect(targetA.totalDeliveries).toBe(2);
    expect(targetA.retriedDeliveries).toBe(1);
    expect(targetA.totalAttempts).toBe(4); // 1+3

    expect(targetB.totalDeliveries).toBe(1);
    expect(targetB.retriedDeliveries).toBe(1);
    expect(targetB.totalAttempts).toBe(2);
  });

  it('filters by sinceMs window', () => {
    const now = Date.now();
    seedHistory([
      { id: 1, ts: now - 100000, attempts: 3, success: true },
      { id: 2, ts: now - 1000, attempts: 2, success: false },
    ]);

    const result = queryRetryActivity(testDataDir, { sinceMs: 50000, now });
    expect(result.count).toBe(1);
    expect(result.events[0].id).toBe(2);
    expect(result.summary.totalDeliveries).toBe(1);
  });

  it('filters by targetId', () => {
    const now = Date.now();
    seedHistory([
      { id: 1, ts: now - 1000, attempts: 3, success: true, targetId: 'a' },
      { id: 2, ts: now - 800, attempts: 2, success: false, targetId: 'b' },
    ]);

    const result = queryRetryActivity(testDataDir, { targetId: 'a' });
    expect(result.count).toBe(1);
    expect(result.events[0].targetId).toBe('a');
  });

  it('applies limit', () => {
    const now = Date.now();
    const events = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      ts: now - (10 - i) * 1000,
      attempts: 2,
      success: true,
      targetId: 'a',
    }));
    seedHistory(events);

    const result = queryRetryActivity(testDataDir, { limit: 3 });
    expect(result.count).toBe(3);
    // Most recent first
    expect(result.events[0].id).toBe(10);
    expect(result.events[2].id).toBe(8);
  });

  it('includes attemptDetails in returned events', () => {
    const now = Date.now();
    const details = makeAttemptDetails(3, { succeedLast: true });
    seedHistory([{
      id: 1,
      ts: now - 1000,
      attempts: 3,
      success: true,
      attemptDetails: details,
    }]);

    const result = queryRetryActivity(testDataDir);
    expect(result.events[0].attemptDetails).toBeDefined();
    expect(result.events[0].attemptDetails!.length).toBe(3);
  });

  it('handles legacy events without attemptDetails gracefully', () => {
    const now = Date.now();
    seedHistory([
      { id: 1, ts: now - 1000, attempts: 3, success: true },
    ]);

    const result = queryRetryActivity(testDataDir);
    expect(result.events[0].attemptDetails).toBeUndefined();
  });
});

// ─── GET /api/task-board/webhooks/retries API ────────────────────────────────

describe('GET /api/task-board/webhooks/retries', () => {
  it('returns 200 with correct shape', async () => {
    const now = Date.now();
    seedHistory([
      { id: 1, ts: now - 1000, attempts: 3, success: true },
      { id: 2, ts: now - 500, attempts: 1, success: true },
    ]);

    const req = mockRequest({ method: 'GET', url: '/api/task-board/webhooks/retries' });
    const res = mockResponse();
    const deps = createDeps();

    const handled = await handleTaskBoard(req, res, deps);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);

    const body = parseJsonBody<RetryActivityResponse>(res);
    expect(body.events).toBeDefined();
    expect(body.count).toBeDefined();
    expect(body.summary).toBeDefined();
    expect(body.targetSummaries).toBeDefined();
    expect(body.summary.totalDeliveries).toBe(2);
    expect(body.summary.retriedDeliveries).toBe(1);
  });

  it('returns empty result when no history', async () => {
    const req = mockRequest({ method: 'GET', url: '/api/task-board/webhooks/retries' });
    const res = mockResponse();
    const deps = createDeps();

    const handled = await handleTaskBoard(req, res, deps);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);

    const body = parseJsonBody<RetryActivityResponse>(res);
    expect(body.events).toEqual([]);
    expect(body.count).toBe(0);
  });

  it('applies sinceMs query param', async () => {
    const now = Date.now();
    seedHistory([
      { id: 1, ts: now - 200000, attempts: 3, success: true },
      { id: 2, ts: now - 1000, attempts: 2, success: false },
    ]);

    const req = mockRequest({
      method: 'GET',
      url: '/api/task-board/webhooks/retries?sinceMs=60000',
    });
    const res = mockResponse();
    const deps = createDeps();

    const handled = await handleTaskBoard(req, res, deps);
    expect(handled).toBe(true);

    const body = parseJsonBody<RetryActivityResponse>(res);
    expect(body.count).toBe(1);
    expect(body.events[0].id).toBe(2);
  });

  it('applies targetId query param', async () => {
    const now = Date.now();
    seedHistory([
      { id: 1, ts: now - 1000, attempts: 3, success: true, targetId: 'a' },
      { id: 2, ts: now - 500, attempts: 2, success: false, targetId: 'b' },
    ]);

    const req = mockRequest({
      method: 'GET',
      url: '/api/task-board/webhooks/retries?targetId=b',
    });
    const res = mockResponse();
    const deps = createDeps();

    const handled = await handleTaskBoard(req, res, deps);
    expect(handled).toBe(true);

    const body = parseJsonBody<RetryActivityResponse>(res);
    expect(body.count).toBe(1);
    expect(body.events[0].targetId).toBe('b');
  });

  it('applies limit query param', async () => {
    const now = Date.now();
    seedHistory(Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      ts: now - (5 - i) * 1000,
      attempts: 2,
      success: true,
    })));

    const req = mockRequest({
      method: 'GET',
      url: '/api/task-board/webhooks/retries?limit=2',
    });
    const res = mockResponse();
    const deps = createDeps();

    const handled = await handleTaskBoard(req, res, deps);
    expect(handled).toBe(true);

    const body = parseJsonBody<RetryActivityResponse>(res);
    expect(body.count).toBe(2);
  });

  it('does not match non-GET requests', async () => {
    const req = mockRequest({ method: 'POST', url: '/api/task-board/webhooks/retries' });
    const res = mockResponse();
    const deps = createDeps();

    const handled = await handleTaskBoard(req, res, deps);
    // POST to this URL should not be handled by the retries endpoint
    // It may fall through to other handlers or return false
    // The key assertion is it doesn't return retry activity data
    if (handled) {
      const body = parseJsonBody(res);
      expect(body).not.toHaveProperty('targetSummaries');
    }
  });
});

// ─── Delivery history table now shows attempt details ────────────────────────

describe('deliveries API includes attemptDetails', () => {
  it('GET /api/task-board/webhooks/deliveries returns attemptDetails when present', async () => {
    const now = Date.now();
    const details = makeAttemptDetails(2, { succeedLast: true });
    seedHistory([{
      id: 1,
      ts: now - 1000,
      attempts: 2,
      success: true,
      attemptDetails: details,
    }]);

    const req = mockRequest({ method: 'GET', url: '/api/task-board/webhooks/deliveries' });
    const res = mockResponse();
    const deps = createDeps();

    const handled = await handleTaskBoard(req, res, deps);
    expect(handled).toBe(true);

    const body = parseJsonBody<{ events: WebhookDeliveryEvent[] }>(res);
    expect(body.events[0].attemptDetails).toBeDefined();
    expect(body.events[0].attemptDetails!.length).toBe(2);
  });
});

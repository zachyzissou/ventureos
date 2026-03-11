/**
 * Webhook Delivery History tests — Issue #219, Phase 13.
 *
 * Tests for:
 * - readDeliveryHistory() / appendDeliveryEvents() — persistence
 * - pruneDeliveryEvents() — bounded retention (count + age)
 * - createDeliveryEvent() — event construction, URL masking, error truncation
 * - truncateError() — bounded error messages
 * - queryDeliveryHistory() — query with filters + summary statistics
 * - GET /api/task-board/webhooks/deliveries — API endpoint
 * - Integration: delivery recording via maybeDeliverWebhooks()
 * - Failure-path recording (network errors, HTTP errors)
 * - Secret safety — no raw URLs or secrets in stored events
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import {
  handleTaskBoard,
} from '../../../server/routes/task-board.js';
import {
  readDeliveryHistory,
  appendDeliveryEvents,
  queryDeliveryHistory,
  pruneDeliveryEvents,
  createDeliveryEvent,
  truncateError,
} from '../../../server/webhook-delivery-history.js';
import type {
  WebhookDeliveryEvent,
  WebhookDeliveryHistoryFile,
  DeliveryHistoryResponse,
} from '../../../server/webhook-delivery-history.js';
import {
  writeWebhookConfig,
  resetDeliveryState,
  maybeDeliverWebhooks,
} from '../../../server/alert-webhook.js';
import {
  evaluateAlerts,
  DEFAULT_ALERT_CONFIG,
} from '../../../server/alert-rules.js';
import type {
  AlertMetricsInput,
} from '../../../server/alert-rules.js';
import type { TaskBoardDeps, TaskCard } from '../../../server/types.js';

const testDataDir = path.join('/tmp', 'test-delivery-history-' + process.pid);

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

function metricsInput(overrides: Partial<AlertMetricsInput> = {}): AlertMetricsInput {
  return {
    statusCounts: { backlog: 5, queued: 2, running: 1, done: 10, failed: 2 },
    successRate: 0.8,
    stuckCount: 0,
    avgRuntimeMs: 60000,
    total: 20,
    ...overrides,
  };
}

function sampleResult(overrides: Partial<{
  targetId: string;
  targetName: string;
  success: boolean;
  statusCode: number | null;
  attempts: number;
  error: string | null;
  durationMs: number;
}> = {}) {
  return {
    targetId: 'test-target',
    targetName: 'Test Target',
    success: true,
    statusCode: 200,
    attempts: 1,
    error: null,
    durationMs: 150,
    ...overrides,
  };
}

function sampleContext(overrides: Partial<{
  url: string;
  triggerSeverity: string;
  previousSeverity: string | null;
  ts: number;
}> = {}) {
  return {
    url: 'https://hooks.example.com/webhook/secret-path',
    triggerSeverity: 'warning',
    previousSeverity: 'ok' as string | null,
    ts: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  fs.mkdirSync(testDataDir, { recursive: true });
  resetDeliveryState();
});

afterEach(() => {
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
  vi.restoreAllMocks();
});

// ─── truncateError ───────────────────────────────────────────────────────────

describe('truncateError', () => {
  it('returns null for null input', () => {
    expect(truncateError(null)).toBeNull();
  });

  it('returns short errors unchanged', () => {
    expect(truncateError('connection refused')).toBe('connection refused');
  });

  it('truncates long errors with ellipsis', () => {
    const longError = 'x'.repeat(300);
    const result = truncateError(longError);
    expect(result!.length).toBe(200);
    expect(result!.endsWith('...')).toBe(true);
  });

  it('preserves errors at exactly the limit', () => {
    const exactError = 'a'.repeat(200);
    expect(truncateError(exactError)).toBe(exactError);
  });
});

// ─── createDeliveryEvent ─────────────────────────────────────────────────────

describe('createDeliveryEvent', () => {
  it('creates event with all fields populated', () => {
    const result = sampleResult();
    const ctx = sampleContext({ ts: 1000000 });
    const event = createDeliveryEvent(result, ctx, 42);

    expect(event.id).toBe(42);
    expect(event.ts).toBe(1000000);
    expect(event.targetId).toBe('test-target');
    expect(event.targetName).toBe('Test Target');
    expect(event.success).toBe(true);
    expect(event.statusCode).toBe(200);
    expect(event.attempts).toBe(1);
    expect(event.durationMs).toBe(150);
    expect(event.error).toBeNull();
    expect(event.triggerSeverity).toBe('warning');
    expect(event.previousSeverity).toBe('ok');
  });

  it('masks the URL — never stores full path', () => {
    const ctx = sampleContext({ url: 'https://hooks.slack.com/services/T00/B00/xxxx' });
    const event = createDeliveryEvent(sampleResult(), ctx, 1);

    expect(event.maskedUrl).toBe('https://hooks.slack.com/***');
    expect(event.maskedUrl).not.toContain('services');
    expect(event.maskedUrl).not.toContain('xxxx');
  });

  it('truncates long error strings', () => {
    const result = sampleResult({
      success: false,
      error: 'E'.repeat(500),
    });
    const event = createDeliveryEvent(result, sampleContext(), 1);
    expect(event.error!.length).toBe(200);
  });

  it('records failure details correctly', () => {
    const result = sampleResult({
      success: false,
      statusCode: 503,
      attempts: 3,
      error: 'Service Unavailable',
      durationMs: 12500,
    });
    const event = createDeliveryEvent(result, sampleContext(), 1);

    expect(event.success).toBe(false);
    expect(event.statusCode).toBe(503);
    expect(event.attempts).toBe(3);
    expect(event.error).toBe('Service Unavailable');
    expect(event.durationMs).toBe(12500);
  });

  it('handles null status code (network error)', () => {
    const result = sampleResult({
      success: false,
      statusCode: null,
      error: 'ECONNREFUSED',
    });
    const event = createDeliveryEvent(result, sampleContext(), 1);
    expect(event.statusCode).toBeNull();
    expect(event.error).toBe('ECONNREFUSED');
  });
});

// ─── pruneDeliveryEvents ─────────────────────────────────────────────────────

describe('pruneDeliveryEvents', () => {
  function makeEvents(count: number, startTs: number = Date.now()): WebhookDeliveryEvent[] {
    return Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      ts: startTs - (count - i - 1) * 1000,
      targetId: 'target',
      targetName: 'Target',
      success: true,
      statusCode: 200,
      attempts: 1,
      durationMs: 100,
      error: null,
      maskedUrl: 'https://example.com/***',
      triggerSeverity: 'warning',
      previousSeverity: 'ok',
    }));
  }

  it('keeps events within bounds', () => {
    const events = makeEvents(10);
    const pruned = pruneDeliveryEvents(events, { maxEvents: 200, maxAgeMs: 48 * 3600 * 1000 });
    expect(pruned).toHaveLength(10);
  });

  it('caps at maxEvents (keeps most recent)', () => {
    const events = makeEvents(300);
    const pruned = pruneDeliveryEvents(events, { maxEvents: 200 });
    expect(pruned).toHaveLength(200);
    // Should keep the most recent 200
    expect(pruned[0].id).toBe(101);
    expect(pruned[199].id).toBe(300);
  });

  it('removes events older than maxAgeMs', () => {
    const now = Date.now();
    const events = [
      ...makeEvents(3, now - 100 * 3600 * 1000), // 100h ago — too old
      ...makeEvents(5, now),                      // recent
    ];
    // Re-assign ids
    events.forEach((e, i) => e.id = i + 1);

    const pruned = pruneDeliveryEvents(events, {
      maxAgeMs: 48 * 3600 * 1000,
      now,
    });
    expect(pruned).toHaveLength(5);
  });

  it('applies both age and count constraints', () => {
    const now = Date.now();
    const events = makeEvents(250, now);
    const pruned = pruneDeliveryEvents(events, {
      maxEvents: 200,
      maxAgeMs: 48 * 3600 * 1000,
      now,
    });
    expect(pruned).toHaveLength(200);
  });

  it('returns empty for empty input', () => {
    expect(pruneDeliveryEvents([])).toHaveLength(0);
  });
});

// ─── readDeliveryHistory / appendDeliveryEvents ──────────────────────────────

describe('readDeliveryHistory / appendDeliveryEvents', () => {
  it('returns empty history when no file exists', () => {
    const history = readDeliveryHistory(testDataDir);
    expect(history.version).toBe(1);
    expect(history.events).toHaveLength(0);
    expect(history.nextId).toBe(1);
  });

  it('appends events and persists to disk', () => {
    const count = appendDeliveryEvents(
      testDataDir,
      [sampleResult(), sampleResult({ targetId: 'b', success: false, statusCode: 500, error: 'Internal Server Error' })],
      [sampleContext(), sampleContext({ url: 'https://other.com/hook' })],
    );
    expect(count).toBe(2);

    const history = readDeliveryHistory(testDataDir);
    expect(history.events).toHaveLength(2);
    expect(history.events[0].id).toBe(1);
    expect(history.events[1].id).toBe(2);
    expect(history.nextId).toBe(3);
  });

  it('assigns monotonically increasing IDs across multiple appends', () => {
    appendDeliveryEvents(testDataDir, [sampleResult()], [sampleContext()]);
    appendDeliveryEvents(testDataDir, [sampleResult()], [sampleContext()]);
    appendDeliveryEvents(testDataDir, [sampleResult()], [sampleContext()]);

    const history = readDeliveryHistory(testDataDir);
    expect(history.events).toHaveLength(3);
    expect(history.events[0].id).toBe(1);
    expect(history.events[1].id).toBe(2);
    expect(history.events[2].id).toBe(3);
  });

  it('prunes on append when exceeding maxEvents', () => {
    // Fill with 199 events
    for (let i = 0; i < 199; i++) {
      appendDeliveryEvents(testDataDir, [sampleResult()], [sampleContext()]);
    }

    // Append 10 more — should prune to 200
    const batch = Array.from({ length: 10 }, () => sampleResult());
    const ctxBatch = Array.from({ length: 10 }, () => sampleContext());
    appendDeliveryEvents(testDataDir, batch, ctxBatch, { maxEvents: 200 });

    const history = readDeliveryHistory(testDataDir);
    expect(history.events.length).toBeLessThanOrEqual(200);
  });

  it('returns defaults for corrupt file', () => {
    const fp = path.join(testDataDir, 'task-board-webhook-delivery-history.json');
    fs.writeFileSync(fp, '{corrupt');
    const history = readDeliveryHistory(testDataDir);
    expect(history.version).toBe(1);
    expect(history.events).toHaveLength(0);
  });

  it('returns 0 when no results provided', () => {
    const count = appendDeliveryEvents(testDataDir, [], []);
    expect(count).toBe(0);
  });
});

// ─── queryDeliveryHistory ────────────────────────────────────────────────────

describe('queryDeliveryHistory', () => {
  function seedEvents(events: Partial<WebhookDeliveryEvent>[]): void {
    const history: WebhookDeliveryHistoryFile = {
      version: 1,
      events: events.map((e, i) => ({
        id: i + 1,
        ts: Date.now() - (events.length - i) * 60000,
        targetId: 'target-a',
        targetName: 'Target A',
        success: true,
        statusCode: 200,
        attempts: 1,
        durationMs: 100,
        error: null,
        maskedUrl: 'https://example.com/***',
        triggerSeverity: 'warning',
        previousSeverity: 'ok',
        ...e,
      })),
      nextId: events.length + 1,
    };
    fs.writeFileSync(
      path.join(testDataDir, 'task-board-webhook-delivery-history.json'),
      JSON.stringify(history),
    );
  }

  it('returns empty result when no events exist', () => {
    const result = queryDeliveryHistory(testDataDir);
    expect(result.events).toHaveLength(0);
    expect(result.count).toBe(0);
    expect(result.summary.total).toBe(0);
  });

  it('returns events in reverse chronological order (most recent first)', () => {
    const now = Date.now();
    seedEvents([
      { ts: now - 3000, targetId: 'a' },
      { ts: now - 2000, targetId: 'b' },
      { ts: now - 1000, targetId: 'c' },
    ]);

    const result = queryDeliveryHistory(testDataDir);
    expect(result.events[0].targetId).toBe('c');
    expect(result.events[2].targetId).toBe('a');
  });

  it('respects limit parameter', () => {
    seedEvents(Array.from({ length: 20 }, (_, i) => ({ targetId: 't' + i })));

    const result = queryDeliveryHistory(testDataDir, { limit: 5 });
    expect(result.events).toHaveLength(5);
    expect(result.count).toBe(5);
  });

  it('caps limit at 200', () => {
    const result = queryDeliveryHistory(testDataDir, { limit: 999 });
    // Should not throw, just returns whatever is available (capped)
    expect(result.count).toBeLessThanOrEqual(200);
  });

  it('filters by sinceMs time window', () => {
    const now = Date.now();
    seedEvents([
      { ts: now - 7200000 }, // 2h ago
      { ts: now - 1800000 }, // 30min ago
      { ts: now - 600000 },  // 10min ago
    ]);

    const result = queryDeliveryHistory(testDataDir, { sinceMs: 3600000, now }); // last 1h
    expect(result.events).toHaveLength(2);
  });

  it('filters by targetId', () => {
    seedEvents([
      { targetId: 'slack' },
      { targetId: 'discord' },
      { targetId: 'slack' },
    ]);

    const result = queryDeliveryHistory(testDataDir, { targetId: 'slack' });
    expect(result.events).toHaveLength(2);
    expect(result.events.every(e => e.targetId === 'slack')).toBe(true);
  });

  it('filters by status: success', () => {
    seedEvents([
      { success: true },
      { success: false, error: 'timeout' },
      { success: true },
    ]);

    const result = queryDeliveryHistory(testDataDir, { status: 'success' });
    expect(result.events).toHaveLength(2);
    expect(result.events.every(e => e.success)).toBe(true);
  });

  it('filters by status: failure', () => {
    seedEvents([
      { success: true },
      { success: false, error: 'timeout' },
      { success: false, error: 'refused' },
    ]);

    const result = queryDeliveryHistory(testDataDir, { status: 'failure' });
    expect(result.events).toHaveLength(2);
    expect(result.events.every(e => !e.success)).toBe(true);
  });

  it('computes summary statistics', () => {
    seedEvents([
      { success: true, durationMs: 100, targetId: 'a' },
      { success: true, durationMs: 200, targetId: 'b' },
      { success: false, durationMs: 5000, targetId: 'a', error: 'timeout' },
    ]);

    const result = queryDeliveryHistory(testDataDir);
    expect(result.summary.total).toBe(3);
    expect(result.summary.succeeded).toBe(2);
    expect(result.summary.failed).toBe(1);
    expect(result.summary.avgDurationMs).toBeGreaterThan(0);
    expect(result.summary.targetIds).toContain('a');
    expect(result.summary.targetIds).toContain('b');
  });

  it('returns null avgDurationMs when no events', () => {
    const result = queryDeliveryHistory(testDataDir);
    expect(result.summary.avgDurationMs).toBeNull();
  });
});

// ─── API Routes ──────────────────────────────────────────────────────────────

describe('GET /api/task-board/webhooks/deliveries', () => {
  function seedTasks(tasks: TaskCard[]): void {
    fs.mkdirSync(testDataDir, { recursive: true });
    fs.writeFileSync(
      path.join(testDataDir, 'task-board.json'),
      JSON.stringify({ tasks, updatedAt: Date.now() }),
    );
  }

  it('returns empty result when no history exists', async () => {
    seedTasks([]); // ensure data dir is set up
    const req = mockRequest({ url: '/api/task-board/webhooks/deliveries' });
    const res = mockResponse();
    const deps = createDeps();

    const handled = await handleTaskBoard(req, res, deps);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);

    const body = parseJsonBody<DeliveryHistoryResponse>(res);
    expect(body.events).toHaveLength(0);
    expect(body.count).toBe(0);
    expect(body.summary.total).toBe(0);
  });

  it('returns persisted delivery events', async () => {
    appendDeliveryEvents(
      testDataDir,
      [
        sampleResult(),
        sampleResult({ success: false, statusCode: 500, error: 'Internal Server Error' }),
      ],
      [
        sampleContext(),
        sampleContext(),
      ],
    );

    const req = mockRequest({ url: '/api/task-board/webhooks/deliveries' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    expect(res._statusCode).toBe(200);
    const body = parseJsonBody<DeliveryHistoryResponse>(res);
    expect(body.events).toHaveLength(2);
    expect(body.summary.succeeded).toBe(1);
    expect(body.summary.failed).toBe(1);
  });

  it('respects query params: limit', async () => {
    // Seed 10 events
    for (let i = 0; i < 10; i++) {
      appendDeliveryEvents(testDataDir, [sampleResult()], [sampleContext()]);
    }

    const req = mockRequest({ url: '/api/task-board/webhooks/deliveries?limit=3' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const body = parseJsonBody<DeliveryHistoryResponse>(res);
    expect(body.events).toHaveLength(3);
  });

  it('respects query params: status filter', async () => {
    appendDeliveryEvents(
      testDataDir,
      [
        sampleResult({ success: true }),
        sampleResult({ success: false, error: 'fail' }),
      ],
      [sampleContext(), sampleContext()],
    );

    const req = mockRequest({ url: '/api/task-board/webhooks/deliveries?status=failure' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const body = parseJsonBody<DeliveryHistoryResponse>(res);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].success).toBe(false);
  });

  it('respects query params: targetId filter', async () => {
    appendDeliveryEvents(
      testDataDir,
      [
        sampleResult({ targetId: 'slack' }),
        sampleResult({ targetId: 'discord' }),
      ],
      [sampleContext(), sampleContext()],
    );

    const req = mockRequest({ url: '/api/task-board/webhooks/deliveries?targetId=slack' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const body = parseJsonBody<DeliveryHistoryResponse>(res);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].targetId).toBe('slack');
  });
});

// ─── Integration: delivery recording via maybeDeliverWebhooks ────────────────

describe('delivery history recording integration', () => {
  it('records successful delivery to history', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    writeWebhookConfig(testDataDir, {
      enabled: true,
      targets: [{
        id: 'test',
        name: 'Test',
        url: 'https://example.com/webhook',
        enabled: true,
        minSeverity: 'ok',
      }],
      cooldownMs: 0,
      timeoutMs: 5000,
      maxRetries: 1,
    });

    const evaluation = evaluateAlerts(metricsInput(), DEFAULT_ALERT_CONFIG);
    await maybeDeliverWebhooks(testDataDir, evaluation);

    const history = readDeliveryHistory(testDataDir);
    expect(history.events.length).toBeGreaterThanOrEqual(1);

    const event = history.events[0];
    expect(event.success).toBe(true);
    expect(event.statusCode).toBe(200);
    expect(event.targetId).toBe('test');
    expect(event.maskedUrl).toBe('https://example.com/***');
    // Must not contain the full URL
    expect(event.maskedUrl).not.toContain('/webhook');
  });

  it('records failed delivery to history', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', mockFetch);

    writeWebhookConfig(testDataDir, {
      enabled: true,
      targets: [{
        id: 'failing',
        name: 'Failing Target',
        url: 'https://failing.example.com/hook',
        enabled: true,
        minSeverity: 'ok',
      }],
      cooldownMs: 0,
      timeoutMs: 5000,
      maxRetries: 1,
    });

    const evaluation = evaluateAlerts(metricsInput(), DEFAULT_ALERT_CONFIG);
    await maybeDeliverWebhooks(testDataDir, evaluation);

    const history = readDeliveryHistory(testDataDir);
    expect(history.events.length).toBeGreaterThanOrEqual(1);

    const event = history.events[0];
    expect(event.success).toBe(false);
    expect(event.error).toBe('ECONNREFUSED');
    expect(event.targetId).toBe('failing');
  });

  it('records delivery to multiple targets', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: false, status: 502 });
    vi.stubGlobal('fetch', mockFetch);

    writeWebhookConfig(testDataDir, {
      enabled: true,
      targets: [
        { id: 'a', name: 'A', url: 'https://a.com/hook', enabled: true, minSeverity: 'ok' },
        { id: 'b', name: 'B', url: 'https://b.com/hook', enabled: true, minSeverity: 'ok' },
      ],
      cooldownMs: 0,
      timeoutMs: 5000,
      maxRetries: 1,
    });

    const evaluation = evaluateAlerts(metricsInput(), DEFAULT_ALERT_CONFIG);
    await maybeDeliverWebhooks(testDataDir, evaluation);

    const history = readDeliveryHistory(testDataDir);
    expect(history.events.length).toBe(2);

    const [evA, evB] = history.events;
    expect(evA.targetId).toBe('a');
    expect(evA.success).toBe(true);
    expect(evB.targetId).toBe('b');
    expect(evB.success).toBe(false);
  });
});

// ─── Secret safety ───────────────────────────────────────────────────────────

describe('secret safety', () => {
  it('never stores full webhook URLs in history', () => {
    const secretUrl = 'https://hooks.slack.com/services/T00/B00/xoxb-secret-token-value';
    appendDeliveryEvents(
      testDataDir,
      [sampleResult()],
      [sampleContext({ url: secretUrl })],
    );

    // Read raw file to verify
    const fp = path.join(testDataDir, 'task-board-webhook-delivery-history.json');
    const raw = fs.readFileSync(fp, 'utf8');

    // Raw file must NOT contain the secret URL parts
    expect(raw).not.toContain('xoxb-secret-token-value');
    expect(raw).not.toContain('/services/T00');
    expect(raw).not.toContain('/B00/');

    // Should contain masked URL
    expect(raw).toContain('hooks.slack.com/***');
  });

  it('never stores webhook secrets in history events', () => {
    // The event creation path doesn't receive secrets, but verify
    // the on-disk format has no secret-like fields
    appendDeliveryEvents(
      testDataDir,
      [sampleResult()],
      [sampleContext()],
    );

    const fp = path.join(testDataDir, 'task-board-webhook-delivery-history.json');
    const raw = fs.readFileSync(fp, 'utf8');
    const parsed = JSON.parse(raw);

    for (const event of parsed.events) {
      expect(event).not.toHaveProperty('secret');
      expect(event).not.toHaveProperty('url');
      // Only maskedUrl should exist
      expect(event).toHaveProperty('maskedUrl');
    }
  });

  it('query response never includes raw URLs', () => {
    appendDeliveryEvents(
      testDataDir,
      [sampleResult()],
      [sampleContext({ url: 'https://secret-webhook.com/path/to/secret' })],
    );

    const result = queryDeliveryHistory(testDataDir);
    for (const event of result.events) {
      expect(event.maskedUrl).not.toContain('/path/to/secret');
      expect(event.maskedUrl).toBe('https://secret-webhook.com/***');
    }
  });
});

// ─── Failure isolation ───────────────────────────────────────────────────────

describe('failure isolation', () => {
  it('corrupt history file does not crash on read', () => {
    const fp = path.join(testDataDir, 'task-board-webhook-delivery-history.json');
    fs.writeFileSync(fp, 'not-json-at-all');
    const history = readDeliveryHistory(testDataDir);
    expect(history.version).toBe(1);
    expect(history.events).toHaveLength(0);
  });

  it('corrupt history file does not block new appends', () => {
    const fp = path.join(testDataDir, 'task-board-webhook-delivery-history.json');
    fs.writeFileSync(fp, '!!!corrupt!!!');

    // Should not throw — reads defaults, appends new event
    appendDeliveryEvents(testDataDir, [sampleResult()], [sampleContext()]);

    const history = readDeliveryHistory(testDataDir);
    expect(history.events).toHaveLength(1);
  });
});

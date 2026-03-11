/**
 * Webhook Test Ping tests — Issue #219, Phase 14.
 *
 * Tests for:
 * - buildTestPayload() — test payload construction + non-production markers
 * - deliverTestWebhook() — bounded timeout, single retry, correct headers
 * - sendTestWebhook() — end-to-end test delivery (single target + all enabled)
 * - POST /api/task-board/webhooks/test — API endpoint validation + dispatch
 * - Secret safety — no secrets leaked in responses or payloads
 * - Error handling — network errors, HTTP errors, missing targets
 * - Delivery history recording — test events appear in history with 'test' severity
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import { handleTaskBoard } from '../../../server/routes/task-board.js';
import {
  buildTestPayload,
  deliverTestWebhook,
  sendTestWebhook,
  writeWebhookConfig,
  readWebhookConfig,
  resetDeliveryState,
} from '../../../server/alert-webhook.js';
import type {
  WebhookConfig,
  WebhookTarget,
  WebhookTestPayload,
  WebhookTestResult,
} from '../../../server/alert-webhook.js';
import {
  readDeliveryHistory,
} from '../../../server/webhook-delivery-history.js';
import type { TaskBoardDeps } from '../../../server/types.js';

const testDataDir = path.join('/tmp', 'test-webhook-test-ping-' + process.pid);

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

function seedWebhookConfig(config: WebhookConfig): void {
  fs.mkdirSync(testDataDir, { recursive: true });
  writeWebhookConfig(testDataDir, config);
}

function seedTasks(): void {
  fs.mkdirSync(testDataDir, { recursive: true });
  fs.writeFileSync(
    path.join(testDataDir, 'task-board.json'),
    JSON.stringify({ tasks: [], updatedAt: Date.now() }),
  );
}

function makeTarget(overrides: Partial<WebhookTarget> = {}): WebhookTarget {
  return {
    id: 'target-' + Math.random().toString(36).slice(2, 6),
    name: 'Test Target',
    url: 'https://example.com/webhook',
    enabled: true,
    minSeverity: 'warning',
    ...overrides,
  };
}

function makeConfig(overrides: Partial<WebhookConfig> = {}): WebhookConfig {
  return {
    enabled: true,
    targets: [makeTarget({ id: 'test-1', name: 'Target One' })],
    cooldownMs: 60000,
    timeoutMs: 10000,
    maxRetries: 3,
    ...overrides,
  };
}

beforeEach(() => {
  fs.mkdirSync(testDataDir, { recursive: true });
  resetDeliveryState();
});

afterEach(() => {
  vi.restoreAllMocks();
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch { /* ignore */ }
});

// ─── buildTestPayload() ─────────────────────────────────────────────────────

describe('buildTestPayload()', () => {
  it('builds a payload with explicit non-production markers', () => {
    const now = 1700000000000;
    const payload = buildTestPayload(now);

    expect(payload.event).toBe('webhook.test');
    expect(payload.test).toBe(true);
    expect(payload._testMarker).toBe('NON_PRODUCTION_TEST_PING');
    expect(payload.source).toBe('ventureos-dashboard');
    expect(payload.schemaVersion).toBe(1);
    expect(payload.timestamp).toBe(now);
    expect(payload.timestampISO).toBe(new Date(now).toISOString());
    expect(payload.message).toContain('test ping');
    expect(payload.message).toContain('No action required');
  });

  it('uses current time when no timestamp provided', () => {
    const before = Date.now();
    const payload = buildTestPayload();
    const after = Date.now();

    expect(payload.timestamp).toBeGreaterThanOrEqual(before);
    expect(payload.timestamp).toBeLessThanOrEqual(after);
  });

  it('never contains sensitive data', () => {
    const payload = buildTestPayload();
    const serialized = JSON.stringify(payload);

    // Must not contain any secret-like patterns
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('key');
  });

  it('is valid JSON when serialized', () => {
    const payload = buildTestPayload();
    const serialized = JSON.stringify(payload);
    const parsed = JSON.parse(serialized);
    expect(parsed.event).toBe('webhook.test');
    expect(parsed.test).toBe(true);
  });
});

// ─── deliverTestWebhook() ───────────────────────────────────────────────────

describe('deliverTestWebhook()', () => {
  it('sends correct headers including test markers', async () => {
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = '';

    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>;
      capturedBody = init.body as string;
      return new Response('', { status: 200 });
    }));

    const target = makeTarget({ id: 'h1', name: 'Header Test' });
    const payload = buildTestPayload();
    await deliverTestWebhook(target, payload);

    expect(capturedHeaders['Content-Type']).toBe('application/json');
    expect(capturedHeaders['User-Agent']).toBe('VentureOS-Dashboard/1.0');
    expect(capturedHeaders['X-VentureOS-Event']).toBe('webhook.test');
    expect(capturedHeaders['X-VentureOS-Test']).toBe('true');

    // Verify body is the test payload
    const parsedBody = JSON.parse(capturedBody);
    expect(parsedBody.event).toBe('webhook.test');
    expect(parsedBody.test).toBe(true);
    expect(parsedBody._testMarker).toBe('NON_PRODUCTION_TEST_PING');
  });

  it('returns success with isTest marker on HTTP 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));

    const target = makeTarget({ id: 'ok1' });
    const payload = buildTestPayload();
    const result = await deliverTestWebhook(target, payload);

    expect(result.success).toBe(true);
    expect(result.isTest).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.targetId).toBe('ok1');
    expect(result.error).toBeNull();
    expect(result.attempts).toBe(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns failure with isTest marker on HTTP 400', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 400 })));

    const target = makeTarget({ id: 'err1' });
    const payload = buildTestPayload();
    const result = await deliverTestWebhook(target, payload);

    expect(result.success).toBe(false);
    expect(result.isTest).toBe(true);
    expect(result.statusCode).toBe(400);
    expect(result.error).toBe('HTTP 400');
    // Client errors should not retry
    expect(result.attempts).toBe(1);
  });

  it('returns failure on network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));

    const target = makeTarget({ id: 'net1' });
    const payload = buildTestPayload();
    const result = await deliverTestWebhook(target, payload);

    expect(result.success).toBe(false);
    expect(result.isTest).toBe(true);
    expect(result.error).toBe('ECONNREFUSED');
  });

  it('adds HMAC signature when secret is configured', async () => {
    let capturedHeaders: Record<string, string> = {};

    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>;
      return new Response('', { status: 200 });
    }));

    const target = makeTarget({ id: 'sig1', secret: 'my-secret-123' });
    const payload = buildTestPayload();
    await deliverTestWebhook(target, payload);

    expect(capturedHeaders['X-VentureOS-Signature']).toBeDefined();
    expect(capturedHeaders['X-VentureOS-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('does not add signature header when no secret', async () => {
    let capturedHeaders: Record<string, string> = {};

    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>;
      return new Response('', { status: 200 });
    }));

    const target = makeTarget({ id: 'nosig1' });
    delete target.secret;
    const payload = buildTestPayload();
    await deliverTestWebhook(target, payload);

    expect(capturedHeaders['X-VentureOS-Signature']).toBeUndefined();
  });

  it('uses bounded timeout (default 5s)', async () => {
    const startMs = Date.now();
    let aborted = false;

    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const signal = init.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    }));

    const target = makeTarget({ id: 'timeout1' });
    const payload = buildTestPayload();
    const result = await deliverTestWebhook(target, payload, { timeoutMs: 100 });

    expect(result.success).toBe(false);
    expect(result.error).toContain('timeout');
    expect(aborted).toBe(true);
    // Should complete within bounded time
    expect(Date.now() - startMs).toBeLessThan(2000);
  });

  it('defaults to 1 retry attempt (no extra retries)', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      callCount++;
      return new Response('', { status: 502 });
    }));

    const target = makeTarget({ id: 'retry1' });
    const payload = buildTestPayload();
    const result = await deliverTestWebhook(target, payload);

    expect(result.attempts).toBe(1);
    expect(callCount).toBe(1);
  });
});

// ─── sendTestWebhook() ─────────────────────────────────────────────────────

describe('sendTestWebhook()', () => {
  it('returns error when no targets configured', async () => {
    seedWebhookConfig({ enabled: true, targets: [], cooldownMs: 60000, timeoutMs: 10000, maxRetries: 3 });

    const result = await sendTestWebhook(testDataDir);
    expect(result.error).toBe('No webhook targets configured');
    expect(result.results).toEqual([]);
  });

  it('returns error when no enabled targets', async () => {
    seedWebhookConfig(makeConfig({
      targets: [makeTarget({ id: 't1', enabled: false })],
    }));

    const result = await sendTestWebhook(testDataDir);
    expect(result.error).toBe('No enabled webhook targets');
    expect(result.results).toEqual([]);
  });

  it('returns error when targetId not found', async () => {
    seedWebhookConfig(makeConfig());

    const result = await sendTestWebhook(testDataDir, { targetId: 'nonexistent' });
    expect(result.error).toBe('Target not found: nonexistent');
    expect(result.results).toEqual([]);
  });

  it('delivers test ping to all enabled targets', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));

    seedWebhookConfig(makeConfig({
      targets: [
        makeTarget({ id: 't1', name: 'One', enabled: true }),
        makeTarget({ id: 't2', name: 'Two', enabled: true }),
        makeTarget({ id: 't3', name: 'Three', enabled: false }),
      ],
    }));

    const result = await sendTestWebhook(testDataDir);
    expect(result.error).toBeUndefined();
    expect(result.results).toHaveLength(2);
    expect(result.results.every(r => r.isTest)).toBe(true);
    expect(result.results.every(r => r.success)).toBe(true);

    const ids = result.results.map(r => r.targetId);
    expect(ids).toContain('t1');
    expect(ids).toContain('t2');
    expect(ids).not.toContain('t3');
  });

  it('delivers test ping to a specific target by ID', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));

    seedWebhookConfig(makeConfig({
      targets: [
        makeTarget({ id: 't1', name: 'One' }),
        makeTarget({ id: 't2', name: 'Two' }),
      ],
    }));

    const result = await sendTestWebhook(testDataDir, { targetId: 't2' });
    expect(result.error).toBeUndefined();
    expect(result.results).toHaveLength(1);
    expect(result.results[0].targetId).toBe('t2');
    expect(result.results[0].isTest).toBe(true);
  });

  it('allows testing disabled targets when specified by ID', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));

    seedWebhookConfig(makeConfig({
      targets: [makeTarget({ id: 't1', enabled: false })],
    }));

    // Specific target by ID should work even if disabled
    const result = await sendTestWebhook(testDataDir, { targetId: 't1' });
    expect(result.error).toBeUndefined();
    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
  });

  it('records test deliveries in delivery history', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));

    seedWebhookConfig(makeConfig({
      targets: [makeTarget({ id: 'hist1', name: 'History Test', url: 'https://example.com/hook' })],
    }));

    await sendTestWebhook(testDataDir);

    const history = readDeliveryHistory(testDataDir);
    expect(history.events.length).toBeGreaterThanOrEqual(1);

    const testEvent = history.events[history.events.length - 1];
    expect(testEvent.targetId).toBe('hist1');
    expect(testEvent.triggerSeverity).toBe('test');
    expect(testEvent.previousSeverity).toBeNull();
    expect(testEvent.success).toBe(true);
    // URL must be masked in history
    expect(testEvent.maskedUrl).not.toContain('/hook');
    expect(testEvent.maskedUrl).toContain('example.com');
  });

  it('does not require global webhook enabled flag for test', async () => {
    // Test pings should work even with global enabled=false
    // (testing connectivity before enabling)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));

    seedWebhookConfig(makeConfig({
      enabled: false,
      targets: [makeTarget({ id: 't1', enabled: true })],
    }));

    // sendTestWebhook deliberately ignores config.enabled for testing
    const result = await sendTestWebhook(testDataDir);
    // Even though global is disabled, test should deliver to enabled targets
    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
  });

  it('does not affect production delivery state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));

    seedWebhookConfig(makeConfig({
      targets: [makeTarget({ id: 't1' })],
    }));

    const { getDeliveryState } = await import('../../../server/alert-webhook.js');
    const stateBefore = { ...getDeliveryState() };

    await sendTestWebhook(testDataDir);

    // Test delivery should NOT update the production delivery state
    // (lastDeliveryAt, lastSeverity should remain unchanged)
    const stateAfter = getDeliveryState();
    expect(stateAfter.lastSeverity).toBe(stateBefore.lastSeverity);
    expect(stateAfter.lastDeliveryAt).toEqual(stateBefore.lastDeliveryAt);
  });
});

// ─── POST /api/task-board/webhooks/test (API endpoint) ──────────────────────

describe('POST /api/task-board/webhooks/test', () => {
  it('returns 200 with results on successful test', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));

    seedWebhookConfig(makeConfig({
      targets: [makeTarget({ id: 'api1', name: 'API Test' })],
    }));
    seedTasks();

    const req = mockRequest({
      method: 'POST',
      url: '/api/task-board/webhooks/test',
    });
    const res = mockResponse();
    const deps = createDeps({
      readRequestBody: async () => '{}',
    });

    const handled = await handleTaskBoard(req, res, deps);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);

    const body = parseJsonBody<{ results: WebhookTestResult[] }>(res);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].success).toBe(true);
    expect(body.results[0].isTest).toBe(true);
    expect(body.results[0].targetId).toBe('api1');
  });

  it('returns 200 with target-specific test', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));

    seedWebhookConfig(makeConfig({
      targets: [
        makeTarget({ id: 'a', name: 'Alpha' }),
        makeTarget({ id: 'b', name: 'Beta' }),
      ],
    }));
    seedTasks();

    const req = mockRequest({
      method: 'POST',
      url: '/api/task-board/webhooks/test',
    });
    const res = mockResponse();
    const deps = createDeps({
      readRequestBody: async () => JSON.stringify({ targetId: 'b' }),
    });

    const handled = await handleTaskBoard(req, res, deps);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);

    const body = parseJsonBody<{ results: WebhookTestResult[] }>(res);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].targetId).toBe('b');
  });

  it('returns 422 when no targets configured', async () => {
    seedWebhookConfig({ enabled: true, targets: [], cooldownMs: 60000, timeoutMs: 10000, maxRetries: 3 });
    seedTasks();

    const req = mockRequest({
      method: 'POST',
      url: '/api/task-board/webhooks/test',
    });
    const res = mockResponse();
    const deps = createDeps({
      readRequestBody: async () => '{}',
    });

    const handled = await handleTaskBoard(req, res, deps);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(422);

    const body = parseJsonBody<{ error: string }>(res);
    expect(body.error).toContain('No webhook targets');
  });

  it('returns 422 when target not found', async () => {
    seedWebhookConfig(makeConfig());
    seedTasks();

    const req = mockRequest({
      method: 'POST',
      url: '/api/task-board/webhooks/test',
    });
    const res = mockResponse();
    const deps = createDeps({
      readRequestBody: async () => JSON.stringify({ targetId: 'ghost' }),
    });

    const handled = await handleTaskBoard(req, res, deps);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(422);

    const body = parseJsonBody<{ error: string }>(res);
    expect(body.error).toContain('ghost');
  });

  it('returns 400 on invalid JSON body', async () => {
    seedWebhookConfig(makeConfig());
    seedTasks();

    const req = mockRequest({
      method: 'POST',
      url: '/api/task-board/webhooks/test',
    });
    const res = mockResponse();
    const deps = createDeps({
      readRequestBody: async () => '{invalid json',
    });

    const handled = await handleTaskBoard(req, res, deps);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(400);
  });

  it('returns 400 when targetId is not a string', async () => {
    seedWebhookConfig(makeConfig());
    seedTasks();

    const req = mockRequest({
      method: 'POST',
      url: '/api/task-board/webhooks/test',
    });
    const res = mockResponse();
    const deps = createDeps({
      readRequestBody: async () => JSON.stringify({ targetId: 123 }),
    });

    const handled = await handleTaskBoard(req, res, deps);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(400);

    const body = parseJsonBody<{ error: string }>(res);
    expect(body.error).toContain('targetId must be a string');
  });

  it('accepts empty body (tests all enabled targets)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));

    seedWebhookConfig(makeConfig({
      targets: [makeTarget({ id: 'e1', enabled: true })],
    }));
    seedTasks();

    const req = mockRequest({
      method: 'POST',
      url: '/api/task-board/webhooks/test',
    });
    const res = mockResponse();
    const deps = createDeps({
      readRequestBody: async () => '',
    });

    const handled = await handleTaskBoard(req, res, deps);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);

    const body = parseJsonBody<{ results: WebhookTestResult[] }>(res);
    expect(body.results).toHaveLength(1);
  });

  it('never leaks secrets in the response', async () => {
    const secretValue = 'super-secret-hmac-key-12345';

    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));

    seedWebhookConfig(makeConfig({
      targets: [makeTarget({ id: 's1', secret: secretValue })],
    }));
    seedTasks();

    const req = mockRequest({
      method: 'POST',
      url: '/api/task-board/webhooks/test',
    });
    const res = mockResponse();
    const deps = createDeps({
      readRequestBody: async () => '{}',
    });

    await handleTaskBoard(req, res, deps);

    // The entire response body must not contain the secret
    expect(res._body).not.toContain(secretValue);
    expect(res._body).not.toContain('secret');
  });

  it('returns partial results when some targets fail', async () => {
    let callIdx = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      callIdx++;
      if (callIdx === 1) return new Response('', { status: 200 });
      return new Response('', { status: 500 });
    }));

    seedWebhookConfig(makeConfig({
      targets: [
        makeTarget({ id: 'ok1', name: 'OK Target' }),
        makeTarget({ id: 'fail1', name: 'Fail Target' }),
      ],
    }));
    seedTasks();

    const req = mockRequest({
      method: 'POST',
      url: '/api/task-board/webhooks/test',
    });
    const res = mockResponse();
    const deps = createDeps({
      readRequestBody: async () => '{}',
    });

    await handleTaskBoard(req, res, deps);
    expect(res._statusCode).toBe(200);

    const body = parseJsonBody<{ results: WebhookTestResult[] }>(res);
    expect(body.results).toHaveLength(2);

    const okResult = body.results.find(r => r.targetId === 'ok1');
    const failResult = body.results.find(r => r.targetId === 'fail1');
    expect(okResult?.success).toBe(true);
    expect(failResult?.success).toBe(false);
  });

  it('does not affect production webhook delivery cooldowns', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));

    seedWebhookConfig(makeConfig({
      targets: [makeTarget({ id: 'cd1' })],
    }));
    seedTasks();

    const { getDeliveryState } = await import('../../../server/alert-webhook.js');

    const req = mockRequest({
      method: 'POST',
      url: '/api/task-board/webhooks/test',
    });
    const res = mockResponse();
    const deps = createDeps({
      readRequestBody: async () => '{}',
    });

    await handleTaskBoard(req, res, deps);

    // Production delivery state should not be modified by test pings
    const state = getDeliveryState();
    expect(state.lastDeliveryAt['cd1']).toBeUndefined();
  });
});

// ─── Secret Safety ──────────────────────────────────────────────────────────

describe('Secret Safety', () => {
  it('test payload never contains webhook URLs, secrets, or target config', () => {
    const payload = buildTestPayload();
    const serialized = JSON.stringify(payload);

    // Must not contain any URL patterns or secret-like values
    expect(serialized).not.toContain('https://');
    expect(serialized).not.toContain('http://');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('token');
    // "webhook" appears in event type which is fine — but no URLs or config
    expect(serialized).not.toContain('.com');
    expect(serialized).not.toContain('slack');
    // Only contains the source identifier
    expect(serialized).toContain('ventureos-dashboard');
  });

  it('delivery history masks URLs for test events', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));

    const sensitiveUrl = 'https://hooks.slack.com/services/T123/B456/secret-path';
    seedWebhookConfig(makeConfig({
      targets: [makeTarget({ id: 'mask1', url: sensitiveUrl })],
    }));

    await sendTestWebhook(testDataDir);

    const history = readDeliveryHistory(testDataDir);
    const lastEvent = history.events[history.events.length - 1];

    expect(lastEvent.maskedUrl).not.toContain('secret-path');
    expect(lastEvent.maskedUrl).not.toContain('T123');
    expect(lastEvent.maskedUrl).toContain('hooks.slack.com');
    expect(lastEvent.maskedUrl).toContain('***');
  });
});

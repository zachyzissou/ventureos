/**
 * Alert Webhook tests — Issue #219, Phase 11: Webhook Notification Baseline.
 *
 * Tests for:
 * - validateWebhookConfig() — config validation
 * - sanitizeConfig() — config normalization
 * - readWebhookConfig() / writeWebhookConfig() — config persistence
 * - redactConfig() — secret redaction for API responses
 * - maskUrl() — URL masking for logs
 * - buildWebhookPayload() — payload construction & schema
 * - computeSignature() — HMAC-SHA256 signing
 * - isTransition() — transition detection
 * - selectTargets() — target selection with cooldown + severity filter
 * - deliverWebhook() — HTTP delivery with retry/backoff
 * - maybeDeliverWebhooks() — full dispatch pipeline
 * - GET /api/task-board/webhooks/config — read endpoint
 * - PUT /api/task-board/webhooks/config — write endpoint
 * - Webhook trigger via GET /api/task-board/metrics — piggyback delivery
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import {
  handleTaskBoard,
} from '../../../server/routes/task-board.js';
import {
  readWebhookConfig,
  writeWebhookConfig,
  validateWebhookConfig,
  sanitizeConfig,
  redactConfig,
  buildWebhookPayload,
  deliverWebhook,
  maybeDeliverWebhooks,
  isTransition,
  selectTargets,
  resetDeliveryState,
  getDeliveryState,
  maskUrl,
  computeSignature,
  DEFAULT_WEBHOOK_CONFIG,
} from '../../../server/alert-webhook.js';
import {
  evaluateAlerts,
  DEFAULT_ALERT_CONFIG,
} from '../../../server/alert-rules.js';
import type {
  AlertEvaluation,
  AlertMetricsInput,
  AlertSeverity,
} from '../../../server/alert-rules.js';
import type {
  WebhookConfig,
  WebhookTarget,
  WebhookDeliveryState,
} from '../../../server/alert-webhook.js';
import type { TaskBoardDeps, TaskCard } from '../../../server/types.js';

const testDataDir = path.join('/tmp', 'test-webhook-' + process.pid);

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
    statusCounts: { backlog: 5, queued: 2, running: 1, done: 10, failed: 2 },
    successRate: 0.8,
    stuckCount: 0,
    avgRuntimeMs: 60000,
    total: 20,
    ...overrides,
  };
}

function makeEvaluation(overrides: Partial<AlertEvaluation> = {}): AlertEvaluation {
  return evaluateAlerts(metricsInput(), DEFAULT_ALERT_CONFIG, Date.now(), ...[] as never[]) ?? {
    evaluatedAt: Date.now(),
    overallSeverity: 'ok' as AlertSeverity,
    severityCounts: { ok: 5, warning: 0, critical: 0 },
    rules: [],
    ...overrides,
  };
}

function makeTarget(overrides: Partial<WebhookTarget> = {}): WebhookTarget {
  return {
    id: 'test-target',
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
    targets: [makeTarget()],
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
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
  vi.restoreAllMocks();
});

// ─── validateWebhookConfig ───────────────────────────────────────────────────

describe('validateWebhookConfig', () => {
  it('accepts a valid minimal config', () => {
    const errors = validateWebhookConfig({ enabled: false, targets: [] });
    expect(errors).toHaveLength(0);
  });

  it('accepts a valid config with targets', () => {
    const errors = validateWebhookConfig({
      enabled: true,
      targets: [{
        id: 'slack',
        name: 'Slack',
        url: 'https://hooks.slack.com/services/xxx',
        enabled: true,
      }],
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects non-object input', () => {
    expect(validateWebhookConfig(null)).toHaveLength(1);
    expect(validateWebhookConfig('string')).toHaveLength(1);
    expect(validateWebhookConfig([])).toHaveLength(1);
    expect(validateWebhookConfig(42)).toHaveLength(1);
  });

  it('rejects invalid enabled type', () => {
    const errors = validateWebhookConfig({ enabled: 'yes' });
    expect(errors.some(e => e.field === 'enabled')).toBe(true);
  });

  it('rejects invalid cooldownMs', () => {
    const errors = validateWebhookConfig({ cooldownMs: -1 });
    expect(errors.some(e => e.field === 'cooldownMs')).toBe(true);
  });

  it('rejects invalid timeoutMs range', () => {
    expect(validateWebhookConfig({ timeoutMs: 500 }).some(e => e.field === 'timeoutMs')).toBe(true);
    expect(validateWebhookConfig({ timeoutMs: 50000 }).some(e => e.field === 'timeoutMs')).toBe(true);
  });

  it('rejects invalid maxRetries', () => {
    expect(validateWebhookConfig({ maxRetries: -1 }).some(e => e.field === 'maxRetries')).toBe(true);
    expect(validateWebhookConfig({ maxRetries: 10 }).some(e => e.field === 'maxRetries')).toBe(true);
  });

  it('rejects too many targets', () => {
    const targets = Array.from({ length: 6 }, (_, i) => ({
      id: `t${i}`, name: `T${i}`, url: `https://example.com/${i}`, enabled: true,
    }));
    const errors = validateWebhookConfig({ targets });
    expect(errors.some(e => e.field === 'targets')).toBe(true);
  });

  it('rejects duplicate target ids', () => {
    const targets = [
      { id: 'dup', name: 'A', url: 'https://example.com/a', enabled: true },
      { id: 'dup', name: 'B', url: 'https://example.com/b', enabled: true },
    ];
    const errors = validateWebhookConfig({ targets });
    expect(errors.some(e => e.message.includes('duplicate'))).toBe(true);
  });

  it('rejects HTTP URLs for non-localhost', () => {
    const errors = validateWebhookConfig({
      targets: [{ id: 'bad', url: 'http://external.com/hook', enabled: true }],
    });
    expect(errors.some(e => e.message.includes('HTTPS'))).toBe(true);
  });

  it('allows HTTP for localhost', () => {
    const errors = validateWebhookConfig({
      targets: [{ id: 'local', url: 'http://localhost:3000/hook', enabled: true }],
    });
    const urlErrors = errors.filter(e => e.field.includes('url'));
    expect(urlErrors).toHaveLength(0);
  });

  it('allows HTTP for 127.0.0.1', () => {
    const errors = validateWebhookConfig({
      targets: [{ id: 'local', url: 'http://127.0.0.1:9090/hook', enabled: true }],
    });
    const urlErrors = errors.filter(e => e.field.includes('url'));
    expect(urlErrors).toHaveLength(0);
  });

  it('rejects invalid URL', () => {
    const errors = validateWebhookConfig({
      targets: [{ id: 'bad', url: 'not-a-url', enabled: true }],
    });
    expect(errors.some(e => e.message.includes('valid URL'))).toBe(true);
  });

  it('rejects target without id', () => {
    const errors = validateWebhookConfig({
      targets: [{ url: 'https://example.com', enabled: true }],
    });
    expect(errors.some(e => e.field.includes('.id'))).toBe(true);
  });

  it('rejects target without url', () => {
    const errors = validateWebhookConfig({
      targets: [{ id: 'no-url', enabled: true }],
    });
    expect(errors.some(e => e.field.includes('.url'))).toBe(true);
  });

  it('rejects invalid minSeverity', () => {
    const errors = validateWebhookConfig({
      targets: [{ id: 't', url: 'https://example.com', minSeverity: 'extreme' }],
    });
    expect(errors.some(e => e.field.includes('minSeverity'))).toBe(true);
  });

  it('accepts valid minSeverity values', () => {
    for (const sev of ['ok', 'warning', 'critical']) {
      const errors = validateWebhookConfig({
        targets: [{ id: 't', url: 'https://example.com', enabled: true, minSeverity: sev }],
      });
      const sevErrors = errors.filter(e => e.field.includes('minSeverity'));
      expect(sevErrors).toHaveLength(0);
    }
  });
});

// ─── sanitizeConfig ──────────────────────────────────────────────────────────

describe('sanitizeConfig', () => {
  it('returns defaults for null/undefined', () => {
    expect(sanitizeConfig(null)).toEqual(DEFAULT_WEBHOOK_CONFIG);
    expect(sanitizeConfig(undefined)).toEqual(DEFAULT_WEBHOOK_CONFIG);
  });

  it('sanitizes a valid config', () => {
    const result = sanitizeConfig({
      enabled: true,
      targets: [{ id: 'a', url: 'https://x.com', enabled: true }],
      cooldownMs: 30000,
    });
    expect(result.enabled).toBe(true);
    expect(result.targets).toHaveLength(1);
    expect(result.cooldownMs).toBe(30000);
  });

  it('caps maxRetries at 5', () => {
    const result = sanitizeConfig({ maxRetries: 100 });
    expect(result.maxRetries).toBe(5);
  });

  it('caps timeoutMs at 30000', () => {
    const result = sanitizeConfig({ timeoutMs: 99999 });
    expect(result.timeoutMs).toBe(30000);
  });

  it('caps targets at 5', () => {
    const targets = Array.from({ length: 10 }, (_, i) => ({
      id: `t${i}`, url: `https://x.com/${i}`, enabled: true,
    }));
    const result = sanitizeConfig({ targets });
    expect(result.targets).toHaveLength(5);
  });

  it('defaults minSeverity to warning', () => {
    const result = sanitizeConfig({
      targets: [{ id: 'a', url: 'https://x.com', enabled: true }],
    });
    expect(result.targets[0].minSeverity).toBe('warning');
  });
});

// ─── Config I/O ──────────────────────────────────────────────────────────────

describe('readWebhookConfig / writeWebhookConfig', () => {
  it('returns defaults when no file exists', () => {
    const config = readWebhookConfig(testDataDir);
    expect(config.enabled).toBe(false);
    expect(config.targets).toHaveLength(0);
  });

  it('round-trips a config to disk', () => {
    const config = makeConfig();
    writeWebhookConfig(testDataDir, config);
    const read = readWebhookConfig(testDataDir);
    expect(read.enabled).toBe(true);
    expect(read.targets).toHaveLength(1);
    expect(read.targets[0].id).toBe('test-target');
  });

  it('returns defaults for corrupt file', () => {
    fs.writeFileSync(path.join(testDataDir, 'task-board-webhook-config.json'), '{corrupt');
    const config = readWebhookConfig(testDataDir);
    expect(config.enabled).toBe(false);
  });
});

// ─── redactConfig ────────────────────────────────────────────────────────────

describe('redactConfig', () => {
  it('replaces secret with hasSecret flag', () => {
    const config = makeConfig({
      targets: [makeTarget({ secret: 'my-super-secret' })],
    });
    const redacted = redactConfig(config);
    expect((redacted.targets[0] as Record<string, unknown>).secret).toBeUndefined();
    expect(redacted.targets[0].hasSecret).toBe(true);
  });

  it('sets hasSecret to false when no secret', () => {
    const config = makeConfig({
      targets: [makeTarget()],
    });
    const redacted = redactConfig(config);
    expect(redacted.targets[0].hasSecret).toBe(false);
  });
});

// ─── maskUrl ─────────────────────────────────────────────────────────────────

describe('maskUrl', () => {
  it('masks the path of a valid URL', () => {
    expect(maskUrl('https://hooks.slack.com/services/xxx/yyy')).toBe('https://hooks.slack.com/***');
  });

  it('handles invalid URLs gracefully', () => {
    expect(maskUrl('not-a-url')).toBe('***invalid-url***');
  });
});

// ─── buildWebhookPayload ─────────────────────────────────────────────────────

describe('buildWebhookPayload', () => {
  it('builds a valid payload with correct schema', () => {
    const evaluation = makeEvaluation();
    const payload = buildWebhookPayload(evaluation, null);

    expect(payload.event).toBe('alert.transition');
    expect(payload.source).toBe('ventureos-dashboard');
    expect(payload.schemaVersion).toBe(1);
    expect(payload.timestamp).toBe(evaluation.evaluatedAt);
    expect(payload.timestampISO).toBeTruthy();
    expect(payload.previousSeverity).toBeNull();
    expect(payload.currentSeverity).toBe(evaluation.overallSeverity);
    expect(payload.evaluation).toBeDefined();
    expect(payload.evaluation.rules).toBeInstanceOf(Array);
  });

  it('labels escalation correctly', () => {
    const config = {
      ...DEFAULT_ALERT_CONFIG,
      stuckCount: { enabled: true, warning: 1, critical: 3 },
    };
    const evaluation = evaluateAlerts(metricsInput({ stuckCount: 5 }), config);
    const payload = buildWebhookPayload(evaluation, 'ok');
    expect(payload.transitionLabel).toContain('escalated');
    expect(payload.transitionLabel).toContain('ok → critical');
  });

  it('labels de-escalation correctly', () => {
    const evaluation = makeEvaluation();
    const payload = buildWebhookPayload(evaluation, 'critical');
    expect(payload.transitionLabel).toContain('de-escalated');
  });

  it('labels initial evaluation', () => {
    const evaluation = makeEvaluation();
    const payload = buildWebhookPayload(evaluation, null);
    expect(payload.transitionLabel).toContain('Initial evaluation');
  });

  it('includes all evaluation rule details', () => {
    const evaluation = makeEvaluation();
    const payload = buildWebhookPayload(evaluation, null);
    expect(payload.evaluation.rules.length).toBeGreaterThan(0);
    for (const rule of payload.evaluation.rules) {
      expect(rule).toHaveProperty('rule');
      expect(rule).toHaveProperty('label');
      expect(rule).toHaveProperty('severity');
      expect(rule).toHaveProperty('message');
    }
  });
});

// ─── computeSignature ────────────────────────────────────────────────────────

describe('computeSignature', () => {
  it('produces a hex string', async () => {
    const sig = await computeSignature('{"test": true}', 'secret123');
    expect(sig).toMatch(/^[0-9a-f]+$/);
    expect(sig.length).toBe(64); // SHA-256 = 32 bytes = 64 hex chars
  });

  it('produces different signatures for different secrets', async () => {
    const body = '{"test": true}';
    const sig1 = await computeSignature(body, 'secret1');
    const sig2 = await computeSignature(body, 'secret2');
    expect(sig1).not.toBe(sig2);
  });

  it('produces same signature for same inputs', async () => {
    const body = '{"test": true}';
    const sig1 = await computeSignature(body, 'same-secret');
    const sig2 = await computeSignature(body, 'same-secret');
    expect(sig1).toBe(sig2);
  });
});

// ─── isTransition ────────────────────────────────────────────────────────────

describe('isTransition', () => {
  it('returns true for first evaluation (null → any)', () => {
    expect(isTransition('ok', null)).toBe(true);
    expect(isTransition('warning', null)).toBe(true);
    expect(isTransition('critical', null)).toBe(true);
  });

  it('returns true when severity changes', () => {
    expect(isTransition('warning', 'ok')).toBe(true);
    expect(isTransition('critical', 'warning')).toBe(true);
    expect(isTransition('ok', 'critical')).toBe(true);
  });

  it('returns false when severity is unchanged', () => {
    expect(isTransition('ok', 'ok')).toBe(false);
    expect(isTransition('warning', 'warning')).toBe(false);
    expect(isTransition('critical', 'critical')).toBe(false);
  });
});

// ─── selectTargets ───────────────────────────────────────────────────────────

describe('selectTargets', () => {
  const now = Date.now();
  const emptyState: WebhookDeliveryState = { lastDeliveryAt: {}, lastSeverity: null };

  it('selects enabled targets matching severity', () => {
    const targets = [
      makeTarget({ id: 'a', enabled: true, minSeverity: 'warning' }),
      makeTarget({ id: 'b', enabled: false, minSeverity: 'warning' }),
    ];
    const selected = selectTargets(targets, 'warning', emptyState, 60000, now);
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe('a');
  });

  it('filters by minSeverity', () => {
    const targets = [
      makeTarget({ id: 'warn-only', minSeverity: 'warning' }),
      makeTarget({ id: 'crit-only', minSeverity: 'critical' }),
    ];
    const selected = selectTargets(targets, 'warning', emptyState, 60000, now);
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe('warn-only');
  });

  it('includes targets when severity exceeds minSeverity', () => {
    const targets = [
      makeTarget({ id: 'warn', minSeverity: 'warning' }),
    ];
    const selected = selectTargets(targets, 'critical', emptyState, 60000, now);
    expect(selected).toHaveLength(1);
  });

  it('excludes targets with ok severity when minSeverity is warning', () => {
    const targets = [makeTarget({ id: 'a', minSeverity: 'warning' })];
    const selected = selectTargets(targets, 'ok', emptyState, 60000, now);
    expect(selected).toHaveLength(0);
  });

  it('respects cooldown period', () => {
    const targets = [makeTarget({ id: 'a' })];
    const state: WebhookDeliveryState = {
      lastDeliveryAt: { a: now - 30000 }, // 30s ago
      lastSeverity: 'ok',
    };
    // Cooldown is 60s, last delivery was 30s ago → should be excluded
    const selected = selectTargets(targets, 'warning', state, 60000, now);
    expect(selected).toHaveLength(0);
  });

  it('includes targets past cooldown', () => {
    const targets = [makeTarget({ id: 'a' })];
    const state: WebhookDeliveryState = {
      lastDeliveryAt: { a: now - 120000 }, // 2 min ago
      lastSeverity: 'ok',
    };
    const selected = selectTargets(targets, 'warning', state, 60000, now);
    expect(selected).toHaveLength(1);
  });

  it('includes targets with minSeverity ok for any transition', () => {
    const targets = [makeTarget({ id: 'all', minSeverity: 'ok' })];
    const selected = selectTargets(targets, 'ok', emptyState, 60000, now);
    expect(selected).toHaveLength(1);
  });
});

// ─── deliverWebhook ──────────────────────────────────────────────────────────

describe('deliverWebhook', () => {
  it('returns success for 200 response', async () => {
    // Mock fetch to return 200
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', mockFetch);

    const target = makeTarget();
    const payload = buildWebhookPayload(makeEvaluation(), null);
    const result = await deliverWebhook(target, payload, { maxRetries: 1 });

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.attempts).toBe(1);
    expect(result.error).toBeNull();
    expect(result.targetId).toBe('test-target');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('retries on 500 errors', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    const target = makeTarget();
    const payload = buildWebhookPayload(makeEvaluation(), null);
    const result = await deliverWebhook(target, payload, { maxRetries: 3, timeoutMs: 5000 });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry on 4xx errors', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal('fetch', mockFetch);

    const target = makeTarget();
    const payload = buildWebhookPayload(makeEvaluation(), null);
    const result = await deliverWebhook(target, payload, { maxRetries: 3, timeoutMs: 5000 });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(404);
    expect(result.attempts).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('handles network errors with retry', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    const target = makeTarget();
    const payload = buildWebhookPayload(makeEvaluation(), null);
    const result = await deliverWebhook(target, payload, { maxRetries: 2, timeoutMs: 5000 });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('returns failure after exhausting retries', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', mockFetch);

    const target = makeTarget();
    const payload = buildWebhookPayload(makeEvaluation(), null);
    const result = await deliverWebhook(target, payload, { maxRetries: 2, timeoutMs: 5000 });

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(2);
    expect(result.error).toBe('network down');
  });

  it('sends correct headers', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    const target = makeTarget();
    const payload = buildWebhookPayload(makeEvaluation(), null);
    await deliverWebhook(target, payload, { maxRetries: 1 });

    const call = mockFetch.mock.calls[0];
    expect(call[1].headers['Content-Type']).toBe('application/json');
    expect(call[1].headers['User-Agent']).toBe('VentureOS-Dashboard/1.0');
    expect(call[1].headers['X-VentureOS-Event']).toBe('alert.transition');
  });

  it('sends HMAC signature header when secret is configured', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    const target = makeTarget({ secret: 'test-secret' });
    const payload = buildWebhookPayload(makeEvaluation(), null);
    await deliverWebhook(target, payload, { maxRetries: 1 });

    const call = mockFetch.mock.calls[0];
    expect(call[1].headers['X-VentureOS-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it('does not send signature header without secret', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    const target = makeTarget();
    const payload = buildWebhookPayload(makeEvaluation(), null);
    await deliverWebhook(target, payload, { maxRetries: 1 });

    const call = mockFetch.mock.calls[0];
    expect(call[1].headers['X-VentureOS-Signature']).toBeUndefined();
  });

  it('sends valid JSON payload', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    const target = makeTarget();
    const evaluation = makeEvaluation();
    const payload = buildWebhookPayload(evaluation, 'ok');
    await deliverWebhook(target, payload, { maxRetries: 1 });

    const call = mockFetch.mock.calls[0];
    const sentBody = JSON.parse(call[1].body);
    expect(sentBody.event).toBe('alert.transition');
    expect(sentBody.schemaVersion).toBe(1);
    expect(sentBody.source).toBe('ventureos-dashboard');
  });
});

// ─── maybeDeliverWebhooks ────────────────────────────────────────────────────

describe('maybeDeliverWebhooks', () => {
  it('returns empty when webhooks are disabled', async () => {
    writeWebhookConfig(testDataDir, { ...DEFAULT_WEBHOOK_CONFIG, enabled: false });
    const evaluation = makeEvaluation();
    const results = await maybeDeliverWebhooks(testDataDir, evaluation);
    expect(results).toHaveLength(0);
  });

  it('returns empty when no targets configured', async () => {
    writeWebhookConfig(testDataDir, { ...DEFAULT_WEBHOOK_CONFIG, enabled: true, targets: [] });
    const evaluation = makeEvaluation();
    const results = await maybeDeliverWebhooks(testDataDir, evaluation);
    expect(results).toHaveLength(0);
  });

  it('returns empty when no transition detected', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    writeWebhookConfig(testDataDir, makeConfig());

    // First call — transition from null → ok
    const eval1 = makeEvaluation();
    await maybeDeliverWebhooks(testDataDir, eval1);

    // Second call — same severity, no transition
    const eval2 = makeEvaluation();
    const results = await maybeDeliverWebhooks(testDataDir, eval2);
    expect(results).toHaveLength(0);
  });

  it('delivers on first evaluation (null → severity)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    writeWebhookConfig(testDataDir, makeConfig({
      targets: [makeTarget({ minSeverity: 'ok' })],
    }));

    const evaluation = makeEvaluation();
    const results = await maybeDeliverWebhooks(testDataDir, evaluation);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
  });

  it('delivers on severity escalation', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    const now = Date.now();

    // Configure with minSeverity: ok + zero cooldown so both transitions fire
    writeWebhookConfig(testDataDir, makeConfig({
      targets: [makeTarget({ minSeverity: 'ok' })],
      cooldownMs: 0,
    }));

    // All-ok config: high thresholds so nothing triggers
    const allOkConfig = {
      ...DEFAULT_ALERT_CONFIG,
      stuckCount: { enabled: true, warning: 100, critical: 200 },
      failedRate: { enabled: true, warning: 0.99, critical: 1.0 },
      backlogSize: { enabled: true, warning: 1000, critical: 2000 },
      avgRuntime: { enabled: false, warning: 999999, critical: 999999 },
      queueDepth: { enabled: false, warning: 999, critical: 999 },
    };

    // First call — initial evaluation at ok severity (null → ok transition)
    const okEval = evaluateAlerts(metricsInput({ stuckCount: 0 }), allOkConfig, now);
    expect(okEval.overallSeverity).toBe('ok');
    await maybeDeliverWebhooks(testDataDir, okEval, { now });

    // Verify first delivery happened
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Now escalate to warning (ok → warning transition)
    const warningConfig = {
      ...allOkConfig,
      stuckCount: { enabled: true, warning: 1, critical: 5 },
    };
    const warningEval = evaluateAlerts(metricsInput({ stuckCount: 3 }), warningConfig, now + 1);
    expect(warningEval.overallSeverity).toBe('warning');
    const results = await maybeDeliverWebhooks(testDataDir, warningEval, { now: now + 1 });
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);

    // Verify the payload has escalation label
    const lastCallBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(lastCallBody.transitionLabel).toContain('escalated');
  });

  it('updates delivery state on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    const now = Date.now();
    writeWebhookConfig(testDataDir, makeConfig({
      targets: [makeTarget({ id: 'tracked', minSeverity: 'ok' })],
    }));

    const evaluation = makeEvaluation();
    await maybeDeliverWebhooks(testDataDir, evaluation, { now });

    const state = getDeliveryState();
    expect(state.lastSeverity).toBe(evaluation.overallSeverity);
    expect(state.lastDeliveryAt['tracked']).toBe(now);
  });

  it('delivers to multiple targets concurrently', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    writeWebhookConfig(testDataDir, makeConfig({
      targets: [
        makeTarget({ id: 'a', minSeverity: 'ok' }),
        makeTarget({ id: 'b', minSeverity: 'ok' }),
      ],
    }));

    const evaluation = makeEvaluation();
    const results = await maybeDeliverWebhooks(testDataDir, evaluation);
    expect(results).toHaveLength(2);
    expect(results.every(r => r.success)).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

// ─── API Routes ──────────────────────────────────────────────────────────────

describe('GET /api/task-board/webhooks/config', () => {
  it('returns default config when no file exists', async () => {
    const req = mockRequest({ url: '/api/task-board/webhooks/config' });
    const res = mockResponse();
    const deps = createDeps();

    const handled = await handleTaskBoard(req, res, deps);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);

    const body = parseJsonBody<{ config: WebhookConfig }>(res);
    expect(body.config.enabled).toBe(false);
    expect(body.config.targets).toHaveLength(0);
  });

  it('returns persisted config with secrets redacted', async () => {
    writeWebhookConfig(testDataDir, makeConfig({
      targets: [makeTarget({ secret: 'super-secret' })],
    }));

    const req = mockRequest({ url: '/api/task-board/webhooks/config' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const body = parseJsonBody<{ config: Record<string, unknown> }>(res);
    expect((body.config.targets as Array<Record<string, unknown>>)[0].hasSecret).toBe(true);
    expect((body.config.targets as Array<Record<string, unknown>>)[0].secret).toBeUndefined();
  });
});

describe('PUT /api/task-board/webhooks/config', () => {
  it('writes valid config and returns redacted', async () => {
    const input = {
      enabled: true,
      targets: [{
        id: 'slack',
        name: 'Slack',
        url: 'https://hooks.slack.com/hook',
        enabled: true,
        secret: 'my-secret',
      }],
    };

    const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
    const res = mockResponse();
    const deps = createDeps({
      readRequestBody: async () => JSON.stringify(input),
    });

    await handleTaskBoard(req, res, deps);
    expect(res._statusCode).toBe(200);

    const body = parseJsonBody<{ config: Record<string, unknown> }>(res);
    expect(body.config.enabled).toBe(true);
    expect((body.config.targets as Array<Record<string, unknown>>)[0].hasSecret).toBe(true);

    // Verify persisted on disk (with secret intact)
    const onDisk = readWebhookConfig(testDataDir);
    expect(onDisk.targets[0].secret).toBe('my-secret');
  });

  it('rejects invalid config with 400', async () => {
    const input = {
      enabled: 'not-boolean',
      targets: [{ url: 'not-a-url' }],
    };

    const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
    const res = mockResponse();
    const deps = createDeps({
      readRequestBody: async () => JSON.stringify(input),
    });

    await handleTaskBoard(req, res, deps);
    expect(res._statusCode).toBe(400);

    const body = parseJsonBody<{ error: string; errors: unknown[] }>(res);
    expect(body.error).toBe('validation failed');
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it('rejects invalid JSON with 400', async () => {
    const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
    const res = mockResponse();
    const deps = createDeps({
      readRequestBody: async () => '{invalid',
    });

    await handleTaskBoard(req, res, deps);
    expect(res._statusCode).toBe(400);
  });
});

// ─── Failure isolation ───────────────────────────────────────────────────────

describe('failure isolation', () => {
  it('webhook delivery failure does not affect alert evaluation', async () => {
    // Simulate a config that would trigger delivery, but fetch fails
    const mockFetch = vi.fn().mockRejectedValue(new Error('network error'));
    vi.stubGlobal('fetch', mockFetch);

    writeWebhookConfig(testDataDir, makeConfig({
      targets: [makeTarget({ minSeverity: 'ok' })],
    }));

    const evaluation = makeEvaluation();
    // This should not throw
    const results = await maybeDeliverWebhooks(testDataDir, evaluation);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toBe('network error');
  });

  it('corrupt webhook config does not crash', () => {
    fs.writeFileSync(
      path.join(testDataDir, 'task-board-webhook-config.json'),
      'not-json-at-all',
    );
    const config = readWebhookConfig(testDataDir);
    expect(config.enabled).toBe(false);
    expect(config.targets).toHaveLength(0);
  });
});

// ─── Delivery state management ───────────────────────────────────────────────

describe('delivery state', () => {
  it('resetDeliveryState clears all state', () => {
    // Modify state
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    resetDeliveryState();
    const state = getDeliveryState();
    expect(state.lastSeverity).toBeNull();
    expect(Object.keys(state.lastDeliveryAt)).toHaveLength(0);
  });
});

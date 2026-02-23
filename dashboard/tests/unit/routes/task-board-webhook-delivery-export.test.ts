/**
 * Webhook Delivery History Export tests — Issue #219, Phase 17.
 *
 * Tests for:
 * - csvEscape() — CSV value escaping edge cases
 * - deliveryEventsToCsv() — CSV format correctness, headers, data rows
 * - deliveryEventsToJson() — JSON export structure and safety
 * - exportDeliveryHistory() — full export pipeline with filters
 * - exportRetryActivity() — retry-specific export pipeline
 * - GET /api/task-board/webhooks/deliveries/export — API endpoint
 * - GET /api/task-board/webhooks/retries/export — API endpoint
 * - Filter parity — export respects same filters as query endpoints
 * - Secret safety — export never contains raw URLs or secrets
 * - Bounded output — max 200 events enforced
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import {
  handleTaskBoard,
} from '../../../server/routes/task-board.js';
import {
  appendDeliveryEvents,
  queryDeliveryHistory,
  csvEscape,
  deliveryEventsToCsv,
  deliveryEventsToJson,
  exportDeliveryHistory,
  exportRetryActivity,
  EXPORT_MAX_EVENTS,
} from '../../../server/webhook-delivery-history.js';
import type {
  WebhookDeliveryEvent,
  WebhookDeliveryHistoryFile,
  ExportResult,
} from '../../../server/webhook-delivery-history.js';
import type { TaskBoardDeps } from '../../../server/types.js';

const testDataDir = path.join('/tmp', 'test-delivery-export-' + process.pid);

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

beforeEach(() => {
  fs.mkdirSync(testDataDir, { recursive: true });
});

afterEach(() => {
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
  vi.restoreAllMocks();
});

// ─── csvEscape ───────────────────────────────────────────────────────────────

describe('csvEscape', () => {
  it('returns empty string for null', () => {
    expect(csvEscape(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(csvEscape(undefined)).toBe('');
  });

  it('passes through simple strings unchanged', () => {
    expect(csvEscape('hello')).toBe('hello');
  });

  it('handles numbers', () => {
    expect(csvEscape(200)).toBe('200');
  });

  it('handles booleans', () => {
    expect(csvEscape(true)).toBe('true');
    expect(csvEscape(false)).toBe('false');
  });

  it('wraps strings with commas in double quotes', () => {
    expect(csvEscape('hello, world')).toBe('"hello, world"');
  });

  it('wraps strings with double quotes and escapes inner quotes', () => {
    expect(csvEscape('she said "hi"')).toBe('"she said ""hi"""');
  });

  it('wraps strings with newlines in double quotes', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });

  it('wraps strings with carriage returns in double quotes', () => {
    expect(csvEscape('line1\rline2')).toBe('"line1\rline2"');
  });

  it('handles strings with all special characters', () => {
    const result = csvEscape('a,"b"\nc');
    expect(result).toBe('"a,""b""\nc"');
  });
});

// ─── deliveryEventsToCsv ─────────────────────────────────────────────────────

describe('deliveryEventsToCsv', () => {
  it('returns header row for empty array', () => {
    const csv = deliveryEventsToCsv([]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('id');
    expect(lines[0]).toContain('timestamp');
    expect(lines[0]).toContain('targetId');
    expect(lines[0]).toContain('success');
  });

  it('produces correct number of rows', () => {
    const events: WebhookDeliveryEvent[] = [
      {
        id: 1, ts: 1700000000000, targetId: 'slack', targetName: 'Slack',
        success: true, statusCode: 200, attempts: 1, durationMs: 100,
        error: null, maskedUrl: 'https://hooks.slack.com/***',
        triggerSeverity: 'warning', previousSeverity: 'ok',
      },
      {
        id: 2, ts: 1700000060000, targetId: 'discord', targetName: 'Discord',
        success: false, statusCode: 503, attempts: 3, durationMs: 5000,
        error: 'Service Unavailable', maskedUrl: 'https://discord.com/***',
        triggerSeverity: 'critical', previousSeverity: 'warning',
      },
    ];

    const csv = deliveryEventsToCsv(events);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3); // header + 2 data rows
  });

  it('includes all expected columns in header', () => {
    const csv = deliveryEventsToCsv([]);
    const headers = csv.split('\n')[0].split(',');
    const expected = ['id', 'timestamp', 'targetId', 'targetName', 'success',
      'statusCode', 'attempts', 'durationMs', 'error',
      'maskedUrl', 'triggerSeverity', 'previousSeverity'];
    expect(headers).toEqual(expected);
  });

  it('formats timestamps as ISO 8601', () => {
    const events: WebhookDeliveryEvent[] = [{
      id: 1, ts: 1700000000000, targetId: 't', targetName: 'T',
      success: true, statusCode: 200, attempts: 1, durationMs: 100,
      error: null, maskedUrl: 'https://x.com/***',
      triggerSeverity: 'ok', previousSeverity: null,
    }];

    const csv = deliveryEventsToCsv(events);
    const dataRow = csv.split('\n')[1];
    expect(dataRow).toContain('2023-11-14T'); // ISO timestamp from epoch 1700000000000
  });

  it('properly escapes CSV special characters in error messages', () => {
    const events: WebhookDeliveryEvent[] = [{
      id: 1, ts: 1700000000000, targetId: 't', targetName: 'T',
      success: false, statusCode: 500, attempts: 1, durationMs: 100,
      error: 'error with "quotes" and, commas', maskedUrl: 'https://x.com/***',
      triggerSeverity: 'warning', previousSeverity: 'ok',
    }];

    const csv = deliveryEventsToCsv(events);
    const dataRow = csv.split('\n')[1];
    // Should be properly quoted/escaped
    expect(dataRow).toContain('"error with ""quotes"" and, commas"');
  });

  it('never contains the word "secret" or raw URLs', () => {
    const events: WebhookDeliveryEvent[] = [{
      id: 1, ts: 1700000000000, targetId: 't', targetName: 'T',
      success: true, statusCode: 200, attempts: 1, durationMs: 100,
      error: null, maskedUrl: 'https://hooks.slack.com/***',
      triggerSeverity: 'warning', previousSeverity: 'ok',
    }];

    const csv = deliveryEventsToCsv(events);
    expect(csv).not.toContain('/services/');
    expect(csv).not.toContain('secret-path');
    expect(csv).toContain('https://hooks.slack.com/***');
  });
});

// ─── deliveryEventsToJson ────────────────────────────────────────────────────

describe('deliveryEventsToJson', () => {
  it('returns valid JSON with metadata', () => {
    const json = deliveryEventsToJson([]);
    const parsed = JSON.parse(json);
    expect(parsed.format).toBe('ventureos-webhook-delivery-export-v1');
    expect(parsed.exportedAt).toBeDefined();
    expect(parsed.count).toBe(0);
    expect(parsed.events).toEqual([]);
  });

  it('includes all events with sanitized fields', () => {
    const events: WebhookDeliveryEvent[] = [{
      id: 1, ts: 1700000000000, targetId: 'slack', targetName: 'Slack',
      success: true, statusCode: 200, attempts: 1, durationMs: 100,
      error: null, maskedUrl: 'https://hooks.slack.com/***',
      triggerSeverity: 'warning', previousSeverity: 'ok',
    }];

    const json = deliveryEventsToJson(events);
    const parsed = JSON.parse(json);
    expect(parsed.count).toBe(1);
    expect(parsed.events[0].id).toBe(1);
    expect(parsed.events[0].timestamp).toBeDefined();
    expect(parsed.events[0].maskedUrl).toBe('https://hooks.slack.com/***');
  });

  it('strips attempt details from export (flat format)', () => {
    const events: WebhookDeliveryEvent[] = [{
      id: 1, ts: 1700000000000, targetId: 't', targetName: 'T',
      success: true, statusCode: 200, attempts: 2, durationMs: 200,
      error: null, maskedUrl: 'https://x.com/***',
      triggerSeverity: 'warning', previousSeverity: 'ok',
      attemptDetails: [
        { attempt: 1, ts: 1700000000000, statusCode: 503, error: 'fail', durationMs: 100, nextRetryDelayMs: 1000 },
        { attempt: 2, ts: 1700000001000, statusCode: 200, error: null, durationMs: 100, nextRetryDelayMs: null },
      ],
    }];

    const json = deliveryEventsToJson(events);
    const parsed = JSON.parse(json);
    // Sanitized export should NOT include attemptDetails (implementation detail)
    expect(parsed.events[0]).not.toHaveProperty('attemptDetails');
  });

  it('never contains raw URL or secret fields', () => {
    const events: WebhookDeliveryEvent[] = [{
      id: 1, ts: 1700000000000, targetId: 't', targetName: 'T',
      success: true, statusCode: 200, attempts: 1, durationMs: 100,
      error: null, maskedUrl: 'https://hooks.slack.com/***',
      triggerSeverity: 'warning', previousSeverity: 'ok',
    }];

    const json = deliveryEventsToJson(events);
    const parsed = JSON.parse(json);
    for (const event of parsed.events) {
      expect(event).not.toHaveProperty('url');
      expect(event).not.toHaveProperty('secret');
      expect(event).toHaveProperty('maskedUrl');
    }
  });
});

// ─── exportDeliveryHistory ───────────────────────────────────────────────────

describe('exportDeliveryHistory', () => {
  it('returns JSON export by default', () => {
    seedEvents([
      { success: true },
      { success: false, error: 'timeout' },
    ]);

    const result = exportDeliveryHistory(testDataDir);
    expect(result.contentType).toContain('application/json');
    expect(result.filename).toMatch(/^webhook-deliveries-\d{4}-\d{2}-\d{2}\.json$/);
    expect(result.count).toBe(2);

    const parsed = JSON.parse(result.content);
    expect(parsed.events).toHaveLength(2);
    expect(parsed.format).toBe('ventureos-webhook-delivery-export-v1');
  });

  it('returns CSV export when format=csv', () => {
    seedEvents([
      { success: true },
      { success: false, error: 'fail' },
    ]);

    const result = exportDeliveryHistory(testDataDir, { format: 'csv' });
    expect(result.contentType).toContain('text/csv');
    expect(result.filename).toMatch(/^webhook-deliveries-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(result.count).toBe(2);

    const lines = result.content.split('\n');
    expect(lines).toHaveLength(3); // header + 2 rows
  });

  it('respects status filter', () => {
    seedEvents([
      { success: true },
      { success: false, error: 'fail' },
      { success: true },
    ]);

    const result = exportDeliveryHistory(testDataDir, { format: 'json', status: 'failure' });
    const parsed = JSON.parse(result.content);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0].success).toBe(false);
  });

  it('respects targetId filter', () => {
    seedEvents([
      { targetId: 'slack' },
      { targetId: 'discord' },
      { targetId: 'slack' },
    ]);

    const result = exportDeliveryHistory(testDataDir, { format: 'json', targetId: 'slack' });
    const parsed = JSON.parse(result.content);
    expect(parsed.events).toHaveLength(2);
    expect(parsed.events.every((e: Record<string, unknown>) => e.targetId === 'slack')).toBe(true);
  });

  it('respects sinceMs time window', () => {
    const now = Date.now();
    seedEvents([
      { ts: now - 7200000, targetId: 'old' },  // 2h ago
      { ts: now - 1800000, targetId: 'recent' }, // 30min ago
      { ts: now - 600000, targetId: 'newest' },  // 10min ago
    ]);

    const result = exportDeliveryHistory(testDataDir, {
      format: 'json', sinceMs: 3600000, now, // last 1h
    });
    const parsed = JSON.parse(result.content);
    expect(parsed.events).toHaveLength(2);
  });

  it('enforces EXPORT_MAX_EVENTS limit', () => {
    // Seed 200 events (max retention)
    const events = Array.from({ length: 200 }, (_, i) => ({
      targetId: 't' + i,
      success: true,
    }));
    seedEvents(events);

    const result = exportDeliveryHistory(testDataDir, { format: 'json', limit: 999 });
    const parsed = JSON.parse(result.content);
    expect(parsed.events.length).toBeLessThanOrEqual(EXPORT_MAX_EVENTS);
  });

  it('returns empty export when no events', () => {
    const result = exportDeliveryHistory(testDataDir, { format: 'csv' });
    expect(result.count).toBe(0);

    const lines = result.content.split('\n');
    expect(lines).toHaveLength(1); // header only
  });
});

// ─── exportRetryActivity ─────────────────────────────────────────────────────

describe('exportRetryActivity', () => {
  it('returns JSON export with retry summary', () => {
    seedEvents([
      { attempts: 1, success: true },
      { attempts: 3, success: true },
      { attempts: 2, success: false, error: 'timeout' },
    ]);

    const result = exportRetryActivity(testDataDir);
    expect(result.contentType).toContain('application/json');
    expect(result.filename).toMatch(/^webhook-retries-\d{4}-\d{2}-\d{2}\.json$/);
    expect(result.count).toBe(2); // only events with attempts > 1

    const parsed = JSON.parse(result.content);
    expect(parsed.format).toBe('ventureos-webhook-retry-export-v1');
    expect(parsed.summary).toBeDefined();
    expect(parsed.summary.retriedDeliveries).toBe(2);
  });

  it('returns CSV export for retries', () => {
    seedEvents([
      { attempts: 1, success: true },
      { attempts: 3, success: true },
      { attempts: 2, success: false, error: 'err' },
    ]);

    const result = exportRetryActivity(testDataDir, { format: 'csv' });
    expect(result.contentType).toContain('text/csv');
    expect(result.count).toBe(2);

    const lines = result.content.split('\n');
    expect(lines).toHaveLength(3); // header + 2 data rows
  });

  it('respects targetId filter', () => {
    seedEvents([
      { targetId: 'a', attempts: 3 },
      { targetId: 'b', attempts: 2 },
      { targetId: 'a', attempts: 2 },
    ]);

    const result = exportRetryActivity(testDataDir, { format: 'json', targetId: 'a' });
    const parsed = JSON.parse(result.content);
    expect(parsed.events.every((e: Record<string, unknown>) => e.targetId === 'a')).toBe(true);
  });

  it('returns empty when no retries needed', () => {
    seedEvents([
      { attempts: 1, success: true },
      { attempts: 1, success: true },
    ]);

    const result = exportRetryActivity(testDataDir, { format: 'json' });
    expect(result.count).toBe(0);
    const parsed = JSON.parse(result.content);
    expect(parsed.events).toHaveLength(0);
  });
});

// ─── API Routes ──────────────────────────────────────────────────────────────

describe('GET /api/task-board/webhooks/deliveries/export', () => {
  it('returns CSV download with correct headers', async () => {
    seedEvents([
      { success: true },
      { success: false, error: 'timeout' },
    ]);

    const req = mockRequest({ url: '/api/task-board/webhooks/deliveries/export?format=csv' });
    const res = mockResponse();
    const deps = createDeps();

    const handled = await handleTaskBoard(req, res, deps);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);
    expect(res._headers['content-type']).toContain('text/csv');
    expect(res._headers['content-disposition']).toContain('attachment');
    expect(res._headers['content-disposition']).toContain('.csv');
    expect(res._headers['cache-control']).toBe('no-store');
    expect(res._headers['x-export-count']).toBeDefined();

    // Body should be valid CSV
    const lines = res._body.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(2); // header + at least 1 row
    expect(lines[0]).toContain('id');
  });

  it('returns JSON download by default', async () => {
    seedEvents([{ success: true }]);

    const req = mockRequest({ url: '/api/task-board/webhooks/deliveries/export' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    expect(res._statusCode).toBe(200);
    expect(res._headers['content-type']).toContain('application/json');
    expect(res._headers['content-disposition']).toContain('.json');

    const parsed = JSON.parse(res._body);
    expect(parsed.format).toBe('ventureos-webhook-delivery-export-v1');
    expect(parsed.events).toHaveLength(1);
  });

  it('respects query filters', async () => {
    seedEvents([
      { success: true, targetId: 'slack' },
      { success: false, targetId: 'discord', error: 'fail' },
      { success: true, targetId: 'slack' },
    ]);

    const req = mockRequest({
      url: '/api/task-board/webhooks/deliveries/export?format=json&status=success&targetId=slack',
    });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const parsed = JSON.parse(res._body);
    expect(parsed.events).toHaveLength(2);
    expect(parsed.events.every((e: Record<string, unknown>) => e.targetId === 'slack')).toBe(true);
    expect(parsed.events.every((e: Record<string, unknown>) => e.success === true)).toBe(true);
  });

  it('returns empty export for no matching events', async () => {
    const req = mockRequest({ url: '/api/task-board/webhooks/deliveries/export?format=csv' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    expect(res._statusCode).toBe(200);
    // Should still have header row
    const lines = res._body.split('\n');
    expect(lines).toHaveLength(1);
  });
});

describe('GET /api/task-board/webhooks/retries/export', () => {
  it('returns CSV download for retries', async () => {
    seedEvents([
      { attempts: 1, success: true },
      { attempts: 3, success: true },
      { attempts: 2, success: false, error: 'fail' },
    ]);

    const req = mockRequest({ url: '/api/task-board/webhooks/retries/export?format=csv' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    expect(res._statusCode).toBe(200);
    expect(res._headers['content-type']).toContain('text/csv');
    expect(res._headers['content-disposition']).toContain('retries');

    const lines = res._body.split('\n');
    expect(lines).toHaveLength(3); // header + 2 retried events
  });

  it('returns JSON download with summary', async () => {
    seedEvents([
      { attempts: 1, success: true },
      { attempts: 3, success: true },
    ]);

    const req = mockRequest({ url: '/api/task-board/webhooks/retries/export?format=json' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    expect(res._statusCode).toBe(200);
    const parsed = JSON.parse(res._body);
    expect(parsed.format).toBe('ventureos-webhook-retry-export-v1');
    expect(parsed.summary).toBeDefined();
    expect(parsed.events).toHaveLength(1);
  });

  it('respects targetId filter', async () => {
    seedEvents([
      { targetId: 'a', attempts: 3 },
      { targetId: 'b', attempts: 2 },
    ]);

    const req = mockRequest({
      url: '/api/task-board/webhooks/retries/export?format=json&targetId=a',
    });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const parsed = JSON.parse(res._body);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0].targetId).toBe('a');
  });
});

// ─── Filter parity ───────────────────────────────────────────────────────────

describe('filter parity between query and export', () => {
  it('export returns same events as query with identical filters', () => {
    const now = Date.now();
    seedEvents([
      { ts: now - 7200000, targetId: 'a', success: true },
      { ts: now - 1800000, targetId: 'b', success: false, error: 'err' },
      { ts: now - 600000, targetId: 'a', success: true },
    ]);

    // Use same filters for both
    const filters = {
      sinceMs: 3600000,
      targetId: 'a',
      status: 'success' as const,
      now,
    };

    // Query result (the reference)
    const queryResult = queryDeliveryHistory(testDataDir, { ...filters, limit: 200 });

    // Export result
    const exportResult = exportDeliveryHistory(testDataDir, { ...filters, format: 'json' });
    const exportParsed = JSON.parse(exportResult.content);

    expect(exportParsed.events.length).toBe(queryResult.events.length);
    expect(exportParsed.count).toBe(queryResult.count);
    // Verify same event IDs
    const queryIds = queryResult.events.map((e: WebhookDeliveryEvent) => e.id);
    const exportIds = exportParsed.events.map((e: Record<string, unknown>) => e.id);
    expect(exportIds).toEqual(queryIds);
  });
});

// ─── Secret safety (export-specific) ─────────────────────────────────────────

describe('export secret safety', () => {
  it('CSV export never contains raw webhook URLs', () => {
    const secretUrl = 'https://hooks.slack.com/services/T00/B00/xoxb-secret-token-value';
    appendDeliveryEvents(
      testDataDir,
      [sampleResult()],
      [sampleContext({ url: secretUrl })],
    );

    const result = exportDeliveryHistory(testDataDir, { format: 'csv' });

    expect(result.content).not.toContain('xoxb-secret-token-value');
    expect(result.content).not.toContain('/services/T00');
    expect(result.content).not.toContain('/B00/');
    expect(result.content).toContain('hooks.slack.com/***');
  });

  it('JSON export never contains raw webhook URLs', () => {
    const secretUrl = 'https://hooks.slack.com/services/T00/B00/xoxb-secret-token-value';
    appendDeliveryEvents(
      testDataDir,
      [sampleResult()],
      [sampleContext({ url: secretUrl })],
    );

    const result = exportDeliveryHistory(testDataDir, { format: 'json' });

    expect(result.content).not.toContain('xoxb-secret-token-value');
    expect(result.content).not.toContain('/services/T00');
    expect(result.content).not.toContain('/B00/');
    expect(result.content).toContain('hooks.slack.com/***');
  });

  it('export does not include url or secret fields', () => {
    appendDeliveryEvents(
      testDataDir,
      [sampleResult()],
      [sampleContext()],
    );

    const result = exportDeliveryHistory(testDataDir, { format: 'json' });
    const parsed = JSON.parse(result.content);

    for (const event of parsed.events) {
      expect(event).not.toHaveProperty('url');
      expect(event).not.toHaveProperty('secret');
      expect(event).toHaveProperty('maskedUrl');
    }
  });

  it('retry export also applies secret safety', () => {
    appendDeliveryEvents(
      testDataDir,
      [sampleResult({ attempts: 3 })],
      [sampleContext({ url: 'https://secret-webhook.com/path/to/token' })],
    );

    const result = exportRetryActivity(testDataDir, { format: 'json' });
    expect(result.content).not.toContain('/path/to/token');
    expect(result.content).toContain('secret-webhook.com/***');
  });
});

// ─── Bounded output ──────────────────────────────────────────────────────────

describe('bounded output', () => {
  it('EXPORT_MAX_EVENTS is 200', () => {
    expect(EXPORT_MAX_EVENTS).toBe(200);
  });

  it('export caps at EXPORT_MAX_EVENTS regardless of limit param', () => {
    // Seed max events
    const events = Array.from({ length: 200 }, (_, i) => ({
      targetId: 'target-' + (i % 3),
      success: i % 2 === 0,
    }));
    seedEvents(events);

    const result = exportDeliveryHistory(testDataDir, { format: 'json', limit: 999 });
    const parsed = JSON.parse(result.content);
    expect(parsed.events.length).toBeLessThanOrEqual(EXPORT_MAX_EVENTS);
  });
});

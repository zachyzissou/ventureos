/**
 * Escalation History Export tests — Issue #219, Phase 23.
 *
 * Tests for:
 * - csvEscapeEscalation() — CSV value escaping edge cases
 * - escalationEventsToCsv() — CSV format correctness, headers, data rows
 * - escalationEventsToJson() — JSON export structure and safety
 * - exportEscalationHistory() — full export pipeline with filters
 * - GET /api/task-board/escalation/history/export — API endpoint
 * - Filter parity — export respects same filters as query endpoint
 * - Secret safety — export never contains raw URLs, secrets, or delivery detail internals
 * - Bounded output — max 200 events enforced
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  readEscalationHistory,
  appendEscalationEvent,
  appendEscalationReset,
  queryEscalationHistory,
  csvEscapeEscalation,
  escalationEventsToCsv,
  escalationEventsToJson,
  exportEscalationHistory,
  ESCALATION_EXPORT_MAX_EVENTS,
} from '../../../server/escalation-history.js';
import type {
  EscalationHistoryEvent,
  EscalationHistoryFile,
  EscalationDeliveryOutcome,
  EscalationExportResult,
} from '../../../server/escalation-history.js';
import { mockRequest, mockResponse } from '../../helpers.js';
import { handleTaskBoard } from '../../../server/routes/task-board.js';
import type { TaskBoardDeps } from '../../../server/types.js';

// ─── Test Setup ──────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'esc-hist-export-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const NOW = 1_700_000_000_000;

function createDeps(overrides: Partial<TaskBoardDeps> = {}): TaskBoardDeps {
  return {
    dataDir: tmpDir,
    sendJson: (res, data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    },
    readRequestBody: async () => '{}',
    ...overrides,
  };
}

function makeDelivery(overrides: Partial<EscalationDeliveryOutcome> = {}): EscalationDeliveryOutcome {
  return {
    targetId: 'slack',
    targetName: 'Slack',
    success: true,
    statusCode: 200,
    attempts: 1,
    durationMs: 150,
    error: null,
    ...overrides,
  };
}

function makeEvent(
  overrides: Partial<Omit<EscalationHistoryEvent, 'id'>> = {},
): Omit<EscalationHistoryEvent, 'id' | 'ts'> & { ts?: number } {
  return {
    ts: NOW,
    eventType: 'tier_triggered',
    tierIndex: 0,
    tierLabel: 'Page on-call',
    qualifyingSeverity: 'critical',
    qualifyingDurationMs: 300_000,
    reason: 'tier 1 triggered (300s persisted, threshold 300s)',
    deliveries: [makeDelivery()],
    deliverySuccessCount: 1,
    deliveryFailureCount: 0,
    ...overrides,
  };
}

function seedEvents() {
  appendEscalationEvent(tmpDir, makeEvent({
    ts: NOW - 3000, eventType: 'tier_triggered', tierIndex: 0, tierLabel: 'Tier 1',
    deliveries: [makeDelivery({ success: true })], deliverySuccessCount: 1, deliveryFailureCount: 0,
  }));
  appendEscalationEvent(tmpDir, makeEvent({
    ts: NOW - 2000, eventType: 'tier_triggered', tierIndex: 1, tierLabel: 'Tier 2',
    deliveries: [makeDelivery({ targetId: 'discord', targetName: 'Discord', success: false, error: 'Timeout', statusCode: null })],
    deliverySuccessCount: 0, deliveryFailureCount: 1,
  }));
  appendEscalationEvent(tmpDir, makeEvent({
    ts: NOW - 1000, eventType: 'tier_renotified', tierIndex: 0, tierLabel: 'Tier 1',
    deliveries: [makeDelivery({ success: true })], deliverySuccessCount: 1, deliveryFailureCount: 0,
  }));
  appendEscalationReset(tmpDir, {
    qualifyingSeverity: 'critical', qualifyingDurationMs: 600_000, ts: NOW,
  });
}

// ─── csvEscapeEscalation ─────────────────────────────────────────────────────

describe('csvEscapeEscalation', () => {
  it('returns empty string for null', () => {
    expect(csvEscapeEscalation(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(csvEscapeEscalation(undefined)).toBe('');
  });

  it('passes through simple strings unchanged', () => {
    expect(csvEscapeEscalation('hello')).toBe('hello');
  });

  it('handles numbers', () => {
    expect(csvEscapeEscalation(200)).toBe('200');
  });

  it('handles booleans', () => {
    expect(csvEscapeEscalation(true)).toBe('true');
    expect(csvEscapeEscalation(false)).toBe('false');
  });

  it('wraps strings with commas in double quotes', () => {
    expect(csvEscapeEscalation('hello, world')).toBe('"hello, world"');
  });

  it('wraps strings with double quotes and escapes inner quotes', () => {
    expect(csvEscapeEscalation('she said "hi"')).toBe('"she said ""hi"""');
  });

  it('wraps strings with newlines in double quotes', () => {
    expect(csvEscapeEscalation('line1\nline2')).toBe('"line1\nline2"');
  });

  it('wraps strings with carriage returns in double quotes', () => {
    expect(csvEscapeEscalation('line1\rline2')).toBe('"line1\rline2"');
  });

  it('handles strings with all special characters', () => {
    const result = csvEscapeEscalation('a,"b"\nc');
    expect(result).toBe('"a,""b""\nc"');
  });
});

// ─── escalationEventsToCsv ───────────────────────────────────────────────────

describe('escalationEventsToCsv', () => {
  it('returns header row for empty array', () => {
    const csv = escalationEventsToCsv([]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('id');
    expect(lines[0]).toContain('timestamp');
    expect(lines[0]).toContain('eventType');
    expect(lines[0]).toContain('tierIndex');
    expect(lines[0]).toContain('deliverySuccessCount');
  });

  it('includes all expected columns in header', () => {
    const csv = escalationEventsToCsv([]);
    const headers = csv.split('\n')[0].split(',');
    const expected = [
      'id', 'timestamp', 'eventType', 'tierIndex', 'tierLabel',
      'qualifyingSeverity', 'qualifyingDurationMs', 'reason',
      'deliverySuccessCount', 'deliveryFailureCount', 'deliveryTargets',
    ];
    expect(headers).toEqual(expected);
  });

  it('produces correct number of rows', () => {
    const events: EscalationHistoryEvent[] = [
      {
        id: 1, ts: NOW, eventType: 'tier_triggered', tierIndex: 0, tierLabel: 'Tier 1',
        qualifyingSeverity: 'critical', qualifyingDurationMs: 300_000,
        reason: 'test', deliveries: [makeDelivery()], deliverySuccessCount: 1, deliveryFailureCount: 0,
      },
      {
        id: 2, ts: NOW + 1000, eventType: 'escalation_reset', tierIndex: null, tierLabel: null,
        qualifyingSeverity: 'critical', qualifyingDurationMs: 600_000,
        reason: 'reset', deliveries: [], deliverySuccessCount: 0, deliveryFailureCount: 0,
      },
    ];

    const csv = escalationEventsToCsv(events);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3); // header + 2 data rows
  });

  it('formats timestamps as ISO 8601', () => {
    const events: EscalationHistoryEvent[] = [{
      id: 1, ts: 1700000000000, eventType: 'tier_triggered', tierIndex: 0, tierLabel: 'T1',
      qualifyingSeverity: 'critical', qualifyingDurationMs: 300_000,
      reason: 'test', deliveries: [], deliverySuccessCount: 0, deliveryFailureCount: 0,
    }];

    const csv = escalationEventsToCsv(events);
    const dataRow = csv.split('\n')[1];
    expect(dataRow).toContain('2023-11-14T'); // ISO from epoch 1700000000000
  });

  it('properly escapes CSV special characters in reason messages', () => {
    const events: EscalationHistoryEvent[] = [{
      id: 1, ts: NOW, eventType: 'tier_triggered', tierIndex: 0, tierLabel: 'T1',
      qualifyingSeverity: 'critical', qualifyingDurationMs: 300_000,
      reason: 'tier triggered, reason: "critical" threshold exceeded',
      deliveries: [], deliverySuccessCount: 0, deliveryFailureCount: 0,
    }];

    const csv = escalationEventsToCsv(events);
    // The reason contains commas and quotes, so it should be escaped
    expect(csv).toContain('"tier triggered, reason: ""critical"" threshold exceeded"');
  });

  it('properly escapes CSV values with embedded newlines', () => {
    const events: EscalationHistoryEvent[] = [{
      id: 1, ts: NOW, eventType: 'tier_triggered', tierIndex: 0, tierLabel: 'T1',
      qualifyingSeverity: 'critical', qualifyingDurationMs: 300_000,
      reason: 'line1\nline2',
      deliveries: [], deliverySuccessCount: 0, deliveryFailureCount: 0,
    }];

    const csv = escalationEventsToCsv(events);
    // Reason with newline should be wrapped in double quotes
    expect(csv).toContain('"line1\nline2"');
  });

  it('joins delivery target names with semicolons', () => {
    const events: EscalationHistoryEvent[] = [{
      id: 1, ts: NOW, eventType: 'tier_triggered', tierIndex: 0, tierLabel: 'T1',
      qualifyingSeverity: 'critical', qualifyingDurationMs: 300_000,
      reason: 'test',
      deliveries: [
        makeDelivery({ targetName: 'Slack' }),
        makeDelivery({ targetId: 'discord', targetName: 'Discord' }),
      ],
      deliverySuccessCount: 2, deliveryFailureCount: 0,
    }];

    const csv = escalationEventsToCsv(events);
    const dataRow = csv.split('\n')[1];
    expect(dataRow).toContain('Slack; Discord');
  });

  it('does not contain delivery detail fields (targetId, statusCode, error, durationMs)', () => {
    const events: EscalationHistoryEvent[] = [{
      id: 1, ts: NOW, eventType: 'tier_triggered', tierIndex: 0, tierLabel: 'T1',
      qualifyingSeverity: 'critical', qualifyingDurationMs: 300_000,
      reason: 'test',
      deliveries: [makeDelivery({ error: 'Connection refused', statusCode: 503, durationMs: 5000 })],
      deliverySuccessCount: 0, deliveryFailureCount: 1,
    }];

    const csv = escalationEventsToCsv(events);
    const header = csv.split('\n')[0];
    // Headers should not include delivery detail columns
    expect(header).not.toContain('statusCode');
    expect(header).not.toContain('durationMs');
    expect(header).not.toContain('error');
    expect(header).not.toContain('attempts');
  });
});

// ─── escalationEventsToJson ──────────────────────────────────────────────────

describe('escalationEventsToJson', () => {
  it('returns valid JSON with metadata', () => {
    const json = escalationEventsToJson([]);
    const parsed = JSON.parse(json);
    expect(parsed.format).toBe('ventureos-escalation-history-export-v1');
    expect(parsed.exportedAt).toBeDefined();
    expect(parsed.count).toBe(0);
    expect(parsed.events).toEqual([]);
  });

  it('includes all events with sanitized fields', () => {
    const events: EscalationHistoryEvent[] = [{
      id: 1, ts: NOW, eventType: 'tier_triggered', tierIndex: 0, tierLabel: 'Tier 1',
      qualifyingSeverity: 'critical', qualifyingDurationMs: 300_000,
      reason: 'test', deliveries: [makeDelivery()], deliverySuccessCount: 1, deliveryFailureCount: 0,
    }];

    const json = escalationEventsToJson(events);
    const parsed = JSON.parse(json);
    expect(parsed.count).toBe(1);
    expect(parsed.events[0].id).toBe(1);
    expect(parsed.events[0].timestamp).toBeDefined();
    expect(parsed.events[0].eventType).toBe('tier_triggered');
    expect(parsed.events[0].tierLabel).toBe('Tier 1');
    expect(parsed.events[0].deliveryTargets).toBe('Slack');
  });

  it('strips raw delivery details from export', () => {
    const events: EscalationHistoryEvent[] = [{
      id: 1, ts: NOW, eventType: 'tier_triggered', tierIndex: 0, tierLabel: 'T1',
      qualifyingSeverity: 'critical', qualifyingDurationMs: 300_000,
      reason: 'test',
      deliveries: [
        makeDelivery({ targetId: 'slack', statusCode: 200, durationMs: 150, attempts: 1 }),
        makeDelivery({ targetId: 'discord', targetName: 'Discord', statusCode: 503, error: 'fail', durationMs: 5000, attempts: 3 }),
      ],
      deliverySuccessCount: 1, deliveryFailureCount: 1,
    }];

    const json = escalationEventsToJson(events);
    const parsed = JSON.parse(json);
    const event = parsed.events[0];

    // Should NOT include raw delivery array or detail fields
    expect(event).not.toHaveProperty('deliveries');
    expect(event).not.toHaveProperty('ts'); // replaced by timestamp
    // Should include flattened target names
    expect(event.deliveryTargets).toBe('Slack; Discord');
    expect(event.deliverySuccessCount).toBe(1);
    expect(event.deliveryFailureCount).toBe(1);
  });

  it('never contains url or secret fields', () => {
    const events: EscalationHistoryEvent[] = [{
      id: 1, ts: NOW, eventType: 'tier_triggered', tierIndex: 0, tierLabel: 'T1',
      qualifyingSeverity: 'critical', qualifyingDurationMs: 300_000,
      reason: 'test', deliveries: [makeDelivery()], deliverySuccessCount: 1, deliveryFailureCount: 0,
    }];

    const json = escalationEventsToJson(events);
    const parsed = JSON.parse(json);
    for (const event of parsed.events) {
      expect(event).not.toHaveProperty('url');
      expect(event).not.toHaveProperty('secret');
      expect(event).not.toHaveProperty('payload');
      expect(event).not.toHaveProperty('headers');
    }
  });
});

// ─── exportEscalationHistory ─────────────────────────────────────────────────

describe('exportEscalationHistory', () => {
  it('returns JSON export by default', () => {
    seedEvents();

    const result = exportEscalationHistory(tmpDir, { now: NOW + 1 });
    expect(result.contentType).toContain('application/json');
    expect(result.filename).toMatch(/^escalation-history-\d{4}-\d{2}-\d{2}\.json$/);
    expect(result.count).toBe(4);

    const parsed = JSON.parse(result.content);
    expect(parsed.events).toHaveLength(4);
    expect(parsed.format).toBe('ventureos-escalation-history-export-v1');
  });

  it('returns CSV export when format=csv', () => {
    seedEvents();

    const result = exportEscalationHistory(tmpDir, { format: 'csv', now: NOW + 1 });
    expect(result.contentType).toContain('text/csv');
    expect(result.filename).toMatch(/^escalation-history-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(result.count).toBe(4);

    const lines = result.content.split('\n');
    expect(lines).toHaveLength(5); // header + 4 rows
  });

  it('respects eventType filter', () => {
    seedEvents();

    const result = exportEscalationHistory(tmpDir, {
      format: 'json', eventType: 'tier_triggered', now: NOW + 1,
    });
    const parsed = JSON.parse(result.content);
    expect(parsed.events).toHaveLength(2);
    expect(parsed.events.every((e: Record<string, unknown>) => e.eventType === 'tier_triggered')).toBe(true);
  });

  it('respects tierIndex filter', () => {
    seedEvents();

    const result = exportEscalationHistory(tmpDir, {
      format: 'json', tierIndex: 1, now: NOW + 1,
    });
    const parsed = JSON.parse(result.content);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0].tierIndex).toBe(1);
  });

  it('respects deliveryStatus filter', () => {
    seedEvents();

    const successResult = exportEscalationHistory(tmpDir, {
      format: 'json', deliveryStatus: 'success', now: NOW + 1,
    });
    const successParsed = JSON.parse(successResult.content);
    expect(successParsed.events).toHaveLength(2);

    const failResult = exportEscalationHistory(tmpDir, {
      format: 'json', deliveryStatus: 'failure', now: NOW + 1,
    });
    const failParsed = JSON.parse(failResult.content);
    expect(failParsed.events).toHaveLength(1);
  });

  it('respects sinceMs time window', () => {
    seedEvents();

    const result = exportEscalationHistory(tmpDir, {
      format: 'json', sinceMs: 1500, now: NOW + 1,
    });
    const parsed = JSON.parse(result.content);
    // Events at NOW-1000 and NOW are within 1500ms of NOW+1
    expect(parsed.events).toHaveLength(2);
  });

  it('enforces ESCALATION_EXPORT_MAX_EVENTS limit', () => {
    // Seed 200 events (max retention)
    for (let i = 0; i < 200; i++) {
      appendEscalationEvent(tmpDir, makeEvent({ ts: NOW + i * 100 }), { maxEvents: 200 });
    }

    const result = exportEscalationHistory(tmpDir, {
      format: 'json', limit: 999, now: NOW + 200_000,
    });
    const parsed = JSON.parse(result.content);
    expect(parsed.events.length).toBeLessThanOrEqual(ESCALATION_EXPORT_MAX_EVENTS);
  });

  it('returns empty export when no events', () => {
    const result = exportEscalationHistory(tmpDir, { format: 'csv' });
    expect(result.count).toBe(0);

    const lines = result.content.split('\n');
    expect(lines).toHaveLength(1); // header only
  });

  it('combines multiple filters', () => {
    seedEvents();

    const result = exportEscalationHistory(tmpDir, {
      format: 'json',
      eventType: 'tier_triggered',
      tierIndex: 0,
      deliveryStatus: 'success',
      now: NOW + 1,
    });
    const parsed = JSON.parse(result.content);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0].tierIndex).toBe(0);
    expect(parsed.events[0].eventType).toBe('tier_triggered');
  });
});

// ─── API Routes ──────────────────────────────────────────────────────────────

  function seedRecentEvents() {
    // Use current-time-relative timestamps so API sinceMs filters work
    const now = Date.now();
    appendEscalationEvent(tmpDir, makeEvent({
      ts: now - 3000, eventType: 'tier_triggered', tierIndex: 0, tierLabel: 'Tier 1',
      deliveries: [makeDelivery({ success: true })], deliverySuccessCount: 1, deliveryFailureCount: 0,
    }));
    appendEscalationEvent(tmpDir, makeEvent({
      ts: now - 2000, eventType: 'tier_triggered', tierIndex: 1, tierLabel: 'Tier 2',
      deliveries: [makeDelivery({ targetId: 'discord', targetName: 'Discord', success: false, error: 'Timeout', statusCode: null })],
      deliverySuccessCount: 0, deliveryFailureCount: 1,
    }));
    appendEscalationEvent(tmpDir, makeEvent({
      ts: now - 1000, eventType: 'tier_renotified', tierIndex: 0, tierLabel: 'Tier 1',
      deliveries: [makeDelivery({ success: true })], deliverySuccessCount: 1, deliveryFailureCount: 0,
    }));
    appendEscalationReset(tmpDir, {
      qualifyingSeverity: 'critical', qualifyingDurationMs: 600_000, ts: now,
    });
  }

describe('GET /api/task-board/escalation/history/export', () => {
  it('returns CSV download with correct headers', async () => {
    seedRecentEvents();

    const req = mockRequest({
      url: '/api/task-board/escalation/history/export?format=csv&sinceMs=60000',
    });
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
    expect(lines[0]).toContain('eventType');
  });

  it('returns JSON download by default', async () => {
    seedRecentEvents();

    const req = mockRequest({
      url: '/api/task-board/escalation/history/export?sinceMs=60000',
    });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    expect(res._statusCode).toBe(200);
    expect(res._headers['content-type']).toContain('application/json');
    expect(res._headers['content-disposition']).toContain('.json');

    const parsed = JSON.parse(res._body);
    expect(parsed.format).toBe('ventureos-escalation-history-export-v1');
    expect(parsed.events.length).toBeGreaterThanOrEqual(1);
  });

  it('respects query filters', async () => {
    seedRecentEvents();

    const req = mockRequest({
      url: '/api/task-board/escalation/history/export?format=json&eventType=tier_triggered&tierIndex=0&sinceMs=60000',
    });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const parsed = JSON.parse(res._body);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0].eventType).toBe('tier_triggered');
    expect(parsed.events[0].tierIndex).toBe(0);
  });

  it('returns empty export for no matching events', async () => {
    const req = mockRequest({
      url: '/api/task-board/escalation/history/export?format=csv',
    });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    expect(res._statusCode).toBe(200);
    // Should still have header row
    const lines = res._body.split('\n');
    expect(lines).toHaveLength(1);
  });

  it('still routes to non-export escalation history endpoint', async () => {
    seedRecentEvents();

    const req = mockRequest({
      url: '/api/task-board/escalation/history?sinceMs=60000',
    });
    const res = mockResponse();
    const deps = createDeps();

    const handled = await handleTaskBoard(req, res, deps);
    expect(handled).toBe(true);
    // Should return JSON with events/count/summary shape (not export shape)
    const body = JSON.parse(res._body);
    expect(body.summary).toBeDefined();
    expect(body.summary.totalEvents).toBeDefined();
    expect(body.events).toBeDefined();
    expect(body.count).toBeDefined();
    // Should NOT have export metadata
    expect(body.format).toBeUndefined();
    expect(body.exportedAt).toBeUndefined();
  });
});

// ─── Filter parity ───────────────────────────────────────────────────────────

describe('filter parity between query and export', () => {
  it('export returns same events as query with identical filters', () => {
    seedEvents();

    const filters = {
      sinceMs: 172800000, // 48h — include all
      eventType: 'tier_triggered' as const,
      tierIndex: 0,
      deliveryStatus: 'success' as const,
      now: NOW + 1,
    };

    // Query result (the reference)
    const queryResult = queryEscalationHistory(tmpDir, { ...filters, limit: 200 });

    // Export result
    const exportResult = exportEscalationHistory(tmpDir, { ...filters, format: 'json' });
    const exportParsed = JSON.parse(exportResult.content);

    expect(exportParsed.events.length).toBe(queryResult.events.length);
    expect(exportParsed.count).toBe(queryResult.count);

    // Verify same event IDs
    const queryIds = queryResult.events.map((e) => e.id);
    const exportIds = exportParsed.events.map((e: Record<string, unknown>) => e.id);
    expect(exportIds).toEqual(queryIds);
  });

  it('export and query return same count with no filters', () => {
    seedEvents();

    const queryResult = queryEscalationHistory(tmpDir, { limit: 200, now: NOW + 1 });
    const exportResult = exportEscalationHistory(tmpDir, { format: 'json', now: NOW + 1 });
    const exportParsed = JSON.parse(exportResult.content);

    expect(exportParsed.count).toBe(queryResult.count);
  });

  it('export and query agree on sinceMs filter', () => {
    seedEvents();

    const sinceMs = 2500; // should exclude event at NOW-3000
    const queryResult = queryEscalationHistory(tmpDir, { sinceMs, limit: 200, now: NOW + 1 });
    const exportResult = exportEscalationHistory(tmpDir, { format: 'json', sinceMs, now: NOW + 1 });
    const exportParsed = JSON.parse(exportResult.content);

    expect(exportParsed.count).toBe(queryResult.count);
    expect(exportParsed.events.map((e: Record<string, unknown>) => e.id)).toEqual(
      queryResult.events.map((e) => e.id),
    );
  });
});

// ─── Secret safety (export-specific) ─────────────────────────────────────────

describe('export secret safety', () => {
  it('CSV export never contains raw delivery detail fields', () => {
    appendEscalationEvent(tmpDir, makeEvent({
      ts: NOW,
      deliveries: [
        makeDelivery({
          targetId: 'slack-internal-id',
          statusCode: 200,
          durationMs: 150,
          error: null,
        }),
      ],
    }));

    const result = exportEscalationHistory(tmpDir, { format: 'csv', now: NOW + 1 });
    // Should not contain the internal target ID or status codes in CSV
    // The CSV header shouldn't have delivery detail columns
    const header = result.content.split('\n')[0];
    expect(header).not.toContain('statusCode');
    expect(header).not.toContain('attempts');
    expect(header).not.toContain('error');
    // Target name should appear in deliveryTargets, not targetId
    expect(result.content).toContain('Slack');
  });

  it('JSON export strips delivery internals', () => {
    appendEscalationEvent(tmpDir, makeEvent({
      ts: NOW,
      deliveries: [
        makeDelivery({
          targetId: 'webhook-secret-id-123',
          targetName: 'My Webhook',
          statusCode: 503,
          error: 'Connection refused to https://internal-webhook.corp.example.com/secret-path',
          durationMs: 5000,
          attempts: 3,
        }),
      ],
      deliverySuccessCount: 0,
      deliveryFailureCount: 1,
    }));

    const result = exportEscalationHistory(tmpDir, { format: 'json', now: NOW + 1 });
    const parsed = JSON.parse(result.content);
    const event = parsed.events[0];

    // Should NOT contain any delivery detail fields
    expect(event).not.toHaveProperty('deliveries');
    expect(JSON.stringify(event)).not.toContain('webhook-secret-id-123');
    expect(JSON.stringify(event)).not.toContain('internal-webhook.corp.example.com');
    expect(JSON.stringify(event)).not.toContain('secret-path');
    expect(JSON.stringify(event)).not.toContain('Connection refused');

    // Should contain safe flattened info
    expect(event.deliveryTargets).toBe('My Webhook');
    expect(event.deliveryFailureCount).toBe(1);
  });

  it('export does not include url, secret, payload, or headers fields', () => {
    appendEscalationEvent(tmpDir, makeEvent({ ts: NOW }));

    const result = exportEscalationHistory(tmpDir, { format: 'json', now: NOW + 1 });
    const parsed = JSON.parse(result.content);

    for (const event of parsed.events) {
      expect(event).not.toHaveProperty('url');
      expect(event).not.toHaveProperty('secret');
      expect(event).not.toHaveProperty('payload');
      expect(event).not.toHaveProperty('headers');
    }
  });

  it('persisted file never contains url or secret keywords in export output', () => {
    appendEscalationEvent(tmpDir, makeEvent({
      ts: NOW,
      deliveries: [makeDelivery()],
    }));

    const csvResult = exportEscalationHistory(tmpDir, { format: 'csv', now: NOW + 1 });
    expect(csvResult.content.toLowerCase()).not.toContain('secret');

    const jsonResult = exportEscalationHistory(tmpDir, { format: 'json', now: NOW + 1 });
    expect(jsonResult.content.toLowerCase()).not.toContain('"url"');
    expect(jsonResult.content.toLowerCase()).not.toContain('"secret"');
  });
});

// ─── Bounded output ──────────────────────────────────────────────────────────

describe('bounded output', () => {
  it('ESCALATION_EXPORT_MAX_EVENTS is 200', () => {
    expect(ESCALATION_EXPORT_MAX_EVENTS).toBe(200);
  });

  it('export caps at ESCALATION_EXPORT_MAX_EVENTS regardless of limit param', () => {
    // Seed max events
    for (let i = 0; i < 200; i++) {
      appendEscalationEvent(tmpDir, makeEvent({ ts: NOW + i * 100 }), { maxEvents: 200 });
    }

    const result = exportEscalationHistory(tmpDir, {
      format: 'json', limit: 999, now: NOW + 200_000,
    });
    const parsed = JSON.parse(result.content);
    expect(parsed.events.length).toBeLessThanOrEqual(ESCALATION_EXPORT_MAX_EVENTS);
  });

  it('CSV export row count is bounded', () => {
    for (let i = 0; i < 200; i++) {
      appendEscalationEvent(tmpDir, makeEvent({ ts: NOW + i * 100 }), { maxEvents: 200 });
    }

    const result = exportEscalationHistory(tmpDir, {
      format: 'csv', limit: 999, now: NOW + 200_000,
    });
    const lines = result.content.split('\n');
    // header + data rows
    expect(lines.length - 1).toBeLessThanOrEqual(ESCALATION_EXPORT_MAX_EVENTS);
  });
});

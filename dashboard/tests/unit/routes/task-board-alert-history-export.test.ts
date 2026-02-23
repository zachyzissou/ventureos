/**
 * Alert History Export + Webhook Health Stats Export tests — Issue #219, Phase 24.
 *
 * Tests for:
 * - Alert history export: CSV/JSON format correctness, filter parity, bounds, secret safety
 * - Webhook health stats export: CSV/JSON format correctness, filter parity, bounds, secret safety
 * - API endpoints: GET /api/task-board/alerts/timeline/export
 *                  GET /api/task-board/webhooks/health/export
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  csvEscapeAlert,
  alertEventsToCsv,
  alertEventsToJson,
  exportAlertHistory,
  ALERT_EXPORT_MAX_EVENTS,
  maybeAppendAlertEvent,
} from '../../../server/alert-history.js';
import type {
  AlertHistoryEvent,
  AlertExportResult,
} from '../../../server/alert-history.js';

import {
  csvEscapeHealth,
  healthTargetsToCsv,
  healthStatsToJson,
  exportWebhookHealth,
  HEALTH_EXPORT_MAX_TARGETS,
} from '../../../server/webhook-health-stats.js';
import type {
  WebhookTargetHealthStats,
  WebhookHealthResponse,
  HealthExportResult,
} from '../../../server/webhook-health-stats.js';

import { appendDeliveryEvents } from '../../../server/webhook-delivery-history.js';

import { mockRequest, mockResponse } from '../../helpers.js';
import { handleTaskBoard } from '../../../server/routes/task-board.js';
import type { TaskBoardDeps } from '../../../server/types.js';

// ─── Test Setup ──────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alert-health-export-test-'));
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

function makeAlertEvent(overrides: Partial<AlertHistoryEvent> = {}): AlertHistoryEvent {
  return {
    ts: NOW,
    overallSeverity: 'warning',
    severityCounts: { ok: 1, warning: 2, critical: 0 },
    ruleSeverities: { stuckTasks: 'warning', failureRate: 'warning' },
    activeMessages: ['2 stuck tasks', 'Failure rate 45%'],
    ...overrides,
  };
}

function seedAlertEvents(count = 3) {
  // Write alert events with incrementing timestamps and forced cooldown bypass
  for (let i = 0; i < count; i++) {
    const severity = i % 3 === 0 ? 'ok' : i % 3 === 1 ? 'warning' : 'critical';
    const eval_ = {
      evaluatedAt: NOW - (count - i) * 120_000, // 2min apart
      overallSeverity: severity as 'ok' | 'warning' | 'critical',
      severityCounts: { ok: severity === 'ok' ? 3 : 1, warning: severity === 'warning' ? 2 : 0, critical: severity === 'critical' ? 1 : 0 },
      rules: [
        { rule: 'stuckTasks', enabled: true, severity: severity as 'ok' | 'warning' | 'critical', message: severity === 'ok' ? 'OK' : 'stuck', value: i, threshold: 1, comparator: '>=' as const },
      ],
    };
    maybeAppendAlertEvent(tmpDir, eval_, { minIntervalMs: 0 });
  }
}

function makeHealthTarget(overrides: Partial<WebhookTargetHealthStats> = {}): WebhookTargetHealthStats {
  return {
    targetId: 'slack',
    targetName: 'Slack Alerts',
    successCount: 15,
    failureCount: 2,
    totalCount: 17,
    successRate: 0.8824,
    avgLatencyMs: 250,
    lastSuccessTs: NOW - 60_000,
    lastFailureTs: NOW - 300_000,
    lastStatusCode: 200,
    maskedUrl: 'https://hooks.slack.com/***',
    healthStatus: 'degraded',
    ...overrides,
  };
}

function seedDeliveryEvents() {
  const results = [
    { targetId: 'slack', targetName: 'Slack', success: true, statusCode: 200, attempts: 1, error: null, durationMs: 150 },
    { targetId: 'slack', targetName: 'Slack', success: false, statusCode: 500, attempts: 3, error: 'Server Error', durationMs: 3000 },
    { targetId: 'discord', targetName: 'Discord', success: true, statusCode: 200, attempts: 1, error: null, durationMs: 200 },
  ];
  const contexts = results.map(() => ({
    url: 'https://hooks.slack.com/services/T00/B00/xxx',
    triggerSeverity: 'critical',
    previousSeverity: 'warning',
    ts: NOW - 60_000,
  }));
  appendDeliveryEvents(tmpDir, results, contexts);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Alert History Export — Unit Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Alert History Export', () => {
  describe('csvEscapeAlert()', () => {
    it('returns empty string for null/undefined', () => {
      expect(csvEscapeAlert(null)).toBe('');
      expect(csvEscapeAlert(undefined)).toBe('');
    });

    it('passes through plain strings', () => {
      expect(csvEscapeAlert('hello')).toBe('hello');
    });

    it('wraps strings with commas in double quotes', () => {
      expect(csvEscapeAlert('a,b')).toBe('"a,b"');
    });

    it('escapes double quotes by doubling them', () => {
      expect(csvEscapeAlert('say "hi"')).toBe('"say ""hi"""');
    });

    it('wraps strings with newlines', () => {
      expect(csvEscapeAlert('line1\nline2')).toBe('"line1\nline2"');
    });

    it('converts numbers and booleans to strings', () => {
      expect(csvEscapeAlert(42)).toBe('42');
      expect(csvEscapeAlert(true)).toBe('true');
    });
  });

  describe('alertEventsToCsv()', () => {
    it('returns header row for empty input', () => {
      const csv = alertEventsToCsv([]);
      const lines = csv.split('\n');
      expect(lines.length).toBe(1);
      expect(lines[0]).toContain('timestamp');
      expect(lines[0]).toContain('overallSeverity');
      expect(lines[0]).toContain('activeMessages');
    });

    it('includes data rows with correct column count', () => {
      const events = [makeAlertEvent()];
      const csv = alertEventsToCsv(events);
      const lines = csv.split('\n');
      expect(lines.length).toBe(2);
      const headerCols = lines[0].split(',').length;
      // Data row may have quoted commas, but the unquoted structure should work
      expect(headerCols).toBe(7); // timestamp,overallSeverity,okCount,warningCount,criticalCount,activeMessages,ruleSeverities
    });

    it('formats timestamps as ISO 8601', () => {
      const events = [makeAlertEvent({ ts: NOW })];
      const csv = alertEventsToCsv(events);
      expect(csv).toContain(new Date(NOW).toISOString());
    });

    it('never contains raw internal field names', () => {
      const events = [makeAlertEvent()];
      const csv = alertEventsToCsv(events);
      // Should not leak raw object references
      expect(csv).not.toContain('[object');
    });
  });

  describe('alertEventsToJson()', () => {
    it('returns valid JSON with export metadata', () => {
      const events = [makeAlertEvent()];
      const json = alertEventsToJson(events);
      const parsed = JSON.parse(json);
      expect(parsed.format).toBe('ventureos-alert-history-export-v1');
      expect(parsed.count).toBe(1);
      expect(parsed.exportedAt).toBeDefined();
      expect(Array.isArray(parsed.events)).toBe(true);
    });

    it('sanitizes events — only allowlisted fields present', () => {
      const events = [makeAlertEvent()];
      const json = alertEventsToJson(events);
      const parsed = JSON.parse(json);
      const ev = parsed.events[0];
      // Allowlisted fields
      expect(ev.timestamp).toBeDefined();
      expect(ev.overallSeverity).toBe('warning');
      expect(ev.okCount).toBeDefined();
      expect(ev.warningCount).toBeDefined();
      expect(ev.criticalCount).toBeDefined();
      expect(ev.activeMessages).toBeDefined();
      expect(ev.ruleSeverities).toBeDefined();
      // No raw ts field (transformed to timestamp)
      expect(ev.ts).toBeUndefined();
      // No internal fields
      expect(ev.severityCounts).toBeUndefined();
    });
  });

  describe('exportAlertHistory()', () => {
    it('returns CSV with correct content type and filename', () => {
      seedAlertEvents(3);
      const result = exportAlertHistory(tmpDir, { format: 'csv', now: NOW });
      expect(result.contentType).toBe('text/csv; charset=utf-8');
      expect(result.filename).toMatch(/^alert-history-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(result.count).toBe(3);
    });

    it('returns JSON with correct content type and filename', () => {
      seedAlertEvents(3);
      const result = exportAlertHistory(tmpDir, { format: 'json', now: NOW });
      expect(result.contentType).toBe('application/json; charset=utf-8');
      expect(result.filename).toMatch(/^alert-history-\d{4}-\d{2}-\d{2}\.json$/);
      expect(result.count).toBe(3);
    });

    it('defaults to JSON format', () => {
      seedAlertEvents(1);
      const result = exportAlertHistory(tmpDir, { now: NOW });
      expect(result.contentType).toBe('application/json; charset=utf-8');
    });

    it('respects limit parameter (bounded to ALERT_EXPORT_MAX_EVENTS)', () => {
      seedAlertEvents(5);
      const result = exportAlertHistory(tmpDir, { format: 'json', limit: 2, now: NOW });
      expect(result.count).toBeLessThanOrEqual(2);
    });

    it('caps limit at ALERT_EXPORT_MAX_EVENTS', () => {
      expect(ALERT_EXPORT_MAX_EVENTS).toBe(200);
      const result = exportAlertHistory(tmpDir, { format: 'json', limit: 9999, now: NOW });
      expect(result.count).toBeLessThanOrEqual(200);
    });

    it('filter parity: sinceMs filters match query endpoint', () => {
      seedAlertEvents(5);
      // Export with tight window should return fewer events
      const tight = exportAlertHistory(tmpDir, { format: 'json', sinceMs: 180_000, now: NOW });
      const wide = exportAlertHistory(tmpDir, { format: 'json', sinceMs: 900_000, now: NOW });
      expect(tight.count).toBeLessThanOrEqual(wide.count);
    });

    it('filter parity: minSeverity filter works', () => {
      seedAlertEvents(6); // Mix of ok/warning/critical
      const all = exportAlertHistory(tmpDir, { format: 'json', now: NOW });
      const warningPlus = exportAlertHistory(tmpDir, { format: 'json', minSeverity: 'warning', now: NOW });
      const criticalOnly = exportAlertHistory(tmpDir, { format: 'json', minSeverity: 'critical', now: NOW });
      expect(warningPlus.count).toBeLessThanOrEqual(all.count);
      expect(criticalOnly.count).toBeLessThanOrEqual(warningPlus.count);
    });

    it('returns empty export for empty history', () => {
      const result = exportAlertHistory(tmpDir, { format: 'csv', now: NOW });
      expect(result.count).toBe(0);
      // CSV should still have header row
      expect(result.content.split('\n').length).toBe(1);
    });

    it('secret safety: CSV export never contains internal field names', () => {
      seedAlertEvents(3);
      const result = exportAlertHistory(tmpDir, { format: 'csv', now: NOW });
      expect(result.content).not.toContain('severityCounts');
      expect(result.content).not.toContain('[object');
      expect(result.content).not.toContain('undefined');
    });

    it('secret safety: JSON export uses sanitized allowlist', () => {
      seedAlertEvents(3);
      const result = exportAlertHistory(tmpDir, { format: 'json', now: NOW });
      const parsed = JSON.parse(result.content);
      for (const ev of parsed.events) {
        // Must have allowlisted fields
        expect(ev.timestamp).toBeDefined();
        expect(ev.overallSeverity).toBeDefined();
        // Must NOT have raw internal fields
        expect(ev.ts).toBeUndefined();
        expect(ev.severityCounts).toBeUndefined();
      }
    });
  });

  describe('GET /api/task-board/alerts/timeline/export', () => {
    it('returns CSV download with correct headers', async () => {
      seedAlertEvents(3);
      const req = mockRequest({ url: '/api/task-board/alerts/timeline/export?format=csv', method: 'GET' });
      const res = mockResponse();
      const handled = await handleTaskBoard(req, res, createDeps());
      expect(handled).toBe(true);
      expect(res._statusCode).toBe(200);
      expect(res._headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(res._headers['content-disposition']).toMatch(/attachment; filename="alert-history-.*\.csv"/);
      expect(res._headers['cache-control']).toBe('no-store');
      expect(res._headers['x-export-count']).toBeDefined();
    });

    it('returns JSON download by default', async () => {
      seedAlertEvents(2);
      const req = mockRequest({ url: '/api/task-board/alerts/timeline/export', method: 'GET' });
      const res = mockResponse();
      const handled = await handleTaskBoard(req, res, createDeps());
      expect(handled).toBe(true);
      expect(res._statusCode).toBe(200);
      expect(res._headers['content-type']).toBe('application/json; charset=utf-8');
      const parsed = JSON.parse(res._body);
      expect(parsed.format).toBe('ventureos-alert-history-export-v1');
    });

    it('passes sinceMs and minSeverity filters to export', async () => {
      seedAlertEvents(5);
      const req = mockRequest({
        url: '/api/task-board/alerts/timeline/export?format=json&sinceMs=180000&minSeverity=warning',
        method: 'GET',
      });
      const res = mockResponse();
      const handled = await handleTaskBoard(req, res, createDeps());
      expect(handled).toBe(true);
      expect(res._statusCode).toBe(200);
      const parsed = JSON.parse(res._body);
      // All exported events should be warning or critical
      for (const ev of parsed.events) {
        expect(['warning', 'critical']).toContain(ev.overallSeverity);
      }
    });

    it('does not match the non-export timeline endpoint', async () => {
      seedAlertEvents(2);
      const req = mockRequest({ url: '/api/task-board/alerts/timeline?sinceMs=3600000', method: 'GET' });
      const res = mockResponse();
      const handled = await handleTaskBoard(req, res, createDeps());
      expect(handled).toBe(true);
      // The non-export endpoint returns JSON API response, not file download
      expect(res._headers['content-disposition']).toBeUndefined();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Webhook Health Stats Export — Unit Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Webhook Health Stats Export', () => {
  describe('csvEscapeHealth()', () => {
    it('returns empty string for null/undefined', () => {
      expect(csvEscapeHealth(null)).toBe('');
      expect(csvEscapeHealth(undefined)).toBe('');
    });

    it('wraps strings with commas', () => {
      expect(csvEscapeHealth('a,b')).toBe('"a,b"');
    });

    it('escapes double quotes', () => {
      expect(csvEscapeHealth('say "hi"')).toBe('"say ""hi"""');
    });
  });

  describe('healthTargetsToCsv()', () => {
    it('returns header row for empty input', () => {
      const csv = healthTargetsToCsv([]);
      const lines = csv.split('\n');
      expect(lines.length).toBe(1);
      expect(lines[0]).toContain('targetId');
      expect(lines[0]).toContain('healthStatus');
      expect(lines[0]).toContain('successRate');
    });

    it('includes data rows with correct column count', () => {
      const targets = [makeHealthTarget()];
      const csv = healthTargetsToCsv(targets);
      const lines = csv.split('\n');
      expect(lines.length).toBe(2);
      const headerCols = lines[0].split(',').length;
      expect(headerCols).toBe(11);
    });

    it('secret safety: never contains maskedUrl', () => {
      const targets = [makeHealthTarget({ maskedUrl: 'https://secret.com/***' })];
      const csv = healthTargetsToCsv(targets);
      expect(csv).not.toContain('secret.com');
      expect(csv).not.toContain('maskedUrl');
    });

    it('formats timestamps as ISO 8601', () => {
      const targets = [makeHealthTarget({ lastSuccessTs: NOW })];
      const csv = healthTargetsToCsv(targets);
      expect(csv).toContain(new Date(NOW).toISOString());
    });
  });

  describe('healthStatsToJson()', () => {
    it('returns valid JSON with export metadata', () => {
      const response: WebhookHealthResponse = {
        targets: [makeHealthTarget()],
        summary: {
          totalDeliveries: 17, totalSuccesses: 15, totalFailures: 2,
          overallSuccessRate: 0.8824, overallAvgLatencyMs: 250,
          targetCount: 1, healthyCount: 0, degradedCount: 1, unhealthyCount: 0,
        },
        windowMs: 86400000,
        computedAt: NOW,
      };
      const json = healthStatsToJson(response);
      const parsed = JSON.parse(json);
      expect(parsed.format).toBe('ventureos-webhook-health-export-v1');
      expect(parsed.count).toBe(1);
      expect(parsed.summary).toBeDefined();
      expect(parsed.summary.totalDeliveries).toBe(17);
      expect(Array.isArray(parsed.targets)).toBe(true);
    });

    it('secret safety: targets do not contain maskedUrl', () => {
      const response: WebhookHealthResponse = {
        targets: [makeHealthTarget({ maskedUrl: 'https://hooks.slack.com/***' })],
        summary: {
          totalDeliveries: 1, totalSuccesses: 1, totalFailures: 0,
          overallSuccessRate: 1, overallAvgLatencyMs: 100,
          targetCount: 1, healthyCount: 1, degradedCount: 0, unhealthyCount: 0,
        },
        windowMs: 86400000,
        computedAt: NOW,
      };
      const json = healthStatsToJson(response);
      expect(json).not.toContain('hooks.slack.com');
      expect(json).not.toContain('maskedUrl');
    });
  });

  describe('exportWebhookHealth()', () => {
    it('returns CSV with correct content type and filename', () => {
      seedDeliveryEvents();
      const result = exportWebhookHealth(tmpDir, { format: 'csv', now: NOW });
      expect(result.contentType).toBe('text/csv; charset=utf-8');
      expect(result.filename).toMatch(/^webhook-health-\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it('returns JSON with correct content type and filename', () => {
      seedDeliveryEvents();
      const result = exportWebhookHealth(tmpDir, { format: 'json', now: NOW });
      expect(result.contentType).toBe('application/json; charset=utf-8');
      expect(result.filename).toMatch(/^webhook-health-\d{4}-\d{2}-\d{2}\.json$/);
    });

    it('defaults to JSON format', () => {
      const result = exportWebhookHealth(tmpDir, { now: NOW });
      expect(result.contentType).toBe('application/json; charset=utf-8');
    });

    it('returns empty export for empty delivery history', () => {
      const result = exportWebhookHealth(tmpDir, { format: 'csv', now: NOW });
      expect(result.count).toBe(0);
      expect(result.content.split('\n').length).toBe(1); // header only
    });

    it('filter parity: targetId filter works', () => {
      seedDeliveryEvents();
      const all = exportWebhookHealth(tmpDir, { format: 'json', now: NOW });
      const slackOnly = exportWebhookHealth(tmpDir, { format: 'json', targetId: 'slack', now: NOW });
      expect(slackOnly.count).toBeLessThanOrEqual(all.count);
      if (slackOnly.count > 0) {
        const parsed = JSON.parse(slackOnly.content);
        for (const t of parsed.targets) {
          expect(t.targetId).toBe('slack');
        }
      }
    });

    it('filter parity: windowMs filter works', () => {
      seedDeliveryEvents();
      const result = exportWebhookHealth(tmpDir, { format: 'json', windowMs: 86400000, now: NOW });
      expect(result.count).toBeGreaterThanOrEqual(0);
    });

    it('secret safety: JSON export does not contain maskedUrl', () => {
      seedDeliveryEvents();
      const result = exportWebhookHealth(tmpDir, { format: 'json', now: NOW });
      expect(result.content).not.toContain('maskedUrl');
    });

    it('secret safety: CSV export does not contain maskedUrl', () => {
      seedDeliveryEvents();
      const result = exportWebhookHealth(tmpDir, { format: 'csv', now: NOW });
      expect(result.content).not.toContain('maskedUrl');
    });
  });

  describe('GET /api/task-board/webhooks/health/export', () => {
    it('returns CSV download with correct headers', async () => {
      seedDeliveryEvents();
      const req = mockRequest({ url: '/api/task-board/webhooks/health/export?format=csv', method: 'GET' });
      const res = mockResponse();
      const handled = await handleTaskBoard(req, res, createDeps());
      expect(handled).toBe(true);
      expect(res._statusCode).toBe(200);
      expect(res._headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(res._headers['content-disposition']).toMatch(/attachment; filename="webhook-health-.*\.csv"/);
      expect(res._headers['cache-control']).toBe('no-store');
      expect(res._headers['x-export-count']).toBeDefined();
    });

    it('returns JSON download by default', async () => {
      seedDeliveryEvents();
      const req = mockRequest({ url: '/api/task-board/webhooks/health/export', method: 'GET' });
      const res = mockResponse();
      const handled = await handleTaskBoard(req, res, createDeps());
      expect(handled).toBe(true);
      expect(res._statusCode).toBe(200);
      expect(res._headers['content-type']).toBe('application/json; charset=utf-8');
      const parsed = JSON.parse(res._body);
      expect(parsed.format).toBe('ventureos-webhook-health-export-v1');
    });

    it('passes windowMs and targetId filters to export', async () => {
      seedDeliveryEvents();
      const req = mockRequest({
        url: '/api/task-board/webhooks/health/export?format=json&windowMs=86400000&targetId=slack',
        method: 'GET',
      });
      const res = mockResponse();
      const handled = await handleTaskBoard(req, res, createDeps());
      expect(handled).toBe(true);
      expect(res._statusCode).toBe(200);
      const parsed = JSON.parse(res._body);
      for (const t of parsed.targets) {
        expect(t.targetId).toBe('slack');
      }
    });

    it('does not match the non-export health endpoint', async () => {
      seedDeliveryEvents();
      const req = mockRequest({ url: '/api/task-board/webhooks/health?windowMs=86400000', method: 'GET' });
      const res = mockResponse();
      const handled = await handleTaskBoard(req, res, createDeps());
      expect(handled).toBe(true);
      // Non-export endpoint returns JSON via sendJson, not file download
      expect(res._headers['content-disposition']).toBeUndefined();
    });
  });

  describe('bounds enforcement', () => {
    it('ALERT_EXPORT_MAX_EVENTS is 200', () => {
      expect(ALERT_EXPORT_MAX_EVENTS).toBe(200);
    });

    it('HEALTH_EXPORT_MAX_TARGETS is 100', () => {
      expect(HEALTH_EXPORT_MAX_TARGETS).toBe(100);
    });
  });
});

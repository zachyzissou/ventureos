/**
 * Metrics History Export tests — Issue #219, Phase 25.
 *
 * Tests for:
 * - CSV/JSON format correctness (column headers, field values, structure)
 * - Secret-safe allowlist (no internal fields leak)
 * - Bounded export (max 500 snapshots)
 * - Filter parity with queryHistory (sinceMs, limit)
 * - API endpoint: GET /api/task-board/metrics/history/export
 * - CSV escaping edge cases
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  csvEscapeMetrics,
  metricsSnapshotsToCsv,
  metricsSnapshotsToJson,
  exportMetricsHistory,
  METRICS_EXPORT_MAX_SNAPSHOTS,
  queryHistory,
} from '../../../server/metrics-history.js';
import type {
  MetricsSnapshot,
  MetricsHistoryFile,
  MetricsExportResult,
} from '../../../server/metrics-history.js';

import { mockRequest, mockResponse } from '../../helpers.js';
import { handleTaskBoard } from '../../../server/routes/task-board.js';
import type { TaskBoardDeps } from '../../../server/types.js';

// ─── Test Setup ──────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metrics-history-export-test-'));
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

function makeSnapshot(overrides: Partial<MetricsSnapshot> = {}): MetricsSnapshot {
  return {
    ts: NOW,
    statusCounts: { backlog: 3, queued: 2, running: 1, done: 10, failed: 2 },
    total: 18,
    throughput: { last24h: 5, last7d: 20, last30d: 50 },
    avgRuntimeMs: 45000,
    medianRuntimeMs: 30000,
    successRate: 0.8333,
    stuckCount: 1,
    ...overrides,
  };
}

function seedHistory(snapshots: MetricsSnapshot[]): void {
  fs.mkdirSync(tmpDir, { recursive: true });
  const data: MetricsHistoryFile = { version: 1, snapshots };
  fs.writeFileSync(
    path.join(tmpDir, 'task-board-metrics-history.json'),
    JSON.stringify(data),
  );
}

function seedTasks(): void {
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, 'task-board.json'),
    JSON.stringify({ tasks: [], updatedAt: Date.now() }),
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// csvEscapeMetrics — Unit Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('csvEscapeMetrics()', () => {
  it('returns empty string for null/undefined', () => {
    expect(csvEscapeMetrics(null)).toBe('');
    expect(csvEscapeMetrics(undefined)).toBe('');
  });

  it('passes through plain strings', () => {
    expect(csvEscapeMetrics('hello')).toBe('hello');
  });

  it('wraps strings with commas in double quotes', () => {
    expect(csvEscapeMetrics('a,b')).toBe('"a,b"');
  });

  it('escapes double quotes by doubling', () => {
    expect(csvEscapeMetrics('say "hi"')).toBe('"say ""hi"""');
  });

  it('wraps strings with newlines', () => {
    expect(csvEscapeMetrics('a\nb')).toBe('"a\nb"');
    expect(csvEscapeMetrics('a\rb')).toBe('"a\rb"');
  });

  it('converts numbers to strings', () => {
    expect(csvEscapeMetrics(42)).toBe('42');
    expect(csvEscapeMetrics(0)).toBe('0');
    expect(csvEscapeMetrics(3.14)).toBe('3.14');
  });

  it('converts booleans to strings', () => {
    expect(csvEscapeMetrics(true)).toBe('true');
    expect(csvEscapeMetrics(false)).toBe('false');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// metricsSnapshotsToCsv — Unit Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('metricsSnapshotsToCsv()', () => {
  it('returns header row for empty array', () => {
    const csv = metricsSnapshotsToCsv([]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      'timestamp,total,backlog,queued,running,done,failed,' +
      'throughputLast24h,throughputLast7d,throughputLast30d,' +
      'avgRuntimeMs,medianRuntimeMs,successRate,stuckCount',
    );
  });

  it('produces correct CSV rows from snapshots', () => {
    const snap = makeSnapshot({
      ts: 1700000000000,
      total: 18,
      statusCounts: { backlog: 3, queued: 2, running: 1, done: 10, failed: 2 },
      throughput: { last24h: 5, last7d: 20, last30d: 50 },
      avgRuntimeMs: 45000,
      medianRuntimeMs: 30000,
      successRate: 0.8333,
      stuckCount: 1,
    });
    const csv = metricsSnapshotsToCsv([snap]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);

    // Parse the data row
    const values = lines[1].split(',');
    expect(values[0]).toBe(new Date(1700000000000).toISOString()); // timestamp
    expect(values[1]).toBe('18');   // total
    expect(values[2]).toBe('3');    // backlog
    expect(values[3]).toBe('2');    // queued
    expect(values[4]).toBe('1');    // running
    expect(values[5]).toBe('10');   // done
    expect(values[6]).toBe('2');    // failed
    expect(values[7]).toBe('5');    // throughputLast24h
    expect(values[8]).toBe('20');   // throughputLast7d
    expect(values[9]).toBe('50');   // throughputLast30d
    expect(values[10]).toBe('45000'); // avgRuntimeMs
    expect(values[11]).toBe('30000'); // medianRuntimeMs
    expect(values[12]).toBe('0.8333'); // successRate
    expect(values[13]).toBe('1');   // stuckCount
  });

  it('handles null numeric fields as empty strings', () => {
    const snap = makeSnapshot({
      avgRuntimeMs: null,
      medianRuntimeMs: null,
      successRate: null,
    });
    const csv = metricsSnapshotsToCsv([snap]);
    const lines = csv.split('\n');
    const values = lines[1].split(',');
    expect(values[10]).toBe(''); // avgRuntimeMs
    expect(values[11]).toBe(''); // medianRuntimeMs
    expect(values[12]).toBe(''); // successRate
  });

  it('produces correct number of rows for multiple snapshots', () => {
    const snapshots = Array.from({ length: 5 }, (_, i) =>
      makeSnapshot({ ts: NOW - (5 - i) * 300000, total: i + 1 }),
    );
    const csv = metricsSnapshotsToCsv(snapshots);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(6); // 1 header + 5 data rows
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// metricsSnapshotsToJson — Unit Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('metricsSnapshotsToJson()', () => {
  it('produces valid JSON with format envelope', () => {
    const snapshots = [makeSnapshot()];
    const jsonStr = metricsSnapshotsToJson(snapshots);
    const parsed = JSON.parse(jsonStr);

    expect(parsed).toHaveProperty('exportedAt');
    expect(parsed).toHaveProperty('format', 'ventureos-metrics-history-export-v1');
    expect(parsed).toHaveProperty('count', 1);
    expect(parsed).toHaveProperty('snapshots');
    expect(parsed.snapshots).toHaveLength(1);
  });

  it('sanitizes snapshots with correct field allowlist', () => {
    const snap = makeSnapshot({
      ts: 1700000000000,
      total: 18,
      statusCounts: { backlog: 3, queued: 2, running: 1, done: 10, failed: 2 },
    });
    const jsonStr = metricsSnapshotsToJson([snap]);
    const parsed = JSON.parse(jsonStr);
    const exported = parsed.snapshots[0];

    // Should have all allowlisted fields
    expect(exported).toHaveProperty('timestamp');
    expect(exported).toHaveProperty('total', 18);
    expect(exported).toHaveProperty('backlog', 3);
    expect(exported).toHaveProperty('queued', 2);
    expect(exported).toHaveProperty('running', 1);
    expect(exported).toHaveProperty('done', 10);
    expect(exported).toHaveProperty('failed', 2);
    expect(exported).toHaveProperty('throughputLast24h');
    expect(exported).toHaveProperty('throughputLast7d');
    expect(exported).toHaveProperty('throughputLast30d');
    expect(exported).toHaveProperty('avgRuntimeMs');
    expect(exported).toHaveProperty('medianRuntimeMs');
    expect(exported).toHaveProperty('successRate');
    expect(exported).toHaveProperty('stuckCount');

    // Should NOT have raw internal fields
    expect(exported).not.toHaveProperty('ts');
    expect(exported).not.toHaveProperty('statusCounts');
    expect(exported).not.toHaveProperty('throughput');
  });

  it('handles null values correctly', () => {
    const snap = makeSnapshot({
      avgRuntimeMs: null,
      medianRuntimeMs: null,
      successRate: null,
    });
    const jsonStr = metricsSnapshotsToJson([snap]);
    const parsed = JSON.parse(jsonStr);
    const exported = parsed.snapshots[0];

    expect(exported.avgRuntimeMs).toBeNull();
    expect(exported.medianRuntimeMs).toBeNull();
    expect(exported.successRate).toBeNull();
  });

  it('produces valid JSON for empty input', () => {
    const jsonStr = metricsSnapshotsToJson([]);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.count).toBe(0);
    expect(parsed.snapshots).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// exportMetricsHistory — Integration Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('exportMetricsHistory()', () => {
  it('exports as JSON by default', () => {
    seedHistory([makeSnapshot({ ts: NOW })]);
    const result = exportMetricsHistory(tmpDir);
    expect(result.contentType).toBe('application/json; charset=utf-8');
    expect(result.filename).toMatch(/^metrics-history-\d{4}-\d{2}-\d{2}\.json$/);
    expect(result.count).toBe(1);

    const parsed = JSON.parse(result.content);
    expect(parsed.format).toBe('ventureos-metrics-history-export-v1');
    expect(parsed.snapshots).toHaveLength(1);
  });

  it('exports as CSV when format=csv', () => {
    seedHistory([makeSnapshot({ ts: NOW })]);
    const result = exportMetricsHistory(tmpDir, { format: 'csv' });
    expect(result.contentType).toBe('text/csv; charset=utf-8');
    expect(result.filename).toMatch(/^metrics-history-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(result.count).toBe(1);

    const lines = result.content.split('\n');
    expect(lines).toHaveLength(2); // header + 1 data row
  });

  it('respects limit parameter', () => {
    const snapshots = Array.from({ length: 10 }, (_, i) =>
      makeSnapshot({ ts: NOW - (10 - i) * 60000 }),
    );
    seedHistory(snapshots);
    const result = exportMetricsHistory(tmpDir, { format: 'csv', limit: 3 });
    expect(result.count).toBe(3);
    const lines = result.content.split('\n');
    expect(lines).toHaveLength(4); // header + 3 data rows
  });

  it('respects sinceMs filter', () => {
    seedHistory([
      makeSnapshot({ ts: NOW - 7200000 }), // 2h ago
      makeSnapshot({ ts: NOW - 1800000 }), // 30min ago
      makeSnapshot({ ts: NOW }),             // now
    ]);
    const result = exportMetricsHistory(tmpDir, {
      format: 'json',
      sinceMs: 3600000, // last 1h
      now: NOW,
    });
    expect(result.count).toBe(2); // only the last 2
  });

  it('bounds limit to METRICS_EXPORT_MAX_SNAPSHOTS', () => {
    expect(METRICS_EXPORT_MAX_SNAPSHOTS).toBe(500);
    // Generate more than max
    const snapshots = Array.from({ length: 10 }, (_, i) =>
      makeSnapshot({ ts: NOW - (10 - i) * 60000 }),
    );
    seedHistory(snapshots);
    const result = exportMetricsHistory(tmpDir, { limit: 9999 });
    // Should be capped — all 10 returned since 10 < 500
    expect(result.count).toBe(10);
  });

  it('returns empty export for empty history', () => {
    const result = exportMetricsHistory(tmpDir, { format: 'csv' });
    expect(result.count).toBe(0);
    const lines = result.content.split('\n');
    expect(lines).toHaveLength(1); // header only
  });

  it('returns empty JSON export for empty history', () => {
    const result = exportMetricsHistory(tmpDir, { format: 'json' });
    expect(result.count).toBe(0);
    const parsed = JSON.parse(result.content);
    expect(parsed.snapshots).toHaveLength(0);
  });

  // ── Filter parity with queryHistory ────────────────────────────────────────

  it('produces the same snapshots as queryHistory with matching filters', () => {
    seedHistory([
      makeSnapshot({ ts: NOW - 7200000, total: 5 }),
      makeSnapshot({ ts: NOW - 3600000, total: 8 }),
      makeSnapshot({ ts: NOW - 1800000, total: 12 }),
      makeSnapshot({ ts: NOW, total: 15 }),
    ]);

    const queryOpts = { sinceMs: 5400000, limit: 3, now: NOW }; // last 1.5h, max 3
    const queryResult = queryHistory(tmpDir, queryOpts);
    const exportResult = exportMetricsHistory(tmpDir, { format: 'json', ...queryOpts });

    const parsed = JSON.parse(exportResult.content);
    expect(parsed.count).toBe(queryResult.length);
    expect(exportResult.count).toBe(queryResult.length);

    // Verify the same snapshots (by timestamp) are present
    const queryTimestamps = queryResult.map(s => new Date(s.ts).toISOString());
    const exportTimestamps = parsed.snapshots.map((s: Record<string, unknown>) => s.timestamp);
    expect(exportTimestamps).toEqual(queryTimestamps);
  });

  // ── Secret safety ──────────────────────────────────────────────────────────

  it('does not expose raw internal fields in CSV export', () => {
    seedHistory([makeSnapshot({ ts: NOW })]);
    const result = exportMetricsHistory(tmpDir, { format: 'csv' });
    const header = result.content.split('\n')[0];

    // Should not contain raw internal field names
    expect(header).not.toContain('statusCounts');
    expect(header).not.toContain('throughput.last');
    // Should contain flattened safe field names
    expect(header).toContain('timestamp');
    expect(header).toContain('total');
    expect(header).toContain('backlog');
    expect(header).toContain('throughputLast24h');
  });

  it('does not expose raw internal fields in JSON export', () => {
    seedHistory([makeSnapshot({ ts: NOW })]);
    const result = exportMetricsHistory(tmpDir, { format: 'json' });
    const content = result.content;

    // Raw internal shapes should not appear
    expect(content).not.toContain('"ts":');
    expect(content).not.toContain('"statusCounts":');
    expect(content).not.toContain('"last24h":');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// API Endpoint: GET /api/task-board/metrics/history/export
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/task-board/metrics/history/export', () => {
  it('returns JSON export by default', async () => {
    seedTasks();
    seedHistory([makeSnapshot({ ts: NOW, total: 7 })]);
    const req = mockRequest({ url: '/api/task-board/metrics/history/export', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    expect(res._statusCode).toBe(200);
    expect(res._headers['content-type']).toBe('application/json; charset=utf-8');
    expect(res._headers['content-disposition']).toMatch(/attachment; filename="metrics-history-.*\.json"/);
    expect(res._headers['cache-control']).toBe('no-store');
    expect(res._headers['x-export-count']).toBe('1');

    const parsed = JSON.parse(res._body);
    expect(parsed.format).toBe('ventureos-metrics-history-export-v1');
    expect(parsed.count).toBe(1);
    expect(parsed.snapshots[0].total).toBe(7);
  });

  it('returns CSV export when format=csv', async () => {
    seedTasks();
    seedHistory([
      makeSnapshot({ ts: NOW - 60000, total: 5 }),
      makeSnapshot({ ts: NOW, total: 10 }),
    ]);
    const req = mockRequest({ url: '/api/task-board/metrics/history/export?format=csv', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    expect(res._statusCode).toBe(200);
    expect(res._headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res._headers['content-disposition']).toMatch(/attachment; filename="metrics-history-.*\.csv"/);
    expect(res._headers['x-export-count']).toBe('2');

    const lines = res._body.split('\n');
    expect(lines).toHaveLength(3); // header + 2 data rows
    expect(lines[0]).toContain('timestamp');
    expect(lines[0]).toContain('total');
  });

  it('respects limit query param', async () => {
    seedTasks();
    const snapshots = Array.from({ length: 20 }, (_, i) =>
      makeSnapshot({ ts: NOW - (20 - i) * 60000 }),
    );
    seedHistory(snapshots);
    const req = mockRequest({ url: '/api/task-board/metrics/history/export?format=csv&limit=5', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    expect(res._headers['x-export-count']).toBe('5');
    const lines = res._body.split('\n');
    expect(lines).toHaveLength(6); // header + 5 data rows
  });

  it('respects sinceMs query param', async () => {
    seedTasks();
    const realNow = Date.now();
    seedHistory([
      makeSnapshot({ ts: realNow - 7200000 }), // 2h ago
      makeSnapshot({ ts: realNow - 1800000 }), // 30min ago
      makeSnapshot({ ts: realNow }),
    ]);
    const req = mockRequest({ url: '/api/task-board/metrics/history/export?format=json&sinceMs=3600000', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    expect(res._headers['x-export-count']).toBe('2');
    const parsed = JSON.parse(res._body);
    expect(parsed.count).toBe(2);
  });

  it('clamps limit to 500 max', async () => {
    seedTasks();
    seedHistory([makeSnapshot({ ts: NOW })]);
    const req = mockRequest({ url: '/api/task-board/metrics/history/export?limit=9999', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());
    // Should not error — clamped to 500
    expect(res._statusCode).toBe(200);
    expect(res._headers['x-export-count']).toBe('1');
  });

  it('returns empty export for empty history', async () => {
    seedTasks();
    const req = mockRequest({ url: '/api/task-board/metrics/history/export?format=csv', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    expect(res._statusCode).toBe(200);
    expect(res._headers['x-export-count']).toBe('0');
    const lines = res._body.split('\n');
    expect(lines).toHaveLength(1); // header only
  });

  it('does not interfere with existing /metrics/history endpoint', async () => {
    seedTasks();
    seedHistory([makeSnapshot({ ts: NOW, total: 7 })]);

    // Existing endpoint should still return JSON API response
    const req = mockRequest({ url: '/api/task-board/metrics/history', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body);
    // The API endpoint returns { snapshots, count } — not the export envelope
    expect(body).toHaveProperty('snapshots');
    expect(body).toHaveProperty('count');
    expect(body).not.toHaveProperty('format');
    expect(body).not.toHaveProperty('exportedAt');
  });
});

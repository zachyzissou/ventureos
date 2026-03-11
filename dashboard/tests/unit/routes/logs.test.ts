/**
 * Logs route handler tests — Issue #137.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import { handleLogs } from '../../../server/routes/logs.js';
import type { LogsDeps, LogEntry, LogSourceMeta } from '../../../server/types.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const tmpBase = path.join('/tmp', 'test-logs-' + process.pid);
const logDir = path.join(tmpBase, 'logs');
const ventureosRoot = path.join(tmpBase, 'ventureos');
const runtimeLogs = path.join(ventureosRoot, 'runtime', 'logs');
const dashServerLog = path.join(ventureosRoot, 'dashboard', 'server.log');

function createDeps(overrides: Partial<LogsDeps> = {}): LogsDeps {
  return {
    LOG_DIR: logDir,
    VENTUREOS_ROOT: ventureosRoot,
    sendJson: (res, data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    },
    clampInt: (n, lo, hi, dflt) => {
      const v = parseInt(String(n));
      if (Number.isNaN(v)) return dflt;
      return Math.max(lo, Math.min(hi, v));
    },
    ...overrides,
  };
}

function writeFixture(dir: string, name: string, content: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), content, 'utf8');
}

beforeEach(() => {
  fs.mkdirSync(logDir, { recursive: true });
  fs.mkdirSync(runtimeLogs, { recursive: true });
  fs.mkdirSync(path.dirname(dashServerLog), { recursive: true });

  // Create sample log files
  writeFixture(runtimeLogs, 'phantom-detector.jsonl', [
    '{"ts":"2026-02-15T19:33:07.000Z","event":"phantom_detected","agent":"synth","reason":"zero_messages"}',
    '{"ts":"2026-02-15T19:33:08.000Z","event":"scan_complete","phantomCount":4}',
    '{"ts":"2026-02-15T20:00:00.000Z","event":"phantom_detected","agent":"oracle","reason":"stale","level":"warn"}',
  ].join('\n') + '\n');

  writeFixture(runtimeLogs, 'dashboard.log', [
    'Error: listen EADDRINUSE: address already in use 0.0.0.0:8001',
    '  at Server.setupListenHandle',
    'Server started on port 8001',
    'Incoming request: GET /api/sessions',
  ].join('\n') + '\n');

  writeFixture(runtimeLogs, 'spawn-with-retry.log', [
    '{"ts":"2026-02-15T20:30:45.059Z","event":"spawn_retry","agentId":"main","attempt":1,"exitCode":127}',
    '{"ts":"2026-02-15T20:30:59.109Z","event":"spawn_failed","agentId":"main","attempt":4}',
  ].join('\n') + '\n');

  fs.writeFileSync(dashServerLog, 'Dashboard server error: port in use\nListening on 8001\n', 'utf8');
});

afterEach(() => {
  fs.rmSync(tmpBase, { recursive: true, force: true });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Logs Route Handler (Issue #137)', () => {
  describe('routing', () => {
    it('returns false for non-logs URLs', () => {
      expect(handleLogs(mockRequest({ url: '/api/sessions' }), mockResponse(), createDeps())).toBe(false);
    });

    it('returns false for POST requests', () => {
      expect(handleLogs(mockRequest({ url: '/api/logs/sources', method: 'POST' }), mockResponse(), createDeps())).toBe(false);
    });

    it('returns false when req is null', () => {
      expect(handleLogs(null as any, mockResponse(), createDeps())).toBe(false);
    });

    it('returns true for /api/logs/sources', () => {
      expect(handleLogs(mockRequest({ url: '/api/logs/sources' }), mockResponse(), createDeps())).toBe(true);
    });

    it('returns true for /api/logs/entries', () => {
      expect(handleLogs(mockRequest({ url: '/api/logs/entries?source=dashboard' }), mockResponse(), createDeps())).toBe(true);
    });

    it('returns true for /api/logs/tail', () => {
      expect(handleLogs(mockRequest({ url: '/api/logs/tail?source=dashboard' }), mockResponse(), createDeps())).toBe(true);
    });

    it('returns true for /api/logs/export', () => {
      expect(handleLogs(mockRequest({ url: '/api/logs/export?source=dashboard' }), mockResponse(), createDeps())).toBe(true);
    });

    it('returns true for legacy /api/logs?service=...', () => {
      expect(handleLogs(mockRequest({ url: '/api/logs?service=dashboard' }), mockResponse(), createDeps())).toBe(true);
    });
  });

  describe('GET /api/logs/sources', () => {
    it('discovers log files from runtime/logs', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/sources' }), res, createDeps());
      expect(res._ended).toBe(true);
      const body = parseJsonBody<{ sources: LogSourceMeta[] }>(res);
      expect(body.sources).toBeDefined();
      expect(body.sources.length).toBeGreaterThanOrEqual(3); // phantom-detector, dashboard, spawn-with-retry
      const ids = body.sources.map(s => s.id);
      expect(ids).toContain('phantom-detector');
      expect(ids).toContain('dashboard');
    });

    it('includes dashboard-server source when server.log exists', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/sources' }), res, createDeps());
      const body = parseJsonBody<{ sources: LogSourceMeta[] }>(res);
      expect(body.sources.find(s => s.id === 'dashboard-server')).toBeDefined();
    });

    it('reports format correctly', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/sources' }), res, createDeps());
      const body = parseJsonBody<{ sources: LogSourceMeta[] }>(res);
      const pd = body.sources.find(s => s.id === 'phantom-detector');
      expect(pd?.format).toBe('jsonl');
      const dl = body.sources.find(s => s.id === 'dashboard');
      expect(dl?.format).toBe('text');
    });

    it('returns empty sources for nonexistent directory', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/sources' }), res, createDeps({
        LOG_DIR: '/tmp/nonexistent-xyz',
        VENTUREOS_ROOT: '/tmp/nonexistent-xyz',
      }));
      const body = parseJsonBody<{ sources: LogSourceMeta[] }>(res);
      expect(body.sources).toEqual([]);
    });

    it('includes line count and size', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/sources' }), res, createDeps());
      const body = parseJsonBody<{ sources: LogSourceMeta[] }>(res);
      const pd = body.sources.find(s => s.id === 'phantom-detector');
      expect(pd?.lines).toBeGreaterThan(0);
      expect(pd?.size).toBeGreaterThan(0);
    });
  });

  describe('GET /api/logs/entries', () => {
    it('returns structured entries for JSONL source', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/entries?source=phantom-detector' }), res, createDeps());
      const body = parseJsonBody<{ entries: LogEntry[]; total: number }>(res);
      expect(body.entries.length).toBe(3);
      expect(body.entries[0].source).toBe('phantom-detector');
      expect(body.entries[0].ts).toContain('2026');
      expect(body.entries[0].fields).not.toBeNull();
    });

    it('returns structured entries for plain text source', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/entries?source=dashboard' }), res, createDeps());
      const body = parseJsonBody<{ entries: LogEntry[]; total: number }>(res);
      expect(body.entries.length).toBeGreaterThan(0);
      expect(body.entries[0].fields).toBeNull(); // plain text has no fields
    });

    it('infers error level from keywords', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/entries?source=dashboard' }), res, createDeps());
      const body = parseJsonBody<{ entries: LogEntry[] }>(res);
      const errorEntries = body.entries.filter(e => e.level === 'error');
      expect(errorEntries.length).toBeGreaterThan(0);
      expect(errorEntries[0].message.toLowerCase()).toContain('error');
    });

    it('filters by level', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/entries?source=dashboard&level=error' }), res, createDeps());
      const body = parseJsonBody<{ entries: LogEntry[] }>(res);
      expect(body.entries.length).toBeGreaterThan(0);
      for (const e of body.entries) {
        expect(e.level).toBe('error');
      }
    });

    it('filters by search text', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/entries?source=phantom-detector&search=oracle' }), res, createDeps());
      const body = parseJsonBody<{ entries: LogEntry[] }>(res);
      expect(body.entries.length).toBe(1);
      // "oracle" appears in the raw JSONL line (agent field), matched via raw text search
      expect(body.entries[0].raw).toContain('oracle');
    });

    it('returns 400 when source is missing', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/entries' }), res, createDeps());
      expect(res._statusCode).toBe(400);
      const body = parseJsonBody<{ error: string }>(res);
      expect(body.error).toContain('Missing');
    });

    it('returns 404 for unknown source', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/entries?source=nonexistent' }), res, createDeps());
      expect(res._statusCode).toBe(404);
    });

    it('respects limit parameter', () => {
      // Write many lines
      const lines = Array.from({ length: 50 }, (_, i) =>
        `{"ts":"2026-02-15T${String(i).padStart(2, '0')}:00:00Z","event":"test_${i}"}`
      ).join('\n');
      writeFixture(runtimeLogs, 'big-log.jsonl', lines);

      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/entries?source=big-log&limit=10' }), res, createDeps());
      const body = parseJsonBody<{ entries: LogEntry[] }>(res);
      expect(body.entries.length).toBe(10);
    });

    it('returns entries from dashboard-server source', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/entries?source=dashboard-server' }), res, createDeps());
      const body = parseJsonBody<{ entries: LogEntry[] }>(res);
      expect(body.entries.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/logs/tail', () => {
    it('returns raw text for a source', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/tail?source=dashboard&lines=10' }), res, createDeps());
      expect(res._ended).toBe(true);
      expect(res._headers['content-type']).toContain('text/plain');
      expect(res._body).toContain('Server');
    });

    it('returns 400 when source is missing', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/tail' }), res, createDeps());
      expect(res._statusCode).toBe(400);
    });

    it('returns 404 for unknown source', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/tail?source=nonexistent' }), res, createDeps());
      expect(res._statusCode).toBe(404);
    });
  });

  describe('GET /api/logs (legacy compat)', () => {
    it('serves logs for known service', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs?service=dashboard' }), res, createDeps());
      expect(res._ended).toBe(true);
      expect(res._body).toBeTruthy();
    });

    it('reports available sources for unknown service', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs?service=unknown-svc' }), res, createDeps());
      expect(res._ended).toBe(true);
      expect(res._body).toContain('Available sources');
    });
  });

  describe('GET /api/logs/export', () => {
    it('returns JSONL download with Content-Disposition', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/export?source=phantom-detector' }), res, createDeps());
      expect(res._ended).toBe(true);
      expect(res._statusCode).toBe(200);
      expect(res._headers['content-type']).toContain('application/x-ndjson');
      expect(res._headers['content-disposition']).toContain('attachment');
      expect(res._headers['content-disposition']).toContain('phantom-detector');
      expect(res._headers['content-disposition']).toMatch(/\.jsonl"/);

      // Each line should be valid JSON
      const lines = res._body.split('\n').filter(l => l.trim());
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });

    it('returns text format when format=text', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/export?source=phantom-detector&format=text' }), res, createDeps());
      expect(res._ended).toBe(true);
      expect(res._headers['content-type']).toContain('text/plain');
      expect(res._headers['content-disposition']).toMatch(/\.log"/);
      // Text format should contain level tags
      expect(res._body).toMatch(/\[(INFO|WARN|ERROR|DEBUG)\]/);
    });

    it('respects level filter in export', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/export?source=phantom-detector&level=warn' }), res, createDeps());
      const lines = res._body.split('\n').filter(l => l.trim());
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        const entry = JSON.parse(line);
        expect(entry.level).toBe('warn');
      }
    });

    it('respects search filter in export', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/export?source=phantom-detector&search=oracle' }), res, createDeps());
      const lines = res._body.split('\n').filter(l => l.trim());
      expect(lines.length).toBe(1);
      const entry = JSON.parse(lines[0]);
      expect(entry.raw).toContain('oracle');
    });

    it('includes level suffix in filename when filtered', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/export?source=dashboard&level=error' }), res, createDeps());
      expect(res._headers['content-disposition']).toContain('-error-');
    });

    it('returns 400 when source is missing', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/export' }), res, createDeps());
      expect(res._statusCode).toBe(400);
    });

    it('returns 404 for unknown source', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/export?source=nonexistent' }), res, createDeps());
      expect(res._statusCode).toBe(404);
    });

    it('rejects path traversal in source parameter', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/export?source=../../etc/passwd' }), res, createDeps());
      expect(res._statusCode).toBe(404);
    });
  });

  describe('security', () => {
    it('rejects path traversal in source parameter', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/entries?source=../../etc/passwd' }), res, createDeps());
      expect(res._statusCode).toBe(404);
    });

    it('rejects dotfile source names', () => {
      const res = mockResponse();
      handleLogs(mockRequest({ url: '/api/logs/entries?source=.env' }), res, createDeps());
      expect(res._statusCode).toBe(404);
    });
  });
});

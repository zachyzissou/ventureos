/**
 * KPI route handler tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import { handleKpis } from '../../../server/routes/kpis.js';
import type { KpiDeps, KpiFileData } from '../../../server/types.js';

const kpiFixtureDir = path.join('/tmp', 'test-kpi-dir-' + process.pid);

function createDeps(overrides: Partial<KpiDeps> = {}): KpiDeps {
  return {
    KPI_DIR: kpiFixtureDir,
    safeReadJson: (filePath: string, fallback: null) => {
      try {
        if (!fs.existsSync(filePath)) return fallback;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch {
        return fallback;
      }
    },
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

beforeEach(() => {
  fs.mkdirSync(kpiFixtureDir, { recursive: true });
  // Clean
  for (const f of fs.readdirSync(kpiFixtureDir)) {
    fs.unlinkSync(path.join(kpiFixtureDir, f));
  }
  // Copy fixtures
  const fixturesDir = path.resolve(import.meta.dirname, '../../fixtures');
  fs.copyFileSync(path.join(fixturesDir, 'kpi-2025-01-01.json'), path.join(kpiFixtureDir, '2025-01-01.json'));
  fs.copyFileSync(path.join(fixturesDir, 'kpi-2025-01-02.json'), path.join(kpiFixtureDir, '2025-01-02.json'));
});

describe('KPI Route Handler', () => {
  describe('/api/kpis/latest', () => {
    it('returns the latest KPI file', () => {
      const res = mockResponse();
      handleKpis(mockRequest({ url: '/api/kpis/latest' }), res, createDeps());
      expect(res._ended).toBe(true);
      const body = parseJsonBody(res);
      expect((body.latest as KpiFileData).date).toBe('2025-01-02');
      expect(body.count).toBe(2);
      expect(typeof body.latestMtimeMs).toBe('number');
      expect(body.latestMtimeMs).toBeGreaterThan(0);
    });

    it('returns null when no KPI files exist', () => {
      const emptyDir = path.join('/tmp', 'empty-kpi-' + Date.now());
      fs.mkdirSync(emptyDir, { recursive: true });
      const res = mockResponse();
      handleKpis(mockRequest({ url: '/api/kpis/latest' }), res, createDeps({ KPI_DIR: emptyDir }));
      expect(parseJsonBody(res).latest).toBeNull();
      expect(parseJsonBody(res).latestMtimeMs).toBe(0);
    });

    it('handles non-existent KPI directory', () => {
      const res = mockResponse();
      handleKpis(mockRequest({ url: '/api/kpis/latest' }), res, createDeps({ KPI_DIR: '/tmp/nonexistent-xyz' }));
      expect(parseJsonBody(res).latest).toBeNull();
      expect(parseJsonBody(res).latestMtimeMs).toBe(0);
    });
  });

  describe('/api/kpis/history', () => {
    it('returns KPI history with default 7 days', () => {
      const res = mockResponse();
      handleKpis(mockRequest({ url: '/api/kpis/history' }), res, createDeps());
      const body = parseJsonBody(res);
      expect(body.days).toBe(7);
      expect(body.count).toBe(2);
    });

    it('respects days parameter', () => {
      const res = mockResponse();
      handleKpis(mockRequest({ url: '/api/kpis/history?days=1' }), res, createDeps());
      expect(parseJsonBody(res).days).toBe(1);
      expect(parseJsonBody(res).count).toBe(1);
    });

    it('clamps days to valid range', () => {
      const res = mockResponse();
      handleKpis(mockRequest({ url: '/api/kpis/history?days=200' }), res, createDeps());
      expect(parseJsonBody(res).days).toBe(90);
    });

    it('uses default when days is invalid', () => {
      const res = mockResponse();
      handleKpis(mockRequest({ url: '/api/kpis/history?days=abc' }), res, createDeps());
      expect(parseJsonBody(res).days).toBe(7);
    });
  });

  describe('routing', () => {
    it('returns false for non-KPI URLs', () => {
      expect(handleKpis(mockRequest({ url: '/api/sessions' }), mockResponse(), createDeps())).toBe(false);
    });

    it('returns false for POST requests', () => {
      expect(handleKpis(mockRequest({ url: '/api/kpis/latest', method: 'POST' }), mockResponse(), createDeps())).toBe(false);
    });

    it('returns false when req is missing', () => {
      expect(handleKpis(null as any, mockResponse(), createDeps())).toBe(false);
    });
  });
});

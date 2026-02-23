/**
 * Integration tests — VentureOS data reading.
 *
 * Verifies that the KPI and Observations route handlers correctly
 * read data from VentureOS directories on disk.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mockRequest, mockResponse, parseJsonBody } from '../helpers.js';
import { handleKpis } from '../../server/routes/kpis.js';
import { handleObservations } from '../../server/routes/observations.js';
import type { KpiDeps, ObservationsDeps, KpiFileData } from '../../server/types.js';

const testDir = path.join('/tmp', 'ventureos-integration-' + Date.now());
const kpiDir = path.join(testDir, 'kpis');
const obsDir = path.join(testDir, 'observations');

function safeReadJson(filePath: string, fallback: null): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function safeReadText(filePath: string, fallback: string): string {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

function sendJson(res: any, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function clampInt(n: string | number, lo: number, hi: number, dflt: number): number {
  const v = parseInt(String(n));
  if (Number.isNaN(v)) return dflt;
  return Math.max(lo, Math.min(hi, v));
}

beforeEach(() => {
  fs.mkdirSync(kpiDir, { recursive: true });
  fs.mkdirSync(obsDir, { recursive: true });

  // Create realistic KPI data over 5 days
  for (let i = 0; i < 5; i++) {
    const date = `2025-02-${String(10 + i).padStart(2, '0')}`;
    const data = {
      date,
      overall: {
        success_rate: 0.90 + Math.random() * 0.09,
        latency_ms: {
          p50: 100 + Math.floor(Math.random() * 50),
          p95: 400 + Math.floor(Math.random() * 100),
          p99: 800 + Math.floor(Math.random() * 200),
        },
        handoff: { success_rate: 0.85 + Math.random() * 0.1 },
        backup: { age_hours: 1 + Math.random() * 5 },
      },
      slo: {
        success_rate: 0.9,
        p95_latency_s: 1.0,
        backup_age_h: 24,
      },
    };
    fs.writeFileSync(path.join(kpiDir, `${date}.json`), JSON.stringify(data));
  }

  // Create observations
  const obsContent = `# Observations — 2025-02-10

## 10:00 — Integration test observation
- **Context:** CI pipeline
- **Action:** Verifier executed integration tests
- **Outcome:** All passing
- **Tags:** ci, integration, verifier

## 15:00 — Deployment check
- **Context:** Staging
- **Action:** Deployed dashboard v0.1.0
- **Outcome:** No regressions found
- **Tags:** deploy, staging, dashboard
`;
  fs.writeFileSync(path.join(obsDir, '2025-02-10.md'), obsContent);
  // Touch the file so it appears in "recent"
  const now = new Date();
  fs.utimesSync(path.join(obsDir, '2025-02-10.md'), now, now);
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('VentureOS Data Reading', () => {
  describe('KPI data pipeline', () => {
    const kpiDeps: KpiDeps = {
      get KPI_DIR() { return kpiDir; },
      safeReadJson,
      sendJson,
      clampInt,
    };

    it('reads all 5 KPI files for history', () => {
      const req = mockRequest({ url: '/api/kpis/history?days=7' });
      const res = mockResponse();

      handleKpis(req, res, kpiDeps);

      const body = parseJsonBody(res);
      expect(body.count).toBe(5);
      const items = body.items as KpiFileData[];
      expect(items.length).toBe(5);

      // Verify data integrity
      for (const item of items) {
        expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(item.overall?.success_rate).toBeGreaterThanOrEqual(0.9);
        expect(item.overall?.success_rate).toBeLessThanOrEqual(1.0);
        expect(item.overall?.latency_ms?.p95).toBeGreaterThan(0);
      }
    });

    it('returns the latest (most recent) KPI entry', () => {
      const req = mockRequest({ url: '/api/kpis/latest' });
      const res = mockResponse();

      handleKpis(req, res, kpiDeps);

      const body = parseJsonBody(res);
      expect(body.latest).not.toBeNull();
      expect((body.latest as KpiFileData).date).toBe('2025-02-14');
    });

    it('handles corrupted JSON gracefully', () => {
      // Write a corrupted file
      fs.writeFileSync(path.join(kpiDir, '2025-02-15.json'), 'not valid json {{{');

      const req = mockRequest({ url: '/api/kpis/history?days=10' });
      const res = mockResponse();

      handleKpis(req, res, kpiDeps);

      const body = parseJsonBody(res);
      // Corrupted file should be filtered out
      expect(body.count).toBe(5); // only the 5 good files
    });
  });

  describe('Observations data pipeline', () => {
    const obsDeps: ObservationsDeps = {
      get OBSERVATIONS_DIR() { return obsDir; },
      safeReadText,
      sendJson,
      clampInt,
    };

    it('reads observations and returns snippets', () => {
      const req = mockRequest({ url: '/api/observations/recent?hours=48' });
      const res = mockResponse();

      handleObservations(req, res, obsDeps);

      const body = parseJsonBody(res);
      expect(body.count).toBeGreaterThanOrEqual(1);
      const items = body.items as Array<{ snippet: string; path: string }>;
      expect(items[0].snippet).toContain('Integration test observation');
      expect(items[0].path).toContain('.md');
    });

    it('search finds specific keywords', () => {
      const req = mockRequest({ url: '/api/observations/search?q=verifier' });
      const res = mockResponse();

      handleObservations(req, res, obsDeps);

      const body = parseJsonBody(res);
      expect(body.count).toBeGreaterThanOrEqual(1);
      expect((body.items as Array<{ match: string }>)[0].match.toLowerCase()).toContain('verifier');
    });

    it('search returns empty for non-existing terms', () => {
      const req = mockRequest({ url: '/api/observations/search?q=xyznonexistent' });
      const res = mockResponse();

      handleObservations(req, res, obsDeps);

      const body = parseJsonBody(res);
      expect(body.count).toBe(0);
    });
  });
});

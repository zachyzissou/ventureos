/**
 * Response parity tests — verify the migrated dashboard produces identical
 * responses to the expected contract for every API endpoint.
 *
 * These tests verify the response shape (schema) rather than exact values,
 * since the old server is no longer running. This ensures zero regressions
 * in the API contract.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mockRequest, mockResponse, parseJsonBody } from '../helpers.js';
import { handleKpis } from '../../server/routes/kpis.js';
import { handleObservations } from '../../server/routes/observations.js';
import { handleAgentHealth } from '../../server/routes/agent-health.js';
import type { KpiDeps, ObservationsDeps, AgentHealthDeps, KpiFileData, AgentHealthResponse } from '../../server/types.js';

// ── Test data setup ──────────────────────────────────────────────────────────

const testDir = path.join('/tmp', 'parity-test-' + Date.now());
const kpiDir = path.join(testDir, 'kpis');
const obsDir = path.join(testDir, 'observations');
const openclawDir = path.join(testDir, 'openclaw');
const workspaceDir = path.join(testDir, 'workspace');

function setupParityData(): void {
  fs.mkdirSync(kpiDir, { recursive: true });
  fs.mkdirSync(obsDir, { recursive: true });
  fs.mkdirSync(path.join(openclawDir, 'agents', 'oracle', 'sessions'), { recursive: true });
  fs.mkdirSync(workspaceDir, { recursive: true });

  // KPI data
  const kpiData = {
    date: '2025-02-15',
    overall: {
      success_rate: 0.96,
      latency_ms: { p50: 110, p95: 430, p99: 870 },
      handoff: { success_rate: 0.91 },
      backup: { age_hours: 2.1 },
    },
    slo: { success_rate: 0.9, p95_latency_s: 1.0, backup_age_h: 24 },
  };
  fs.writeFileSync(path.join(kpiDir, '2025-02-15.json'), JSON.stringify(kpiData));

  // Observation
  fs.writeFileSync(
    path.join(obsDir, '2025-02-15.md'),
    '# Parity test\n## 10:00 — Test observation\nSome content here.\n',
  );
  fs.utimesSync(path.join(obsDir, '2025-02-15.md'), new Date(), new Date());

  // Agent sessions
  fs.writeFileSync(
    path.join(openclawDir, 'agents', 'oracle', 'sessions', 'sessions.json'),
    JSON.stringify({
      'agent:oracle:main': {
        sessionId: 'parity-001',
        label: 'Oracle Parity',
        updatedAt: Date.now(),
      },
    }),
  );
}

setupParityData();

// ── Shared helpers ───────────────────────────────────────────────────────────

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

// ── Parity Tests ─────────────────────────────────────────────────────────────

describe('Response Parity — API Contract Verification', () => {
  describe('/api/kpis/latest', () => {
    const deps: KpiDeps = { KPI_DIR: kpiDir, safeReadJson, sendJson, clampInt };

    it('response shape matches expected contract', () => {
      const req = mockRequest({ url: '/api/kpis/latest' });
      const res = mockResponse();
      handleKpis(req, res, deps);

      const body = parseJsonBody(res);

      // Required top-level fields
      expect(body).toHaveProperty('latest');
      expect(body).toHaveProperty('file');
      expect(body).toHaveProperty('dir');
      expect(body).toHaveProperty('count');

      // latest shape
      const latest = body.latest as KpiFileData;
      expect(latest).toHaveProperty('date');
      expect(latest).toHaveProperty('overall');
      expect(latest.overall).toHaveProperty('success_rate');
      expect(latest.overall).toHaveProperty('latency_ms');
      expect(latest.overall!.latency_ms).toHaveProperty('p50');
      expect(latest.overall!.latency_ms).toHaveProperty('p95');
      expect(latest.overall!.latency_ms).toHaveProperty('p99');

      // Value type checks
      expect(typeof latest.date).toBe('string');
      expect(typeof latest.overall!.success_rate).toBe('number');
      expect(typeof body.count).toBe('number');
    });

    it('success_rate is between 0 and 1', () => {
      const req = mockRequest({ url: '/api/kpis/latest' });
      const res = mockResponse();
      handleKpis(req, res, deps);

      const body = parseJsonBody(res);
      const latest = body.latest as KpiFileData;
      expect(latest.overall!.success_rate).toBeGreaterThanOrEqual(0);
      expect(latest.overall!.success_rate).toBeLessThanOrEqual(1);
    });
  });

  describe('/api/kpis/history', () => {
    const deps: KpiDeps = { KPI_DIR: kpiDir, safeReadJson, sendJson, clampInt };

    it('response shape matches expected contract', () => {
      const req = mockRequest({ url: '/api/kpis/history' });
      const res = mockResponse();
      handleKpis(req, res, deps);

      const body = parseJsonBody(res);

      expect(body).toHaveProperty('days');
      expect(body).toHaveProperty('dir');
      expect(body).toHaveProperty('files');
      expect(body).toHaveProperty('items');
      expect(body).toHaveProperty('count');

      expect(typeof body.days).toBe('number');
      expect(Array.isArray(body.items)).toBe(true);
      expect(typeof body.count).toBe('number');
    });
  });

  describe('/api/observations/recent', () => {
    const deps: ObservationsDeps = { OBSERVATIONS_DIR: obsDir, safeReadText, sendJson, clampInt };

    it('response shape matches expected contract', () => {
      const req = mockRequest({ url: '/api/observations/recent' });
      const res = mockResponse();
      handleObservations(req, res, deps);

      const body = parseJsonBody(res);

      expect(body).toHaveProperty('hours');
      expect(body).toHaveProperty('cutoff');
      expect(body).toHaveProperty('dir');
      expect(body).toHaveProperty('count');
      expect(body).toHaveProperty('items');

      expect(typeof body.hours).toBe('number');
      expect(typeof body.cutoff).toBe('number');
      expect(Array.isArray(body.items)).toBe(true);
    });

    it('items have correct shape', () => {
      const req = mockRequest({ url: '/api/observations/recent?hours=720' });
      const res = mockResponse();
      handleObservations(req, res, deps);

      const body = parseJsonBody(res);
      const items = body.items as Array<Record<string, unknown>>;
      if (items.length > 0) {
        const item = items[0];
        expect(item).toHaveProperty('path');
        expect(item).toHaveProperty('type');
        expect(item).toHaveProperty('date');
        expect(item).toHaveProperty('mtimeMs');
        expect(item).toHaveProperty('size');
        expect(item).toHaveProperty('snippet');
      }
    });
  });

  describe('/api/observations/search', () => {
    const deps: ObservationsDeps = { OBSERVATIONS_DIR: obsDir, safeReadText, sendJson, clampInt };

    it('response shape matches expected contract', () => {
      const req = mockRequest({ url: '/api/observations/search?q=test' });
      const res = mockResponse();
      handleObservations(req, res, deps);

      const body = parseJsonBody(res);

      expect(body).toHaveProperty('q');
      expect(body).toHaveProperty('dir');
      expect(body).toHaveProperty('count');
      expect(body).toHaveProperty('items');

      expect(typeof body.q).toBe('string');
      expect(Array.isArray(body.items)).toBe(true);
    });

    it('search items have match field', () => {
      const req = mockRequest({ url: '/api/observations/search?q=parity' });
      const res = mockResponse();
      handleObservations(req, res, deps);

      const body = parseJsonBody(res);
      const items = body.items as Array<Record<string, unknown>>;
      if (items.length > 0) {
        expect(items[0]).toHaveProperty('match');
        expect(typeof items[0].match).toBe('string');
      }
    });

    it('error response has correct shape', () => {
      const req = mockRequest({ url: '/api/observations/search' });
      const res = mockResponse();
      handleObservations(req, res, deps);

      expect(res._statusCode).toBe(400);
      const body = parseJsonBody(res);
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('count');
      expect(body.count).toBe(0);
    });
  });

  describe('/api/agent-health', () => {
    const deps: AgentHealthDeps = { OPENCLAW_DIR: openclawDir, WORKSPACE_DIR: workspaceDir, sendJson };

    it('response shape matches expected contract', () => {
      const req = mockRequest({ url: '/api/agent-health' });
      const res = mockResponse();
      handleAgentHealth(req, res, deps);

      const body = parseJsonBody<AgentHealthResponse>(res);

      expect(body).toHaveProperty('now');
      expect(body).toHaveProperty('openclawDir');
      expect(body).toHaveProperty('workspaceDir');
      expect(body).toHaveProperty('lastActiveMs');
      expect(body).toHaveProperty('workspace');
      expect(body).toHaveProperty('openclaw');
      expect(body).toHaveProperty('agents');

      expect(typeof body.now).toBe('number');
      expect(typeof body.lastActiveMs).toBe('number');
      expect(Array.isArray(body.agents)).toBe(true);
    });

    it('agents have correct shape', () => {
      const req = mockRequest({ url: '/api/agent-health' });
      const res = mockResponse();
      handleAgentHealth(req, res, deps);

      const body = parseJsonBody<AgentHealthResponse>(res);
      if (body.agents.length > 0) {
        const agent = body.agents[0];
        expect(agent).toHaveProperty('agentId');
        expect(agent).toHaveProperty('sessionsDir');
        expect(agent).toHaveProperty('sessionCount');
        expect(agent).toHaveProperty('abortedCount');
        expect(agent).toHaveProperty('successRate');
        expect(agent).toHaveProperty('lastUpdatedAt');
      }
    });

    it('workspace/openclaw size objects have bytes field', () => {
      const req = mockRequest({ url: '/api/agent-health' });
      const res = mockResponse();
      handleAgentHealth(req, res, deps);

      const body = parseJsonBody<AgentHealthResponse>(res);
      expect(body.workspace).toHaveProperty('bytes');
      expect(body.openclaw).toHaveProperty('bytes');
      expect(typeof body.workspace.bytes).toBe('number');
    });
  });
});

/**
 * Agent Diagnostics route handler tests — Issue #205.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import {
  handleAgentDiagnostics,
  matchDiagnosticsUrl,
} from '../../../server/routes/agent-diagnostics.js';
import type {
  DiagnosticsDeps,
  AgentDiagnosticsResponse,
} from '../../../server/routes/agent-diagnostics.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const testOpenclawDir = path.join('/tmp', `test-diag-oc-${process.pid}`);

function setupFixtures(): void {
  const oracleSessionsDir = path.join(testOpenclawDir, 'agents', 'oracle', 'sessions');
  const sentinelSessionsDir = path.join(testOpenclawDir, 'agents', 'sentinel', 'sessions');
  fs.mkdirSync(oracleSessionsDir, { recursive: true });
  fs.mkdirSync(sentinelSessionsDir, { recursive: true });

  fs.writeFileSync(
    path.join(oracleSessionsDir, 'sessions.json'),
    JSON.stringify({
      'agent:oracle:main': {
        sessionId: 'sess-001',
        label: 'Oracle Main',
        updatedAt: Date.now(),
        abortedLastRun: false,
      },
      'agent:oracle:cron:scan': {
        sessionId: 'sess-002',
        label: 'Oracle Cron',
        updatedAt: Date.now() - 3600000,
        abortedLastRun: true,
      },
      'agent:oracle:sub:task1': {
        sessionId: 'sess-003',
        label: 'Oracle Sub',
        updatedAt: Date.now() - 7200000,
        abortedLastRun: false,
      },
    }),
  );

  fs.writeFileSync(
    path.join(sentinelSessionsDir, 'sessions.json'),
    JSON.stringify({
      'agent:sentinel:main': {
        sessionId: 'sess-s01',
        label: 'Sentinel Main',
        updatedAt: Date.now(),
        abortedLastRun: false,
      },
    }),
  );

  // Write a sample JSONL with an error
  fs.writeFileSync(
    path.join(oracleSessionsDir, 'sess-001.jsonl'),
    [
      JSON.stringify({
        type: 'message',
        timestamp: new Date().toISOString(),
        message: { role: 'assistant', content: 'All good' },
        _sessionKey: 'agent:oracle:main',
      }),
      JSON.stringify({
        type: 'error',
        timestamp: new Date().toISOString(),
        error: 'Connection timeout to external API',
        _sessionKey: 'agent:oracle:main',
      }),
    ].join('\n') + '\n',
  );
}

function cleanupFixtures(): void {
  try {
    fs.rmSync(testOpenclawDir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

function createDeps(overrides: Partial<DiagnosticsDeps> = {}): DiagnosticsDeps {
  return {
    OPENCLAW_DIR: testOpenclawDir,
    sendJson: (res, data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    },
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('matchDiagnosticsUrl', () => {
  it('matches valid diagnostics URL', () => {
    expect(matchDiagnosticsUrl('/api/agent-health/oracle/diagnostics')).toBe('oracle');
  });

  it('matches with query string', () => {
    expect(matchDiagnosticsUrl('/api/agent-health/sentinel/diagnostics?v=1')).toBe('sentinel');
  });

  it('returns null for plain agent-health URL', () => {
    expect(matchDiagnosticsUrl('/api/agent-health')).toBeNull();
  });

  it('returns null for unrelated paths', () => {
    expect(matchDiagnosticsUrl('/api/kpis')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(matchDiagnosticsUrl(undefined)).toBeNull();
  });

  it('rejects invalid agent IDs', () => {
    expect(matchDiagnosticsUrl('/api/agent-health/../etc/diagnostics')).toBeNull();
    expect(matchDiagnosticsUrl('/api/agent-health/UPPER/diagnostics')).toBeNull();
  });

  it('accepts hyphenated agent IDs', () => {
    expect(matchDiagnosticsUrl('/api/agent-health/my-agent/diagnostics')).toBe('my-agent');
  });
});

describe('Agent Diagnostics Route Handler', () => {
  beforeEach(() => {
    setupFixtures();
  });

  afterAll(() => {
    cleanupFixtures();
  });

  describe('routing', () => {
    it('returns false for non-matching URLs', () => {
      expect(
        handleAgentDiagnostics(
          mockRequest({ url: '/api/agent-health' }),
          mockResponse(),
          createDeps(),
        ),
      ).toBe(false);
    });

    it('returns false for POST requests', () => {
      expect(
        handleAgentDiagnostics(
          mockRequest({ url: '/api/agent-health/oracle/diagnostics', method: 'POST' }),
          mockResponse(),
          createDeps(),
        ),
      ).toBe(false);
    });

    it('returns false when req is null', () => {
      expect(
        handleAgentDiagnostics(null as any, mockResponse(), createDeps()),
      ).toBe(false);
    });

    it('returns true for valid diagnostics URL', () => {
      expect(
        handleAgentDiagnostics(
          mockRequest({ url: '/api/agent-health/oracle/diagnostics' }),
          mockResponse(),
          createDeps(),
        ),
      ).toBe(true);
    });
  });

  describe('GET /api/agent-health/:agentId/diagnostics', () => {
    it('returns valid diagnostics for oracle', () => {
      const res = mockResponse();
      handleAgentDiagnostics(
        mockRequest({ url: '/api/agent-health/oracle/diagnostics' }),
        res,
        createDeps(),
      );
      expect(res._ended).toBe(true);
      expect(res._statusCode).toBe(200);

      const body = parseJsonBody<AgentDiagnosticsResponse>(res);
      expect(body.agentId).toBe('oracle');
      expect(body.now).toBeGreaterThan(0);
      expect(body.sessionCount).toBe(3);
      expect(body.abortedCount).toBe(1);
      expect(body.healthScore).toBeGreaterThanOrEqual(0);
      expect(body.healthScore).toBeLessThanOrEqual(100);
    });

    it('returns correct success rate', () => {
      const res = mockResponse();
      handleAgentDiagnostics(
        mockRequest({ url: '/api/agent-health/oracle/diagnostics' }),
        res,
        createDeps(),
      );
      const body = parseJsonBody<AgentDiagnosticsResponse>(res);
      // 2 out of 3 sessions succeeded
      expect(body.successRate).toBeCloseTo(2 / 3, 2);
    });

    it('returns metrics history array', () => {
      const res = mockResponse();
      handleAgentDiagnostics(
        mockRequest({ url: '/api/agent-health/oracle/diagnostics' }),
        res,
        createDeps(),
      );
      const body = parseJsonBody<AgentDiagnosticsResponse>(res);
      expect(Array.isArray(body.metricsHistory)).toBe(true);
      expect(body.metricsHistory.length).toBeGreaterThan(0);

      // Verify sample structure
      const sample = body.metricsHistory[0];
      expect(sample).toHaveProperty('ts');
      expect(sample).toHaveProperty('cpuUsage');
      expect(sample).toHaveProperty('memoryUsage');
      expect(sample).toHaveProperty('latencyMs');
      expect(sample).toHaveProperty('requestsPerSec');
      expect(sample).toHaveProperty('errorRate');
    });

    it('metrics values are within valid ranges', () => {
      const res = mockResponse();
      handleAgentDiagnostics(
        mockRequest({ url: '/api/agent-health/oracle/diagnostics' }),
        res,
        createDeps(),
      );
      const body = parseJsonBody<AgentDiagnosticsResponse>(res);
      for (const sample of body.metricsHistory) {
        expect(sample.cpuUsage).toBeGreaterThanOrEqual(0);
        expect(sample.cpuUsage).toBeLessThanOrEqual(1);
        expect(sample.memoryUsage).toBeGreaterThanOrEqual(0);
        expect(sample.memoryUsage).toBeLessThanOrEqual(1);
        expect(sample.latencyMs).toBeGreaterThanOrEqual(0);
        expect(sample.requestsPerSec).toBeGreaterThanOrEqual(0);
        expect(sample.errorRate).toBeGreaterThanOrEqual(0);
        expect(sample.errorRate).toBeLessThanOrEqual(1);
      }
    });

    it('returns recent sessions (max 10)', () => {
      const res = mockResponse();
      handleAgentDiagnostics(
        mockRequest({ url: '/api/agent-health/oracle/diagnostics' }),
        res,
        createDeps(),
      );
      const body = parseJsonBody<AgentDiagnosticsResponse>(res);
      expect(Array.isArray(body.recentSessions)).toBe(true);
      expect(body.recentSessions.length).toBeLessThanOrEqual(10);
      // Should be sorted by updatedAt descending
      for (let i = 1; i < body.recentSessions.length; i++) {
        expect(body.recentSessions[i - 1].updatedAt)
          .toBeGreaterThanOrEqual(body.recentSessions[i].updatedAt);
      }
    });

    it('extracts errors from JSONL', () => {
      const res = mockResponse();
      handleAgentDiagnostics(
        mockRequest({ url: '/api/agent-health/oracle/diagnostics' }),
        res,
        createDeps(),
      );
      const body = parseJsonBody<AgentDiagnosticsResponse>(res);
      expect(Array.isArray(body.recentErrors)).toBe(true);
      // We wrote one error event in the JSONL
      const timeoutError = body.recentErrors.find(
        (e) => e.message.includes('Connection timeout'),
      );
      expect(timeoutError).toBeDefined();
    });

    it('returns alerts array', () => {
      const res = mockResponse();
      handleAgentDiagnostics(
        mockRequest({ url: '/api/agent-health/oracle/diagnostics' }),
        res,
        createDeps(),
      );
      const body = parseJsonBody<AgentDiagnosticsResponse>(res);
      expect(Array.isArray(body.alerts)).toBe(true);
      // Alerts should have valid structure
      for (const alert of body.alerts) {
        expect(['P0', 'P1']).toContain(alert.severity);
        expect(typeof alert.title).toBe('string');
        expect(typeof alert.message).toBe('string');
      }
    });

    it('returns 404 for unknown agent', () => {
      const res = mockResponse();
      handleAgentDiagnostics(
        mockRequest({ url: '/api/agent-health/nonexistent/diagnostics' }),
        res,
        createDeps(),
      );
      expect(res._ended).toBe(true);
      expect(res._statusCode).toBe(404);
      const body = parseJsonBody<{ error: string }>(res);
      expect(body.error).toBe('Agent not found');
    });

    it('returns valid data for sentinel (no errors, no aborts)', () => {
      const res = mockResponse();
      handleAgentDiagnostics(
        mockRequest({ url: '/api/agent-health/sentinel/diagnostics' }),
        res,
        createDeps(),
      );
      expect(res._statusCode).toBe(200);
      const body = parseJsonBody<AgentDiagnosticsResponse>(res);
      expect(body.agentId).toBe('sentinel');
      expect(body.sessionCount).toBe(1);
      expect(body.abortedCount).toBe(0);
      expect(body.successRate).toBe(1);
      expect(body.healthScore).toBeGreaterThanOrEqual(70);
    });
  });

  describe('edge cases', () => {
    it('handles empty sessions.json', () => {
      const emptyDir = path.join('/tmp', `empty-diag-${Date.now()}`);
      const agentDir = path.join(emptyDir, 'agents', 'empty-agent', 'sessions');
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(path.join(agentDir, 'sessions.json'), '{}');

      const res = mockResponse();
      handleAgentDiagnostics(
        mockRequest({ url: '/api/agent-health/empty-agent/diagnostics' }),
        res,
        createDeps({ OPENCLAW_DIR: emptyDir }),
      );
      expect(res._statusCode).toBe(200);
      const body = parseJsonBody<AgentDiagnosticsResponse>(res);
      expect(body.sessionCount).toBe(0);
      expect(body.successRate).toBeNull();

      fs.rmSync(emptyDir, { recursive: true, force: true });
    });

    it('handles malformed sessions.json', () => {
      const badDir = path.join('/tmp', `bad-diag-${Date.now()}`);
      const agentDir = path.join(badDir, 'agents', 'bad-agent', 'sessions');
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(path.join(agentDir, 'sessions.json'), 'not json');

      const res = mockResponse();
      handleAgentDiagnostics(
        mockRequest({ url: '/api/agent-health/bad-agent/diagnostics' }),
        res,
        createDeps({ OPENCLAW_DIR: badDir }),
      );
      expect(res._statusCode).toBe(200);
      const body = parseJsonBody<AgentDiagnosticsResponse>(res);
      expect(body.sessionCount).toBe(0);

      fs.rmSync(badDir, { recursive: true, force: true });
    });
  });
});

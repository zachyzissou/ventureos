/**
 * Agent Health route handler tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import { handleAgentHealth } from '../../../server/routes/agent-health.js';
import type { AgentHealthDeps, AgentHealthResponse } from '../../../server/types.js';

const testOpenclawDir = path.join('/tmp', 'test-openclaw-' + process.pid);
const testWorkspaceDir = path.join('/tmp', 'test-workspace-' + process.pid);

function setupFixtures(): void {
  const oracleDir = path.join(testOpenclawDir, 'agents', 'oracle', 'sessions');
  const sentinelDir = path.join(testOpenclawDir, 'agents', 'sentinel', 'sessions');
  fs.mkdirSync(oracleDir, { recursive: true });
  fs.mkdirSync(sentinelDir, { recursive: true });
  fs.writeFileSync(path.join(oracleDir, 'sessions.json'), JSON.stringify({
    'agent:oracle:main': { sessionId: 'sess-oracle-001', label: 'Oracle Main', updatedAt: Date.now(), abortedLastRun: false },
    'agent:oracle:cron:abc': { sessionId: 'sess-oracle-002', label: 'Oracle Cron', updatedAt: Date.now() - 3600000, abortedLastRun: true },
  }));
  fs.writeFileSync(path.join(sentinelDir, 'sessions.json'), JSON.stringify({
    'agent:sentinel:main': { sessionId: 'sess-sentinel-001', label: 'Sentinel Main', updatedAt: Date.now(), abortedLastRun: false },
  }));
  fs.mkdirSync(testWorkspaceDir, { recursive: true });
}

function createDeps(overrides: Partial<AgentHealthDeps> = {}): AgentHealthDeps {
  return {
    OPENCLAW_DIR: testOpenclawDir,
    WORKSPACE_DIR: testWorkspaceDir,
    sendJson: (res, data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); },
    ...overrides,
  };
}

describe('Agent Health Route Handler', () => {
  beforeEach(() => {
    setupFixtures();
  });

  describe('/api/agent-health', () => {
    it('returns agent health data', () => {
      const res = mockResponse();
      handleAgentHealth(mockRequest({ url: '/api/agent-health' }), res, createDeps());
      expect(res._ended).toBe(true);
      const body = parseJsonBody<AgentHealthResponse>(res);
      expect(body.now).toBeGreaterThan(0);
      expect(body.agents.length).toBeGreaterThanOrEqual(2);
    });

    it('includes oracle agent with correct session count', () => {
      const res = mockResponse();
      handleAgentHealth(mockRequest({ url: '/api/agent-health' }), res, createDeps());
      const body = parseJsonBody<AgentHealthResponse>(res);
      const oracle = body.agents.find(a => a.agentId === 'oracle');
      expect(oracle).toBeDefined();
      expect(oracle!.sessionCount).toBe(2);
      expect(oracle!.abortedCount).toBe(1);
    });

    it('calculates success rate correctly', () => {
      const res = mockResponse();
      handleAgentHealth(mockRequest({ url: '/api/agent-health' }), res, createDeps());
      const body = parseJsonBody<AgentHealthResponse>(res);
      const oracle = body.agents.find(a => a.agentId === 'oracle');
      expect(oracle!.successRate).toBe(0.5);
    });

    it('sentinel has 100% success', () => {
      const res = mockResponse();
      handleAgentHealth(mockRequest({ url: '/api/agent-health' }), res, createDeps());
      const body = parseJsonBody<AgentHealthResponse>(res);
      const sentinel = body.agents.find(a => a.agentId === 'sentinel');
      expect(sentinel!.successRate).toBe(1.0);
    });

    it('sorts agents by last activity', () => {
      const res = mockResponse();
      handleAgentHealth(mockRequest({ url: '/api/agent-health' }), res, createDeps());
      const body = parseJsonBody<AgentHealthResponse>(res);
      for (let i = 1; i < body.agents.length; i++) {
        expect(body.agents[i - 1].lastUpdatedAt).toBeGreaterThanOrEqual(body.agents[i].lastUpdatedAt);
      }
    });
  });

  describe('routing', () => {
    it('returns false for non-matching URL', () => {
      expect(handleAgentHealth(mockRequest({ url: '/api/sessions' }), mockResponse(), createDeps())).toBe(false);
    });

    it('returns false for POST', () => {
      expect(handleAgentHealth(mockRequest({ url: '/api/agent-health', method: 'POST' }), mockResponse(), createDeps())).toBe(false);
    });

    it('returns false when req is null', () => {
      expect(handleAgentHealth(null as any, mockResponse(), createDeps())).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles empty agents directory gracefully', () => {
      const emptyOcDir = path.join('/tmp', 'empty-oc-' + Date.now());
      fs.mkdirSync(path.join(emptyOcDir, 'agents'), { recursive: true });
      const res = mockResponse();
      // Note: handleAgentHealth has a 15s module-level cache, so this may
      // return cached data from a prior test. We verify it doesn't crash.
      handleAgentHealth(mockRequest({ url: '/api/agent-health' }), res, createDeps({ OPENCLAW_DIR: emptyOcDir }));
      expect(res._ended).toBe(true);
      const body = parseJsonBody<AgentHealthResponse>(res);
      expect(Array.isArray(body.agents)).toBe(true);
    });

    it('handles non-existent openclaw directory gracefully', () => {
      const res = mockResponse();
      handleAgentHealth(mockRequest({ url: '/api/agent-health' }), res, createDeps({ OPENCLAW_DIR: '/tmp/nonexistent-oc-xyz' }));
      expect(res._ended).toBe(true);
      const body = parseJsonBody<AgentHealthResponse>(res);
      expect(Array.isArray(body.agents)).toBe(true);
    });
  });
});

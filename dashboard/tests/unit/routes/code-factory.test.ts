import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import { handleCodeFactory, type CodeFactoryRouteDeps } from '../../../server/routes/code-factory.js';

const root = path.join('/tmp', `test-code-factory-route-${process.pid}`);
const dataDir = path.join(root, 'data');
const workspaceDir = path.join(root, 'workspace');

function deps(body: unknown = {}): CodeFactoryRouteDeps {
  return {
    dataDir,
    workspaceDir,
    sendJson: (res, data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    },
    readRequestBody: async () => JSON.stringify(body),
  };
}

beforeEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(workspaceDir, '.github', 'code-factory'), { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(workspaceDir, '.github', 'code-factory', 'risk-policy.json'),
    JSON.stringify({
      version: 'test',
      risk_tier_rules: [{ pattern: 'lib/**', tier: 'high' }, { pattern: '**', tier: 'low' }],
      required_checks: { low: ['lint'], medium: ['lint', 'test'], high: ['lint', 'test', 'sha-discipline'] },
      merge_policy: { auto_merge_low_risk: true, human_approval_high_risk: true },
      browser_evidence_patterns: ['dashboard/client/**'],
      harness_gap_policy: { sla_days: 3 },
    }),
  );
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('code-factory routes', () => {
  it('returns risk policy', async () => {
    const req = mockRequest({ method: 'GET', url: '/api/code-factory/risk-policy' });
    const res = mockResponse();
    const handled = await handleCodeFactory(req, res, deps());
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);
    const body = parseJsonBody<{ policy: { version: string } }>(res);
    expect(body.policy.version).toBe('test');
  });

  it('computes preflight risk analysis', async () => {
    const req = mockRequest({ method: 'POST', url: '/api/code-factory/preflight' });
    const res = mockResponse();
    const handled = await handleCodeFactory(req, res, deps({
      prNumber: 12,
      headSha: 'abc123',
      changedFiles: ['lib/code-factory.ts'],
    }));
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);
    const body = parseJsonBody<{ analysis: { riskTier: string }; evidence: { head_sha: string } }>(res);
    expect(body.analysis.riskTier).toBe('high');
    expect(body.evidence.head_sha).toBe('abc123');
  });

  it('tracks harness gaps lifecycle', async () => {
    const createReq = mockRequest({ method: 'POST', url: '/api/code-factory/harness-gaps' });
    const createRes = mockResponse();
    await handleCodeFactory(createReq, createRes, deps({ incidentRef: 'INC-1', slaDays: 2 }));
    expect(createRes._statusCode).toBe(201);
    const created = parseJsonBody<{ record: { id: string } }>(createRes);

    const listReq = mockRequest({ method: 'GET', url: '/api/code-factory/harness-gaps' });
    const listRes = mockResponse();
    await handleCodeFactory(listReq, listRes, deps());
    const listed = parseJsonBody<{ total: number }>(listRes);
    expect(listed.total).toBe(1);

    const patchReq = mockRequest({ method: 'PATCH', url: `/api/code-factory/harness-gaps/${created.record.id}` });
    const patchRes = mockResponse();
    await handleCodeFactory(patchReq, patchRes, deps({ testCaseAdded: true }));
    expect(patchRes._statusCode).toBe(200);
    const patched = parseJsonBody<{ record: { test_case_added: boolean } }>(patchRes);
    expect(patched.record.test_case_added).toBe(true);
  });
});


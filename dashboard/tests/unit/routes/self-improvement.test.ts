import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import { handleSelfImprovement, type SelfImprovementRouteDeps } from '../../../server/routes/self-improvement.js';

const testRoot = path.join('/tmp', `test-self-improvement-route-${process.pid}`);
const dataDir = path.join(testRoot, 'data');
const workspaceDir = path.join(testRoot, 'workspace');

function deps(body: unknown = {}): SelfImprovementRouteDeps {
  return {
    dataDir,
    workspaceDir,
    defaultAgentId: 'oracle',
    sendJson: (res, data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    },
    readRequestBody: async () => JSON.stringify(body),
  };
}

beforeEach(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(dataDir), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, 'souls', 'oracle'), { recursive: true });
  fs.writeFileSync(path.join(workspaceDir, 'souls', 'oracle', 'SOUL.md'), '# SOUL\n');
  fs.writeFileSync(path.join(workspaceDir, 'souls', 'oracle', 'PRINCIPLES.md'), '# PRINCIPLES\n');
  fs.writeFileSync(path.join(dataDir, 'task-board.json'), JSON.stringify({ tasks: [] }));
});

afterEach(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
});

describe('self-improvement routes', () => {
  it('generates and lists digests', async () => {
    const generateReq = mockRequest({ method: 'POST', url: '/api/self-improvement/generate' });
    const generateRes = mockResponse();
    const handledGenerate = await handleSelfImprovement(generateReq, generateRes, deps({ agentId: 'oracle' }));
    expect(handledGenerate).toBe(true);
    expect(generateRes._statusCode).toBe(200);
    const generated = parseJsonBody<{ ok: boolean; digest: { id: string; recommendations: unknown[] } }>(generateRes);
    expect(generated.ok).toBe(true);
    expect(generated.digest.recommendations.length).toBeGreaterThanOrEqual(3);

    const listReq = mockRequest({ method: 'GET', url: '/api/self-improvement/digests?agentId=oracle' });
    const listRes = mockResponse();
    const handledList = await handleSelfImprovement(listReq, listRes, deps());
    expect(handledList).toBe(true);
    expect(listRes._statusCode).toBe(200);
    const listed = parseJsonBody<{ total: number }>(listRes);
    expect(listed.total).toBe(1);
  });

  it('approves a recommendation through API', async () => {
    const generateReq = mockRequest({ method: 'POST', url: '/api/self-improvement/generate' });
    const generateRes = mockResponse();
    await handleSelfImprovement(generateReq, generateRes, deps({ agentId: 'oracle' }));
    const generated = parseJsonBody<{
      digest: { recommendations: Array<{ id: string }> };
    }>(generateRes);
    const recommendationId = generated.digest.recommendations[0].id;

    const approveReq = mockRequest({
      method: 'POST',
      url: `/api/self-improvement/recommendations/${recommendationId}/approve`,
    });
    const approveRes = mockResponse();
    await handleSelfImprovement(approveReq, approveRes, deps({ agentId: 'oracle' }));
    expect(approveRes._statusCode).toBe(200);
    const body = parseJsonBody<{ ok: boolean; recommendation: { status: string } }>(approveRes);
    expect(body.ok).toBe(true);
    expect(body.recommendation.status).toBe('applied');
  });

  it('returns 404 when digest id does not exist', async () => {
    const req = mockRequest({ method: 'GET', url: '/api/self-improvement/digests/not-found' });
    const res = mockResponse();
    await handleSelfImprovement(req, res, deps());
    expect(res._statusCode).toBe(404);
  });
});


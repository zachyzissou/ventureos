import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import { handleTokenCompaction, type TokenCompactionDeps } from '../../../server/routes/token-compaction.js';

const testRootDir = path.join('/tmp', `test-token-compaction-${process.pid}`);
const testDataDir = path.join(testRootDir, 'data');

function createDeps(body: unknown = {}): TokenCompactionDeps {
  return {
    dataDir: testDataDir,
    sendJson: (res, data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    },
    readRequestBody: async () => JSON.stringify(body),
  };
}

beforeEach(() => {
  fs.rmSync(testRootDir, { recursive: true, force: true });
  fs.mkdirSync(testDataDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(testRootDir, { recursive: true, force: true });
});

describe('token-compaction route', () => {
  it('runs compaction and stores metrics', async () => {
    const req = mockRequest({
      method: 'POST',
      url: '/api/token-compaction/run',
    });
    const res = mockResponse();
    const deps = createDeps({
      sessionId: 'sess-a',
      agentId: 'venture_research',
      compression: { level: 'standard', protected_files: ['SOUL.md'] },
      files: [
        { path: 'src/a.ts', content: '// comment\nconst a = 1;\n'.repeat(50), priority: 1 },
        { path: 'souls/venture_research/SOUL.md', content: '# protected\nkeep me\n' },
      ],
    });

    const handled = await handleTokenCompaction(req, res, deps);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);

    const body = parseJsonBody<{ ok: boolean; result: { metrics: { preTokens: number; postTokens: number } } }>(res);
    expect(body.ok).toBe(true);
    expect(body.result.metrics.preTokens).toBeGreaterThan(body.result.metrics.postTokens);

    const metricsReq = mockRequest({ method: 'GET', url: '/api/token-compaction/metrics?sessionId=sess-a' });
    const metricsRes = mockResponse();
    const handledMetrics = await handleTokenCompaction(metricsReq, metricsRes, createDeps());
    expect(handledMetrics).toBe(true);
    expect(metricsRes._statusCode).toBe(200);

    const metricsBody = parseJsonBody<{
      total: number;
      summary: { savedTokens: number; bySession: Record<string, { runs: number }> };
    }>(metricsRes);
    expect(metricsBody.total).toBe(1);
    expect(metricsBody.summary.savedTokens).toBeGreaterThan(0);
    expect(metricsBody.summary.bySession['sess-a']?.runs).toBe(1);
  });

  it('returns validation errors for malformed payloads', async () => {
    const req = mockRequest({ method: 'POST', url: '/api/token-compaction/run' });
    const res = mockResponse();
    const handled = await handleTokenCompaction(req, res, createDeps({ foo: 'bar' }));
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(400);
  });

  it('filters metrics by agent', async () => {
    const run = async (sessionId: string, agentId: string): Promise<void> => {
      const req = mockRequest({ method: 'POST', url: '/api/token-compaction/run' });
      const res = mockResponse();
      await handleTokenCompaction(req, res, createDeps({
        sessionId,
        agentId,
        files: [{ path: `${agentId}.ts`, content: '// comment\nconst z = 1;\n'.repeat(10) }],
      }));
      expect(res._statusCode).toBe(200);
    };

    await run('sess-1', 'venture_research');
    await run('sess-2', 'venture_infrastructure');

    const req = mockRequest({ method: 'GET', url: '/api/token-compaction/metrics?agentId=venture_infrastructure' });
    const res = mockResponse();
    await handleTokenCompaction(req, res, createDeps());
    expect(res._statusCode).toBe(200);

    const body = parseJsonBody<{ total: number; metrics: Array<{ agentId?: string }> }>(res);
    expect(body.total).toBe(1);
    expect(body.metrics[0]?.agentId).toBe('venture_infrastructure');
  });
});


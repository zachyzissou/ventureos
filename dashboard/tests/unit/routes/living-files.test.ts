import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import { handleLivingFiles } from '../../../server/routes/living-files.js';
import { resetLivingFileEngine } from '../../../server/living-files.js';

const testRoot = path.join('/tmp', `ventureos-living-files-routes-${process.pid}`);
const dataDir = path.join(testRoot, 'data');
const workspaceDir = path.join(testRoot, 'workspace');

function sendJson(res: ReturnType<typeof mockResponse>, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

beforeEach(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(workspaceDir, { recursive: true });
  resetLivingFileEngine(dataDir, workspaceDir);
});

afterEach(() => {
  resetLivingFileEngine(dataDir, workspaceDir);
  fs.rmSync(testRoot, { recursive: true, force: true });
});

describe('living-files routes', () => {
  it('registers and lists living files', async () => {
    const createReq = mockRequest({ method: 'POST', url: '/api/living-files/files' });
    const createRes = mockResponse();
    const handled = await handleLivingFiles(createReq, createRes, {
      dataDir,
      workspaceDir,
      sendJson: sendJson as any,
      readRequestBody: async () => JSON.stringify({
        filePath: 'README.md',
        ownerAgentId: 'archivist',
        expectedUpdateHours: 24,
      }),
    });
    expect(handled).toBe(true);
    expect(createRes._statusCode).toBe(201);
    const created = parseJsonBody<{ file: { fileId: string } }>(createRes);
    expect(created.file.fileId).toContain('lf-');

    const listReq = mockRequest({ method: 'GET', url: '/api/living-files/files' });
    const listRes = mockResponse();
    await handleLivingFiles(listReq, listRes, {
      dataDir,
      workspaceDir,
      sendJson: sendJson as any,
      readRequestBody: async () => '',
    });
    const listBody = parseJsonBody<{ files: unknown[] }>(listRes);
    expect(listBody.files).toHaveLength(1);
  });

  it('runs staleness check and returns dashboard summary', async () => {
    const createReq = mockRequest({ method: 'POST', url: '/api/living-files/files' });
    const createRes = mockResponse();
    await handleLivingFiles(createReq, createRes, {
      dataDir,
      workspaceDir,
      sendJson: sendJson as any,
      readRequestBody: async () => JSON.stringify({
        filePath: 'docs/MISSING.md',
        ownerAgentId: 'oracle',
        expectedUpdateHours: 12,
      }),
    });

    const runReq = mockRequest({ method: 'POST', url: '/api/living-files/check-run' });
    const runRes = mockResponse();
    await handleLivingFiles(runReq, runRes, {
      dataDir,
      workspaceDir,
      sendJson: sendJson as any,
      readRequestBody: async () => JSON.stringify({ source: 'unit-test', autoTrigger: true }),
    });
    const runBody = parseJsonBody<{ run: { counts: { missing: number; triggered: number } }; triggered: unknown[] }>(runRes);
    expect(runBody.run.counts.missing).toBe(1);
    expect(runBody.run.counts.triggered).toBe(1);
    expect(runBody.triggered).toHaveLength(1);

    const dashboardReq = mockRequest({ method: 'GET', url: '/api/living-files/dashboard' });
    const dashboardRes = mockResponse();
    await handleLivingFiles(dashboardReq, dashboardRes, {
      dataDir,
      workspaceDir,
      sendJson: sendJson as any,
      readRequestBody: async () => '',
    });
    const dashboard = parseJsonBody<{ summary: { counts: { openTriggers: number; missing: number } } }>(dashboardRes);
    expect(dashboard.summary.counts.openTriggers).toBeGreaterThanOrEqual(1);
    expect(dashboard.summary.counts.missing).toBe(1);
  });

  it('supports trigger acknowledge and resolve actions', async () => {
    const createReq = mockRequest({ method: 'POST', url: '/api/living-files/files' });
    await handleLivingFiles(createReq, mockResponse(), {
      dataDir,
      workspaceDir,
      sendJson: sendJson as any,
      readRequestBody: async () => JSON.stringify({
        filePath: 'docs/MISSING.md',
        ownerAgentId: 'oracle',
        expectedUpdateHours: 12,
      }),
    });

    await handleLivingFiles(mockRequest({ method: 'POST', url: '/api/living-files/check-run' }), mockResponse(), {
      dataDir,
      workspaceDir,
      sendJson: sendJson as any,
      readRequestBody: async () => JSON.stringify({ autoTrigger: true }),
    });

    const triggersReq = mockRequest({ method: 'GET', url: '/api/living-files/triggers?status=queued' });
    const triggersRes = mockResponse();
    await handleLivingFiles(triggersReq, triggersRes, {
      dataDir,
      workspaceDir,
      sendJson: sendJson as any,
      readRequestBody: async () => '',
    });
    const triggerId = parseJsonBody<{ triggers: Array<{ triggerId: string }> }>(triggersRes).triggers[0].triggerId;

    const ackReq = mockRequest({ method: 'POST', url: `/api/living-files/triggers/${triggerId}/acknowledge` });
    const ackRes = mockResponse();
    await handleLivingFiles(ackReq, ackRes, {
      dataDir,
      workspaceDir,
      sendJson: sendJson as any,
      readRequestBody: async () => '',
    });
    const ackBody = parseJsonBody<{ trigger: { status: string } }>(ackRes);
    expect(ackBody.trigger.status).toBe('acknowledged');

    const resolveReq = mockRequest({ method: 'POST', url: `/api/living-files/triggers/${triggerId}/resolve` });
    const resolveRes = mockResponse();
    await handleLivingFiles(resolveReq, resolveRes, {
      dataDir,
      workspaceDir,
      sendJson: sendJson as any,
      readRequestBody: async () => JSON.stringify({ note: 'Handled manually' }),
    });
    const resolveBody = parseJsonBody<{ trigger: { status: string; resolutionNote: string } }>(resolveRes);
    expect(resolveBody.trigger.status).toBe('resolved');
    expect(resolveBody.trigger.resolutionNote).toContain('Handled');
  });

  it('rejects registration paths that escape workspace via sibling-prefix traversal', async () => {
    const siblingWorkspace = path.join(testRoot, 'workspace2');
    fs.mkdirSync(siblingWorkspace, { recursive: true });
    fs.writeFileSync(path.join(siblingWorkspace, 'secret.txt'), 'sibling');

    const createReq = mockRequest({ method: 'POST', url: '/api/living-files/files' });
    const createRes = mockResponse();
    const handled = await handleLivingFiles(createReq, createRes, {
      dataDir,
      workspaceDir,
      sendJson: sendJson as any,
      readRequestBody: async () => JSON.stringify({
        filePath: '../workspace2/secret.txt',
        ownerAgentId: 'archivist',
        expectedUpdateHours: 24,
      }),
    });
    expect(handled).toBe(true);
    expect(createRes._statusCode).toBe(400);
    const body = parseJsonBody<{ ok: boolean; error: string }>(createRes);
    expect(body.ok).toBe(false);
    expect(body.error).toContain('filePath must stay inside workspace');
  });

  it('rejects registration paths that escape workspace via absolute path', async () => {
    const absoluteOutside = path.join(path.parse(workspaceDir).root, 'ventureos-outside', 'secret.txt');
    const createReq = mockRequest({ method: 'POST', url: '/api/living-files/files' });
    const createRes = mockResponse();
    const handled = await handleLivingFiles(createReq, createRes, {
      dataDir,
      workspaceDir,
      sendJson: sendJson as any,
      readRequestBody: async () => JSON.stringify({
        filePath: absoluteOutside,
        ownerAgentId: 'archivist',
        expectedUpdateHours: 24,
      }),
    });
    expect(handled).toBe(true);
    expect(createRes._statusCode).toBe(400);
    const body = parseJsonBody<{ ok: boolean; error: string }>(createRes);
    expect(body.ok).toBe(false);
    expect(body.error).toContain('filePath must stay inside workspace');
  });
});

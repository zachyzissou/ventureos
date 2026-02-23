import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import {
  handleProposalLifecycle,
  handleProposalLifecycleUpgrade,
} from '../../../server/routes/proposal-lifecycle.js';
import { resetProposalLifecycleEngine } from '../../../server/proposal-lifecycle.js';

const testRoot = path.join('/tmp', `ventureos-proposal-lifecycle-routes-${process.pid}`);
const dataDir = path.join(testRoot, 'data');

function sendJson(res: ReturnType<typeof mockResponse>, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

class MockSocket extends EventEmitter {
  public chunks: Array<string | Buffer> = [];
  public ended = false;
  public destroyed = false;

  write(chunk: string | Buffer): boolean {
    this.chunks.push(chunk);
    return true;
  }

  end(): this {
    this.ended = true;
    return this;
  }

  destroy(): this {
    this.destroyed = true;
    return this;
  }
}

beforeEach(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  resetProposalLifecycleEngine(dataDir);
});

afterEach(() => {
  resetProposalLifecycleEngine(dataDir);
  fs.rmSync(testRoot, { recursive: true, force: true });
});

describe('proposal lifecycle routes', () => {
  it('submits proposal and exposes it in summary', async () => {
    const submitReq = mockRequest({ method: 'POST', url: '/api/proposal-lifecycle/proposals' });
    const submitRes = mockResponse();
    const handled = await handleProposalLifecycle(submitReq, submitRes, {
      dataDir,
      sendJson: sendJson as any,
      readRequestBody: async () => JSON.stringify({
        title: 'Launch campaign',
        goal: 'Ship campaign assets with QA',
        submittedByAgentId: 'echo',
        estimatedCostUsd: 4.2,
        requiredSkills: ['creative', 'qa'],
        riskAssessment: { level: 'medium', summary: 'coordination risk', mitigations: ['handoff checklist'] },
        steps: [
          { title: 'Draft assets', description: 'Create campaign assets', agentId: 'synth' },
          { title: 'Run QA', description: 'Validate assets', agentId: 'verifier' },
        ],
      }),
    });
    expect(handled).toBe(true);
    expect(submitRes._statusCode).toBe(201);
    const submitBody = parseJsonBody<{ proposal: { proposalId: string } }>(submitRes);
    expect(submitBody.proposal.proposalId).toContain('proposal-');

    const summaryReq = mockRequest({ method: 'GET', url: '/api/proposal-lifecycle/summary' });
    const summaryRes = mockResponse();
    await handleProposalLifecycle(summaryReq, summaryRes, {
      dataDir,
      sendJson: sendJson as any,
      readRequestBody: async () => '',
    });
    const summaryBody = parseJsonBody<{ ok: boolean; summary: { pendingProposals: unknown[] } }>(summaryRes);
    expect(summaryBody.ok).toBe(true);
    expect(summaryBody.summary.pendingProposals.length).toBe(1);
  });

  it('approves proposal then starts mission', async () => {
    const submitReq = mockRequest({ method: 'POST', url: '/api/proposal-lifecycle/proposals' });
    const submitRes = mockResponse();
    await handleProposalLifecycle(submitReq, submitRes, {
      dataDir,
      sendJson: sendJson as any,
      readRequestBody: async () => JSON.stringify({
        title: 'Feature release',
        goal: 'Release feature bundle',
        submittedByAgentId: 'echo',
        estimatedCostUsd: 5,
        requiredSkills: ['delivery'],
        riskAssessment: { level: 'low', summary: 'standard release', mitigations: [] },
        steps: [
          { stepId: 'one', title: 'Build', description: 'Build package', agentId: 'atlas' },
          { stepId: 'two', title: 'Verify', description: 'Verify package', agentId: 'verifier', dependsOnStepIds: ['one'] },
        ],
      }),
    });
    const proposalId = parseJsonBody<{ proposal: { proposalId: string } }>(submitRes).proposal.proposalId;

    const reviewReq = mockRequest({
      method: 'POST',
      url: `/api/proposal-lifecycle/proposals/${proposalId}/review`,
    });
    const reviewRes = mockResponse();
    await handleProposalLifecycle(reviewReq, reviewRes, {
      dataDir,
      sendJson: sendJson as any,
      readRequestBody: async () => JSON.stringify({
        action: 'approve',
        reviewerId: 'human',
        autoStart: false,
      }),
    });
    expect(reviewRes._statusCode).toBe(200);
    const reviewBody = parseJsonBody<{ mission: { missionId: string; status: string } }>(reviewRes);
    expect(reviewBody.mission.status).toBe('pending');

    const startReq = mockRequest({
      method: 'POST',
      url: `/api/proposal-lifecycle/missions/${reviewBody.mission.missionId}/start`,
    });
    const startRes = mockResponse();
    await handleProposalLifecycle(startReq, startRes, {
      dataDir,
      sendJson: sendJson as any,
      readRequestBody: async () => '',
    });
    expect(startRes._statusCode).toBe(200);
    const startBody = parseJsonBody<{ mission: { missionId: string; status: string } }>(startRes);
    expect(startBody.mission.missionId).toBe(reviewBody.mission.missionId);
    expect(startBody.mission.status).toBe('running');
  });

  it('returns 426 for stream endpoint without websocket upgrade', async () => {
    const req = mockRequest({ method: 'GET', url: '/api/proposal-lifecycle/events/stream' });
    const res = mockResponse();
    const handled = await handleProposalLifecycle(req, res, {
      dataDir,
      sendJson: sendJson as any,
      readRequestBody: async () => '',
    });
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(426);
  });
});

describe('proposal lifecycle websocket upgrades', () => {
  it('rejects unauthorized upgrades', () => {
    const req = mockRequest({
      method: 'GET',
      url: '/api/proposal-lifecycle/events/stream',
      headers: {
        upgrade: 'websocket',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
      },
    }) as any;
    const socket = new MockSocket();
    const handled = handleProposalLifecycleUpgrade(req, socket as any, Buffer.alloc(0), {
      dataDir,
      sendJson: sendJson as any,
      readRequestBody: async () => '',
      isAuthenticated: () => false,
    });
    expect(handled).toBe(true);
    expect(String(socket.chunks[0] ?? '')).toContain('401');
    expect(socket.destroyed).toBe(true);
  });

  it('accepts authenticated upgrades and sends snapshot payload', () => {
    const req = mockRequest({
      method: 'GET',
      url: '/api/proposal-lifecycle/events/stream',
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'sec-websocket-version': '13',
      },
    }) as any;
    const socket = new MockSocket();
    const handled = handleProposalLifecycleUpgrade(req, socket as any, Buffer.alloc(0), {
      dataDir,
      sendJson: sendJson as any,
      readRequestBody: async () => '',
      isAuthenticated: () => true,
    });
    expect(handled).toBe(true);
    expect(String(socket.chunks[0] ?? '')).toContain('101 Switching Protocols');
    expect(String(socket.chunks[1] ?? '')).toContain('"snapshot"');
    socket.emit('close');
  });
});

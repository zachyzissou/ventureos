import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { mockRequest, mockResponse, parseJsonBody } from '../helpers.js';
import { handleTacticalMapControls } from '../../server/routes/tactical-map-controls.js';

const baseTmp = path.join('/tmp', `ventureos-tactical-controls-${Date.now()}`);

function sendJson(res: ReturnType<typeof mockResponse>, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function runRoute(
  req: ReturnType<typeof mockRequest> & { _rawBody?: string },
  dataDir: string,
  now = () => new Date('2026-02-16T15:30:00.000Z'),
) {
  const res = mockResponse();
  const handled = await handleTacticalMapControls(req, res, {
    dataDir,
    sendJson: sendJson as any,
    readRequestBody: async (incoming) => ((incoming as typeof req)._rawBody ?? ''),
    now,
  });
  return { handled, res };
}

afterEach(() => {
  fs.rmSync(baseTmp, { recursive: true, force: true });
});

describe('tactical-map-controls route', () => {
  it('spawns a mission and returns it from GET /missions', async () => {
    const dataDir = path.join(baseTmp, 'spawn');

    const spawnReq = mockRequest({ method: 'POST', url: '/api/tactical-map/missions/spawn' }) as any;
    spawnReq._rawBody = JSON.stringify({
      title: 'Investigate regression',
      description: 'Focus on tactical map interaction latency',
      assignee: 'synth',
      priority: 'high',
      tokenBudget: 32000,
    });

    const spawned = await runRoute(spawnReq, dataDir);
    expect(spawned.handled).toBe(true);

    const spawnBody = parseJsonBody<{ ok: boolean; missionId: string }>(spawned.res);
    expect(spawnBody.ok).toBe(true);
    expect(spawnBody.missionId).toMatch(/^mission-/);

    const listReq = mockRequest({ method: 'GET', url: '/api/tactical-map/missions' }) as any;
    const listed = await runRoute(listReq, dataDir);
    const listBody = parseJsonBody<{ ok: boolean; missions: Array<{ missionId: string; priority: string }> }>(listed.res);

    expect(listBody.ok).toBe(true);
    expect(listBody.missions.length).toBe(1);
    expect(listBody.missions[0].missionId).toBe(spawnBody.missionId);
    expect(listBody.missions[0].priority).toBe('high');
  });

  it('updates mission priority with persistence', async () => {
    const dataDir = path.join(baseTmp, 'priority');

    const spawnReq = mockRequest({ method: 'POST', url: '/api/tactical-map/missions/spawn' }) as any;
    spawnReq._rawBody = JSON.stringify({
      title: 'Tune command palette',
      description: '',
      assignee: 'oracle',
      priority: 'normal',
    });

    const spawned = await runRoute(spawnReq, dataDir);
    const missionId = parseJsonBody<{ missionId: string }>(spawned.res).missionId;

    const priorityReq = mockRequest({
      method: 'POST',
      url: `/api/tactical-map/missions/${encodeURIComponent(missionId)}/priority`,
    }) as any;
    priorityReq._rawBody = JSON.stringify({ priority: 'critical' });

    const updated = await runRoute(priorityReq, dataDir);
    const updateBody = parseJsonBody<{ ok: boolean; priority: string }>(updated.res);

    expect(updateBody.ok).toBe(true);
    expect(updateBody.priority).toBe('critical');

    const listReq = mockRequest({ method: 'GET', url: '/api/tactical-map/missions' }) as any;
    const listed = await runRoute(listReq, dataDir);
    const listBody = parseJsonBody<{ missions: Array<{ priority: string }> }>(listed.res);
    expect(listBody.missions[0].priority).toBe('critical');
  });

  it('persists pause/resume state and budget adjustments', async () => {
    const dataDir = path.join(baseTmp, 'agent-controls');

    const pauseReq = mockRequest({ method: 'POST', url: '/api/tactical-map/agents/synth/pause' }) as any;
    const paused = await runRoute(pauseReq, dataDir);
    expect(parseJsonBody<{ ok: boolean; paused: boolean }>(paused.res).paused).toBe(true);

    const budgetReq = mockRequest({ method: 'POST', url: '/api/tactical-map/agents/synth/budget' }) as any;
    budgetReq._rawBody = JSON.stringify({ newBudget: 54321, previousBudget: 100000 });
    const budgeted = await runRoute(budgetReq, dataDir);
    const budgetBody = parseJsonBody<{ ok: boolean; newBudget: number }>(budgeted.res);
    expect(budgetBody.ok).toBe(true);
    expect(budgetBody.newBudget).toBe(54321);

    const stateReq = mockRequest({ method: 'GET', url: '/api/tactical-map/control-state' }) as any;
    const state = await runRoute(stateReq, dataDir);
    const stateBody = parseJsonBody<{ pausedAgents: string[]; budgets: Record<string, number> }>(state.res);

    expect(stateBody.pausedAgents).toContain('synth');
    expect(stateBody.budgets.synth).toBe(54321);

    const resumeReq = mockRequest({ method: 'POST', url: '/api/tactical-map/agents/synth/resume' }) as any;
    await runRoute(resumeReq, dataDir);

    const stateAfterResume = await runRoute(stateReq, dataDir);
    const stateAfterBody = parseJsonBody<{ pausedAgents: string[] }>(stateAfterResume.res);
    expect(stateAfterBody.pausedAgents).not.toContain('synth');
  });

  it('rejects invalid control payloads', async () => {
    const dataDir = path.join(baseTmp, 'validation');

    const badAgentReq = mockRequest({ method: 'POST', url: '/api/tactical-map/agents/not-real/pause' }) as any;
    const badAgentRes = await runRoute(badAgentReq, dataDir);
    expect(badAgentRes.res._statusCode).toBe(400);

    const badBudgetReq = mockRequest({ method: 'POST', url: '/api/tactical-map/agents/synth/budget' }) as any;
    badBudgetReq._rawBody = JSON.stringify({ newBudget: -10 });
    const badBudgetRes = await runRoute(badBudgetReq, dataDir);
    expect(badBudgetRes.res._statusCode).toBe(400);

    const badMissionReq = mockRequest({ method: 'POST', url: '/api/tactical-map/missions/spawn' }) as any;
    badMissionReq._rawBody = JSON.stringify({ title: '', assignee: 'synth', priority: 'normal' });
    const badMissionRes = await runRoute(badMissionReq, dataDir);
    expect(badMissionRes.res._statusCode).toBe(400);
  });
});

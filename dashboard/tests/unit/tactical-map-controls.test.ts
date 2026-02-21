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

  it('materializes a mission template note when Obsidian connector is configured', async () => {
    const dataDir = path.join(baseTmp, 'spawn-obsidian');
    const vaultDir = path.join(baseTmp, 'obsidian-vault');
    const obsidianConfigPath = path.join(baseTmp, 'obsidian.json');
    fs.mkdirSync(vaultDir, { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(obsidianConfigPath, JSON.stringify({
      vaults: {
        main: { path: vaultDir, ts: Date.now(), open: true },
      },
    }));
    fs.writeFileSync(path.join(dataDir, 'obsidian-connector.json'), JSON.stringify({
      version: 1,
      vaultId: 'main',
      vaultPath: null,
      missionFolder: 'VentureOS/Missions',
      updatedAt: Date.now(),
    }));

    const previousObsidianConfig = process.env.OBSIDIAN_CONFIG_PATH;
    process.env.OBSIDIAN_CONFIG_PATH = obsidianConfigPath;
    try {
      const spawnReq = mockRequest({ method: 'POST', url: '/api/tactical-map/missions/spawn' }) as any;
      spawnReq._rawBody = JSON.stringify({
        title: 'Launch Review',
        description: 'Coordinate release readiness checks',
        assignee: 'oracle',
        priority: 'high',
      });

      const spawned = await runRoute(spawnReq, dataDir);
      const spawnBody = parseJsonBody<{
        missionId: string;
        obsidianNote: { attempted: boolean; created: boolean; path: string | null };
      }>(spawned.res);
      expect(spawnBody.obsidianNote.attempted).toBe(true);
      expect(spawnBody.obsidianNote.created).toBe(true);
      expect(spawnBody.obsidianNote.path).toContain('VentureOS/Missions/');

      const notePath = path.join(vaultDir, spawnBody.obsidianNote.path as string);
      expect(fs.existsSync(notePath)).toBe(true);
      const note = fs.readFileSync(notePath, 'utf8');
      expect(note).toContain(`missionId: ${spawnBody.missionId}`);
      expect(note).toContain('owner: oracle');
      expect(note).toContain('# Mission: Launch Review');
      expect(note).toContain('## Decisions');
      expect(note).toContain('## Risks');
      expect(note).toContain('## Next Actions');
    } finally {
      if (previousObsidianConfig == null) delete process.env.OBSIDIAN_CONFIG_PATH;
      else process.env.OBSIDIAN_CONFIG_PATH = previousObsidianConfig;
    }
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

  it('edits a mission via PATCH with partial fields', async () => {
    const dataDir = path.join(baseTmp, 'patch-edit');

    // Spawn a mission first
    const spawnReq = mockRequest({ method: 'POST', url: '/api/tactical-map/missions/spawn' }) as any;
    spawnReq._rawBody = JSON.stringify({
      title: 'Original title',
      description: 'Original description',
      assignee: 'synth',
      priority: 'normal',
    });
    const spawned = await runRoute(spawnReq, dataDir);
    const missionId = parseJsonBody<{ missionId: string }>(spawned.res).missionId;

    // PATCH only priority and title
    const patchReq = mockRequest({
      method: 'PATCH',
      url: `/api/tactical-map/missions/${encodeURIComponent(missionId)}`,
    }) as any;
    patchReq._rawBody = JSON.stringify({ title: 'Updated title', priority: 'critical' });

    const patched = await runRoute(patchReq, dataDir);
    const patchBody = parseJsonBody<{
      ok: boolean;
      missionId: string;
      mission: { title: string; description: string; priority: string; assignee: string };
    }>(patched.res);

    expect(patchBody.ok).toBe(true);
    expect(patchBody.mission.title).toBe('Updated title');
    expect(patchBody.mission.priority).toBe('critical');
    // Unchanged fields should persist
    expect(patchBody.mission.description).toBe('Original description');
    expect(patchBody.mission.assignee).toBe('synth');

    // Verify persistence via GET
    const listReq = mockRequest({ method: 'GET', url: '/api/tactical-map/missions' }) as any;
    const listed = await runRoute(listReq, dataDir);
    const listBody = parseJsonBody<{ missions: Array<{ title: string; priority: string }> }>(listed.res);
    expect(listBody.missions[0].title).toBe('Updated title');
    expect(listBody.missions[0].priority).toBe('critical');
  });

  it('edits mission assignee and description', async () => {
    const dataDir = path.join(baseTmp, 'patch-assignee');

    const spawnReq = mockRequest({ method: 'POST', url: '/api/tactical-map/missions/spawn' }) as any;
    spawnReq._rawBody = JSON.stringify({
      title: 'Test',
      description: 'Old desc',
      assignee: 'oracle',
      priority: 'low',
    });
    const spawned = await runRoute(spawnReq, dataDir);
    const missionId = parseJsonBody<{ missionId: string }>(spawned.res).missionId;

    const patchReq = mockRequest({
      method: 'PATCH',
      url: `/api/tactical-map/missions/${encodeURIComponent(missionId)}`,
    }) as any;
    patchReq._rawBody = JSON.stringify({ assignee: 'atlas', description: 'New desc' });

    const patched = await runRoute(patchReq, dataDir);
    const body = parseJsonBody<{ ok: boolean; mission: { assignee: string; description: string } }>(patched.res);
    expect(body.ok).toBe(true);
    expect(body.mission.assignee).toBe('atlas');
    expect(body.mission.description).toBe('New desc');
  });

  it('rejects PATCH with invalid fields', async () => {
    const dataDir = path.join(baseTmp, 'patch-invalid');

    const spawnReq = mockRequest({ method: 'POST', url: '/api/tactical-map/missions/spawn' }) as any;
    spawnReq._rawBody = JSON.stringify({ title: 'Test', description: '', assignee: 'synth', priority: 'normal' });
    const spawned = await runRoute(spawnReq, dataDir);
    const missionId = parseJsonBody<{ missionId: string }>(spawned.res).missionId;

    // Empty title
    const emptyTitle = mockRequest({
      method: 'PATCH',
      url: `/api/tactical-map/missions/${encodeURIComponent(missionId)}`,
    }) as any;
    emptyTitle._rawBody = JSON.stringify({ title: '' });
    const r1 = await runRoute(emptyTitle, dataDir);
    expect(r1.res._statusCode).toBe(400);

    // Invalid priority
    const badPriority = mockRequest({
      method: 'PATCH',
      url: `/api/tactical-map/missions/${encodeURIComponent(missionId)}`,
    }) as any;
    badPriority._rawBody = JSON.stringify({ priority: 'extreme' });
    const r2 = await runRoute(badPriority, dataDir);
    expect(r2.res._statusCode).toBe(400);

    // Invalid assignee (nexus)
    const nexusAssignee = mockRequest({
      method: 'PATCH',
      url: `/api/tactical-map/missions/${encodeURIComponent(missionId)}`,
    }) as any;
    nexusAssignee._rawBody = JSON.stringify({ assignee: 'nexus' });
    const r3 = await runRoute(nexusAssignee, dataDir);
    expect(r3.res._statusCode).toBe(400);

    // No valid fields
    const noFields = mockRequest({
      method: 'PATCH',
      url: `/api/tactical-map/missions/${encodeURIComponent(missionId)}`,
    }) as any;
    noFields._rawBody = JSON.stringify({ unrelated: 'data' });
    const r4 = await runRoute(noFields, dataDir);
    expect(r4.res._statusCode).toBe(400);
  });

  it('returns 404 for PATCH on non-existent mission', async () => {
    const dataDir = path.join(baseTmp, 'patch-404');

    const patchReq = mockRequest({
      method: 'PATCH',
      url: '/api/tactical-map/missions/non-existent-id',
    }) as any;
    patchReq._rawBody = JSON.stringify({ priority: 'high' });

    const result = await runRoute(patchReq, dataDir);
    expect(result.res._statusCode).toBe(404);
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

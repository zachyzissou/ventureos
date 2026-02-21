import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';

const TEST_PORT = 18950 + Math.floor(Math.random() * 300);
const HOST = '127.0.0.1';
const TOKEN = 'smoke-token';
const BASE_URL = `http://${HOST}:${TEST_PORT}`;

let tmpRoot: string;
let server: Server | undefined;
let authCookie = '';
let workflowDir = '';
let obsidianVaultDir = '';

async function waitForServer(url: string, attempts: number = 30): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status < 500) return;
    } catch {
      // ignore
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Dashboard server did not start');
}

function authHeaders(): Record<string, string> {
  if (authCookie) return { cookie: authCookie };
  return { Authorization: `Bearer ${TOKEN}` };
}

beforeAll(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ventureos-dashboard-http-'));

  const workspaceDir = path.join(tmpRoot, 'workspace');
  const sharedDir = path.join(tmpRoot, 'shared');
  const kpiDir = path.join(tmpRoot, 'kpis');
  const obsDir = path.join(tmpRoot, 'observations');
  const openclawDir = path.join(tmpRoot, '.openclaw');
  const sessionsDir = path.join(openclawDir, 'agents', 'main', 'sessions');

  // Keep under /tmp (not tmpRoot) because listWorkflowLogFiles() scans /tmp for agent-* dirs.
  // Use a unique suffix to avoid parallel-run conflicts.
  workflowDir = path.join('/tmp', `agent-smoke-workflows-${process.pid}`);
  fs.mkdirSync(workflowDir, { recursive: true });

  const rpgRootDir = path.join(tmpRoot, 'rpg-root');
  obsidianVaultDir = path.join(tmpRoot, 'obsidian-vault');

  fs.mkdirSync(kpiDir, { recursive: true });
  fs.mkdirSync(obsDir, { recursive: true });
  fs.mkdirSync(sharedDir, { recursive: true });
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.mkdirSync(rpgRootDir, { recursive: true });
  fs.mkdirSync(obsidianVaultDir, { recursive: true });

  // RPG test fixtures (Issue #145)
  fs.writeFileSync(path.join(rpgRootDir, 'README.md'), '# RPG Test Fixture');
  fs.mkdirSync(path.join(rpgRootDir, 'api'), { recursive: true });
  fs.writeFileSync(path.join(rpgRootDir, 'api', 'secret.ts'), 'export const SECRET = "leaked";');

  const kpiBase = {
    overall: {
      success_rate: 0.95,
      latency_ms: { p50: 120, p95: 300, p99: 500 },
      backup: { age_hours: 2 },
    },
    slo: { success_rate: 0.9, p95_latency_s: 1.0, backup_age_h: 24 },
  };
  fs.writeFileSync(
    path.join(kpiDir, '2025-02-10.json'),
    JSON.stringify({ ...kpiBase, date: '2025-02-10' }),
  );
  fs.writeFileSync(
    path.join(kpiDir, '2025-02-11.json'),
    JSON.stringify({ ...kpiBase, date: '2025-02-11', overall: { ...kpiBase.overall, success_rate: 0.97 } }),
  );

  const obsContent = `# Observations — 2025-02-11\n\n## [10:00] Deployment check\n**Context**: CI\n**Action**: Ran smoke tests\n**Outcome**: Success\n**Tags**: #ci #smoke\n`;
  const obsPath = path.join(obsDir, '2025-02-11.md');
  fs.writeFileSync(obsPath, obsContent);
  const now = new Date();
  fs.utimesSync(obsPath, now, now);

  fs.writeFileSync(path.join(sharedDir, 'active-work.md'), '- [x] smoke test mission\n');
  fs.writeFileSync(path.join(sharedDir, 'priorities.md'), '- reliability\n');

  const sessionEntry = {
    label: 'Test Session',
    model: 'claude-3-opus',
    updatedAt: Date.now(),
    abortedLastRun: false,
    sessionId: 'session-123',
  };
  fs.writeFileSync(
    path.join(sessionsDir, 'sessions.json'),
    JSON.stringify({ 'session-123': sessionEntry }, null, 2),
  );

  const timestamp = new Date().toISOString();
  const sessionLog = [
    { type: 'message', timestamp, message: { role: 'user', content: 'hi there' } },
    {
      type: 'message',
      timestamp,
      message: {
        role: 'assistant',
        content: 'ok',
        model: 'claude-3-opus',
        usage: { input: 120, output: 240, cost: { total: 0.0025 } },
      },
    },
    {
      type: 'message',
      timestamp,
      message: {
        role: 'assistant',
        content: 'done',
        model: 'claude-3-opus',
        usage: { input: 60, output: 120, cost: { total: 0.001 } },
      },
    },
  ];
  fs.writeFileSync(
    path.join(sessionsDir, 'session-123.jsonl'),
    sessionLog.map((l) => JSON.stringify(l)).join('\n'),
  );

  const wfLog = [
    { event: 'workflow_start', runId: 'wf-1', ts: new Date().toISOString() },
    { event: 'verify_status', runId: 'wf-1', ts: new Date().toISOString(), cycle: 2 },
    { event: 'verify_retry', runId: 'wf-1', ts: new Date().toISOString() },
    { event: 'workflow_success', runId: 'wf-1', ts: new Date().toISOString() },
  ];
  fs.writeFileSync(
    path.join(workflowDir, 'workflow-log.jsonl'),
    wfLog.map((l) => JSON.stringify(l)).join('\n'),
  );

  process.env.DASHBOARD_PORT = String(TEST_PORT);
  process.env.DASHBOARD_HOST = HOST;
  process.env.DASHBOARD_API_TOKEN = TOKEN;
  process.env.KPI_DIR = kpiDir;
  process.env.OBSERVATIONS_DIR = obsDir;
  process.env.OPENCLAW_DIR = openclawDir;
  process.env.WORKSPACE_DIR = workspaceDir;
  process.env.VENTUREOS_ROOT = tmpRoot;
  process.env.VENTUREOS_SHARED_CONTEXT_DIR = sharedDir;
  process.env.VENTUREOS_ACTIVE_WORK_PATH = path.join(sharedDir, 'active-work.md');
  process.env.VENTUREOS_PRIORITIES_PATH = path.join(sharedDir, 'priorities.md');
  process.env.RPG_DB_PATH = path.join(tmpRoot, 'rpg.sqlite');
  process.env.VENTUREOS_RPG_ROOT = rpgRootDir;
  process.env.VENTUREOS_AGENTS = 'main,oracle';
  process.env.VENTUREOS_OFFICE_VIEW_ENABLED = '1';
  process.env.OBSIDIAN_CONFIG_PATH = path.join(tmpRoot, 'obsidian.json');

  fs.writeFileSync(process.env.OBSIDIAN_CONFIG_PATH, JSON.stringify({
    vaults: {
      main: { path: obsidianVaultDir, ts: Date.now(), open: true },
    },
  }));

  const mod = (await import('../../server/server.js')) as { server?: Server; default?: { server?: Server } };
  server = mod.server ?? mod.default?.server;

  await waitForServer(`${BASE_URL}/login`);
});

afterAll(async () => {
  if (server && typeof server.close === 'function') {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  if (workflowDir && fs.existsSync(workflowDir)) {
    fs.rmSync(workflowDir, { recursive: true, force: true });
  }
});

describe('Dashboard HTTP smoke tests', () => {
  it('rejects unauthenticated API calls', async () => {
    const res = await fetch(`${BASE_URL}/api/kpis/latest`, { redirect: 'manual' });
    expect(res.status).toBe(401);
  });

  // ── Issue #145: RPG static file auth gate ──────────────────────────
  it('redirects unauthenticated /rpg/ requests to /login (Issue #145)', async () => {
    const res = await fetch(`${BASE_URL}/rpg/README.md`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login');
  });

  it('blocks unauthenticated access to nested RPG source files (Issue #145)', async () => {
    const res = await fetch(`${BASE_URL}/rpg/api/secret.ts`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login');
  });

  it('serves /rpg/ files to authenticated users (Issue #145)', async () => {
    // This test logs in and derives its own auth cookie; it does not depend on other tests or execution order.
    const loginRes = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN }),
      redirect: 'manual',
    });
    const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? '';

    const res = await fetch(`${BASE_URL}/rpg/README.md`, {
      headers: { cookie },
      redirect: 'manual',
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('RPG Test Fixture');
  });

  it('returns 404 for non-existent /rpg/ files when authenticated (Issue #145)', async () => {
    const loginRes = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN }),
      redirect: 'manual',
    });
    const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? '';

    const res = await fetch(`${BASE_URL}/rpg/nonexistent.txt`, {
      headers: { cookie },
      redirect: 'manual',
    });
    expect(res.status).toBe(404);
  });

  it('authenticates via /api/login and serves dashboard HTML', async () => {
    const loginRes = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN }),
      redirect: 'manual',
    });
    expect(loginRes.status).toBe(200);
    authCookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect(authCookie).toContain('openclaw_dashboard_token');

    const dashRes = await fetch(`${BASE_URL}/`, { headers: { cookie: authCookie }, redirect: 'manual' });
    expect(dashRes.status).toBe(200);
    const html = await dashRes.text();
    expect(html.toLowerCase()).toContain('<html');
  });

  it('returns KPI history, venture KPIs, and latest entry from fixtures', async () => {
    const historyRes = await fetch(`${BASE_URL}/api/kpis/history?days=30`, { headers: authHeaders() });
    expect(historyRes.status).toBe(200);
    const history = await historyRes.json();
    expect(history.count).toBe(2);
    const lastDate = history.items?.[history.items.length - 1]?.date;
    expect(lastDate).toBe('2025-02-11');

    const latestRes = await fetch(`${BASE_URL}/api/kpis/latest`, { headers: authHeaders() });
    expect(latestRes.status).toBe(200);
    const latest = await latestRes.json();
    expect(latest.latest?.overall?.success_rate).toBeCloseTo(0.97, 2);

    const ventureRes = await fetch(`${BASE_URL}/api/ventureos-kpis?days=7`, { headers: authHeaders() });
    expect(ventureRes.status).toBe(200);
    const venture = await ventureRes.json();
    expect(venture.latest?.p95s).toBeGreaterThan(0);
    expect(venture.history?.length).toBeGreaterThan(0);
  });

  it('serves observation recency, search, and observation index', async () => {
    const recentRes = await fetch(`${BASE_URL}/api/observations/recent?hours=48`, { headers: authHeaders() });
    expect(recentRes.status).toBe(200);
    const recent = await recentRes.json();
    expect(recent.count).toBeGreaterThan(0);
    expect(recent.items[0].snippet).toContain('smoke tests');

    const searchRes = await fetch(`${BASE_URL}/api/observations/search?q=smoke`, { headers: authHeaders() });
    expect(searchRes.status).toBe(200);
    const search = await searchRes.json();
    expect(search.count).toBeGreaterThan(0);
    expect((search.items[0].match as string).toLowerCase()).toContain('smoke');

    const indexRes = await fetch(`${BASE_URL}/api/observations-index`, { headers: authHeaders() });
    expect(indexRes.status).toBe(200);
    const index = await indexRes.json();
    expect(index.total).toBeGreaterThan(0);

    const ventureObs = await fetch(`${BASE_URL}/api/ventureos-observations`, { headers: authHeaders() });
    expect(ventureObs.status).toBe(200);
    const vObs = await ventureObs.json();
    expect(vObs.entries?.length).toBeGreaterThan(0);

    const singleObs = await fetch(
      `${BASE_URL}/api/ventureos-observation?path=2025-02-11.md`,
      { headers: authHeaders() },
    );
    expect(singleObs.status).toBe(200);
    const obs = await singleObs.json();
    expect(obs.ok).toBe(true);
    expect((obs.content as string).toLowerCase()).toContain('smoke tests');
  });

  it('reports sessions, usage, costs, and session messages', async () => {
    const sessionsRes = await fetch(`${BASE_URL}/api/sessions`, { headers: authHeaders() });
    expect(sessionsRes.status).toBe(200);
    const sessions = await sessionsRes.json();
    expect(sessions.length).toBeGreaterThan(0);

    const usageRes = await fetch(`${BASE_URL}/api/usage`, { headers: authHeaders() });
    expect(usageRes.status).toBe(200);
    const usage = await usageRes.json();
    expect(usage.fiveHour).toBeTruthy();

    const costsRes = await fetch(`${BASE_URL}/api/costs`, { headers: authHeaders() });
    expect(costsRes.status).toBe(200);
    const costs = await costsRes.json();
    expect(costs.total).toBeGreaterThanOrEqual(0);

    const msgsRes = await fetch(`${BASE_URL}/api/session-messages?id=session-123`, { headers: authHeaders() });
    expect(msgsRes.status).toBe(200);
    const msgs = await msgsRes.json();
    expect(Array.isArray(msgs)).toBe(true);
    expect((msgs as any[]).length).toBeGreaterThan(0);
  });

  it('returns agent health, venture agent rollups, mission control, and workflow patterns', async () => {
    const healthRes = await fetch(`${BASE_URL}/api/agent-health`, { headers: authHeaders() });
    expect(healthRes.status).toBe(200);
    const health = await healthRes.json();
    expect(health.agents?.[0]?.sessionCount).toBeGreaterThanOrEqual(0);

    const ventureAgentsRes = await fetch(`${BASE_URL}/api/ventureos-agents`, { headers: authHeaders() });
    expect(ventureAgentsRes.status).toBe(200);
    const vAgents = await ventureAgentsRes.json();
    expect(vAgents.agentIds?.length).toBeGreaterThan(0);

    const missionRes = await fetch(`${BASE_URL}/api/mission-control`, { headers: authHeaders() });
    expect(missionRes.status).toBe(200);
    const mission = await missionRes.json();
    expect(mission.activeWorkMd).toContain('smoke');
    expect(mission.team?.agents?.length).toBeGreaterThan(0);

    const flagsRes = await fetch(`${BASE_URL}/api/ventureos-feature-flags`, { headers: authHeaders() });
    expect(flagsRes.status).toBe(200);
    const flags = await flagsRes.json();
    expect(flags.officeViewEnabled).toBe(true);

    const wfRes = await fetch(`${BASE_URL}/api/workflow-patterns`, { headers: authHeaders() });
    expect(wfRes.status).toBe(200);
    const wf = await wfRes.json();
    expect(wf.totals?.totalWorkflowRuns).toBeGreaterThanOrEqual(1);

    const cfgRes = await fetch(`${BASE_URL}/api/obsidian/config`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultId: 'main', missionFolder: 'VentureOS/Missions' }),
    });
    expect(cfgRes.status).toBe(200);

    const writeRes = await fetch(`${BASE_URL}/api/obsidian/notes/write`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        missionId: 'mc-obs-smoke',
        title: 'Obsidian Smoke Mission',
        markdown: 'Connector smoke write',
      }),
    });
    expect(writeRes.status).toBe(200);

    const notesRes = await fetch(`${BASE_URL}/api/obsidian/notes?q=smoke`, { headers: authHeaders() });
    expect(notesRes.status).toBe(200);
    const notes = await notesRes.json();
    expect(notes.total).toBeGreaterThanOrEqual(1);

    const digestRes = await fetch(`${BASE_URL}/api/obsidian/daily-digest`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-02-21',
        openPrStatus: ['PR #330: mission templates'],
        reviewBlockers: ['PR #323 is awaiting review approval'],
        ciFailures: ['PR #323 — build-and-test [failure]'],
        milestoneProgress: ['Dashboard Merge: 10/10 closed (100%)'],
      }),
    });
    expect(digestRes.status).toBe(200);
    const digest = await digestRes.json();
    expect(digest.path).toBe('VentureOS/Missions/Daily Ops/2026-02-21.md');
  });

  it('reports system metrics and redirects unauthenticated dashboard access', async () => {
    const systemRes = await fetch(`${BASE_URL}/api/system`, { headers: authHeaders() });
    expect(systemRes.status).toBe(200);
    const system = await systemRes.json();
    expect(system).toHaveProperty('cpu');
    expect(system).toHaveProperty('memory');

    const res = await fetch(`${BASE_URL}/`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login');
  });

  it('streams live telemetry via SSE with correct shape', async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(`${BASE_URL}/api/live-telemetry`, {
        headers: authHeaders(),
        signal: controller.signal,
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      // Read the initial snapshot
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let snapshot: Record<string, unknown> | null = null;

      while (!snapshot) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        for (const line of buffer.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.type === 'telemetry') {
                snapshot = parsed;
                break;
              }
            } catch {
              // partial line
            }
          }
        }
      }

      controller.abort();
      expect(snapshot).not.toBeNull();
      expect(snapshot!.type).toBe('telemetry');
      expect(typeof (snapshot as any).ts).toBe('number');
      expect(typeof (snapshot as any).system?.cpuUsage).toBe('number');
      expect(typeof (snapshot as any).sessions?.total).toBe('number');
      expect(typeof (snapshot as any).costs?.today).toBe('number');
      expect(typeof (snapshot as any).usage?.opusPct).toBe('number');
      expect('successRate' in ((snapshot as any).kpi ?? {})).toBe(true);
    } finally {
      clearTimeout(timeout);
      controller.abort();
    }
  });
});

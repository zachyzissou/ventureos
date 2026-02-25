/**
 * Unit tests for /api/live-telemetry SSE endpoint.
 * Validates that the telemetry snapshot shape is correct and the stream behaves properly.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';

const TEST_PORT = 18700 + Math.floor(Math.random() * 200);
const HOST = '127.0.0.1';
const TOKEN = 'telemetry-test-token';
const BASE_URL = `http://${HOST}:${TEST_PORT}`;

let tmpRoot: string;
let server: Server | undefined;

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
  return { Authorization: `Bearer ${TOKEN}` };
}

beforeAll(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ventureos-telemetry-'));

  const workspaceDir = path.join(tmpRoot, 'workspace');
  const sharedDir = path.join(tmpRoot, 'shared');
  const kpiDir = path.join(tmpRoot, 'kpis');
  const obsDir = path.join(tmpRoot, 'observations');
  const openclawDir = path.join(tmpRoot, '.openclaw');
  const sessionsDir = path.join(openclawDir, 'agents', 'main', 'sessions');

  fs.mkdirSync(kpiDir, { recursive: true });
  fs.mkdirSync(obsDir, { recursive: true });
  fs.mkdirSync(sharedDir, { recursive: true });
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.mkdirSync(workspaceDir, { recursive: true });

  // Write a KPI file
  const kpiBase = {
    date: '2025-02-14',
    overall: {
      success_rate: 0.96,
      latency_ms: { p50: 100, p95: 250, p99: 400 },
    },
    slo: { success_rate: 0.9, p95_latency_s: 1.0 },
  };
  fs.writeFileSync(path.join(kpiDir, '2025-02-14.json'), JSON.stringify(kpiBase));

  // Write a session
  const sessionEntry = {
    label: 'Telemetry Test',
    model: 'claude-3-opus',
    updatedAt: Date.now(),
    abortedLastRun: false,
    sessionId: 'telem-sess-1',
  };
  fs.writeFileSync(
    path.join(sessionsDir, 'sessions.json'),
    JSON.stringify({ 'telem-sess-1': sessionEntry }, null, 2),
  );

  const timestamp = new Date().toISOString();
  fs.writeFileSync(
    path.join(sessionsDir, 'telem-sess-1.jsonl'),
    JSON.stringify({
      type: 'message',
      timestamp,
      message: {
        role: 'assistant',
        content: 'test',
        model: 'claude-3-opus',
        usage: { input: 50, output: 100, cost: { total: 0.001 } },
      },
    }),
  );

  fs.writeFileSync(path.join(sharedDir, 'active-work.md'), '- test\n');
  fs.writeFileSync(path.join(sharedDir, 'priorities.md'), '- test\n');

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
  process.env.VENTUREOS_AGENTS = 'main';

  const mod = (await import('../../../server/server.js')) as {
    server?: Server;
    default?: { server?: Server };
  };
  server = mod.server ?? mod.default?.server;

  await waitForServer(`${BASE_URL}/login`);
});

afterAll(async () => {
  if (server && typeof server.close === 'function') {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('/api/live-telemetry SSE endpoint', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await fetch(`${BASE_URL}/api/live-telemetry`, { redirect: 'manual' });
    expect(res.status).toBe(401);
  });

  it('streams telemetry snapshots with correct shape', async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(`${BASE_URL}/api/live-telemetry`, {
        headers: authHeaders(),
        signal: controller.signal,
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      expect(res.headers.get('cache-control')).toContain('no-cache');

      // Read the first snapshot from the SSE stream
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let snapshot: Record<string, unknown> | null = null;

      while (!snapshot) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE data lines
        const lines = buffer.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr) {
              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.type === 'telemetry') {
                  snapshot = parsed;
                  break;
                }
              } catch {
                // ignore partial lines
              }
            }
          }
        }
      }

      controller.abort();
      expect(snapshot).not.toBeNull();

      // Validate shape
      expect(snapshot!.type).toBe('telemetry');
      expect(typeof snapshot!.ts).toBe('number');

      const system = snapshot!.system as Record<string, unknown>;
      expect(typeof system.cpuUsage).toBe('number');
      // CPU usage should be delta-based (0-100), not the inflated loadAvg heuristic
      expect(system.cpuUsage as number).toBeGreaterThanOrEqual(0);
      expect(system.cpuUsage as number).toBeLessThanOrEqual(100);
      expect(typeof system.memoryPercent).toBe('number');
      expect(typeof system.memoryUsedGB).toBe('string');
      expect(typeof system.memoryTotalGB).toBe('string');
      expect(typeof system.diskPercent).toBe('number');
      expect(typeof system.loadAvg1m).toBe('string');
      expect(typeof system.uptime).toBe('number');

      const agents = snapshot!.agents as Record<string, unknown>;
      expect(typeof agents.total).toBe('number');
      expect(typeof agents.active).toBe('number');
      expect(Array.isArray(agents.busyIds)).toBe(true);

      const sessions = snapshot!.sessions as Record<string, unknown>;
      expect(typeof sessions.total).toBe('number');
      expect(typeof sessions.running).toBe('number');

      const costs = snapshot!.costs as Record<string, unknown>;
      expect(typeof costs.today).toBe('number');
      expect(typeof costs.week).toBe('number');

      const usage = snapshot!.usage as Record<string, unknown>;
      expect(typeof usage.opusPct).toBe('number');
      expect(typeof usage.sonnetPct).toBe('number');
      expect(typeof usage.totalCost5h).toBe('number');

      const kpi = snapshot!.kpi as Record<string, unknown>;
      expect('successRate' in kpi).toBe(true);
      expect('p95LatencyS' in kpi).toBe(true);
      expect('sloStatus' in kpi).toBe(true);
      expect('date' in kpi).toBe(true);
    } finally {
      clearTimeout(timeout);
      controller.abort();
    }
  });

  it('sends multiple snapshots over time', async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch(`${BASE_URL}/api/live-telemetry`, {
        headers: authHeaders(),
        signal: controller.signal,
      });

      expect(res.status).toBe(200);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const snapshots: Record<string, unknown>[] = [];

      const startTime = Date.now();
      while (snapshots.length < 2 && Date.now() - startTime < 11000) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse complete SSE lines
        while (buffer.includes('\n\n')) {
          const idx = buffer.indexOf('\n\n');
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          for (const line of chunk.split('\n')) {
            if (line.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(line.slice(6));
                if (parsed.type === 'telemetry') {
                  snapshots.push(parsed);
                }
              } catch {
                // ignore
              }
            }
          }
        }
      }

      controller.abort();

      // Should have at least the initial snapshot + one interval push
      expect(snapshots.length).toBeGreaterThanOrEqual(2);

      // Second snapshot should have a later timestamp
      if (snapshots.length >= 2) {
        expect((snapshots[1] as { ts: number }).ts).toBeGreaterThanOrEqual(
          (snapshots[0] as { ts: number }).ts,
        );
      }
    } finally {
      clearTimeout(timeout);
      controller.abort();
    }
  });
});

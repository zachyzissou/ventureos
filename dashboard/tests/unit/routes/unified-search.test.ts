import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ServerResponse } from 'node:http';

import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import { handleUnifiedSearch } from '../../../server/routes/unified-search.js';

let tmpDir: string;
let dataDir: string;
let observationsDir: string;
let vaultDir: string;
let previousObsidianConfigPath: string | undefined;

function createDeps() {
  return {
    dataDir,
    observationsDir,
    sendJson: (res: ServerResponse, data: unknown, status = 200) => {
      (res as any).writeHead(status, { 'Content-Type': 'application/json' });
      (res as any).end(JSON.stringify(data));
    },
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(tmpdir(), 'unified-search-test-'));
  dataDir = path.join(tmpDir, 'data');
  observationsDir = path.join(tmpDir, 'observations');
  vaultDir = path.join(tmpDir, 'vault');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(observationsDir, { recursive: true });
  fs.mkdirSync(vaultDir, { recursive: true });

  fs.writeFileSync(
    path.join(observationsDir, '2026-02-21.md'),
    '# Observation\n\nLaunch memory timeline check.\n',
  );

  const replaySessionsDir = path.join(dataDir, 'replay', 'sessions');
  fs.mkdirSync(replaySessionsDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'replay', 'sessions.json'), JSON.stringify({
    sessions: [
      {
        id: 'replay-launch',
        name: 'Launch Session',
        description: 'Replay launch instrumentation',
        startedAt: Date.now(),
      },
    ],
  }));
  fs.writeFileSync(path.join(replaySessionsDir, 'replay-launch.json'), JSON.stringify({
    events: [{ message: 'launch sequence event' }],
  }));

  fs.writeFileSync(path.join(dataDir, 'obsidian-connector.json'), JSON.stringify({
    version: 1,
    vaultId: null,
    vaultPath: vaultDir,
    missionFolder: 'VentureOS/Missions',
    updatedAt: Date.now(),
  }));
  fs.mkdirSync(path.join(vaultDir, 'VentureOS', 'Missions'), { recursive: true });
  fs.writeFileSync(path.join(vaultDir, 'VentureOS', 'Missions', 'launch-plan.md'), '# Launch Plan\n\nShip launch checklist.');

  const obsidianConfigPath = path.join(tmpDir, 'obsidian.json');
  fs.writeFileSync(obsidianConfigPath, JSON.stringify({ vaults: {} }));
  previousObsidianConfigPath = process.env.OBSIDIAN_CONFIG_PATH;
  process.env.OBSIDIAN_CONFIG_PATH = obsidianConfigPath;
});

afterEach(() => {
  if (previousObsidianConfigPath == null) delete process.env.OBSIDIAN_CONFIG_PATH;
  else process.env.OBSIDIAN_CONFIG_PATH = previousObsidianConfigPath;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('handleUnifiedSearch', () => {
  it('returns mixed-source results with source tags and target metadata', async () => {
    const res = mockResponse();
    const handled = await handleUnifiedSearch(
      mockRequest({ method: 'GET', url: '/api/search/unified?q=launch&limit=20' }),
      res,
      createDeps(),
    );
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);

    const body = parseJsonBody<{
      total: number;
      counts: { memory: number; replay: number; obsidian: number };
      results: Array<{ source: string; target: { type: string; path?: string; sessionId?: string } }>;
    }>(res);
    expect(body.total).toBeGreaterThanOrEqual(3);
    expect(body.counts.memory).toBeGreaterThanOrEqual(1);
    expect(body.counts.replay).toBeGreaterThanOrEqual(1);
    expect(body.counts.obsidian).toBeGreaterThanOrEqual(1);
    expect(body.results.some((r) => r.source === 'memory' && r.target.type === 'path')).toBe(true);
    expect(body.results.some((r) => r.source === 'replay' && r.target.sessionId === 'replay-launch')).toBe(true);
    expect(body.results.some((r) => r.source === 'obsidian' && r.target.path?.endsWith('launch-plan.md'))).toBe(true);
  });

  it('supports source filtering', async () => {
    const res = mockResponse();
    await handleUnifiedSearch(
      mockRequest({ method: 'GET', url: '/api/search/unified?q=launch&sources=obsidian' }),
      res,
      createDeps(),
    );
    expect(res._statusCode).toBe(200);
    const body = parseJsonBody<{ counts: { memory: number; replay: number; obsidian: number } }>(res);
    expect(body.counts.obsidian).toBeGreaterThanOrEqual(1);
    expect(body.counts.memory).toBe(0);
    expect(body.counts.replay).toBe(0);
  });

  it('returns 400 when q is missing', async () => {
    const res = mockResponse();
    await handleUnifiedSearch(
      mockRequest({ method: 'GET', url: '/api/search/unified' }),
      res,
      createDeps(),
    );
    expect(res._statusCode).toBe(400);
    expect(parseJsonBody<{ error: string }>(res).error).toContain('q');
  });
});

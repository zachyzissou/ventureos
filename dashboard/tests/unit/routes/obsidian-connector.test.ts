import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import { handleObsidianConnector } from '../../../server/routes/obsidian-connector.js';
import type { ServerResponse } from 'node:http';

let tmpDir: string;
let dataDir: string;
let vaultA: string;
let vaultB: string;
let obsidianConfigPath: string;
let prevObsidianConfigPath: string | undefined;

function createDeps(body?: unknown) {
  return {
    dataDir,
    sendJson: (res: ServerResponse, data: unknown, status = 200) => {
      (res as any).writeHead(status, { 'Content-Type': 'application/json' });
      (res as any).end(JSON.stringify(data));
    },
    readRequestBody: async () => (body == null ? '' : JSON.stringify(body)),
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obsidian-connector-test-'));
  dataDir = path.join(tmpDir, 'data');
  vaultA = path.join(tmpDir, 'AlphaVault');
  vaultB = path.join(tmpDir, 'BetaVault');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(vaultA, { recursive: true });
  fs.mkdirSync(vaultB, { recursive: true });

  obsidianConfigPath = path.join(tmpDir, 'obsidian.json');
  fs.writeFileSync(obsidianConfigPath, JSON.stringify({
    vaults: {
      alpha: { path: vaultA, ts: Date.now(), open: true },
      beta: { path: vaultB, ts: Date.now(), open: false },
    },
  }));

  prevObsidianConfigPath = process.env.OBSIDIAN_CONFIG_PATH;
  process.env.OBSIDIAN_CONFIG_PATH = obsidianConfigPath;
});

afterEach(() => {
  if (prevObsidianConfigPath == null) delete process.env.OBSIDIAN_CONFIG_PATH;
  else process.env.OBSIDIAN_CONFIG_PATH = prevObsidianConfigPath;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('handleObsidianConnector', () => {
  it('returns false for non-obsidian URLs', async () => {
    const handled = await handleObsidianConnector(
      mockRequest({ method: 'GET', url: '/api/sessions' }),
      mockResponse(),
      createDeps(),
    );
    expect(handled).toBe(false);
  });

  it('discovers vaults from obsidian.json', async () => {
    const res = mockResponse();
    const handled = await handleObsidianConnector(
      mockRequest({ method: 'GET', url: '/api/obsidian/vaults' }),
      res,
      createDeps(),
    );
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);
    const body = parseJsonBody<{ vaults: Array<{ id: string; path: string }>; count: number }>(res);
    expect(body.count).toBe(2);
    expect(body.vaults.some((v) => v.id === 'alpha' && v.path === vaultA)).toBe(true);
  });

  it('persists connector config and rejects unsafe mission folders', async () => {
    const okRes = mockResponse();
    await handleObsidianConnector(
      mockRequest({ method: 'PUT', url: '/api/obsidian/config' }),
      okRes,
      createDeps({
        vaultId: 'alpha',
        missionFolder: 'VentureOS/Missions',
        journalFolder: 'VentureOS/Missions/Agent Journals',
        journalRoles: { nexus: true, oracle: true },
      }),
    );
    expect(okRes._statusCode).toBe(200);
    const okBody = parseJsonBody<{
      config: {
        vaultId: string;
        missionFolder: string;
        journalFolder: string;
        journalRoles: Record<string, boolean>;
      };
    }>(okRes);
    expect(okBody.config.vaultId).toBe('alpha');
    expect(okBody.config.missionFolder).toBe('VentureOS/Missions');
    expect(okBody.config.journalFolder).toBe('VentureOS/Missions/Agent Journals');
    expect(okBody.config.journalRoles.nexus).toBe(true);
    expect(okBody.config.journalRoles.oracle).toBe(true);
    expect(okBody.config.journalRoles.atlas).toBe(false);

    const badRes = mockResponse();
    await handleObsidianConnector(
      mockRequest({ method: 'PUT', url: '/api/obsidian/config' }),
      badRes,
      createDeps({ missionFolder: '.obsidian/plugins' }),
    );
    expect(badRes._statusCode).toBe(400);
    expect(parseJsonBody<{ error: string }>(badRes).error).toContain('missionFolder');
  });

  it('writes and appends mission notes inside configured vault', async () => {
    await handleObsidianConnector(
      mockRequest({ method: 'PUT', url: '/api/obsidian/config' }),
      mockResponse(),
      createDeps({ vaultId: 'alpha', missionFolder: 'VentureOS/Missions' }),
    );

    const writeRes = mockResponse();
    await handleObsidianConnector(
      mockRequest({ method: 'POST', url: '/api/obsidian/notes/write' }),
      writeRes,
      createDeps({
        missionId: 'MC-299',
        title: 'Mission Connector',
        markdown: 'Initial update.',
      }),
    );
    expect(writeRes._statusCode).toBe(200);
    const first = parseJsonBody<{ path: string; created: boolean }>(writeRes);
    expect(first.path).toBe('VentureOS/Missions/mc-299.md');
    expect(first.created).toBe(true);

    const notePath = path.join(vaultA, 'VentureOS', 'Missions', 'mc-299.md');
    expect(fs.existsSync(notePath)).toBe(true);

    const appendRes = mockResponse();
    await handleObsidianConnector(
      mockRequest({ method: 'POST', url: '/api/obsidian/notes/write' }),
      appendRes,
      createDeps({
        missionId: 'MC-299',
        markdown: 'Second update.',
        mode: 'append',
      }),
    );
    expect(appendRes._statusCode).toBe(200);
    const text = fs.readFileSync(notePath, 'utf8');
    expect(text).toContain('Initial update.');
    expect(text).toContain('Second update.');
  });

  it('blocks writes to .obsidian internals', async () => {
    await handleObsidianConnector(
      mockRequest({ method: 'PUT', url: '/api/obsidian/config' }),
      mockResponse(),
      createDeps({ vaultId: 'alpha', missionFolder: 'VentureOS/Missions' }),
    );

    const res = mockResponse();
    await handleObsidianConnector(
      mockRequest({ method: 'POST', url: '/api/obsidian/notes/write' }),
      res,
      createDeps({
        relativePath: '.obsidian/plugins/unsafe.md',
        markdown: 'bad write',
      }),
    );
    expect(res._statusCode).toBe(400);
    expect(parseJsonBody<{ error: string }>(res).error.toLowerCase()).toContain('path');
  });

  it('indexes notes for search bridge', async () => {
    await handleObsidianConnector(
      mockRequest({ method: 'PUT', url: '/api/obsidian/config' }),
      mockResponse(),
      createDeps({ vaultId: 'alpha', missionFolder: 'VentureOS/Missions' }),
    );

    const folder = path.join(vaultA, 'VentureOS', 'Missions');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'mc-001.md'), [
      '---',
      'missionId: mc-001',
      'status: running',
      'owner: nexus',
      '---',
      '',
      '# Launch Video',
      '',
      'Prepare launch timeline and script.',
    ].join('\n'));
    fs.writeFileSync(path.join(folder, 'mc-002.md'), '# Unrelated\n\nBacklog cleanup.');

    const res = mockResponse();
    await handleObsidianConnector(
      mockRequest({ method: 'GET', url: '/api/obsidian/notes?q=launch&limit=10' }),
      res,
      createDeps(),
    );
    expect(res._statusCode).toBe(200);
    const body = parseJsonBody<{ total: number; notes: Array<{ missionId: string | null; title: string }> }>(res);
    expect(body.total).toBe(1);
    expect(body.notes[0].missionId).toBe('mc-001');
    expect(body.notes[0].title).toContain('Launch Video');
  });

  it('creates template-based notes and appends structured updates', async () => {
    await handleObsidianConnector(
      mockRequest({ method: 'PUT', url: '/api/obsidian/config' }),
      mockResponse(),
      createDeps({ vaultId: 'alpha', missionFolder: 'VentureOS/Missions' }),
    );

    const createRes = mockResponse();
    await handleObsidianConnector(
      mockRequest({ method: 'POST', url: '/api/obsidian/notes/write' }),
      createRes,
      createDeps({
        missionId: 'MC-300',
        title: 'Mission Template',
        template: 'mission',
        status: 'active',
        owner: 'oracle',
      }),
    );
    expect(createRes._statusCode).toBe(200);

    const notePath = path.join(vaultA, 'VentureOS', 'Missions', 'mc-300.md');
    const created = fs.readFileSync(notePath, 'utf8');
    expect(created).toContain('missionId: MC-300');
    expect(created).toContain('prNumber: null');
    expect(created).toContain('status: active');
    expect(created).toContain('owner: oracle');
    expect(created).toContain('## Decisions');
    expect(created).toContain('## Risks');
    expect(created).toContain('## Next Actions');

    const appendRes = mockResponse();
    await handleObsidianConnector(
      mockRequest({ method: 'POST', url: '/api/obsidian/notes/write' }),
      appendRes,
      createDeps({
        missionId: 'MC-300',
        mode: 'append',
        sections: {
          decisions: ['Ship template adapter'],
          risks: ['Need stronger source ranking'],
          nextActions: ['Wire unified search'],
        },
      }),
    );
    expect(appendRes._statusCode).toBe(200);

    const appended = fs.readFileSync(notePath, 'utf8');
    expect(appended).toContain('### Decisions');
    expect(appended).toContain('Ship template adapter');
    expect(appended).toContain('### Risks');
    expect(appended).toContain('Need stronger source ranking');
    expect(appended).toContain('### Next Actions');
    expect(appended).toContain('Wire unified search');
  });

  it('upserts one daily digest note per day without duplicating sections', async () => {
    await handleObsidianConnector(
      mockRequest({ method: 'PUT', url: '/api/obsidian/config' }),
      mockResponse(),
      createDeps({ vaultId: 'alpha', missionFolder: 'VentureOS/Missions' }),
    );

    const digestBody = {
      date: '2026-02-21',
      openPrStatus: ['PR #330: Mission log templates'],
      reviewBlockers: ['PR #323 is awaiting review approval'],
      ciFailures: ['PR #323 — build-and-test [failure]'],
      milestoneProgress: ['Dashboard Merge: 10/10 closed (100%)'],
    };

    const first = mockResponse();
    await handleObsidianConnector(
      mockRequest({ method: 'POST', url: '/api/obsidian/daily-digest' }),
      first,
      createDeps(digestBody),
    );
    expect(first._statusCode).toBe(200);
    const firstJson = parseJsonBody<{ path: string }>(first);
    expect(firstJson.path).toBe('VentureOS/Missions/Daily Ops/2026-02-21.md');

    const second = mockResponse();
    await handleObsidianConnector(
      mockRequest({ method: 'POST', url: '/api/obsidian/daily-digest' }),
      second,
      createDeps({
        ...digestBody,
        ciFailures: ['PR #323 — build-and-test [failure]', 'PR #323 — E2E [failure]'],
      }),
    );
    expect(second._statusCode).toBe(200);

    const notePath = path.join(vaultA, 'VentureOS', 'Missions', 'Daily Ops', '2026-02-21.md');
    const note = fs.readFileSync(notePath, 'utf8');
    expect((note.match(/^## Open PR Status$/gm) || []).length).toBe(1);
    expect((note.match(/^## Review Blockers$/gm) || []).length).toBe(1);
    expect((note.match(/^## CI Failures$/gm) || []).length).toBe(1);
    expect((note.match(/^## Milestone Progress$/gm) || []).length).toBe(1);
    expect(note).toContain('PR #323 — E2E [failure]');
  });

  it('writes strict journal snapshots for enabled roles with mission/replay links', async () => {
    await handleObsidianConnector(
      mockRequest({ method: 'PUT', url: '/api/obsidian/config' }),
      mockResponse(),
      createDeps({
        vaultId: 'alpha',
        missionFolder: 'VentureOS/Missions',
        journalFolder: 'VentureOS/Missions/Agent Journals',
        journalRoles: { nexus: true },
      }),
    );

    const okRes = mockResponse();
    await handleObsidianConnector(
      mockRequest({ method: 'POST', url: '/api/obsidian/journals/write' }),
      okRes,
      createDeps({
        role: 'nexus',
        missionId: 'MC-303',
        replayId: 'replay-303',
        summary: 'Validated open PR queue and replay alignment.',
        highlights: ['PR review blockers triaged', 'CI rerun requested'],
        status: 'active',
        date: '2026-02-21',
      }),
    );
    expect(okRes._statusCode).toBe(200);
    const ok = parseJsonBody<{ path: string; role: string; links: { missionId: string; replayId: string } }>(okRes);
    expect(ok.path).toBe('VentureOS/Missions/Agent Journals/nexus/2026-02-21.md');
    expect(ok.role).toBe('nexus');
    expect(ok.links.missionId).toBe('MC-303');
    expect(ok.links.replayId).toBe('replay-303');

    const journalPath = path.join(vaultA, 'VentureOS', 'Missions', 'Agent Journals', 'nexus', '2026-02-21.md');
    const journal = fs.readFileSync(journalPath, 'utf8');
    expect(journal).toContain('## Snapshot');
    expect(journal).toContain('- Role: nexus');
    expect(journal).toContain('[[VentureOS/Missions/mc-303.md|MC-303]]');
    expect(journal).toContain('(ventureos://replay/replay-303)');
    expect(journal).toContain('PR review blockers triaged');

    const blockedRes = mockResponse();
    await handleObsidianConnector(
      mockRequest({ method: 'POST', url: '/api/obsidian/journals/write' }),
      blockedRes,
      createDeps({
        role: 'atlas',
        missionId: 'MC-303',
        summary: 'Should not write because atlas stream is disabled.',
      }),
    );
    expect(blockedRes._statusCode).toBe(403);
  });
});

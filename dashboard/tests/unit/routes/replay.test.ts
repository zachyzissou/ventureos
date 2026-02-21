/**
 * Tests for replay session CRUD routes — Issue #193
 *
 * Covers: create, read, update, delete, list, events query,
 * validation, conflict detection, auth/error contracts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import { handleTacticalMapReplay } from '../../../server/routes/tactical-map-replay.js';

const baseTmp = path.join('/tmp', `ventureos-replay-${Date.now()}`);

function sendJson(res: ReturnType<typeof mockResponse>, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function createDeps(dataDir: string) {
  return {
    dataDir,
    sendJson: sendJson as any,
    readRequestBody: async (incoming: any) => incoming._rawBody ?? '',
    clampInt: (n: string | number | null, lo: number, hi: number, dflt: number) => {
      const v = parseInt(String(n));
      if (Number.isNaN(v)) return dflt;
      return Math.max(lo, Math.min(hi, v));
    },
  };
}

function writeIndex(dataDir: string, sessions: Array<Record<string, unknown>>) {
  const dir = path.join(dataDir, 'replay');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'sessions.json'),
    JSON.stringify({ updatedAt: '2026-02-16T12:00:00.000Z', sessions }, null, 2),
  );
}

function writeSessionDetail(dataDir: string, id: string, payload: Record<string, unknown>) {
  const dir = path.join(dataDir, 'replay', 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(payload, null, 2));
}

async function runRoute(
  req: ReturnType<typeof mockRequest> & { _rawBody?: string },
  dataDir: string,
) {
  const res = mockResponse();
  const handled = await handleTacticalMapReplay(req, res, createDeps(dataDir));
  return { handled, res };
}

afterEach(() => {
  fs.rmSync(baseTmp, { recursive: true, force: true });
});

describe('tactical-map replay routes', () => {
  // ── LIST ─────────────────────────────────────────────────────────────────

  it('lists replay sessions with filtering + pagination', async () => {
    const dataDir = path.join(baseTmp, 'list');
    writeIndex(dataDir, [
      { id: 'alpha', name: 'Alpha', startedAt: 1000, endedAt: 2000, tags: ['incident'], eventCount: 5 },
      { id: 'beta', name: 'Beta', startedAt: 3000, endedAt: 4000, tags: ['routine'], eventCount: 3 },
      { id: 'gamma', name: 'Gamma', startedAt: 5000, endedAt: 6000, tags: ['incident', 'oracle'], eventCount: 7 },
    ]);

    const req = mockRequest({
      method: 'GET',
      url: '/api/replay/sessions?page=1&pageSize=1&tags=incident',
    }) as any;

    const { res } = await runRoute(req, dataDir);
    const body = parseJsonBody<{ ok: boolean; sessions: Array<{ id: string }>; totalCount: number }>(res);

    expect(body.ok).toBe(true);
    expect(body.totalCount).toBe(2);
    expect(body.sessions).toHaveLength(1);
    // Default sort is startedAt:desc, so gamma comes first
    expect(body.sessions[0].id).toBe('gamma');
  });

  it('supports startAfter/startBefore time filters', async () => {
    const dataDir = path.join(baseTmp, 'time-filter');
    writeIndex(dataDir, [
      { id: 'a', name: 'A', startedAt: 1000 },
      { id: 'b', name: 'B', startedAt: 3000 },
      { id: 'c', name: 'C', startedAt: 5000 },
    ]);

    const req = mockRequest({
      method: 'GET',
      url: '/api/replay/sessions?startAfter=2000&startBefore=4000',
    }) as any;

    const { res } = await runRoute(req, dataDir);
    const body = parseJsonBody<{ ok: boolean; sessions: Array<{ id: string }> }>(res);
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].id).toBe('b');
  });

  // ── READ ─────────────────────────────────────────────────────────────────

  it('returns session detail from stored file', async () => {
    const dataDir = path.join(baseTmp, 'detail');
    writeIndex(dataDir, [{ id: 'alpha', name: 'Alpha', startedAt: 1000, endedAt: 2000 }]);
    writeSessionDetail(dataDir, 'alpha', {
      id: 'alpha',
      name: 'Alpha Detail',
      startedAt: 1000,
      endedAt: 2000,
      eventCount: 12,
      tags: ['incident'],
    });

    const req = mockRequest({ method: 'GET', url: '/api/tactical-map/sessions/alpha' }) as any;
    const { res } = await runRoute(req, dataDir);
    const body = parseJsonBody<{ ok: boolean; session: { id: string; eventCount?: number } }>(res);

    expect(body.ok).toBe(true);
    expect(body.session.id).toBe('alpha');
    expect(body.session.eventCount).toBe(12);
  });

  it('returns session from index when detail file is missing', async () => {
    const dataDir = path.join(baseTmp, 'index-only');
    writeIndex(dataDir, [{ id: 'idx-only', name: 'Index Only', startedAt: 1000, eventCount: 5 }]);

    const req = mockRequest({ method: 'GET', url: '/api/replay/sessions/idx-only' }) as any;
    const { res } = await runRoute(req, dataDir);
    const body = parseJsonBody<{ ok: boolean; session: { id: string; name: string } }>(res);

    expect(body.ok).toBe(true);
    expect(body.session.id).toBe('idx-only');
    expect(body.session.name).toBe('Index Only');
  });

  // ── CREATE (POST) ────────────────────────────────────────────────────────

  it('creates a session and persists to index + detail file', async () => {
    const dataDir = path.join(baseTmp, 'create');

    const req = mockRequest({ method: 'POST', url: '/api/replay/sessions' }) as any;
    req._rawBody = JSON.stringify({
      id: 'new-session',
      name: 'New Session',
      description: 'Testing creation',
      startedAt: 10000,
      endedAt: 20000,
      eventCount: 100,
      tags: ['test'],
      capturedStores: ['map', 'economy'],
    });

    const { res } = await runRoute(req, dataDir);
    expect(res._statusCode).toBe(201);

    const body = parseJsonBody<{
      ok: boolean;
      created: boolean;
      session: { id: string; name: string; eventCount: number; durationMs: number };
    }>(res);

    expect(body.ok).toBe(true);
    expect(body.created).toBe(true);
    expect(body.session.id).toBe('new-session');
    expect(body.session.name).toBe('New Session');
    expect(body.session.eventCount).toBe(100);
    expect(body.session.durationMs).toBe(10000);

    // Verify persistence
    const indexFile = path.join(dataDir, 'replay', 'sessions.json');
    expect(fs.existsSync(indexFile)).toBe(true);
    const idx = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    expect(idx.sessions).toHaveLength(1);
    expect(idx.sessions[0].id).toBe('new-session');

    const detailFile = path.join(dataDir, 'replay', 'sessions', 'new-session.json');
    expect(fs.existsSync(detailFile)).toBe(true);
  });

  it('auto-generates id when none provided', async () => {
    const dataDir = path.join(baseTmp, 'auto-id');
    const req = mockRequest({ method: 'POST', url: '/api/replay/sessions' }) as any;
    req._rawBody = JSON.stringify({ name: 'Auto ID' });

    const { res } = await runRoute(req, dataDir);
    expect(res._statusCode).toBe(201);

    const body = parseJsonBody<{ session: { id: string } }>(res);
    expect(body.session.id).toMatch(/^replay-\d+-[a-f0-9]{12}$/);
  });

  it('rejects creation with unsafe id', async () => {
    const dataDir = path.join(baseTmp, 'unsafe-id');
    const req = mockRequest({ method: 'POST', url: '/api/replay/sessions' }) as any;
    req._rawBody = JSON.stringify({ id: '../../../etc/passwd' });

    const { res } = await runRoute(req, dataDir);
    expect(res._statusCode).toBe(400);
  });

  it('rejects creation with non-JSON body', async () => {
    const dataDir = path.join(baseTmp, 'bad-json');
    const req = mockRequest({ method: 'POST', url: '/api/replay/sessions' }) as any;
    req._rawBody = 'this is not json';

    const { res } = await runRoute(req, dataDir);
    expect(res._statusCode).toBe(400);
  });

  it('rejects creation with array body', async () => {
    const dataDir = path.join(baseTmp, 'array-body');
    const req = mockRequest({ method: 'POST', url: '/api/replay/sessions' }) as any;
    req._rawBody = JSON.stringify([{ id: 'test' }]);

    const { res } = await runRoute(req, dataDir);
    expect(res._statusCode).toBe(400);
  });

  it('returns 409 for duplicate session id', async () => {
    const dataDir = path.join(baseTmp, 'dup');
    writeIndex(dataDir, [{ id: 'dupe', name: 'Existing' }]);

    const req = mockRequest({ method: 'POST', url: '/api/replay/sessions' }) as any;
    req._rawBody = JSON.stringify({ id: 'dupe', name: 'Duplicate' });

    const { res } = await runRoute(req, dataDir);
    expect(res._statusCode).toBe(409);
  });

  // ── UPDATE (PUT) ─────────────────────────────────────────────────────────

  it('updates session metadata partially', async () => {
    const dataDir = path.join(baseTmp, 'update');
    writeIndex(dataDir, [
      { id: 'upd', name: 'Old', startedAt: 1000, tags: ['v1'], eventCount: 10 },
    ]);
    writeSessionDetail(dataDir, 'upd', {
      id: 'upd',
      name: 'Old',
      startedAt: 1000,
      eventCount: 10,
    });

    const req = mockRequest({ method: 'PUT', url: '/api/replay/sessions/upd' }) as any;
    req._rawBody = JSON.stringify({ name: 'Updated', tags: ['v2'] });

    const { res } = await runRoute(req, dataDir);
    expect(res._statusCode).toBe(200);

    const body = parseJsonBody<{
      ok: boolean;
      updated: boolean;
      session: { id: string; name: string; tags: string[]; eventCount: number; startedAt: number };
    }>(res);

    expect(body.updated).toBe(true);
    expect(body.session.name).toBe('Updated');
    expect(body.session.tags).toEqual(['v2']);
    // Unchanged fields preserved
    expect(body.session.eventCount).toBe(10);
    expect(body.session.startedAt).toBe(1000);
  });

  it('supports PATCH method for updates', async () => {
    const dataDir = path.join(baseTmp, 'patch');
    writeIndex(dataDir, [{ id: 'pch', name: 'Original', startedAt: 1000 }]);

    const req = mockRequest({ method: 'PATCH', url: '/api/replay/sessions/pch' }) as any;
    req._rawBody = JSON.stringify({ description: 'Patched' });

    const { res } = await runRoute(req, dataDir);
    expect(res._statusCode).toBe(200);

    const body = parseJsonBody<{ session: { description: string } }>(res);
    expect(body.session.description).toBe('Patched');
  });

  it('rejects update that changes session id', async () => {
    const dataDir = path.join(baseTmp, 'id-change');
    writeIndex(dataDir, [{ id: 'orig', name: 'Original', startedAt: 1000 }]);

    const req = mockRequest({ method: 'PUT', url: '/api/replay/sessions/orig' }) as any;
    req._rawBody = JSON.stringify({ id: 'new-id' });

    const { res } = await runRoute(req, dataDir);
    expect(res._statusCode).toBe(400);
  });

  it('returns 404 for updating non-existent session', async () => {
    const dataDir = path.join(baseTmp, 'no-update');
    const req = mockRequest({ method: 'PUT', url: '/api/replay/sessions/missing' }) as any;
    req._rawBody = JSON.stringify({ name: 'Nope' });

    const { res } = await runRoute(req, dataDir);
    expect(res._statusCode).toBe(404);
  });

  // ── DELETE ───────────────────────────────────────────────────────────────

  it('deletes a session from index and detail', async () => {
    const dataDir = path.join(baseTmp, 'del');
    writeIndex(dataDir, [
      { id: 'del-me', name: 'Delete', startedAt: 1000 },
      { id: 'keep-me', name: 'Keep', startedAt: 2000 },
    ]);
    writeSessionDetail(dataDir, 'del-me', { id: 'del-me', name: 'Delete' });

    const req = mockRequest({ method: 'DELETE', url: '/api/tactical-map/sessions/del-me' }) as any;
    const { res } = await runRoute(req, dataDir);
    expect(res._statusCode).toBe(200);

    const body = parseJsonBody<{ ok: boolean; deleted: boolean; id: string }>(res);
    expect(body.deleted).toBe(true);
    expect(body.id).toBe('del-me');

    // Check index
    const idx = JSON.parse(fs.readFileSync(path.join(dataDir, 'replay', 'sessions.json'), 'utf8'));
    expect(idx.sessions).toHaveLength(1);
    expect(idx.sessions[0].id).toBe('keep-me');

    // Check detail file removed
    expect(fs.existsSync(path.join(dataDir, 'replay', 'sessions', 'del-me.json'))).toBe(false);
  });

  it('returns 404 for deleting non-existent session', async () => {
    const dataDir = path.join(baseTmp, 'del-404');
    const req = mockRequest({ method: 'DELETE', url: '/api/replay/sessions/ghost' }) as any;
    const { res } = await runRoute(req, dataDir);
    expect(res._statusCode).toBe(404);
  });

  it('rejects delete with invalid session id', async () => {
    const dataDir = path.join(baseTmp, 'del-bad');
    // Use a session id with spaces/special chars that get decoded
    const req = mockRequest({ method: 'DELETE', url: '/api/replay/sessions/bad%20id%21' }) as any;
    const { res } = await runRoute(req, dataDir);
    expect(res._statusCode).toBe(400);
  });

  // ── EVENTS QUERY ─────────────────────────────────────────────────────────

  it('returns events paginated from session detail', async () => {
    const dataDir = path.join(baseTmp, 'events');
    const events = Array.from({ length: 20 }, (_, i) => ({
      type: 'tick',
      ts: 1000 + i * 10,
      data: { idx: i },
    }));
    writeSessionDetail(dataDir, 'ev-sess', { id: 'ev-sess', events });

    const req = mockRequest({
      method: 'GET',
      url: '/api/replay/events?sessionId=ev-sess&limit=5&offset=10',
    }) as any;
    const { res } = await runRoute(req, dataDir);
    expect(res._statusCode).toBe(200);

    const body = parseJsonBody<{
      ok: boolean;
      events: Array<{ data: { idx: number } }>;
      totalCount: number;
    }>(res);

    expect(body.totalCount).toBe(20);
    expect(body.events).toHaveLength(5);
    expect(body.events[0].data.idx).toBe(10);
  });

  it('returns 404 for events of non-existent session', async () => {
    const dataDir = path.join(baseTmp, 'ev-404');
    const req = mockRequest({
      method: 'GET',
      url: '/api/replay/events?sessionId=nope',
    }) as any;
    const { res } = await runRoute(req, dataDir);
    expect(res._statusCode).toBe(404);
  });

  it('requires sessionId parameter for events', async () => {
    const dataDir = path.join(baseTmp, 'ev-missing');
    const req = mockRequest({ method: 'GET', url: '/api/replay/events' }) as any;
    const { res } = await runRoute(req, dataDir);
    expect(res._statusCode).toBe(400);
  });

  it('builds replay-only route/verdict explanation from authority timeline events', async () => {
    const dataDir = path.join(baseTmp, 'explain');
    writeSessionDetail(dataDir, 'auth-sess', {
      id: 'auth-sess',
      events: [
        { type: 'route.evaluated', ts: 1000, details: { phase: 'verify' } },
        { type: 'verdict.generated', ts: 1010, details: { winnerAgentId: 'oracle' } },
        { type: 'arbitration.accepted', ts: 1020, details: { acceptedBy: 'nexus' } },
      ],
    });

    const req = mockRequest({
      method: 'GET',
      url: '/api/replay/explain?sessionId=auth-sess',
    }) as any;
    const { res } = await runRoute(req, dataDir);
    expect(res._statusCode).toBe(200);
    const body = parseJsonBody<{
      explanation: string;
      timeline: Array<{ type: string }>;
      totalCount: number;
    }>(res);
    expect(body.totalCount).toBe(3);
    expect(body.timeline[0].type).toBe('route.evaluated');
    expect(body.explanation).toContain('Route event');
    expect(body.explanation).toContain('Verdict event');
    expect(body.explanation).toContain('Arbitration event');
  });

  it('returns 400 for replay explain when sessionId is missing', async () => {
    const dataDir = path.join(baseTmp, 'explain-missing');
    const req = mockRequest({
      method: 'GET',
      url: '/api/replay/explain',
    }) as any;
    const { res } = await runRoute(req, dataDir);
    expect(res._statusCode).toBe(400);
  });

  it('returns 404 for replay explain when session is missing', async () => {
    const dataDir = path.join(baseTmp, 'explain-404');
    const req = mockRequest({
      method: 'GET',
      url: '/api/replay/explain?sessionId=missing-session',
    }) as any;
    const { res } = await runRoute(req, dataDir);
    expect(res._statusCode).toBe(404);
  });

  it('returns replay control-health metrics for a session', async () => {
    const dataDir = path.join(baseTmp, 'control-health');
    writeSessionDetail(dataDir, 'health-sess', {
      id: 'health-sess',
      events: [
        { type: 'route.evaluated', ts: 1000 },
        { type: 'verdict.generated', ts: 1010 },
        { type: 'arbitration.accepted', ts: 1020 },
        { type: 'contract.gate.rejected', ts: 1030, reason: 'policy' },
      ],
    });

    const req = mockRequest({
      method: 'GET',
      url: '/api/replay/control-health?sessionId=health-sess',
    }) as any;
    const { res } = await runRoute(req, dataDir);
    expect(res._statusCode).toBe(200);
    const body = parseJsonBody<{
      health: {
        status: string;
        counts: { routeDecisions: number; verdicts: number; arbitrationAccepted: number; contractFailures: number };
        incidents: Array<{ type: string }>;
      };
    }>(res);
    expect(body.health.counts.routeDecisions).toBe(1);
    expect(body.health.counts.verdicts).toBe(1);
    expect(body.health.counts.arbitrationAccepted).toBe(1);
    expect(body.health.counts.contractFailures).toBe(1);
    expect(body.health.status).toBe('at-risk');
    expect(body.health.incidents.some((i) => i.type === 'contract.gate.rejected')).toBe(true);
  });

  it('aggregates replay control-health across recent sessions when sessionId is omitted', async () => {
    const dataDir = path.join(baseTmp, 'control-health-multi');
    writeIndex(dataDir, [
      { id: 's1', name: 'S1', startedAt: 1000 },
      { id: 's2', name: 'S2', startedAt: 2000 },
    ]);
    writeSessionDetail(dataDir, 's1', {
      id: 's1',
      events: [{ type: 'arbitration.accepted', ts: 1000 }],
    });
    writeSessionDetail(dataDir, 's2', {
      id: 's2',
      events: [{ type: 'arbitration.rejected', ts: 2000 }],
    });

    const req = mockRequest({
      method: 'GET',
      url: '/api/replay/control-health?sessionLimit=5',
    }) as any;
    const { res } = await runRoute(req, dataDir);
    expect(res._statusCode).toBe(200);
    const body = parseJsonBody<{
      scope: string;
      sessionIds: string[];
      health: { counts: { arbitrationAccepted: number; arbitrationRejected: number } };
    }>(res);
    expect(body.scope).toBe('recent-sessions');
    expect(body.sessionIds.length).toBeGreaterThanOrEqual(2);
    expect(body.health.counts.arbitrationAccepted).toBe(1);
    expect(body.health.counts.arbitrationRejected).toBe(1);
  });

  it('returns 404 for control-health when sessionId does not exist', async () => {
    const dataDir = path.join(baseTmp, 'control-health-404');
    const req = mockRequest({
      method: 'GET',
      url: '/api/replay/control-health?sessionId=nonexistent-session',
    }) as any;
    const { res } = await runRoute(req, dataDir);
    expect(res._statusCode).toBe(404);
  });

  it('returns no-data status for control-health aggregate when no sessions exist', async () => {
    const dataDir = path.join(baseTmp, 'control-health-empty');
    writeIndex(dataDir, []);
    const req = mockRequest({
      method: 'GET',
      url: '/api/replay/control-health?sessionLimit=5',
    }) as any;
    const { res } = await runRoute(req, dataDir);
    expect(res._statusCode).toBe(200);
    const body = parseJsonBody<{ status: string; health: null }>(res);
    expect(body.status).toBe('no-data');
    expect(body.health).toBeNull();
  });

  // ── TIMESTAMP LOOKUP ─────────────────────────────────────────────────────

  it('finds session covering a timestamp', async () => {
    const dataDir = path.join(baseTmp, 'ts-lookup');
    writeIndex(dataDir, [
      { id: 'ts1', name: 'TS1', startedAt: 1000, endedAt: 5000 },
      { id: 'ts2', name: 'TS2', startedAt: 6000, endedAt: 9000 },
    ]);

    const req = mockRequest({ method: 'GET', url: '/api/replay/7000' }) as any;
    const { res } = await runRoute(req, dataDir);
    expect(res._statusCode).toBe(200);

    const body = parseJsonBody<{ session: { id: string }; timestamp: number }>(res);
    expect(body.session.id).toBe('ts2');
    expect(body.timestamp).toBe(7000);
  });

  // ── ALIAS PARITY ─────────────────────────────────────────────────────────

  it('works with /api/tactical-map/ prefix for all CRUD operations', async () => {
    const dataDir = path.join(baseTmp, 'alias');

    // Create
    const createReq = mockRequest({ method: 'POST', url: '/api/tactical-map/sessions' }) as any;
    createReq._rawBody = JSON.stringify({ id: 'alias-test', name: 'Alias Test' });
    const createRes = await runRoute(createReq, dataDir);
    expect(createRes.res._statusCode).toBe(201);

    // Read
    const readReq = mockRequest({ method: 'GET', url: '/api/tactical-map/sessions/alias-test' }) as any;
    const readRes = await runRoute(readReq, dataDir);
    expect(readRes.res._statusCode).toBe(200);

    // Update
    const updateReq = mockRequest({ method: 'PUT', url: '/api/tactical-map/sessions/alias-test' }) as any;
    updateReq._rawBody = JSON.stringify({ name: 'Updated Alias' });
    const updateRes = await runRoute(updateReq, dataDir);
    expect(updateRes.res._statusCode).toBe(200);

    // Delete
    const deleteReq = mockRequest({ method: 'DELETE', url: '/api/tactical-map/sessions/alias-test' }) as any;
    const deleteRes = await runRoute(deleteReq, dataDir);
    expect(deleteRes.res._statusCode).toBe(200);
  });

  // ── ROUNDTRIP ────────────────────────────────────────────────────────────

  it('full roundtrip: create → read → update → list → delete → confirm gone', async () => {
    const dataDir = path.join(baseTmp, 'roundtrip');

    // 1. Create
    const c = mockRequest({ method: 'POST', url: '/api/replay/sessions' }) as any;
    c._rawBody = JSON.stringify({
      id: 'rt-session',
      name: 'Roundtrip',
      startedAt: 1000,
      endedAt: 2000,
      tags: ['test'],
    });
    const cr = await runRoute(c, dataDir);
    expect(cr.res._statusCode).toBe(201);

    // 2. Read
    const r = mockRequest({ method: 'GET', url: '/api/replay/sessions/rt-session' }) as any;
    const rr = await runRoute(r, dataDir);
    expect(rr.res._statusCode).toBe(200);
    const readBody = parseJsonBody<{ session: { name: string } }>(rr.res);
    expect(readBody.session.name).toBe('Roundtrip');

    // 3. Update
    const u = mockRequest({ method: 'PUT', url: '/api/replay/sessions/rt-session' }) as any;
    u._rawBody = JSON.stringify({ name: 'Updated Roundtrip', eventCount: 50 });
    const ur = await runRoute(u, dataDir);
    expect(ur.res._statusCode).toBe(200);
    const updateBody = parseJsonBody<{ session: { name: string; eventCount: number } }>(ur.res);
    expect(updateBody.session.name).toBe('Updated Roundtrip');
    expect(updateBody.session.eventCount).toBe(50);

    // 4. List
    const l = mockRequest({ method: 'GET', url: '/api/replay/sessions' }) as any;
    const lr = await runRoute(l, dataDir);
    const listBody = parseJsonBody<{ sessions: Array<{ id: string }> }>(lr.res);
    expect(listBody.sessions).toHaveLength(1);
    expect(listBody.sessions[0].id).toBe('rt-session');

    // 5. Delete
    const d = mockRequest({ method: 'DELETE', url: '/api/replay/sessions/rt-session' }) as any;
    const dr = await runRoute(d, dataDir);
    expect(dr.res._statusCode).toBe(200);

    // 6. Confirm gone
    const g = mockRequest({ method: 'GET', url: '/api/replay/sessions/rt-session' }) as any;
    const gr = await runRoute(g, dataDir);
    expect(gr.res._statusCode).toBe(404);
  });
});

import { afterEach, describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { mockRequest, mockResponse, parseJsonBody } from '../helpers.js';
import { handleTacticalMapReplay } from '../../server/routes/tactical-map-replay.js';

const baseTmp = path.join('/tmp', `ventureos-replay-stubs-${Date.now()}`);

afterEach(() => {
  fs.rmSync(baseTmp, { recursive: true, force: true });
});

function sendJson(res: ReturnType<typeof mockResponse>, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function clampInt(n: string | number | null, lo: number, hi: number, dflt: number): number {
  const v = parseInt(String(n));
  if (Number.isNaN(v)) return dflt;
  return Math.max(lo, Math.min(hi, v));
}

function createDeps(dataDir: string) {
  return {
    dataDir,
    sendJson: sendJson as any,
    readRequestBody: async (incoming: any) => (incoming as { _rawBody?: string })._rawBody ?? '',
    clampInt,
  };
}

async function runRoute(
  req: ReturnType<typeof mockRequest> & { _rawBody?: string },
) {
  const res = mockResponse();
  const handled = await handleTacticalMapReplay(req, res, createDeps(baseTmp));
  return { handled, res };
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

describe('tactical-map-replay route', () => {
  it('ignores non-tactical-map paths', async () => {
    const req = mockRequest({ method: 'GET', url: '/api/other' }) as any;
    const res = mockResponse();
    const handled = await handleTacticalMapReplay(req, res, createDeps(baseTmp));

    expect(handled).toBe(false);
    expect(res._ended).toBe(false);
  });

  it('returns an empty session list with pagination metadata', async () => {
    const req = mockRequest({
      method: 'GET',
      url: '/api/tactical-map/sessions?page=2&pageSize=10',
    }) as any;

    const { handled, res } = await runRoute(req);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);

    const body = parseJsonBody<{
      ok: boolean;
      sessions: unknown[];
      totalCount: number;
      page: number;
      pageSize: number;
    }>(res);

    expect(body.ok).toBe(true);
    expect(Array.isArray(body.sessions)).toBe(true);
    expect(body.sessions.length).toBe(0);
    expect(body.totalCount).toBe(0);
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(10);
  });

  it('returns 404 when a replay session is missing', async () => {
    const req = mockRequest({
      method: 'GET',
      url: '/api/tactical-map/sessions/test-session-123',
    }) as any;

    const { handled, res } = await runRoute(req);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(404);

    const body = parseJsonBody<{ ok: boolean; error: string }>(res);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/replay session not found/i);
  });

  // ── POST (create) — now returns 201 instead of 501 ────────────────────

  it('creates a new replay session via POST', async () => {
    const req = mockRequest({
      method: 'POST',
      url: '/api/tactical-map/sessions',
    }) as any;
    req._rawBody = JSON.stringify({
      name: 'Test Replay',
      description: 'A test session',
      startedAt: 1000,
      endedAt: 2000,
      eventCount: 42,
      tags: ['test', 'integration'],
      capturedStores: ['map'],
    });

    const { handled, res } = await runRoute(req);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(201);

    const body = parseJsonBody<{
      ok: boolean;
      session: { id: string; name: string; eventCount: number; tags: string[] };
      created: boolean;
    }>(res);

    expect(body.ok).toBe(true);
    expect(body.created).toBe(true);
    expect(body.session.name).toBe('Test Replay');
    expect(body.session.eventCount).toBe(42);
    expect(body.session.tags).toContain('test');
    expect(body.session.id).toBeTruthy();
  });

  it('creates a session with a client-supplied id', async () => {
    const req = mockRequest({
      method: 'POST',
      url: '/api/replay/sessions',
    }) as any;
    req._rawBody = JSON.stringify({
      id: 'my-custom-id',
      name: 'Custom ID Session',
    });

    const { handled, res } = await runRoute(req);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(201);

    const body = parseJsonBody<{ ok: boolean; session: { id: string } }>(res);
    expect(body.session.id).toBe('my-custom-id');
  });

  it('rejects duplicate session ids with 409', async () => {
    writeIndex(baseTmp, [{ id: 'existing', name: 'Existing', startedAt: 1000 }]);

    const req = mockRequest({
      method: 'POST',
      url: '/api/replay/sessions',
    }) as any;
    req._rawBody = JSON.stringify({ id: 'existing', name: 'Duplicate' });

    const { res } = await runRoute(req);
    expect(res._statusCode).toBe(409);

    const body = parseJsonBody<{ ok: boolean; error: string }>(res);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/already exists/i);
  });

  it('rejects POST with empty body', async () => {
    const req = mockRequest({
      method: 'POST',
      url: '/api/replay/sessions',
    }) as any;
    req._rawBody = '';

    const { res } = await runRoute(req);
    expect(res._statusCode).toBe(400);
  });

  it('rejects POST with invalid JSON', async () => {
    const req = mockRequest({
      method: 'POST',
      url: '/api/replay/sessions',
    }) as any;
    req._rawBody = 'not json {';

    const { res } = await runRoute(req);
    expect(res._statusCode).toBe(400);

    const body = parseJsonBody<{ ok: boolean; error: string }>(res);
    expect(body.error).toMatch(/invalid json/i);
  });

  // ── DELETE — now actually deletes ──────────────────────────────────────

  it('deletes an existing replay session', async () => {
    writeIndex(baseTmp, [
      { id: 'to-delete', name: 'Delete Me', startedAt: 1000 },
      { id: 'keep', name: 'Keep Me', startedAt: 2000 },
    ]);
    writeSessionDetail(baseTmp, 'to-delete', { id: 'to-delete', name: 'Delete Me' });

    const req = mockRequest({
      method: 'DELETE',
      url: '/api/replay/sessions/to-delete',
    }) as any;

    const { res } = await runRoute(req);
    expect(res._statusCode).toBe(200);

    const body = parseJsonBody<{ ok: boolean; deleted: boolean; id: string }>(res);
    expect(body.ok).toBe(true);
    expect(body.deleted).toBe(true);
    expect(body.id).toBe('to-delete');

    // Verify file was removed
    const detailFile = path.join(baseTmp, 'replay', 'sessions', 'to-delete.json');
    expect(fs.existsSync(detailFile)).toBe(false);

    // Verify index was updated
    const idx = JSON.parse(fs.readFileSync(path.join(baseTmp, 'replay', 'sessions.json'), 'utf8'));
    expect(idx.sessions).toHaveLength(1);
    expect(idx.sessions[0].id).toBe('keep');
  });

  it('returns 404 for deleting non-existent session', async () => {
    const req = mockRequest({
      method: 'DELETE',
      url: '/api/replay/sessions/not-real',
    }) as any;

    const { res } = await runRoute(req);
    expect(res._statusCode).toBe(404);
  });

  // ── PUT (update) ───────────────────────────────────────────────────────

  it('updates session metadata via PUT', async () => {
    writeIndex(baseTmp, [
      { id: 'update-me', name: 'Old Name', startedAt: 1000, tags: ['old'] },
    ]);

    const req = mockRequest({
      method: 'PUT',
      url: '/api/replay/sessions/update-me',
    }) as any;
    req._rawBody = JSON.stringify({
      name: 'New Name',
      tags: ['updated', 'test'],
      description: 'Updated description',
    });

    const { res } = await runRoute(req);
    expect(res._statusCode).toBe(200);

    const body = parseJsonBody<{
      ok: boolean;
      session: { id: string; name: string; tags: string[]; description?: string };
      updated: boolean;
    }>(res);

    expect(body.ok).toBe(true);
    expect(body.updated).toBe(true);
    expect(body.session.name).toBe('New Name');
    expect(body.session.tags).toEqual(['updated', 'test']);
    expect(body.session.description).toBe('Updated description');
    // Verify id wasn't changed
    expect(body.session.id).toBe('update-me');
  });

  it('rejects update that tries to change the session id', async () => {
    writeIndex(baseTmp, [
      { id: 'no-change-id', name: 'Test', startedAt: 1000 },
    ]);

    const req = mockRequest({
      method: 'PUT',
      url: '/api/replay/sessions/no-change-id',
    }) as any;
    req._rawBody = JSON.stringify({ id: 'different-id' });

    const { res } = await runRoute(req);
    expect(res._statusCode).toBe(400);

    const body = parseJsonBody<{ ok: boolean; error: string }>(res);
    expect(body.error).toMatch(/cannot change session id/i);
  });

  it('returns 404 for updating non-existent session', async () => {
    const req = mockRequest({
      method: 'PUT',
      url: '/api/replay/sessions/no-such-session',
    }) as any;
    req._rawBody = JSON.stringify({ name: 'Updated' });

    const { res } = await runRoute(req);
    expect(res._statusCode).toBe(404);
  });

  // ── GET /api/replay/events ─────────────────────────────────────────────

  it('requires sessionId for events endpoint', async () => {
    const req = mockRequest({
      method: 'GET',
      url: '/api/replay/events',
    }) as any;

    const { res } = await runRoute(req);
    expect(res._statusCode).toBe(400);
  });

  it('returns events for a session with pagination', async () => {
    const events = Array.from({ length: 10 }, (_, i) => ({
      type: 'state_change',
      ts: 1000 + i * 100,
      payload: { index: i },
    }));
    writeSessionDetail(baseTmp, 'evented', {
      id: 'evented',
      name: 'Evented Session',
      events,
    });

    const req = mockRequest({
      method: 'GET',
      url: '/api/replay/events?sessionId=evented&limit=3&offset=2',
    }) as any;

    const { res } = await runRoute(req);
    expect(res._statusCode).toBe(200);

    const body = parseJsonBody<{
      ok: boolean;
      events: Array<{ type: string; payload: { index: number } }>;
      totalCount: number;
      limit: number;
      offset: number;
    }>(res);

    expect(body.ok).toBe(true);
    expect(body.totalCount).toBe(10);
    expect(body.events).toHaveLength(3);
    expect(body.events[0].payload.index).toBe(2);
    expect(body.limit).toBe(3);
    expect(body.offset).toBe(2);
  });

  // ── Timestamp-based replay lookup ──────────────────────────────────────

  it('finds session by timestamp', async () => {
    writeIndex(baseTmp, [
      { id: 'ts-session', name: 'Timestamp Session', startedAt: 1000, endedAt: 5000 },
    ]);

    const req = mockRequest({
      method: 'GET',
      url: '/api/replay/3000',
    }) as any;

    const { res } = await runRoute(req);
    expect(res._statusCode).toBe(200);

    const body = parseJsonBody<{
      ok: boolean;
      session: { id: string };
      timestamp: number;
    }>(res);

    expect(body.ok).toBe(true);
    expect(body.session.id).toBe('ts-session');
    expect(body.timestamp).toBe(3000);
  });

  it('returns 404 for timestamp outside any session', async () => {
    writeIndex(baseTmp, [
      { id: 'ts-session', name: 'Timestamp Session', startedAt: 1000, endedAt: 2000 },
    ]);

    const req = mockRequest({
      method: 'GET',
      url: '/api/replay/9999',
    }) as any;

    const { res } = await runRoute(req);
    expect(res._statusCode).toBe(404);
  });

  // ── Invalid session id ─────────────────────────────────────────────────

  it('rejects invalid session id characters', async () => {
    // Test with a session id containing spaces/special chars that pass the URL match
    // but fail the SESSION_ID_PATTERN validation
    const req = mockRequest({
      method: 'GET',
      url: '/api/replay/sessions/bad%20session%21',
    }) as any;

    const { res } = await runRoute(req);
    expect(res._statusCode).toBe(400);

    const body = parseJsonBody<{ ok: boolean; error: string }>(res);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/invalid session id/i);
  });
});

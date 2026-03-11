/**
 * Progression HTTP API — Integration Tests
 *
 * Tests for the progression API routes: summary, profile read,
 * XP event ingestion, prestige, and validation error paths.
 *
 * Issue #203 — Phase 4.5 Deep Progression System (Phase 1 foundation)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { handleProgressionApi } from '../progression-http';
import { ProgressionStore } from '../progression-store';

function tempDbPath(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prog-http-'));
  return path.join(tmpDir, 'test-progression.db');
}

/** Simulate an HTTP request to the progression API. */
function fakeRequest(
  dbPathArg: string,
  method: string,
  url: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve) => {
    let resolvedStatus = 200;
    let resolvedBody = '{}';

    // Create a mock request
    const req = Object.create(http.IncomingMessage.prototype) as http.IncomingMessage & {
      _events: Record<string, Function[]>;
      _readableState: { ended: boolean };
    };
    (req as any).url = url;
    (req as any).method = method;
    (req as any).headers = { host: 'localhost', 'content-type': 'application/json' };
    (req as any)._events = {};
    (req as any)._readableState = { ended: false };

    // Simple event emitter
    const listeners: Record<string, Function[]> = {};
    req.on = ((event: string, cb: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
      return req;
    }) as any;

    function emit(event: string, ...args: unknown[]) {
      for (const cb of listeners[event] ?? []) {
        cb(...args);
      }
    }

    // Create a mock response
    const res = {
      writeHead(code: number, headers?: Record<string, string>) {
        resolvedStatus = code;
        return res;
      },
      end(data?: string) {
        resolvedBody = data ?? '{}';
        try {
          resolve({ status: resolvedStatus, body: JSON.parse(resolvedBody) });
        } catch {
          resolve({ status: resolvedStatus, body: {} });
        }
      },
      setHeader() {},
      getHeader() { return undefined; },
      write() { return true; },
    } as unknown as http.ServerResponse;

    const handled = handleProgressionApi(req, res, { dbPath: dbPathArg });

    if (!handled) {
      resolve({ status: 404, body: { error: 'not handled' } });
      return;
    }

    // For POST requests, emit body data after handler sets up listeners
    if (body && method === 'POST') {
      const bodyStr = JSON.stringify(body);
      setImmediate(() => {
        emit('data', Buffer.from(bodyStr));
        emit('end');
      });
    }
  });
}

let dbPath: string;

beforeEach(() => {
  dbPath = tempDbPath();
  // Initialize the store to ensure schema is created
  const store = new ProgressionStore(dbPath);
  store.close();
});

afterEach(() => {
  try { fs.rmSync(path.dirname(dbPath), { recursive: true }); } catch { /* ignore */ }
});

// ─── Summary Endpoint ───────────────────────────────────────────────────────

describe('GET /api/rpg/progression/summary', () => {
  it('returns empty summary when no profiles exist', async () => {
    const { status, body } = await fakeRequest(dbPath, 'GET', '/api/rpg/progression/summary');
    expect(status).toBe(200);
    expect((body as any).profiles).toEqual([]);
    expect((body as any).total_xp_today).toBe(0);
  });
});

// ─── Profile Endpoint ───────────────────────────────────────────────────────

describe('GET /api/rpg/progression/:agentId', () => {
  it('returns profile with skill tree for new agent', async () => {
    const { status, body } = await fakeRequest(dbPath, 'GET', '/api/rpg/progression/oracle');
    expect(status).toBe(200);
    expect((body as any).profile.agent_id).toBe('oracle');
    expect((body as any).profile.level).toBe(1);
    expect((body as any).skill_tree.nodes.length).toBe(15);
    expect((body as any).prestige_eligible).toBe(false);
  });
});

// ─── XP Event Ingestion ─────────────────────────────────────────────────────

describe('POST /api/rpg/progression/events', () => {
  it('ingests a valid XP event', async () => {
    const { status, body } = await fakeRequest(dbPath, 'POST', '/api/rpg/progression/events', {
      agent_id: 'oracle',
      raw_xp: 100,
      source_category: 'mission_completion',
      source_description: 'Completed a mission',
    });
    expect(status).toBe(201);
    expect((body as any).ok).toBe(true);
    expect((body as any).event.raw_xp).toBe(100);
    expect((body as any).profile.current_xp).toBeGreaterThan(0);
  });

  it('rejects missing agent_id', async () => {
    const { status, body } = await fakeRequest(dbPath, 'POST', '/api/rpg/progression/events', {
      raw_xp: 100,
      source_category: 'mission_completion',
      source_description: 'Test',
    });
    expect(status).toBe(400);
    expect((body as any).ok).toBe(false);
  });

  it('rejects non-positive XP', async () => {
    const { status, body } = await fakeRequest(dbPath, 'POST', '/api/rpg/progression/events', {
      agent_id: 'oracle',
      raw_xp: -5,
      source_category: 'mission_completion',
      source_description: 'Test',
    });
    expect(status).toBe(400);
    expect((body as any).ok).toBe(false);
  });

  it('rejects invalid source_category', async () => {
    const { status, body } = await fakeRequest(dbPath, 'POST', '/api/rpg/progression/events', {
      agent_id: 'oracle',
      raw_xp: 50,
      source_category: 'hacking',
      source_description: 'Test',
    });
    expect(status).toBe(400);
    expect((body as any).ok).toBe(false);
  });

  it('rejects missing source_description', async () => {
    const { status, body } = await fakeRequest(dbPath, 'POST', '/api/rpg/progression/events', {
      agent_id: 'oracle',
      raw_xp: 50,
      source_category: 'mission_completion',
    });
    expect(status).toBe(400);
    expect((body as any).ok).toBe(false);
  });
});

// ─── Route Matching ─────────────────────────────────────────────────────────

describe('Route matching', () => {
  it('does not handle unrelated paths', async () => {
    const { status } = await fakeRequest(dbPath, 'GET', '/api/rpg/stats');
    expect(status).toBe(404); // Not handled
  });

  it('does not handle paths outside /api/rpg/progression', async () => {
    const { status } = await fakeRequest(dbPath, 'GET', '/api/other');
    expect(status).toBe(404);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

import { mockRequest, mockResponse, parseJsonBody } from '../helpers.js';
import {
  handleTacticalMapLive,
  handleTacticalMapLiveUpgrade,
} from '../../server/routes/tactical-map-live.js';

const baseTmp = path.join('/tmp', `ventureos-tactical-map-live-${Date.now()}`);

afterEach(() => {
  fs.rmSync(baseTmp, { recursive: true, force: true });
});

function sendJson(res: ReturnType<typeof mockResponse>, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function writeMainSession(openclawDir: string, nowMs: number): void {
  const sessionsDir = path.join(openclawDir, 'agents', 'main', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionsDir, 'sessions.json'),
    JSON.stringify(
      {
        'agent:main:main': {
          sessionId: 'session-1',
          label: 'Main work',
          updatedAt: nowMs - 30_000,
          createdAt: nowMs - 120_000,
          totalTokens: 1500,
          totalCostUsd: 0.01,
          abortedLastRun: false,
        },
      },
      null,
      2,
    ),
  );
}

function writeControlStore(dataDir: string): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, 'tactical-map-controls.json'),
    JSON.stringify(
      {
        pausedAgents: { oracle: true },
        budgets: { oracle: 50_000, nexus: 210_000 },
      },
      null,
      2,
    ),
  );
}

function createDeps(openclawDir: string, dataDir: string, auth = true) {
  return {
    openclawDir,
    dataDir,
    sendJson: sendJson as any,
    isAuthenticated: () => auth,
    primaryAgentId: 'main',
    now: () => new Date('2026-02-20T20:00:00.000Z'),
  };
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

describe('tactical-map-live routes', () => {
  it('ignores non tactical-map routes', () => {
    const req = mockRequest({ method: 'GET', url: '/api/other' }) as any;
    const res = mockResponse();
    const handled = handleTacticalMapLive(req, res, createDeps(baseTmp, path.join(baseTmp, 'data')));
    expect(handled).toBe(false);
    expect(res._ended).toBe(false);
  });

  it('serves /api/tactical-map/state', () => {
    const openclawDir = path.join(baseTmp, 'openclaw');
    const dataDir = path.join(baseTmp, 'data');
    const nowMs = new Date('2026-02-20T20:00:00.000Z').getTime();
    writeMainSession(openclawDir, nowMs);
    writeControlStore(dataDir);

    const req = mockRequest({ method: 'GET', url: '/api/tactical-map/state' }) as any;
    const res = mockResponse();
    const handled = handleTacticalMapLive(req, res, createDeps(openclawDir, dataDir));

    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);
    const body = parseJsonBody<any>(res);
    expect(body.updatedAt).toBeTypeOf('string');
    expect(body.agents.oracle.paused).toBe(true);
    expect(body.agents.nexus.sessions).toBeGreaterThan(0); // primary-agent fallback
    expect(body.agents.nexus.state).toMatch(/ACTIVE|OVERLOADED|IDLE|ERROR/);
  });

  it('serves /api/tactical-map/resources', () => {
    const openclawDir = path.join(baseTmp, 'openclaw');
    const dataDir = path.join(baseTmp, 'data');
    const nowMs = new Date('2026-02-20T20:00:00.000Z').getTime();
    writeMainSession(openclawDir, nowMs);
    writeControlStore(dataDir);

    const req = mockRequest({ method: 'GET', url: '/api/tactical-map/resources' }) as any;
    const res = mockResponse();
    const handled = handleTacticalMapLive(req, res, createDeps(openclawDir, dataDir));

    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);
    const body = parseJsonBody<any>(res);
    expect(body.pool.tokenQuotaTotal).toBeGreaterThan(0);
    expect(body.agents.oracle.tokenBudget).toBe(50_000);
    expect(body.agents.nexus.tokensUsed).toBeGreaterThan(0);
  });

  it('serves /api/tactical-map/health', () => {
    const openclawDir = path.join(baseTmp, 'openclaw');
    const dataDir = path.join(baseTmp, 'data');
    const nowMs = new Date('2026-02-20T20:00:00.000Z').getTime();
    writeMainSession(openclawDir, nowMs);
    writeControlStore(dataDir);

    const req = mockRequest({ method: 'GET', url: '/api/tactical-map/health' }) as any;
    const res = mockResponse();
    const handled = handleTacticalMapLive(req, res, createDeps(openclawDir, dataDir));

    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);
    const body = parseJsonBody<any>(res);
    expect(body.system).toBeTruthy();
    expect(body.system.overallStatus).toMatch(/green|yellow|red/);
    expect(body.agents.nexus.connectivity).toMatch(/online|offline|degraded/);
  });

  it('returns 426 for stream endpoints without websocket upgrade', () => {
    const req = mockRequest({
      method: 'GET',
      url: '/api/tactical-map/resources/stream',
    }) as any;
    const res = mockResponse();
    const handled = handleTacticalMapLive(req, res, createDeps(baseTmp, path.join(baseTmp, 'data')));
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(426);
  });
});

describe('tactical-map-live upgrades', () => {
  it('rejects unauthorized websocket upgrades', () => {
    const req = mockRequest({
      method: 'GET',
      url: '/api/tactical-map/resources/stream',
      headers: {
        upgrade: 'websocket',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
      },
    }) as any;
    const socket = new MockSocket();
    const handled = handleTacticalMapLiveUpgrade(
      req,
      socket as any,
      Buffer.alloc(0),
      createDeps(baseTmp, path.join(baseTmp, 'data'), false),
    );
    expect(handled).toBe(true);
    expect(String(socket.chunks[0] ?? '')).toContain('401');
    expect(socket.destroyed).toBe(true);
  });

  it('accepts authenticated websocket upgrades', () => {
    const openclawDir = path.join(baseTmp, 'openclaw');
    const dataDir = path.join(baseTmp, 'data');
    const nowMs = new Date('2026-02-20T20:00:00.000Z').getTime();
    writeMainSession(openclawDir, nowMs);
    writeControlStore(dataDir);

    const req = mockRequest({
      method: 'GET',
      url: '/api/tactical-map/resources/stream',
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'sec-websocket-version': '13',
      },
    }) as any;
    const socket = new MockSocket();
    const handled = handleTacticalMapLiveUpgrade(
      req,
      socket as any,
      Buffer.alloc(0),
      createDeps(openclawDir, dataDir, true),
    );
    expect(handled).toBe(true);
    expect(String(socket.chunks[0] ?? '')).toContain('101 Switching Protocols');
    socket.emit('close');
  });
});

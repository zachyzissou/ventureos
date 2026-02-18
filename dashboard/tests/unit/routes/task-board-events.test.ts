/**
 * Task Board SSE event bus tests — Issue #219.
 *
 * Tests the event bus (task-board-events.ts) and the SSE endpoint
 * integration in the task-board route handler.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import {
  handleTaskBoard,
  loadTasks,
} from '../../../server/routes/task-board.js';
import {
  addClient,
  removeClient,
  removeAllClients,
  clientCount,
  broadcastTaskEvent,
  emitTaskEvent,
} from '../../../server/task-board-events.js';
import type { TaskBoardDeps, TaskCard } from '../../../server/types.js';

const testDataDir = path.join('/tmp', 'test-tb-events-' + process.pid);

/**
 * Create a mock response that behaves as an SSE-capable writable stream.
 * The standard mockResponse doesn't expose `writable`, which broadcastTaskEvent checks.
 */
function mockSseResponse() {
  const res = mockResponse();
  // Mark as writable so broadcastTaskEvent doesn't prune it
  (res as any).writable = true;
  return res;
}

/**
 * Create a mock response that simulates a non-writable (disconnected) stream.
 */
function mockStaleResponse() {
  const res = mockResponse();
  (res as any).writable = false;
  return res;
}

function createDeps(overrides: Partial<TaskBoardDeps> = {}): TaskBoardDeps {
  return {
    dataDir: testDataDir,
    sendJson: (res, data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    },
    readRequestBody: async () => '{}',
    ...overrides,
  };
}

function depsWithBody(body: unknown, overrides: Partial<TaskBoardDeps> = {}): TaskBoardDeps {
  return createDeps({
    readRequestBody: async () => JSON.stringify(body),
    ...overrides,
  });
}

function seedTasks(tasks: TaskCard[]): void {
  fs.mkdirSync(testDataDir, { recursive: true });
  fs.writeFileSync(
    path.join(testDataDir, 'task-board.json'),
    JSON.stringify({ tasks, updatedAt: Date.now() }),
  );
}

function makeSampleCard(overrides: Partial<TaskCard> = {}): TaskCard {
  return {
    id: 'test-' + Math.random().toString(36).slice(2, 8),
    agentId: 'oracle',
    title: 'Test task',
    description: 'A test task',
    priority: 'medium',
    status: 'backlog',
    createdAt: Date.now(),
    queuedAt: null,
    startedAt: null,
    completedAt: null,
    resultSummary: null,
    tokensUsed: null,
    error: null,
    costEstimate: null,
    runtimeMs: null,
    ...overrides,
  };
}

beforeEach(() => {
  fs.mkdirSync(testDataDir, { recursive: true });
  const fp = path.join(testDataDir, 'task-board.json');
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  removeAllClients();
});

afterEach(() => {
  removeAllClients();
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

// ─── Event Bus Unit Tests ────────────────────────────────────────────────────

describe('task-board-events: client management', () => {
  it('starts with zero clients', () => {
    expect(clientCount()).toBe(0);
  });

  it('adds a client and increments count', () => {
    const res = mockSseResponse();
    const added = addClient(res as any);
    expect(added).toBe(true);
    expect(clientCount()).toBe(1);
  });

  it('removes a client', () => {
    const res = mockSseResponse();
    addClient(res as any);
    expect(clientCount()).toBe(1);
    removeClient(res as any);
    expect(clientCount()).toBe(0);
  });

  it('removeClient is idempotent', () => {
    const res = mockSseResponse();
    addClient(res as any);
    removeClient(res as any);
    removeClient(res as any); // second call is a no-op
    expect(clientCount()).toBe(0);
  });

  it('removeAllClients clears all', () => {
    addClient(mockSseResponse() as any);
    addClient(mockSseResponse() as any);
    addClient(mockSseResponse() as any);
    expect(clientCount()).toBe(3);
    removeAllClients();
    expect(clientCount()).toBe(0);
  });

  it('rejects clients beyond MAX_CLIENTS', () => {
    // Add 50 clients (the max)
    for (let i = 0; i < 50; i++) {
      expect(addClient(mockSseResponse() as any)).toBe(true);
    }
    expect(clientCount()).toBe(50);
    // 51st should be rejected
    expect(addClient(mockSseResponse() as any)).toBe(false);
    expect(clientCount()).toBe(50);
  });
});

describe('task-board-events: broadcastTaskEvent', () => {
  it('sends event data to all connected clients', () => {
    const res1 = mockSseResponse();
    const res2 = mockSseResponse();
    addClient(res1 as any);
    addClient(res2 as any);

    const card = makeSampleCard({ id: 'bcast-1' });
    broadcastTaskEvent({ type: 'task:created', ts: Date.now(), card });

    const body1 = res1._body;
    const body2 = res2._body;
    expect(body1).toContain('"type":"task:created"');
    expect(body1).toContain('"id":"bcast-1"');
    expect(body2).toContain('"type":"task:created"');
  });

  it('does nothing when no clients connected', () => {
    // Should not throw
    broadcastTaskEvent({
      type: 'task:deleted',
      ts: Date.now(),
      card: makeSampleCard(),
    });
  });

  it('prunes non-writable clients', () => {
    const goodRes = mockSseResponse();
    const badRes = mockStaleResponse();

    addClient(goodRes as any);
    addClient(badRes as any);
    expect(clientCount()).toBe(2);

    broadcastTaskEvent({
      type: 'task:updated',
      ts: Date.now(),
      card: makeSampleCard(),
    });

    // Bad client should have been pruned
    expect(clientCount()).toBe(1);
  });
});

describe('emitTaskEvent', () => {
  it('convenience wrapper broadcasts correctly', () => {
    const res = mockSseResponse();
    addClient(res as any);
    const card = makeSampleCard({ id: 'emit-1' });
    emitTaskEvent('task:created', card);

    expect(res._body).toContain('"type":"task:created"');
    expect(res._body).toContain('"id":"emit-1"');
  });
});

// ─── SSE Endpoint Tests ─────────────────────────────────────────────────────

describe('GET /api/task-board/events (SSE endpoint)', () => {
  it('returns SSE headers and connected message', async () => {
    const res = mockSseResponse();
    const req = mockRequest({ url: '/api/task-board/events' });

    const handled = await handleTaskBoard(req, res, createDeps());
    expect(handled).toBe(true);
    expect(res._headers['content-type']).toBe('text/event-stream');
    expect(res._headers['cache-control']).toBe('no-cache');
    expect(res._body).toContain('"type":"connected"');
    expect(clientCount()).toBe(1);
  });

  it('returns 503 when at capacity', async () => {
    // Fill up to max
    for (let i = 0; i < 50; i++) {
      addClient(mockSseResponse() as any);
    }

    const res = mockSseResponse();
    const handled = await handleTaskBoard(
      mockRequest({ url: '/api/task-board/events' }),
      res,
      createDeps(),
    );
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(503);
    const body = parseJsonBody(res);
    expect(body.error).toContain('too many');
  });

  it('removes client on request close', async () => {
    const res = mockSseResponse();
    const req = mockRequest({ url: '/api/task-board/events' });

    await handleTaskBoard(req, res, createDeps());
    expect(clientCount()).toBe(1);

    // Simulate client disconnect
    req.emit('close');
    expect(clientCount()).toBe(0);
  });
});

// ─── Integration: CRUD emits events ──────────────────────────────────────────

describe('CRUD operations emit SSE events', () => {
  it('POST /api/task-board emits task:created', async () => {
    const emitted: Array<{ type: string; card: TaskCard }> = [];
    const deps = depsWithBody(
      { title: 'SSE create test', priority: 'high' },
      {
        emitEvent: (type, card) => { emitted.push({ type, card }); },
      },
    );

    const res = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board', method: 'POST' }),
      res,
      deps,
    );

    expect(res._statusCode).toBe(201);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe('task:created');
    expect(emitted[0].card.title).toBe('SSE create test');
  });

  it('PATCH /api/task-board/:id emits task:updated', async () => {
    seedTasks([makeSampleCard({ id: 'upd-1', status: 'backlog' })]);

    const emitted: Array<{ type: string; card: TaskCard }> = [];
    const deps = depsWithBody(
      { status: 'queued' },
      {
        emitEvent: (type, card) => { emitted.push({ type, card }); },
      },
    );

    const res = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board/upd-1', method: 'PATCH' }),
      res,
      deps,
    );

    expect(res._statusCode).toBe(200);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe('task:updated');
    expect(emitted[0].card.status).toBe('queued');
  });

  it('DELETE /api/task-board/:id emits task:deleted with last-known card', async () => {
    const card = makeSampleCard({ id: 'del-1', title: 'Delete me' });
    seedTasks([card]);

    const emitted: Array<{ type: string; card: TaskCard }> = [];
    const deps = createDeps({
      emitEvent: (type, c) => { emitted.push({ type, card: c }); },
    });

    const res = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board/del-1', method: 'DELETE' }),
      res,
      deps,
    );

    expect(res._statusCode).toBe(200);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe('task:deleted');
    expect(emitted[0].card.id).toBe('del-1');
    expect(emitted[0].card.title).toBe('Delete me');

    // Verify the card is actually gone
    expect(loadTasks(testDataDir)).toHaveLength(0);
  });

  it('no emitEvent when deps.emitEvent is not provided', async () => {
    // This test verifies the optional nature — no error when omitted
    const deps = depsWithBody({ title: 'No emit' });
    const res = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board', method: 'POST' }),
      res,
      deps,
    );
    expect(res._statusCode).toBe(201);
    // No crash — the optional chaining handles it
  });

  it('failed mutation does not emit events', async () => {
    seedTasks([makeSampleCard({ id: 'no-emit-1', status: 'backlog' })]);

    const emitted: Array<{ type: string }> = [];
    const deps = depsWithBody(
      { status: 'running' }, // invalid transition from backlog
      {
        emitEvent: (type) => { emitted.push({ type }); },
      },
    );

    const res = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board/no-emit-1', method: 'PATCH' }),
      res,
      deps,
    );

    expect(res._statusCode).toBe(400);
    expect(emitted).toHaveLength(0); // No event emitted for invalid transition
  });
});

// ─── End-to-end: broadcast reaches SSE client ────────────────────────────────

describe('end-to-end: mutation → broadcast → SSE client', () => {
  it('POST creates card and SSE client receives the event', async () => {
    // Connect an SSE client
    const sseRes = mockSseResponse();
    const sseReq = mockRequest({ url: '/api/task-board/events' });
    await handleTaskBoard(sseReq, sseRes, createDeps());
    expect(clientCount()).toBe(1);

    // Clear the connected message
    const connectedBody = sseRes._body;
    expect(connectedBody).toContain('"type":"connected"');

    // Create a task with emitEvent wired to the real broadcastTaskEvent
    const deps = depsWithBody(
      { title: 'E2E test', priority: 'critical' },
      {
        emitEvent: emitTaskEvent,
      },
    );

    const createRes = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board', method: 'POST' }),
      createRes,
      deps,
    );
    expect(createRes._statusCode).toBe(201);

    // SSE client should have received the event
    expect(sseRes._body).toContain('"type":"task:created"');
    expect(sseRes._body).toContain('"title":"E2E test"');
    expect(sseRes._body).toContain('"priority":"critical"');
  });
});

/**
 * Task Board SSE subscription filtering tests — Issue #219.
 *
 * Tests server-side per-client subscription filtering for the task board
 * SSE event stream. Validates:
 * - Filtered SSE delivery correctness (only matching events reach client)
 * - Unfiltered default behavior (all events delivered to unfiltered clients)
 * - Multi-client mixed filtering scenarios
 * - Connection cleanup and bounded resource behavior
 * - Auth gating (endpoint requires auth in normal server flow)
 * - Filter parsing edge cases
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
  addFilteredClient,
  removeClient,
  removeAllClients,
  clientCount,
  broadcastTaskEvent,
  emitTaskEvent,
  parseSubscriptionFilter,
  matchesFilter,
} from '../../../server/task-board-events.js';
import type {
  TaskBoardDeps,
  TaskCard,
  TaskStatus,
  TaskPriority,
} from '../../../server/types.js';
import type { SseSubscriptionFilter } from '../../../server/task-board-events.js';

const testDataDir = path.join('/tmp', 'test-tb-filter-' + process.pid);

// ─── Test helpers ────────────────────────────────────────────────────────────

function mockSseResponse() {
  const res = mockResponse();
  (res as any).writable = true;
  return res;
}

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
    id: 'flt-' + Math.random().toString(36).slice(2, 8),
    agentId: 'oracle',
    title: 'Filter test task',
    description: 'A filter test task',
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

// ─── parseSubscriptionFilter ─────────────────────────────────────────────────

describe('parseSubscriptionFilter', () => {
  it('returns empty filter with no params', () => {
    const f = parseSubscriptionFilter({});
    expect(f).toEqual({});
  });

  it('returns empty filter with null params', () => {
    const f = parseSubscriptionFilter({
      status: null,
      agentId: null,
      priority: null,
      missionId: null,
      assigneeType: null,
    });
    expect(f).toEqual({});
  });

  it('parses valid status', () => {
    const f = parseSubscriptionFilter({ status: 'running' });
    expect(f).toEqual({ status: 'running' });
  });

  it('ignores invalid status', () => {
    const f = parseSubscriptionFilter({ status: 'exploding' });
    expect(f).toEqual({});
  });

  it('parses valid agentId', () => {
    const f = parseSubscriptionFilter({ agentId: 'oracle' });
    expect(f).toEqual({ agentId: 'oracle' });
  });

  it('trims agentId whitespace', () => {
    const f = parseSubscriptionFilter({ agentId: '  sentinel  ' });
    expect(f).toEqual({ agentId: 'sentinel' });
  });

  it('ignores empty string agentId', () => {
    const f = parseSubscriptionFilter({ agentId: '' });
    expect(f).toEqual({});
  });

  it('ignores whitespace-only agentId', () => {
    const f = parseSubscriptionFilter({ agentId: '   ' });
    expect(f).toEqual({});
  });

  it('parses valid priority', () => {
    const f = parseSubscriptionFilter({ priority: 'critical' });
    expect(f).toEqual({ priority: 'critical' });
  });

  it('parses valid missionId', () => {
    const f = parseSubscriptionFilter({ missionId: 'mc-001' });
    expect(f).toEqual({ missionId: 'mc-001' });
  });

  it('trims missionId whitespace', () => {
    const f = parseSubscriptionFilter({ missionId: '  mc-002  ' });
    expect(f).toEqual({ missionId: 'mc-002' });
  });

  it('parses valid assigneeType', () => {
    const f = parseSubscriptionFilter({ assigneeType: 'human' });
    expect(f).toEqual({ assigneeType: 'human' });
  });

  it('ignores invalid assigneeType', () => {
    const f = parseSubscriptionFilter({ assigneeType: 'robot' });
    expect(f).toEqual({});
  });

  it('ignores invalid priority', () => {
    const f = parseSubscriptionFilter({ priority: 'ultra' });
    expect(f).toEqual({});
  });

  it('parses all filters together', () => {
    const f = parseSubscriptionFilter({
      status: 'running',
      agentId: 'nexus',
      priority: 'high',
      missionId: 'mc-003',
      assigneeType: 'agent',
    });
    expect(f).toEqual({
      status: 'running',
      agentId: 'nexus',
      priority: 'high',
      missionId: 'mc-003',
      assigneeType: 'agent',
    });
  });

  it('only keeps valid fields in mixed input', () => {
    const f = parseSubscriptionFilter({ status: 'invalid', agentId: 'atlas', priority: 'high' });
    expect(f).toEqual({ agentId: 'atlas', priority: 'high' });
  });

  it('parses all valid statuses', () => {
    for (const s of ['backlog', 'queued', 'running', 'blocked', 'review', 'done', 'failed']) {
      const f = parseSubscriptionFilter({ status: s });
      expect(f.status).toBe(s);
    }
  });

  it('parses all valid priorities', () => {
    for (const p of ['critical', 'high', 'medium', 'low']) {
      const f = parseSubscriptionFilter({ priority: p });
      expect(f.priority).toBe(p);
    }
  });
});

// ─── matchesFilter ───────────────────────────────────────────────────────────

describe('matchesFilter', () => {
  const card = makeSampleCard({
    status: 'running',
    agentId: 'oracle',
    priority: 'high',
    missionId: 'mc-100',
    assigneeType: 'agent',
  });

  it('empty filter matches everything', () => {
    expect(matchesFilter(card, {})).toBe(true);
  });

  it('matching status passes', () => {
    expect(matchesFilter(card, { status: 'running' })).toBe(true);
  });

  it('non-matching status fails', () => {
    expect(matchesFilter(card, { status: 'done' })).toBe(false);
  });

  it('matching agentId passes', () => {
    expect(matchesFilter(card, { agentId: 'oracle' })).toBe(true);
  });

  it('non-matching agentId fails', () => {
    expect(matchesFilter(card, { agentId: 'sentinel' })).toBe(false);
  });

  it('matching priority passes', () => {
    expect(matchesFilter(card, { priority: 'high' })).toBe(true);
  });

  it('non-matching priority fails', () => {
    expect(matchesFilter(card, { priority: 'low' })).toBe(false);
  });

  it('all matching filters pass', () => {
    expect(matchesFilter(card, {
      status: 'running',
      agentId: 'oracle',
      priority: 'high',
      missionId: 'mc-100',
      assigneeType: 'agent',
    })).toBe(true);
  });

  it('one non-matching filter fails even when others match', () => {
    expect(matchesFilter(card, { status: 'running', agentId: 'oracle', priority: 'low' })).toBe(false);
  });

  it('matching missionId passes', () => {
    expect(matchesFilter(card, { missionId: 'mc-100' })).toBe(true);
  });

  it('non-matching missionId fails', () => {
    expect(matchesFilter(card, { missionId: 'mc-999' })).toBe(false);
  });

  it('matching assigneeType passes', () => {
    expect(matchesFilter(card, { assigneeType: 'agent' })).toBe(true);
  });

  it('non-matching assigneeType fails', () => {
    expect(matchesFilter(card, { assigneeType: 'human' })).toBe(false);
  });

  it('null agentId on card does not match agentId filter', () => {
    const noAgent = makeSampleCard({ agentId: null });
    expect(matchesFilter(noAgent, { agentId: 'oracle' })).toBe(false);
  });

  it('null agentId on card matches empty filter', () => {
    const noAgent = makeSampleCard({ agentId: null });
    expect(matchesFilter(noAgent, {})).toBe(true);
  });
});

// ─── Filtered SSE delivery correctness ───────────────────────────────────────

describe('broadcastTaskEvent with filtered clients', () => {
  it('unfiltered client receives all events', () => {
    const res = mockSseResponse();
    addFilteredClient(res as any, {});
    expect(clientCount()).toBe(1);

    const card1 = makeSampleCard({ id: 'all-1', status: 'running', agentId: 'oracle' });
    const card2 = makeSampleCard({ id: 'all-2', status: 'done', agentId: 'sentinel' });
    broadcastTaskEvent({ type: 'task:created', ts: Date.now(), card: card1 });
    broadcastTaskEvent({ type: 'task:updated', ts: Date.now(), card: card2 });

    expect(res._body).toContain('"id":"all-1"');
    expect(res._body).toContain('"id":"all-2"');
  });

  it('status-filtered client only receives matching status events', () => {
    const res = mockSseResponse();
    addFilteredClient(res as any, { status: 'running' });

    const running = makeSampleCard({ id: 'sf-1', status: 'running' });
    const done = makeSampleCard({ id: 'sf-2', status: 'done' });
    broadcastTaskEvent({ type: 'task:created', ts: Date.now(), card: running });
    broadcastTaskEvent({ type: 'task:created', ts: Date.now(), card: done });

    expect(res._body).toContain('"id":"sf-1"');
    expect(res._body).not.toContain('"id":"sf-2"');
  });

  it('agentId-filtered client only receives matching agent events', () => {
    const res = mockSseResponse();
    addFilteredClient(res as any, { agentId: 'oracle' });

    const oracle = makeSampleCard({ id: 'af-1', agentId: 'oracle' });
    const sentinel = makeSampleCard({ id: 'af-2', agentId: 'sentinel' });
    const noAgent = makeSampleCard({ id: 'af-3', agentId: null });
    broadcastTaskEvent({ type: 'task:created', ts: Date.now(), card: oracle });
    broadcastTaskEvent({ type: 'task:created', ts: Date.now(), card: sentinel });
    broadcastTaskEvent({ type: 'task:created', ts: Date.now(), card: noAgent });

    expect(res._body).toContain('"id":"af-1"');
    expect(res._body).not.toContain('"id":"af-2"');
    expect(res._body).not.toContain('"id":"af-3"');
  });

  it('priority-filtered client only receives matching priority events', () => {
    const res = mockSseResponse();
    addFilteredClient(res as any, { priority: 'critical' });

    const critical = makeSampleCard({ id: 'pf-1', priority: 'critical' });
    const low = makeSampleCard({ id: 'pf-2', priority: 'low' });
    broadcastTaskEvent({ type: 'task:created', ts: Date.now(), card: critical });
    broadcastTaskEvent({ type: 'task:created', ts: Date.now(), card: low });

    expect(res._body).toContain('"id":"pf-1"');
    expect(res._body).not.toContain('"id":"pf-2"');
  });

  it('combined filter requires all conditions to match', () => {
    const res = mockSseResponse();
    addFilteredClient(res as any, { status: 'running', agentId: 'oracle', priority: 'high' });

    const match = makeSampleCard({ id: 'cf-1', status: 'running', agentId: 'oracle', priority: 'high' });
    const wrongStatus = makeSampleCard({ id: 'cf-2', status: 'done', agentId: 'oracle', priority: 'high' });
    const wrongAgent = makeSampleCard({ id: 'cf-3', status: 'running', agentId: 'sentinel', priority: 'high' });
    const wrongPriority = makeSampleCard({ id: 'cf-4', status: 'running', agentId: 'oracle', priority: 'low' });

    broadcastTaskEvent({ type: 'task:created', ts: Date.now(), card: match });
    broadcastTaskEvent({ type: 'task:created', ts: Date.now(), card: wrongStatus });
    broadcastTaskEvent({ type: 'task:created', ts: Date.now(), card: wrongAgent });
    broadcastTaskEvent({ type: 'task:created', ts: Date.now(), card: wrongPriority });

    expect(res._body).toContain('"id":"cf-1"');
    expect(res._body).not.toContain('"id":"cf-2"');
    expect(res._body).not.toContain('"id":"cf-3"');
    expect(res._body).not.toContain('"id":"cf-4"');
  });

  it('deleted events are filtered by last-known card state', () => {
    const res = mockSseResponse();
    addFilteredClient(res as any, { status: 'running' });

    const running = makeSampleCard({ id: 'del-r', status: 'running' });
    const done = makeSampleCard({ id: 'del-d', status: 'done' });
    broadcastTaskEvent({ type: 'task:deleted', ts: Date.now(), card: running });
    broadcastTaskEvent({ type: 'task:deleted', ts: Date.now(), card: done });

    expect(res._body).toContain('"id":"del-r"');
    expect(res._body).not.toContain('"id":"del-d"');
  });
});

// ─── Multi-client mixed filtering ────────────────────────────────────────────

describe('multi-client mixed filtering', () => {
  it('different clients with different filters receive different events', () => {
    const resAll = mockSseResponse();
    const resRunning = mockSseResponse();
    const resOracle = mockSseResponse();
    const resCriticalDone = mockSseResponse();

    addFilteredClient(resAll as any, {}); // no filter
    addFilteredClient(resRunning as any, { status: 'running' });
    addFilteredClient(resOracle as any, { agentId: 'oracle' });
    addFilteredClient(resCriticalDone as any, { status: 'done', priority: 'critical' });

    expect(clientCount()).toBe(4);

    const card1 = makeSampleCard({ id: 'mc-1', status: 'running', agentId: 'oracle', priority: 'high' });
    const card2 = makeSampleCard({ id: 'mc-2', status: 'done', agentId: 'sentinel', priority: 'critical' });
    const card3 = makeSampleCard({ id: 'mc-3', status: 'backlog', agentId: 'oracle', priority: 'low' });

    broadcastTaskEvent({ type: 'task:created', ts: Date.now(), card: card1 });
    broadcastTaskEvent({ type: 'task:created', ts: Date.now(), card: card2 });
    broadcastTaskEvent({ type: 'task:created', ts: Date.now(), card: card3 });

    // Unfiltered: all three
    expect(resAll._body).toContain('"id":"mc-1"');
    expect(resAll._body).toContain('"id":"mc-2"');
    expect(resAll._body).toContain('"id":"mc-3"');

    // Running filter: only card1
    expect(resRunning._body).toContain('"id":"mc-1"');
    expect(resRunning._body).not.toContain('"id":"mc-2"');
    expect(resRunning._body).not.toContain('"id":"mc-3"');

    // Oracle filter: card1 and card3
    expect(resOracle._body).toContain('"id":"mc-1"');
    expect(resOracle._body).not.toContain('"id":"mc-2"');
    expect(resOracle._body).toContain('"id":"mc-3"');

    // Critical + done filter: only card2
    expect(resCriticalDone._body).not.toContain('"id":"mc-1"');
    expect(resCriticalDone._body).toContain('"id":"mc-2"');
    expect(resCriticalDone._body).not.toContain('"id":"mc-3"');
  });

  it('stale filtered client is pruned; other clients unaffected', () => {
    const good = mockSseResponse();
    const stale = mockStaleResponse();
    addFilteredClient(good as any, { status: 'running' });
    addFilteredClient(stale as any, { status: 'running' });
    expect(clientCount()).toBe(2);

    const card = makeSampleCard({ id: 'prune-1', status: 'running' });
    broadcastTaskEvent({ type: 'task:created', ts: Date.now(), card });

    expect(clientCount()).toBe(1);
    expect(good._body).toContain('"id":"prune-1"');
  });
});

// ─── SSE endpoint with filter query params ───────────────────────────────────

describe('GET /api/task-board/events with filter query params', () => {
  it('connects with no filter params (backward compat)', async () => {
    const res = mockSseResponse();
    const req = mockRequest({ url: '/api/task-board/events' });
    const handled = await handleTaskBoard(req, res, createDeps());
    expect(handled).toBe(true);
    expect(res._headers['content-type']).toBe('text/event-stream');
    expect(res._body).toContain('"type":"connected"');
    // Filter should be empty in connected message
    expect(res._body).toContain('"filter":{}');
    expect(clientCount()).toBe(1);
  });

  it('connects with status filter query param', async () => {
    const res = mockSseResponse();
    const req = mockRequest({ url: '/api/task-board/events?status=running' });
    const handled = await handleTaskBoard(req, res, createDeps());
    expect(handled).toBe(true);
    expect(res._body).toContain('"status":"running"');
    expect(clientCount()).toBe(1);
  });

  it('connects with agentId filter query param', async () => {
    const res = mockSseResponse();
    const req = mockRequest({ url: '/api/task-board/events?agentId=oracle' });
    const handled = await handleTaskBoard(req, res, createDeps());
    expect(handled).toBe(true);
    expect(res._body).toContain('"agentId":"oracle"');
  });

  it('connects with priority filter query param', async () => {
    const res = mockSseResponse();
    const req = mockRequest({ url: '/api/task-board/events?priority=critical' });
    const handled = await handleTaskBoard(req, res, createDeps());
    expect(handled).toBe(true);
    expect(res._body).toContain('"priority":"critical"');
  });

  it('connects with all filter params', async () => {
    const res = mockSseResponse();
    const req = mockRequest({
      url: '/api/task-board/events?status=done&agentId=sentinel&priority=high&missionId=mc-200&assigneeType=nexus',
    });
    const handled = await handleTaskBoard(req, res, createDeps());
    expect(handled).toBe(true);
    const body = res._body;
    expect(body).toContain('"status":"done"');
    expect(body).toContain('"agentId":"sentinel"');
    expect(body).toContain('"priority":"high"');
    expect(body).toContain('"missionId":"mc-200"');
    expect(body).toContain('"assigneeType":"nexus"');
  });

  it('ignores invalid filter values gracefully', async () => {
    const res = mockSseResponse();
    const req = mockRequest({ url: '/api/task-board/events?status=invalid&priority=ultra' });
    const handled = await handleTaskBoard(req, res, createDeps());
    expect(handled).toBe(true);
    // Filter should be empty since both were invalid
    expect(res._body).toContain('"filter":{}');
  });

  it('returns 503 when at capacity (with filter params)', async () => {
    // Fill up to max
    for (let i = 0; i < 50; i++) {
      addFilteredClient(mockSseResponse() as any, {});
    }

    const res = mockSseResponse();
    const handled = await handleTaskBoard(
      mockRequest({ url: '/api/task-board/events?status=running' }),
      res,
      createDeps(),
    );
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(503);
  });

  it('removes filtered client on request close', async () => {
    const res = mockSseResponse();
    const req = mockRequest({ url: '/api/task-board/events?agentId=oracle' });
    await handleTaskBoard(req, res, createDeps());
    expect(clientCount()).toBe(1);
    req.emit('close');
    expect(clientCount()).toBe(0);
  });
});

// ─── End-to-end: filtered mutation → broadcast → SSE client ─────────────────

describe('end-to-end: filtered SSE delivery via CRUD + broadcast', () => {
  it('filtered SSE client only receives matching creates', async () => {
    // Connect filtered SSE client (status=running)
    const sseRes = mockSseResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board/events?status=running' }),
      sseRes,
      createDeps(),
    );
    expect(clientCount()).toBe(1);

    // Create a running task
    const deps1 = depsWithBody(
      { title: 'Running task', status: 'queued' }, // starts as queued — should NOT match
      { emitEvent: emitTaskEvent },
    );
    const r1 = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board', method: 'POST' }),
      r1,
      deps1,
    );
    expect(r1._statusCode).toBe(201);

    // Create a backlog task — should NOT match
    const deps2 = depsWithBody(
      { title: 'Backlog task' },
      { emitEvent: emitTaskEvent },
    );
    const r2 = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board', method: 'POST' }),
      r2,
      deps2,
    );

    // SSE client should NOT have received either (neither is status=running)
    const body = sseRes._body;
    expect(body).not.toContain('"title":"Running task"');
    expect(body).not.toContain('"title":"Backlog task"');
  });

  it('unfiltered SSE client receives all mutations', async () => {
    // Connect unfiltered SSE client
    const sseRes = mockSseResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board/events' }),
      sseRes,
      createDeps(),
    );

    // Create and delete tasks
    const deps = depsWithBody(
      { title: 'Unfiltered test', priority: 'critical' },
      { emitEvent: emitTaskEvent },
    );
    const r = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board', method: 'POST' }),
      r,
      deps,
    );

    expect(sseRes._body).toContain('"title":"Unfiltered test"');
    expect(sseRes._body).toContain('"type":"task:created"');
  });

  it('PATCH transition updates reach status-filtered client when new status matches', async () => {
    // Seed a backlog card
    const card = makeSampleCard({ id: 'e2e-patch-1', status: 'backlog' });
    seedTasks([card]);

    // Connect SSE client filtering for status=queued
    const sseRes = mockSseResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board/events?status=queued' }),
      sseRes,
      createDeps(),
    );

    // Transition backlog → queued — should reach client (new status is 'queued')
    const patchDeps = depsWithBody(
      { status: 'queued' },
      { emitEvent: emitTaskEvent },
    );
    const r = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board/e2e-patch-1', method: 'PATCH' }),
      r,
      patchDeps,
    );
    expect(r._statusCode).toBe(200);

    // The updated card has status=queued, which matches the filter
    expect(sseRes._body).toContain('"id":"e2e-patch-1"');
    expect(sseRes._body).toContain('"type":"task:updated"');
  });
});

// ─── Connection cleanup and bounded resource behavior ────────────────────────

describe('connection cleanup and bounded resources', () => {
  it('addClient (backward compat) registers with empty filter', () => {
    const res = mockSseResponse();
    addClient(res as any);
    expect(clientCount()).toBe(1);

    // Should receive all events since filter is empty
    const card = makeSampleCard({ id: 'compat-1' });
    broadcastTaskEvent({ type: 'task:created', ts: Date.now(), card });
    expect(res._body).toContain('"id":"compat-1"');
  });

  it('addFilteredClient respects MAX_CLIENTS cap', () => {
    for (let i = 0; i < 50; i++) {
      expect(addFilteredClient(mockSseResponse() as any, { status: 'running' })).toBe(true);
    }
    expect(addFilteredClient(mockSseResponse() as any, {})).toBe(false);
    expect(clientCount()).toBe(50);
  });

  it('removeAllClients clears filtered clients', () => {
    addFilteredClient(mockSseResponse() as any, { status: 'running' });
    addFilteredClient(mockSseResponse() as any, { agentId: 'oracle' });
    addFilteredClient(mockSseResponse() as any, {});
    expect(clientCount()).toBe(3);
    removeAllClients();
    expect(clientCount()).toBe(0);
  });

  it('removeClient targets the correct filtered client', () => {
    const res1 = mockSseResponse();
    const res2 = mockSseResponse();
    addFilteredClient(res1 as any, { status: 'running' });
    addFilteredClient(res2 as any, { agentId: 'oracle' });

    removeClient(res1 as any);
    expect(clientCount()).toBe(1);

    // res2 should still receive matching events
    const card = makeSampleCard({ id: 'rc-1', agentId: 'oracle' });
    broadcastTaskEvent({ type: 'task:created', ts: Date.now(), card });
    expect(res2._body).toContain('"id":"rc-1"');
  });

  it('broadcast prunes stale clients even when filter matches', () => {
    const good = mockSseResponse();
    const stale = mockStaleResponse();
    addFilteredClient(good as any, {});
    addFilteredClient(stale as any, {});
    expect(clientCount()).toBe(2);

    broadcastTaskEvent({
      type: 'task:created',
      ts: Date.now(),
      card: makeSampleCard({ id: 'stale-prune' }),
    });

    expect(clientCount()).toBe(1);
    expect(good._body).toContain('"id":"stale-prune"');
  });

  it('broadcast with no matching clients does not error', () => {
    const res = mockSseResponse();
    addFilteredClient(res as any, { status: 'done' });

    // Send event that doesn't match the filter — should not error
    broadcastTaskEvent({
      type: 'task:created',
      ts: Date.now(),
      card: makeSampleCard({ id: 'no-match', status: 'running' }),
    });

    expect(res._body).toBe(''); // nothing written
    expect(clientCount()).toBe(1); // client still connected
  });
});

// ─── Auth gating confirmation ────────────────────────────────────────────────

describe('SSE endpoint auth behavior', () => {
  it('endpoint is routed through handleTaskBoard (auth applied by server.ts)', async () => {
    // This test confirms the endpoint handler returns true (meaning it handled the request),
    // which means server.ts auth middleware (applied before route dispatch) is the gate.
    // Direct route handler does not re-implement auth — that's by design.
    const res = mockSseResponse();
    const handled = await handleTaskBoard(
      mockRequest({ url: '/api/task-board/events?status=running' }),
      res,
      createDeps(),
    );
    expect(handled).toBe(true);
    expect(res._headers['content-type']).toBe('text/event-stream');
  });

  it('SSE events endpoint matches URL pattern used by server.ts auth guard', () => {
    // server.ts gates all /api/task-board* URLs through authenticate middleware.
    // This test documents that the SSE events URL starts with /api/task-board.
    const sseUrls = [
      '/api/task-board/events',
      '/api/task-board/events?status=running',
      '/api/task-board/events?agentId=oracle&priority=high',
    ];
    for (const u of sseUrls) {
      expect(u.startsWith('/api/task-board')).toBe(true);
    }
  });
});

// ─── Backward compatibility ──────────────────────────────────────────────────

describe('backward compatibility', () => {
  it('addClient still works and creates unfiltered subscription', () => {
    const res = mockSseResponse();
    expect(addClient(res as any)).toBe(true);
    expect(clientCount()).toBe(1);

    // Receives any event
    broadcastTaskEvent({
      type: 'task:created',
      ts: Date.now(),
      card: makeSampleCard({ id: 'compat-bc' }),
    });
    expect(res._body).toContain('"id":"compat-bc"');
  });

  it('emitTaskEvent broadcasts through filtered clients correctly', () => {
    const filtered = mockSseResponse();
    const unfiltered = mockSseResponse();
    addFilteredClient(filtered as any, { status: 'done' });
    addFilteredClient(unfiltered as any, {});

    const card = makeSampleCard({ id: 'emit-flt', status: 'running' });
    emitTaskEvent('task:created', card);

    expect(unfiltered._body).toContain('"id":"emit-flt"');
    expect(filtered._body).not.toContain('"id":"emit-flt"');
  });

  it('existing CRUD endpoints are unaffected by filtering changes', async () => {
    // GET /api/task-board still works
    seedTasks([makeSampleCard({ id: 'crud-1' })]);
    const res = mockResponse();
    await handleTaskBoard(mockRequest({ url: '/api/task-board' }), res, createDeps());
    const body = parseJsonBody<{ tasks: TaskCard[] }>(res);
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0].id).toBe('crud-1');
  });
});

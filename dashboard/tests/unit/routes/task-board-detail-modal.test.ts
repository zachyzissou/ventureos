/**
 * Task Detail Modal tests — Issue #219, Phase 5.
 *
 * Tests:
 *  1. GET /api/task-board/:id returns full card including new fields
 *  2. PATCH accepts costEstimate / runtimeMs fields
 *  3. Auto-compute runtimeMs on completion
 *  4. Rendering safety: XSS vectors are escaped (textContent-based)
 *  5. Sparse task data (nulls) handled gracefully
 *  6. Complete task data renders all fields
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import {
  handleTaskBoard,
  loadTasks,
} from '../../../server/routes/task-board.js';
import type { TaskBoardDeps, TaskCard } from '../../../server/types.js';

const testDataDir = path.join('/tmp', 'test-task-detail-' + process.pid);

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
    description: 'A test task description',
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
});

afterEach(() => {
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

// ─── GET /api/task-board/:id — full card fields ─────────────────────────────

describe('GET /api/task-board/:id — detail modal support', () => {
  it('returns card with costEstimate and runtimeMs fields', async () => {
    const card = makeSampleCard({
      id: 'detail-1',
      costEstimate: 0.0342,
      runtimeMs: 12500,
      tokensUsed: 8400,
      resultSummary: 'PR merged successfully',
    });
    seedTasks([card]);

    const req = mockRequest({ url: '/api/task-board/detail-1', method: 'GET' });
    const res = mockResponse();
    const deps = createDeps();

    await handleTaskBoard(req, res, deps);
    const body = parseJsonBody<{ card: TaskCard }>(res);

    expect(res._statusCode).toBe(200);
    expect(body.card.id).toBe('detail-1');
    expect(body.card.costEstimate).toBe(0.0342);
    expect(body.card.runtimeMs).toBe(12500);
    expect(body.card.tokensUsed).toBe(8400);
    expect(body.card.resultSummary).toBe('PR merged successfully');
  });

  it('returns null fields for sparse card data', async () => {
    const card = makeSampleCard({
      id: 'sparse-1',
      description: '',
      agentId: null,
      resultSummary: null,
      tokensUsed: null,
      error: null,
      costEstimate: null,
      runtimeMs: null,
    });
    seedTasks([card]);

    const req = mockRequest({ url: '/api/task-board/sparse-1', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const body = parseJsonBody<{ card: TaskCard }>(res);
    expect(body.card.agentId).toBeNull();
    expect(body.card.resultSummary).toBeNull();
    expect(body.card.tokensUsed).toBeNull();
    expect(body.card.error).toBeNull();
    expect(body.card.costEstimate).toBeNull();
    expect(body.card.runtimeMs).toBeNull();
  });

  it('returns 404 for non-existent card', async () => {
    seedTasks([]);
    const req = mockRequest({ url: '/api/task-board/nonexistent', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    expect(res._statusCode).toBe(404);
    const body = parseJsonBody<{ error: string }>(res);
    expect(body.error).toBe('not found');
  });
});

// ─── PATCH costEstimate / runtimeMs ──────────────────────────────────────────

describe('PATCH /api/task-board/:id — costEstimate & runtimeMs', () => {
  it('accepts costEstimate update', async () => {
    const card = makeSampleCard({ id: 'cost-1', status: 'done', completedAt: Date.now() });
    seedTasks([card]);

    const req = mockRequest({ url: '/api/task-board/cost-1', method: 'PATCH' });
    const res = mockResponse();
    const deps = depsWithBody({ costEstimate: 1.23 });

    await handleTaskBoard(req, res, deps);
    const body = parseJsonBody<{ card: TaskCard }>(res);

    expect(res._statusCode).toBe(200);
    expect(body.card.costEstimate).toBe(1.23);
  });

  it('accepts runtimeMs update', async () => {
    const card = makeSampleCard({ id: 'rt-1', status: 'done', completedAt: Date.now() });
    seedTasks([card]);

    const req = mockRequest({ url: '/api/task-board/rt-1', method: 'PATCH' });
    const res = mockResponse();
    const deps = depsWithBody({ runtimeMs: 45000 });

    await handleTaskBoard(req, res, deps);
    const body = parseJsonBody<{ card: TaskCard }>(res);

    expect(res._statusCode).toBe(200);
    expect(body.card.runtimeMs).toBe(45000);
  });

  it('auto-computes runtimeMs on completion when not provided', async () => {
    const startTime = Date.now() - 30000; // 30s ago
    const card = makeSampleCard({
      id: 'autorun-1',
      status: 'running',
      startedAt: startTime,
    });
    seedTasks([card]);

    const req = mockRequest({ url: '/api/task-board/autorun-1', method: 'PATCH' });
    const res = mockResponse();
    const deps = depsWithBody({ status: 'done' });

    await handleTaskBoard(req, res, deps);
    const body = parseJsonBody<{ card: TaskCard }>(res);

    expect(res._statusCode).toBe(200);
    expect(body.card.status).toBe('done');
    expect(body.card.completedAt).toBeTruthy();
    expect(body.card.runtimeMs).toBeGreaterThan(0);
    // Should be approximately 30000ms (± a few ms from execution)
    expect(body.card.runtimeMs).toBeGreaterThanOrEqual(29900);
    expect(body.card.runtimeMs).toBeLessThanOrEqual(35000);
  });

  it('does not overwrite explicit runtimeMs on completion', async () => {
    const card = makeSampleCard({
      id: 'noover-1',
      status: 'running',
      startedAt: Date.now() - 60000,
      runtimeMs: 5000, // pre-set
    });
    seedTasks([card]);

    const req = mockRequest({ url: '/api/task-board/noover-1', method: 'PATCH' });
    const res = mockResponse();
    const deps = depsWithBody({ status: 'done' });

    await handleTaskBoard(req, res, deps);
    const body = parseJsonBody<{ card: TaskCard }>(res);

    // runtimeMs was already set, so auto-compute should not overwrite
    expect(body.card.runtimeMs).toBe(5000);
  });

  it('auto-computes runtimeMs on failure', async () => {
    const startTime = Date.now() - 10000;
    const card = makeSampleCard({
      id: 'fail-rt-1',
      status: 'running',
      startedAt: startTime,
    });
    seedTasks([card]);

    const req = mockRequest({ url: '/api/task-board/fail-rt-1', method: 'PATCH' });
    const res = mockResponse();
    const deps = depsWithBody({ status: 'failed', error: 'timeout exceeded' });

    await handleTaskBoard(req, res, deps);
    const body = parseJsonBody<{ card: TaskCard }>(res);

    expect(body.card.status).toBe('failed');
    expect(body.card.error).toBe('timeout exceeded');
    expect(body.card.runtimeMs).toBeGreaterThan(0);
  });
});

// ─── Complete task data — all fields present ─────────────────────────────────

describe('Full card data round-trip', () => {
  it('creates and retrieves a fully-populated card', async () => {
    // Create
    const createReq = mockRequest({ url: '/api/task-board', method: 'POST' });
    const createRes = mockResponse();
    const createDeps = depsWithBody({
      title: 'Deploy v2.1 to staging',
      description: 'Full deployment with migration scripts',
      priority: 'high',
      agentId: 'sentinel',
    });

    await handleTaskBoard(createReq, createRes, createDeps);
    const created = parseJsonBody<{ card: TaskCard }>(createRes);
    expect(createRes._statusCode).toBe(201);
    const cardId = created.card.id;

    // Transition: backlog → queued → running → done
    for (const step of [
      { status: 'queued' },
      { status: 'running' },
      { status: 'done', resultSummary: 'Deployed OK', tokensUsed: 12345, costEstimate: 0.87 },
    ]) {
      const patchReq = mockRequest({ url: `/api/task-board/${cardId}`, method: 'PATCH' });
      const patchRes = mockResponse();
      await handleTaskBoard(patchReq, patchRes, depsWithBody(step));
      expect(patchRes._statusCode).toBe(200);
    }

    // Retrieve
    const getReq = mockRequest({ url: `/api/task-board/${cardId}`, method: 'GET' });
    const getRes = mockResponse();
    await handleTaskBoard(getReq, getRes, createDeps);

    const final = parseJsonBody<{ card: TaskCard }>(getRes);
    expect(final.card.title).toBe('Deploy v2.1 to staging');
    expect(final.card.description).toBe('Full deployment with migration scripts');
    expect(final.card.priority).toBe('high');
    expect(final.card.agentId).toBe('sentinel');
    expect(final.card.status).toBe('done');
    expect(final.card.createdAt).toBeTruthy();
    expect(final.card.queuedAt).toBeTruthy();
    expect(final.card.startedAt).toBeTruthy();
    expect(final.card.completedAt).toBeTruthy();
    expect(final.card.resultSummary).toBe('Deployed OK');
    expect(final.card.tokensUsed).toBe(12345);
    expect(final.card.costEstimate).toBe(0.87);
    expect(final.card.runtimeMs).toBeGreaterThanOrEqual(0);
  });
});

// ─── XSS safety ──────────────────────────────────────────────────────────────
// The frontend uses textContent for all user-provided strings (via tbEsc / .textContent).
// These backend tests ensure that stored data with XSS vectors round-trips correctly
// without being altered — the rendering safety is on the client side.

describe('XSS safety — data integrity', () => {
  const xssVectors = [
    '<script>alert("xss")</script>',
    '<img src=x onerror=alert(1)>',
    '"><svg onload=alert(1)>',
    "'; DROP TABLE tasks; --",
    '<div onmouseover="steal()">hover me</div>',
    '{{constructor.constructor("return this")()}}',
    'javascript:alert(document.cookie)',
  ];

  for (const vector of xssVectors) {
    it(`stores and returns XSS vector safely: ${vector.slice(0, 40)}…`, async () => {
      const createReq = mockRequest({ url: '/api/task-board', method: 'POST' });
      const createRes = mockResponse();
      const deps = depsWithBody({
        title: vector.slice(0, 200),
        description: vector,
      });

      await handleTaskBoard(createReq, createRes, deps);
      const created = parseJsonBody<{ card: TaskCard }>(createRes);
      expect(createRes._statusCode).toBe(201);

      // Title should be stored exactly as provided (client escapes on render)
      expect(created.card.title).toBe(vector.slice(0, 200));
      expect(created.card.description).toBe(vector);

      // Also test in resultSummary and error via PATCH
      const cardId = created.card.id;
      const patchReq = mockRequest({ url: `/api/task-board/${cardId}`, method: 'PATCH' });
      const patchRes = mockResponse();
      await handleTaskBoard(patchReq, patchRes, depsWithBody({
        resultSummary: vector,
        error: vector,
      }));

      const patched = parseJsonBody<{ card: TaskCard }>(patchRes);
      expect(patched.card.resultSummary).toBe(vector);
      expect(patched.card.error).toBe(vector);
    });
  }
});

// ─── Edge cases ──────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('handles card with all timestamps but no metrics', async () => {
    const now = Date.now();
    const card = makeSampleCard({
      id: 'edge-1',
      status: 'done',
      createdAt: now - 60000,
      queuedAt: now - 50000,
      startedAt: now - 40000,
      completedAt: now,
      tokensUsed: null,
      costEstimate: null,
      runtimeMs: null,
    });
    seedTasks([card]);

    const req = mockRequest({ url: '/api/task-board/edge-1', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const body = parseJsonBody<{ card: TaskCard }>(res);
    expect(body.card.tokensUsed).toBeNull();
    expect(body.card.costEstimate).toBeNull();
    // runtimeMs is null because it was stored as null (auto-compute only happens on PATCH)
    expect(body.card.runtimeMs).toBeNull();
  });

  it('ignores non-numeric costEstimate in PATCH', async () => {
    const card = makeSampleCard({ id: 'badcost-1' });
    seedTasks([card]);

    const req = mockRequest({ url: '/api/task-board/badcost-1', method: 'PATCH' });
    const res = mockResponse();
    await handleTaskBoard(req, res, depsWithBody({ costEstimate: 'not-a-number' }));

    const body = parseJsonBody<{ card: TaskCard }>(res);
    expect(body.card.costEstimate).toBeNull();
  });

  it('ignores non-numeric runtimeMs in PATCH', async () => {
    const card = makeSampleCard({ id: 'badrt-1' });
    seedTasks([card]);

    const req = mockRequest({ url: '/api/task-board/badrt-1', method: 'PATCH' });
    const res = mockResponse();
    await handleTaskBoard(req, res, depsWithBody({ runtimeMs: 'invalid' }));

    const body = parseJsonBody<{ card: TaskCard }>(res);
    expect(body.card.runtimeMs).toBeNull();
  });

  it('list endpoint includes new fields', async () => {
    const card = makeSampleCard({
      id: 'list-1',
      costEstimate: 2.5,
      runtimeMs: 999,
    });
    seedTasks([card]);

    const req = mockRequest({ url: '/api/task-board', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const body = parseJsonBody<{ tasks: TaskCard[] }>(res);
    expect(body.tasks[0].costEstimate).toBe(2.5);
    expect(body.tasks[0].runtimeMs).toBe(999);
  });
});

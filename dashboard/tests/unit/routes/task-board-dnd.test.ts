/**
 * Task Board drag-and-drop transition tests — Issue #219.
 *
 * Validates that:
 * 1. Client-side DnD transition mapping mirrors backend state machine rules.
 * 2. PATCH transition calls succeed for valid column moves.
 * 3. Invalid transitions are rejected with proper error messages.
 * 4. Rollback scenario: after a rejected transition the card remains in its
 *    original column (re-fetching from server state).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import {
  handleTaskBoard,
  loadTasks,
  isValidTransition,
} from '../../../server/routes/task-board.js';
import type { TaskBoardDeps, TaskCard, TaskStatus } from '../../../server/types.js';

const testDataDir = path.join('/tmp', 'test-tb-dnd-' + process.pid);

// ─── Client-side transition map (mirrors the JS in index.html) ──────────────
// This is the authoritative mapping used by tbCanDrop() in the browser.
const CLIENT_TRANSITIONS: Record<string, string[]> = {
  backlog: ['queued', 'done'],
  queued: ['running', 'backlog', 'done'],
  running: ['done', 'failed'],
  done: ['backlog'],
  failed: ['backlog', 'queued'],
};

// All valid statuses
const ALL_STATUSES: TaskStatus[] = ['backlog', 'queued', 'running', 'done', 'failed'];

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
    id: 'dnd-' + Math.random().toString(36).slice(2, 8),
    agentId: 'synth',
    title: 'DnD test task',
    description: 'Drag and drop test',
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

// ─── 1. Client ↔ Server transition map parity ───────────────────────────────

describe('DnD transition mapping parity', () => {
  it('client TB_TRANSITIONS matches server isValidTransition for all status pairs', () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        if (from === to) continue; // same-column drop is always skipped
        const clientAllows = (CLIENT_TRANSITIONS[from] || []).includes(to);
        const serverAllows = isValidTransition(from, to);
        expect(clientAllows).toBe(serverAllows);
      }
    }
  });

  it('no self-transitions are allowed', () => {
    for (const status of ALL_STATUSES) {
      // Client: tbCanDrop returns false for same-column
      // Server: isValidTransition may technically return false too since
      // TRANSITIONS[x] never includes x
      const clientAllows = (CLIENT_TRANSITIONS[status] || []).includes(status);
      expect(clientAllows).toBe(false);
    }
  });

  it('every client-allowed transition has at least one valid path', () => {
    // Ensure we have non-empty transition lists
    for (const from of ALL_STATUSES) {
      const targets = CLIENT_TRANSITIONS[from] || [];
      expect(targets.length).toBeGreaterThan(0);
    }
  });
});

// ─── 2. PATCH transition API calls (simulating drag-drop outcomes) ──────────

describe('DnD → PATCH transition API integration', () => {
  // Valid transitions (happy path)
  const validMoves: Array<{ from: TaskStatus; to: TaskStatus; label: string }> = [
    { from: 'backlog', to: 'queued', label: 'backlog → queued' },
    { from: 'backlog', to: 'done', label: 'backlog → done (skip)' },
    { from: 'queued', to: 'running', label: 'queued → running' },
    { from: 'queued', to: 'backlog', label: 'queued → backlog (revert)' },
    { from: 'queued', to: 'done', label: 'queued → done (skip)' },
    { from: 'running', to: 'done', label: 'running → done' },
    { from: 'running', to: 'failed', label: 'running → failed' },
    { from: 'done', to: 'backlog', label: 'done → backlog (re-open)' },
    { from: 'failed', to: 'backlog', label: 'failed → backlog (retry)' },
    { from: 'failed', to: 'queued', label: 'failed → queued (re-queue)' },
  ];

  for (const { from, to, label } of validMoves) {
    it(`accepts: ${label}`, async () => {
      const card = makeSampleCard({
        id: `valid-${from}-${to}`,
        status: from,
        startedAt: from === 'running' ? Date.now() - 5000 : null,
        queuedAt: ['queued', 'running'].includes(from) ? Date.now() - 10000 : null,
      });
      seedTasks([card]);

      const emitted: Array<{ type: string; card: TaskCard }> = [];
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: `/api/task-board/${card.id}`, method: 'PATCH' }),
        res,
        depsWithBody({ status: to }, {
          emitEvent: (type, c) => { emitted.push({ type, card: c }); },
        }),
      );

      expect(res._statusCode).toBe(200);
      const body = parseJsonBody<{ card: TaskCard }>(res);
      expect(body.card.status).toBe(to);

      // Should emit task:updated event
      expect(emitted).toHaveLength(1);
      expect(emitted[0].type).toBe('task:updated');
      expect(emitted[0].card.status).toBe(to);
    });
  }

  // Invalid transitions (rejection)
  const invalidMoves: Array<{ from: TaskStatus; to: TaskStatus; label: string }> = [
    { from: 'backlog', to: 'running', label: 'backlog → running (skip queued)' },
    { from: 'backlog', to: 'failed', label: 'backlog → failed' },
    { from: 'queued', to: 'failed', label: 'queued → failed' },
    { from: 'running', to: 'queued', label: 'running → queued (backwards)' },
    { from: 'running', to: 'backlog', label: 'running → backlog (backwards)' },
    { from: 'done', to: 'running', label: 'done → running' },
    { from: 'done', to: 'queued', label: 'done → queued' },
    { from: 'done', to: 'failed', label: 'done → failed' },
    { from: 'failed', to: 'running', label: 'failed → running (skip queue)' },
    { from: 'failed', to: 'done', label: 'failed → done (skip)' },
  ];

  for (const { from, to, label } of invalidMoves) {
    it(`rejects: ${label}`, async () => {
      const card = makeSampleCard({ id: `invalid-${from}-${to}`, status: from });
      seedTasks([card]);

      const emitted: Array<{ type: string }> = [];
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: `/api/task-board/${card.id}`, method: 'PATCH' }),
        res,
        depsWithBody({ status: to }, {
          emitEvent: (type) => { emitted.push({ type }); },
        }),
      );

      expect(res._statusCode).toBe(400);
      const body = parseJsonBody<{ error: string }>(res);
      expect(body.error).toContain('invalid transition');
      expect(body.error).toContain(from);
      expect(body.error).toContain(to);

      // No event emitted for rejected transitions
      expect(emitted).toHaveLength(0);

      // Card should remain in original state on disk
      const persisted = loadTasks(testDataDir);
      expect(persisted[0].status).toBe(from);
    });
  }
});

// ─── 3. Error rollback handling ──────────────────────────────────────────────

describe('DnD error rollback', () => {
  it('card remains in original column after rejected transition (state integrity)', async () => {
    const card = makeSampleCard({
      id: 'rollback-1',
      status: 'backlog',
      title: 'Should stay in backlog',
    });
    seedTasks([card]);

    // Attempt invalid transition: backlog → running
    const res = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board/rollback-1', method: 'PATCH' }),
      res,
      depsWithBody({ status: 'running' }),
    );
    expect(res._statusCode).toBe(400);

    // Verify card is untouched
    const tasks = loadTasks(testDataDir);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe('backlog');
    expect(tasks[0].title).toBe('Should stay in backlog');
  });

  it('card data is unchanged after rejected transition (no partial updates)', async () => {
    const card = makeSampleCard({
      id: 'rollback-2',
      status: 'done',
      title: 'Completed task',
      resultSummary: 'Success!',
      tokensUsed: 500,
      completedAt: Date.now() - 60000,
    });
    seedTasks([card]);

    // Attempt invalid: done → running
    const res = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board/rollback-2', method: 'PATCH' }),
      res,
      depsWithBody({ status: 'running' }),
    );
    expect(res._statusCode).toBe(400);

    // Verify all fields are intact
    const tasks = loadTasks(testDataDir);
    expect(tasks[0].resultSummary).toBe('Success!');
    expect(tasks[0].tokensUsed).toBe(500);
    expect(tasks[0].completedAt).toBe(card.completedAt);
    expect(tasks[0].status).toBe('done');
  });

  it('other cards are unaffected by a rejected transition', async () => {
    const cards = [
      makeSampleCard({ id: 'safe-1', status: 'running', title: 'Running fine' }),
      makeSampleCard({ id: 'drag-target', status: 'backlog', title: 'Target card' }),
      makeSampleCard({ id: 'safe-2', status: 'done', title: 'Already done' }),
    ];
    seedTasks(cards);

    // Reject invalid drag: backlog → running
    const res = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board/drag-target', method: 'PATCH' }),
      res,
      depsWithBody({ status: 'running' }),
    );
    expect(res._statusCode).toBe(400);

    // All cards intact
    const tasks = loadTasks(testDataDir);
    expect(tasks).toHaveLength(3);
    expect(tasks.find(t => t.id === 'safe-1')!.status).toBe('running');
    expect(tasks.find(t => t.id === 'drag-target')!.status).toBe('backlog');
    expect(tasks.find(t => t.id === 'safe-2')!.status).toBe('done');
  });

  it('transition to nonexistent card returns 404', async () => {
    seedTasks([makeSampleCard({ id: 'exists', status: 'backlog' })]);

    const res = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board/ghost-card', method: 'PATCH' }),
      res,
      depsWithBody({ status: 'queued' }),
    );
    expect(res._statusCode).toBe(404);
  });
});

// ─── 4. Timestamp bookkeeping on DnD transitions ────────────────────────────

describe('DnD transition timestamps', () => {
  it('sets queuedAt when dragged to queued', async () => {
    const card = makeSampleCard({ id: 'ts-1', status: 'backlog', queuedAt: null });
    seedTasks([card]);

    const res = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board/ts-1', method: 'PATCH' }),
      res,
      depsWithBody({ status: 'queued' }),
    );

    const body = parseJsonBody<{ card: TaskCard }>(res);
    expect(body.card.queuedAt).toBeTruthy();
    expect(typeof body.card.queuedAt).toBe('number');
  });

  it('sets startedAt when dragged to running', async () => {
    const card = makeSampleCard({ id: 'ts-2', status: 'queued', startedAt: null });
    seedTasks([card]);

    const res = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board/ts-2', method: 'PATCH' }),
      res,
      depsWithBody({ status: 'running' }),
    );

    const body = parseJsonBody<{ card: TaskCard }>(res);
    expect(body.card.startedAt).toBeTruthy();
  });

  it('sets completedAt when dragged to done', async () => {
    const card = makeSampleCard({
      id: 'ts-3',
      status: 'running',
      startedAt: Date.now() - 10000,
      completedAt: null,
    });
    seedTasks([card]);

    const res = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board/ts-3', method: 'PATCH' }),
      res,
      depsWithBody({ status: 'done' }),
    );

    const body = parseJsonBody<{ card: TaskCard }>(res);
    expect(body.card.completedAt).toBeTruthy();
  });

  it('sets completedAt when dragged to failed', async () => {
    const card = makeSampleCard({
      id: 'ts-4',
      status: 'running',
      startedAt: Date.now() - 5000,
    });
    seedTasks([card]);

    const res = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board/ts-4', method: 'PATCH' }),
      res,
      depsWithBody({ status: 'failed' }),
    );

    const body = parseJsonBody<{ card: TaskCard }>(res);
    expect(body.card.completedAt).toBeTruthy();
  });
});

// ─── 5. Rapid sequential DnD transitions ────────────────────────────────────

describe('DnD rapid sequential transitions', () => {
  it('handles rapid backlog → queued → running → done', async () => {
    const card = makeSampleCard({ id: 'rapid-1', status: 'backlog' });
    seedTasks([card]);

    // backlog → queued
    const r1 = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board/rapid-1', method: 'PATCH' }),
      r1,
      depsWithBody({ status: 'queued' }),
    );
    expect(parseJsonBody<{ card: TaskCard }>(r1).card.status).toBe('queued');

    // queued → running
    const r2 = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board/rapid-1', method: 'PATCH' }),
      r2,
      depsWithBody({ status: 'running' }),
    );
    expect(parseJsonBody<{ card: TaskCard }>(r2).card.status).toBe('running');

    // running → done
    const r3 = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board/rapid-1', method: 'PATCH' }),
      r3,
      depsWithBody({ status: 'done' }),
    );
    expect(parseJsonBody<{ card: TaskCard }>(r3).card.status).toBe('done');

    // Verify final persisted state
    const tasks = loadTasks(testDataDir);
    expect(tasks[0].status).toBe('done');
    expect(tasks[0].queuedAt).toBeTruthy();
    expect(tasks[0].startedAt).toBeTruthy();
    expect(tasks[0].completedAt).toBeTruthy();
  });

  it('handles retry cycle: running → failed → backlog → queued → running', async () => {
    const card = makeSampleCard({
      id: 'rapid-2',
      status: 'running',
      startedAt: Date.now() - 5000,
    });
    seedTasks([card]);

    const transitions: TaskStatus[] = ['failed', 'backlog', 'queued', 'running'];
    for (const next of transitions) {
      const r = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/rapid-2', method: 'PATCH' }),
        r,
        depsWithBody({ status: next }),
      );
      expect(r._statusCode).toBe(200);
      expect(parseJsonBody<{ card: TaskCard }>(r).card.status).toBe(next);
    }

    const tasks = loadTasks(testDataDir);
    expect(tasks[0].status).toBe('running');
  });
});

// ─── 6. Summary counts reflect DnD moves ────────────────────────────────────

describe('DnD column count updates', () => {
  it('summary counts change correctly after a drag transition', async () => {
    seedTasks([
      makeSampleCard({ id: 's1', status: 'backlog' }),
      makeSampleCard({ id: 's2', status: 'backlog' }),
      makeSampleCard({ id: 's3', status: 'running', startedAt: Date.now() }),
    ]);

    // Drag s1: backlog → queued
    const r1 = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board/s1', method: 'PATCH' }),
      r1,
      depsWithBody({ status: 'queued' }),
    );
    expect(r1._statusCode).toBe(200);

    // Check summary
    const sumRes = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board/summary' }),
      sumRes,
      createDeps(),
    );
    const sum = parseJsonBody<{ columns: Record<string, number>; total: number }>(sumRes);
    expect(sum.total).toBe(3);
    expect(sum.columns.backlog).toBe(1);  // was 2, now 1
    expect(sum.columns.queued).toBe(1);   // was 0, now 1
    expect(sum.columns.running).toBe(1);  // unchanged
  });
});

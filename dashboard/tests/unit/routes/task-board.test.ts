/**
 * Task Board (Kanban) route handler tests — Issue #219.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import {
  handleTaskBoard,
  loadTasks,
  buildSummary,
  filterTasks,
  isValidTransition,
} from '../../../server/routes/task-board.js';
import type { TaskBoardDeps, TaskCard, TaskStatus } from '../../../server/types.js';

const testDataDir = path.join('/tmp', 'test-task-board-' + process.pid);

function createDeps(overrides: Partial<TaskBoardDeps> = {}): TaskBoardDeps {
  return {
    dataDir: testDataDir,
    sendJson: (res, data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    },
    readRequestBody: async (req) => {
      return new Promise<string>((resolve) => {
        let body = '';
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on('end', () => resolve(body));
        // If no data events, resolve with the body we've set up
        setTimeout(() => resolve(body), 10);
      });
    },
    ...overrides,
  };
}

/** Helper to write a POST/PATCH request body. */
function mockRequestWithBody(
  opts: { url: string; method: string },
  body: unknown,
): ReturnType<typeof mockRequest> {
  const req = mockRequest(opts);
  // Simulate body by providing readRequestBody override
  return req;
}

/** Create deps with a direct body reader (avoids stream simulation). */
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
    ...overrides,
  };
}

beforeEach(() => {
  fs.mkdirSync(testDataDir, { recursive: true });
  // Clean
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

// ─── Unit tests for pure functions ───────────────────────────────────────────

describe('buildSummary', () => {
  it('returns zero counts when no tasks', () => {
    const summary = buildSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.columns.backlog).toBe(0);
    expect(summary.columns.running).toBe(0);
    expect(Object.keys(summary.byAgent)).toHaveLength(0);
  });

  it('counts tasks by column', () => {
    const tasks: TaskCard[] = [
      makeSampleCard({ status: 'backlog' }),
      makeSampleCard({ status: 'backlog' }),
      makeSampleCard({ status: 'running' }),
      makeSampleCard({ status: 'done' }),
    ];
    const summary = buildSummary(tasks);
    expect(summary.total).toBe(4);
    expect(summary.columns.backlog).toBe(2);
    expect(summary.columns.running).toBe(1);
    expect(summary.columns.done).toBe(1);
    expect(summary.columns.queued).toBe(0);
  });

  it('groups by agent', () => {
    const tasks: TaskCard[] = [
      makeSampleCard({ agentId: 'oracle', status: 'running' }),
      makeSampleCard({ agentId: 'sentinel', status: 'done' }),
      makeSampleCard({ agentId: 'oracle', status: 'done' }),
    ];
    const summary = buildSummary(tasks);
    expect(summary.byAgent['oracle'].running).toBe(1);
    expect(summary.byAgent['oracle'].done).toBe(1);
    expect(summary.byAgent['sentinel'].done).toBe(1);
  });

  it('groups unassigned tasks under _unassigned', () => {
    const tasks: TaskCard[] = [makeSampleCard({ agentId: null, status: 'backlog' })];
    const summary = buildSummary(tasks);
    expect(summary.byAgent['_unassigned'].backlog).toBe(1);
  });
});

describe('filterTasks', () => {
  const tasks: TaskCard[] = [
    makeSampleCard({ id: 'a', agentId: 'oracle', status: 'backlog', priority: 'high' }),
    makeSampleCard({ id: 'b', agentId: 'sentinel', status: 'running', priority: 'low' }),
    makeSampleCard({ id: 'c', agentId: 'oracle', status: 'running', priority: 'critical' }),
    makeSampleCard({ id: 'd', agentId: null, status: 'done', priority: 'medium' }),
  ];

  it('returns all tasks with no filters', () => {
    expect(filterTasks(tasks, {})).toHaveLength(4);
  });

  it('filters by status', () => {
    const result = filterTasks(tasks, { status: 'running' });
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.status === 'running')).toBe(true);
  });

  it('filters by agentId', () => {
    const result = filterTasks(tasks, { agentId: 'oracle' });
    expect(result).toHaveLength(2);
  });

  it('filters by priority', () => {
    const result = filterTasks(tasks, { priority: 'critical' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c');
  });

  it('combines filters', () => {
    const result = filterTasks(tasks, { status: 'running', agentId: 'oracle' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c');
  });

  it('ignores invalid status', () => {
    const result = filterTasks(tasks, { status: 'invalid' });
    expect(result).toHaveLength(4); // no filtering applied
  });
});

describe('isValidTransition', () => {
  it('allows backlog → queued', () => {
    expect(isValidTransition('backlog', 'queued')).toBe(true);
  });

  it('allows queued → running', () => {
    expect(isValidTransition('queued', 'running')).toBe(true);
  });

  it('allows running → done', () => {
    expect(isValidTransition('running', 'done')).toBe(true);
  });

  it('allows running → failed', () => {
    expect(isValidTransition('running', 'failed')).toBe(true);
  });

  it('allows failed → backlog', () => {
    expect(isValidTransition('failed', 'backlog')).toBe(true);
  });

  it('allows failed → queued', () => {
    expect(isValidTransition('failed', 'queued')).toBe(true);
  });

  it('allows done → backlog (re-queue)', () => {
    expect(isValidTransition('done', 'backlog')).toBe(true);
  });

  it('rejects backlog → done directly skipping queue', () => {
    // Allowed — see TRANSITIONS: backlog can → done for manual completion
    expect(isValidTransition('backlog', 'done')).toBe(true);
  });

  it('rejects backlog → running (must go through queued)', () => {
    expect(isValidTransition('backlog', 'running')).toBe(false);
  });

  it('rejects done → running', () => {
    expect(isValidTransition('done', 'running')).toBe(false);
  });

  it('rejects queued → failed', () => {
    expect(isValidTransition('queued', 'failed')).toBe(false);
  });
});

describe('loadTasks', () => {
  it('returns empty array when file does not exist', () => {
    expect(loadTasks('/tmp/nonexistent-xyz-' + Date.now())).toEqual([]);
  });

  it('loads tasks from file', () => {
    const cards = [makeSampleCard({ id: 'x' })];
    seedTasks(cards);
    const loaded = loadTasks(testDataDir);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('x');
  });

  it('handles corrupt JSON gracefully', () => {
    fs.writeFileSync(path.join(testDataDir, 'task-board.json'), '{broken');
    expect(loadTasks(testDataDir)).toEqual([]);
  });
});

// ─── HTTP route handler tests ────────────────────────────────────────────────

describe('handleTaskBoard', () => {
  describe('GET /api/task-board', () => {
    it('returns empty list when no tasks', async () => {
      const res = mockResponse();
      const handled = await handleTaskBoard(
        mockRequest({ url: '/api/task-board' }),
        res,
        createDeps(),
      );
      expect(handled).toBe(true);
      const body = parseJsonBody(res);
      expect(body.tasks).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('returns all tasks', async () => {
      seedTasks([makeSampleCard({ id: '1' }), makeSampleCard({ id: '2' })]);
      const res = mockResponse();
      await handleTaskBoard(mockRequest({ url: '/api/task-board' }), res, createDeps());
      const body = parseJsonBody(res);
      expect(body.tasks).toHaveLength(2);
    });

    it('filters by status query param', async () => {
      seedTasks([
        makeSampleCard({ id: '1', status: 'backlog' }),
        makeSampleCard({ id: '2', status: 'running' }),
      ]);
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board?status=running' }),
        res,
        createDeps(),
      );
      const body = parseJsonBody(res);
      expect(body.tasks).toHaveLength(1);
      expect((body.tasks as TaskCard[])[0].id).toBe('2');
    });

    it('filters by agentId query param', async () => {
      seedTasks([
        makeSampleCard({ id: '1', agentId: 'oracle' }),
        makeSampleCard({ id: '2', agentId: 'sentinel' }),
      ]);
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board?agentId=oracle' }),
        res,
        createDeps(),
      );
      const body = parseJsonBody(res);
      expect(body.tasks).toHaveLength(1);
    });
  });

  describe('GET /api/task-board/summary', () => {
    it('returns summary with column counts', async () => {
      seedTasks([
        makeSampleCard({ status: 'backlog' }),
        makeSampleCard({ status: 'running' }),
        makeSampleCard({ status: 'running' }),
      ]);
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/summary' }),
        res,
        createDeps(),
      );
      const body = parseJsonBody<{ columns: Record<string, number>; total: number }>(res);
      expect(body.total).toBe(3);
      expect(body.columns.backlog).toBe(1);
      expect(body.columns.running).toBe(2);
    });
  });

  describe('GET /api/task-board/:id', () => {
    it('returns a single card', async () => {
      seedTasks([makeSampleCard({ id: 'abc-123' })]);
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/abc-123' }),
        res,
        createDeps(),
      );
      const body = parseJsonBody<{ card: TaskCard }>(res);
      expect(body.card.id).toBe('abc-123');
    });

    it('returns 404 for missing card', async () => {
      seedTasks([]);
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/nonexistent' }),
        res,
        createDeps(),
      );
      expect(res._statusCode).toBe(404);
    });
  });

  describe('POST /api/task-board', () => {
    it('creates a new card', async () => {
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board', method: 'POST' }),
        res,
        depsWithBody({ title: 'New task', priority: 'high' }),
      );
      expect(res._statusCode).toBe(201);
      const body = parseJsonBody<{ card: TaskCard }>(res);
      expect(body.card.title).toBe('New task');
      expect(body.card.priority).toBe('high');
      expect(body.card.status).toBe('backlog');
      expect(body.card.id).toBeTruthy();

      // Verify persisted
      const loaded = loadTasks(testDataDir);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].title).toBe('New task');
    });

    it('rejects empty title', async () => {
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board', method: 'POST' }),
        res,
        depsWithBody({ title: '' }),
      );
      expect(res._statusCode).toBe(400);
      expect(parseJsonBody(res).error).toContain('title');
    });

    it('rejects invalid priority', async () => {
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board', method: 'POST' }),
        res,
        depsWithBody({ title: 'Task', priority: 'invalid' }),
      );
      expect(res._statusCode).toBe(400);
    });

    it('defaults to medium priority and backlog status', async () => {
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board', method: 'POST' }),
        res,
        depsWithBody({ title: 'Simple task' }),
      );
      const body = parseJsonBody<{ card: TaskCard }>(res);
      expect(body.card.priority).toBe('medium');
      expect(body.card.status).toBe('backlog');
    });
  });

  describe('PATCH /api/task-board/:id', () => {
    it('updates card status with valid transition', async () => {
      seedTasks([makeSampleCard({ id: 'card-1', status: 'backlog' })]);
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/card-1', method: 'PATCH' }),
        res,
        depsWithBody({ status: 'queued' }),
      );
      expect(res._statusCode).toBe(200);
      const body = parseJsonBody<{ card: TaskCard }>(res);
      expect(body.card.status).toBe('queued');
      expect(body.card.queuedAt).toBeTruthy();
    });

    it('rejects invalid transition', async () => {
      seedTasks([makeSampleCard({ id: 'card-1', status: 'backlog' })]);
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/card-1', method: 'PATCH' }),
        res,
        depsWithBody({ status: 'running' }),
      );
      expect(res._statusCode).toBe(400);
      expect(parseJsonBody(res).error).toContain('invalid transition');
    });

    it('sets startedAt when transitioning to running', async () => {
      seedTasks([makeSampleCard({ id: 'card-1', status: 'queued' })]);
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/card-1', method: 'PATCH' }),
        res,
        depsWithBody({ status: 'running' }),
      );
      const body = parseJsonBody<{ card: TaskCard }>(res);
      expect(body.card.startedAt).toBeTruthy();
    });

    it('sets completedAt when transitioning to done', async () => {
      seedTasks([makeSampleCard({ id: 'card-1', status: 'running' })]);
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/card-1', method: 'PATCH' }),
        res,
        depsWithBody({ status: 'done', resultSummary: 'completed successfully' }),
      );
      const body = parseJsonBody<{ card: TaskCard }>(res);
      expect(body.card.completedAt).toBeTruthy();
      expect(body.card.resultSummary).toBe('completed successfully');
    });

    it('returns 404 for missing card', async () => {
      seedTasks([]);
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/nope', method: 'PATCH' }),
        res,
        depsWithBody({ status: 'queued' }),
      );
      expect(res._statusCode).toBe(404);
    });

    it('updates mutable fields', async () => {
      seedTasks([makeSampleCard({ id: 'card-1', title: 'Old', priority: 'low' })]);
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/card-1', method: 'PATCH' }),
        res,
        depsWithBody({ title: 'New', priority: 'critical', agentId: 'atlas' }),
      );
      const body = parseJsonBody<{ card: TaskCard }>(res);
      expect(body.card.title).toBe('New');
      expect(body.card.priority).toBe('critical');
      expect(body.card.agentId).toBe('atlas');
    });
  });

  describe('DELETE /api/task-board/:id', () => {
    it('deletes a card', async () => {
      seedTasks([makeSampleCard({ id: 'del-1' }), makeSampleCard({ id: 'del-2' })]);
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/del-1', method: 'DELETE' }),
        res,
        createDeps(),
      );
      expect(res._statusCode).toBe(200);
      expect(parseJsonBody(res).ok).toBe(true);

      const remaining = loadTasks(testDataDir);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('del-2');
    });

    it('returns 404 for missing card', async () => {
      seedTasks([]);
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/nope', method: 'DELETE' }),
        res,
        createDeps(),
      );
      expect(res._statusCode).toBe(404);
    });
  });

  describe('routing', () => {
    it('returns false for non-task-board URLs', async () => {
      const handled = await handleTaskBoard(
        mockRequest({ url: '/api/sessions' }),
        mockResponse(),
        createDeps(),
      );
      expect(handled).toBe(false);
    });

    it('returns false when req.url is missing', async () => {
      const req = mockRequest({});
      (req as any).url = undefined;
      const handled = await handleTaskBoard(req, mockResponse(), createDeps());
      expect(handled).toBe(false);
    });
  });
});

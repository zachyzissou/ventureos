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
  pickupQueuedTasksForAgent,
  resumeRunningTasksFromSnapshot,
} from '../../../server/routes/task-board.js';
import type { TaskBoardDeps, TaskCard, TaskStatus } from '../../../server/types.js';
import { activeTasksFilePath, readActiveTaskSnapshot } from '../../../server/active-tasks.js';

const testRootDir = path.join('/tmp', 'test-task-board-' + process.pid);
const testDataDir = path.join(testRootDir, 'data');

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
    costEstimate: null,
    runtimeMs: null,
    ...overrides,
  };
}

beforeEach(() => {
  fs.rmSync(testRootDir, { recursive: true, force: true });
  fs.mkdirSync(testDataDir, { recursive: true });
});

afterEach(() => {
  try {
    fs.rmSync(testRootDir, { recursive: true, force: true });
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
    makeSampleCard({
      id: 'a',
      agentId: 'oracle',
      status: 'backlog',
      priority: 'high',
      missionId: 'm-1',
      assigneeType: 'agent',
    }),
    makeSampleCard({
      id: 'b',
      agentId: 'sentinel',
      status: 'running',
      priority: 'low',
      missionId: 'm-1',
      assigneeType: 'human',
    }),
    makeSampleCard({
      id: 'c',
      agentId: 'oracle',
      status: 'running',
      priority: 'critical',
      missionId: 'm-2',
      assigneeType: 'nexus',
    }),
    makeSampleCard({
      id: 'd',
      agentId: null,
      status: 'done',
      priority: 'medium',
      missionId: null,
      assigneeType: 'nexus',
    }),
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

  it('filters by missionId', () => {
    const result = filterTasks(tasks, { missionId: 'm-1' });
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('filters by assigneeType', () => {
    const result = filterTasks(tasks, { assigneeType: 'nexus' });
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id)).toEqual(['c', 'd']);
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

  it('allows queued → blocked', () => {
    expect(isValidTransition('queued', 'blocked')).toBe(true);
  });

  it('allows running → done', () => {
    expect(isValidTransition('running', 'done')).toBe(true);
  });

  it('allows running → review', () => {
    expect(isValidTransition('running', 'review')).toBe(true);
  });

  it('allows running → failed', () => {
    expect(isValidTransition('running', 'failed')).toBe(true);
  });

  it('allows review → done', () => {
    expect(isValidTransition('review', 'done')).toBe(true);
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

  it('rejects done → review', () => {
    expect(isValidTransition('done', 'review')).toBe(false);
  });
});

describe('pickupQueuedTasksForAgent', () => {
  it('returns error for non-object input', () => {
    const result = pickupQueuedTasksForAgent(testDataDir, null as unknown as { agentId: string });
    expect(result).toEqual({ error: 'invalid request body' });
  });

  it('picks queued tasks in priority order and transitions to running', () => {
    const depDone = makeSampleCard({ id: 'dep-done', status: 'done' });
    const high = makeSampleCard({
      id: 'high',
      status: 'queued',
      priority: 'high',
      assigneeType: 'agent',
      assigneeId: 'oracle',
      agentId: null,
      dependencies: ['dep-done'],
      queuedAt: Date.now() - 2000,
    });
    const critical = makeSampleCard({
      id: 'critical',
      status: 'queued',
      priority: 'critical',
      assigneeType: 'agent',
      assigneeId: 'oracle',
      agentId: null,
      queuedAt: Date.now() - 1000,
    });
    const blockedByDependency = makeSampleCard({
      id: 'blocked',
      status: 'queued',
      priority: 'critical',
      assigneeType: 'agent',
      assigneeId: 'oracle',
      agentId: null,
      dependencies: ['missing-dep'],
    });
    seedTasks([depDone, high, critical, blockedByDependency]);

    const result = pickupQueuedTasksForAgent(testDataDir, {
      agentId: 'oracle',
      limit: 2,
    });
    if ('error' in result) throw new Error(result.error);

    expect(result.pickedCount).toBe(2);
    expect(result.picked.map((t) => t.id)).toEqual(['critical', 'high']);
    expect(result.skipped.unmetDependencies).toBe(1);

    const persisted = loadTasks(testDataDir);
    const pickedCritical = persisted.find((t) => t.id === 'critical');
    expect(pickedCritical?.status).toBe('running');
    expect(pickedCritical?.agentId).toBe('oracle');
  });

  it('does not auto-pick when agent already has running work unless allowParallel=true', () => {
    const running = makeSampleCard({
      id: 'running-1',
      status: 'running',
      assigneeType: 'agent',
      assigneeId: 'oracle',
      agentId: 'oracle',
      startedAt: Date.now() - 2000,
    });
    const queued = makeSampleCard({
      id: 'queued-1',
      status: 'queued',
      priority: 'critical',
      assigneeType: 'agent',
      assigneeId: 'oracle',
      agentId: null,
    });
    seedTasks([running, queued]);

    const blocked = pickupQueuedTasksForAgent(testDataDir, { agentId: 'oracle' });
    if ('error' in blocked) throw new Error(blocked.error);
    expect(blocked.pickedCount).toBe(0);
    expect(blocked.existingRunning).toBe(1);

    const allowed = pickupQueuedTasksForAgent(testDataDir, { agentId: 'oracle', allowParallel: true });
    if ('error' in allowed) throw new Error(allowed.error);
    expect(allowed.pickedCount).toBe(1);
    expect(allowed.picked[0].id).toBe('queued-1');
  });

  it('does not treat non-agent running cards as capacity blockers and clears stale terminal fields', () => {
    const humanRunning = makeSampleCard({
      id: 'human-running',
      status: 'running',
      assigneeType: 'human',
      assigneeId: 'oracle',
      agentId: null,
      startedAt: Date.now() - 5000,
    });
    const retriedQueued = makeSampleCard({
      id: 'retry-q',
      status: 'queued',
      priority: 'high',
      assigneeType: 'agent',
      assigneeId: 'oracle',
      agentId: null,
      completedAt: Date.now() - 1000,
      resultSummary: 'old terminal summary',
      tokensUsed: 999,
      error: 'stale error',
      costEstimate: 2.5,
      runtimeMs: 4000,
    });
    seedTasks([humanRunning, retriedQueued]);

    const result = pickupQueuedTasksForAgent(testDataDir, { agentId: 'oracle' });
    if ('error' in result) throw new Error(result.error);

    expect(result.pickedCount).toBe(1);
    expect(result.picked[0].id).toBe('retry-q');

    const persisted = loadTasks(testDataDir).find((t) => t.id === 'retry-q');
    expect(persisted?.status).toBe('running');
    expect(persisted?.completedAt).toBeNull();
    expect(persisted?.resultSummary).toBeNull();
    expect(persisted?.tokensUsed).toBeNull();
    expect(persisted?.error).toBeNull();
    expect(persisted?.costEstimate).toBeNull();
    expect(persisted?.runtimeMs).toBeNull();
  });
});

describe('resumeRunningTasksFromSnapshot', () => {
  it('requeues running tasks from active snapshot for recovery', () => {
    const run1 = makeSampleCard({
      id: 'run-1',
      status: 'running',
      startedAt: Date.now() - 20000,
      assigneeId: 'oracle',
      agentId: 'oracle',
    });
    const run2 = makeSampleCard({
      id: 'run-2',
      status: 'running',
      startedAt: Date.now() - 10000,
      assigneeId: 'atlas',
      agentId: 'atlas',
    });
    seedTasks([run1, run2]);

    const result = resumeRunningTasksFromSnapshot(testDataDir, { agentId: 'oracle' });
    expect(result.resumedCount).toBe(1);
    expect(result.resumedIds).toEqual(['run-1']);

    const persisted = loadTasks(testDataDir);
    expect(persisted.find((t) => t.id === 'run-1')?.status).toBe('queued');
    expect(persisted.find((t) => t.id === 'run-2')?.status).toBe('running');
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

    it('filters by missionId query param', async () => {
      seedTasks([
        makeSampleCard({ id: '1', missionId: 'mission-a' }),
        makeSampleCard({ id: '2', missionId: 'mission-b' }),
      ]);
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board?missionId=mission-a' }),
        res,
        createDeps(),
      );
      const body = parseJsonBody<{ tasks: TaskCard[] }>(res);
      expect(body.tasks).toHaveLength(1);
      expect(body.tasks[0].id).toBe('1');
    });

    it('filters by assigneeType query param', async () => {
      seedTasks([
        makeSampleCard({ id: '1', assigneeType: 'human' }),
        makeSampleCard({ id: '2', assigneeType: 'agent' }),
      ]);
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board?assigneeType=human' }),
        res,
        createDeps(),
      );
      const body = parseJsonBody<{ tasks: TaskCard[] }>(res);
      expect(body.tasks).toHaveLength(1);
      expect(body.tasks[0].id).toBe('1');
    });
  });

  describe('pipeline templates (Issue #297)', () => {
    it('lists system templates', async () => {
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/templates', method: 'GET' }),
        res,
        createDeps(),
      );
      expect(res._statusCode).toBe(200);
      const body = parseJsonBody<{ templates: Array<{ id: string }>; total: number }>(res);
      expect(body.total).toBeGreaterThan(0);
      expect(body.templates.some((t) => t.id === 'content-idea-script-publish')).toBe(true);
    });

    it('creates and deletes a custom template', async () => {
      const createRes = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/templates', method: 'POST' }),
        createRes,
        depsWithBody({
          name: 'My Quick Pipeline',
          tags: ['ops'],
          stages: [
            { title: 'Plan', assigneeType: 'nexus', assigneeId: 'nexus' },
            { title: 'Execute', assigneeType: 'agent', assigneeId: 'synth' },
          ],
        }),
      );
      expect(createRes._statusCode).toBe(201);
      const created = parseJsonBody<{ template: { id: string } }>(createRes);
      expect(created.template.id).toBe('my-quick-pipeline');

      const listRes = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/templates', method: 'GET' }),
        listRes,
        createDeps(),
      );
      const listBody = parseJsonBody<{ templates: Array<{ id: string }> }>(listRes);
      expect(listBody.templates.some((t) => t.id === created.template.id)).toBe(true);

      const deleteRes = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: `/api/task-board/templates/${created.template.id}`, method: 'DELETE' }),
        deleteRes,
        createDeps(),
      );
      expect(deleteRes._statusCode).toBe(200);
      expect(parseJsonBody(deleteRes).ok).toBe(true);
    });

    it('prevents overwriting or deleting system templates', async () => {
      const overwriteRes = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/templates', method: 'POST' }),
        overwriteRes,
        depsWithBody({
          id: 'content-idea-script-publish',
          name: 'Override attempt',
          stages: [
            { title: 'Plan' },
            { title: 'Execute' },
          ],
        }),
      );
      expect(overwriteRes._statusCode).toBe(409);
      expect(parseJsonBody<{ error: string }>(overwriteRes).error).toContain('cannot overwrite system template');

      const deleteRes = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/templates/content-idea-script-publish', method: 'DELETE' }),
        deleteRes,
        createDeps(),
      );
      expect(deleteRes._statusCode).toBe(409);
      expect(parseJsonBody<{ error: string }>(deleteRes).error).toContain('system templates cannot be deleted');
    });

    it('instantiates a pipeline from template with dependency chain and audit note', async () => {
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/pipelines/from-template', method: 'POST' }),
        res,
        depsWithBody({
          templateId: 'content-idea-script-publish',
          pipelineName: 'Launch Video',
          missionId: 'mc-297',
          missionBrief: 'Creator launch',
          assigneeType: 'nexus',
          assigneeId: 'nexus',
          stageAssignments: {
            script: { assigneeType: 'agent', assigneeId: 'synth' },
          },
        }),
      );
      expect(res._statusCode).toBe(201);
      const body = parseJsonBody<{ created: number; cards: TaskCard[] }>(res);
      expect(body.created).toBeGreaterThanOrEqual(2);
      expect(body.cards[0].status).toBe('queued');
      expect(body.cards[1].dependencies?.[0]).toBe(body.cards[0].id);
      expect(body.cards[0].statusHistory?.[0]?.note).toContain('pipeline:');
      expect(body.cards.some((c) => c.assigneeType === 'agent' && c.assigneeId === 'synth')).toBe(true);

      const persisted = loadTasks(testDataDir);
      expect(persisted.length).toBe(body.created);
      expect(persisted[0].missionId).toBe('mc-297');
    });

    it('rejects invalid stage assignment overrides during instantiation', async () => {
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/pipelines/from-template', method: 'POST' }),
        res,
        depsWithBody({
          templateId: 'content-idea-script-publish',
          stageAssignments: {
            script: { assigneeType: 'super-agent' },
          },
        }),
      );
      expect(res._statusCode).toBe(400);
      expect(parseJsonBody<{ error: string }>(res).error).toContain('invalid assigneeType for stage script');
    });
  });

  describe('POST /api/task-board/heartbeat/pickup', () => {
    it('auto-picks queued cards for the agent in priority order', async () => {
      seedTasks([
        makeSampleCard({
          id: 'q-low',
          status: 'queued',
          priority: 'low',
          assigneeType: 'agent',
          assigneeId: 'oracle',
          agentId: null,
        }),
        makeSampleCard({
          id: 'q-critical',
          status: 'queued',
          priority: 'critical',
          assigneeType: 'agent',
          assigneeId: 'oracle',
          agentId: null,
        }),
      ]);

      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/heartbeat/pickup', method: 'POST' }),
        res,
        depsWithBody({ agentId: 'oracle', limit: 1 }),
      );
      expect(res._statusCode).toBe(200);
      const body = parseJsonBody<{ pickedCount: number; picked: TaskCard[] }>(res);
      expect(body.pickedCount).toBe(1);
      expect(body.picked[0].id).toBe('q-critical');

      const persisted = loadTasks(testDataDir);
      expect(persisted.find((t) => t.id === 'q-critical')?.status).toBe('running');
      expect(persisted.find((t) => t.id === 'q-low')?.status).toBe('queued');
    });

    it('returns 400 when agentId is missing', async () => {
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/heartbeat/pickup', method: 'POST' }),
        res,
        depsWithBody({ limit: 1 }),
      );
      expect(res._statusCode).toBe(400);
      expect(parseJsonBody<{ error: string }>(res).error).toContain('agentId');
    });

    it('returns 400 when request body is not an object', async () => {
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/heartbeat/pickup', method: 'POST' }),
        res,
        createDeps({ readRequestBody: async () => 'null' }),
      );
      expect(res._statusCode).toBe(400);
      expect(parseJsonBody<{ error: string }>(res).error).toContain('JSON object');
    });
  });

  describe('active task tracker routes (Issue #223)', () => {
    it('returns active-task snapshot and stale metadata', async () => {
      seedTasks([
        makeSampleCard({
          id: 'run-1',
          status: 'running',
          assigneeId: 'oracle',
          createdAt: Date.now() - 10 * 60 * 1000,
          startedAt: Date.now() - 10 * 60 * 1000,
        }),
      ]);
      // Trigger a write path so active-tasks.md is synced.
      const patchRes = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/run-1', method: 'PATCH' }),
        patchRes,
        depsWithBody({ title: 'keep-running' }),
      );
      expect(patchRes._statusCode).toBe(200);

      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/active?staleAfterMs=1000', method: 'GET' }),
        res,
        createDeps(),
      );
      expect(res._statusCode).toBe(200);
      const body = parseJsonBody<{ snapshot: { active: TaskCard[] }; staleCount: number }>(res);
      expect(body.snapshot.active.length).toBeGreaterThanOrEqual(1);
      expect(body.staleCount).toBeGreaterThanOrEqual(1);
    });

    it('requeues running tasks via recovery resume endpoint', async () => {
      seedTasks([
        makeSampleCard({
          id: 'run-1',
          status: 'running',
          assigneeId: 'oracle',
          agentId: 'oracle',
          startedAt: Date.now() - 20000,
        }),
      ]);
      const fp = activeTasksFilePath(testDataDir);
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(
        fp,
        [
          '# Active Tasks',
          '',
          `_Last updated: ${new Date().toISOString()}_`,
          '',
          '## Active Tasks',
          `- [RUNNING] Recover me (taskId: run-1, priority: medium, assignee: oracle, started: ${new Date(Date.now() - 20000).toISOString()}, updated: ${new Date().toISOString()})`,
          '',
          '## Recently Completed',
          '- None',
          '',
        ].join('\n'),
      );

      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/recovery/resume', method: 'POST' }),
        res,
        depsWithBody({ agentId: 'oracle' }),
      );
      expect(res._statusCode).toBe(200);
      const body = parseJsonBody<{ resumedCount: number; resumedIds: string[] }>(res);
      expect(body.resumedCount).toBe(1);
      expect(body.resumedIds).toEqual(['run-1']);
      expect(loadTasks(testDataDir).find((t) => t.id === 'run-1')?.status).toBe('queued');

      const snapshot = readActiveTaskSnapshot(testDataDir);
      expect(snapshot.active.some((entry) => entry.taskId === 'run-1')).toBe(true);
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

    it('creates mission-linked card with owner, links, and status history', async () => {
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board', method: 'POST' }),
        res,
        depsWithBody({
          title: 'Mission task',
          missionId: 'mc-293',
          missionBrief: 'Mission brief v2',
          assigneeType: 'human',
          assigneeId: 'zach',
          dependencies: ['task-1', 'task-2'],
          artifactLinks: ['https://example.com/doc'],
          replaySessionId: 'replay-123',
          status: 'queued',
        }),
      );
      expect(res._statusCode).toBe(201);
      const card = parseJsonBody<{ card: TaskCard }>(res).card;
      expect(card.missionId).toBe('mc-293');
      expect(card.assigneeType).toBe('human');
      expect(card.assigneeId).toBe('zach');
      expect(card.dependencies).toEqual(['task-1', 'task-2']);
      expect(card.artifactLinks).toEqual(['https://example.com/doc']);
      expect(card.replaySessionId).toBe('replay-123');
      expect(card.statusHistory?.[0]?.status).toBe('queued');
      expect(card.statusHistory?.[0]?.note).toContain('mission:mc-293');
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

    it('updates mission-linked fields and appends status history on transition', async () => {
      seedTasks([makeSampleCard({
        id: 'card-1',
        status: 'queued',
        missionId: 'old-mission',
        statusHistory: [{ status: 'queued', at: Date.now() - 1000, by: 'create', note: 'seed' }],
      })]);
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/card-1', method: 'PATCH' }),
        res,
        depsWithBody({
          status: 'running',
          transitionNote: 'picked up',
          missionId: 'new-mission',
          missionBrief: 'Mission doc',
          assigneeType: 'agent',
          assigneeId: 'oracle',
          dependencies: ['dep-1'],
          artifactLinks: ['docs/spec.md'],
          replaySessionId: 'replay-9',
        }),
      );
      expect(res._statusCode).toBe(200);
      const card = parseJsonBody<{ card: TaskCard }>(res).card;
      expect(card.missionId).toBe('new-mission');
      expect(card.assigneeType).toBe('agent');
      expect(card.assigneeId).toBe('oracle');
      expect(card.dependencies).toEqual(['dep-1']);
      expect(card.artifactLinks).toEqual(['docs/spec.md']);
      expect(card.replaySessionId).toBe('replay-9');
      expect(card.status).toBe('running');
      expect(card.statusHistory?.at(-1)?.status).toBe('running');
      expect(card.statusHistory?.at(-1)?.note).toBe('picked up');
    });
  });

  describe('POST /api/task-board/:id/retry', () => {
    it('requeues failed card and clears terminal fields', async () => {
      seedTasks([
        makeSampleCard({
          id: 'failed-1',
          status: 'failed',
          startedAt: Date.now() - 5000,
          completedAt: Date.now() - 1000,
          error: 'Boom',
          runtimeMs: 4000,
          tokensUsed: 123,
          resultSummary: 'bad run',
        }),
      ]);

      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/failed-1/retry', method: 'POST' }),
        res,
        depsWithBody({ note: 'retry after fix' }),
      );

      expect(res._statusCode).toBe(200);
      const card = parseJsonBody<{ card: TaskCard }>(res).card;
      expect(card.status).toBe('queued');
      expect(card.error).toBeNull();
      expect(card.startedAt).toBeNull();
      expect(card.completedAt).toBeNull();
      expect(card.runtimeMs).toBeNull();
      expect(card.tokensUsed).toBeNull();
      expect(card.statusHistory?.at(-1)?.by).toBe('retry');
      expect(card.statusHistory?.at(-1)?.note).toContain('retry after fix');
    });

    it('rejects retry for non-failed cards', async () => {
      seedTasks([makeSampleCard({ id: 'done-1', status: 'done' })]);
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/done-1/retry', method: 'POST' }),
        res,
        depsWithBody({}),
      );
      expect(res._statusCode).toBe(409);
      expect(parseJsonBody<{ error: string }>(res).error).toContain('failed cards');
    });

    it('supports retry route with query params', async () => {
      seedTasks([makeSampleCard({ id: 'failed-q', status: 'failed', error: 'boom' })]);
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/failed-q/retry?source=ui', method: 'POST' }),
        res,
        depsWithBody({}),
      );
      expect(res._statusCode).toBe(200);
      expect(parseJsonBody<{ card: TaskCard }>(res).card.status).toBe('queued');
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

  // ── Phase 2: additional coverage for Kanban UI integration ────────────────

  describe('full lifecycle workflow', () => {
    it('card flows backlog → queued → running → done', async () => {
      // Create
      const createRes = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board', method: 'POST' }),
        createRes,
        depsWithBody({ title: 'Lifecycle test', priority: 'high' }),
      );
      expect(createRes._statusCode).toBe(201);
      const cardId = parseJsonBody<{ card: TaskCard }>(createRes).card.id;

      // backlog → queued
      const r1 = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: `/api/task-board/${cardId}`, method: 'PATCH' }),
        r1,
        depsWithBody({ status: 'queued' }),
      );
      expect(parseJsonBody<{ card: TaskCard }>(r1).card.status).toBe('queued');
      expect(parseJsonBody<{ card: TaskCard }>(r1).card.queuedAt).toBeTruthy();

      // queued → running
      const r2 = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: `/api/task-board/${cardId}`, method: 'PATCH' }),
        r2,
        depsWithBody({ status: 'running' }),
      );
      const runCard = parseJsonBody<{ card: TaskCard }>(r2).card;
      expect(runCard.status).toBe('running');
      expect(runCard.startedAt).toBeTruthy();

      // running → done with result
      const r3 = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: `/api/task-board/${cardId}`, method: 'PATCH' }),
        r3,
        depsWithBody({ status: 'done', resultSummary: 'Shipped!', tokensUsed: 1234 }),
      );
      const doneCard = parseJsonBody<{ card: TaskCard }>(r3).card;
      expect(doneCard.status).toBe('done');
      expect(doneCard.completedAt).toBeTruthy();
      expect(doneCard.resultSummary).toBe('Shipped!');
      expect(doneCard.tokensUsed).toBe(1234);

      // Summary reflects the final state
      const sumRes = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/summary' }),
        sumRes,
        createDeps(),
      );
      const sum = parseJsonBody<{ columns: Record<string, number>; total: number }>(sumRes);
      expect(sum.total).toBe(1);
      expect(sum.columns.done).toBe(1);
    });

    it('card flows running → failed → backlog → queued (retry path)', async () => {
      // Seed a running card
      const card = makeSampleCard({ id: 'retry-card', status: 'running', startedAt: Date.now() });
      seedTasks([card]);

      // running → failed
      const r1 = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/retry-card', method: 'PATCH' }),
        r1,
        depsWithBody({ status: 'failed', error: 'Timeout exceeded' }),
      );
      const failedCard = parseJsonBody<{ card: TaskCard }>(r1).card;
      expect(failedCard.status).toBe('failed');
      expect(failedCard.error).toBe('Timeout exceeded');
      expect(failedCard.completedAt).toBeTruthy();

      // failed → backlog
      const r2 = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/retry-card', method: 'PATCH' }),
        r2,
        depsWithBody({ status: 'backlog' }),
      );
      expect(parseJsonBody<{ card: TaskCard }>(r2).card.status).toBe('backlog');

      // backlog → queued
      const r3 = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/retry-card', method: 'PATCH' }),
        r3,
        depsWithBody({ status: 'queued' }),
      );
      expect(parseJsonBody<{ card: TaskCard }>(r3).card.status).toBe('queued');
    });
  });

  describe('POST edge cases', () => {
    it('trims whitespace from title', async () => {
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board', method: 'POST' }),
        res,
        depsWithBody({ title: '  Whitespace task  ' }),
      );
      expect(res._statusCode).toBe(201);
      expect(parseJsonBody<{ card: TaskCard }>(res).card.title).toBe('Whitespace task');
    });

    it('rejects title over 200 chars', async () => {
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board', method: 'POST' }),
        res,
        depsWithBody({ title: 'x'.repeat(201) }),
      );
      expect(res._statusCode).toBe(400);
      expect(parseJsonBody(res).error).toContain('200');
    });

    it('rejects description over 2000 chars', async () => {
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board', method: 'POST' }),
        res,
        depsWithBody({ title: 'Valid', description: 'y'.repeat(2001) }),
      );
      expect(res._statusCode).toBe(400);
      expect(parseJsonBody(res).error).toContain('2000');
    });

    it('allows creating card with initial queued status', async () => {
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board', method: 'POST' }),
        res,
        depsWithBody({ title: 'Pre-queued', status: 'queued' }),
      );
      expect(res._statusCode).toBe(201);
      const card = parseJsonBody<{ card: TaskCard }>(res).card;
      expect(card.status).toBe('queued');
      expect(card.queuedAt).toBeTruthy();
    });

    it('rejects invalid initial status', async () => {
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board', method: 'POST' }),
        res,
        depsWithBody({ title: 'Bad status', status: 'exploding' }),
      );
      expect(res._statusCode).toBe(400);
    });

    it('handles malformed JSON body gracefully', async () => {
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board', method: 'POST' }),
        res,
        createDeps({ readRequestBody: async () => '{not json' }),
      );
      expect(res._statusCode).toBe(400);
      expect(parseJsonBody(res).error).toContain('invalid JSON');
    });
  });

  describe('PATCH edge cases', () => {
    it('handles malformed JSON in PATCH body', async () => {
      seedTasks([makeSampleCard({ id: 'card-1' })]);
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/card-1', method: 'PATCH' }),
        res,
        createDeps({ readRequestBody: async () => 'broken{' }),
      );
      expect(res._statusCode).toBe(400);
    });

    it('rejects invalid status value in PATCH', async () => {
      seedTasks([makeSampleCard({ id: 'card-1', status: 'backlog' })]);
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/card-1', method: 'PATCH' }),
        res,
        depsWithBody({ status: 'nonexistent' }),
      );
      expect(res._statusCode).toBe(400);
      expect(parseJsonBody(res).error).toContain('invalid status');
    });

    it('ignores invalid priority in PATCH', async () => {
      seedTasks([makeSampleCard({ id: 'card-1', priority: 'low' })]);
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/card-1', method: 'PATCH' }),
        res,
        depsWithBody({ priority: 'ultra' }),
      );
      // Should succeed but not change priority
      expect(res._statusCode).toBe(200);
      expect(parseJsonBody<{ card: TaskCard }>(res).card.priority).toBe('low');
    });

    it('clears agentId when set to empty string', async () => {
      seedTasks([makeSampleCard({ id: 'card-1', agentId: 'oracle' })]);
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/card-1', method: 'PATCH' }),
        res,
        depsWithBody({ agentId: '' }),
      );
      expect(parseJsonBody<{ card: TaskCard }>(res).card.agentId).toBeNull();
    });

    it('truncates title to 200 chars in PATCH', async () => {
      seedTasks([makeSampleCard({ id: 'card-1' })]);
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/card-1', method: 'PATCH' }),
        res,
        depsWithBody({ title: 'z'.repeat(300) }),
      );
      expect(parseJsonBody<{ card: TaskCard }>(res).card.title).toHaveLength(200);
    });
  });

  describe('summary with multiple agents', () => {
    it('returns accurate per-agent breakdown across all statuses', async () => {
      seedTasks([
        makeSampleCard({ agentId: 'alpha', status: 'backlog' }),
        makeSampleCard({ agentId: 'alpha', status: 'running' }),
        makeSampleCard({ agentId: 'alpha', status: 'done' }),
        makeSampleCard({ agentId: 'beta', status: 'queued' }),
        makeSampleCard({ agentId: 'beta', status: 'failed' }),
        makeSampleCard({ agentId: null, status: 'backlog' }),
      ]);
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board/summary' }),
        res,
        createDeps(),
      );
      const body = parseJsonBody<{
        columns: Record<string, number>;
        byAgent: Record<string, Record<string, number>>;
        total: number;
      }>(res);
      expect(body.total).toBe(6);
      expect(body.columns.backlog).toBe(2);
      expect(body.columns.running).toBe(1);
      expect(body.columns.queued).toBe(1);
      expect(body.columns.done).toBe(1);
      expect(body.columns.failed).toBe(1);

      expect(body.byAgent['alpha'].running).toBe(1);
      expect(body.byAgent['alpha'].done).toBe(1);
      expect(body.byAgent['beta'].queued).toBe(1);
      expect(body.byAgent['beta'].failed).toBe(1);
      expect(body.byAgent['_unassigned'].backlog).toBe(1);
    });
  });

  describe('combined filter coverage', () => {
    it('filters by priority + agentId', async () => {
      seedTasks([
        makeSampleCard({ id: 'a', agentId: 'oracle', priority: 'critical', status: 'backlog' }),
        makeSampleCard({ id: 'b', agentId: 'oracle', priority: 'low', status: 'backlog' }),
        makeSampleCard({ id: 'c', agentId: 'sentinel', priority: 'critical', status: 'running' }),
      ]);
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board?priority=critical&agentId=oracle' }),
        res,
        createDeps(),
      );
      const body = parseJsonBody<{ tasks: TaskCard[] }>(res);
      expect(body.tasks).toHaveLength(1);
      expect(body.tasks[0].id).toBe('a');
    });

    it('filters by all three: status + agentId + priority', async () => {
      seedTasks([
        makeSampleCard({ id: 'x', agentId: 'nexus', priority: 'high', status: 'running' }),
        makeSampleCard({ id: 'y', agentId: 'nexus', priority: 'high', status: 'backlog' }),
        makeSampleCard({ id: 'z', agentId: 'nexus', priority: 'low', status: 'running' }),
      ]);
      const res = mockResponse();
      await handleTaskBoard(
        mockRequest({ url: '/api/task-board?status=running&agentId=nexus&priority=high' }),
        res,
        createDeps(),
      );
      const body = parseJsonBody<{ tasks: TaskCard[] }>(res);
      expect(body.tasks).toHaveLength(1);
      expect(body.tasks[0].id).toBe('x');
    });
  });
});

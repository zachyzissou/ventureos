/**
 * Task Board Bulk Operations tests — Issue #219, Phase 6.
 *
 * Tests for POST /api/task-board/batch endpoint:
 *   - batch status transitions (with partial success/failure)
 *   - batch archive (done/failed cards only)
 *   - validation, bounds, and edge cases
 *   - count consistency after batch operations
 *   - SSE event emission
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import {
  handleTaskBoard,
  loadTasks,
  buildSummary,
  executeBatch,
} from '../../../server/routes/task-board.js';
import type { BatchResult } from '../../../server/routes/task-board.js';
import type { TaskBoardDeps, TaskCard, TaskStatus } from '../../../server/types.js';

const testDataDir = path.join('/tmp', 'test-task-board-bulk-' + process.pid);

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

function seedTasks(tasks: TaskCard[]): void {
  fs.mkdirSync(testDataDir, { recursive: true });
  fs.writeFileSync(
    path.join(testDataDir, 'task-board.json'),
    JSON.stringify({ tasks, updatedAt: Date.now() }),
  );
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

// ─── executeBatch unit tests ─────────────────────────────────────────────────

describe('executeBatch', () => {
  describe('validation', () => {
    it('rejects invalid action', () => {
      const result = executeBatch(testDataDir, { action: 'nuke', ids: ['a'] });
      expect(result.error).toContain('invalid action');
      expect(result.succeeded).toBe(0);
    });

    it('rejects missing ids array', () => {
      const result = executeBatch(testDataDir, { action: 'transition' });
      expect(result.error).toContain('non-empty array');
    });

    it('rejects empty ids array', () => {
      const result = executeBatch(testDataDir, { action: 'transition', ids: [] });
      expect(result.error).toContain('non-empty array');
    });

    it('rejects batch exceeding MAX_BATCH_SIZE', () => {
      const ids = Array.from({ length: 51 }, (_, i) => `id-${i}`);
      const result = executeBatch(testDataDir, { action: 'transition', ids, status: 'done' });
      expect(result.error).toContain('exceeds maximum');
      expect(result.failed).toBe(51);
    });

    it('rejects transition with invalid target status', () => {
      seedTasks([makeSampleCard({ id: 'a', status: 'backlog' })]);
      const result = executeBatch(testDataDir, { action: 'transition', ids: ['a'], status: 'exploding' });
      expect(result.error).toContain('invalid target status');
    });

    it('rejects transition with missing status', () => {
      seedTasks([makeSampleCard({ id: 'a', status: 'backlog' })]);
      const result = executeBatch(testDataDir, { action: 'transition', ids: ['a'] });
      expect(result.error).toContain('invalid target status');
    });
  });

  describe('batch transition', () => {
    it('transitions multiple cards to queued', () => {
      const cards = [
        makeSampleCard({ id: 'a', status: 'backlog' }),
        makeSampleCard({ id: 'b', status: 'backlog' }),
        makeSampleCard({ id: 'c', status: 'backlog' }),
      ];
      seedTasks(cards);

      const result = executeBatch(testDataDir, {
        action: 'transition',
        ids: ['a', 'b', 'c'],
        status: 'queued',
      });

      expect(result.succeeded).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.total).toBe(3);
      expect(result.results).toHaveLength(3);
      expect(result.results.every(r => r.ok)).toBe(true);

      // Verify persisted state
      const tasks = loadTasks(testDataDir);
      expect(tasks.every(t => t.status === 'queued')).toBe(true);
      expect(tasks.every(t => t.queuedAt !== null)).toBe(true);
    });

    it('handles partial success (mixed valid/invalid transitions)', () => {
      const cards = [
        makeSampleCard({ id: 'ok', status: 'backlog' }),     // backlog → queued ✓
        makeSampleCard({ id: 'fail', status: 'running' }),    // running → queued ✗
        makeSampleCard({ id: 'ok2', status: 'failed' }),      // failed → queued ✓
      ];
      seedTasks(cards);

      const result = executeBatch(testDataDir, {
        action: 'transition',
        ids: ['ok', 'fail', 'ok2'],
        status: 'queued',
      });

      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(1);

      const failedResult = result.results.find(r => r.id === 'fail');
      expect(failedResult?.ok).toBe(false);
      expect(failedResult?.error).toContain('invalid transition');

      // Verify persisted state: successful cards changed, failed card unchanged
      const tasks = loadTasks(testDataDir);
      const taskMap = new Map(tasks.map(t => [t.id, t]));
      expect(taskMap.get('ok')!.status).toBe('queued');
      expect(taskMap.get('fail')!.status).toBe('running');
      expect(taskMap.get('ok2')!.status).toBe('queued');
    });

    it('reports not-found cards as failures', () => {
      seedTasks([makeSampleCard({ id: 'exists', status: 'backlog' })]);

      const result = executeBatch(testDataDir, {
        action: 'transition',
        ids: ['exists', 'ghost'],
        status: 'queued',
      });

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results.find(r => r.id === 'ghost')?.error).toBe('not found');
    });

    it('treats already-at-target-status as success (idempotent)', () => {
      seedTasks([makeSampleCard({ id: 'a', status: 'queued' })]);

      const result = executeBatch(testDataDir, {
        action: 'transition',
        ids: ['a'],
        status: 'queued',
      });

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('de-duplicates ids', () => {
      seedTasks([makeSampleCard({ id: 'a', status: 'backlog' })]);

      const result = executeBatch(testDataDir, {
        action: 'transition',
        ids: ['a', 'a', 'a'],
        status: 'queued',
      });

      expect(result.total).toBe(1);
      expect(result.succeeded).toBe(1);
    });

    it('sets startedAt when transitioning to running', () => {
      seedTasks([makeSampleCard({ id: 'a', status: 'queued' })]);

      executeBatch(testDataDir, {
        action: 'transition',
        ids: ['a'],
        status: 'running',
      });

      const tasks = loadTasks(testDataDir);
      expect(tasks[0].startedAt).toBeTruthy();
    });

    it('sets completedAt and computes runtimeMs when transitioning to done', () => {
      const startedAt = Date.now() - 5000;
      seedTasks([makeSampleCard({ id: 'a', status: 'running', startedAt })]);

      executeBatch(testDataDir, {
        action: 'transition',
        ids: ['a'],
        status: 'done',
      });

      const tasks = loadTasks(testDataDir);
      expect(tasks[0].completedAt).toBeTruthy();
      expect(tasks[0].runtimeMs).toBeGreaterThanOrEqual(4000);
    });

    it('emits SSE events for each successful transition', () => {
      const cards = [
        makeSampleCard({ id: 'a', status: 'backlog' }),
        makeSampleCard({ id: 'b', status: 'running' }), // can't go to queued
      ];
      seedTasks(cards);

      const emitted: Array<{ type: string; card: TaskCard }> = [];
      const emitEvent = (type: string, card: TaskCard) => {
        emitted.push({ type, card });
      };

      executeBatch(testDataDir, {
        action: 'transition',
        ids: ['a', 'b'],
        status: 'queued',
      }, emitEvent as any);

      // Only 'a' should have emitted (succeeded)
      expect(emitted).toHaveLength(1);
      expect(emitted[0].type).toBe('task:updated');
      expect(emitted[0].card.id).toBe('a');
    });
  });

  describe('batch archive', () => {
    it('archives done and failed cards', () => {
      const cards = [
        makeSampleCard({ id: 'done1', status: 'done' }),
        makeSampleCard({ id: 'done2', status: 'done' }),
        makeSampleCard({ id: 'fail1', status: 'failed' }),
        makeSampleCard({ id: 'keep', status: 'running' }),
      ];
      seedTasks(cards);

      const result = executeBatch(testDataDir, {
        action: 'archive',
        ids: ['done1', 'done2', 'fail1'],
      });

      expect(result.succeeded).toBe(3);
      expect(result.failed).toBe(0);

      // Verify only the 'keep' card remains
      const tasks = loadTasks(testDataDir);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('keep');
    });

    it('rejects archiving non-done/failed cards', () => {
      seedTasks([
        makeSampleCard({ id: 'backlog1', status: 'backlog' }),
        makeSampleCard({ id: 'running1', status: 'running' }),
        makeSampleCard({ id: 'queued1', status: 'queued' }),
      ]);

      const result = executeBatch(testDataDir, {
        action: 'archive',
        ids: ['backlog1', 'running1', 'queued1'],
      });

      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(3);
      expect(result.results.every(r => r.error?.includes('cannot archive'))).toBe(true);

      // Verify no cards were removed
      const tasks = loadTasks(testDataDir);
      expect(tasks).toHaveLength(3);
    });

    it('handles partial archive (mix of archivable and non-archivable)', () => {
      seedTasks([
        makeSampleCard({ id: 'done1', status: 'done' }),
        makeSampleCard({ id: 'running1', status: 'running' }),
      ]);

      const result = executeBatch(testDataDir, {
        action: 'archive',
        ids: ['done1', 'running1'],
      });

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);

      const tasks = loadTasks(testDataDir);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('running1');
    });

    it('reports not-found cards in archive', () => {
      seedTasks([makeSampleCard({ id: 'done1', status: 'done' })]);

      const result = executeBatch(testDataDir, {
        action: 'archive',
        ids: ['done1', 'ghost'],
      });

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results.find(r => r.id === 'ghost')?.error).toBe('not found');
    });

    it('emits SSE delete events for archived cards', () => {
      seedTasks([
        makeSampleCard({ id: 'done1', status: 'done' }),
        makeSampleCard({ id: 'fail1', status: 'failed' }),
      ]);

      const emitted: Array<{ type: string; card: TaskCard }> = [];
      const emitEvent = (type: string, card: TaskCard) => {
        emitted.push({ type, card });
      };

      executeBatch(testDataDir, {
        action: 'archive',
        ids: ['done1', 'fail1'],
      }, emitEvent as any);

      expect(emitted).toHaveLength(2);
      expect(emitted.every(e => e.type === 'task:deleted')).toBe(true);
    });

    it('de-duplicates ids in archive', () => {
      seedTasks([makeSampleCard({ id: 'done1', status: 'done' })]);

      const result = executeBatch(testDataDir, {
        action: 'archive',
        ids: ['done1', 'done1', 'done1'],
      });

      expect(result.total).toBe(1);
      expect(result.succeeded).toBe(1);
    });
  });

  describe('count consistency', () => {
    it('summary counts remain consistent after batch transition', () => {
      seedTasks([
        makeSampleCard({ id: 'a', status: 'backlog' }),
        makeSampleCard({ id: 'b', status: 'backlog' }),
        makeSampleCard({ id: 'c', status: 'queued' }),
        makeSampleCard({ id: 'd', status: 'running' }),
      ]);

      // Transition a and b to queued
      executeBatch(testDataDir, {
        action: 'transition',
        ids: ['a', 'b'],
        status: 'queued',
      });

      const tasks = loadTasks(testDataDir);
      const summary = buildSummary(tasks);

      expect(summary.total).toBe(4);
      expect(summary.columns.backlog).toBe(0);
      expect(summary.columns.queued).toBe(3); // a, b, c
      expect(summary.columns.running).toBe(1); // d
    });

    it('summary counts remain consistent after batch archive', () => {
      seedTasks([
        makeSampleCard({ id: 'a', status: 'done' }),
        makeSampleCard({ id: 'b', status: 'done' }),
        makeSampleCard({ id: 'c', status: 'failed' }),
        makeSampleCard({ id: 'd', status: 'running' }),
      ]);

      executeBatch(testDataDir, {
        action: 'archive',
        ids: ['a', 'b', 'c'],
      });

      const tasks = loadTasks(testDataDir);
      const summary = buildSummary(tasks);

      expect(summary.total).toBe(1);
      expect(summary.columns.done).toBe(0);
      expect(summary.columns.failed).toBe(0);
      expect(summary.columns.running).toBe(1);
    });
  });
});

// ─── HTTP endpoint integration tests ─────────────────────────────────────────

describe('POST /api/task-board/batch (HTTP)', () => {
  it('routes correctly and returns batch result', async () => {
    seedTasks([
      makeSampleCard({ id: 'x', status: 'backlog' }),
      makeSampleCard({ id: 'y', status: 'backlog' }),
    ]);

    const res = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board/batch', method: 'POST' }),
      res,
      depsWithBody({ action: 'transition', ids: ['x', 'y'], status: 'queued' }),
    );

    expect(res._statusCode).toBe(200);
    const body = parseJsonBody<BatchResult>(res);
    expect(body.action).toBe('transition');
    expect(body.succeeded).toBe(2);
    expect(body.failed).toBe(0);
  });

  it('returns 400 for invalid batch input', async () => {
    const res = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board/batch', method: 'POST' }),
      res,
      depsWithBody({ action: 'invalid' }),
    );

    expect(res._statusCode).toBe(400);
    const body = parseJsonBody<BatchResult>(res);
    expect(body.error).toContain('invalid action');
  });

  it('returns 400 for malformed JSON', async () => {
    const res = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board/batch', method: 'POST' }),
      res,
      createDeps({ readRequestBody: async () => '{broken' }),
    );

    expect(res._statusCode).toBe(400);
    expect(parseJsonBody(res).error).toContain('invalid JSON');
  });

  it('archive via HTTP removes cards and returns result', async () => {
    seedTasks([
      makeSampleCard({ id: 'done1', status: 'done' }),
      makeSampleCard({ id: 'keep', status: 'running' }),
    ]);

    const res = mockResponse();
    await handleTaskBoard(
      mockRequest({ url: '/api/task-board/batch', method: 'POST' }),
      res,
      depsWithBody({ action: 'archive', ids: ['done1'] }),
    );

    expect(res._statusCode).toBe(200);
    const body = parseJsonBody<BatchResult>(res);
    expect(body.succeeded).toBe(1);

    const tasks = loadTasks(testDataDir);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('keep');
  });

  it('does not match GET requests to /api/task-board/batch', async () => {
    const res = mockResponse();
    // GET to batch should fall through to the /:id handler
    const handled = await handleTaskBoard(
      mockRequest({ url: '/api/task-board/batch', method: 'GET' }),
      res,
      createDeps(),
    );

    // It will be handled by the GET /:id route but return 404
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(404);
  });
});

// ─── Full workflow tests ─────────────────────────────────────────────────────

describe('bulk operations full workflow', () => {
  it('create → batch transition → batch archive lifecycle', async () => {
    // Create 5 cards
    const cards = Array.from({ length: 5 }, (_, i) =>
      makeSampleCard({ id: `card-${i}`, status: 'backlog', title: `Task ${i}` }),
    );
    seedTasks(cards);

    // Batch transition all to queued
    const r1 = executeBatch(testDataDir, {
      action: 'transition',
      ids: cards.map(c => c.id),
      status: 'queued',
    });
    expect(r1.succeeded).toBe(5);

    // Transition some to running
    const r2 = executeBatch(testDataDir, {
      action: 'transition',
      ids: ['card-0', 'card-1', 'card-2'],
      status: 'running',
    });
    expect(r2.succeeded).toBe(3);

    // Transition running → done
    const r3 = executeBatch(testDataDir, {
      action: 'transition',
      ids: ['card-0', 'card-1'],
      status: 'done',
    });
    expect(r3.succeeded).toBe(2);

    // Transition card-2 → failed
    const r4 = executeBatch(testDataDir, {
      action: 'transition',
      ids: ['card-2'],
      status: 'failed',
    });
    expect(r4.succeeded).toBe(1);

    // Summary before archive
    const preTasks = loadTasks(testDataDir);
    const preSummary = buildSummary(preTasks);
    expect(preSummary.total).toBe(5);
    expect(preSummary.columns.done).toBe(2);
    expect(preSummary.columns.failed).toBe(1);
    expect(preSummary.columns.queued).toBe(2);

    // Archive done + failed
    const r5 = executeBatch(testDataDir, {
      action: 'archive',
      ids: ['card-0', 'card-1', 'card-2'],
    });
    expect(r5.succeeded).toBe(3);
    expect(r5.failed).toBe(0);

    // Final state
    const finalTasks = loadTasks(testDataDir);
    expect(finalTasks).toHaveLength(2);
    expect(finalTasks.every(t => t.status === 'queued')).toBe(true);

    const finalSummary = buildSummary(finalTasks);
    expect(finalSummary.total).toBe(2);
    expect(finalSummary.columns.queued).toBe(2);
    expect(finalSummary.columns.done).toBe(0);
    expect(finalSummary.columns.failed).toBe(0);
  });
});

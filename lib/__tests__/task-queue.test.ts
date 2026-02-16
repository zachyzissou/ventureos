/**
 * Task Queue Tests — VentureOS Queue Integration (P1 #30)
 */

import {
  TaskQueue,
  QUEUE_SCHEMA_VERSION,
  type QueueDocument,
  type QueueTask,
  type EnqueueOptions,
  type TaskQueueLogger,
} from '../task-queue';

// ── Helpers ──────────────────────────────────────────────────────────

function silentLogger(): TaskQueueLogger {
  return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

function makeQueue(overrides?: { now?: () => Date; logger?: TaskQueueLogger }) {
  return new TaskQueue({
    logger: overrides?.logger ?? silentLogger(),
    now: overrides?.now ?? (() => new Date('2026-02-15T12:00:00Z')),
  });
}

function v1Doc(items: Partial<QueueTask>[] = []): QueueDocument {
  return { version: 1, generated_at: '2026-02-01', items: items as unknown as QueueTask[] };
}

function v2Doc(items: Partial<QueueTask>[] = []): QueueDocument {
  return { version: 2, generated_at: '2026-02-15', items: items as unknown as QueueTask[] };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('TaskQueue', () => {
  describe('constructor', () => {
    it('creates an empty queue', () => {
      const q = makeQueue();
      expect(q.getTasks()).toEqual([]);
    });
  });

  describe('enqueue', () => {
    it('creates a task with all fields', () => {
      const q = makeQueue();
      const task = q.enqueue({
        title: 'Build feature',
        tier: 'P1',
        description: 'Some work',
        businessUnit: 'ventureos',
        missionType: 'build',
        role: 'Helmsman',
        maxAttempts: 5,
        timeoutSeconds: 300,
      });

      expect(task.id).toBeDefined();
      expect(task.title).toBe('Build feature');
      expect(task.tier).toBe('P1');
      expect(task.status).toBe('queued');
      expect(task.businessUnit).toBe('ventureos');
      expect(task.missionType).toBe('build');
      expect(task.role).toBe('Helmsman');
      expect(task.attempts).toBe(0);
      expect(task.maxAttempts).toBe(5);
      expect(task.missionContext).toEqual({
        businessUnit: 'ventureos',
        missionType: 'build',
        role: 'Helmsman',
      });
    });

    it('applies defaults for optional fields', () => {
      const q = makeQueue();
      const task = q.enqueue({ title: 'Simple task' });

      expect(task.tier).toBe('P2');
      expect(task.status).toBe('queued');
      expect(task.attempts).toBe(0);
      expect(task.maxAttempts).toBe(3);
      expect(task.businessUnit).toBeUndefined();
      expect(task.missionType).toBeUndefined();
      expect(task.role).toBeUndefined();
      expect(task.missionContext).toBeUndefined();
    });

    it('uses missionContext when provided directly', () => {
      const q = makeQueue();
      const task = q.enqueue({
        title: 'Context task',
        missionContext: {
          businessUnit: 'bloom',
          missionType: 'content',
          role: 'Producer',
          tags: { sprint: '6' },
        },
      });

      expect(task.businessUnit).toBe('bloom');
      expect(task.missionType).toBe('content');
      expect(task.role).toBe('Producer');
      expect(task.missionContext?.tags).toEqual({ sprint: '6' });
    });

    it('normalizes missionContext when top-level mission fields override context fields', () => {
      const q = makeQueue();
      const task = q.enqueue({
        title: 'Override context task',
        businessUnit: 'ventureos',
        missionType: 'ops',
        role: 'Helmsman',
        missionContext: {
          businessUnit: 'bloom',
          missionType: 'content',
          role: 'Producer',
          tags: { sprint: '6' },
        },
      });

      expect(task.businessUnit).toBe('ventureos');
      expect(task.missionType).toBe('ops');
      expect(task.role).toBe('Helmsman');
      expect(task.missionContext).toEqual({
        businessUnit: 'ventureos',
        missionType: 'ops',
        role: 'Helmsman',
        tags: { sprint: '6' },
      });
    });

    it('deduplicates by dedupeKey', () => {
      const q = makeQueue();
      const first = q.enqueue({ title: 'Task A', dedupeKey: 'unique-key' });
      const second = q.enqueue({ title: 'Task B', dedupeKey: 'unique-key' });

      // Second returns the existing task
      expect(second.id).toBe(first.id);
      expect(q.getTasks()).toHaveLength(1);
    });

    it('allows same dedupeKey if first task is completed', () => {
      const q = makeQueue();
      const first = q.enqueue({ title: 'Task A', dedupeKey: 'key' });
      q.updateStatus(first.id, 'succeeded');
      const second = q.enqueue({ title: 'Task B', dedupeKey: 'key' });

      expect(second.id).not.toBe(first.id);
      expect(q.getTasks()).toHaveLength(2);
    });
  });

  describe('getTask / getTasks', () => {
    it('retrieves a task by ID', () => {
      const q = makeQueue();
      const task = q.enqueue({ title: 'Find me' });
      expect(q.getTask(task.id)).toBe(task);
    });

    it('returns undefined for unknown ID', () => {
      const q = makeQueue();
      expect(q.getTask('nonexistent')).toBeUndefined();
    });

    it('filters by status', () => {
      const q = makeQueue();
      q.enqueue({ title: 'A' });
      const b = q.enqueue({ title: 'B' });
      q.updateStatus(b.id, 'running');

      expect(q.getTasks({ status: 'queued' })).toHaveLength(1);
      expect(q.getTasks({ status: 'running' })).toHaveLength(1);
    });

    it('filters by businessUnit', () => {
      const q = makeQueue();
      q.enqueue({ title: 'A', businessUnit: 'bloom' });
      q.enqueue({ title: 'B', businessUnit: 'ventureos' });
      q.enqueue({ title: 'C' });

      expect(q.getTasks({ businessUnit: 'bloom' })).toHaveLength(1);
      expect(q.getTasks({ businessUnit: 'ventureos' })).toHaveLength(1);
    });

    it('filters by missionType', () => {
      const q = makeQueue();
      q.enqueue({ title: 'A', missionType: 'build' });
      q.enqueue({ title: 'B', missionType: 'ops' });

      expect(q.getTasks({ missionType: 'build' })).toHaveLength(1);
    });

    it('filters by role', () => {
      const q = makeQueue();
      q.enqueue({ title: 'A', role: 'Helmsman' });
      q.enqueue({ title: 'B', role: 'Producer' });

      expect(q.getTasks({ role: 'Helmsman' })).toHaveLength(1);
    });

    it('combines multiple filters', () => {
      const q = makeQueue();
      q.enqueue({ title: 'A', businessUnit: 'bloom', missionType: 'build' });
      q.enqueue({ title: 'B', businessUnit: 'bloom', missionType: 'content' });
      q.enqueue({ title: 'C', businessUnit: 'ventureos', missionType: 'build' });

      const result = q.getTasks({ businessUnit: 'bloom', missionType: 'build' });
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('A');
    });
  });

  describe('updateStatus', () => {
    it('updates status and timestamps', () => {
      const q = makeQueue();
      const task = q.enqueue({ title: 'Work' });

      const running = q.updateStatus(task.id, 'running');
      expect(running?.status).toBe('running');
      expect(running?.startedAt).toBeDefined();
      expect(running?.attempts).toBe(1);

      const done = q.updateStatus(task.id, 'succeeded');
      expect(done?.status).toBe('succeeded');
      expect(done?.completedAt).toBeDefined();
    });

    it('records error on failure', () => {
      const q = makeQueue();
      const task = q.enqueue({ title: 'Fail' });
      const failed = q.updateStatus(task.id, 'failed', 'Connection timeout');

      expect(failed?.status).toBe('failed');
      expect(failed?.error).toBe('Connection timeout');
    });

    it('returns undefined for unknown task', () => {
      const q = makeQueue();
      expect(q.updateStatus('nope', 'running')).toBeUndefined();
    });

    it('preserves mission context across status changes', () => {
      const q = makeQueue();
      const task = q.enqueue({
        title: 'Context preserved',
        businessUnit: 'bloom',
        missionType: 'build',
        role: 'Producer',
      });

      q.updateStatus(task.id, 'running');
      q.updateStatus(task.id, 'succeeded');

      const updated = q.getTask(task.id);
      expect(updated?.businessUnit).toBe('bloom');
      expect(updated?.missionType).toBe('build');
      expect(updated?.role).toBe('Producer');
      expect(updated?.missionContext).toEqual({
        businessUnit: 'bloom',
        missionType: 'build',
        role: 'Producer',
      });
    });
  });

  describe('cancel', () => {
    it('cancels a task with reason', () => {
      const q = makeQueue();
      const task = q.enqueue({ title: 'Cancel me' });
      const cancelled = q.cancel(task.id, 'No longer needed');

      expect(cancelled?.status).toBe('cancelled');
      expect(cancelled?.error).toBe('No longer needed');
    });
  });

  describe('prune', () => {
    it('removes completed tasks', () => {
      const q = makeQueue();
      const a = q.enqueue({ title: 'A' });
      q.enqueue({ title: 'B' });
      q.updateStatus(a.id, 'succeeded');

      expect(q.prune()).toBe(1);
      expect(q.getTasks()).toHaveLength(1);
    });

    it('prunes custom statuses', () => {
      const q = makeQueue();
      const a = q.enqueue({ title: 'A' });
      q.updateStatus(a.id, 'failed');

      expect(q.prune(['failed'])).toBe(1);
    });
  });

  describe('stats', () => {
    it('groups stats by business unit', () => {
      const q = makeQueue();
      q.enqueue({ title: 'A', businessUnit: 'bloom' });
      const b = q.enqueue({ title: 'B', businessUnit: 'bloom' });
      q.updateStatus(b.id, 'running');
      q.enqueue({ title: 'C', businessUnit: 'ventureos' });
      q.enqueue({ title: 'D' }); // unassigned

      const s = q.stats();
      expect(s.bloom).toEqual({ total: 2, queued: 1, running: 1, failed: 0 });
      expect(s.ventureos).toEqual({ total: 1, queued: 1, running: 0, failed: 0 });
      expect(s._unassigned).toEqual({ total: 1, queued: 1, running: 0, failed: 0 });
    });
  });

  describe('load / toDocument', () => {
    it('round-trips a v2 document', () => {
      const q = makeQueue();
      q.enqueue({ title: 'Task 1', businessUnit: 'bloom', missionType: 'build' });
      q.enqueue({ title: 'Task 2', businessUnit: 'ventureos', missionType: 'infra' });

      const doc = q.toDocument();
      expect(doc.version).toBe(QUEUE_SCHEMA_VERSION);
      expect(doc.items).toHaveLength(2);

      // Load into a new queue
      const q2 = makeQueue();
      q2.load(doc);
      expect(q2.getTasks()).toHaveLength(2);
      expect(q2.getTasks()[0].businessUnit).toBe('bloom');
    });

    it('loads a v1 document and normalizes tasks', () => {
      const q = makeQueue();
      q.load(v1Doc([
        {
          id: 'abc',
          createdAt: '2026-01-01',
          title: 'Old task',
          status: 'queued',
          tier: 'P1',
          businessUnit: 'stanton-times',
          missionType: 'content',
          role: 'Comms',
          attempts: 0,
          maxAttempts: 3,
        },
      ]));

      const tasks = q.getTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].businessUnit).toBe('stanton-times');
      expect(tasks[0].missionContext).toEqual({
        businessUnit: 'stanton-times',
        missionType: 'content',
        role: 'Comms',
      });
    });

    it('handles v1 tasks without mission fields', () => {
      const q = makeQueue();
      q.load(v1Doc([
        {
          id: 'xyz',
          createdAt: '2026-01-01',
          title: 'Legacy task',
          status: 'queued',
          tier: 'P2',
        },
      ]));

      const tasks = q.getTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].businessUnit).toBeUndefined();
      expect(tasks[0].missionContext).toBeUndefined();
      // Defaults applied
      expect(tasks[0].attempts).toBe(0);
      expect(tasks[0].maxAttempts).toBe(3);
    });

    it('exports v2 schema version', () => {
      const q = makeQueue();
      const doc = q.toDocument();
      expect(doc.version).toBe(2);
    });
  });

  describe('logging', () => {
    it('includes mission tags in log calls', () => {
      const logger = silentLogger();
      const q = makeQueue({ logger });

      q.enqueue({
        title: 'Logged task',
        businessUnit: 'bloom',
        missionType: 'build',
        role: 'Producer',
      });

      expect(logger.info).toHaveBeenCalledWith(
        'Task enqueued',
        expect.objectContaining({
          businessUnit: 'bloom',
          missionType: 'build',
          role: 'Producer',
        })
      );
    });

    it('omits mission tags when not present', () => {
      const logger = silentLogger();
      const q = makeQueue({ logger });

      q.enqueue({ title: 'No context' });

      const call = (logger.info as jest.Mock).mock.calls.find(
        ([msg]: string[]) => msg === 'Task enqueued'
      );
      expect(call).toBeDefined();
      const meta = call![1];
      expect(meta).not.toHaveProperty('businessUnit');
      expect(meta).not.toHaveProperty('missionType');
      expect(meta).not.toHaveProperty('role');
    });
  });
});

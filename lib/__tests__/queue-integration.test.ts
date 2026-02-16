/**
 * Queue Integration Tests — VentureOS Queue Integration (P1 #30)
 *
 * End-to-end tests that verify the full queue pipeline:
 * TaskQueue + BusinessUnitRegistry + QueueRouter + Migration
 */

import { TaskQueue, type QueueDocument, type TaskQueueLogger } from '../task-queue';
import { BusinessUnitRegistry } from '../business-unit-registry';
import { QueueRouter } from '../queue-router';
import { migrateQueueDocument } from '../queue-migration';

// ── Helpers ──────────────────────────────────────────────────────────

function silentLogger(): TaskQueueLogger {
  return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

function makeFixedNow() {
  return () => new Date('2026-02-15T12:00:00Z');
}

function makeRegistryWithRealData(): BusinessUnitRegistry {
  return new BusinessUnitRegistry({
    data: {
      version: 2,
      generated_at: '2026-02-15',
      units: [
        {
          id: 'ventureos',
          name: 'VentureOS',
          category: 'infra',
          priority: 'critical',
          status: 'active',
          owner_role: 'Helmsman',
          missionTypes: ['build', 'ops', 'infra'],
          risk: {
            external_publish_requires_approval: true,
            destructive_actions_requires_approval: true,
            config_changes_requires_approval: true,
          },
        },
        {
          id: 'bloom',
          name: 'Bloom',
          category: 'game',
          priority: 'high',
          status: 'active',
          owner_role: 'Producer',
          missionTypes: ['build', 'content', 'research'],
        },
        {
          id: 'stantontimes-network',
          name: 'StantonTimes Network',
          category: 'media',
          priority: 'high',
          status: 'active',
          owner_role: 'Helmsman',
          missionTypes: ['content', 'research', 'ops'],
          risk: {
            external_publish_requires_approval: true,
            destructive_actions_requires_approval: true,
            config_changes_requires_approval: true,
          },
        },
        {
          id: 'fotopress',
          name: 'FotoPress',
          category: 'app',
          priority: 'low',
          status: 'active',
          missionTypes: ['build', 'content'],
        },
      ],
    },
  });
}

// ── Integration Tests ────────────────────────────────────────────────

describe('Queue Integration', () => {
  describe('full pipeline: enqueue → route → pick', () => {
    it('routes critical infra tasks ahead of lower priority work', () => {
      const now = makeFixedNow();
      const logger = silentLogger();
      const registry = makeRegistryWithRealData();
      const queue = new TaskQueue({ logger, now });
      const router = new QueueRouter({ registry, logger, now });

      // Enqueue a mix of tasks
      queue.enqueue({
        title: 'FotoPress: Update gallery',
        tier: 'P2',
        businessUnit: 'fotopress',
        missionType: 'build',
        role: 'Producer',
      });

      queue.enqueue({
        title: 'VentureOS: Fix queue routing',
        tier: 'P1',
        businessUnit: 'ventureos',
        missionType: 'infra',
        role: 'Helmsman',
      });

      queue.enqueue({
        title: 'Bloom: Design new level',
        tier: 'P2',
        businessUnit: 'bloom',
        missionType: 'build',
        role: 'Producer',
      });

      const tasks = queue.getTasks();
      const prioritized = router.prioritize(tasks);

      // VentureOS (P1 + critical BU) should be first
      expect(prioritized[0].task.title).toContain('VentureOS');
      // Bloom (P2 + high BU) should beat FotoPress (P2 + low BU)
      expect(prioritized[1].task.title).toContain('Bloom');
      expect(prioritized[2].task.title).toContain('FotoPress');
    });

    it('pickNext returns the right task', () => {
      const now = makeFixedNow();
      const logger = silentLogger();
      const registry = makeRegistryWithRealData();
      const queue = new TaskQueue({ logger, now });
      const router = new QueueRouter({ registry, logger, now });

      queue.enqueue({
        title: 'Low priority work',
        tier: 'P3',
        businessUnit: 'fotopress',
        missionType: 'build',
      });

      queue.enqueue({
        title: 'Critical infra',
        tier: 'P0',
        businessUnit: 'ventureos',
        missionType: 'infra',
      });

      const next = router.pickNext(queue.getTasks());
      expect(next?.task.title).toBe('Critical infra');
    });
  });

  describe('mission context preservation', () => {
    it('preserves context through enqueue → status updates → export', () => {
      const now = makeFixedNow();
      const logger = silentLogger();
      const queue = new TaskQueue({ logger, now });

      const task = queue.enqueue({
        title: 'Content pipeline',
        businessUnit: 'stantontimes-network',
        missionType: 'content',
        role: 'Comms',
        missionContext: {
          businessUnit: 'stantontimes-network',
          missionType: 'content',
          role: 'Comms',
          tags: { sprint: 'w06', pipeline: 'editorial' },
        },
      });

      // Simulate lifecycle
      queue.updateStatus(task.id, 'running');
      queue.updateStatus(task.id, 'succeeded');

      // Export and reload
      const doc = queue.toDocument();
      const queue2 = new TaskQueue({ logger, now });
      queue2.load(doc);

      const reloaded = queue2.getTask(task.id);
      expect(reloaded?.businessUnit).toBe('stantontimes-network');
      expect(reloaded?.missionType).toBe('content');
      expect(reloaded?.role).toBe('Comms');
      expect(reloaded?.missionContext?.tags).toEqual({ sprint: 'w06', pipeline: 'editorial' });
      expect(reloaded?.status).toBe('succeeded');
    });
  });

  describe('migration → queue → routing pipeline', () => {
    it('migrates v1 doc and routes correctly', () => {
      const now = makeFixedNow();
      const logger = silentLogger();
      const registry = makeRegistryWithRealData();

      // Start with a v1 document (from template)
      const v1Doc: QueueDocument = {
        version: 1,
        generated_at: '2026-02-08',
        items: [
          {
            id: '28b9f7b8-1c2c-4e7b-8a2e-3d0e1c88f9f1',
            createdAt: '2026-02-08T00:20:00Z',
            tier: 'P2',
            status: 'queued',
            title: 'Draft Stanton Times content calendar',
            businessUnit: 'stantontimes-network',
            missionType: 'content',
            role: 'Comms',
            attempts: 0,
            maxAttempts: 3,
          } as any,
        ],
      };

      // Migrate
      const { document: migratedDoc, result } = migrateQueueDocument(v1Doc);
      expect(result.persisted).toBe(true);
      expect(migratedDoc.version).toBe(2);

      // Load into queue
      const queue = new TaskQueue({ logger, now });
      queue.load(migratedDoc);

      // Route
      const router = new QueueRouter({ registry, logger, now });
      const prioritized = router.prioritize(queue.getTasks());

      expect(prioritized).toHaveLength(1);
      expect(prioritized[0].task.businessUnit).toBe('stantontimes-network');
      expect(prioritized[0].task.missionContext).toEqual({
        businessUnit: 'stantontimes-network',
        missionType: 'content',
        role: 'Comms',
      });
      // StantonTimes is high priority (300) + P2 (500) + content (20) + age bonus
      expect(prioritized[0].decision.breakdown.businessUnitScore).toBe(300);
    });
  });

  describe('backward compatibility', () => {
    it('tasks without mission metadata work in router', () => {
      const now = makeFixedNow();
      const logger = silentLogger();
      const registry = makeRegistryWithRealData();
      const queue = new TaskQueue({ logger, now });
      const router = new QueueRouter({ registry, logger, now });

      // Legacy task with no mission fields
      queue.enqueue({ title: 'Legacy task' });

      const prioritized = router.prioritize(queue.getTasks());
      expect(prioritized).toHaveLength(1);
      expect(prioritized[0].decision.breakdown.businessUnitScore).toBe(0);
      expect(prioritized[0].decision.breakdown.missionTypeScore).toBe(0);
      expect(prioritized[0].decision.warnings).toHaveLength(0);
    });

    it('mixed v1 and v2 tasks coexist', () => {
      const now = makeFixedNow();
      const logger = silentLogger();
      const queue = new TaskQueue({ logger, now });

      // Add modern task
      queue.enqueue({
        title: 'Modern task',
        businessUnit: 'ventureos',
        missionType: 'build',
      });

      // Add legacy task
      queue.enqueue({ title: 'Legacy task' });

      expect(queue.getTasks()).toHaveLength(2);

      const doc = queue.toDocument();
      expect(doc.version).toBe(2);
      expect(doc.items[0].missionContext).toBeDefined();
      expect(doc.items[1].missionContext).toBeUndefined();
    });
  });

  describe('business unit validation in routing', () => {
    it('reports warnings for invalid business unit', () => {
      const now = makeFixedNow();
      const logger = silentLogger();
      const registry = makeRegistryWithRealData();
      const queue = new TaskQueue({ logger, now });
      const router = new QueueRouter({ registry, logger, now });

      queue.enqueue({
        title: 'Unknown BU task',
        businessUnit: 'nonexistent-bu',
        missionType: 'build',
      });

      const prioritized = router.prioritize(queue.getTasks());
      expect(prioritized[0].decision.warnings).toContain('Unknown business unit: nonexistent-bu');
    });

    it('validates mission type against BU', () => {
      const now = makeFixedNow();
      const logger = silentLogger();
      const registry = makeRegistryWithRealData();
      const router = new QueueRouter({ registry, logger, now });
      const queue = new TaskQueue({ logger, now });

      queue.enqueue({
        title: 'Wrong mission type',
        businessUnit: 'ventureos',
        missionType: 'content', // Not allowed for ventureos
      });

      const prioritized = router.prioritize(queue.getTasks());
      expect(prioritized[0].decision.warnings.some((w) => w.includes('not allowed'))).toBe(true);
    });
  });

  describe('logging integration', () => {
    it('all queue operations include mission tags', () => {
      const logger = silentLogger();
      const queue = new TaskQueue({ logger, now: makeFixedNow() });

      const task = queue.enqueue({
        title: 'Logged task',
        businessUnit: 'bloom',
        missionType: 'build',
        role: 'Producer',
      });

      queue.updateStatus(task.id, 'running');
      queue.updateStatus(task.id, 'succeeded');

      // Check all info calls include mission tags
      const infoCalls = (logger.info as jest.Mock).mock.calls;
      const missionCalls = infoCalls.filter(([, meta]: [string, Record<string, unknown>]) =>
        meta?.businessUnit === 'bloom'
      );

      // enqueue + running + succeeded = 3 calls with mission tags
      expect(missionCalls.length).toBe(3);
    });
  });

  describe('stats aggregation', () => {
    it('correctly aggregates by business unit', () => {
      const queue = new TaskQueue({ logger: silentLogger(), now: makeFixedNow() });

      // 3 bloom tasks (1 queued, 1 running, 1 failed)
      const b1 = queue.enqueue({ title: 'B1', businessUnit: 'bloom' });
      const b2 = queue.enqueue({ title: 'B2', businessUnit: 'bloom' });
      const b3 = queue.enqueue({ title: 'B3', businessUnit: 'bloom' });
      queue.updateStatus(b2.id, 'running');
      queue.updateStatus(b3.id, 'failed', 'timeout');

      // 1 ventureos task
      queue.enqueue({ title: 'V1', businessUnit: 'ventureos' });

      const s = queue.stats();
      expect(s.bloom).toEqual({ total: 3, queued: 1, running: 1, failed: 1 });
      expect(s.ventureos).toEqual({ total: 1, queued: 1, running: 0, failed: 0 });
    });
  });
});

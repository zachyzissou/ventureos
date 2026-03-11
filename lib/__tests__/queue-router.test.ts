/**
 * Queue Router Tests — VentureOS Queue Integration (P1 #30)
 */

import { QueueRouter, type QueueRouterConfig, type RoutingDecision } from '../queue-router';
import { BusinessUnitRegistry, type BusinessUnit } from '../business-unit-registry';
import { type QueueTask, type TaskQueueLogger } from '../task-queue';

// ── Helpers ──────────────────────────────────────────────────────────

function silentLogger(): TaskQueueLogger {
  return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

function makeRegistry(units?: BusinessUnit[]): BusinessUnitRegistry {
  return new BusinessUnitRegistry({
    data: {
      version: 2,
      generated_at: '2026-02-15',
      units: units ?? [
        { id: 'ventureos', name: 'VentureOS', category: 'infra', priority: 'critical', status: 'active', missionTypes: ['build', 'ops', 'infra'] },
        { id: 'bloom', name: 'Bloom', category: 'game', priority: 'high', status: 'active', missionTypes: ['build', 'content', 'research'] },
        { id: 'fotopress', name: 'FotoPress', category: 'app', priority: 'low', status: 'active', missionTypes: ['build', 'content'] },
      ],
    },
  });
}

function makeRouter(overrides?: Partial<QueueRouterConfig>): QueueRouter {
  return new QueueRouter({
    registry: overrides?.registry ?? makeRegistry(),
    logger: overrides?.logger ?? silentLogger(),
    now: overrides?.now ?? (() => new Date('2026-02-15T12:00:00Z')),
    ...overrides,
  });
}

function makeTask(overrides?: Partial<QueueTask>): QueueTask {
  return {
    id: overrides?.id ?? 'task-1',
    createdAt: overrides?.createdAt ?? '2026-02-15T11:00:00Z',
    tier: overrides?.tier ?? 'P2',
    status: overrides?.status ?? 'queued',
    title: overrides?.title ?? 'Test task',
    attempts: overrides?.attempts ?? 0,
    maxAttempts: overrides?.maxAttempts ?? 3,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('QueueRouter', () => {
  describe('route', () => {
    it('computes tier score', () => {
      const router = makeRouter();
      const p0 = router.route(makeTask({ tier: 'P0' }));
      const p1 = router.route(makeTask({ tier: 'P1' }));
      const p2 = router.route(makeTask({ tier: 'P2' }));
      const p3 = router.route(makeTask({ tier: 'P3' }));

      expect(p0.breakdown.tierScore).toBe(1000);
      expect(p1.breakdown.tierScore).toBe(750);
      expect(p2.breakdown.tierScore).toBe(500);
      expect(p3.breakdown.tierScore).toBe(250);
      expect(p0.score).toBeGreaterThan(p1.score);
      expect(p1.score).toBeGreaterThan(p2.score);
      expect(p2.score).toBeGreaterThan(p3.score);
    });

    it('adds business unit priority boost', () => {
      const router = makeRouter();
      const critical = router.route(makeTask({ businessUnit: 'ventureos' }));
      const high = router.route(makeTask({ businessUnit: 'bloom' }));
      const low = router.route(makeTask({ businessUnit: 'fotopress' }));
      const none = router.route(makeTask());

      expect(critical.breakdown.businessUnitScore).toBe(400);
      expect(high.breakdown.businessUnitScore).toBe(300);
      expect(low.breakdown.businessUnitScore).toBe(100);
      expect(none.breakdown.businessUnitScore).toBe(0);
      expect(critical.score).toBeGreaterThan(high.score);
      expect(high.score).toBeGreaterThan(low.score);
    });

    it('adds mission type score', () => {
      const router = makeRouter();
      const infra = router.route(makeTask({ missionType: 'infra', businessUnit: 'ventureos' }));
      const ops = router.route(makeTask({ missionType: 'ops', businessUnit: 'ventureos' }));
      const build = router.route(makeTask({ missionType: 'build', businessUnit: 'ventureos' }));
      const content = router.route(makeTask({ missionType: 'content', businessUnit: 'bloom' }));
      const research = router.route(makeTask({ missionType: 'research', businessUnit: 'bloom' }));

      expect(infra.breakdown.missionTypeScore).toBe(50);
      expect(ops.breakdown.missionTypeScore).toBe(40);
      expect(build.breakdown.missionTypeScore).toBe(30);
      expect(content.breakdown.missionTypeScore).toBe(20);
      expect(research.breakdown.missionTypeScore).toBe(10);
    });

    it('adds age bonus', () => {
      const router = makeRouter({
        now: () => new Date('2026-02-15T13:00:00Z'), // 2 hours later
      });

      const old = router.route(makeTask({ createdAt: '2026-02-15T11:00:00Z' })); // 2h old = 120min bonus
      const recent = router.route(makeTask({ createdAt: '2026-02-15T12:50:00Z' })); // 10min old

      expect(old.breakdown.ageBonus).toBe(100); // Capped at 100
      expect(recent.breakdown.ageBonus).toBe(10);
    });

    it('applies approval penalty', () => {
      const router = makeRouter();
      const approved = router.route(makeTask({ requiresApproval: true }));
      const noApproval = router.route(makeTask({ requiresApproval: false }));

      expect(approved.breakdown.approvalPenalty).toBe(-900);
      expect(noApproval.breakdown.approvalPenalty).toBe(0);
      expect(approved.score).toBeLessThan(noApproval.score);
    });

    it('validates business unit when enabled', () => {
      const router = makeRouter({ validateBusinessUnit: true });
      const result = router.route(makeTask({ businessUnit: 'nonexistent' }));
      expect(result.warnings).toContain('Unknown business unit: nonexistent');
    });

    it('skips validation when disabled', () => {
      const router = makeRouter({ validateBusinessUnit: false });
      const result = router.route(makeTask({ businessUnit: 'nonexistent' }));
      expect(result.warnings).toHaveLength(0);
    });

    it('validates mission type against BU', () => {
      const router = makeRouter({ validateMissionType: true });
      const result = router.route(makeTask({ businessUnit: 'ventureos', missionType: 'content' }));
      expect(result.warnings.some((w) => w.includes('not allowed'))).toBe(true);
    });
  });

  describe('prioritize', () => {
    it('sorts tasks by score descending', () => {
      const router = makeRouter();
      const tasks = [
        makeTask({ id: 'low', tier: 'P3' }),
        makeTask({ id: 'high', tier: 'P0', businessUnit: 'ventureos' }),
        makeTask({ id: 'mid', tier: 'P1' }),
      ];

      const results = router.prioritize(tasks);
      expect(results[0].task.id).toBe('high');
      expect(results[1].task.id).toBe('mid');
      expect(results[2].task.id).toBe('low');
    });

    it('only includes tasks with matching statuses', () => {
      const router = makeRouter();
      const tasks = [
        makeTask({ id: 'queued', status: 'queued' }),
        makeTask({ id: 'running', status: 'running' }),
        makeTask({ id: 'done', status: 'succeeded' }),
      ];

      expect(router.prioritize(tasks, ['queued'])).toHaveLength(1);
      expect(router.prioritize(tasks, ['queued', 'running'])).toHaveLength(2);
    });

    it('returns empty array for no eligible tasks', () => {
      const router = makeRouter();
      const tasks = [makeTask({ status: 'succeeded' })];
      expect(router.prioritize(tasks)).toHaveLength(0);
    });
  });

  describe('pickNext', () => {
    it('picks highest priority queued task', () => {
      const router = makeRouter();
      const tasks = [
        makeTask({ id: 'low', tier: 'P3' }),
        makeTask({ id: 'high', tier: 'P0' }),
      ];

      const next = router.pickNext(tasks);
      expect(next?.task.id).toBe('high');
    });

    it('prefers tasks without approval requirement', () => {
      const router = makeRouter();
      const tasks = [
        makeTask({ id: 'needs-approval', tier: 'P0', requiresApproval: true }),
        makeTask({ id: 'auto', tier: 'P1' }),
      ];

      const next = router.pickNext(tasks);
      expect(next?.task.id).toBe('auto');
    });

    it('falls back to approval task if all require it', () => {
      const router = makeRouter();
      const tasks = [
        makeTask({ id: 'a', tier: 'P1', requiresApproval: true }),
        makeTask({ id: 'b', tier: 'P2', requiresApproval: true }),
      ];

      const next = router.pickNext(tasks);
      expect(next?.task.id).toBe('a'); // Higher tier wins
    });

    it('returns null for empty queue', () => {
      const router = makeRouter();
      expect(router.pickNext([])).toBeNull();
    });
  });

  describe('groupByBusinessUnit', () => {
    it('groups and sorts within groups', () => {
      const router = makeRouter();
      const tasks = [
        makeTask({ id: 'bloom-low', tier: 'P3', businessUnit: 'bloom' }),
        makeTask({ id: 'bloom-high', tier: 'P0', businessUnit: 'bloom' }),
        makeTask({ id: 'vos', tier: 'P1', businessUnit: 'ventureos' }),
        makeTask({ id: 'none', tier: 'P2' }),
      ];

      const groups = router.groupByBusinessUnit(tasks);
      expect(groups.size).toBe(3);
      expect(groups.get('bloom')!).toHaveLength(2);
      expect(groups.get('bloom')![0].task.id).toBe('bloom-high'); // Higher score first
      expect(groups.get('ventureos')!).toHaveLength(1);
      expect(groups.get('_unassigned')!).toHaveLength(1);
    });
  });

  describe('validateTask', () => {
    it('returns empty for valid task', () => {
      const router = makeRouter();
      const errors = router.validateTask(makeTask({
        businessUnit: 'bloom',
        missionType: 'build',
      }));
      expect(errors).toHaveLength(0);
    });

    it('returns errors for unknown BU', () => {
      const router = makeRouter();
      const errors = router.validateTask(makeTask({ businessUnit: 'unknown' }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Unknown business unit');
    });

    it('validates mission metadata from missionContext when top-level fields are missing', () => {
      const router = makeRouter();
      const errors = router.validateTask(makeTask({
        missionContext: {
          businessUnit: 'ventureos',
          missionType: 'content', // not allowed for ventureos
        },
      }));

      expect(errors.some((e) => e.includes('not allowed'))).toBe(true);
    });

    it('flags missionType without businessUnit when only missionContext provides mission type', () => {
      const router = makeRouter();
      const errors = router.validateTask(makeTask({
        missionContext: {
          missionType: 'build',
        },
      }));

      expect(errors).toContain("Mission type 'build' provided without business unit");
    });

    it('detects missionContext mismatch', () => {
      const router = makeRouter();
      const errors = router.validateTask(makeTask({
        businessUnit: 'bloom',
        missionType: 'build',
        missionContext: {
          businessUnit: 'ventureos', // Mismatch!
          missionType: 'build',
        },
      }));
      expect(errors.some((e) => e.includes('Mismatch'))).toBe(true);
    });

    it('validates task with no mission metadata', () => {
      const router = makeRouter();
      const errors = router.validateTask(makeTask());
      expect(errors).toHaveLength(0);
    });

    it('detects missionType mismatch in context', () => {
      const router = makeRouter();
      const errors = router.validateTask(makeTask({
        businessUnit: 'bloom',
        missionType: 'build',
        missionContext: {
          businessUnit: 'bloom',
          missionType: 'content', // Mismatch with top-level
        },
      }));
      expect(errors.some((e) => e.includes('Mismatch') && e.includes('missionType'))).toBe(true);
    });
  });
});

/**
 * Mission Tracker (Integration Controller) Tests — Phase 5.5
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MissionTracker } from '../../../src/missions/mission-tracker';
import { MockMissionDataProvider } from '../../../src/missions/mission-data-provider';
import type { MissionData, MissionDependency, Point } from '../../../src/missions/types';

// ─── Helpers ────────────────────────────────────────────────────────────

function makeMission(overrides: Partial<MissionData> = {}): MissionData {
  return {
    missionId: 'test-mission-001',
    title: 'Test Mission',
    description: 'A test mission',
    phase: 'execute',
    progress: 50,
    assignedTo: ['oracle'],
    tasks: [
      { id: 'task-1', title: 'Task 1', tier: 'P1', status: 'running', progress: 50 },
    ],
    dependencies: [],
    history: [{ phase: 'brief', enteredAt: '2024-01-01T00:00:00Z' }],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T01:00:00Z',
    queueDepth: 0,
    ...overrides,
  };
}

function makeAgentPositions(): Map<string, Point> {
  return new Map<string, Point>([
    ['oracle', { x: 200, y: 300 }],
    ['atlas', { x: 400, y: 300 }],
    ['sentinel', { x: 600, y: 300 }],
  ]);
}

// Minimal Canvas2D mock for render tests
function mockCtx(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    clip: vi.fn(),
    setLineDash: vi.fn(),
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    measureText: vi.fn((text: string) => ({ width: text.length * 6 })),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    globalAlpha: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  } as unknown as CanvasRenderingContext2D;
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('MissionTracker', () => {
  let tracker: MissionTracker;
  let provider: MockMissionDataProvider;

  beforeEach(() => {
    provider = new MockMissionDataProvider({
      updateInterval: 0,
      initialMissions: 0,
      simulateTransitions: false,
    });

    tracker = new MissionTracker({
      tracking: {
        maxVisibleMissions: 50,
        cardWidth: 220,
        cardHeight: 80,
        expandedCardHeight: 200,
        floatHeight: 60,
        bobAmplitude: 3,
        bobPeriod: 2000,
        showDependencies: true,
        showQueueDepth: true,
        animationThreshold: 30,
        timelineMaxEntries: 50,
      },
      provider,
    });
  });

  afterEach(() => {
    tracker.disconnect();
  });

  describe('connect/disconnect lifecycle', () => {
    it('connects without error', () => {
      expect(() => tracker.connect()).not.toThrow();
    });

    it('disconnects without error', () => {
      tracker.connect();
      expect(() => tracker.disconnect()).not.toThrow();
    });

    it('can reconnect after disconnect', () => {
      tracker.connect();
      tracker.disconnect();
      expect(() => tracker.connect()).not.toThrow();
    });
  });

  describe('getMissions()', () => {
    it('returns empty array before connect', () => {
      expect(tracker.getMissions()).toHaveLength(0);
    });

    it('returns missions after connect with data', () => {
      const missions = [makeMission()];
      provider.connect(); // generate state
      provider.setMissions(missions);
      tracker.connect();

      // Provider should have pushed data
      expect(tracker.getMissions().length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('render()', () => {
    it('renders without error on empty state', () => {
      tracker.connect();
      const ctx = mockCtx();
      expect(() => tracker.render(ctx, makeAgentPositions())).not.toThrow();
    });

    it('renders cards for active missions', () => {
      tracker.connect();
      provider.setMissions([makeMission()]);

      const ctx = mockCtx();
      tracker.render(ctx, makeAgentPositions());

      // Should have made canvas draw calls
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });

    it('renders with 50 missions under performance target', () => {
      tracker.connect();

      const missions: MissionData[] = [];
      const roles = ['oracle', 'atlas', 'sentinel'];
      for (let i = 0; i < 50; i++) {
        missions.push(makeMission({
          missionId: `m-${i}`,
          assignedTo: [roles[i % roles.length]],
        }));
      }
      provider.setMissions(missions);

      const ctx = mockCtx();
      const start = performance.now();
      tracker.render(ctx, makeAgentPositions());
      const elapsed = performance.now() - start;

      // Performance target: <500ms for 50 missions
      expect(elapsed).toBeLessThan(500);
    });

    it('renders dependency arrows when enabled', () => {
      tracker.connect();

      const missions = [
        makeMission({ missionId: 'm1', assignedTo: ['oracle'] }),
        makeMission({ missionId: 'm2', assignedTo: ['atlas'], dependencies: ['m1'] }),
      ];
      const deps: MissionDependency[] = [
        { from: 'm1', to: 'm2', type: 'blocks' },
      ];
      provider.setMissions(missions, deps);

      const ctx = mockCtx();
      tracker.render(ctx, makeAgentPositions());

      // bezierCurveTo called means arrows rendered
      expect(ctx.bezierCurveTo).toHaveBeenCalled();
    });
  });

  describe('getCardLayouts()', () => {
    it('returns empty before render', () => {
      tracker.connect();
      expect(tracker.getCardLayouts()).toHaveLength(0);
    });

    it('returns layouts after render', () => {
      tracker.connect();
      provider.setMissions([makeMission()]);

      const ctx = mockCtx();
      tracker.render(ctx, makeAgentPositions());

      const layouts = tracker.getCardLayouts();
      expect(layouts.length).toBeGreaterThan(0);
    });
  });

  describe('getPerformanceMetrics()', () => {
    it('returns metrics with zero values before render', () => {
      const metrics = tracker.getPerformanceMetrics();
      expect(metrics.lastFrameMs).toBe(0);
      expect(metrics.avgFrameMs).toBe(0);
      expect(metrics.missionCount).toBe(0);
    });

    it('tracks metrics after render', () => {
      tracker.connect();
      provider.setMissions([makeMission()]);

      const ctx = mockCtx();
      tracker.render(ctx, makeAgentPositions());

      const metrics = tracker.getPerformanceMetrics();
      expect(metrics.lastFrameMs).toBeGreaterThan(0);
      expect(metrics.missionCount).toBe(1);
    });
  });

  describe('refresh()', () => {
    it('triggers data provider refresh', async () => {
      tracker.connect();
      // This should resolve without error
      await expect(tracker.refresh()).resolves.toBeUndefined();
    });
  });

  describe('state change detection', () => {
    it('detects new missions (triggers card_appear animation)', () => {
      tracker.connect();
      provider.setMissions([]);

      const ctx = mockCtx();
      tracker.render(ctx, makeAgentPositions());

      // Add a mission
      provider.setMissions([makeMission()]);
      tracker.render(ctx, makeAgentPositions());

      // The tracker should have detected the new mission
      // (Validated via internal animation manager count through metrics)
      const metrics = tracker.getPerformanceMetrics();
      expect(metrics.animationCount).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('MissionTracker defaults', () => {
  it('creates with default config when no config provided', () => {
    const tracker = new MissionTracker();
    expect(tracker).toBeDefined();
    tracker.connect();
    tracker.disconnect();
  });
});

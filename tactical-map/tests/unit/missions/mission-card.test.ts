/**
 * Mission Card Tests — Phase 5.5
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateCardLayouts,
  truncateText,
} from '../../../src/missions/mission-card';
import type { MissionData, MissionCardLayout, Point, MissionTrackingConfig } from '../../../src/missions/types';
import { DEFAULT_CONFIG } from '../../../src/missions/types';

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
      { id: 'task-2', title: 'Task 2', tier: 'P2', status: 'queued', progress: 0 },
    ],
    dependencies: [],
    history: [{ phase: 'brief', enteredAt: '2024-01-01T00:00:00Z' }],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T01:00:00Z',
    queueDepth: 1,
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

// Mock CanvasRenderingContext2D for truncateText
function mockCtx(): CanvasRenderingContext2D {
  return {
    measureText: vi.fn((text: string) => ({
      width: text.length * 6, // 6px per char approximation
    })),
  } as unknown as CanvasRenderingContext2D;
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('calculateCardLayouts', () => {
  it('returns layouts for each mission with an agent position', () => {
    const missions = [makeMission()];
    const positions = makeAgentPositions();
    const layouts = calculateCardLayouts(missions, positions);

    expect(layouts).toHaveLength(1);
    expect(layouts[0].missionId).toBe('test-mission-001');
  });

  it('positions card centered above agent', () => {
    const missions = [makeMission()];
    const positions = makeAgentPositions();
    const layouts = calculateCardLayouts(missions, positions, DEFAULT_CONFIG, 0);

    const layout = layouts[0];
    const agentPos = positions.get('oracle')!;

    // Card should be roughly centered on agent X
    expect(layout.position.x).toBeCloseTo(agentPos.x - DEFAULT_CONFIG.cardWidth / 2, 0);
    // Card should be above agent
    expect(layout.position.y).toBeLessThan(agentPos.y);
  });

  it('stacks multiple missions vertically for same agent', () => {
    const missions = [
      makeMission({ missionId: 'mission-1' }),
      makeMission({ missionId: 'mission-2' }),
    ];
    const positions = makeAgentPositions();
    const layouts = calculateCardLayouts(missions, positions);

    expect(layouts).toHaveLength(2);
    // Second card should be higher (lower y)
    expect(layouts[1].position.y).toBeLessThan(layouts[0].position.y);
  });

  it('limits stack to 3 cards per agent', () => {
    const missions = [
      makeMission({ missionId: 'mission-1' }),
      makeMission({ missionId: 'mission-2' }),
      makeMission({ missionId: 'mission-3' }),
      makeMission({ missionId: 'mission-4' }),
    ];
    const positions = makeAgentPositions();
    const layouts = calculateCardLayouts(missions, positions);

    expect(layouts).toHaveLength(3); // Max 3 per agent
  });

  it('reduces opacity for stacked cards', () => {
    const missions = [
      makeMission({ missionId: 'mission-1' }),
      makeMission({ missionId: 'mission-2' }),
      makeMission({ missionId: 'mission-3' }),
    ];
    const positions = makeAgentPositions();
    const layouts = calculateCardLayouts(missions, positions);

    expect(layouts[0].opacity).toBeGreaterThan(layouts[1].opacity);
    expect(layouts[1].opacity).toBeGreaterThan(layouts[2].opacity);
  });

  it('returns empty array for empty missions', () => {
    const layouts = calculateCardLayouts([], makeAgentPositions());
    expect(layouts).toHaveLength(0);
  });

  it('skips missions with no matching agent position', () => {
    const missions = [makeMission({ assignedTo: ['nonexistent'] })];
    const positions = makeAgentPositions();
    const layouts = calculateCardLayouts(missions, positions);

    expect(layouts).toHaveLength(0);
  });

  it('skips missions with empty assignedTo', () => {
    const missions = [makeMission({ assignedTo: [] })];
    const positions = makeAgentPositions();
    const layouts = calculateCardLayouts(missions, positions);

    expect(layouts).toHaveLength(0);
  });

  it('expands card in execute phase when single mission', () => {
    const missions = [makeMission({ phase: 'execute' })];
    const positions = makeAgentPositions();
    const layouts = calculateCardLayouts(missions, positions);

    expect(layouts[0].expanded).toBe(true);
    expect(layouts[0].size.height).toBe(DEFAULT_CONFIG.expandedCardHeight);
  });

  it('does not expand cards when multiple missions per agent', () => {
    const missions = [
      makeMission({ missionId: 'm-1', phase: 'execute' }),
      makeMission({ missionId: 'm-2', phase: 'execute' }),
    ];
    const positions = makeAgentPositions();
    const layouts = calculateCardLayouts(missions, positions);

    // All cards are normal height
    for (const layout of layouts) {
      expect(layout.size.height).toBe(DEFAULT_CONFIG.cardHeight);
    }
  });

  it('distributes missions to different agents correctly', () => {
    const missions = [
      makeMission({ missionId: 'm-1', assignedTo: ['oracle'] }),
      makeMission({ missionId: 'm-2', assignedTo: ['atlas'] }),
    ];
    const positions = makeAgentPositions();
    const layouts = calculateCardLayouts(missions, positions);

    expect(layouts).toHaveLength(2);
    // Positions should differ based on agent location
    expect(layouts[0].position.x).not.toBe(layouts[1].position.x);
  });
});

describe('truncateText', () => {
  it('returns text unchanged if it fits', () => {
    const ctx = mockCtx();
    expect(truncateText(ctx, 'Hello', 100)).toBe('Hello');
  });

  it('truncates with ellipsis when text is too long', () => {
    const ctx = mockCtx();
    const result = truncateText(ctx, 'This is a very long title that should be truncated', 60);
    expect(result).toContain('…');
    expect(result.length).toBeLessThan('This is a very long title that should be truncated'.length);
  });

  it('handles empty string', () => {
    const ctx = mockCtx();
    expect(truncateText(ctx, '', 100)).toBe('');
  });
});

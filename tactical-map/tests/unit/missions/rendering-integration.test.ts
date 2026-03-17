/**
 * Rendering Integration Tests — Phase 5.5
 *
 * Tests that exercise the Canvas2D rendering functions with mock contexts.
 * These ensure rendering code paths don't crash and produce expected calls.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderMissionCard, renderAllMissionCards, calculateCardLayouts } from '../../../src/missions/mission-card';
import { renderQueueDepthBar, renderAllQueueDepthBars, renderQueueSummaryPanel } from '../../../src/missions/task-queue-viz';
import { renderLinearProgress, renderCircularProgress, renderPhaseSteps, renderProgressBadge } from '../../../src/missions/progress-indicator';
import { renderArrow, renderAllArrows, calculateArrowPaths } from '../../../src/missions/dependency-arrows';
import { renderTimeline, renderTimelinePanel } from '../../../src/missions/mission-timeline';
import { renderParticles, createCompletionParticles, renderPhaseTransitionRipple } from '../../../src/missions/completion-animations';
import { PHASE_COLORS, DEFAULT_CONFIG } from '../../../src/missions/types';
import type { MissionData, MissionCardLayout, ArrowPath, Point, MissionDependency, MissionHistoryEntry } from '../../../src/missions/types';

// ─── Mock Canvas Context ────────────────────────────────────────────────

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
    lineCap: 'butt' as const,
    globalAlpha: 1,
    font: '',
    textAlign: 'left' as const,
    textBaseline: 'alphabetic' as const,
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  } as unknown as CanvasRenderingContext2D;
}

function makeMission(overrides: Partial<MissionData> = {}): MissionData {
  return {
    missionId: 'test-m',
    title: 'Test Mission',
    description: 'Test',
    phase: 'execute',
    progress: 50,
    assignedTo: ['venture_research'],
    tasks: [
      { id: 't1', title: 'Task 1', tier: 'P1', status: 'running', progress: 50, role: 'venture_research' },
      { id: 't2', title: 'Task 2', tier: 'P2', status: 'queued', progress: 0, role: 'venture_research' },
    ],
    dependencies: [],
    history: [
      { phase: 'brief', enteredAt: '2024-01-01T00:00:00Z', note: 'Created' },
      { phase: 'plan', enteredAt: '2024-01-01T00:10:00Z', note: 'Planned' },
      { phase: 'execute', enteredAt: '2024-01-01T00:20:00Z', note: 'Executing' },
    ],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T01:00:00Z',
    queueDepth: 1,
    ...overrides,
  };
}

function makeLayout(mission: MissionData, expanded = false): MissionCardLayout {
  return {
    missionId: mission.missionId,
    position: { x: 100, y: 100 },
    size: { width: 220, height: expanded ? 200 : 80 },
    opacity: 1,
    floatOffset: 0,
    expanded,
  };
}

// ─── renderMissionCard ──────────────────────────────────────────────────

describe('renderMissionCard', () => {
  it('renders without error for normal mission', () => {
    const ctx = mockCtx();
    const mission = makeMission();
    const layout = makeLayout(mission);
    expect(() => renderMissionCard(ctx, mission, layout)).not.toThrow();
  });

  it('renders expanded card with task list', () => {
    const ctx = mockCtx();
    const mission = makeMission({
      tasks: [
        { id: 't1', title: 'Task 1', tier: 'P0', status: 'succeeded', progress: 100 },
        { id: 't2', title: 'Task 2', tier: 'P1', status: 'running', progress: 60 },
        { id: 't3', title: 'Task 3', tier: 'P2', status: 'queued', progress: 0 },
        { id: 't4', title: 'Task 4', tier: 'P3', status: 'failed', progress: 30 },
      ],
    });
    const layout = makeLayout(mission, true);
    expect(() => renderMissionCard(ctx, mission, layout)).not.toThrow();
  });

  it('renders error state mission', () => {
    const ctx = mockCtx();
    const mission = makeMission({
      phase: 'error',
      error: { message: 'Gate checks failed', code: 'gates_failed' },
    });
    const layout = makeLayout(mission);
    expect(() => renderMissionCard(ctx, mission, layout)).not.toThrow();
  });

  it('renders mission with many assigned roles', () => {
    const ctx = mockCtx();
    const mission = makeMission({
      assignedTo: ['venture_research', 'venture_infrastructure', 'venture_security', 'venture_evidence', 'venture_memory'],
    });
    const layout = makeLayout(mission);
    expect(() => renderMissionCard(ctx, mission, layout)).not.toThrow();
  });

  it('renders with 0% progress', () => {
    const ctx = mockCtx();
    const mission = makeMission({ progress: 0, phase: 'brief' });
    const layout = makeLayout(mission);
    expect(() => renderMissionCard(ctx, mission, layout)).not.toThrow();
  });

  it('renders with 100% progress', () => {
    const ctx = mockCtx();
    const mission = makeMission({ progress: 100, phase: 'closed' });
    const layout = makeLayout(mission);
    expect(() => renderMissionCard(ctx, mission, layout)).not.toThrow();
  });

  it('renders mission with no queue depth', () => {
    const ctx = mockCtx();
    const mission = makeMission({ queueDepth: 0 });
    const layout = makeLayout(mission);
    expect(() => renderMissionCard(ctx, mission, layout, { ...DEFAULT_CONFIG, showQueueDepth: true })).not.toThrow();
  });

  it('renders expanded card with more than 6 tasks (overflow)', () => {
    const ctx = mockCtx();
    const tasks = Array.from({ length: 10 }, (_, i) => ({
      id: `t${i}`, title: `Task ${i}`, tier: 'P2' as const, status: 'queued' as const, progress: 0,
    }));
    const mission = makeMission({ tasks });
    const layout = makeLayout(mission, true);
    expect(() => renderMissionCard(ctx, mission, layout)).not.toThrow();
  });
});

describe('renderAllMissionCards', () => {
  it('renders multiple cards sorted by z-order', () => {
    const ctx = mockCtx();
    const m1 = makeMission({ missionId: 'm1' });
    const m2 = makeMission({ missionId: 'm2' });
    const l1 = makeLayout(m1, false);
    const l2 = makeLayout(m2, true); // expanded renders on top
    expect(() => renderAllMissionCards(ctx, [m1, m2], [l1, l2])).not.toThrow();
  });

  it('skips layouts with no matching mission', () => {
    const ctx = mockCtx();
    const m1 = makeMission({ missionId: 'm1' });
    const orphanLayout: MissionCardLayout = { ...makeLayout(m1), missionId: 'nonexistent' };
    expect(() => renderAllMissionCards(ctx, [m1], [orphanLayout])).not.toThrow();
  });
});

// ─── renderQueueDepthBar ────────────────────────────────────────────────

describe('renderQueueDepthBar', () => {
  it('renders without error', () => {
    const ctx = mockCtx();
    const stats = {
      role: 'venture_research', totalQueued: 5, totalRunning: 2, totalFailed: 0,
      tierBreakdown: { P0: 1, P1: 2, P2: 1, P3: 1 }, oldestQueuedAge: 60000,
    };
    expect(() => renderQueueDepthBar(ctx, { x: 200, y: 300 }, stats)).not.toThrow();
  });

  it('skips rendering when no active tasks', () => {
    const ctx = mockCtx();
    const stats = {
      role: 'venture_research', totalQueued: 0, totalRunning: 0, totalFailed: 0,
      tierBreakdown: { P0: 0, P1: 0, P2: 0, P3: 0 }, oldestQueuedAge: 0,
    };
    renderQueueDepthBar(ctx, { x: 200, y: 300 }, stats);
    // Should not render much if no active tasks
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
});

describe('renderQueueSummaryPanel', () => {
  it('renders panel for missions with tasks', () => {
    const ctx = mockCtx();
    const missions = [makeMission()];
    expect(() =>
      renderQueueSummaryPanel(ctx, missions, { x: 0, y: 0, width: 300, maxRows: 5 })
    ).not.toThrow();
  });

  it('renders with empty missions', () => {
    const ctx = mockCtx();
    expect(() =>
      renderQueueSummaryPanel(ctx, [], { x: 0, y: 0, width: 300, maxRows: 5 })
    ).not.toThrow();
  });
});

// ─── Progress Indicators ────────────────────────────────────────────────

describe('renderLinearProgress', () => {
  it('renders at various progress levels', () => {
    const ctx = mockCtx();
    const colors = PHASE_COLORS.execute;
    for (const progress of [0, 25, 50, 75, 100]) {
      expect(() => renderLinearProgress(ctx, 10, 10, progress, colors)).not.toThrow();
    }
  });

  it('renders with animated shimmer', () => {
    const ctx = mockCtx();
    const colors = PHASE_COLORS.execute;
    expect(() =>
      renderLinearProgress(ctx, 10, 10, 50, colors, {
        width: 200, height: 10, borderRadius: 5,
        showLabel: true, labelPosition: 'inside', animated: true,
      }, 1000)
    ).not.toThrow();
  });

  it('renders with label above', () => {
    const ctx = mockCtx();
    const colors = PHASE_COLORS.plan;
    expect(() =>
      renderLinearProgress(ctx, 10, 10, 50, colors, {
        width: 200, height: 10, borderRadius: 5,
        showLabel: true, labelPosition: 'above', animated: false,
      })
    ).not.toThrow();
  });

  it('renders without label', () => {
    const ctx = mockCtx();
    const colors = PHASE_COLORS.brief;
    expect(() =>
      renderLinearProgress(ctx, 10, 10, 50, colors, {
        width: 200, height: 10, borderRadius: 5,
        showLabel: false, labelPosition: 'right', animated: false,
      })
    ).not.toThrow();
  });
});

describe('renderCircularProgress', () => {
  it('renders at various progress levels', () => {
    const ctx = mockCtx();
    const colors = PHASE_COLORS.verify;
    for (const progress of [0, 25, 50, 75, 100]) {
      expect(() => renderCircularProgress(ctx, 50, 50, progress, colors)).not.toThrow();
    }
  });
});

describe('renderPhaseSteps', () => {
  it('renders for each phase', () => {
    const ctx = mockCtx();
    const phases = ['brief', 'plan', 'execute', 'verify', 'deliver', 'closed'] as const;
    for (const phase of phases) {
      expect(() => renderPhaseSteps(ctx, 10, 50, phase)).not.toThrow();
    }
  });

  it('renders without labels', () => {
    const ctx = mockCtx();
    expect(() => renderPhaseSteps(ctx, 10, 50, 'execute', {
      dotRadius: 6, spacing: 36, lineWidth: 2, showLabels: false,
    })).not.toThrow();
  });
});

describe('renderProgressBadge', () => {
  it('renders badge for various phases', () => {
    const ctx = mockCtx();
    expect(() => renderProgressBadge(ctx, 10, 10, 50, 'execute')).not.toThrow();
    expect(() => renderProgressBadge(ctx, 10, 10, 0, 'brief')).not.toThrow();
    expect(() => renderProgressBadge(ctx, 10, 10, 100, 'closed')).not.toThrow();
  });
});

// ─── Dependency Arrows ──────────────────────────────────────────────────

describe('renderArrow', () => {
  const arrow: ArrowPath = {
    from: { x: 100, y: 200 },
    to: { x: 400, y: 200 },
    controlPoints: [{ x: 200, y: 200 }, { x: 300, y: 200 }],
    color: '#FF7043',
    type: 'blocks',
  };

  it('renders solid arrow (blocks)', () => {
    const ctx = mockCtx();
    expect(() => renderArrow(ctx, arrow)).not.toThrow();
    expect(ctx.bezierCurveTo).toHaveBeenCalled();
  });

  it('renders dashed arrow (informs)', () => {
    const ctx = mockCtx();
    const dashedArrow: ArrowPath = { ...arrow, type: 'informs', dashPattern: [6, 4] };
    expect(() => renderArrow(ctx, dashedArrow)).not.toThrow();
    expect(ctx.setLineDash).toHaveBeenCalled();
  });

  it('renders with particles', () => {
    const ctx = mockCtx();
    expect(() => renderArrow(ctx, arrow, {
      lineWidth: 1.5, arrowheadSize: 8, curvature: 0.3,
      showParticles: true, particleSpeed: 60, particleCount: 3,
    }, 5000)).not.toThrow();
  });

  it('renders without particles', () => {
    const ctx = mockCtx();
    expect(() => renderArrow(ctx, arrow, {
      lineWidth: 1.5, arrowheadSize: 8, curvature: 0.3,
      showParticles: false, particleSpeed: 60, particleCount: 0,
    })).not.toThrow();
  });

  it('handles arrow with no control points (straight line)', () => {
    const ctx = mockCtx();
    const straightArrow: ArrowPath = {
      from: { x: 0, y: 0 }, to: { x: 100, y: 0 },
      controlPoints: [], color: '#66BB6A', type: 'feeds',
    };
    expect(() => renderArrow(ctx, straightArrow)).not.toThrow();
  });
});

describe('renderAllArrows', () => {
  it('renders multiple arrows', () => {
    const ctx = mockCtx();
    const arrows: ArrowPath[] = [
      { from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, controlPoints: [{ x: 30, y: 0 }, { x: 70, y: 0 }], color: '#F00', type: 'blocks' },
      { from: { x: 0, y: 100 }, to: { x: 100, y: 100 }, controlPoints: [{ x: 30, y: 100 }, { x: 70, y: 100 }], color: '#00F', type: 'informs' },
    ];
    expect(() => renderAllArrows(ctx, arrows)).not.toThrow();
  });
});

// ─── Timeline ───────────────────────────────────────────────────────────

describe('renderTimeline', () => {
  it('renders timeline for mission history', () => {
    const ctx = mockCtx();
    const history: MissionHistoryEntry[] = [
      { phase: 'brief', enteredAt: '2024-01-01T00:00:00Z', note: 'Created' },
      { phase: 'plan', enteredAt: '2024-01-01T00:10:00Z' },
      { phase: 'execute', enteredAt: '2024-01-01T00:20:00Z', note: 'Executing' },
    ];

    const height = renderTimeline(ctx, 10, 10, history);
    expect(height).toBeGreaterThan(0);
  });

  it('returns 0 for empty history', () => {
    const ctx = mockCtx();
    const height = renderTimeline(ctx, 10, 10, []);
    expect(height).toBe(0);
  });

  it('renders in compact mode', () => {
    const ctx = mockCtx();
    const history: MissionHistoryEntry[] = [
      { phase: 'brief', enteredAt: '2024-01-01T00:00:00Z' },
    ];
    expect(() =>
      renderTimeline(ctx, 10, 10, history, {
        entryHeight: 20, railX: 10, dotRadius: 3, railWidth: 1,
        maxEntries: 8, showDurations: false, compact: true,
      })
    ).not.toThrow();
  });
});

describe('renderTimelinePanel', () => {
  it('renders panel with missions', () => {
    const ctx = mockCtx();
    const missions = [makeMission()];
    const height = renderTimelinePanel(ctx, missions, {
      x: 0, y: 0, width: 300, maxHeight: 400,
    });
    expect(height).toBeGreaterThan(0);
  });

  it('renders empty state', () => {
    const ctx = mockCtx();
    const height = renderTimelinePanel(ctx, [], {
      x: 0, y: 0, width: 300, maxHeight: 400,
    });
    expect(height).toBeGreaterThan(0); // Still renders header
  });
});

// ─── Particles ──────────────────────────────────────────────────────────

describe('renderParticles', () => {
  it('renders particles without error', () => {
    const ctx = mockCtx();
    const particles = createCompletionParticles({ x: 100, y: 100 }, 10);
    expect(() => renderParticles(ctx, particles)).not.toThrow();
    expect(ctx.arc).toHaveBeenCalled();
  });

  it('handles empty particle array', () => {
    const ctx = mockCtx();
    expect(() => renderParticles(ctx, [])).not.toThrow();
  });
});

describe('renderPhaseTransitionRipple', () => {
  it('renders ripple at various progress levels', () => {
    const ctx = mockCtx();
    for (const p of [0, 0.25, 0.5, 0.75]) {
      expect(() => renderPhaseTransitionRipple(ctx, { x: 100, y: 100 }, p, '#4FC3F7')).not.toThrow();
    }
  });

  it('skips rendering at progress = 1', () => {
    const ctx = mockCtx();
    renderPhaseTransitionRipple(ctx, { x: 100, y: 100 }, 1, '#FFF');
    // Should return early
    expect(ctx.arc).not.toHaveBeenCalled();
  });
});

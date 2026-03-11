/**
 * Dependency Arrows Tests — Phase 5.5
 */
import { describe, it, expect } from 'vitest';
import {
  calculateArrowPaths,
  getPointOnCubicBezier,
} from '../../../src/missions/dependency-arrows';
import type { MissionDependency, MissionCardLayout, Point } from '../../../src/missions/types';

function makeLayout(id: string, x: number, y: number): MissionCardLayout {
  return {
    missionId: id,
    position: { x, y },
    size: { width: 220, height: 80 },
    opacity: 1,
    floatOffset: 0,
    expanded: false,
  };
}

describe('calculateArrowPaths', () => {
  it('returns arrow paths for valid dependencies', () => {
    const deps: MissionDependency[] = [
      { from: 'm1', to: 'm2', type: 'blocks' },
    ];
    const layouts = new Map<string, MissionCardLayout>([
      ['m1', makeLayout('m1', 100, 200)],
      ['m2', makeLayout('m2', 400, 200)],
    ]);

    const paths = calculateArrowPaths(deps, layouts);
    expect(paths).toHaveLength(1);
    expect(paths[0].type).toBe('blocks');
    expect(paths[0].from).toBeDefined();
    expect(paths[0].to).toBeDefined();
    expect(paths[0].controlPoints).toHaveLength(2);
  });

  it('skips dependencies with missing layouts', () => {
    const deps: MissionDependency[] = [
      { from: 'm1', to: 'm-missing', type: 'informs' },
    ];
    const layouts = new Map<string, MissionCardLayout>([
      ['m1', makeLayout('m1', 100, 200)],
    ]);

    const paths = calculateArrowPaths(deps, layouts);
    expect(paths).toHaveLength(0);
  });

  it('returns empty for empty dependencies', () => {
    const layouts = new Map<string, MissionCardLayout>([
      ['m1', makeLayout('m1', 100, 200)],
    ]);
    const paths = calculateArrowPaths([], layouts);
    expect(paths).toHaveLength(0);
  });

  it('handles multiple dependency types', () => {
    const deps: MissionDependency[] = [
      { from: 'm1', to: 'm2', type: 'blocks' },
      { from: 'm2', to: 'm3', type: 'informs' },
      { from: 'm1', to: 'm3', type: 'feeds' },
    ];
    const layouts = new Map<string, MissionCardLayout>([
      ['m1', makeLayout('m1', 100, 200)],
      ['m2', makeLayout('m2', 400, 200)],
      ['m3', makeLayout('m3', 700, 200)],
    ]);

    const paths = calculateArrowPaths(deps, layouts);
    expect(paths).toHaveLength(3);
    expect(paths.map((p) => p.type)).toEqual(['blocks', 'informs', 'feeds']);
  });

  it('assigns correct colors per type', () => {
    const deps: MissionDependency[] = [
      { from: 'm1', to: 'm2', type: 'blocks' },
      { from: 'm1', to: 'm2', type: 'informs' },
      { from: 'm1', to: 'm2', type: 'feeds' },
    ];
    const layouts = new Map<string, MissionCardLayout>([
      ['m1', makeLayout('m1', 100, 200)],
      ['m2', makeLayout('m2', 400, 200)],
    ]);

    const paths = calculateArrowPaths(deps, layouts);

    // Blocks = orange-red, informs = blue, feeds = green
    expect(paths[0].color).toContain('FF'); // orange
    expect(paths[1].color).toContain('42'); // blue
    expect(paths[2].color).toContain('66'); // green
  });

  it('arrow from point is on the right edge of source card', () => {
    const deps: MissionDependency[] = [
      { from: 'm1', to: 'm2', type: 'blocks' },
    ];
    const layouts = new Map<string, MissionCardLayout>([
      ['m1', makeLayout('m1', 100, 200)],
      ['m2', makeLayout('m2', 500, 200)],
    ]);

    const paths = calculateArrowPaths(deps, layouts);
    const fromLayout = layouts.get('m1')!;
    const expectedRightEdge = fromLayout.position.x + fromLayout.size.width;
    expect(paths[0].from.x).toBe(expectedRightEdge);
  });

  it('arrow to point is on the left edge of target card', () => {
    const deps: MissionDependency[] = [
      { from: 'm1', to: 'm2', type: 'blocks' },
    ];
    const layouts = new Map<string, MissionCardLayout>([
      ['m1', makeLayout('m1', 100, 200)],
      ['m2', makeLayout('m2', 500, 200)],
    ]);

    const paths = calculateArrowPaths(deps, layouts);
    const toLayout = layouts.get('m2')!;
    expect(paths[0].to.x).toBe(toLayout.position.x);
  });

  it('uses dashed pattern for informs type', () => {
    const deps: MissionDependency[] = [
      { from: 'm1', to: 'm2', type: 'informs' },
    ];
    const layouts = new Map<string, MissionCardLayout>([
      ['m1', makeLayout('m1', 100, 200)],
      ['m2', makeLayout('m2', 400, 200)],
    ]);

    const paths = calculateArrowPaths(deps, layouts);
    expect(paths[0].dashPattern).toBeDefined();
    expect(paths[0].dashPattern!.length).toBeGreaterThan(0);
  });

  it('no dash pattern for blocks type', () => {
    const deps: MissionDependency[] = [
      { from: 'm1', to: 'm2', type: 'blocks' },
    ];
    const layouts = new Map<string, MissionCardLayout>([
      ['m1', makeLayout('m1', 100, 200)],
      ['m2', makeLayout('m2', 400, 200)],
    ]);

    const paths = calculateArrowPaths(deps, layouts);
    expect(paths[0].dashPattern).toBeUndefined();
  });
});

describe('getPointOnCubicBezier', () => {
  const p0: Point = { x: 0, y: 0 };
  const p1: Point = { x: 33, y: 0 };
  const p2: Point = { x: 66, y: 0 };
  const p3: Point = { x: 100, y: 0 };

  it('returns start point at t=0', () => {
    const point = getPointOnCubicBezier(p0, p1, p2, p3, 0);
    expect(point.x).toBeCloseTo(0, 5);
    expect(point.y).toBeCloseTo(0, 5);
  });

  it('returns end point at t=1', () => {
    const point = getPointOnCubicBezier(p0, p1, p2, p3, 1);
    expect(point.x).toBeCloseTo(100, 5);
    expect(point.y).toBeCloseTo(0, 5);
  });

  it('returns midpoint-ish at t=0.5', () => {
    const point = getPointOnCubicBezier(p0, p1, p2, p3, 0.5);
    expect(point.x).toBeCloseTo(50, 0);
    expect(point.y).toBeCloseTo(0, 5);
  });

  it('handles curved paths', () => {
    const cp1: Point = { x: 0, y: 100 };
    const cp2: Point = { x: 100, y: 100 };
    const point = getPointOnCubicBezier(p0, cp1, cp2, p3, 0.5);
    // Should be above the straight line between start and end
    expect(point.y).toBeGreaterThan(0);
  });

  it('monotonically progresses for straight horizontal lines', () => {
    let prevX = -1;
    for (let t = 0; t <= 1; t += 0.1) {
      const point = getPointOnCubicBezier(p0, p1, p2, p3, t);
      expect(point.x).toBeGreaterThanOrEqual(prevX);
      prevX = point.x;
    }
  });
});

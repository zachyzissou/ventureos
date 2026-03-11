import { describe, it, expect } from 'vitest';

import { generateBondControlPoint, quadraticBezierPoint, distance } from '@/khala/path';

describe('khala path generation', () => {
  it('generates a curved control point that avoids a central obstacle', () => {
    const a = { x: -350, y: 0 };
    const b = { x: 350, y: 0 };

    const obstacle = { center: { x: 0, y: 0 }, radius: 120, id: 'center' };

    const control = generateBondControlPoint({
      a,
      b,
      key: 'oracle:archivist',
      obstacles: [obstacle],
      obstaclePadding: 20,
      curvature: 0.2,
      iterations: 5
    });

    // It should not be a straight line (y!=0).
    expect(Math.abs(control.y)).toBeGreaterThan(1);

    // Sample the curve and ensure it stays outside the obstacle+padding.
    const minDist = obstacle.radius + 20;
    for (let i = 1; i <= 9; i++) {
      const t = i / 10;
      const p = quadraticBezierPoint(a, control, b, t);
      expect(distance(p, obstacle.center)).toBeGreaterThanOrEqual(minDist - 0.5);
    }
  });
});

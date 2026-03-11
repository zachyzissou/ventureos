import { describe, it, expect } from 'vitest';
import { hexagonPoints, clamp, lerp } from '@/renderer/primitives';

describe('renderer/primitives', () => {
  it('hexagonPoints returns 6 points on radius', () => {
    const pts = hexagonPoints(10);
    expect(pts).toHaveLength(6);
    for (const p of pts) {
      const r = Math.hypot(p.x, p.y);
      expect(r).toBeCloseTo(10, 6);
    }
  });

  it('clamp and lerp behave', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
});

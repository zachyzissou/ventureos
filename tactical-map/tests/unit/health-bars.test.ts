import { describe, it, expect, vi } from 'vitest';

vi.mock('pixi.js', () => {
  class Container {}
  class Graphics {
    position = { set: () => void 0 };
    roundRect() {
      return this;
    }
    fill() {
      return this;
    }
    stroke() {
      return this;
    }
    clear() {
      return this;
    }
  }
  return { Container, Graphics };
});

import { healthColor } from '@/renderer/health-bars';

// Helper to extract rgb
function rgb(c: number) {
  return { r: (c >> 16) & 0xff, g: (c >> 8) & 0xff, b: c & 0xff };
}

describe('health bars', () => {
  it('uses gray when in ERROR state', () => {
    expect(healthColor(0.2, 'ERROR')).toBe(0x666666);
    expect(healthColor(1.2, 'ERROR')).toBe(0x666666);
  });

  it('is greenish at low capacity', () => {
    const c = healthColor(0.1, 'ACTIVE');
    expect(rgb(c).g).toBeGreaterThan(rgb(c).r);
  });

  it('is yellowish around 50%', () => {
    const c = healthColor(0.5, 'ACTIVE');
    const { r, g } = rgb(c);
    expect(r).toBeGreaterThan(150);
    expect(g).toBeGreaterThan(150);
  });

  it('is orangish at overload threshold', () => {
    const c = healthColor(0.8, 'OVERLOADED');
    const { r, g } = rgb(c);
    expect(r).toBeGreaterThan(g);
  });

  it('is red at >= 100%', () => {
    const c = healthColor(1.0, 'OVERLOADED');
    const { r, g } = rgb(c);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(120);
  });
});

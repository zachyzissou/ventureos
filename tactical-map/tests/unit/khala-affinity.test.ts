import { describe, it, expect } from 'vitest';

import { affinityToAlpha, affinityToTier, tierToColor, tierToParticleCount, tierToSpeedPxPerS } from '@/khala/affinity';

describe('khala affinity', () => {
  it('maps affinity to the correct tier boundaries', () => {
    expect(affinityToTier(0)).toBe(1);
    expect(affinityToTier(0.5)).toBe(1);
    expect(affinityToTier(0.5001)).toBe(2);
    expect(affinityToTier(0.6)).toBe(2);
    expect(affinityToTier(0.6001)).toBe(3);
    expect(affinityToTier(0.75)).toBe(3);
    expect(affinityToTier(0.7501)).toBe(4);
    expect(affinityToTier(0.85)).toBe(4);
    expect(affinityToTier(0.8501)).toBe(5);
    expect(affinityToTier(1)).toBe(5);
  });

  it('provides stable colors and particle params by tier', () => {
    for (let t = 1 as const; t <= 5; t = (t + 1) as any) {
      const c = tierToColor(t);
      expect(typeof c).toBe('number');
      expect(tierToParticleCount(t)).toBeGreaterThan(0);
      expect(tierToSpeedPxPerS(t)).toBeGreaterThan(0);
    }
  });

  it('maps affinity to a bounded alpha', () => {
    const a0 = affinityToAlpha(0);
    const a1 = affinityToAlpha(1);

    expect(a0).toBeGreaterThan(0);
    expect(a1).toBeGreaterThan(a0);

    // Clamps
    expect(affinityToAlpha(-10)).toBe(a0);
    expect(affinityToAlpha(10)).toBe(a1);
  });
});

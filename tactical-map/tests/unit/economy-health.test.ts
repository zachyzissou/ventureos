import { describe, it, expect } from 'vitest';
import { computeBudgetHealth, healthToColor, heatIntensityToColor } from '@/economy/health';

describe('economy/health', () => {
  it('maps remaining ratio to green/yellow/red', () => {
    expect(computeBudgetHealth(0.9)).toBe('green');
    expect(computeBudgetHealth(0.3)).toBe('yellow');
    expect(computeBudgetHealth(0.14)).toBe('red');
  });

  it('returns stable palette colors', () => {
    expect(healthToColor('green')).toBeTypeOf('number');
    expect(healthToColor('yellow')).toBeTypeOf('number');
    expect(healthToColor('red')).toBeTypeOf('number');
  });

  it('computes continuous heat colors', () => {
    const cold = heatIntensityToColor(0);
    const warm = heatIntensityToColor(0.5);
    const hot = heatIntensityToColor(1);

    expect(cold).not.toBe(warm);
    expect(warm).not.toBe(hot);
  });
});

import { describe, it, expect } from 'vitest';
import { DEFAULT_TOUR_STEPS } from '@/tour/steps';

describe('tour/steps copy', () => {
  it('does not use hardcoded newline breaks in body copy', () => {
    for (const step of DEFAULT_TOUR_STEPS) {
      expect(step.body.includes('\n')).toBe(false);
    }
  });
});

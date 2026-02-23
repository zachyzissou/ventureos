/**
 * Progress Indicator Tests — Phase 5.5
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LINEAR_CONFIG,
  DEFAULT_CIRCULAR_CONFIG,
  DEFAULT_PHASE_STEP_CONFIG,
} from '../../../src/missions/progress-indicator';
import { MISSION_PHASE_ORDER, PHASE_COLORS } from '../../../src/missions/types';

describe('DEFAULT_LINEAR_CONFIG', () => {
  it('has positive dimensions', () => {
    expect(DEFAULT_LINEAR_CONFIG.width).toBeGreaterThan(0);
    expect(DEFAULT_LINEAR_CONFIG.height).toBeGreaterThan(0);
  });

  it('has border radius <= half height', () => {
    expect(DEFAULT_LINEAR_CONFIG.borderRadius).toBeLessThanOrEqual(
      DEFAULT_LINEAR_CONFIG.height / 2
    );
  });

  it('has a valid label position', () => {
    expect(['inside', 'right', 'above']).toContain(DEFAULT_LINEAR_CONFIG.labelPosition);
  });
});

describe('DEFAULT_CIRCULAR_CONFIG', () => {
  it('has positive radius', () => {
    expect(DEFAULT_CIRCULAR_CONFIG.radius).toBeGreaterThan(0);
  });

  it('has positive line width', () => {
    expect(DEFAULT_CIRCULAR_CONFIG.lineWidth).toBeGreaterThan(0);
  });
});

describe('DEFAULT_PHASE_STEP_CONFIG', () => {
  it('has positive dot radius', () => {
    expect(DEFAULT_PHASE_STEP_CONFIG.dotRadius).toBeGreaterThan(0);
  });

  it('has sufficient spacing for dots not to overlap', () => {
    expect(DEFAULT_PHASE_STEP_CONFIG.spacing).toBeGreaterThan(
      DEFAULT_PHASE_STEP_CONFIG.dotRadius * 2
    );
  });

  it('total width fits 6 phase steps', () => {
    const totalWidth =
      (MISSION_PHASE_ORDER.length - 1) * DEFAULT_PHASE_STEP_CONFIG.spacing +
      DEFAULT_PHASE_STEP_CONFIG.dotRadius * 2;
    // Should be reasonable (< 300px)
    expect(totalWidth).toBeLessThan(300);
  });
});

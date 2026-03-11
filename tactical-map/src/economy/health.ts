import { clamp01, lerpColor } from '@/utils/color';
import type { BudgetHealth } from '@/economy/types';

export type HealthThresholds = {
  warningRatio: number;
  criticalRatio: number;
};

export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  warningRatio: 0.30,
  criticalRatio: 0.15
};

export function computeBudgetHealth(
  remainingRatio: number,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS
): BudgetHealth {
  const r = clamp01(remainingRatio);
  if (r <= thresholds.criticalRatio) return 'red';
  if (r <= thresholds.warningRatio) return 'yellow';
  return 'green';
}

export function healthToColor(health: BudgetHealth): number {
  switch (health) {
    case 'red':
      return 0xff3b3b;
    case 'yellow':
      return 0xffc247;
    case 'green':
    default:
      return 0x39e58c;
  }
}

/**
 * Continuous heat color used by heat map overlays.
 * 0.0 = healthy green, 1.0 = high-burn red.
 */
export function heatIntensityToColor(intensity: number): number {
  const t = clamp01(intensity);
  if (t < 0.5) return lerpColor(0x39e58c, 0xffc247, t / 0.5);
  return lerpColor(0xffc247, 0xff3b3b, (t - 0.5) / 0.5);
}

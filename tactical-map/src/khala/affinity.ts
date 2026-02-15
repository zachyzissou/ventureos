import { BONDS } from '@/config';

export type AffinityTier = 1 | 2 | 3 | 4 | 5;

export function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * Maps affinity strength (0..1) to one of 5 tiers.
 *
 * Breakpoints are configured in `config.ts`.
 */
export function affinityToTier(affinity: number): AffinityTier {
  const a = clamp01(affinity);
  if (a <= BONDS.TIER_1_MAX) return 1;
  if (a <= BONDS.TIER_2_MAX) return 2;
  if (a <= BONDS.TIER_3_MAX) return 3;
  if (a <= BONDS.TIER_4_MAX) return 4;
  return 5;
}

export function tierToColor(tier: AffinityTier): number {
  return BONDS.TIER_COLORS[tier - 1] ?? BONDS.TIER_COLORS[0];
}

export function tierToSpeedPxPerS(tier: AffinityTier): number {
  return BONDS.PARTICLE_SPEED_BY_TIER[tier - 1] ?? BONDS.PARTICLE_SPEED_BY_TIER[0];
}

export function tierToParticleCount(tier: AffinityTier): number {
  return BONDS.PARTICLE_COUNT_BY_TIER[tier - 1] ?? 1;
}

/**
 * Visual alpha mapping for a bond line.
 * Keeps a low baseline even for low affinity so the network is still visible.
 */
export function affinityToAlpha(affinity: number): number {
  const a = clamp01(affinity);
  const min = BONDS.ALPHA_MIN;
  const max = BONDS.ALPHA_MAX;
  return min + (max - min) * a;
}

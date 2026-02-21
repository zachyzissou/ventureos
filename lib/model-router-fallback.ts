import type {
  ModelDefinition,
  ModelTier,
  QuotaTracker,
  RoutingRequest,
} from './model-router';

export interface FallbackCandidatesResult {
  candidates: ModelDefinition[];
  warnings: string[];
  hasAvailableByStatus: boolean;
}

/**
 * Build a fallback chain for a requested tier.
 * Returns models in fallback order (same tier first, then higher-quality tiers before lower tiers).
 */
export function getFallbackChain(models: ModelDefinition[], tier: ModelTier): ModelDefinition[] {
  const available = models.filter((model) => model.status !== 'unavailable');
  return available
    .sort((a, b) => {
      // Same tier as requested comes first
      if (a.tier === tier && b.tier !== tier) return -1;
      if (b.tier === tier && a.tier !== tier) return 1;
      // Then sort by tier (higher tier = better quality = tried first in fallback)
      if (a.tier !== b.tier) return b.tier - a.tier;
      // Within same tier, prefer cheaper
      return a.costPer1kInput - b.costPer1kInput;
    });
}

export function resolveFallbackCandidates(
  models: ModelDefinition[],
  request: RoutingRequest,
  enforceQuota: boolean,
  quotaExempt: boolean,
  quota: QuotaTracker,
): FallbackCandidatesResult {
  // Try all models in fallback order (any tier, any provider)
  const allAvailable = models
    .filter((model) => {
      if (model.status === 'unavailable') return false;
      if (enforceQuota && !quotaExempt && quota.isExhausted(model.provider)) return false;
      return true;
    })
    .sort((a, b) => a.costPer1kInput - b.costPer1kInput); // Cheapest first in emergency

  const warnings: string[] = [];
  const hasAvailableByStatus = models.some((model) => model.status !== 'unavailable');

  // Filter by required capabilities if possible
  if (!request.requiredCapabilities?.length) {
    return { candidates: allAvailable, warnings, hasAvailableByStatus };
  }

  const withCapabilities = allAvailable.filter((model) =>
    request.requiredCapabilities!.every((capability) => model.capabilities.includes(capability)),
  );
  if (withCapabilities.length > 0) {
    return { candidates: withCapabilities, warnings, hasAvailableByStatus };
  }

  warnings.push('No models match all required capabilities — selecting best available');
  return { candidates: allAvailable, warnings, hasAvailableByStatus };
}

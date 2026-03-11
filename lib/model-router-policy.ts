import type {
  BusinessUnitOverride,
  ModelDefinition,
  ModelTier,
  QuotaTracker,
  RoutingRequest,
} from './model-router';

export interface QuotaRestrictionResult {
  maxTier: ModelTier;
  downgraded: boolean;
  warning?: string;
}

export function resolveEffectiveTiers(
  request: RoutingRequest,
  override?: BusinessUnitOverride,
): { minTier: ModelTier; maxTier: ModelTier } {
  let minTier: ModelTier = request.minTier ?? 1;
  let maxTier: ModelTier = request.maxTier ?? 3;

  // Override from business unit
  if (override?.minTier) minTier = Math.max(minTier, override.minTier) as ModelTier;
  if (override?.maxTier) maxTier = Math.min(maxTier, override.maxTier) as ModelTier;

  // Urgent tasks get at least tier 2
  if (request.timeSensitivity === 'urgent' && minTier < 2) {
    minTier = 2;
  }

  // Complex tasks get at least tier 2
  if (request.complexity === 'complex' && minTier < 2) {
    minTier = 2;
  }

  // Batch tasks can go to tier 1 (only if no explicit minTier was requested)
  if (request.timeSensitivity === 'batch' && !override?.minTier && !request.minTier) {
    minTier = 1;
  }

  return { minTier, maxTier };
}

export function applyQuotaRestrictions(
  request: RoutingRequest,
  currentMaxTier: ModelTier,
  quotaExempt: boolean,
  quotaThreshold: number,
  quota: QuotaTracker,
): QuotaRestrictionResult {
  // Check global quota first
  const globalUsage = quota.getUsagePercent('global');
  if (globalUsage >= quotaThreshold) {
    if (quotaExempt) {
      return {
        maxTier: currentMaxTier,
        downgraded: false,
        warning: `Quota at ${(globalUsage * 100).toFixed(0)}% but security/safety critical task — no downgrade`,
      };
    }
    return {
      maxTier: 1,
      downgraded: currentMaxTier > 1,
      warning: `Quota at ${(globalUsage * 100).toFixed(0)}% (threshold: ${(quotaThreshold * 100).toFixed(0)}%) — restricted to tier 1`,
    };
  }

  // Check provider-specific quota
  if (request.preferredProvider) {
    const providerUsage = quota.getUsagePercent(request.preferredProvider);
    if (providerUsage >= quotaThreshold) {
      return {
        maxTier: currentMaxTier, // Don't downgrade tier, just warn
        downgraded: false,
        warning: `${request.preferredProvider} quota at ${(providerUsage * 100).toFixed(0)}% — may prefer other provider`,
      };
    }
  }

  return { maxTier: currentMaxTier, downgraded: false };
}

export function filterCandidates(
  models: ModelDefinition[],
  request: RoutingRequest,
  minTier: ModelTier,
  maxTier: ModelTier,
  quotaExempt: boolean,
  enforceQuota: boolean,
  quota: QuotaTracker,
): ModelDefinition[] {
  return models.filter((model) => {
    // Must be available
    if (model.status === 'unavailable') return false;

    // Tier bounds
    if (model.tier < minTier || model.tier > maxTier) return false;

    // Required capabilities
    if (request.requiredCapabilities?.length) {
      const hasAll = request.requiredCapabilities.every((capability) => model.capabilities.includes(capability));
      if (!hasAll) return false;
    }

    // Provider quota exhausted — skip (except safety-critical requests)
    if (enforceQuota && !quotaExempt && quota.isExhausted(model.provider)) {
      return false;
    }

    return true;
  });
}

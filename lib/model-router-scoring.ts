import {
  CAPABILITY_MATCH_BONUS,
  COMPLEXITY_SCORES,
  COMPLEXITY_TIER_MAP,
  MAX_PERFORMANCE_BONUS,
  PRIORITY_SCORES,
  PRIORITY_TIER_MAP,
  PRIORITY_TIER_MISMATCH_PENALTY,
  PROVIDER_PREFERENCE_BONUS,
  TIME_SENSITIVITY_SCORES,
  TIME_SENSITIVITY_TIER_MAP,
  TIME_SENSITIVITY_TIER_MISMATCH_PENALTY,
} from './model-router-constants';
import type {
  BusinessUnitOverride,
  ModelDefinition,
  PerformanceTracker,
  QuotaTracker,
  RoutingPriority,
  RoutingRequest,
  ScoreBreakdown,
} from './model-router';

export interface ScoredCandidate {
  model: ModelDefinition;
  score: number;
  breakdown: ScoreBreakdown;
}

export function scoreCandidates(
  candidates: ModelDefinition[],
  request: RoutingRequest,
  priority: RoutingPriority,
  override: BusinessUnitOverride | undefined,
  quota: QuotaTracker,
  performance: PerformanceTracker,
): ScoredCandidate[] {
  const scored = candidates.map((model) => {
    const breakdown = computeBreakdown(model, request, priority, override, quota, performance);
    const score = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
    return { model, score, breakdown };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export function computeBreakdown(
  model: ModelDefinition,
  request: RoutingRequest,
  priority: RoutingPriority,
  override: BusinessUnitOverride | undefined,
  quota: QuotaTracker,
  performance: PerformanceTracker,
): ScoreBreakdown {
  // Complexity: reward tier match to complexity
  const idealTier = COMPLEXITY_TIER_MAP[request.complexity];
  const tierDiff = Math.abs(model.tier - idealTier);
  const complexityScore = COMPLEXITY_SCORES[request.complexity] - tierDiff * 20;

  // Quota: penalize expensive models when quota is high
  const globalUsage = quota.getUsagePercent('global');
  const providerUsage = quota.getUsagePercent(model.provider);
  const usagePressure = Math.max(globalUsage, providerUsage);
  // Higher tier = more penalty when quota is high
  const quotaScore = model.tier === 1
    ? usagePressure * 30 // Cheap models get bonus when quota is tight
    : -usagePressure * model.tier * 15;

  // Priority: align tier preference to business importance so this factor affects ranking
  const priorityIdealTier = PRIORITY_TIER_MAP[priority];
  const priorityTierDiff = Math.abs(model.tier - priorityIdealTier);
  const priorityScore = PRIORITY_SCORES[priority] - priorityTierDiff * PRIORITY_TIER_MISMATCH_PENALTY;

  // Time sensitivity: urgent prefers higher tiers, batch prefers lower tiers
  const timeIdealTier = TIME_SENSITIVITY_TIER_MAP[request.timeSensitivity];
  const timeTierDiff = Math.abs(model.tier - timeIdealTier);
  const timeSensitivityScore =
    TIME_SENSITIVITY_SCORES[request.timeSensitivity]
    - timeTierDiff * TIME_SENSITIVITY_TIER_MISMATCH_PENALTY;

  // Performance: use historical data if available
  let performanceScore = 0;
  if (request.taskType) {
    const perfScore = performance.getPerformanceScore(model.id, request.taskType);
    performanceScore = (perfScore - 0.5) * MAX_PERFORMANCE_BONUS * 2; // Normalize around 0
  }

  // Provider preference
  const providerPreferenceScore =
    (request.preferredProvider && model.provider === request.preferredProvider)
      ? PROVIDER_PREFERENCE_BONUS
      : (override?.preferredProvider && model.provider === override.preferredProvider)
        ? PROVIDER_PREFERENCE_BONUS
        : 0;

  // Capability match: bonus per required capability matched (defensive; filterCandidates enforces all)
  let capabilityMatchScore = 0;
  if (request.requiredCapabilities?.length) {
    const matched = request.requiredCapabilities.filter((capability) => model.capabilities.includes(capability));
    capabilityMatchScore = matched.length * CAPABILITY_MATCH_BONUS;
  }

  return {
    complexityScore,
    quotaScore,
    priorityScore,
    timeSensitivityScore,
    performanceScore,
    providerPreferenceScore,
    capabilityMatchScore,
  };
}

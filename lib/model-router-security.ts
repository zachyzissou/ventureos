import {
  DEFAULT_ESTIMATED_INPUT_TOKENS,
  DEFAULT_ESTIMATED_OUTPUT_TOKENS,
  DEFAULT_MODELS,
  EXTERNAL_CONTENT_SOURCES,
} from './model-router-constants';
import type {
  InjectionDetectionEvent,
  ModelDefinition,
  RoutingDecision,
  RoutingRequest,
  RoutingRiskLevel,
  RoutingSecurityMetadata,
  SecurityRoutingSummary,
} from './model-router';

export interface RoutingTelemetryEntry {
  decidedAt: string;
  riskLevel: RoutingRiskLevel;
  modelId: string;
  tier: 1 | 2 | 3;
  estimatedCostUsd: number;
  baselineCostUsd: number;
  injectionDetected: boolean;
}

export function classifySecurityRisk(
  request: RoutingRequest,
  injectionAlertThreshold: number,
): RoutingSecurityMetadata {
  const signals: string[] = [];
  let riskLevel: RoutingRiskLevel = request.riskLevel ?? 'low';

  const escalateTo = (target: RoutingRiskLevel, signal: string): void => {
    signals.push(signal);
    if (target === 'high') {
      riskLevel = 'high';
    } else if (target === 'medium' && riskLevel === 'low') {
      riskLevel = 'medium';
    }
  };

  if (request.containsExternalContent) {
    escalateTo('high', 'containsExternalContent');
  }

  for (const source of request.contentSources ?? []) {
    if (EXTERNAL_CONTENT_SOURCES.has(source.toLowerCase())) {
      escalateTo('high', `contentSource:${source}`);
    }
  }

  const injectionScore = typeof request.injectionScore === 'number' ? request.injectionScore : 0;
  if (injectionScore >= injectionAlertThreshold) {
    escalateTo('high', `injectionScore:${injectionScore.toFixed(2)}`);
  } else if (injectionScore >= 0.3) {
    escalateTo('medium', `injectionScoreElevated:${injectionScore.toFixed(2)}`);
  }

  const taskType = (request.taskType ?? '').toLowerCase();
  if (taskType.includes('code') || taskType.includes('review') || taskType.includes('generation')) {
    escalateTo('medium', `taskType:${request.taskType}`);
  }

  if (request.requiredCapabilities?.some((capability) => ['browser', 'vision'].includes(capability))) {
    escalateTo('high', 'untrusted-capability');
  }

  return {
    riskLevel,
    signals,
    injectionDetected: injectionScore >= injectionAlertThreshold,
    forcedByRequest: false,
  };
}

export function estimateRoutingCostUsd(
  model: ModelDefinition,
  inputTokens: number,
  outputTokens: number,
): number {
  return (inputTokens / 1000) * model.costPer1kInput + (outputTokens / 1000) * model.costPer1kOutput;
}

export function getBaselineModel(models: ModelDefinition[]): ModelDefinition {
  const available = models.filter((model) => model.status !== 'unavailable');
  if (available.length === 0) return models[0] ?? DEFAULT_MODELS[0];
  return [...available].sort(
    (a, b) => (b.costPer1kInput + b.costPer1kOutput) - (a.costPer1kInput + a.costPer1kOutput),
  )[0];
}

export function buildRoutingTelemetryEntry(
  request: RoutingRequest,
  decision: RoutingDecision,
  baselineModel: ModelDefinition,
): RoutingTelemetryEntry {
  const inputTokens = request.estimatedInputTokens ?? DEFAULT_ESTIMATED_INPUT_TOKENS;
  const outputTokens = request.estimatedOutputTokens ?? DEFAULT_ESTIMATED_OUTPUT_TOKENS;
  return {
    decidedAt: decision.decidedAt,
    riskLevel: decision.security.riskLevel,
    modelId: decision.model.id,
    tier: decision.tier,
    estimatedCostUsd: estimateRoutingCostUsd(decision.model, inputTokens, outputTokens),
    baselineCostUsd: estimateRoutingCostUsd(baselineModel, inputTokens, outputTokens),
    injectionDetected: decision.security.injectionDetected,
  };
}

export function buildInjectionDetectionEvent(
  request: RoutingRequest,
  decision: RoutingDecision,
): InjectionDetectionEvent {
  return {
    detectedAt: decision.decidedAt,
    riskLevel: decision.security.riskLevel,
    modelId: decision.model.id,
    injectionScore: request.injectionScore ?? 0,
    signals: [...decision.security.signals],
  };
}

export function getSecurityRoutingSummary(
  telemetry: RoutingTelemetryEntry[],
  now: () => Date,
  routingHistoryLimit: number,
  limit?: number,
): SecurityRoutingSummary {
  const effectiveLimit = limit && Number.isFinite(limit)
    ? Math.max(1, Math.min(Math.trunc(limit), routingHistoryLimit))
    : routingHistoryLimit;
  const slice = telemetry.slice(-effectiveLimit);
  const riskCounts: Record<RoutingRiskLevel, number> = { low: 0, medium: 0, high: 0 };
  const tierCounts: Record<'tier1' | 'tier2' | 'tier3', number> = { tier1: 0, tier2: 0, tier3: 0 };
  const modelUsage: Record<string, number> = {};
  let estimatedCostUsd = 0;
  let baselineCostUsd = 0;
  let injectionDetections = 0;

  for (const entry of slice) {
    riskCounts[entry.riskLevel] += 1;
    tierCounts[`tier${entry.tier}`] += 1;
    modelUsage[entry.modelId] = (modelUsage[entry.modelId] ?? 0) + 1;
    estimatedCostUsd += entry.estimatedCostUsd;
    baselineCostUsd += entry.baselineCostUsd;
    if (entry.injectionDetected) injectionDetections += 1;
  }

  const estimatedSavingsUsd = baselineCostUsd - estimatedCostUsd;
  const estimatedSavingsPct = baselineCostUsd > 0
    ? Number(((estimatedSavingsUsd / baselineCostUsd) * 100).toFixed(2))
    : 0;

  return {
    updatedAt: now().toISOString(),
    windowSize: slice.length,
    riskCounts,
    tierCounts,
    modelUsage,
    injectionDetections,
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
    baselineCostUsd: Number(baselineCostUsd.toFixed(6)),
    estimatedSavingsUsd: Number(estimatedSavingsUsd.toFixed(6)),
    estimatedSavingsPct,
  };
}

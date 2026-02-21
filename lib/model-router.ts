/**
 * Model Router — VentureOS Enhanced Model Routing (P2 #33)
 *
 * Intelligent model selection based on multi-factor scoring:
 * - Task complexity (simple/medium/complex)
 * - Current quota usage (% remaining → tier enforcement)
 * - Business unit priority (high/medium/low)
 * - Time sensitivity (urgent/normal/batch)
 * - Historical performance (which model works best for a task type)
 *
 * Model Tiers:
 * - Tier 1 (cheap):    GPT-4o-mini, Claude Haiku
 * - Tier 2 (balanced): GPT-4o, Claude Sonnet
 * - Tier 3 (premium):  o1, Claude Opus
 *
 * Key design decisions:
 * - Routing is a hot path → no async I/O in scoring
 * - Quota tracking is in-memory with optional persistence
 * - Fallback chains handle partial outages gracefully
 * - Business unit overrides always take precedence over scoring
 * - All decisions are logged with full breakdown for auditability
 *
 * @see docs/MODEL_ROUTING.md
 * @see docs/MODEL_ROUTING_POLICY.md
 * @see docs/MODEL_FALLBACK_CHAIN.md
 */

import {
  DEFAULT_INJECTION_ALERT_THRESHOLD,
  DEFAULT_MODELS,
  DEFAULT_QUOTA_THRESHOLD,
  DEFAULT_ROUTING_HISTORY_LIMIT,
} from './model-router-constants';
import { getFallbackChain, resolveFallbackCandidates } from './model-router-fallback';
import { applyQuotaRestrictions, filterCandidates, resolveEffectiveTiers } from './model-router-policy';
import { scoreCandidates } from './model-router-scoring';
import {
  buildInjectionDetectionEvent,
  buildRoutingTelemetryEntry,
  classifySecurityRisk,
  getBaselineModel,
  getSecurityRoutingSummary as summarizeSecurityRoutingTelemetry,
  type RoutingTelemetryEntry,
} from './model-router-security';
import { PerformanceTracker, QuotaTracker } from './model-router-trackers';

export { DEFAULT_MODELS };
export { PerformanceTracker, QuotaTracker };

// ============================================================================
// Types
// ============================================================================

/** Model tier levels. */
export type ModelTier = 1 | 2 | 3;

/** Task complexity levels. */
export type TaskComplexity = 'simple' | 'medium' | 'complex';

/** Time sensitivity levels. */
export type TimeSensitivity = 'urgent' | 'normal' | 'batch';

/** Security risk levels for threat-aware routing. */
export type RoutingRiskLevel = 'low' | 'medium' | 'high';

/** Business unit priority for model routing. */
export type RoutingPriority = 'high' | 'medium' | 'low';

/** Model provider. */
export type ModelProvider = 'openai' | 'anthropic';

/** Model availability status. */
export type ModelStatus = 'available' | 'degraded' | 'unavailable';

/** A specific model definition. */
export interface ModelDefinition {
  /** Unique model identifier (e.g., 'gpt-4o-mini'). */
  id: string;
  /** Display name. */
  name: string;
  /** Model provider. */
  provider: ModelProvider;
  /** Model tier (1=cheap, 2=balanced, 3=premium). */
  tier: ModelTier;
  /** Cost per 1K tokens (input). Used for cost estimation. */
  costPer1kInput: number;
  /** Cost per 1K tokens (output). */
  costPer1kOutput: number;
  /** Maximum context window size. */
  maxContextTokens: number;
  /** Current availability status. */
  status: ModelStatus;
  /** Capabilities/tags for matching. */
  capabilities: string[];
}

/** Routing request — what the caller provides. */
export interface RoutingRequest {
  /** Task complexity. */
  complexity: TaskComplexity;
  /** Time sensitivity. */
  timeSensitivity: TimeSensitivity;
  /** Business unit ID (optional, for priority lookup). */
  businessUnit?: string;
  /** Explicit priority override (bypasses BU lookup). */
  priorityOverride?: RoutingPriority;
  /** Required capabilities (e.g., 'code', 'reasoning', 'vision'). */
  requiredCapabilities?: string[];
  /** Preferred provider (optional hint, not enforced). */
  preferredProvider?: ModelProvider;
  /** Minimum tier to consider (floor). */
  minTier?: ModelTier;
  /** Maximum tier to consider (ceiling). */
  maxTier?: ModelTier;
  /** Task type for performance lookup (e.g., 'code-review', 'summarization'). */
  taskType?: string;
  /** Whether the task is safety-critical (overrides quota restrictions). */
  safetyCritical?: boolean;
  /** Explicit per-task model override (user-controlled). */
  forceModel?: string;
  /** Optional explicit risk level override. */
  riskLevel?: RoutingRiskLevel;
  /** Content-source hints used for threat classification. */
  contentSources?: string[];
  /** Flag indicating untrusted/external content is present. */
  containsExternalContent?: boolean;
  /** Prompt-injection score (0-1) from upstream sanitizer/classifier. */
  injectionScore?: number;
  /** Cost-estimation hints for telemetry. */
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
}

/** Score breakdown for auditability. */
export interface ScoreBreakdown {
  complexityScore: number;
  quotaScore: number;
  priorityScore: number;
  timeSensitivityScore: number;
  performanceScore: number;
  providerPreferenceScore: number;
  capabilityMatchScore: number;
}

/** A routing decision with full context. */
export interface RoutingDecision {
  /** Selected model. */
  model: ModelDefinition;
  /** Composite score that led to selection. */
  score: number;
  /** Score breakdown for each factor. */
  breakdown: ScoreBreakdown;
  /** Effective tier used. */
  tier: ModelTier;
  /** Whether quota forced a downgrade. */
  quotaDowngraded: boolean;
  /** Whether a fallback was used. */
  fallbackUsed: boolean;
  /** Index in fallback chain (0 = primary). */
  fallbackIndex: number;
  /** Warnings (non-blocking). */
  warnings: string[];
  /** Reason summary for logs. */
  reason: string;
  /** Timestamp of decision. */
  decidedAt: string;
  /** Security routing metadata (threat-aware tier decisions). */
  security: RoutingSecurityMetadata;
}

/** Security details attached to each routing decision. */
export interface RoutingSecurityMetadata {
  riskLevel: RoutingRiskLevel;
  signals: string[];
  injectionDetected: boolean;
  forcedByRequest: boolean;
}

/** Quota state for a provider or global. */
export interface QuotaState {
  /** Total budget (points, tokens, or dollars — unit-agnostic). */
  total: number;
  /** Amount used so far. */
  used: number;
  /** Reset timestamp (ISO 8601). */
  resetsAt: string;
}

/** Performance record for a model+taskType pair. */
export interface PerformanceRecord {
  /** Model ID. */
  modelId: string;
  /** Task type. */
  taskType: string;
  /** Number of completions tracked. */
  sampleCount: number;
  /** Average latency (ms). */
  avgLatencyMs: number;
  /** Success rate (0-1). */
  successRate: number;
  /** Average quality score (0-1, from QA checks). */
  avgQualityScore: number;
  /** Last updated timestamp. */
  updatedAt: string;
}

/** Business unit routing override. */
export interface BusinessUnitOverride {
  /** Business unit ID. */
  businessUnit: string;
  /** Priority level for routing. */
  priority: RoutingPriority;
  /** Minimum tier allowed for this BU. */
  minTier?: ModelTier;
  /** Maximum tier allowed for this BU. */
  maxTier?: ModelTier;
  /** Preferred provider for this BU. */
  preferredProvider?: ModelProvider;
  /** Force a specific model (bypasses scoring entirely). */
  forcedModel?: string;
}

/** Logger interface (matches VentureOS conventions). */
export interface ModelRouterLogger {
  debug?(msg: string, meta?: unknown): void;
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
}

/** Model router configuration. */
export interface ModelRouterConfig {
  /** Available models. */
  models: ModelDefinition[];
  /** Business unit overrides. */
  businessUnitOverrides?: BusinessUnitOverride[];
  /** Quota threshold percentage (0-1) that triggers tier downgrade. Default: 0.9 */
  quotaThreshold?: number;
  /** Whether to enforce quota restrictions. Default: true */
  enforceQuota?: boolean;
  /** Logger. */
  logger?: ModelRouterLogger;
  /** Deterministic time source (for tests). */
  now?: () => Date;
  /** Prompt-injection score threshold that triggers detection logging. */
  injectionAlertThreshold?: number;
  /** Max entries retained for in-memory routing telemetry history. */
  routingHistoryLimit?: number;
}

/** Single injection-detection log event from routing. */
export interface InjectionDetectionEvent {
  detectedAt: string;
  riskLevel: RoutingRiskLevel;
  modelId: string;
  injectionScore: number;
  signals: string[];
}

/** Dashboard-friendly security routing summary. */
export interface SecurityRoutingSummary {
  updatedAt: string;
  windowSize: number;
  riskCounts: Record<RoutingRiskLevel, number>;
  tierCounts: Record<'tier1' | 'tier2' | 'tier3', number>;
  modelUsage: Record<string, number>;
  injectionDetections: number;
  estimatedCostUsd: number;
  baselineCostUsd: number;
  estimatedSavingsUsd: number;
  estimatedSavingsPct: number;
}

// ============================================================================
// Model Router
// ============================================================================

const defaultLogger: ModelRouterLogger = {
  debug: (msg, meta) => {
    if (process.env.MODEL_ROUTER_DEBUG) console.debug(`[model-router] ${msg}`, meta ?? '');
  },
  info: (msg, meta) => console.info(`[model-router] ${msg}`, meta ?? ''),
  warn: (msg, meta) => console.warn(`[model-router] ${msg}`, meta ?? ''),
  error: (msg, meta) => console.error(`[model-router] ${msg}`, meta ?? ''),
};

export class ModelRouter {
  private readonly models: ModelDefinition[];
  private readonly overrides: Map<string, BusinessUnitOverride>;
  private readonly quotaThreshold: number;
  private readonly enforceQuota: boolean;
  private readonly logger: ModelRouterLogger;
  private readonly now: () => Date;
  private readonly injectionAlertThreshold: number;
  private readonly routingHistoryLimit: number;
  private readonly routingTelemetry: RoutingTelemetryEntry[] = [];
  private readonly injectionEvents: InjectionDetectionEvent[] = [];

  readonly quota: QuotaTracker;
  readonly performance: PerformanceTracker;

  constructor(config: ModelRouterConfig) {
    this.models = config.models.map(m => ({ ...m, capabilities: [...m.capabilities] }));
    this.quotaThreshold = config.quotaThreshold ?? DEFAULT_QUOTA_THRESHOLD;
    this.enforceQuota = config.enforceQuota ?? true;
    this.logger = config.logger ?? defaultLogger;
    this.now = config.now ?? (() => new Date());
    this.injectionAlertThreshold = config.injectionAlertThreshold ?? DEFAULT_INJECTION_ALERT_THRESHOLD;
    this.routingHistoryLimit = Math.max(10, config.routingHistoryLimit ?? DEFAULT_ROUTING_HISTORY_LIMIT);
    this.quota = new QuotaTracker();
    this.performance = new PerformanceTracker(this.now);

    // Index overrides by business unit
    this.overrides = new Map();
    for (const o of config.businessUnitOverrides ?? []) {
      this.overrides.set(o.businessUnit, o);
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // Core Routing
  // ────────────────────────────────────────────────────────────────────

  /**
   * Select the best model for a routing request.
   * This is the primary entry point — hot path, no async I/O.
   */
  selectModel(request: RoutingRequest): RoutingDecision {
    const warnings: string[] = [];
    let quotaDowngraded = false;
    const security = this.classifySecurityRisk(request);
    const quotaExempt = request.safetyCritical === true || security.riskLevel === 'high';

    // 0. Explicit per-task forced model (user-controlled override)
    if (request.forceModel) {
      const forcedByRequest = this.models.find(m => m.id === request.forceModel);
      if (forcedByRequest && forcedByRequest.status !== 'unavailable') {
        return this.buildDecision(forcedByRequest, request, {
          reason: `Forced by request override`,
          fallbackUsed: false,
          fallbackIndex: 0,
          quotaDowngraded: false,
          warnings,
          security: { ...security, forcedByRequest: true },
        });
      }
      warnings.push(`Forced model '${request.forceModel}' not available, falling back to policy routing`);
    }

    // 1. Resolve business unit override
    const override = request.businessUnit
      ? this.overrides.get(request.businessUnit)
      : undefined;

    // 2. Check forced model override
    if (override?.forcedModel) {
      const forced = this.models.find(m => m.id === override.forcedModel);
      if (forced && forced.status !== 'unavailable') {
        return this.buildDecision(forced, request, {
          reason: `Forced by business unit override: ${request.businessUnit}`,
          fallbackUsed: false,
          fallbackIndex: 0,
          quotaDowngraded: false,
          warnings: [],
          security,
        });
      }
      warnings.push(`Forced model '${override.forcedModel}' not available, falling back to scoring`);
    }

    // 3. Determine effective tier bounds
    let { minTier, maxTier } = resolveEffectiveTiers(request, override);
    // Security-aware tier floors
    if (security.riskLevel === 'high') minTier = Math.max(minTier, 3) as ModelTier;
    if (security.riskLevel === 'medium') minTier = Math.max(minTier, 2) as ModelTier;

    // 4. Apply quota restrictions
    if (this.enforceQuota) {
      const quotaResult = applyQuotaRestrictions(
        request,
        maxTier,
        quotaExempt,
        this.quotaThreshold,
        this.quota,
      );
      maxTier = quotaResult.maxTier;
      quotaDowngraded = quotaResult.downgraded;
      if (quotaResult.warning) warnings.push(quotaResult.warning);
    }

    // Ensure minTier ≤ maxTier after quota adjustments
    if (minTier > maxTier) {
      if (quotaExempt) {
        // Safety-critical tasks are exempt from quota downgrade
        maxTier = minTier;
        quotaDowngraded = false;
        warnings.push('Security/safety critical task: quota restriction overridden');
      } else {
        minTier = maxTier;
      }
    }

    // 5. Filter candidate models
    const candidates = filterCandidates(
      this.models,
      request,
      minTier,
      maxTier,
      quotaExempt,
      this.enforceQuota,
      this.quota,
    );

    if (candidates.length === 0) {
      // No candidates at all — try fallback chain
      return this.fallback(request, warnings, security, quotaExempt);
    }

    // 6. Score candidates
    const priority = request.priorityOverride ?? override?.priority ?? 'medium';
    const scored = scoreCandidates(candidates, request, priority, override, this.quota, this.performance);

    // 7. Select best
    const best = scored[0];

    return this.buildDecision(best.model, request, {
      breakdown: best.breakdown,
      reason: this.buildReason(request, best.model, quotaDowngraded, security),
      fallbackUsed: false,
      fallbackIndex: 0,
      quotaDowngraded,
      warnings,
      security,
    });
  }

  /**
   * Build a fallback chain for a given tier.
   * Returns models in fallback order (same tier first, then higher-quality tiers before lower tiers).
   */
  getFallbackChain(tier: ModelTier): ModelDefinition[] {
    return getFallbackChain(this.models, tier);
  }

  // ────────────────────────────────────────────────────────────────────
  // Model Management
  // ────────────────────────────────────────────────────────────────────

  /** Update a model's availability status. */
  updateModelStatus(modelId: string, status: ModelStatus): void {
    const model = this.models.find(m => m.id === modelId);
    if (model) {
      model.status = status;
      this.logger.info('Model status updated', { modelId, status });
    }
  }

  /** Get all models. */
  getModels(): readonly ModelDefinition[] {
    return this.models;
  }

  /** Get models by tier. */
  getModelsByTier(tier: ModelTier): ModelDefinition[] {
    return this.models.filter(m => m.tier === tier);
  }

  /** Get available models. */
  getAvailableModels(): ModelDefinition[] {
    return this.models.filter(m => m.status !== 'unavailable');
  }

  /** Add or update a business unit override. */
  setBusinessUnitOverride(override: BusinessUnitOverride): void {
    this.overrides.set(override.businessUnit, override);
  }

  /** Remove a business unit override. */
  removeBusinessUnitOverride(businessUnit: string): void {
    this.overrides.delete(businessUnit);
  }

  /** Get a business unit override. */
  getBusinessUnitOverride(businessUnit: string): BusinessUnitOverride | undefined {
    return this.overrides.get(businessUnit);
  }

  // ────────────────────────────────────────────────────────────────────
  // Internal Routing Helpers
  // ────────────────────────────────────────────────────────────────────

  /** Execute fallback chain when no primary candidates are available. */
  private fallback(
    request: RoutingRequest,
    existingWarnings: string[],
    security: RoutingSecurityMetadata,
    quotaExempt: boolean,
  ): RoutingDecision {
    const fallbackResolution = resolveFallbackCandidates(
      this.models,
      request,
      this.enforceQuota,
      quotaExempt,
      this.quota,
    );
    const warnings = [...existingWarnings, ...fallbackResolution.warnings];

    if (fallbackResolution.candidates.length === 0) {
      const failureReason = fallbackResolution.hasAvailableByStatus
        ? 'No models available after quota filtering — cannot route request'
        : 'All models unavailable — cannot route request';
      this.logger.error(failureReason, { request });

      // Return the first model definition (even if unavailable) as a marker
      const marker = this.models[0] ?? {
        id: 'none',
        name: 'No Model Available',
        provider: 'openai' as ModelProvider,
        tier: 1 as ModelTier,
        costPer1kInput: 0,
        costPer1kOutput: 0,
        maxContextTokens: 0,
        status: 'unavailable' as ModelStatus,
        capabilities: [],
      };
      warnings.push(
        fallbackResolution.hasAvailableByStatus
          ? 'CRITICAL: No models available after quota filtering'
          : 'CRITICAL: All models unavailable'
      );
      return this.buildDecision(marker, request, {
        reason: fallbackResolution.hasAvailableByStatus
          ? 'No models available after quota filtering — no routing possible'
          : 'All models unavailable — no routing possible',
        fallbackUsed: true,
        fallbackIndex: -1,
        quotaDowngraded: false,
        warnings,
        security,
      });
    }

    const selected = fallbackResolution.candidates[0];
    warnings.push(`Fallback selected: ${selected.id} (no candidates in requested tier range)`);

    return this.buildDecision(selected, request, {
      reason: `Fallback: primary candidates unavailable or filtered out`,
      fallbackUsed: true,
      fallbackIndex: 1,
      quotaDowngraded: false,
      warnings,
      security,
    });
  }

  /** Build a RoutingDecision object. */
  private buildDecision(
    model: ModelDefinition,
    request: RoutingRequest,
    opts: {
      breakdown?: ScoreBreakdown;
      reason: string;
      fallbackUsed: boolean;
      fallbackIndex: number;
      quotaDowngraded: boolean;
      warnings: string[];
      security?: RoutingSecurityMetadata;
    }
  ): RoutingDecision {
    const breakdown = opts.breakdown ?? {
      complexityScore: 0,
      quotaScore: 0,
      priorityScore: 0,
      timeSensitivityScore: 0,
      performanceScore: 0,
      providerPreferenceScore: 0,
      capabilityMatchScore: 0,
    };

    const score = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

    const decision: RoutingDecision = {
      model,
      score,
      breakdown,
      tier: model.tier,
      quotaDowngraded: opts.quotaDowngraded,
      fallbackUsed: opts.fallbackUsed,
      fallbackIndex: opts.fallbackIndex,
      warnings: opts.warnings,
      reason: opts.reason,
      decidedAt: this.now().toISOString(),
      security: opts.security ?? {
        riskLevel: 'low',
        signals: [],
        injectionDetected: false,
        forcedByRequest: false,
      },
    };

    this.logger.debug?.('Routing decision', {
      modelId: model.id,
      tier: model.tier,
      score,
      reason: opts.reason,
      quotaDowngraded: opts.quotaDowngraded,
      fallbackUsed: opts.fallbackUsed,
      warnings: opts.warnings,
      riskLevel: decision.security.riskLevel,
      injectionDetected: decision.security.injectionDetected,
    });

    this.recordTelemetry(request, decision);

    return decision;
  }

  /** Classify routing threat level from request metadata. */
  private classifySecurityRisk(request: RoutingRequest): RoutingSecurityMetadata {
    return classifySecurityRisk(request, this.injectionAlertThreshold);
  }

  private recordTelemetry(request: RoutingRequest, decision: RoutingDecision): void {
    const baselineModel = getBaselineModel(this.models);
    this.routingTelemetry.push(buildRoutingTelemetryEntry(request, decision, baselineModel));
    if (this.routingTelemetry.length > this.routingHistoryLimit) {
      this.routingTelemetry.splice(0, this.routingTelemetry.length - this.routingHistoryLimit);
    }

    if (decision.security.injectionDetected) {
      const event = buildInjectionDetectionEvent(request, decision);
      this.injectionEvents.push(event);
      if (this.injectionEvents.length > this.routingHistoryLimit) {
        this.injectionEvents.splice(0, this.injectionEvents.length - this.routingHistoryLimit);
      }
      this.logger.warn('Injection detection routed to strong model', event);
    }
  }

  /** Return security-routing telemetry for dashboard/API surfaces. */
  getSecurityRoutingSummary(limit?: number): SecurityRoutingSummary {
    return summarizeSecurityRoutingTelemetry(this.routingTelemetry, this.now, this.routingHistoryLimit, limit);
  }

  /** Return recent injection-detection events. */
  getInjectionDetections(limit = 100): InjectionDetectionEvent[] {
    const effectiveLimit = Math.max(1, Math.min(Math.trunc(limit), this.routingHistoryLimit));
    return this.injectionEvents.slice(-effectiveLimit);
  }

  clearSecurityTelemetry(): void {
    this.routingTelemetry.length = 0;
    this.injectionEvents.length = 0;
  }

  /** Build a human-readable reason string. */
  private buildReason(
    request: RoutingRequest,
    model: ModelDefinition,
    quotaDowngraded: boolean,
    security: RoutingSecurityMetadata,
  ): string {
    const parts: string[] = [];
    parts.push(`complexity=${request.complexity}`);
    parts.push(`sensitivity=${request.timeSensitivity}`);
    parts.push(`tier=${model.tier}`);
    parts.push(`risk=${security.riskLevel}`);

    if (request.businessUnit) parts.push(`bu=${request.businessUnit}`);
    if (quotaDowngraded) parts.push('quota-downgraded');
    if (request.preferredProvider === model.provider) parts.push('provider-match');
    if (security.injectionDetected) parts.push('injection-detected');
    if (security.forcedByRequest) parts.push('request-override');

    return parts.join(', ');
  }
}

// ============================================================================
// Singleton / Factory
// ============================================================================

let _defaultRouter: ModelRouter | null = null;

/** Get or create the default model router. */
export function getDefaultModelRouter(config?: Partial<ModelRouterConfig>): ModelRouter {
  if (!_defaultRouter) {
    _defaultRouter = new ModelRouter({
      models: config?.models ?? DEFAULT_MODELS,
      businessUnitOverrides: config?.businessUnitOverrides,
      quotaThreshold: config?.quotaThreshold,
      enforceQuota: config?.enforceQuota,
      logger: config?.logger,
      now: config?.now,
      injectionAlertThreshold: config?.injectionAlertThreshold,
      routingHistoryLimit: config?.routingHistoryLimit,
    });
  }
  return _defaultRouter;
}

/** Reset the default router (for testing). */
export function resetDefaultModelRouter(): void {
  _defaultRouter = null;
}

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

// ============================================================================
// Types
// ============================================================================

/** Model tier levels. */
export type ModelTier = 1 | 2 | 3;

/** Task complexity levels. */
export type TaskComplexity = 'simple' | 'medium' | 'complex';

/** Time sensitivity levels. */
export type TimeSensitivity = 'urgent' | 'normal' | 'batch';

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
}

// ============================================================================
// Constants
// ============================================================================

/** Default models available in the system. */
export const DEFAULT_MODELS: ModelDefinition[] = [
  // Tier 1 — Cheap
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    tier: 1,
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
    maxContextTokens: 128_000,
    status: 'available',
    capabilities: ['chat', 'code', 'summarization', 'classification'],
  },
  {
    id: 'claude-haiku',
    name: 'Claude Haiku',
    provider: 'anthropic',
    tier: 1,
    costPer1kInput: 0.00025,
    costPer1kOutput: 0.00125,
    maxContextTokens: 200_000,
    status: 'available',
    capabilities: ['chat', 'code', 'summarization', 'classification'],
  },
  // Tier 2 — Balanced
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    tier: 2,
    costPer1kInput: 0.0025,
    costPer1kOutput: 0.01,
    maxContextTokens: 128_000,
    status: 'available',
    capabilities: ['chat', 'code', 'reasoning', 'summarization', 'classification', 'vision'],
  },
  {
    id: 'claude-sonnet',
    name: 'Claude Sonnet',
    provider: 'anthropic',
    tier: 2,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    maxContextTokens: 200_000,
    status: 'available',
    capabilities: ['chat', 'code', 'reasoning', 'summarization', 'classification', 'vision'],
  },
  // Tier 3 — Premium
  {
    id: 'o1',
    name: 'o1',
    provider: 'openai',
    tier: 3,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.06,
    maxContextTokens: 200_000,
    status: 'available',
    capabilities: ['chat', 'code', 'reasoning', 'planning', 'complex-analysis'],
  },
  {
    id: 'claude-opus',
    name: 'Claude Opus',
    provider: 'anthropic',
    tier: 3,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
    maxContextTokens: 200_000,
    status: 'available',
    capabilities: ['chat', 'code', 'reasoning', 'planning', 'complex-analysis', 'vision'],
  },
];

/** Complexity → base tier mapping. */
const COMPLEXITY_TIER_MAP: Record<TaskComplexity, ModelTier> = {
  simple: 1,
  medium: 2,
  complex: 3,
};

/** Complexity scoring weights. */
const COMPLEXITY_SCORES: Record<TaskComplexity, number> = {
  simple: 10,
  medium: 50,
  complex: 100,
};

/** Time sensitivity scoring weights. */
const TIME_SENSITIVITY_SCORES: Record<TimeSensitivity, number> = {
  urgent: 80,
  normal: 40,
  batch: 10,
};

/** Priority scoring weights. */
const PRIORITY_SCORES: Record<RoutingPriority, number> = {
  high: 100,
  medium: 50,
  low: 20,
};

/** Priority → ideal tier mapping (used to differentiate model ranking). */
const PRIORITY_TIER_MAP: Record<RoutingPriority, ModelTier> = {
  high: 3,
  medium: 2,
  low: 1,
};

/** Time sensitivity → ideal tier mapping (used to differentiate model ranking). */
const TIME_SENSITIVITY_TIER_MAP: Record<TimeSensitivity, ModelTier> = {
  urgent: 3,
  normal: 2,
  batch: 1,
};

/** Tier mismatch penalties for priority/time sensitivity alignment. */
const PRIORITY_TIER_MISMATCH_PENALTY = 20;
const TIME_SENSITIVITY_TIER_MISMATCH_PENALTY = 15;

/** Default quota threshold (90%). */
const DEFAULT_QUOTA_THRESHOLD = 0.9;

/** Provider preference bonus. */
const PROVIDER_PREFERENCE_BONUS = 15;

/** Capability match bonus per matched capability. */
const CAPABILITY_MATCH_BONUS = 10;

/** Maximum performance bonus. */
const MAX_PERFORMANCE_BONUS = 30;

// ============================================================================
// Quota Tracker
// ============================================================================

export class QuotaTracker {
  private quotas: Map<string, QuotaState> = new Map();

  /** Set quota state for a key (e.g., 'global', 'openai', 'anthropic'). */
  setQuota(key: string, quota: QuotaState): void {
    this.quotas.set(key, { ...quota });
  }

  /** Get current quota state. */
  getQuota(key: string): QuotaState | undefined {
    const quota = this.quotas.get(key);
    return quota ? { ...quota } : undefined;
  }

  /** Get usage percentage (0-1). Returns 0 if no quota is set. */
  getUsagePercent(key: string): number {
    const q = this.quotas.get(key);
    if (!q || q.total <= 0) return 0;
    return Math.min(1, q.used / q.total);
  }

  /** Check if quota exceeds threshold. */
  isOverThreshold(key: string, threshold: number): boolean {
    return this.getUsagePercent(key) >= threshold;
  }

  /** Record usage. */
  recordUsage(key: string, amount: number): void {
    const q = this.quotas.get(key);
    if (q) {
      q.used = Math.min(q.total, q.used + amount);
    }
  }

  /** Check if quota is exhausted (100%). */
  isExhausted(key: string): boolean {
    const q = this.quotas.get(key);
    if (!q) return false;
    return q.used >= q.total;
  }

  /** Reset usage for a key. */
  resetUsage(key: string): void {
    const q = this.quotas.get(key);
    if (q) q.used = 0;
  }

  /** Get all quota keys. */
  getKeys(): string[] {
    return Array.from(this.quotas.keys());
  }

  /** Export all quota states. */
  export(): Record<string, QuotaState> {
    const result: Record<string, QuotaState> = {};
    for (const [k, v] of this.quotas) result[k] = { ...v };
    return result;
  }

  /** Import quota states. */
  import(data: Record<string, QuotaState>): void {
    this.quotas.clear();
    for (const [k, v] of Object.entries(data)) {
      this.quotas.set(k, { ...v });
    }
  }
}

// ============================================================================
// Performance Tracker
// ============================================================================

export class PerformanceTracker {
  private records: Map<string, PerformanceRecord> = new Map();
  private readonly now: () => Date;

  constructor(now?: () => Date) {
    this.now = now ?? (() => new Date());
  }

  /** Generate composite key. */
  private key(modelId: string, taskType: string): string {
    return `${modelId}::${taskType}`;
  }

  /** Record a completion. Updates running averages. */
  recordCompletion(
    modelId: string,
    taskType: string,
    latencyMs: number,
    success: boolean,
    qualityScore: number
  ): void {
    const k = this.key(modelId, taskType);
    const existing = this.records.get(k);

    if (!existing) {
      this.records.set(k, {
        modelId,
        taskType,
        sampleCount: 1,
        avgLatencyMs: latencyMs,
        successRate: success ? 1 : 0,
        avgQualityScore: qualityScore,
        updatedAt: this.now().toISOString(),
      });
      return;
    }

    // Exponential moving average with α = 2/(n+2), capped at n=100
    // The +2 ensures α < 1 even for the first update, providing smooth blending
    const n = Math.min(existing.sampleCount, 100);
    const alpha = 2 / (n + 2);

    existing.avgLatencyMs = existing.avgLatencyMs * (1 - alpha) + latencyMs * alpha;
    existing.successRate = existing.successRate * (1 - alpha) + (success ? 1 : 0) * alpha;
    existing.avgQualityScore = existing.avgQualityScore * (1 - alpha) + qualityScore * alpha;
    existing.sampleCount += 1;
    existing.updatedAt = this.now().toISOString();
  }

  /** Get performance record. */
  getRecord(modelId: string, taskType: string): PerformanceRecord | undefined {
    return this.records.get(this.key(modelId, taskType));
  }

  /** Compute a performance score (0-1) for a model+taskType. */
  getPerformanceScore(modelId: string, taskType: string): number {
    const record = this.records.get(this.key(modelId, taskType));
    if (!record || record.sampleCount < 3) return 0.5; // Neutral score for insufficient data

    // Weighted combination: quality 50%, success 35%, latency 15%
    const latencyScore = Math.max(0, 1 - record.avgLatencyMs / 30_000); // 30s = 0 score
    return record.avgQualityScore * 0.5 + record.successRate * 0.35 + latencyScore * 0.15;
  }

  /** Get all records. */
  getAll(): PerformanceRecord[] {
    return Array.from(this.records.values());
  }

  /** Get best model for a task type. */
  getBestModel(taskType: string, candidates: string[]): string | undefined {
    let bestId: string | undefined;
    let bestScore = -1;

    for (const id of candidates) {
      const score = this.getPerformanceScore(id, taskType);
      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    }

    return bestId;
  }

  /** Export all records. */
  export(): PerformanceRecord[] {
    return this.getAll();
  }

  /** Import records. */
  import(records: PerformanceRecord[]): void {
    this.records.clear();
    for (const r of records) {
      this.records.set(this.key(r.modelId, r.taskType), { ...r });
    }
  }

  /** Clear all records. */
  clear(): void {
    this.records.clear();
  }
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

  readonly quota: QuotaTracker;
  readonly performance: PerformanceTracker;

  constructor(config: ModelRouterConfig) {
    this.models = config.models.map(m => ({ ...m, capabilities: [...m.capabilities] }));
    this.quotaThreshold = config.quotaThreshold ?? DEFAULT_QUOTA_THRESHOLD;
    this.enforceQuota = config.enforceQuota ?? true;
    this.logger = config.logger ?? defaultLogger;
    this.now = config.now ?? (() => new Date());
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
        });
      }
      warnings.push(`Forced model '${override.forcedModel}' not available, falling back to scoring`);
    }

    // 3. Determine effective tier bounds
    let { minTier, maxTier } = this.resolveEffectiveTiers(request, override);

    // 4. Apply quota restrictions
    if (this.enforceQuota) {
      const quotaResult = this.applyQuotaRestrictions(request, maxTier);
      maxTier = quotaResult.maxTier;
      quotaDowngraded = quotaResult.downgraded;
      if (quotaResult.warning) warnings.push(quotaResult.warning);
    }

    // Ensure minTier ≤ maxTier after quota adjustments
    if (minTier > maxTier) {
      if (request.safetyCritical) {
        // Safety-critical tasks are exempt from quota downgrade
        maxTier = minTier;
        quotaDowngraded = false;
        warnings.push('Safety-critical task: quota restriction overridden');
      } else {
        minTier = maxTier;
      }
    }

    // 5. Filter candidate models
    const candidates = this.filterCandidates(request, minTier, maxTier, override);

    if (candidates.length === 0) {
      // No candidates at all — try fallback chain
      return this.fallback(request, warnings);
    }

    // 6. Score candidates
    const scored = this.scoreCandidates(candidates, request, override);

    // 7. Select best
    const best = scored[0];

    return this.buildDecision(best.model, request, {
      breakdown: best.breakdown,
      reason: this.buildReason(request, best.model, quotaDowngraded),
      fallbackUsed: false,
      fallbackIndex: 0,
      quotaDowngraded,
      warnings,
    });
  }

  /**
   * Build a fallback chain for a given tier.
   * Returns models in fallback order (same tier first, then higher-quality tiers before lower tiers).
   */
  getFallbackChain(tier: ModelTier): ModelDefinition[] {
    const available = this.models.filter(m => m.status !== 'unavailable');

    // Sort: same tier first, then descending by tier (prefer higher quality fallbacks)
    // Within same tier, prefer lower cost
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
  // Internal Scoring
  // ────────────────────────────────────────────────────────────────────

  /** Resolve effective tier bounds from request + overrides. */
  private resolveEffectiveTiers(
    request: RoutingRequest,
    override?: BusinessUnitOverride
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

  /** Apply quota restrictions and potentially downgrade maxTier. */
  private applyQuotaRestrictions(
    request: RoutingRequest,
    currentMaxTier: ModelTier
  ): { maxTier: ModelTier; downgraded: boolean; warning?: string } {
    // Check global quota first
    const globalUsage = this.quota.getUsagePercent('global');
    if (globalUsage >= this.quotaThreshold) {
      if (request.safetyCritical) {
        return {
          maxTier: currentMaxTier,
          downgraded: false,
          warning: `Quota at ${(globalUsage * 100).toFixed(0)}% but safety-critical task — no downgrade`,
        };
      }
      return {
        maxTier: 1,
        downgraded: currentMaxTier > 1,
        warning: `Quota at ${(globalUsage * 100).toFixed(0)}% (threshold: ${(this.quotaThreshold * 100).toFixed(0)}%) — restricted to tier 1`,
      };
    }

    // Check provider-specific quota
    if (request.preferredProvider) {
      const providerUsage = this.quota.getUsagePercent(request.preferredProvider);
      if (providerUsage >= this.quotaThreshold) {
        return {
          maxTier: currentMaxTier, // Don't downgrade tier, just warn
          downgraded: false,
          warning: `${request.preferredProvider} quota at ${(providerUsage * 100).toFixed(0)}% — may prefer other provider`,
        };
      }
    }

    return { maxTier: currentMaxTier, downgraded: false };
  }

  /** Filter models to candidates matching constraints. */
  private filterCandidates(
    request: RoutingRequest,
    minTier: ModelTier,
    maxTier: ModelTier,
    override?: BusinessUnitOverride
  ): ModelDefinition[] {
    return this.models.filter(m => {
      // Must be available
      if (m.status === 'unavailable') return false;

      // Tier bounds
      if (m.tier < minTier || m.tier > maxTier) return false;

      // Required capabilities
      if (request.requiredCapabilities?.length) {
        const hasAll = request.requiredCapabilities.every(c => m.capabilities.includes(c));
        if (!hasAll) return false;
      }

      // Provider quota exhausted — skip (except safety-critical requests)
      if (this.enforceQuota && !request.safetyCritical && this.quota.isExhausted(m.provider)) {
        return false;
      }

      return true;
    });
  }

  /** Score all candidates and return sorted (best first). */
  private scoreCandidates(
    candidates: ModelDefinition[],
    request: RoutingRequest,
    override?: BusinessUnitOverride
  ): Array<{ model: ModelDefinition; score: number; breakdown: ScoreBreakdown }> {
    const priority = request.priorityOverride
      ?? override?.priority
      ?? 'medium';

    const scored = candidates.map(model => {
      const breakdown = this.computeBreakdown(model, request, priority, override);
      const score =
        breakdown.complexityScore +
        breakdown.quotaScore +
        breakdown.priorityScore +
        breakdown.timeSensitivityScore +
        breakdown.performanceScore +
        breakdown.providerPreferenceScore +
        breakdown.capabilityMatchScore;

      return { model, score, breakdown };
    });

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  /** Compute individual score breakdown for a model. */
  private computeBreakdown(
    model: ModelDefinition,
    request: RoutingRequest,
    priority: RoutingPriority,
    override?: BusinessUnitOverride
  ): ScoreBreakdown {
    // Complexity: reward tier match to complexity
    const idealTier = COMPLEXITY_TIER_MAP[request.complexity];
    const tierDiff = Math.abs(model.tier - idealTier);
    const complexityScore = COMPLEXITY_SCORES[request.complexity] - tierDiff * 20;

    // Quota: penalize expensive models when quota is high
    const globalUsage = this.quota.getUsagePercent('global');
    const providerUsage = this.quota.getUsagePercent(model.provider);
    const usagePressure = Math.max(globalUsage, providerUsage);
    // Higher tier = more penalty when quota is high
    const quotaScore = model.tier === 1
      ? usagePressure * 30  // Cheap models get bonus when quota is tight
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
      const perfScore = this.performance.getPerformanceScore(model.id, request.taskType);
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
      const matched = request.requiredCapabilities.filter(c => model.capabilities.includes(c));
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

  /** Execute fallback chain when no primary candidates are available. */
  private fallback(request: RoutingRequest, existingWarnings: string[]): RoutingDecision {
    const warnings = [...existingWarnings];

    // Try all models in fallback order (any tier, any provider)
    const allAvailable = this.models
      .filter(m => {
        if (m.status === 'unavailable') return false;
        if (this.enforceQuota && !request.safetyCritical && this.quota.isExhausted(m.provider)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.costPer1kInput - b.costPer1kInput); // Cheapest first in emergency

    // Filter by required capabilities if possible
    let fallbacks = allAvailable;
    if (request.requiredCapabilities?.length) {
      const withCaps = allAvailable.filter(m =>
        request.requiredCapabilities!.every(c => m.capabilities.includes(c))
      );
      if (withCaps.length > 0) {
        fallbacks = withCaps;
      } else {
        warnings.push('No models match all required capabilities — selecting best available');
      }
    }

    if (fallbacks.length === 0) {
      // All models are unavailable or filtered out by quota — catastrophic scenario
      const hasAvailableByStatus = this.models.some(m => m.status !== 'unavailable');
      const failureReason = hasAvailableByStatus
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
        hasAvailableByStatus
          ? 'CRITICAL: No models available after quota filtering'
          : 'CRITICAL: All models unavailable'
      );
      return this.buildDecision(marker, request, {
        reason: hasAvailableByStatus
          ? 'No models available after quota filtering — no routing possible'
          : 'All models unavailable — no routing possible',
        fallbackUsed: true,
        fallbackIndex: -1,
        quotaDowngraded: false,
        warnings,
      });
    }

    const selected = fallbacks[0];
    warnings.push(`Fallback selected: ${selected.id} (no candidates in requested tier range)`);

    return this.buildDecision(selected, request, {
      reason: `Fallback: primary candidates unavailable or filtered out`,
      fallbackUsed: true,
      fallbackIndex: 1,
      quotaDowngraded: false,
      warnings,
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
    };

    this.logger.debug?.('Routing decision', {
      modelId: model.id,
      tier: model.tier,
      score,
      reason: opts.reason,
      quotaDowngraded: opts.quotaDowngraded,
      fallbackUsed: opts.fallbackUsed,
      warnings: opts.warnings,
    });

    return decision;
  }

  /** Build a human-readable reason string. */
  private buildReason(
    request: RoutingRequest,
    model: ModelDefinition,
    quotaDowngraded: boolean
  ): string {
    const parts: string[] = [];
    parts.push(`complexity=${request.complexity}`);
    parts.push(`sensitivity=${request.timeSensitivity}`);
    parts.push(`tier=${model.tier}`);

    if (request.businessUnit) parts.push(`bu=${request.businessUnit}`);
    if (quotaDowngraded) parts.push('quota-downgraded');
    if (request.preferredProvider === model.provider) parts.push('provider-match');

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
    });
  }
  return _defaultRouter;
}

/** Reset the default router (for testing). */
export function resetDefaultModelRouter(): void {
  _defaultRouter = null;
}

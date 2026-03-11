import type {
  ModelDefinition,
  ModelTier,
  RoutingPriority,
  TaskComplexity,
  TimeSensitivity,
} from './model-router';

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
export const COMPLEXITY_TIER_MAP: Record<TaskComplexity, ModelTier> = {
  simple: 1,
  medium: 2,
  complex: 3,
};

/** Complexity scoring weights. */
export const COMPLEXITY_SCORES: Record<TaskComplexity, number> = {
  simple: 10,
  medium: 50,
  complex: 100,
};

/** Time sensitivity scoring weights. */
export const TIME_SENSITIVITY_SCORES: Record<TimeSensitivity, number> = {
  urgent: 80,
  normal: 40,
  batch: 10,
};

/** Priority scoring weights. */
export const PRIORITY_SCORES: Record<RoutingPriority, number> = {
  high: 100,
  medium: 50,
  low: 20,
};

/** Priority → ideal tier mapping (used to differentiate model ranking). */
export const PRIORITY_TIER_MAP: Record<RoutingPriority, ModelTier> = {
  high: 3,
  medium: 2,
  low: 1,
};

/** Time sensitivity → ideal tier mapping (used to differentiate model ranking). */
export const TIME_SENSITIVITY_TIER_MAP: Record<TimeSensitivity, ModelTier> = {
  urgent: 3,
  normal: 2,
  batch: 1,
};

/** Tier mismatch penalties for priority/time sensitivity alignment. */
export const PRIORITY_TIER_MISMATCH_PENALTY = 20;
export const TIME_SENSITIVITY_TIER_MISMATCH_PENALTY = 15;

/** Default quota threshold (90%). */
export const DEFAULT_QUOTA_THRESHOLD = 0.9;

/** Provider preference bonus. */
export const PROVIDER_PREFERENCE_BONUS = 15;

/** Capability match bonus per matched capability. */
export const CAPABILITY_MATCH_BONUS = 10;

/** Maximum performance bonus. */
export const MAX_PERFORMANCE_BONUS = 30;

/** Security routing defaults. */
export const DEFAULT_INJECTION_ALERT_THRESHOLD = 0.6;
export const DEFAULT_ROUTING_HISTORY_LIMIT = 500;
export const DEFAULT_ESTIMATED_INPUT_TOKENS = 1000;
export const DEFAULT_ESTIMATED_OUTPUT_TOKENS = 500;
export const EXTERNAL_CONTENT_SOURCES = new Set([
  'external',
  'web',
  'email',
  'social',
  'url',
  'user_url',
  'browser',
]);

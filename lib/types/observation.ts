/**
 * Observation Data Model Types — VentureOS Observational Memory
 *
 * Type contracts for the observation data layer. Observations are raw
 * data captured from conversations that can later be processed by the
 * observer/reflector pipeline (Issues #231/#232).
 *
 * Phase 1 (#230): Data Model + Token Counter Hook
 * Phase 2 (#231): Observer Agent — Compress Raw Messages → Observations
 */

// ─── Core Types ─────────────────────────────────────────────────────────────

export type ObservationId = string;

/**
 * Category of observation captured from conversation flow.
 * Kept intentionally broad — semantic extraction (Issue #231) will
 * refine these into structured knowledge graph entries.
 */
export type ObservationCategory =
  | 'fact'           // Factual statement observed
  | 'preference'     // User or agent preference
  | 'decision'       // Decision made during conversation
  | 'action'         // Action taken or committed to
  | 'question'       // Question asked (may need follow-up)
  | 'feedback'       // Feedback given about behavior/output
  | 'context'        // Contextual information (environment, state)
  | 'token_usage'    // Token consumption metric
  | 'other';         // Uncategorized

/**
 * Processing status for the observer/reflector pipeline.
 * Phase 1 only writes 'pending' — processing is Issue #231/#232.
 */
export type ObservationStatus =
  | 'pending'        // Awaiting observer processing
  | 'processed'      // Observer has extracted semantics
  | 'archived'       // Moved to long-term storage
  | 'discarded';     // Marked as not useful

/**
 * Observation priority (three-tier system).
 * 🔴 high   — Actionable commitments, decisions, deadlines
 * 🟡 medium — Preferences, context, notable facts
 * 🟢 info   — Background information, pleasantries retained for context
 */
export type ObservationPriority = 'high' | 'medium' | 'info';

/** Priority emoji mapping for display. */
export const PRIORITY_EMOJI: Record<ObservationPriority, string> = {
  high: '🔴',
  medium: '🟡',
  info: '🟢',
};

/**
 * Source information for an observation — where it came from.
 */
export interface ObservationSource {
  /** Conversation ID that produced this observation. */
  conversationId?: string;
  /** Message ID within the conversation (if applicable). */
  messageId?: string;
  /** Agent that produced or is associated with this observation. */
  agentId: string;
  /** Channel/platform where the observation originated. */
  channel?: string;
}

/**
 * Token usage snapshot attached to token_usage observations.
 */
export interface TokenUsageData {
  /** Estimated input tokens for this message/turn. */
  inputTokens: number;
  /** Estimated output tokens for this message/turn. */
  outputTokens: number;
  /** Total tokens (input + output). */
  totalTokens: number;
  /** Model used for this interaction (if known). */
  model?: string;
  /** Estimated cost in USD (if calculable). */
  estimatedCostUsd?: number;
}

/**
 * A single observation record — the atomic unit of observational memory.
 *
 * Observations are write-heavy, read-seldom raw data. The observer
 * pipeline (Issue #231) batch-processes raw messages into compressed
 * observations with priority and temporal metadata.
 */
export interface Observation {
  /** Unique observation identifier. */
  id: ObservationId;
  /** When the observation was captured (observation_date in three-date model). */
  createdAt: string;
  /** Category classification. */
  category: ObservationCategory;
  /** Raw content of the observation. */
  content: string;
  /** Source metadata. */
  source: ObservationSource;
  /** Processing status for the observer pipeline. */
  status: ObservationStatus;
  /** Token usage data (populated for category='token_usage'). */
  tokenUsage?: TokenUsageData;
  /**
   * Priority level assigned by the observer agent (Phase 2).
   * Null/undefined for raw Phase 1 observations.
   */
  priority?: ObservationPriority;
  /**
   * The date the fact/event refers to (three-date model: referenced_date).
   * Extracted by LLM when temporal information is present in the source.
   * ISO 8601 date string (date only or full datetime).
   */
  referencedDate?: string;
  /**
   * IDs of source messages that were compressed into this observation.
   * Populated by the observer agent (Phase 2).
   */
  sourceMessageIds?: string[];
  /** Arbitrary metadata for future extension. */
  metadata?: Record<string, unknown>;
}

// ─── Store Interface ────────────────────────────────────────────────────────

/**
 * Query options for listing observations.
 */
export interface ObservationQuery {
  /** Filter by category. */
  category?: ObservationCategory;
  /** Filter by processing status. */
  status?: ObservationStatus;
  /** Filter by agent ID. */
  agentId?: string;
  /** Filter by conversation ID. */
  conversationId?: string;
  /** Only observations after this ISO timestamp. */
  since?: string;
  /** Only observations before this ISO timestamp. */
  before?: string;
  /** Maximum number of results. Default: 100 */
  limit?: number;
  /** Offset for pagination. Default: 0 */
  offset?: number;
}

/**
 * Aggregated token usage statistics.
 */
export interface TokenUsageSummary {
  /** Total input tokens across all matched observations. */
  totalInputTokens: number;
  /** Total output tokens across all matched observations. */
  totalOutputTokens: number;
  /** Grand total tokens. */
  totalTokens: number;
  /** Total estimated cost in USD. */
  totalEstimatedCostUsd: number;
  /** Number of token_usage observations counted. */
  observationCount: number;
}

/**
 * Interface for observation persistence.
 * Implemented by ObservationStore (SQLite-backed).
 */
export interface IObservationStore {
  /** Insert a single observation. */
  insert(observation: Observation): void;
  /** Insert multiple observations in a single transaction. */
  insertBatch(observations: Observation[]): void;
  /** Query observations with optional filters. */
  query(opts?: ObservationQuery): Observation[];
  /** Get a single observation by ID. */
  getById(id: ObservationId): Observation | null;
  /** Update the processing status of an observation. */
  updateStatus(id: ObservationId, status: ObservationStatus): void;
  /** Get aggregated token usage for a time range / agent. */
  getTokenUsageSummary(opts?: {
    agentId?: string;
    conversationId?: string;
    since?: string;
    before?: string;
  }): TokenUsageSummary;
  /** Count observations matching a query. */
  count(opts?: Pick<ObservationQuery, 'category' | 'status' | 'agentId' | 'conversationId'>): number;
  /** Close the database connection. */
  close(): void;
}

// ─── Memory State (Phase 2) ────────────────────────────────────────────────

/**
 * Tracks the memory budget state for an agent.
 * One row per agent — upserted after each observation pass.
 */
export interface MemoryState {
  /** Agent ID (primary key). */
  agentId: string;
  /** Total tokens consumed by compressed observations. */
  observationsTokens: number;
  /** Total tokens in the raw message buffer (reset after observation). */
  rawBufferTokens: number;
  /** ISO timestamp of last successful observation pass. */
  lastObservationAt: string | null;
  /** ISO timestamp of last reflection pass (Phase 3 / #232). */
  lastReflectionAt: string | null;
  /** Total number of observations produced. */
  observationCount: number;
}

// ─── Observer LLM Output Schema (Phase 2) ──────────────────────────────────

/**
 * A single observation extracted by the observer LLM.
 * This is the raw JSON shape returned by the LLM and validated before
 * being transformed into full Observation records.
 */
export interface ObserverLLMObservation {
  /** Compressed content of the observation. */
  content: string;
  /** Priority classification. */
  priority: ObservationPriority;
  /** The date the fact/event refers to (ISO date string or null). */
  referenced_date: string | null;
  /** IDs of source messages that contributed to this observation. */
  source_message_ids: string[];
}

// ─── Observer Agent Config (Phase 2) ───────────────────────────────────────

/**
 * Configuration for the Observer Agent.
 */
export interface ObserverAgentConfig {
  /** Enable/disable the observer. Default: true */
  enabled: boolean;
  /** Characters-per-token for token estimation. Default: 4 */
  charsPerToken: number;
  /** Raw buffer token threshold that triggers observation. Default: 30000 */
  thresholdTokens: number;
  /** Maximum retries on LLM failure. Default: 1 */
  maxRetries: number;
  /** Model ID to use for observation compression. Default: 'gpt-4o-mini' */
  modelId: string;
  /** If true, suppress console.warn on errors. Default: false */
  silent: boolean;
  /** Trim raw messages from context after observation. Default: false */
  trimAfterObservation: boolean;
}

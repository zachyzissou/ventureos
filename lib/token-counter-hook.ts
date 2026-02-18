/**
 * Token Counter Hook — VentureOS Message Pipeline Integration (Phase 1)
 *
 * Hooks into the ConversationAPI event stream to automatically record
 * token usage observations for every delivered message. Designed as an
 * opt-in, additive integration that preserves existing behavior when
 * disabled.
 *
 * Architecture:
 * - Listens to ConversationAPI 'message' events
 * - Estimates token counts using configurable chars-per-token ratio
 * - Writes token_usage observations to the ObservationStore
 * - Gracefully degrades on errors (never blocks message delivery)
 * - Exposes metrics for observability
 *
 * Issue #230 — Phase 1 of #218: Observation Data Model + Token Counter Hook
 */

import crypto from 'node:crypto';
import type { ConversationAPI } from './conversation-api';
import type { ConversationMessage, ConversationState } from './conversation-engine';
import type { IObservationStore, Observation, TokenUsageData } from './types/observation';

// ─── Configuration ──────────────────────────────────────────────────────────

export interface TokenCounterHookConfig {
  /** Enable/disable the hook. Default: true */
  enabled: boolean;
  /** Characters-per-token estimate for input. Default: 4 */
  charsPerToken: number;
  /** If true, suppress console.warn on errors. Default: false */
  silent: boolean;
  /** Optional model name to attach to token observations. */
  defaultModel?: string;
  /** Per-token cost in USD for estimation. Default: 0 (no cost tracking) */
  costPerToken?: number;
  /**
   * Raw buffer token threshold that triggers `observation:threshold_reached`.
   * Set to 0 to disable threshold events. Default: 0 (disabled)
   * Phase 2 (#231): Observer Agent integration.
   */
  thresholdTokens?: number;
}

const DEFAULT_CONFIG: TokenCounterHookConfig = {
  enabled: true,
  charsPerToken: 4,
  silent: false,
};

// ─── Metrics ────────────────────────────────────────────────────────────────

export interface TokenCounterMetrics {
  /** Total messages observed since hook was attached. */
  messagesObserved: number;
  /** Total observations written to the store. */
  observationsWritten: number;
  /** Total tokens counted across all messages. */
  totalTokensCounted: number;
  /** Number of errors encountered (silently swallowed). */
  errors: number;
  /** Timestamp of last successful write. */
  lastWriteAt: string | null;
  /** Timestamp of last error. */
  lastErrorAt: string | null;
  /** Running token count since last threshold reset (Phase 2). */
  rawBufferTokens: number;
  /** Number of threshold events emitted (Phase 2). */
  thresholdEventsEmitted: number;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Estimate token count from text content.
 * Uses simple character-division heuristic (same approach as ConversationEngine).
 */
export function estimateTokens(content: string, charsPerToken: number): number {
  return Math.max(1, Math.ceil(content.length / Math.max(1, charsPerToken)));
}

/**
 * Generate a unique observation ID.
 */
function genObservationId(): string {
  return `obs_${crypto.randomBytes(8).toString('hex')}_${Date.now()}`;
}

/**
 * Token Counter Hook — attaches to a ConversationAPI to automatically
 * record token usage as observations.
 *
 * Usage:
 * ```ts
 * const hook = new TokenCounterHook(observationStore, { enabled: true });
 * hook.attach(conversationApi);
 * // ... messages flow through the API ...
 * hook.detach();
 * ```
 */
export class TokenCounterHook {
  private readonly config: TokenCounterHookConfig;
  private readonly store: IObservationStore;
  private api: ConversationAPI | null = null;
  private boundHandler: ((event: { message: ConversationMessage; state: ConversationState }) => void) | null = null;

  private metrics: TokenCounterMetrics = {
    messagesObserved: 0,
    observationsWritten: 0,
    totalTokensCounted: 0,
    errors: 0,
    lastWriteAt: null,
    lastErrorAt: null,
    rawBufferTokens: 0,
    thresholdEventsEmitted: 0,
  };

  constructor(store: IObservationStore, config: Partial<TokenCounterHookConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = store;
  }

  /**
   * Attach the hook to a ConversationAPI instance.
   * Starts listening for 'message' events.
   */
  attach(api: ConversationAPI): void {
    if (!this.config.enabled) return;
    if (this.api) {
      this.detach(); // Detach from previous API if already attached
    }

    this.api = api;
    this.boundHandler = (event) => this.onMessage(event);
    this.api.on('message', this.boundHandler);
  }

  /**
   * Detach the hook from the ConversationAPI.
   * Stops listening for events.
   */
  detach(): void {
    if (this.api && this.boundHandler) {
      this.api.removeListener('message', this.boundHandler);
    }
    this.api = null;
    this.boundHandler = null;
  }

  /**
   * Check if the hook is currently attached and enabled.
   */
  isActive(): boolean {
    return this.config.enabled && this.api !== null && this.boundHandler !== null;
  }

  /**
   * Get current metrics snapshot.
   */
  getMetrics(): Readonly<TokenCounterMetrics> {
    return { ...this.metrics };
  }

  /**
   * Process a message and record a token_usage observation.
   * Called automatically by the event listener, but also exposed
   * for direct invocation in tests or manual pipelines.
   */
  recordTokenUsage(message: ConversationMessage, state: ConversationState): void {
    try {
      this.metrics.messagesObserved++;

      // Only count delivered messages (skip blocked/rejected)
      if (message.status !== 'delivered') return;

      const inputTokens = estimateTokens(message.content, this.config.charsPerToken);
      // Output tokens = estimate based on content length (same heuristic)
      // In a real LLM pipeline, these would come from API response headers.
      const outputTokens = inputTokens;
      const totalTokens = inputTokens + outputTokens;

      const costPerToken = this.config.costPerToken ?? 0;
      const estimatedCostUsd = costPerToken > 0 ? totalTokens * costPerToken : undefined;

      const tokenUsage: TokenUsageData = {
        inputTokens,
        outputTokens,
        totalTokens,
        model: this.config.defaultModel,
        estimatedCostUsd,
      };

      const observation: Observation = {
        id: genObservationId(),
        createdAt: message.createdAt,
        category: 'token_usage',
        content: `Token usage: ${totalTokens} tokens (${inputTokens} in, ${outputTokens} out) for message from ${message.from}`,
        source: {
          conversationId: message.conversationId,
          messageId: message.messageId,
          agentId: message.from,
        },
        status: 'pending',
        tokenUsage,
        metadata: {
          deliveredTo: message.deliveredTo,
          messageStatus: message.status,
        },
      };

      this.store.insert(observation);

      this.metrics.observationsWritten++;
      this.metrics.totalTokensCounted += totalTokens;
      this.metrics.lastWriteAt = new Date().toISOString();

      // Phase 2: Track raw buffer tokens and emit threshold event
      const thresholdTokens = this.config.thresholdTokens ?? 0;
      if (thresholdTokens > 0) {
        this.metrics.rawBufferTokens += totalTokens;
        if (this.metrics.rawBufferTokens >= thresholdTokens && this.api) {
          this.metrics.thresholdEventsEmitted++;
          const rawBufferTokens = this.metrics.rawBufferTokens;
          this.api.emit('observation:threshold_reached', {
            agentId: message.from,
            conversationId: message.conversationId,
            rawBufferTokens,
            thresholdTokens,
          });
          // Reset buffer counter after threshold
          this.metrics.rawBufferTokens = 0;
        }
      }
    } catch (err: unknown) {
      this.metrics.errors++;
      this.metrics.lastErrorAt = new Date().toISOString();
      if (!this.config.silent) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[token-counter] Failed to record token usage: ${errMsg}`);
      }
    }
  }

  /**
   * Reset the raw buffer token counter.
   * Called after an observation pass completes (Phase 2).
   */
  resetRawBufferTokens(): void {
    this.metrics.rawBufferTokens = 0;
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private onMessage(event: { message: ConversationMessage; state: ConversationState }): void {
    this.recordTokenUsage(event.message, event.state);
  }
}

export default TokenCounterHook;

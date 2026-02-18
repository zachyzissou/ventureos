/**
 * Observation Cache — VentureOS Prompt-Ready Observation Buffer (Phase 3)
 *
 * In-memory cache that provides a token-bounded, priority-ordered view
 * of active observations for prompt injection. Rebuilt from the store
 * on demand and invalidated after reflection passes.
 *
 * Key behaviors:
 * - Observations ordered by priority (high > medium > info), then recency
 * - Token budget enforced — excess observations trimmed from the tail
 * - Cache is invalidated after reflection or new observations
 * - Thread-safe via simple generation counter (no async contention in Node)
 *
 * Issue #232 — Phase 3 of #218: Reflector Agent GC + Prompt Cache
 */

import type { ObservationStore } from './observation-store';
import type { Observation, ObservationPriority } from './types/observation';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ObservationCacheConfig {
  /** Maximum token budget for cached observations. Default: 50_000 */
  maxTokenBudget: number;
  /** Characters-per-token for estimation. Default: 4 */
  charsPerToken: number;
  /** Maximum observations to load from store. Default: 500 */
  maxObservations: number;
}

export interface CacheSnapshot {
  /** Cached observations in priority/recency order. */
  observations: Observation[];
  /** Total estimated tokens of cached observations. */
  totalTokens: number;
  /** Generation counter (increments on each rebuild). */
  generation: number;
  /** ISO timestamp of last rebuild. */
  rebuiltAt: string;
}

export interface PromptBlock {
  /** Formatted text ready for prompt injection. */
  text: string;
  /** Total tokens of the block. */
  tokens: number;
  /** Number of observations included. */
  count: number;
}

// ─── Priority ordering ──────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<ObservationPriority, number> = {
  high: 0,
  medium: 1,
  info: 2,
};

function priorityRank(p?: ObservationPriority): number {
  return p ? (PRIORITY_ORDER[p] ?? 3) : 3;
}

// ─── Token estimation ───────────────────────────────────────────────────────

function estimateTokens(content: string, charsPerToken: number): number {
  return Math.max(1, Math.ceil(content.length / Math.max(1, charsPerToken)));
}

// ─── Observation Cache ──────────────────────────────────────────────────────

const DEFAULT_CONFIG: ObservationCacheConfig = {
  maxTokenBudget: 50_000,
  charsPerToken: 4,
  maxObservations: 500,
};

/**
 * In-memory cache of active observations for a single agent.
 *
 * Usage:
 * ```ts
 * const cache = new ObservationCache(store, 'oracle');
 * const block = cache.getPromptBlock();
 * // inject block.text into system prompt
 * ```
 */
export class ObservationCache {
  private readonly store: ObservationStore;
  private readonly agentId: string;
  private readonly config: ObservationCacheConfig;

  private cached: Observation[] = [];
  private totalTokens = 0;
  private generation = 0;
  private rebuiltAt: string | null = null;
  private dirty = true;

  constructor(
    store: ObservationStore,
    agentId: string,
    config: Partial<ObservationCacheConfig> = {},
  ) {
    this.store = store;
    this.agentId = agentId;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Invalidate the cache. Next access will trigger a rebuild.
   */
  invalidate(): void {
    this.dirty = true;
  }

  /**
   * Rebuild the cache from the observation store.
   * Loads active observations, sorts by priority/recency, and trims to budget.
   */
  rebuild(): CacheSnapshot {
    const observations = this.store.getActiveObservations(
      this.agentId,
      this.config.maxObservations,
    );

    // Sort by priority (high first), then created_at DESC
    observations.sort((a, b) => {
      const pa = priorityRank(a.priority);
      const pb = priorityRank(b.priority);
      if (pa !== pb) return pa - pb;
      return b.createdAt.localeCompare(a.createdAt);
    });

    // Trim to token budget
    let runningTokens = 0;
    const trimmed: Observation[] = [];

    for (const obs of observations) {
      const tokens = estimateTokens(obs.content, this.config.charsPerToken);
      if (runningTokens + tokens > this.config.maxTokenBudget && trimmed.length > 0) {
        break;
      }
      trimmed.push(obs);
      runningTokens += tokens;
    }

    this.cached = trimmed;
    this.totalTokens = runningTokens;
    this.generation++;
    this.rebuiltAt = new Date().toISOString();
    this.dirty = false;

    return this.getSnapshot();
  }

  /**
   * Get the current cache snapshot, rebuilding if dirty.
   */
  getSnapshot(): CacheSnapshot {
    if (this.dirty) {
      return this.rebuild();
    }
    return {
      observations: [...this.cached],
      totalTokens: this.totalTokens,
      generation: this.generation,
      rebuiltAt: this.rebuiltAt ?? new Date().toISOString(),
    };
  }

  /**
   * Get the cached observations, rebuilding if dirty.
   */
  getObservations(): Observation[] {
    if (this.dirty) this.rebuild();
    return [...this.cached];
  }

  /**
   * Get total estimated tokens, rebuilding if dirty.
   */
  getTotalTokens(): number {
    if (this.dirty) this.rebuild();
    return this.totalTokens;
  }

  /**
   * Check if observations exceed the token budget threshold.
   * Useful for the reflector to decide whether to trigger.
   */
  exceedsBudget(threshold?: number): boolean {
    const budget = threshold ?? this.config.maxTokenBudget;
    return this.getTotalTokens() > budget;
  }

  /**
   * Format active observations as a prompt block for injection.
   * Groups by priority level with headers.
   */
  getPromptBlock(): PromptBlock {
    const observations = this.getObservations();
    if (observations.length === 0) {
      return { text: '', tokens: 0, count: 0 };
    }

    const groups: Record<string, Observation[]> = {};
    for (const obs of observations) {
      const key = obs.priority ?? 'info';
      if (!groups[key]) groups[key] = [];
      groups[key].push(obs);
    }

    const lines: string[] = ['## Active Observations'];
    const priorityOrder: ObservationPriority[] = ['high', 'medium', 'info'];
    const priorityLabels: Record<ObservationPriority, string> = {
      high: '🔴 High Priority',
      medium: '🟡 Medium Priority',
      info: '🟢 Info',
    };

    for (const p of priorityOrder) {
      const group = groups[p];
      if (!group || group.length === 0) continue;
      lines.push('');
      lines.push(`### ${priorityLabels[p]}`);
      for (const obs of group) {
        const dateRef = obs.referencedDate ? ` [ref: ${obs.referencedDate}]` : '';
        lines.push(`- ${obs.content}${dateRef}`);
      }
    }

    const text = lines.join('\n');
    return {
      text,
      tokens: estimateTokens(text, this.config.charsPerToken),
      count: observations.length,
    };
  }
}

export default ObservationCache;

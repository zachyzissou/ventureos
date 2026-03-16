/**
 * Rate Limiter — VentureOS Security Infrastructure (Track 4)
 *
 * Provides configurable rate limiting for multi-agent conversations:
 * - Per-agent rate limits (messages per minute / per hour)
 * - Per-conversation rate limits
 * - Challenge-specific rate limiting (low-affinity pair escalation control)
 * - Sliding window implementation (accurate, memory-efficient)
 * - Configurable backoff strategy when limits hit
 * - Integration with Affinity Network affinity data
 *
 * Uses in-memory sliding windows. For persistence across restarts,
 * call exportState() / importState().
 */

// ─── Types ────────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  /** Max messages per minute for a single agent. Default: 10 */
  agentPerMinute: number;
  /** Max messages per hour for a single agent. Default: 120 */
  agentPerHour: number;
  /** Max messages per minute for an entire conversation. Default: 30 */
  conversationPerMinute: number;
  /** Max messages per hour for an entire conversation. Default: 300 */
  conversationPerHour: number;
  /** Max challenges per hour between low-affinity pairs. Default: 5 */
  challengePerHour: number;
  /** Cooldown in ms after a challenge between the same pair. Default: 600_000 (10 min) */
  challengeCooldownMs: number;
  /** Backoff strategy when limits are hit. */
  backoffStrategy: BackoffStrategy;
  /** Whether to enable burst allowance. Default: true */
  burstAllowance: boolean;
  /** Burst multiplier on the per-minute limit. Default: 1.5 */
  burstMultiplier: number;
}

export type BackoffStrategy = 'fixed' | 'linear' | 'exponential';

export interface RateLimitResult {
  allowed: boolean;
  /** If not allowed, which limit was hit. */
  limitType?: 'agent_per_minute' | 'agent_per_hour' | 'conversation_per_minute' | 'conversation_per_hour' | 'challenge_per_hour' | 'challenge_cooldown';
  /** If not allowed, how long to wait (ms) before retrying. */
  retryAfterMs?: number;
  /** Current usage counts for debugging. */
  usage: {
    agentMinute: number;
    agentHour: number;
    conversationMinute?: number;
    conversationHour?: number;
    challengeHour?: number;
  };
  /** The limit that was checked against. */
  limits: {
    agentPerMinute: number;
    agentPerHour: number;
    conversationPerMinute?: number;
    conversationPerHour?: number;
    challengePerHour?: number;
  };
}

export interface ChallengeRateResult {
  allowed: boolean;
  limitType?: 'challenge_per_hour' | 'challenge_cooldown';
  retryAfterMs?: number;
  challengeCount: number;
  maxPerHour: number;
}

/** Pair-specific challenge limit override. */
export interface ChallengeLimitOverride {
  pair: [string, string];
  maxPerHour: number;
  cooldownMs: number;
}

export interface RateLimiterState {
  agentWindows: Record<string, number[]>;
  conversationWindows: Record<string, number[]>;
  challengeWindows: Record<string, number[]>;
  exportedAt: string;
}

// ─── Default Config ───────────────────────────────────────────────────────

const DEFAULT_CONFIG: RateLimitConfig = {
  agentPerMinute: 10,
  agentPerHour: 120,
  conversationPerMinute: 30,
  conversationPerHour: 300,
  challengePerHour: 5,
  challengeCooldownMs: 10 * 60 * 1000, // 10 minutes
  backoffStrategy: 'exponential',
  burstAllowance: true,
  burstMultiplier: 1.5,
};

/**
 * Preset challenge limits for known high-tension pairs.
 * More restrictive for higher-tension pairs.
 */
const DEFAULT_CHALLENGE_OVERRIDES: ChallengeLimitOverride[] = [
  { pair: ['oracle', 'synth'], maxPerHour: 5, cooldownMs: 10 * 60 * 1000 },
  { pair: ['sentinel', 'atlas'], maxPerHour: 3, cooldownMs: 15 * 60 * 1000 },
  { pair: ['verifier', 'synth'], maxPerHour: 4, cooldownMs: 12 * 60 * 1000 },
];

// ─── Sliding Window ───────────────────────────────────────────────────────

class SlidingWindow {
  private timestamps: number[] = [];

  /** Record a new event at the given timestamp. */
  record(ts: number = Date.now()): void {
    this.timestamps.push(ts);
  }

  /** Count events within the last `windowMs` milliseconds. Non-destructive. */
  count(windowMs: number, now: number = Date.now()): number {
    const cutoff = now - windowMs;
    return this.timestamps.filter(t => t >= cutoff).length;
  }

  /** Get the timestamp of the oldest event in the window. Non-destructive. */
  oldest(windowMs: number, now: number = Date.now()): number | undefined {
    const cutoff = now - windowMs;
    const inWindow = this.timestamps.filter(t => t >= cutoff);
    return inWindow.length > 0 ? inWindow[0] : undefined;
  }

  /** Get the timestamp of the most recent event. */
  latest(): number | undefined {
    return this.timestamps.length > 0 ? this.timestamps[this.timestamps.length - 1] : undefined;
  }

  /** Remove events older than the given timestamp. */
  prune(olderThan: number): void {
    this.timestamps = this.timestamps.filter(t => t >= olderThan);
  }

  /** Export raw timestamps for serialization. */
  export(): number[] {
    return [...this.timestamps];
  }

  /** Import timestamps from serialized state. */
  import(timestamps: number[]): void {
    this.timestamps = [...timestamps];
  }

  /** Clear all events. */
  clear(): void {
    this.timestamps = [];
  }
}

// ─── Rate Limiter Class ───────────────────────────────────────────────────

export class RateLimiter {
  private config: RateLimitConfig;
  private challengeOverrides: ChallengeLimitOverride[];

  /** Per-agent sliding windows. Key: agentId */
  private agentWindows = new Map<string, SlidingWindow>();
  /** Per-conversation sliding windows. Key: conversationId */
  private conversationWindows = new Map<string, SlidingWindow>();
  /** Per-pair challenge sliding windows. Key: normalized pair string */
  private challengeWindows = new Map<string, SlidingWindow>();

  /** Consecutive rejection count per agent (for backoff calculation). */
  private rejectionCounts = new Map<string, number>();

  constructor(
    config: Partial<RateLimitConfig> = {},
    challengeOverrides: ChallengeLimitOverride[] = DEFAULT_CHALLENGE_OVERRIDES
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.challengeOverrides = challengeOverrides;
  }

  // ─── Window Helpers ───────────────────────────────────────────────────

  private getAgentWindow(agentId: string): SlidingWindow {
    let w = this.agentWindows.get(agentId);
    if (!w) {
      w = new SlidingWindow();
      this.agentWindows.set(agentId, w);
    }
    return w;
  }

  private getConversationWindow(conversationId: string): SlidingWindow {
    let w = this.conversationWindows.get(conversationId);
    if (!w) {
      w = new SlidingWindow();
      this.conversationWindows.set(conversationId, w);
    }
    return w;
  }

  private getChallengeWindow(pairKey: string): SlidingWindow {
    let w = this.challengeWindows.get(pairKey);
    if (!w) {
      w = new SlidingWindow();
      this.challengeWindows.set(pairKey, w);
    }
    return w;
  }

  /** Normalize a pair key so order doesn't matter. */
  private pairKey(agentA: string, agentB: string): string {
    return [agentA, agentB].sort().join('::');
  }

  // ─── Backoff Calculation ──────────────────────────────────────────────

  /**
   * Calculate retry delay based on backoff strategy and consecutive rejections.
   */
  private computeBackoff(agentId: string, baseDelayMs: number): number {
    const rejections = this.rejectionCounts.get(agentId) ?? 0;

    switch (this.config.backoffStrategy) {
      case 'fixed':
        return baseDelayMs;
      case 'linear':
        return baseDelayMs * (1 + rejections);
      case 'exponential':
        return Math.min(baseDelayMs * Math.pow(2, rejections), 5 * 60 * 1000); // Cap at 5 minutes
      default:
        return baseDelayMs;
    }
  }

  private incrementRejections(agentId: string): void {
    const current = this.rejectionCounts.get(agentId) ?? 0;
    this.rejectionCounts.set(agentId, current + 1);
  }

  private resetRejections(agentId: string): void {
    this.rejectionCounts.delete(agentId);
  }

  // ─── Core Rate Check ─────────────────────────────────────────────────

  /**
   * Check if an agent message is allowed under rate limits.
   * Does NOT record the message — call record() separately after processing.
   */
  checkAgentLimit(agentId: string, now: number = Date.now()): RateLimitResult {
    const window = this.getAgentWindow(agentId);
    const minuteCount = window.count(60_000, now);
    const hourCount = window.count(3_600_000, now);

    const effectivePerMinute = this.config.burstAllowance
      ? Math.floor(this.config.agentPerMinute * this.config.burstMultiplier)
      : this.config.agentPerMinute;

    // Check per-minute limit
    if (minuteCount >= effectivePerMinute) {
      const oldest = window.oldest(60_000, now);
      const baseDelay = oldest ? (oldest + 60_000) - now : 5_000;
      this.incrementRejections(agentId);
      return {
        allowed: false,
        limitType: 'agent_per_minute',
        retryAfterMs: this.computeBackoff(agentId, Math.max(baseDelay, 1000)),
        usage: { agentMinute: minuteCount, agentHour: hourCount },
        limits: { agentPerMinute: effectivePerMinute, agentPerHour: this.config.agentPerHour },
      };
    }

    // Check per-hour limit
    if (hourCount >= this.config.agentPerHour) {
      const oldest = window.oldest(3_600_000, now);
      const baseDelay = oldest ? (oldest + 3_600_000) - now : 60_000;
      this.incrementRejections(agentId);
      return {
        allowed: false,
        limitType: 'agent_per_hour',
        retryAfterMs: this.computeBackoff(agentId, Math.max(baseDelay, 5_000)),
        usage: { agentMinute: minuteCount, agentHour: hourCount },
        limits: { agentPerMinute: effectivePerMinute, agentPerHour: this.config.agentPerHour },
      };
    }

    this.resetRejections(agentId);
    return {
      allowed: true,
      usage: { agentMinute: minuteCount, agentHour: hourCount },
      limits: { agentPerMinute: effectivePerMinute, agentPerHour: this.config.agentPerHour },
    };
  }

  /**
   * Check if a message is allowed in a specific conversation.
   */
  checkConversationLimit(conversationId: string, now: number = Date.now()): RateLimitResult {
    const window = this.getConversationWindow(conversationId);
    const minuteCount = window.count(60_000, now);
    const hourCount = window.count(3_600_000, now);

    if (minuteCount >= this.config.conversationPerMinute) {
      const oldest = window.oldest(60_000, now);
      const baseDelay = oldest ? (oldest + 60_000) - now : 5_000;
      return {
        allowed: false,
        limitType: 'conversation_per_minute',
        retryAfterMs: Math.max(baseDelay, 1_000),
        usage: { agentMinute: 0, agentHour: 0, conversationMinute: minuteCount, conversationHour: hourCount },
        limits: { agentPerMinute: 0, agentPerHour: 0, conversationPerMinute: this.config.conversationPerMinute, conversationPerHour: this.config.conversationPerHour },
      };
    }

    if (hourCount >= this.config.conversationPerHour) {
      const oldest = window.oldest(3_600_000, now);
      const baseDelay = oldest ? (oldest + 3_600_000) - now : 60_000;
      return {
        allowed: false,
        limitType: 'conversation_per_hour',
        retryAfterMs: Math.max(baseDelay, 5_000),
        usage: { agentMinute: 0, agentHour: 0, conversationMinute: minuteCount, conversationHour: hourCount },
        limits: { agentPerMinute: 0, agentPerHour: 0, conversationPerMinute: this.config.conversationPerMinute, conversationPerHour: this.config.conversationPerHour },
      };
    }

    return {
      allowed: true,
      usage: { agentMinute: 0, agentHour: 0, conversationMinute: minuteCount, conversationHour: hourCount },
      limits: { agentPerMinute: 0, agentPerHour: 0, conversationPerMinute: this.config.conversationPerMinute, conversationPerHour: this.config.conversationPerHour },
    };
  }

  /**
   * Check if a challenge between two agents is allowed.
   * Applies pair-specific overrides if configured.
   */
  checkChallengeLimit(agentA: string, agentB: string, now: number = Date.now()): ChallengeRateResult {
    const key = this.pairKey(agentA, agentB);
    const window = this.getChallengeWindow(key);

    // Find pair-specific override
    const override = this.challengeOverrides.find(o =>
      (o.pair[0] === agentA && o.pair[1] === agentB) ||
      (o.pair[1] === agentA && o.pair[0] === agentB)
    );

    const maxPerHour = override?.maxPerHour ?? this.config.challengePerHour;
    const cooldownMs = override?.cooldownMs ?? this.config.challengeCooldownMs;

    // Check cooldown (time since last challenge)
    const latest = window.latest();
    if (latest && (now - latest) < cooldownMs) {
      return {
        allowed: false,
        limitType: 'challenge_cooldown',
        retryAfterMs: cooldownMs - (now - latest),
        challengeCount: window.count(3_600_000, now),
        maxPerHour,
      };
    }

    // Check hourly limit
    const hourCount = window.count(3_600_000, now);
    if (hourCount >= maxPerHour) {
      const oldest = window.oldest(3_600_000, now);
      const retryAfter = oldest ? (oldest + 3_600_000) - now : 60_000;
      return {
        allowed: false,
        limitType: 'challenge_per_hour',
        retryAfterMs: Math.max(retryAfter, 1_000),
        challengeCount: hourCount,
        maxPerHour,
      };
    }

    return {
      allowed: true,
      challengeCount: hourCount,
      maxPerHour,
    };
  }

  /**
   * Combined check: agent limit + conversation limit.
   * Returns the most restrictive result.
   */
  checkAll(
    agentId: string,
    conversationId: string,
    options: { isChallenge?: boolean; challengeTarget?: string } = {},
    now: number = Date.now()
  ): RateLimitResult {
    // Check agent limit
    const agentResult = this.checkAgentLimit(agentId, now);
    if (!agentResult.allowed) return agentResult;

    // Check conversation limit
    const convResult = this.checkConversationLimit(conversationId, now);
    if (!convResult.allowed) return convResult;

    // Check challenge limit if applicable
    if (options.isChallenge && options.challengeTarget) {
      const challengeResult = this.checkChallengeLimit(agentId, options.challengeTarget, now);
      if (!challengeResult.allowed) {
        return {
          allowed: false,
          limitType: challengeResult.limitType,
          retryAfterMs: challengeResult.retryAfterMs,
          usage: {
            ...agentResult.usage,
            ...convResult.usage,
            challengeHour: challengeResult.challengeCount,
          },
          limits: {
            ...agentResult.limits,
            ...convResult.limits,
            challengePerHour: challengeResult.maxPerHour,
          },
        };
      }
    }

    return {
      allowed: true,
      usage: {
        ...agentResult.usage,
        ...convResult.usage,
      },
      limits: {
        ...agentResult.limits,
        ...convResult.limits,
      },
    };
  }

  // ─── Recording ────────────────────────────────────────────────────────

  /**
   * Record that a message was sent (call after message is processed).
   */
  recordMessage(agentId: string, conversationId: string, now: number = Date.now()): void {
    this.getAgentWindow(agentId).record(now);
    this.getConversationWindow(conversationId).record(now);
  }

  /**
   * Record a challenge interaction between two agents.
   */
  recordChallenge(agentA: string, agentB: string, now: number = Date.now()): void {
    const key = this.pairKey(agentA, agentB);
    this.getChallengeWindow(key).record(now);
  }

  // ─── State Management ─────────────────────────────────────────────────

  /**
   * Export all sliding window state for persistence.
   */
  exportState(): RateLimiterState {
    const agentWindows: Record<string, number[]> = {};
    for (const [k, w] of this.agentWindows) agentWindows[k] = w.export();

    const conversationWindows: Record<string, number[]> = {};
    for (const [k, w] of this.conversationWindows) conversationWindows[k] = w.export();

    const challengeWindows: Record<string, number[]> = {};
    for (const [k, w] of this.challengeWindows) challengeWindows[k] = w.export();

    return {
      agentWindows,
      conversationWindows,
      challengeWindows,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Import state from a previous export.
   */
  importState(state: RateLimiterState): void {
    for (const [k, timestamps] of Object.entries(state.agentWindows)) {
      const w = this.getAgentWindow(k);
      w.import(timestamps);
    }
    for (const [k, timestamps] of Object.entries(state.conversationWindows)) {
      const w = this.getConversationWindow(k);
      w.import(timestamps);
    }
    for (const [k, timestamps] of Object.entries(state.challengeWindows)) {
      const w = this.getChallengeWindow(k);
      w.import(timestamps);
    }
  }

  /**
   * Reset all rate limit state.
   */
  reset(): void {
    this.agentWindows.clear();
    this.conversationWindows.clear();
    this.challengeWindows.clear();
    this.rejectionCounts.clear();
  }

  /**
   * Reset state for a specific agent.
   */
  resetAgent(agentId: string): void {
    this.agentWindows.delete(agentId);
    this.rejectionCounts.delete(agentId);
  }

  /**
   * Reset state for a specific conversation.
   */
  resetConversation(conversationId: string): void {
    this.conversationWindows.delete(conversationId);
  }

  /**
   * Get current config.
   */
  getConfig(): Readonly<RateLimitConfig> {
    return { ...this.config };
  }

  /**
   * Update config dynamically.
   */
  updateConfig(updates: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Update challenge overrides dynamically.
   */
  updateChallengeOverrides(overrides: ChallengeLimitOverride[]): void {
    this.challengeOverrides = overrides;
  }

  /**
   * Prune all windows of expired entries.
   * Call periodically (e.g., every 5 minutes) to keep memory bounded.
   */
  prune(now: number = Date.now()): void {
    const hourAgo = now - 3_600_000;
    for (const w of this.agentWindows.values()) w.prune(hourAgo);
    for (const w of this.conversationWindows.values()) w.prune(hourAgo);
    for (const w of this.challengeWindows.values()) w.prune(hourAgo);
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────

let _defaultLimiter: RateLimiter | null = null;

/** Get or create the default rate limiter instance. */
export function getDefaultRateLimiter(config?: Partial<RateLimitConfig>): RateLimiter {
  if (!_defaultLimiter) {
    _defaultLimiter = new RateLimiter(config);
  }
  return _defaultLimiter;
}

/** Reset the default rate limiter (for testing). */
export function resetDefaultRateLimiter(): void {
  _defaultLimiter = null;
}

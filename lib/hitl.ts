/**
 * HITL (Human-in-the-Loop) — VentureOS Security Infrastructure (Track 4)
 *
 * Defines trigger conditions and workflows for escalating to human oversight:
 * - Low affinity escalations (agents spiraling into conflict)
 * - High injection score detection
 * - Policy violations from role card enforcement
 * - Consecutive challenge limits
 * - Token budget overruns
 * - Rate limit exhaustion
 *
 * Integrates with:
 * - Role card escalation system (role-card-enforcement.ts)
 * - Voice RULES system (voice-rules.ts)
 * - Discord webhook alerting (discord-webhook-send.mjs)
 *
 * Three escalation actions:
 * - notify: Alert humans, continue processing
 * - pause: Alert humans, pause conversation until acknowledged
 * - require_approval: Alert humans, block until explicit approval
 */

import type { RateLimitResult, ChallengeRateResult } from './rate-limiter';

// ─── Types ────────────────────────────────────────────────────────────────

export type HITLAction = 'continue' | 'notify' | 'pause' | 'require_approval';
export type HITLUrgency = 'low' | 'medium' | 'high' | 'critical';

export interface HITLTrigger {
  /** Unique identifier for this trigger. */
  id: string;
  /** Human-readable description. */
  description: string;
  /** What to do when triggered. */
  action: HITLAction;
  /** How urgent is this escalation. */
  urgency: HITLUrgency;
  /** Whether this trigger is currently enabled. */
  enabled: boolean;
  /** Category for routing and grouping. */
  category: 'security' | 'safety' | 'quality' | 'operational' | 'policy';
}

export interface HITLCheckResult {
  /** Final action to take (most restrictive of all matched triggers). */
  action: HITLAction;
  /** All triggers that fired. */
  matchedTriggers: Array<HITLTrigger & { reason: string }>;
  /** Whether any trigger fired. */
  triggered: boolean;
  /** Highest urgency among matched triggers. */
  urgency: HITLUrgency;
}

export interface HITLAlert {
  /** Unique alert ID. */
  alertId: string;
  /** When the alert was created. */
  timestamp: string;
  /** The trigger that caused this alert. */
  trigger: HITLTrigger;
  /** Human-readable reason. */
  reason: string;
  /** Context about the conversation/message. */
  context: HITLAlertContext;
  /** Current status of the alert. */
  status: 'pending' | 'acknowledged' | 'approved' | 'rejected' | 'expired';
}

export interface HITLAlertContext {
  conversationId?: string;
  agentId?: string;
  messageContent?: string;
  injectionScore?: number;
  affinityScore?: number;
  challengeCount?: number;
  rateLimitUsage?: Record<string, number>;
  roleCardViolations?: string[];
  voiceRuleViolations?: string[];
  additionalData?: Record<string, unknown>;
}

export interface ConversationState {
  conversationId: string;
  participants: string[];
  messageCount: number;
  challengeCount: number;
  consecutiveChallenges: number;
  averageAffinity: number;
  lowestAffinity: number;
  lowestAffinityPair: [string, string];
  tokenBudget: number;
  tokensUsed: number;
  injectionScores: number[];
  policyViolationCount: number;
  voiceRuleViolationCount: number;
  lastMessageTimestamp?: number;
}

export interface HITLConfig {
  /** Injection score threshold for notification. Default: 0.3 */
  injectionNotifyThreshold: number;
  /** Injection score threshold for requiring approval. Default: 0.7 */
  injectionApprovalThreshold: number;
  /** Affinity threshold below which escalations are triggered. Default: 0.3 */
  lowAffinityThreshold: number;
  /** Number of consecutive challenges that triggers a pause. Default: 3 */
  consecutiveChallengeLimit: number;
  /** Token budget usage percentage that triggers notification. Default: 0.8 */
  tokenBudgetWarningRatio: number;
  /** Token budget usage percentage that triggers pause. Default: 0.95 */
  tokenBudgetPauseRatio: number;
  /** Channel ID for Discord alerts. */
  discordAlertChannelId?: string;
  /** Whether to log all HITL checks (verbose mode). Default: false */
  verbose: boolean;
  /** Alert expiry time in ms. Default: 1 hour */
  alertExpiryMs: number;
}

/** Callback type for alert delivery (Discord, logging, etc.). */
export type AlertHandler = (alert: HITLAlert) => Promise<void>;

// ─── Constants ────────────────────────────────────────────────────────────

const ACTION_SEVERITY: Record<HITLAction, number> = {
  continue: 0,
  notify: 1,
  pause: 2,
  require_approval: 3,
};

const URGENCY_SEVERITY: Record<HITLUrgency, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const DEFAULT_CONFIG: HITLConfig = {
  injectionNotifyThreshold: 0.3,
  injectionApprovalThreshold: 0.7,
  lowAffinityThreshold: 0.3,
  consecutiveChallengeLimit: 3,
  tokenBudgetWarningRatio: 0.8,
  tokenBudgetPauseRatio: 0.95,
  verbose: false,
  alertExpiryMs: 60 * 60 * 1000, // 1 hour
};

// ─── Built-in Trigger Definitions ─────────────────────────────────────────

export const BUILTIN_TRIGGERS: HITLTrigger[] = [
  {
    id: 'injection_notify',
    description: 'Moderate prompt injection score detected',
    action: 'notify',
    urgency: 'medium',
    enabled: true,
    category: 'security',
  },
  {
    id: 'injection_block',
    description: 'High prompt injection score — likely injection attempt',
    action: 'require_approval',
    urgency: 'critical',
    enabled: true,
    category: 'security',
  },
  {
    id: 'low_affinity_challenge',
    description: 'Challenge between low-affinity agents',
    action: 'notify',
    urgency: 'medium',
    enabled: true,
    category: 'safety',
  },
  {
    id: 'consecutive_challenges',
    description: 'Too many consecutive challenges — possible escalation spiral',
    action: 'pause',
    urgency: 'high',
    enabled: true,
    category: 'safety',
  },
  {
    id: 'rate_limit_exhaustion',
    description: 'Agent hit rate limits multiple times',
    action: 'notify',
    urgency: 'medium',
    enabled: true,
    category: 'operational',
  },
  {
    id: 'token_budget_warning',
    description: 'Conversation approaching token budget limit',
    action: 'notify',
    urgency: 'low',
    enabled: true,
    category: 'operational',
  },
  {
    id: 'token_budget_exhaustion',
    description: 'Conversation nearly out of token budget',
    action: 'pause',
    urgency: 'high',
    enabled: true,
    category: 'operational',
  },
  {
    id: 'policy_violation_block',
    description: 'Role card infrastructure ban violated',
    action: 'require_approval',
    urgency: 'critical',
    enabled: true,
    category: 'policy',
  },
  {
    id: 'policy_violation_warn',
    description: 'Role card heuristic ban triggered',
    action: 'notify',
    urgency: 'medium',
    enabled: true,
    category: 'policy',
  },
  {
    id: 'voice_rule_violation',
    description: 'Voice RULES blocking violation detected',
    action: 'notify',
    urgency: 'low',
    enabled: true,
    category: 'quality',
  },
  {
    id: 'multi_agent_anomaly',
    description: 'Unusual pattern detected across multiple agents',
    action: 'pause',
    urgency: 'high',
    enabled: true,
    category: 'security',
  },
];

// ─── HITL Engine ──────────────────────────────────────────────────────────

export class HITLEngine {
  private config: HITLConfig;
  private triggers: HITLTrigger[];
  private alerts: Map<string, HITLAlert> = new Map();
  private alertHandlers: AlertHandler[] = [];
  private alertCounter = 0;

  constructor(config: Partial<HITLConfig> = {}, customTriggers?: HITLTrigger[]) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.triggers = customTriggers ?? [...BUILTIN_TRIGGERS];
  }

  // ─── Trigger Registration ───────────────────────────────────────────

  /**
   * Add a custom trigger.
   */
  addTrigger(trigger: HITLTrigger): void {
    // Replace if same ID exists
    this.triggers = this.triggers.filter(t => t.id !== trigger.id);
    this.triggers.push(trigger);
  }

  /**
   * Enable/disable a trigger by ID.
   */
  setTriggerEnabled(triggerId: string, enabled: boolean): void {
    const trigger = this.triggers.find(t => t.id === triggerId);
    if (trigger) trigger.enabled = enabled;
  }

  /**
   * Get all registered triggers.
   */
  getTriggers(): ReadonlyArray<HITLTrigger> {
    return this.triggers;
  }

  // ─── Alert Handlers ─────────────────────────────────────────────────

  /**
   * Register a handler to receive alerts (e.g., Discord webhook, logging).
   */
  onAlert(handler: AlertHandler): void {
    this.alertHandlers.push(handler);
  }

  /**
   * Get pending alerts.
   */
  getPendingAlerts(): HITLAlert[] {
    return [...this.alerts.values()].filter(a => a.status === 'pending');
  }

  /**
   * Get an alert by ID.
   */
  getAlert(alertId: string): HITLAlert | undefined {
    return this.alerts.get(alertId);
  }

  /**
   * Acknowledge an alert (human saw it).
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.status !== 'pending') return false;
    alert.status = 'acknowledged';
    return true;
  }

  /**
   * Approve a pending require_approval alert.
   */
  approveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert || (alert.status !== 'pending' && alert.status !== 'acknowledged')) return false;
    alert.status = 'approved';
    return true;
  }

  /**
   * Reject a pending require_approval alert.
   */
  rejectAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert || (alert.status !== 'pending' && alert.status !== 'acknowledged')) return false;
    alert.status = 'rejected';
    return true;
  }

  /**
   * Expire old alerts.
   */
  expireAlerts(now: number = Date.now()): number {
    let count = 0;
    for (const alert of this.alerts.values()) {
      if (alert.status === 'pending' && (now - new Date(alert.timestamp).getTime()) > this.config.alertExpiryMs) {
        alert.status = 'expired';
        count++;
      }
    }
    return count;
  }

  // ─── Core Check Functions ───────────────────────────────────────────

  /**
   * Check injection score against HITL thresholds.
   */
  checkInjectionScore(injectionScore: number, context: HITLAlertContext = {}): HITLCheckResult {
    const matched: Array<HITLTrigger & { reason: string }> = [];

    if (injectionScore >= this.config.injectionApprovalThreshold) {
      const trigger = this.triggers.find(t => t.id === 'injection_block' && t.enabled);
      if (trigger) {
        matched.push({
          ...trigger,
          reason: `Injection score ${injectionScore.toFixed(2)} exceeds approval threshold ${this.config.injectionApprovalThreshold}`,
        });
      }
    } else if (injectionScore >= this.config.injectionNotifyThreshold) {
      const trigger = this.triggers.find(t => t.id === 'injection_notify' && t.enabled);
      if (trigger) {
        matched.push({
          ...trigger,
          reason: `Injection score ${injectionScore.toFixed(2)} exceeds notify threshold ${this.config.injectionNotifyThreshold}`,
        });
      }
    }

    return this.buildResult(matched);
  }

  /**
   * Check conversation state for escalation triggers.
   */
  checkConversationState(state: ConversationState): HITLCheckResult {
    const matched: Array<HITLTrigger & { reason: string }> = [];

    // Consecutive challenges
    if (state.consecutiveChallenges >= this.config.consecutiveChallengeLimit) {
      const trigger = this.triggers.find(t => t.id === 'consecutive_challenges' && t.enabled);
      if (trigger) {
        matched.push({
          ...trigger,
          reason: `${state.consecutiveChallenges} consecutive challenges (limit: ${this.config.consecutiveChallengeLimit})`,
        });
      }
    }

    // Low affinity challenge
    if (state.lowestAffinity < this.config.lowAffinityThreshold && state.challengeCount > 0) {
      const trigger = this.triggers.find(t => t.id === 'low_affinity_challenge' && t.enabled);
      if (trigger) {
        matched.push({
          ...trigger,
          reason: `Challenge detected between ${state.lowestAffinityPair.join(' ↔ ')} with affinity ${state.lowestAffinity.toFixed(2)} (threshold: ${this.config.lowAffinityThreshold})`,
        });
      }
    }

    // Token budget
    if (state.tokenBudget > 0) {
      const ratio = state.tokensUsed / state.tokenBudget;
      if (ratio >= this.config.tokenBudgetPauseRatio) {
        const trigger = this.triggers.find(t => t.id === 'token_budget_exhaustion' && t.enabled);
        if (trigger) {
          matched.push({
            ...trigger,
            reason: `Token budget ${(ratio * 100).toFixed(0)}% used (${state.tokensUsed}/${state.tokenBudget})`,
          });
        }
      } else if (ratio >= this.config.tokenBudgetWarningRatio) {
        const trigger = this.triggers.find(t => t.id === 'token_budget_warning' && t.enabled);
        if (trigger) {
          matched.push({
            ...trigger,
            reason: `Token budget ${(ratio * 100).toFixed(0)}% used (${state.tokensUsed}/${state.tokenBudget})`,
          });
        }
      }
    }

    // Injection scores from conversation history
    const maxInjection = Math.max(0, ...state.injectionScores);
    if (maxInjection >= this.config.injectionApprovalThreshold) {
      const trigger = this.triggers.find(t => t.id === 'injection_block' && t.enabled);
      if (trigger) {
        matched.push({
          ...trigger,
          reason: `Max injection score in conversation: ${maxInjection.toFixed(2)}`,
        });
      }
    }

    return this.buildResult(matched);
  }

  /**
   * Check role card enforcement results for HITL triggers.
   */
  checkPolicyViolations(
    violations: Array<{ tier: string; rule: string; severity: string }>,
    context: HITLAlertContext = {}
  ): HITLCheckResult {
    const matched: Array<HITLTrigger & { reason: string }> = [];

    const infraViolations = violations.filter(v => v.tier === 'infrastructure');
    const heuristicViolations = violations.filter(v => v.tier === 'heuristic');

    if (infraViolations.length > 0) {
      const trigger = this.triggers.find(t => t.id === 'policy_violation_block' && t.enabled);
      if (trigger) {
        matched.push({
          ...trigger,
          reason: `Infrastructure ban violated: ${infraViolations.map(v => v.rule).join('; ')}`,
        });
      }
    }

    if (heuristicViolations.length > 0) {
      const trigger = this.triggers.find(t => t.id === 'policy_violation_warn' && t.enabled);
      if (trigger) {
        matched.push({
          ...trigger,
          reason: `Heuristic ban triggered: ${heuristicViolations.map(v => v.rule).join('; ')}`,
        });
      }
    }

    return this.buildResult(matched);
  }

  /**
   * Check voice rule violations.
   */
  checkVoiceRuleViolations(
    violations: Array<{ rule: string; severity: string }>,
    context: HITLAlertContext = {}
  ): HITLCheckResult {
    const matched: Array<HITLTrigger & { reason: string }> = [];

    const blockingViolations = violations.filter(v => v.severity === 'block');
    if (blockingViolations.length > 0) {
      const trigger = this.triggers.find(t => t.id === 'voice_rule_violation' && t.enabled);
      if (trigger) {
        matched.push({
          ...trigger,
          reason: `Voice RULES blocking violation: ${blockingViolations.map(v => v.rule).join('; ')}`,
        });
      }
    }

    return this.buildResult(matched);
  }

  /**
   * Check rate limit result for HITL triggers.
   */
  checkRateLimitResult(result: RateLimitResult, agentId: string): HITLCheckResult {
    const matched: Array<HITLTrigger & { reason: string }> = [];

    if (!result.allowed) {
      const trigger = this.triggers.find(t => t.id === 'rate_limit_exhaustion' && t.enabled);
      if (trigger) {
        matched.push({
          ...trigger,
          reason: `Agent ${agentId} hit rate limit: ${result.limitType} (usage: ${JSON.stringify(result.usage)})`,
        });
      }
    }

    return this.buildResult(matched);
  }

  /**
   * Combined check: runs all applicable checks against a conversation message.
   * This is the main entry point for the HITL pipeline.
   */
  async checkMessage(params: {
    agentId: string;
    conversationState: ConversationState;
    injectionScore: number;
    policyViolations?: Array<{ tier: string; rule: string; severity: string }>;
    voiceViolations?: Array<{ rule: string; severity: string }>;
    rateLimitResult?: RateLimitResult;
    context?: HITLAlertContext;
  }): Promise<HITLCheckResult> {
    const allMatched: Array<HITLTrigger & { reason: string }> = [];

    // 1. Injection check
    const injectionResult = this.checkInjectionScore(params.injectionScore, params.context);
    allMatched.push(...injectionResult.matchedTriggers);

    // 2. Conversation state check
    const convResult = this.checkConversationState(params.conversationState);
    allMatched.push(...convResult.matchedTriggers);

    // 3. Policy violations check
    if (params.policyViolations?.length) {
      const policyResult = this.checkPolicyViolations(params.policyViolations, params.context);
      allMatched.push(...policyResult.matchedTriggers);
    }

    // 4. Voice rule violations check
    if (params.voiceViolations?.length) {
      const voiceResult = this.checkVoiceRuleViolations(params.voiceViolations, params.context);
      allMatched.push(...voiceResult.matchedTriggers);
    }

    // 5. Rate limit check
    if (params.rateLimitResult) {
      const rlResult = this.checkRateLimitResult(params.rateLimitResult, params.agentId);
      allMatched.push(...rlResult.matchedTriggers);
    }

    const result = this.buildResult(allMatched);

    // Fire alerts for all matched triggers
    if (result.triggered) {
      await this.fireAlerts(allMatched, params.context ?? {
        conversationId: params.conversationState.conversationId,
        agentId: params.agentId,
        injectionScore: params.injectionScore,
      });
    }

    return result;
  }

  // ─── Internal Helpers ───────────────────────────────────────────────

  private buildResult(matched: Array<HITLTrigger & { reason: string }>): HITLCheckResult {
    if (matched.length === 0) {
      return {
        action: 'continue',
        matchedTriggers: [],
        triggered: false,
        urgency: 'low',
      };
    }

    // Pick the most severe action and urgency
    let maxAction: HITLAction = 'continue';
    let maxUrgency: HITLUrgency = 'low';

    for (const trigger of matched) {
      if (ACTION_SEVERITY[trigger.action] > ACTION_SEVERITY[maxAction]) {
        maxAction = trigger.action;
      }
      if (URGENCY_SEVERITY[trigger.urgency] > URGENCY_SEVERITY[maxUrgency]) {
        maxUrgency = trigger.urgency;
      }
    }

    return {
      action: maxAction,
      matchedTriggers: matched,
      triggered: true,
      urgency: maxUrgency,
    };
  }

  private async fireAlerts(
    matched: Array<HITLTrigger & { reason: string }>,
    context: HITLAlertContext
  ): Promise<void> {
    for (const trigger of matched) {
      const alert: HITLAlert = {
        alertId: `hitl_${++this.alertCounter}_${Date.now()}`,
        timestamp: new Date().toISOString(),
        trigger,
        reason: trigger.reason,
        context,
        status: 'pending',
      };

      this.alerts.set(alert.alertId, alert);

      // Fire all handlers
      for (const handler of this.alertHandlers) {
        try {
          await handler(alert);
        } catch (err) {
          // Don't let handler failures block the pipeline
          console.error('[HITL] Alert handler error:', err);
        }
      }
    }
  }

  // ─── State Management ───────────────────────────────────────────────

  /**
   * Get config.
   */
  getConfig(): Readonly<HITLConfig> {
    return { ...this.config };
  }

  /**
   * Update config dynamically.
   */
  updateConfig(updates: Partial<HITLConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Reset all alerts.
   */
  resetAlerts(): void {
    this.alerts.clear();
    this.alertCounter = 0;
  }
}

// ─── Discord Alert Formatting ─────────────────────────────────────────────

/**
 * Format a HITL alert for Discord webhook delivery.
 */
export function formatAlertForDiscord(alert: HITLAlert): {
  title: string;
  description: string;
  color: string;
} {
  const urgencyColors: Record<HITLUrgency, string> = {
    low: '#3b82f6',      // blue
    medium: '#f59e0b',   // amber
    high: '#ef4444',     // red
    critical: '#7f1d1d', // dark red
  };

  const urgencyEmoji: Record<HITLUrgency, string> = {
    low: 'ℹ️',
    medium: '⚠️',
    high: '🚨',
    critical: '🔴',
  };

  const actionEmoji: Record<HITLAction, string> = {
    continue: '✅',
    notify: '📢',
    pause: '⏸️',
    require_approval: '🛑',
  };

  const lines: string[] = [
    `**Trigger:** ${alert.trigger.description}`,
    `**Action:** ${actionEmoji[alert.trigger.action]} ${alert.trigger.action.replace('_', ' ').toUpperCase()}`,
    `**Category:** ${alert.trigger.category}`,
    `**Reason:** ${alert.reason}`,
    '',
  ];

  if (alert.context.agentId) lines.push(`**Agent:** ${alert.context.agentId}`);
  if (alert.context.conversationId) lines.push(`**Conversation:** ${alert.context.conversationId}`);
  if (alert.context.injectionScore !== undefined) lines.push(`**Injection Score:** ${alert.context.injectionScore.toFixed(2)}`);
  if (alert.context.affinityScore !== undefined) lines.push(`**Affinity:** ${alert.context.affinityScore.toFixed(2)}`);
  if (alert.context.challengeCount !== undefined) lines.push(`**Challenge Count:** ${alert.context.challengeCount}`);
  if (alert.context.roleCardViolations?.length) lines.push(`**Policy Violations:** ${alert.context.roleCardViolations.join(', ')}`);

  return {
    title: `${urgencyEmoji[alert.trigger.urgency]} HITL Alert: ${alert.trigger.id}`,
    description: lines.join('\n'),
    color: urgencyColors[alert.trigger.urgency],
  };
}

/**
 * Create a Discord webhook alert handler.
 * Requires discord-webhook-send.mjs to be available.
 */
export function createDiscordAlertHandler(channelId: string): AlertHandler {
  return async (alert: HITLAlert) => {
    const formatted = formatAlertForDiscord(alert);

    // Use child_process to call the webhook script
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const { join } = await import('node:path');
    const execFileAsync = promisify(execFile);

    const scriptPath = join(process.env.HOME ?? '~', 'clawd', 'scripts', 'discord-webhook-send.mjs');

    try {
      await execFileAsync('node', [
        scriptPath,
        '--channel', channelId,
        '--title', formatted.title,
        '--description', formatted.description,
        '--color', formatted.color,
      ]);
    } catch (err) {
      console.error(`[HITL] Failed to send Discord alert to ${channelId}:`, err);
    }
  };
}

// ─── Singleton ────────────────────────────────────────────────────────────

let _defaultEngine: HITLEngine | null = null;

/** Get or create the default HITL engine. */
export function getDefaultHITLEngine(config?: Partial<HITLConfig>): HITLEngine {
  if (!_defaultEngine) {
    _defaultEngine = new HITLEngine(config);
  }
  return _defaultEngine;
}

/** Reset the default HITL engine (for testing). */
export function resetDefaultHITLEngine(): void {
  _defaultEngine = null;
}

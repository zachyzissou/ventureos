/**
 * Escalation Policy — time-based severity escalation for webhook alerts.
 * Issue #219 — Phase 19: Webhook Alert Escalation Policy Baseline.
 *
 * Provides deterministic, bounded escalation behavior on top of the
 * existing alert/webhook system. When a critical (or warning) state
 * persists beyond configured time windows, the escalation policy can:
 *
 *   1. Upgrade the effective severity for webhook targeting (e.g., a
 *      warning that persists for 15 minutes escalates to critical targets)
 *   2. Override cooldown to re-notify designated escalation targets
 *   3. Track escalation tiers with bounded progression (max 3 tiers)
 *
 * Design principles:
 *   - **Additive**: escalation is layered on top of existing webhook
 *     dispatch — it never modifies alert evaluation or history.
 *   - **Deterministic**: decisions are pure functions of current state +
 *     config + timestamps. No background timers or daemons.
 *   - **Piggybacked**: evaluated inline during metrics reads (same path
 *     as maybeDeliverWebhooks). Zero new scheduling.
 *   - **Backward-compatible**: disabled by default. Existing configs
 *     without escalation fields work identically to before.
 *   - **Bounded**: max 3 escalation tiers, max 5 escalation targets,
 *     cooldown enforced between escalation notifications.
 *   - **Reversible**: escalation state resets immediately when severity
 *     returns to 'ok'. No hysteresis traps.
 *
 * Escalation state is in-memory (non-persistent), matching the existing
 * delivery state pattern. Resets on server restart — safe and bounded.
 */

import type { AlertSeverity, AlertEvaluation } from './alert-rules.js';
import type { WebhookTarget, WebhookConfig, WebhookDeliveryResult } from './alert-webhook.js';
import { deliverWebhook, buildWebhookPayload } from './alert-webhook.js';
import { appendDeliveryEvents } from './webhook-delivery-history.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A single escalation tier — defines when and how to escalate.
 * Tiers are evaluated in order; each tier requires the prior to have
 * been reached (i.e., tier 2 requires tier 1 to have fired first).
 */
export interface EscalationTier {
  /** Time (ms) the qualifying severity must persist before this tier fires. */
  afterMs: number;
  /**
   * Target IDs to notify when this tier triggers.
   * These reference WebhookTarget.id values from the main config.
   * If empty, re-notifies all eligible targets from the base config.
   */
  targetIds: string[];
  /**
   * Optional label for dashboard display (e.g., "Page on-call", "Notify manager").
   */
  label?: string;
}

/**
 * Escalation policy configuration — embedded in WebhookConfig.
 * Disabled by default. When enabled, adds escalation tiers on top
 * of the existing webhook dispatch.
 */
export interface EscalationPolicyConfig {
  /** Whether escalation is enabled. Default: false. */
  enabled: boolean;
  /**
   * Minimum severity that qualifies for escalation tracking.
   * Only states at or above this severity start the escalation clock.
   * Default: 'critical'.
   */
  triggerSeverity?: AlertSeverity;
  /**
   * Escalation tiers, evaluated in order. Max 3 tiers.
   * Each tier's afterMs must be strictly greater than the previous.
   */
  tiers: EscalationTier[];
  /**
   * Cooldown between escalation notifications per tier (ms).
   * Prevents flood if the qualifying state persists well beyond the tier threshold.
   * Default: 300000 (5 minutes).
   */
  cooldownMs?: number;
}

/** In-memory escalation tracking state. */
export interface EscalationState {
  /**
   * Timestamp when the qualifying severity was first observed (ms since epoch).
   * Null when not in an escalating state.
   */
  qualifyingSince: number | null;
  /**
   * The severity that started the escalation clock.
   * Null when not in an escalating state.
   */
  qualifyingSeverity: AlertSeverity | null;
  /**
   * Highest tier index that has been triggered (0-indexed).
   * -1 means no tier has been triggered yet.
   */
  lastTriggeredTier: number;
  /**
   * Timestamp of last escalation notification per tier index.
   * Used for per-tier cooldown enforcement.
   */
  lastNotifiedAt: Record<number, number>;
}

/** Result of an escalation evaluation — what action (if any) to take. */
export interface EscalationDecision {
  /** Whether any escalation notification should be sent. */
  shouldEscalate: boolean;
  /** Which tier index is triggering (null if no escalation). */
  tierIndex: number | null;
  /** The tier config (null if no escalation). */
  tier: EscalationTier | null;
  /** Target IDs to notify (empty if no escalation). */
  targetIds: string[];
  /** Duration the qualifying state has persisted (ms). */
  qualifyingDurationMs: number;
  /** Human-readable reason for the decision. */
  reason: string;
}

/** Result of escalation dispatch (extends base delivery results). */
export interface EscalationDeliveryResult {
  /** The tier that triggered. */
  tierIndex: number;
  tierLabel: string | null;
  /** Delivery results for each target. */
  deliveryResults: WebhookDeliveryResult[];
  /** Duration the qualifying state had persisted when triggered. */
  qualifyingDurationMs: number;
}

/** Validation error for escalation policy config. */
export interface EscalationConfigValidationError {
  field: string;
  message: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_ESCALATION_COOLDOWN_MS = 300_000; // 5 minutes
const DEFAULT_TRIGGER_SEVERITY: AlertSeverity = 'critical';
const MAX_TIERS = 3;
const MAX_ESCALATION_TARGETS_PER_TIER = 5;
const MIN_TIER_AFTER_MS = 60_000; // 1 minute minimum
const MAX_TIER_AFTER_MS = 86_400_000; // 24 hours maximum

/** Severity priority for comparison. */
const SEVERITY_PRIORITY: Record<AlertSeverity, number> = {
  ok: 0,
  warning: 1,
  critical: 2,
};

// ─── In-memory escalation state (non-persistent, resets on restart) ──────────

let escalationState: EscalationState = {
  qualifyingSince: null,
  qualifyingSeverity: null,
  lastTriggeredTier: -1,
  lastNotifiedAt: {},
};

/** Reset escalation state (for testing). */
export function resetEscalationState(): void {
  escalationState = {
    qualifyingSince: null,
    qualifyingSeverity: null,
    lastTriggeredTier: -1,
    lastNotifiedAt: {},
  };
}

/** Get current escalation state (for testing/inspection). */
export function getEscalationState(): Readonly<EscalationState> {
  return escalationState;
}

// ─── Default config ──────────────────────────────────────────────────────────

export const DEFAULT_ESCALATION_POLICY: EscalationPolicyConfig = {
  enabled: false,
  triggerSeverity: DEFAULT_TRIGGER_SEVERITY,
  tiers: [],
  cooldownMs: DEFAULT_ESCALATION_COOLDOWN_MS,
};

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate an escalation policy config.
 * Returns array of errors (empty = valid).
 * Pure function.
 */
export function validateEscalationPolicy(
  input: unknown,
  availableTargetIds?: string[],
): EscalationConfigValidationError[] {
  const errors: EscalationConfigValidationError[] = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ field: 'escalation', message: 'escalation must be a non-null object' });
    return errors;
  }

  const obj = input as Record<string, unknown>;

  if (obj.enabled !== undefined && typeof obj.enabled !== 'boolean') {
    errors.push({ field: 'escalation.enabled', message: 'enabled must be a boolean' });
  }

  if (obj.triggerSeverity !== undefined) {
    if (typeof obj.triggerSeverity !== 'string' || !['ok', 'warning', 'critical'].includes(obj.triggerSeverity)) {
      errors.push({ field: 'escalation.triggerSeverity', message: 'triggerSeverity must be ok, warning, or critical' });
    }
  }

  if (obj.cooldownMs !== undefined) {
    if (typeof obj.cooldownMs !== 'number' || !isFinite(obj.cooldownMs) || obj.cooldownMs < 0) {
      errors.push({ field: 'escalation.cooldownMs', message: 'cooldownMs must be a non-negative finite number' });
    }
  }

  if (obj.tiers !== undefined) {
    if (!Array.isArray(obj.tiers)) {
      errors.push({ field: 'escalation.tiers', message: 'tiers must be an array' });
    } else {
      if (obj.tiers.length > MAX_TIERS) {
        errors.push({ field: 'escalation.tiers', message: `maximum ${MAX_TIERS} escalation tiers allowed` });
      }

      let prevAfterMs = 0;
      for (let i = 0; i < obj.tiers.length; i++) {
        const t = obj.tiers[i];
        const prefix = `escalation.tiers[${i}]`;

        if (!t || typeof t !== 'object' || Array.isArray(t)) {
          errors.push({ field: prefix, message: 'tier must be an object' });
          continue;
        }

        const tObj = t as Record<string, unknown>;

        // afterMs validation
        if (typeof tObj.afterMs !== 'number' || !isFinite(tObj.afterMs)) {
          errors.push({ field: `${prefix}.afterMs`, message: 'afterMs is required and must be a finite number' });
        } else {
          if (tObj.afterMs < MIN_TIER_AFTER_MS) {
            errors.push({ field: `${prefix}.afterMs`, message: `afterMs must be >= ${MIN_TIER_AFTER_MS}ms (1 minute)` });
          }
          if (tObj.afterMs > MAX_TIER_AFTER_MS) {
            errors.push({ field: `${prefix}.afterMs`, message: `afterMs must be <= ${MAX_TIER_AFTER_MS}ms (24 hours)` });
          }
          if (tObj.afterMs <= prevAfterMs) {
            errors.push({ field: `${prefix}.afterMs`, message: `afterMs must be strictly greater than previous tier (${prevAfterMs}ms)` });
          }
          prevAfterMs = tObj.afterMs;
        }

        // targetIds validation
        if (!Array.isArray(tObj.targetIds)) {
          errors.push({ field: `${prefix}.targetIds`, message: 'targetIds must be an array' });
        } else {
          if (tObj.targetIds.length > MAX_ESCALATION_TARGETS_PER_TIER) {
            errors.push({
              field: `${prefix}.targetIds`,
              message: `maximum ${MAX_ESCALATION_TARGETS_PER_TIER} targets per tier`,
            });
          }
          for (let j = 0; j < tObj.targetIds.length; j++) {
            const tid = tObj.targetIds[j];
            if (typeof tid !== 'string' || tid.trim().length === 0) {
              errors.push({ field: `${prefix}.targetIds[${j}]`, message: 'target ID must be a non-empty string' });
            } else if (availableTargetIds && !availableTargetIds.includes(tid)) {
              errors.push({
                field: `${prefix}.targetIds[${j}]`,
                message: `target ID "${tid}" does not match any configured webhook target`,
              });
            }
          }
        }

        // label validation (optional)
        if (tObj.label !== undefined && typeof tObj.label !== 'string') {
          errors.push({ field: `${prefix}.label`, message: 'label must be a string' });
        }
      }
    }
  }

  return errors;
}

/**
 * Sanitize/normalize an escalation policy config.
 * Fills missing fields with defaults, validates types.
 * Pure function.
 */
export function sanitizeEscalationPolicy(raw: unknown): EscalationPolicyConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_ESCALATION_POLICY, tiers: [] };
  }

  const obj = raw as Record<string, unknown>;

  const enabled = typeof obj.enabled === 'boolean' ? obj.enabled : false;

  const triggerSeverity: AlertSeverity = (
    typeof obj.triggerSeverity === 'string' &&
    ['ok', 'warning', 'critical'].includes(obj.triggerSeverity)
  )
    ? obj.triggerSeverity as AlertSeverity
    : DEFAULT_TRIGGER_SEVERITY;

  const cooldownMs = typeof obj.cooldownMs === 'number' && isFinite(obj.cooldownMs) && obj.cooldownMs >= 0
    ? obj.cooldownMs
    : DEFAULT_ESCALATION_COOLDOWN_MS;

  const tiers: EscalationTier[] = [];
  if (Array.isArray(obj.tiers)) {
    for (const t of obj.tiers.slice(0, MAX_TIERS)) {
      if (t && typeof t === 'object' && !Array.isArray(t)) {
        const tObj = t as Record<string, unknown>;
        if (typeof tObj.afterMs === 'number' && isFinite(tObj.afterMs) && tObj.afterMs >= MIN_TIER_AFTER_MS) {
          const targetIds: string[] = [];
          if (Array.isArray(tObj.targetIds)) {
            for (const tid of tObj.targetIds.slice(0, MAX_ESCALATION_TARGETS_PER_TIER)) {
              if (typeof tid === 'string' && tid.trim().length > 0) {
                targetIds.push(tid.trim());
              }
            }
          }
          tiers.push({
            afterMs: Math.min(tObj.afterMs, MAX_TIER_AFTER_MS),
            targetIds,
            label: typeof tObj.label === 'string' ? tObj.label.slice(0, 100) : undefined,
          });
        }
      }
    }
  }

  return { enabled, triggerSeverity, tiers, cooldownMs };
}

// ─── Escalation Decision Logic ───────────────────────────────────────────────

/**
 * Determine whether the current severity qualifies for escalation tracking.
 * Pure function.
 */
export function isQualifyingSeverity(
  currentSeverity: AlertSeverity,
  triggerSeverity: AlertSeverity,
): boolean {
  return SEVERITY_PRIORITY[currentSeverity] >= SEVERITY_PRIORITY[triggerSeverity];
}

/**
 * Evaluate the escalation policy against current alert state.
 * Returns a decision describing what action (if any) to take.
 *
 * This is a **pure function** — it reads the escalation state but
 * does not mutate it. State mutation happens in applyEscalationDecision().
 */
export function evaluateEscalation(
  policy: EscalationPolicyConfig,
  currentSeverity: AlertSeverity,
  state: Readonly<EscalationState>,
  now: number,
): EscalationDecision {
  const noAction: EscalationDecision = {
    shouldEscalate: false,
    tierIndex: null,
    tier: null,
    targetIds: [],
    qualifyingDurationMs: 0,
    reason: '',
  };

  // Policy disabled
  if (!policy.enabled) {
    return { ...noAction, reason: 'escalation policy disabled' };
  }

  // No tiers configured
  if (policy.tiers.length === 0) {
    return { ...noAction, reason: 'no escalation tiers configured' };
  }

  const triggerSeverity = policy.triggerSeverity ?? DEFAULT_TRIGGER_SEVERITY;

  // Current severity doesn't qualify
  if (!isQualifyingSeverity(currentSeverity, triggerSeverity)) {
    return { ...noAction, reason: `current severity '${currentSeverity}' below trigger threshold '${triggerSeverity}'` };
  }

  // Not currently tracking (shouldn't happen if state is managed correctly, but be safe)
  if (state.qualifyingSince === null) {
    return { ...noAction, reason: 'qualifying state not yet tracked (will start tracking)' };
  }

  const durationMs = now - state.qualifyingSince;
  const cooldownMs = policy.cooldownMs ?? DEFAULT_ESCALATION_COOLDOWN_MS;

  // Find the highest tier whose afterMs has been exceeded
  // that hasn't been recently notified (respecting cooldown)
  for (let i = policy.tiers.length - 1; i >= 0; i--) {
    const tier = policy.tiers[i];

    // Duration hasn't reached this tier yet
    if (durationMs < tier.afterMs) continue;

    // This tier has already been triggered — check cooldown for re-notification
    if (i <= state.lastTriggeredTier) {
      const lastNotified = state.lastNotifiedAt[i] ?? 0;
      if (now - lastNotified < cooldownMs) {
        continue; // Still in cooldown
      }
      // Cooldown expired — allow re-notification at this tier
      return {
        shouldEscalate: true,
        tierIndex: i,
        tier,
        targetIds: [...tier.targetIds],
        qualifyingDurationMs: durationMs,
        reason: `tier ${i + 1} re-notification (cooldown expired, ${Math.round(durationMs / 1000)}s persisted)`,
      };
    }

    // This is a new tier — trigger it
    return {
      shouldEscalate: true,
      tierIndex: i,
      tier,
      targetIds: [...tier.targetIds],
      qualifyingDurationMs: durationMs,
      reason: `tier ${i + 1} triggered (${Math.round(durationMs / 1000)}s persisted, threshold ${Math.round(tier.afterMs / 1000)}s)`,
    };
  }

  return {
    ...noAction,
    qualifyingDurationMs: durationMs,
    reason: `qualifying for ${Math.round(durationMs / 1000)}s, no tier threshold reached yet`,
  };
}

/**
 * Update the in-memory escalation state based on the current alert severity.
 * Handles starting/stopping the escalation clock and recording tier triggers.
 *
 * Call this AFTER evaluateEscalation() and (optionally) after dispatching.
 */
export function updateEscalationState(
  currentSeverity: AlertSeverity,
  triggerSeverity: AlertSeverity,
  decision: EscalationDecision,
  now: number,
): void {
  const qualifies = isQualifyingSeverity(currentSeverity, triggerSeverity);

  if (!qualifies) {
    // Severity dropped below threshold — reset escalation tracking
    escalationState = {
      qualifyingSince: null,
      qualifyingSeverity: null,
      lastTriggeredTier: -1,
      lastNotifiedAt: {},
    };
    return;
  }

  // Start tracking if not already
  if (escalationState.qualifyingSince === null) {
    escalationState.qualifyingSince = now;
    escalationState.qualifyingSeverity = currentSeverity;
    return;
  }

  // Update severity if it worsened (but keep the original start time)
  if (SEVERITY_PRIORITY[currentSeverity] > SEVERITY_PRIORITY[escalationState.qualifyingSeverity ?? 'ok']) {
    escalationState.qualifyingSeverity = currentSeverity;
  }

  // Record tier trigger if a decision was made
  if (decision.shouldEscalate && decision.tierIndex !== null) {
    if (decision.tierIndex > escalationState.lastTriggeredTier) {
      escalationState.lastTriggeredTier = decision.tierIndex;
    }
    escalationState.lastNotifiedAt[decision.tierIndex] = now;
  }
}

// ─── Escalation Dispatch ─────────────────────────────────────────────────────

/**
 * Resolve escalation target IDs to actual WebhookTarget objects.
 * Falls back to all enabled targets if the tier specifies no target IDs.
 * Pure function.
 */
export function resolveEscalationTargets(
  decision: EscalationDecision,
  allTargets: WebhookTarget[],
): WebhookTarget[] {
  if (decision.targetIds.length === 0) {
    // No specific targets — re-notify all enabled targets
    return allTargets.filter((t) => t.enabled);
  }

  const idSet = new Set(decision.targetIds);
  return allTargets.filter((t) => idSet.has(t.id));
}

/**
 * Build an escalation-annotated webhook payload.
 * Extends the base payload with escalation metadata so receivers
 * can distinguish escalation notifications from initial alerts.
 */
export function buildEscalationPayload(
  evaluation: AlertEvaluation,
  previousSeverity: AlertSeverity | null,
  decision: EscalationDecision,
): Record<string, unknown> {
  const basePayload = buildWebhookPayload(evaluation, previousSeverity);
  return {
    ...basePayload,
    escalation: {
      isEscalation: true,
      tierIndex: decision.tierIndex,
      tierLabel: decision.tier?.label ?? null,
      qualifyingDurationMs: decision.qualifyingDurationMs,
      reason: decision.reason,
    },
  };
}

/**
 * Main escalation entry point — evaluate and dispatch escalation notifications.
 *
 * Called inline during metrics evaluation, AFTER the base webhook dispatch.
 * Piggybacked on the same path — no new daemons or timers.
 *
 * Returns escalation delivery results (empty array if no escalation triggered).
 */
export async function maybeEscalate(
  dataDir: string,
  config: WebhookConfig,
  evaluation: AlertEvaluation,
  previousSeverity: AlertSeverity | null,
  opts: { now?: number } = {},
): Promise<EscalationDeliveryResult[]> {
  const now = opts.now ?? evaluation.evaluatedAt;
  const policy = config.escalation;

  // No escalation policy configured or disabled
  if (!policy || !policy.enabled) return [];

  // No tiers configured
  if (!policy.tiers || policy.tiers.length === 0) return [];

  const currentSeverity = evaluation.overallSeverity;
  const triggerSeverity = policy.triggerSeverity ?? DEFAULT_TRIGGER_SEVERITY;

  // Evaluate what to do
  const decision = evaluateEscalation(policy, currentSeverity, escalationState, now);

  // Update state (start/stop clock, record triggers)
  updateEscalationState(currentSeverity, triggerSeverity, decision, now);

  // No escalation needed
  if (!decision.shouldEscalate) return [];

  // Resolve targets
  const targets = resolveEscalationTargets(decision, config.targets);
  if (targets.length === 0) return [];

  // Build escalation payload
  const payload = buildEscalationPayload(evaluation, previousSeverity, decision);

  // Deliver to each target
  const deliveryOpts = {
    timeoutMs: config.timeoutMs ?? 10_000,
    maxRetries: config.maxRetries ?? 3,
  };

  // We cast the escalation payload as a WebhookPayload for the existing
  // deliverWebhook function — the extra `escalation` field is serialized
  // as part of the JSON body and harmlessly passed through.
  const results = await Promise.all(
    targets.map((target) => deliverWebhook(target, payload as any, deliveryOpts)),
  );

  // Record in delivery history
  try {
    const targetMap = new Map(targets.map((t) => [t.id, t]));
    const contexts = results.map((r) => ({
      url: targetMap.get(r.targetId)?.url ?? '',
      triggerSeverity: `escalation-tier-${(decision.tierIndex ?? 0) + 1}`,
      previousSeverity: previousSeverity,
      ts: now,
    }));
    appendDeliveryEvents(dataDir, results, contexts);
  } catch {
    // Non-critical
  }

  return [{
    tierIndex: decision.tierIndex!,
    tierLabel: decision.tier?.label ?? null,
    deliveryResults: results,
    qualifyingDurationMs: decision.qualifyingDurationMs,
  }];
}

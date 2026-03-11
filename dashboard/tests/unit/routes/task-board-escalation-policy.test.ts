/**
 * Escalation Policy tests — Issue #219, Phase 19: Webhook Alert Escalation Policy Baseline.
 *
 * Tests for:
 * - validateEscalationPolicy() — config validation
 * - sanitizeEscalationPolicy() — config normalization / backward compatibility
 * - isQualifyingSeverity() — severity threshold check
 * - evaluateEscalation() — deterministic escalation decisions
 * - updateEscalationState() — state machine transitions
 * - resolveEscalationTargets() — target resolution from tier config
 * - buildEscalationPayload() — payload construction with escalation metadata
 * - Cooldown enforcement between escalation notifications
 * - State reset on severity recovery (de-escalation)
 * - No-op behavior when escalation is disabled / not configured
 * - Backward compatibility — configs without escalation field work unchanged
 * - Escalation config validation in validateWebhookConfig()
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateEscalationPolicy,
  sanitizeEscalationPolicy,
  isQualifyingSeverity,
  evaluateEscalation,
  updateEscalationState,
  resolveEscalationTargets,
  buildEscalationPayload,
  resetEscalationState,
  getEscalationState,
  DEFAULT_ESCALATION_POLICY,
} from '../../../server/escalation-policy.js';
import type {
  EscalationPolicyConfig,
  EscalationState,
  EscalationDecision,
  EscalationTier,
} from '../../../server/escalation-policy.js';
import {
  validateWebhookConfig,
  sanitizeConfig,
} from '../../../server/alert-webhook.js';
import type {
  WebhookTarget,
  WebhookConfig,
} from '../../../server/alert-webhook.js';
import type {
  AlertSeverity,
  AlertEvaluation,
} from '../../../server/alert-rules.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEvaluation(overrides: Partial<AlertEvaluation> = {}): AlertEvaluation {
  return {
    evaluatedAt: Date.now(),
    overallSeverity: 'critical',
    severityCounts: { ok: 0, warning: 0, critical: 1 },
    rules: [
      {
        rule: 'stuckCount',
        label: 'Stuck Tasks',
        enabled: true,
        severity: 'critical',
        currentValue: 10,
        warningThreshold: 2,
        criticalThreshold: 5,
        message: 'Stuck Tasks: 10 exceeds critical threshold of 5',
      },
    ],
    ...overrides,
  };
}

function makePolicy(overrides: Partial<EscalationPolicyConfig> = {}): EscalationPolicyConfig {
  return {
    enabled: true,
    triggerSeverity: 'critical',
    tiers: [
      { afterMs: 300_000, targetIds: ['escalation-target-1'], label: 'Page on-call' },
      { afterMs: 900_000, targetIds: ['escalation-target-2'], label: 'Notify manager' },
    ],
    cooldownMs: 300_000,
    ...overrides,
  };
}

function makeState(overrides: Partial<EscalationState> = {}): EscalationState {
  return {
    qualifyingSince: null,
    qualifyingSeverity: null,
    lastTriggeredTier: -1,
    lastNotifiedAt: {},
    ...overrides,
  };
}

function makeTarget(overrides: Partial<WebhookTarget> = {}): WebhookTarget {
  return {
    id: 'target-1',
    name: 'Primary',
    url: 'https://example.com/webhook',
    enabled: true,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Escalation Policy — Phase 19', () => {
  beforeEach(() => {
    resetEscalationState();
  });

  // ── isQualifyingSeverity ─────────────────────────────────────────────────

  describe('isQualifyingSeverity', () => {
    it('critical qualifies when trigger is critical', () => {
      expect(isQualifyingSeverity('critical', 'critical')).toBe(true);
    });

    it('warning does not qualify when trigger is critical', () => {
      expect(isQualifyingSeverity('warning', 'critical')).toBe(false);
    });

    it('ok does not qualify when trigger is critical', () => {
      expect(isQualifyingSeverity('ok', 'critical')).toBe(false);
    });

    it('warning qualifies when trigger is warning', () => {
      expect(isQualifyingSeverity('warning', 'warning')).toBe(true);
    });

    it('critical qualifies when trigger is warning', () => {
      expect(isQualifyingSeverity('critical', 'warning')).toBe(true);
    });

    it('ok does not qualify when trigger is warning', () => {
      expect(isQualifyingSeverity('ok', 'warning')).toBe(false);
    });

    it('everything qualifies when trigger is ok', () => {
      expect(isQualifyingSeverity('ok', 'ok')).toBe(true);
      expect(isQualifyingSeverity('warning', 'ok')).toBe(true);
      expect(isQualifyingSeverity('critical', 'ok')).toBe(true);
    });
  });

  // ── evaluateEscalation ───────────────────────────────────────────────────

  describe('evaluateEscalation', () => {
    it('returns no-op when policy is disabled', () => {
      const policy = makePolicy({ enabled: false });
      const state = makeState({ qualifyingSince: 1000 });
      const decision = evaluateEscalation(policy, 'critical', state, 500_000);
      expect(decision.shouldEscalate).toBe(false);
      expect(decision.reason).toContain('disabled');
    });

    it('returns no-op when no tiers configured', () => {
      const policy = makePolicy({ tiers: [] });
      const state = makeState({ qualifyingSince: 1000 });
      const decision = evaluateEscalation(policy, 'critical', state, 500_000);
      expect(decision.shouldEscalate).toBe(false);
      expect(decision.reason).toContain('no escalation tiers');
    });

    it('returns no-op when severity below trigger threshold', () => {
      const policy = makePolicy({ triggerSeverity: 'critical' });
      const state = makeState({ qualifyingSince: 1000 });
      const decision = evaluateEscalation(policy, 'warning', state, 500_000);
      expect(decision.shouldEscalate).toBe(false);
      expect(decision.reason).toContain('below trigger threshold');
    });

    it('returns no-op when qualifying state not yet tracked', () => {
      const policy = makePolicy();
      const state = makeState({ qualifyingSince: null });
      const decision = evaluateEscalation(policy, 'critical', state, 500_000);
      expect(decision.shouldEscalate).toBe(false);
      expect(decision.reason).toContain('not yet tracked');
    });

    it('returns no-op when duration below first tier threshold', () => {
      const policy = makePolicy({
        tiers: [{ afterMs: 300_000, targetIds: ['t1'] }],
      });
      const state = makeState({ qualifyingSince: 100_000 });
      // 200_000 - 100_000 = 100_000ms, but tier requires 300_000
      const decision = evaluateEscalation(policy, 'critical', state, 200_000);
      expect(decision.shouldEscalate).toBe(false);
      expect(decision.reason).toContain('no tier threshold reached');
    });

    it('triggers tier 1 when duration exceeds first tier threshold', () => {
      const policy = makePolicy({
        tiers: [
          { afterMs: 300_000, targetIds: ['t1'], label: 'Page on-call' },
          { afterMs: 900_000, targetIds: ['t2'], label: 'Notify manager' },
        ],
      });
      // qualifyingSince = 0, now = 400_000 → 400s persisted
      const state = makeState({ qualifyingSince: 0 });
      const decision = evaluateEscalation(policy, 'critical', state, 400_000);
      expect(decision.shouldEscalate).toBe(true);
      expect(decision.tierIndex).toBe(0);
      expect(decision.targetIds).toEqual(['t1']);
      expect(decision.qualifyingDurationMs).toBe(400_000);
    });

    it('triggers tier 2 when duration exceeds second tier threshold', () => {
      const policy = makePolicy({
        tiers: [
          { afterMs: 300_000, targetIds: ['t1'] },
          { afterMs: 900_000, targetIds: ['t2'] },
        ],
      });
      const state = makeState({
        qualifyingSince: 0,
        lastTriggeredTier: 0,
        lastNotifiedAt: { 0: 300_000 },
      });
      const decision = evaluateEscalation(policy, 'critical', state, 1_000_000);
      expect(decision.shouldEscalate).toBe(true);
      expect(decision.tierIndex).toBe(1);
      expect(decision.targetIds).toEqual(['t2']);
    });

    it('re-notifies a triggered tier after cooldown expires', () => {
      const policy = makePolicy({
        tiers: [{ afterMs: 300_000, targetIds: ['t1'] }],
        cooldownMs: 300_000,
      });
      const state = makeState({
        qualifyingSince: 0,
        lastTriggeredTier: 0,
        lastNotifiedAt: { 0: 400_000 },
      });
      // now = 800_000, lastNotified = 400_000, cooldown = 300_000 → cooldown expired
      const decision = evaluateEscalation(policy, 'critical', state, 800_000);
      expect(decision.shouldEscalate).toBe(true);
      expect(decision.tierIndex).toBe(0);
      expect(decision.reason).toContain('re-notification');
    });

    it('does NOT re-notify during cooldown', () => {
      const policy = makePolicy({
        tiers: [{ afterMs: 300_000, targetIds: ['t1'] }],
        cooldownMs: 300_000,
      });
      const state = makeState({
        qualifyingSince: 0,
        lastTriggeredTier: 0,
        lastNotifiedAt: { 0: 500_000 },
      });
      // now = 600_000, lastNotified = 500_000, cooldown = 300_000 → still in cooldown
      const decision = evaluateEscalation(policy, 'critical', state, 600_000);
      expect(decision.shouldEscalate).toBe(false);
    });

    it('prefers the highest reachable tier', () => {
      const policy = makePolicy({
        tiers: [
          { afterMs: 60_000, targetIds: ['t1'] },
          { afterMs: 120_000, targetIds: ['t2'] },
          { afterMs: 180_000, targetIds: ['t3'] },
        ],
      });
      // All 3 tiers should be reachable at 200s, but tier 3 (index 2) should be picked
      const state = makeState({ qualifyingSince: 0 });
      const decision = evaluateEscalation(policy, 'critical', state, 200_000);
      expect(decision.shouldEscalate).toBe(true);
      expect(decision.tierIndex).toBe(2);
      expect(decision.targetIds).toEqual(['t3']);
    });
  });

  // ── updateEscalationState ────────────────────────────────────────────────

  describe('updateEscalationState', () => {
    it('starts tracking when severity qualifies and state is empty', () => {
      const noActionDecision: EscalationDecision = {
        shouldEscalate: false,
        tierIndex: null,
        tier: null,
        targetIds: [],
        qualifyingDurationMs: 0,
        reason: 'test',
      };

      updateEscalationState('critical', 'critical', noActionDecision, 1000);
      const state = getEscalationState();
      expect(state.qualifyingSince).toBe(1000);
      expect(state.qualifyingSeverity).toBe('critical');
    });

    it('resets state when severity drops below threshold', () => {
      // First, set up a qualifying state
      const noAction: EscalationDecision = {
        shouldEscalate: false, tierIndex: null, tier: null,
        targetIds: [], qualifyingDurationMs: 0, reason: '',
      };
      updateEscalationState('critical', 'critical', noAction, 1000);
      expect(getEscalationState().qualifyingSince).toBe(1000);

      // Now severity drops to ok
      updateEscalationState('ok', 'critical', noAction, 5000);
      const state = getEscalationState();
      expect(state.qualifyingSince).toBeNull();
      expect(state.qualifyingSeverity).toBeNull();
      expect(state.lastTriggeredTier).toBe(-1);
      expect(state.lastNotifiedAt).toEqual({});
    });

    it('records tier trigger in state', () => {
      // Set up initial qualifying state
      const noAction: EscalationDecision = {
        shouldEscalate: false, tierIndex: null, tier: null,
        targetIds: [], qualifyingDurationMs: 0, reason: '',
      };
      updateEscalationState('critical', 'critical', noAction, 1000);

      // Now trigger tier 0
      const tier: EscalationTier = { afterMs: 300_000, targetIds: ['t1'] };
      const triggerDecision: EscalationDecision = {
        shouldEscalate: true,
        tierIndex: 0,
        tier,
        targetIds: ['t1'],
        qualifyingDurationMs: 400_000,
        reason: 'tier 1 triggered',
      };
      updateEscalationState('critical', 'critical', triggerDecision, 401_000);

      const state = getEscalationState();
      expect(state.lastTriggeredTier).toBe(0);
      expect(state.lastNotifiedAt[0]).toBe(401_000);
    });

    it('updates severity to worse but keeps original start time', () => {
      const noAction: EscalationDecision = {
        shouldEscalate: false, tierIndex: null, tier: null,
        targetIds: [], qualifyingDurationMs: 0, reason: '',
      };
      // Start with warning (trigger at warning level)
      updateEscalationState('warning', 'warning', noAction, 1000);
      expect(getEscalationState().qualifyingSince).toBe(1000);
      expect(getEscalationState().qualifyingSeverity).toBe('warning');

      // Escalate to critical — should keep the original start time
      updateEscalationState('critical', 'warning', noAction, 5000);
      expect(getEscalationState().qualifyingSince).toBe(1000); // unchanged
      expect(getEscalationState().qualifyingSeverity).toBe('critical'); // updated
    });
  });

  // ── resolveEscalationTargets ─────────────────────────────────────────────

  describe('resolveEscalationTargets', () => {
    const targets: WebhookTarget[] = [
      makeTarget({ id: 't1', name: 'Primary', enabled: true }),
      makeTarget({ id: 't2', name: 'Secondary', enabled: true }),
      makeTarget({ id: 't3', name: 'Disabled', enabled: false }),
    ];

    it('resolves specific target IDs from decision', () => {
      const decision: EscalationDecision = {
        shouldEscalate: true,
        tierIndex: 0,
        tier: { afterMs: 300_000, targetIds: ['t2'] },
        targetIds: ['t2'],
        qualifyingDurationMs: 400_000,
        reason: 'test',
      };
      const resolved = resolveEscalationTargets(decision, targets);
      expect(resolved).toHaveLength(1);
      expect(resolved[0].id).toBe('t2');
    });

    it('falls back to all enabled targets when tier has empty targetIds', () => {
      const decision: EscalationDecision = {
        shouldEscalate: true,
        tierIndex: 0,
        tier: { afterMs: 300_000, targetIds: [] },
        targetIds: [],
        qualifyingDurationMs: 400_000,
        reason: 'test',
      };
      const resolved = resolveEscalationTargets(decision, targets);
      expect(resolved).toHaveLength(2); // t1 and t2 (enabled)
      expect(resolved.map((t) => t.id)).toEqual(['t1', 't2']);
    });

    it('returns empty when specified target IDs do not exist', () => {
      const decision: EscalationDecision = {
        shouldEscalate: true,
        tierIndex: 0,
        tier: { afterMs: 300_000, targetIds: ['nonexistent'] },
        targetIds: ['nonexistent'],
        qualifyingDurationMs: 400_000,
        reason: 'test',
      };
      const resolved = resolveEscalationTargets(decision, targets);
      expect(resolved).toHaveLength(0);
    });
  });

  // ── buildEscalationPayload ───────────────────────────────────────────────

  describe('buildEscalationPayload', () => {
    it('includes escalation metadata in payload', () => {
      const evaluation = makeEvaluation({ evaluatedAt: 1000 });
      const decision: EscalationDecision = {
        shouldEscalate: true,
        tierIndex: 1,
        tier: { afterMs: 900_000, targetIds: ['t2'], label: 'Notify manager' },
        targetIds: ['t2'],
        qualifyingDurationMs: 1_000_000,
        reason: 'tier 2 triggered',
      };
      const payload = buildEscalationPayload(evaluation, 'warning', decision);

      expect(payload.event).toBe('alert.transition');
      expect(payload.escalation).toBeDefined();
      const esc = payload.escalation as Record<string, unknown>;
      expect(esc.isEscalation).toBe(true);
      expect(esc.tierIndex).toBe(1);
      expect(esc.tierLabel).toBe('Notify manager');
      expect(esc.qualifyingDurationMs).toBe(1_000_000);
      expect(esc.reason).toBe('tier 2 triggered');
    });

    it('preserves base payload fields', () => {
      const evaluation = makeEvaluation({
        evaluatedAt: 5000,
        overallSeverity: 'critical',
      });
      const decision: EscalationDecision = {
        shouldEscalate: true,
        tierIndex: 0,
        tier: { afterMs: 300_000, targetIds: ['t1'] },
        targetIds: ['t1'],
        qualifyingDurationMs: 400_000,
        reason: 'test',
      };
      const payload = buildEscalationPayload(evaluation, 'ok', decision);

      expect(payload.currentSeverity).toBe('critical');
      expect(payload.previousSeverity).toBe('ok');
      expect(payload.source).toBe('ventureos-dashboard');
      expect(payload.schemaVersion).toBe(1);
    });
  });

  // ── sanitizeEscalationPolicy ─────────────────────────────────────────────

  describe('sanitizeEscalationPolicy', () => {
    it('returns defaults for null/undefined input', () => {
      expect(sanitizeEscalationPolicy(null)).toEqual(DEFAULT_ESCALATION_POLICY);
      expect(sanitizeEscalationPolicy(undefined)).toEqual({
        ...DEFAULT_ESCALATION_POLICY,
        tiers: [],
      });
    });

    it('returns defaults for non-object input', () => {
      expect(sanitizeEscalationPolicy('string')).toEqual({
        ...DEFAULT_ESCALATION_POLICY,
        tiers: [],
      });
      expect(sanitizeEscalationPolicy(42)).toEqual({
        ...DEFAULT_ESCALATION_POLICY,
        tiers: [],
      });
    });

    it('sanitizes valid config', () => {
      const result = sanitizeEscalationPolicy({
        enabled: true,
        triggerSeverity: 'warning',
        tiers: [
          { afterMs: 300_000, targetIds: ['t1'], label: 'First' },
        ],
        cooldownMs: 120_000,
      });
      expect(result.enabled).toBe(true);
      expect(result.triggerSeverity).toBe('warning');
      expect(result.tiers).toHaveLength(1);
      expect(result.tiers[0].afterMs).toBe(300_000);
      expect(result.tiers[0].targetIds).toEqual(['t1']);
      expect(result.tiers[0].label).toBe('First');
      expect(result.cooldownMs).toBe(120_000);
    });

    it('caps tiers at max 3', () => {
      const result = sanitizeEscalationPolicy({
        enabled: true,
        tiers: [
          { afterMs: 60_000, targetIds: [] },
          { afterMs: 120_000, targetIds: [] },
          { afterMs: 180_000, targetIds: [] },
          { afterMs: 240_000, targetIds: [] },
        ],
      });
      expect(result.tiers).toHaveLength(3);
    });

    it('filters invalid tiers', () => {
      const result = sanitizeEscalationPolicy({
        enabled: true,
        tiers: [
          { afterMs: 1000, targetIds: [] }, // below min (60_000)
          { afterMs: 300_000, targetIds: ['t1'] }, // valid
          'not-an-object', // invalid
        ],
      });
      expect(result.tiers).toHaveLength(1);
      expect(result.tiers[0].afterMs).toBe(300_000);
    });

    it('defaults triggerSeverity to critical for invalid values', () => {
      const result = sanitizeEscalationPolicy({
        enabled: true,
        triggerSeverity: 'invalid',
        tiers: [],
      });
      expect(result.triggerSeverity).toBe('critical');
    });
  });

  // ── validateEscalationPolicy ─────────────────────────────────────────────

  describe('validateEscalationPolicy', () => {
    it('returns no errors for valid config', () => {
      const errors = validateEscalationPolicy({
        enabled: true,
        triggerSeverity: 'critical',
        tiers: [
          { afterMs: 300_000, targetIds: ['t1'], label: 'First' },
          { afterMs: 900_000, targetIds: ['t2'], label: 'Second' },
        ],
        cooldownMs: 300_000,
      });
      expect(errors).toHaveLength(0);
    });

    it('rejects non-object input', () => {
      const errors = validateEscalationPolicy('string');
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('escalation');
    });

    it('validates triggerSeverity values', () => {
      const errors = validateEscalationPolicy({
        enabled: true,
        triggerSeverity: 'extreme',
        tiers: [],
      });
      expect(errors.some((e) => e.field === 'escalation.triggerSeverity')).toBe(true);
    });

    it('rejects more than 3 tiers', () => {
      const errors = validateEscalationPolicy({
        enabled: true,
        tiers: [
          { afterMs: 60_000, targetIds: [] },
          { afterMs: 120_000, targetIds: [] },
          { afterMs: 180_000, targetIds: [] },
          { afterMs: 240_000, targetIds: [] },
        ],
      });
      expect(errors.some((e) => e.message.includes('maximum 3'))).toBe(true);
    });

    it('rejects tier afterMs below 1 minute', () => {
      const errors = validateEscalationPolicy({
        enabled: true,
        tiers: [{ afterMs: 30_000, targetIds: [] }],
      });
      expect(errors.some((e) => e.field.includes('afterMs') && e.message.includes('60000'))).toBe(true);
    });

    it('rejects tier afterMs above 24 hours', () => {
      const errors = validateEscalationPolicy({
        enabled: true,
        tiers: [{ afterMs: 100_000_000, targetIds: [] }],
      });
      expect(errors.some((e) => e.field.includes('afterMs') && e.message.includes('86400000'))).toBe(true);
    });

    it('rejects non-increasing tier afterMs', () => {
      const errors = validateEscalationPolicy({
        enabled: true,
        tiers: [
          { afterMs: 300_000, targetIds: [] },
          { afterMs: 200_000, targetIds: [] },
        ],
      });
      expect(errors.some((e) => e.message.includes('strictly greater'))).toBe(true);
    });

    it('validates target IDs against available targets', () => {
      const errors = validateEscalationPolicy(
        {
          enabled: true,
          tiers: [{ afterMs: 300_000, targetIds: ['nonexistent'] }],
        },
        ['t1', 't2'],
      );
      expect(errors.some((e) => e.message.includes('does not match'))).toBe(true);
    });

    it('rejects negative cooldownMs', () => {
      const errors = validateEscalationPolicy({
        enabled: true,
        cooldownMs: -1,
        tiers: [],
      });
      expect(errors.some((e) => e.field === 'escalation.cooldownMs')).toBe(true);
    });
  });

  // ── Webhook config backward compatibility ────────────────────────────────

  describe('backward compatibility', () => {
    it('sanitizeConfig preserves escalation field when present', () => {
      const config = sanitizeConfig({
        enabled: true,
        targets: [],
        escalation: {
          enabled: true,
          triggerSeverity: 'critical',
          tiers: [{ afterMs: 300_000, targetIds: ['t1'] }],
          cooldownMs: 300_000,
        },
      });
      expect(config.escalation).toBeDefined();
      expect(config.escalation!.enabled).toBe(true);
      expect(config.escalation!.tiers).toHaveLength(1);
    });

    it('sanitizeConfig omits escalation when not present', () => {
      const config = sanitizeConfig({
        enabled: true,
        targets: [],
      });
      expect(config.escalation).toBeUndefined();
    });

    it('validateWebhookConfig passes when escalation is absent', () => {
      const errors = validateWebhookConfig({
        enabled: true,
        targets: [],
      });
      expect(errors).toHaveLength(0);
    });

    it('validateWebhookConfig validates escalation when present', () => {
      const errors = validateWebhookConfig({
        enabled: true,
        targets: [
          { id: 't1', url: 'https://example.com/hook', name: 'T1', enabled: true },
        ],
        escalation: {
          enabled: true,
          triggerSeverity: 'critical',
          tiers: [
            { afterMs: 300_000, targetIds: ['t1'], label: 'Page' },
          ],
          cooldownMs: 300_000,
        },
      });
      expect(errors).toHaveLength(0);
    });

    it('validateWebhookConfig rejects invalid escalation config', () => {
      const errors = validateWebhookConfig({
        enabled: true,
        targets: [],
        escalation: {
          enabled: 'yes', // invalid — should be boolean
          tiers: 'not-an-array', // invalid
        },
      });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.field.startsWith('escalation'))).toBe(true);
    });

    it('validateWebhookConfig allows null escalation (removal)', () => {
      const errors = validateWebhookConfig({
        enabled: true,
        targets: [],
        escalation: null,
      });
      expect(errors).toHaveLength(0);
    });

    it('validateWebhookConfig cross-validates escalation target IDs against targets', () => {
      const errors = validateWebhookConfig({
        enabled: true,
        targets: [
          { id: 't1', url: 'https://example.com/hook', name: 'T1', enabled: true },
        ],
        escalation: {
          enabled: true,
          tiers: [
            { afterMs: 300_000, targetIds: ['nonexistent'] },
          ],
        },
      });
      expect(errors.some((e) => e.message.includes('does not match'))).toBe(true);
    });
  });

  // ── Full escalation lifecycle ────────────────────────────────────────────

  describe('full lifecycle', () => {
    it('tracks → triggers → re-notifies → resets on recovery', () => {
      const policy = makePolicy({
        enabled: true,
        triggerSeverity: 'critical',
        tiers: [{ afterMs: 300_000, targetIds: ['t1'], label: 'Alert' }],
        cooldownMs: 300_000,
      });

      const noAction: EscalationDecision = {
        shouldEscalate: false, tierIndex: null, tier: null,
        targetIds: [], qualifyingDurationMs: 0, reason: '',
      };

      // Step 1: Start tracking (critical begins)
      let decision = evaluateEscalation(policy, 'critical', getEscalationState(), 100_000);
      expect(decision.shouldEscalate).toBe(false); // not yet tracked
      updateEscalationState('critical', 'critical', decision, 100_000);
      expect(getEscalationState().qualifyingSince).toBe(100_000);

      // Step 2: Not yet reached threshold (200s into critical)
      decision = evaluateEscalation(policy, 'critical', getEscalationState(), 300_000);
      expect(decision.shouldEscalate).toBe(false);
      updateEscalationState('critical', 'critical', decision, 300_000);

      // Step 3: Threshold reached (>300s into critical)
      decision = evaluateEscalation(policy, 'critical', getEscalationState(), 500_000);
      expect(decision.shouldEscalate).toBe(true);
      expect(decision.tierIndex).toBe(0);
      updateEscalationState('critical', 'critical', decision, 500_000);
      expect(getEscalationState().lastTriggeredTier).toBe(0);

      // Step 4: In cooldown — should not re-notify
      decision = evaluateEscalation(policy, 'critical', getEscalationState(), 600_000);
      expect(decision.shouldEscalate).toBe(false);
      updateEscalationState('critical', 'critical', decision, 600_000);

      // Step 5: Cooldown expired — re-notify
      decision = evaluateEscalation(policy, 'critical', getEscalationState(), 900_000);
      expect(decision.shouldEscalate).toBe(true);
      expect(decision.reason).toContain('re-notification');
      updateEscalationState('critical', 'critical', decision, 900_000);

      // Step 6: Recovery — severity drops to ok
      decision = evaluateEscalation(policy, 'ok', getEscalationState(), 1_000_000);
      expect(decision.shouldEscalate).toBe(false);
      updateEscalationState('ok', 'critical', decision, 1_000_000);
      expect(getEscalationState().qualifyingSince).toBeNull();
      expect(getEscalationState().lastTriggeredTier).toBe(-1);
    });

    it('multi-tier progression works correctly', () => {
      const policy = makePolicy({
        enabled: true,
        triggerSeverity: 'critical',
        tiers: [
          { afterMs: 60_000, targetIds: ['t1'] },
          { afterMs: 300_000, targetIds: ['t2'] },
          { afterMs: 900_000, targetIds: ['t3'] },
        ],
        cooldownMs: 120_000,
      });

      // Start tracking
      let decision = evaluateEscalation(policy, 'critical', getEscalationState(), 0);
      updateEscalationState('critical', 'critical', decision, 0);

      // At 70s → tier 1 triggers
      decision = evaluateEscalation(policy, 'critical', getEscalationState(), 70_000);
      expect(decision.shouldEscalate).toBe(true);
      expect(decision.tierIndex).toBe(0);
      updateEscalationState('critical', 'critical', decision, 70_000);

      // At 350s → tier 2 triggers
      decision = evaluateEscalation(policy, 'critical', getEscalationState(), 350_000);
      expect(decision.shouldEscalate).toBe(true);
      expect(decision.tierIndex).toBe(1);
      updateEscalationState('critical', 'critical', decision, 350_000);

      // At 950s → tier 3 triggers
      decision = evaluateEscalation(policy, 'critical', getEscalationState(), 950_000);
      expect(decision.shouldEscalate).toBe(true);
      expect(decision.tierIndex).toBe(2);
      updateEscalationState('critical', 'critical', decision, 950_000);
    });
  });
});

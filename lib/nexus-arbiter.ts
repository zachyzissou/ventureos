/**
 * VentureOS Arbiter
 *
 * Arbitration helpers that enforce policy-gate authority constraints.
 */

import type { AuthorityActor } from './authority-map';
import { runPolicyGate } from './policy-gate';

export interface ArbitrationInput {
  missionId: string;
  actor: AuthorityActor;
  recommendationId: string;
  accept: boolean;
}

export interface ArbitrationResult {
  accepted: boolean;
  code:
    | 'ARBITRATION_ADVISORY'
    | 'ARBITRATION_ACCEPTED'
    | 'ARBITRATION_DENIED'
    | 'ARBITRATION_INVALID';
  message: string;
  recommendationId: string;
  overrideAvailable: boolean;
}

export function arbitrateRecommendation(input: ArbitrationInput): ArbitrationResult {
  const recommendationId = String(input.recommendationId || '').trim();
  if (!recommendationId) {
    return {
      accepted: false,
      code: 'ARBITRATION_INVALID',
      message: 'recommendationId is required',
      recommendationId: 'unknown',
      overrideAvailable: true,
    };
  }

  if (!input.accept) {
    return {
      accepted: false,
      code: 'ARBITRATION_ADVISORY',
      message: 'Winner is advisory until accepted by arbiter',
      recommendationId,
      overrideAvailable: true,
    };
  }

  const gate = runPolicyGate({
    missionId: input.missionId,
    actor: input.actor,
    action: 'approve',
  });

  if (!gate.ok) {
    return {
      accepted: false,
      code: gate.code === 'INVALID_INPUT' ? 'ARBITRATION_INVALID' : 'ARBITRATION_DENIED',
      message: 'Competition acceptance requires control-plane or human-final authority',
      recommendationId,
      overrideAvailable: true,
    };
  }

  return {
    accepted: true,
    code: 'ARBITRATION_ACCEPTED',
    message: 'Winner accepted by authorized arbiter',
    recommendationId,
    overrideAvailable: true,
  };
}

export interface HumanOverrideInput {
  missionId: string;
  actor: AuthorityActor;
  targetAction: 'approve' | 'close';
}

export interface HumanOverrideResult {
  applied: boolean;
  code: 'HUMAN_OVERRIDE_APPLIED' | 'HUMAN_OVERRIDE_DENIED';
  message: string;
}

export function applyHumanOverride(input: HumanOverrideInput): HumanOverrideResult {
  const gate = runPolicyGate({
    missionId: input.missionId,
    actor: input.actor,
    action: 'override',
  });
  if (!gate.ok) {
    return {
      applied: false,
      code: 'HUMAN_OVERRIDE_DENIED',
      message: 'Only human may perform override actions',
    };
  }
  return {
    applied: true,
    code: 'HUMAN_OVERRIDE_APPLIED',
    message: `Human override applied for ${input.targetAction}`,
  };
}

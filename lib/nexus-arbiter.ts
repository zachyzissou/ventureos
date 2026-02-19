import type { MissionRecord } from './mission-state-machine';
import type { AuthorityActor } from './authority-map';
import { evaluatePolicyGate } from './policy-gate';

export interface ArbitrationInput {
  mission: MissionRecord;
  actor: AuthorityActor;
  requireHumanFinalApproval?: boolean;
  approve?: () => Promise<boolean>;
}

export interface ArbitrationResult {
  allowClose: boolean;
  reason: string;
  code: 'allow' | 'requires_human_approval' | 'authority_denied' | 'approval_rejected';
}

/**
 * Arbitration gate used before mission closure.
 */
export async function arbitrateMissionClose(input: ArbitrationInput): Promise<ArbitrationResult> {
  const gate = evaluatePolicyGate({
    actor: input.actor,
    action: 'mission.close',
    mission: input.mission,
  });

  if (!gate.allow) {
    return {
      allowClose: false,
      reason: gate.reason,
      code: gate.code === 'invalid_state' ? 'authority_denied' : 'authority_denied',
    };
  }

  if (input.requireHumanFinalApproval) {
    if (!input.approve) {
      return {
        allowClose: false,
        reason: 'Human final approval is required but no approval callback is configured',
        code: 'requires_human_approval',
      };
    }

    const ok = await input.approve();
    if (!ok) {
      return {
        allowClose: false,
        reason: 'Human final approval rejected mission close',
        code: 'approval_rejected',
      };
    }
  }

  return { allowClose: true, reason: 'Mission close approved', code: 'allow' };
}

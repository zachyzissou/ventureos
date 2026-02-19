import type { MissionRecord } from './mission-state-machine';
import type { AuthorityAction, AuthorityActor } from './authority-map';
import { canActorPerform } from './authority-map';

export interface PolicyGateInput {
  actor: AuthorityActor;
  action: AuthorityAction;
  mission: MissionRecord;
  metadata?: Record<string, unknown>;
}

export interface PolicyGateResult {
  allow: boolean;
  code: 'allow' | 'authority_denied' | 'invalid_state';
  reason: string;
}

export function evaluatePolicyGate(input: PolicyGateInput): PolicyGateResult {
  const decision = canActorPerform(input.actor, input.action);
  if (!decision.allowed) {
    return {
      allow: false,
      code: 'authority_denied',
      reason: decision.reason ?? 'Actor not authorized',
    };
  }

  // Basic state/phase guardrails for authority-sensitive actions.
  if (input.action === 'mission.close' && input.mission.phase !== 'deliver') {
    return {
      allow: false,
      code: 'invalid_state',
      reason: `Mission close requires phase=deliver (current=${input.mission.phase})`,
    };
  }

  if (input.action === 'competition.accept' && input.actor.type !== 'nexus' && input.actor.type !== 'human') {
    return {
      allow: false,
      code: 'authority_denied',
      reason: 'Competition acceptance requires nexus or human authority',
    };
  }

  return { allow: true, code: 'allow', reason: 'Allowed by policy gate' };
}

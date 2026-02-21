/**
 * Policy Gate — Nexus 2.0 M2 (#285)
 *
 * Applies authority-map checks to mission-scoped actions and returns
 * machine-readable deny reasons.
 */

import type { AuthorityAction, AuthorityActor } from './authority-map';
import { evaluateAuthority } from './authority-map';

export interface PolicyGateInput {
  missionId: string;
  actor: AuthorityActor;
  action: AuthorityAction;
}

export interface PolicyGateResult {
  ok: boolean;
  code: 'ALLOW' | 'INVALID_INPUT' | 'ACTOR_FORBIDDEN';
  message: string;
  missionId: string;
  action: AuthorityAction;
  actor: {
    id: string;
    type: AuthorityActor['type'] | 'unknown';
  };
  allowedActorTypes?: readonly string[];
}

export function runPolicyGate(input: PolicyGateInput): PolicyGateResult {
  const missionId = String(input.missionId || '').trim();
  const actorId = String(input.actor?.id || '').trim();
  const actorType = input.actor?.type;
  if (!missionId || !actorId || (actorType !== 'human' && actorType !== 'nexus' && actorType !== 'agent')) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'missionId and actor are required',
      missionId: missionId || 'unknown',
      action: input.action,
      actor: {
        id: actorId || 'unknown',
        type: actorType === 'human' || actorType === 'nexus' || actorType === 'agent' ? actorType : 'unknown',
      },
    };
  }

  const authority = evaluateAuthority({ id: actorId, type: actorType }, input.action);
  if (authority.allowed) {
    return {
      ok: true,
      code: 'ALLOW',
      message: authority.message,
      missionId,
      action: input.action,
      actor: { id: actorId, type: actorType },
      allowedActorTypes: authority.allowedActorTypes,
    };
  }
  return {
    ok: false,
    code: 'ACTOR_FORBIDDEN',
    message: authority.message,
    missionId,
    action: input.action,
    actor: { id: actorId, type: actorType },
    allowedActorTypes: authority.allowedActorTypes,
  };
}

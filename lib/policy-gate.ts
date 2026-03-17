/**
 * VentureOS Policy Gate
 *
 * Applies authority-map checks to mission-scoped actions and returns
 * machine-readable deny reasons with canonical authority metadata.
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
    authorityClass: AuthorityActor['authorityClass'] | 'unknown';
    bindingId?: string;
    capabilityId?: string;
    specialistId?: string;
  };
  allowedActorTypes?: readonly string[];
  allowedAuthorityClasses?: readonly string[];
}

export function runPolicyGate(input: PolicyGateInput): PolicyGateResult {
  const missionId = String(input.missionId || '').trim();
  const actorId = String(input.actor?.id || '').trim();

  if (!missionId || !actorId) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'missionId and actor are required',
      missionId: missionId || 'unknown',
      action: input.action,
      actor: {
        id: actorId || 'unknown',
        type: input.actor?.type ?? 'unknown',
        authorityClass: input.actor?.authorityClass ?? 'unknown',
        bindingId: input.actor?.bindingId,
        capabilityId: input.actor?.capabilityId,
        specialistId: input.actor?.specialistId,
      },
    };
  }

  const authority = evaluateAuthority(input.actor, input.action);
  if (authority.allowed) {
    return {
      ok: true,
      code: 'ALLOW',
      message: authority.message,
      missionId,
      action: input.action,
      actor: {
        id: actorId,
        type: authority.actorType,
        authorityClass: authority.authorityClass,
        bindingId: authority.bindingId,
        capabilityId: authority.capabilityId,
        specialistId: authority.specialistId,
      },
      allowedActorTypes: authority.allowedActorTypes,
      allowedAuthorityClasses: authority.allowedAuthorityClasses,
    };
  }

  return {
    ok: false,
    code: authority.code === 'INVALID_ACTOR' ? 'INVALID_INPUT' : 'ACTOR_FORBIDDEN',
    message: authority.message,
    missionId,
    action: input.action,
    actor: {
      id: actorId,
      type: authority.actorType,
      authorityClass: authority.authorityClass,
      bindingId: authority.bindingId,
      capabilityId: authority.capabilityId,
      specialistId: authority.specialistId,
    },
    allowedActorTypes: authority.allowedActorTypes,
    allowedAuthorityClasses: authority.allowedAuthorityClasses,
  };
}

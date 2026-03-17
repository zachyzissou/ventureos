/**
 * VentureOS Policy Gate
 *
 * Applies authority-map checks to mission-scoped actions and returns
 * machine-readable deny reasons with canonical authority metadata.
 */

import type { AuthorityAction, AuthorityActor, AuthorityActorType, LegacyAuthorityActorType, AuthorityClass } from './authority-map';
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

export type PolicyResourceClass =
  | 'dashboard_read'
  | 'dashboard_control'
  | 'task_queue_mutation'
  | 'policy_override';

export interface ResourcePolicyGateInput {
  resourceClass: PolicyResourceClass;
  actor: AuthorityActor;
  resourceId?: string;
}

export interface ResourcePolicyGateResult {
  ok: boolean;
  code: 'ALLOW' | 'INVALID_INPUT' | 'ACTOR_FORBIDDEN';
  decision: 'allow' | 'allow_with_evidence' | 'deny';
  message: string;
  resourceClass: PolicyResourceClass;
  resourceId: string;
  actor: {
    id: string;
    type: AuthorityActor['type'] | 'unknown';
    authorityClass: AuthorityActor['authorityClass'] | 'unknown';
    bindingId?: string;
    capabilityId?: string;
    specialistId?: string;
  };
}

function laneTypeForBinding(bindingId: string | undefined): string | null {
  if (!bindingId) return null;
  const parts = bindingId.split(':');
  if (parts.length !== 2) return null;
  return parts[1] || null;
}

function actorSummary(actor: AuthorityActor) {
  const type: AuthorityActorType | LegacyAuthorityActorType | 'unknown' = actor.type ?? 'unknown';
  const authorityClass: AuthorityClass | 'unknown' = actor.authorityClass ?? 'unknown';
  return {
    id: String(actor.id || '').trim() || 'unknown',
    type,
    authorityClass,
    bindingId: actor.bindingId,
    capabilityId: actor.capabilityId,
    specialistId: actor.specialistId,
  };
}

function allowResource(
  input: ResourcePolicyGateInput,
  decision: ResourcePolicyGateResult['decision'],
  message: string,
): ResourcePolicyGateResult {
  return {
    ok: true,
    code: 'ALLOW',
    decision,
    message,
    resourceClass: input.resourceClass,
    resourceId: String(input.resourceId || '').trim() || 'unknown',
    actor: actorSummary(input.actor),
  };
}

function denyResource(
  input: ResourcePolicyGateInput,
  code: ResourcePolicyGateResult['code'],
  message: string,
): ResourcePolicyGateResult {
  return {
    ok: false,
    code,
    decision: 'deny',
    message,
    resourceClass: input.resourceClass,
    resourceId: String(input.resourceId || '').trim() || 'unknown',
    actor: actorSummary(input.actor),
  };
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

export function runResourcePolicyGate(input: ResourcePolicyGateInput): ResourcePolicyGateResult {
  const actorId = String(input.actor?.id || '').trim();
  if (!actorId) {
    return denyResource(input, 'INVALID_INPUT', 'actor.id is required');
  }

  const authority = evaluateAuthority(input.actor, 'execute');
  if (!authority.allowed && authority.code === 'INVALID_ACTOR') {
    return denyResource(input, 'INVALID_INPUT', authority.message);
  }

  const laneType = laneTypeForBinding(authority.bindingId);
  const capabilityId = authority.capabilityId;
  const authorityClass = authority.authorityClass;
  const isHumanOverride = authorityClass === 'human_final_arbiter';
  const isControlPlane =
    authorityClass === 'control_plane'
    || capabilityId === 'venture_control'
    || capabilityId === 'venture_strategy';

  if (input.resourceClass === 'dashboard_read') {
    return allowResource(input, 'allow', 'authenticated VentureOS subject may read dashboard state');
  }

  if (input.resourceClass === 'policy_override') {
    if (isHumanOverride) {
      return allowResource(input, 'allow_with_evidence', 'human final arbiter may perform policy override');
    }
    return denyResource(input, 'ACTOR_FORBIDDEN', 'policy override requires a human final arbiter');
  }

  if (input.resourceClass === 'task_queue_mutation') {
    if (isHumanOverride) {
      return allowResource(input, 'allow_with_evidence', 'human final arbiter may mutate queue state with evidence');
    }
    if (authority.bindingId === 'operations:operator' && capabilityId === 'venture_control') {
      return allowResource(input, 'allow_with_evidence', 'operations:operator + venture_control may mutate queue state');
    }
    return denyResource(
      input,
      'ACTOR_FORBIDDEN',
      'task queue mutation requires operations:operator with venture_control or human final arbiter',
    );
  }

  if (input.resourceClass === 'dashboard_control') {
    if (isHumanOverride) {
      return allowResource(input, 'allow_with_evidence', 'human final arbiter may execute dashboard control actions');
    }
    if (laneType === 'director') {
      return allowResource(input, 'allow_with_evidence', 'director lane may execute dashboard control actions');
    }
    if (
      (authority.bindingId === 'operations:operator' && capabilityId === 'venture_control')
      || (authority.bindingId === 'executive_office:operator' && capabilityId === 'venture_strategy')
      || isControlPlane
    ) {
      return allowResource(input, 'allow_with_evidence', 'canonical control-plane subject may execute dashboard control actions');
    }
    return denyResource(
      input,
      'ACTOR_FORBIDDEN',
      'dashboard control requires a director lane, a canonical control-plane subject, or a human final arbiter',
    );
  }

  return denyResource(input, 'INVALID_INPUT', `unsupported resource class: ${input.resourceClass}`);
}

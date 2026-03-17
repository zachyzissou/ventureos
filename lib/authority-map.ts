/**
 * VentureOS Authority Map
 *
 * Encodes who may perform authority-scoped mission actions using canonical
 * VentureOS authority classes while preserving compatibility for legacy callers.
 */

export type LegacyAuthorityActorType = 'human' | 'nexus' | 'agent';
export type AuthorityActorType = LegacyAuthorityActorType;

export type AuthorityClass = 'delegated_agent' | 'control_plane' | 'human_final_arbiter';

export type AuthorityAction =
  | 'propose'
  | 'execute'
  | 'approve'
  | 'close'
  | 'override';

export interface AuthorityActor {
  id: string;
  type?: LegacyAuthorityActorType;
  authorityClass?: AuthorityClass;
  bindingId?: string;
  capabilityId?: string;
  specialistId?: string;
}

export interface AuthorityRule {
  action: AuthorityAction;
  allowedAuthorityClasses: readonly AuthorityClass[];
  allowedActorTypes: readonly LegacyAuthorityActorType[];
  rationale: string;
}

const LEGACY_TYPE_TO_AUTHORITY_CLASS: Record<LegacyAuthorityActorType, AuthorityClass> = {
  human: 'human_final_arbiter',
  nexus: 'control_plane',
  agent: 'delegated_agent',
};

const AUTHORITY_CLASS_TO_LEGACY_TYPES: Record<AuthorityClass, readonly LegacyAuthorityActorType[]> = {
  delegated_agent: ['agent'],
  control_plane: ['nexus'],
  human_final_arbiter: ['human'],
};

const RULES: Record<AuthorityAction, AuthorityRule> = {
  propose: {
    action: 'propose',
    allowedAuthorityClasses: ['delegated_agent', 'control_plane', 'human_final_arbiter'],
    allowedActorTypes: ['agent', 'nexus', 'human'],
    rationale: 'Any bounded VentureOS subject may propose work.',
  },
  execute: {
    action: 'execute',
    allowedAuthorityClasses: ['delegated_agent', 'control_plane', 'human_final_arbiter'],
    allowedActorTypes: ['agent', 'nexus', 'human'],
    rationale: 'Execution can be delegated under control-plane or human supervision.',
  },
  approve: {
    action: 'approve',
    allowedAuthorityClasses: ['control_plane', 'human_final_arbiter'],
    allowedActorTypes: ['nexus', 'human'],
    rationale: 'Approvals require control-plane or human-final authority.',
  },
  close: {
    action: 'close',
    allowedAuthorityClasses: ['control_plane', 'human_final_arbiter'],
    allowedActorTypes: ['nexus', 'human'],
    rationale: 'Finalization is restricted to control-plane or human-final authority.',
  },
  override: {
    action: 'override',
    allowedAuthorityClasses: ['human_final_arbiter'],
    allowedActorTypes: ['human'],
    rationale: 'Only a human final arbiter may perform override actions.',
  },
};

function isValidBindingId(value: string | undefined): boolean {
  if (value === undefined) return true;
  return /^[a-z_]+:[a-z_]+$/.test(value);
}

function isValidCanonicalId(value: string | undefined): boolean {
  if (value === undefined) return true;
  return /^[a-z_]+$/.test(value);
}

export function resolveAuthorityClass(actor: AuthorityActor): AuthorityClass | null {
  if (actor.authorityClass) return actor.authorityClass;
  if (actor.type) return LEGACY_TYPE_TO_AUTHORITY_CLASS[actor.type] ?? null;
  return null;
}

export function authorityRuleFor(action: AuthorityAction): AuthorityRule {
  return RULES[action];
}

export function isAuthorityActorWellFormed(actor: AuthorityActor): boolean {
  if (!actor || !String(actor.id || '').trim()) return false;
  const authorityClass = resolveAuthorityClass(actor);
  if (!authorityClass) return false;
  if (!isValidBindingId(actor.bindingId)) return false;
  if (!isValidCanonicalId(actor.capabilityId)) return false;
  if (!isValidCanonicalId(actor.specialistId)) return false;
  return true;
}

export function isAuthorityActionAllowed(actor: AuthorityActor, action: AuthorityAction): boolean {
  const authorityClass = resolveAuthorityClass(actor);
  if (!authorityClass) return false;
  const allowed = authorityRuleFor(action).allowedAuthorityClasses;
  return allowed.includes(authorityClass);
}

export interface AuthorityDecision {
  allowed: boolean;
  code: 'ALLOW' | 'ACTOR_FORBIDDEN' | 'INVALID_ACTOR';
  message: string;
  action: AuthorityAction;
  actorId: string;
  actorType: LegacyAuthorityActorType | 'unknown';
  authorityClass: AuthorityClass | 'unknown';
  bindingId?: string;
  capabilityId?: string;
  specialistId?: string;
  allowedActorTypes: readonly LegacyAuthorityActorType[];
  allowedAuthorityClasses: readonly AuthorityClass[];
}

export function evaluateAuthority(actor: AuthorityActor, action: AuthorityAction): AuthorityDecision {
  const actorId = String(actor.id || '').trim() || 'unknown';
  const actorType = actor.type ?? 'unknown';
  const authorityClass = resolveAuthorityClass(actor);
  const rule = authorityRuleFor(action);

  if (!isAuthorityActorWellFormed(actor) || !authorityClass) {
    return {
      allowed: false,
      code: 'INVALID_ACTOR',
      message: 'actor must include a valid id and canonical or legacy authority metadata',
      action,
      actorId,
      actorType,
      authorityClass: authorityClass ?? 'unknown',
      bindingId: actor.bindingId,
      capabilityId: actor.capabilityId,
      specialistId: actor.specialistId,
      allowedActorTypes: rule.allowedActorTypes,
      allowedAuthorityClasses: rule.allowedAuthorityClasses,
    };
  }

  const allowed = rule.allowedAuthorityClasses.includes(authorityClass);
  if (allowed) {
    return {
      allowed: true,
      code: 'ALLOW',
      message: `${authorityClass} may ${action}`,
      action,
      actorId,
      actorType,
      authorityClass,
      bindingId: actor.bindingId,
      capabilityId: actor.capabilityId,
      specialistId: actor.specialistId,
      allowedActorTypes: rule.allowedActorTypes,
      allowedAuthorityClasses: rule.allowedAuthorityClasses,
    };
  }

  return {
    allowed: false,
    code: 'ACTOR_FORBIDDEN',
    message: `${authorityClass} may not ${action}; allowed authority classes: ${rule.allowedAuthorityClasses.join(', ')}`,
    action,
    actorId,
    actorType,
    authorityClass,
    bindingId: actor.bindingId,
    capabilityId: actor.capabilityId,
    specialistId: actor.specialistId,
    allowedActorTypes: rule.allowedActorTypes,
    allowedAuthorityClasses: rule.allowedAuthorityClasses,
  };
}

export function allowedLegacyActorTypesFor(authorityClass: AuthorityClass): readonly LegacyAuthorityActorType[] {
  return AUTHORITY_CLASS_TO_LEGACY_TYPES[authorityClass];
}

/**
 * Nexus Authority Map — Nexus 2.0 M2 (#285)
 *
 * Encodes who may perform which authority-scoped mission actions.
 * Human remains final arbiter.
 */

export type AuthorityActorType = 'human' | 'nexus' | 'agent';

export type AuthorityAction =
  | 'propose'
  | 'execute'
  | 'approve'
  | 'close'
  | 'override';

export interface AuthorityActor {
  id: string;
  type: AuthorityActorType;
}

export interface AuthorityRule {
  action: AuthorityAction;
  allowedActorTypes: readonly AuthorityActorType[];
  rationale: string;
}

const RULES: Record<AuthorityAction, AuthorityRule> = {
  propose: {
    action: 'propose',
    allowedActorTypes: ['agent', 'nexus', 'human'],
    rationale: 'Any bounded actor may propose work.',
  },
  execute: {
    action: 'execute',
    allowedActorTypes: ['agent', 'nexus', 'human'],
    rationale: 'Execution can be delegated to agents under control-plane supervision.',
  },
  approve: {
    action: 'approve',
    allowedActorTypes: ['nexus', 'human'],
    rationale: 'Approvals require control-plane or human authority.',
  },
  close: {
    action: 'close',
    allowedActorTypes: ['nexus', 'human'],
    rationale: 'Finalization is restricted to Nexus or human arbiter.',
  },
  override: {
    action: 'override',
    allowedActorTypes: ['human'],
    rationale: 'Human is the final arbiter for all override actions.',
  },
};

export function authorityRuleFor(action: AuthorityAction): AuthorityRule {
  return RULES[action];
}

export function isAuthorityActionAllowed(actor: AuthorityActor, action: AuthorityAction): boolean {
  const allowed = authorityRuleFor(action).allowedActorTypes;
  return allowed.includes(actor.type);
}

export interface AuthorityDecision {
  allowed: boolean;
  code: 'ALLOW' | 'ACTOR_FORBIDDEN';
  message: string;
  action: AuthorityAction;
  actorId: string;
  actorType: AuthorityActorType;
  allowedActorTypes: readonly AuthorityActorType[];
}

export function evaluateAuthority(actor: AuthorityActor, action: AuthorityAction): AuthorityDecision {
  const rule = authorityRuleFor(action);
  const allowed = rule.allowedActorTypes.includes(actor.type);
  if (allowed) {
    return {
      allowed: true,
      code: 'ALLOW',
      message: `${actor.type} may ${action}`,
      action,
      actorId: actor.id,
      actorType: actor.type,
      allowedActorTypes: rule.allowedActorTypes,
    };
  }
  return {
    allowed: false,
    code: 'ACTOR_FORBIDDEN',
    message: `${actor.type} may not ${action}; allowed: ${rule.allowedActorTypes.join(', ')}`,
    action,
    actorId: actor.id,
    actorType: actor.type,
    allowedActorTypes: rule.allowedActorTypes,
  };
}

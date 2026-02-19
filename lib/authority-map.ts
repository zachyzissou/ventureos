export type AuthorityActorType = 'human' | 'nexus' | 'agent';

export interface AuthorityActor {
  id: string;
  type: AuthorityActorType;
}

export type AuthorityAction =
  | 'mission.propose'
  | 'mission.execute'
  | 'mission.verify'
  | 'mission.close'
  | 'policy.override'
  | 'competition.accept';

export interface AuthorityDecision {
  allowed: boolean;
  reason?: string;
}

/**
 * Nexus 2.0 authority baseline:
 * - Human is final arbiter.
 * - Nexus is runtime control plane.
 * - Other agents are bounded executors.
 */
export function canActorPerform(actor: AuthorityActor, action: AuthorityAction): AuthorityDecision {
  if (actor.type === 'human') return { allowed: true };

  if (actor.type === 'nexus') {
    if (action === 'policy.override') return { allowed: false, reason: 'Nexus cannot override human final arbitration' };
    return { allowed: true };
  }

  // bounded non-nexus agents
  switch (action) {
    case 'mission.propose':
    case 'mission.execute':
    case 'mission.verify':
      return { allowed: true };
    case 'mission.close':
    case 'policy.override':
    case 'competition.accept':
      return { allowed: false, reason: 'Agent lacks final authority for this action' };
    default:
      return { allowed: false, reason: 'Unsupported action' };
  }
}

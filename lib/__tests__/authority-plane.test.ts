import {
  authorityRuleFor,
  evaluateAuthority,
  isAuthorityActionAllowed,
  resolveAuthorityClass,
} from '../authority-map';
import { runPolicyGate } from '../policy-gate';
import {
  applyHumanOverride,
  arbitrateRecommendation,
} from '../nexus-arbiter';

describe('authority plane', () => {
  test('subordinate agents cannot close missions', () => {
    const decision = evaluateAuthority({
      id: 'venture-research',
      authorityClass: 'delegated_agent',
      bindingId: 'data_analytics:operator',
      capabilityId: 'venture_research',
    }, 'close');
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('ACTOR_FORBIDDEN');
    expect(isAuthorityActionAllowed({
      id: 'venture-research',
      authorityClass: 'delegated_agent',
      bindingId: 'data_analytics:operator',
      capabilityId: 'venture_research',
    }, 'close')).toBe(false);
  });

  test('control-plane subjects can approve and close', () => {
    const actor = {
      id: 'venture-control',
      authorityClass: 'control_plane' as const,
      bindingId: 'operations:operator',
      capabilityId: 'venture_control',
    };
    expect(isAuthorityActionAllowed(actor, 'approve')).toBe(true);
    expect(isAuthorityActionAllowed(actor, 'close')).toBe(true);
    expect(authorityRuleFor('override').allowedActorTypes).toEqual(['human']);
    expect(authorityRuleFor('approve').allowedAuthorityClasses).toContain('control_plane');
  });

  test('legacy actor types still resolve to canonical authority classes', () => {
    expect(resolveAuthorityClass({ id: 'legacy-control', type: 'nexus' })).toBe('control_plane');
    expect(resolveAuthorityClass({ id: 'legacy-human', type: 'human' })).toBe('human_final_arbiter');
    expect(resolveAuthorityClass({ id: 'legacy-agent', type: 'agent' })).toBe('delegated_agent');
  });

  test('delegated agents can still propose and execute', () => {
    expect(isAuthorityActionAllowed({ id: 'atlas', type: 'agent' }, 'propose')).toBe(true);
    expect(isAuthorityActionAllowed({ id: 'atlas', type: 'agent' }, 'execute')).toBe(true);
  });

  test('policy gate returns machine-readable deny reason', () => {
    const gate = runPolicyGate({
      missionId: 'm2-test',
      actor: {
        id: 'venture-delivery',
        authorityClass: 'delegated_agent',
        bindingId: 'engineering:operator',
        capabilityId: 'venture_delivery',
      },
      action: 'approve',
    });
    expect(gate.ok).toBe(false);
    expect(gate.code).toBe('ACTOR_FORBIDDEN');
    expect(gate.allowedActorTypes).toContain('control_plane');
    expect(gate.allowedActorTypes).toContain('human');
    expect(gate.allowedAuthorityClasses).toContain('control_plane');
    expect(gate.actor.bindingId).toBe('engineering:operator');
  });

  test('policy gate returns INVALID_INPUT for malformed actor/mission payload', () => {
    const gate = runPolicyGate({
      missionId: 'm2-test',
      actor: { id: 'x', bindingId: 'not-a-binding', authorityClass: 'control_plane' },
      action: 'approve',
    });
    expect(gate.ok).toBe(false);
    expect(gate.code).toBe('INVALID_INPUT');
    expect(gate.actor.bindingId).toBe('not-a-binding');
  });

  test('arbiter rejects unauthorized acceptance', () => {
    const result = arbitrateRecommendation({
      missionId: 'm2-test',
      actor: {
        id: 'venture-research',
        authorityClass: 'delegated_agent',
        bindingId: 'data_analytics:operator',
        capabilityId: 'venture_research',
      },
      recommendationId: 'cand-1',
      accept: true,
    });
    expect(result.accepted).toBe(false);
    expect(result.code).toBe('ARBITRATION_DENIED');
  });

  test('arbiter accepts authorized control-plane arbitration', () => {
    const result = arbitrateRecommendation({
      missionId: 'm2-test',
      actor: {
        id: 'venture-control',
        authorityClass: 'control_plane',
        bindingId: 'operations:operator',
        capabilityId: 'venture_control',
      },
      recommendationId: 'cand-2',
      accept: true,
    });
    expect(result.accepted).toBe(true);
    expect(result.code).toBe('ARBITRATION_ACCEPTED');
  });

  test('arbiter returns advisory status when acceptance flag is false', () => {
    const result = arbitrateRecommendation({
      missionId: 'm2-test',
      actor: {
        id: 'venture-control',
        authorityClass: 'control_plane',
        bindingId: 'operations:operator',
        capabilityId: 'venture_control',
      },
      recommendationId: 'cand-2',
      accept: false,
    });
    expect(result.accepted).toBe(false);
    expect(result.code).toBe('ARBITRATION_ADVISORY');
  });

  test('arbiter returns invalid when recommendation id is missing', () => {
    const result = arbitrateRecommendation({
      missionId: 'm2-test',
      actor: {
        id: 'venture-control',
        authorityClass: 'control_plane',
        bindingId: 'operations:operator',
        capabilityId: 'venture_control',
      },
      recommendationId: '',
      accept: true,
    });
    expect(result.accepted).toBe(false);
    expect(result.code).toBe('ARBITRATION_INVALID');
  });

  test('human override path is available and explicit', () => {
    const denied = applyHumanOverride({
      missionId: 'm2-test',
      actor: {
        id: 'venture-control',
        authorityClass: 'control_plane',
        bindingId: 'operations:operator',
        capabilityId: 'venture_control',
      },
      targetAction: 'close',
    });
    expect(denied.applied).toBe(false);
    expect(denied.code).toBe('HUMAN_OVERRIDE_DENIED');

    const allowed = applyHumanOverride({
      missionId: 'm2-test',
      actor: {
        id: 'zach',
        authorityClass: 'human_final_arbiter',
        bindingId: 'executive_office:director',
        capabilityId: 'venture_strategy',
      },
      targetAction: 'close',
    });
    expect(allowed.applied).toBe(true);
    expect(allowed.code).toBe('HUMAN_OVERRIDE_APPLIED');
  });
});

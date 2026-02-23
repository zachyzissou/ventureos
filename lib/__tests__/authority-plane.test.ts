import {
  authorityRuleFor,
  evaluateAuthority,
  isAuthorityActionAllowed,
} from '../authority-map';
import { runPolicyGate } from '../policy-gate';
import {
  applyHumanOverride,
  arbitrateRecommendation,
} from '../nexus-arbiter';

describe('nexus authority plane (M2)', () => {
  test('subordinate agents cannot close missions', () => {
    const decision = evaluateAuthority({ id: 'oracle', type: 'agent' }, 'close');
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('ACTOR_FORBIDDEN');
    expect(isAuthorityActionAllowed({ id: 'oracle', type: 'agent' }, 'close')).toBe(false);
  });

  test('nexus can approve and close', () => {
    expect(isAuthorityActionAllowed({ id: 'nexus', type: 'nexus' }, 'approve')).toBe(true);
    expect(isAuthorityActionAllowed({ id: 'nexus', type: 'nexus' }, 'close')).toBe(true);
    expect(authorityRuleFor('override').allowedActorTypes).toEqual(['human']);
  });

  test('agents can still propose and execute', () => {
    expect(isAuthorityActionAllowed({ id: 'atlas', type: 'agent' }, 'propose')).toBe(true);
    expect(isAuthorityActionAllowed({ id: 'atlas', type: 'agent' }, 'execute')).toBe(true);
  });

  test('policy gate returns machine-readable deny reason', () => {
    const gate = runPolicyGate({
      missionId: 'm2-test',
      actor: { id: 'atlas', type: 'agent' },
      action: 'approve',
    });
    expect(gate.ok).toBe(false);
    expect(gate.code).toBe('ACTOR_FORBIDDEN');
    expect(gate.allowedActorTypes).toContain('nexus');
    expect(gate.allowedActorTypes).toContain('human');
  });

  test('policy gate returns INVALID_INPUT for malformed actor/mission payload', () => {
    const gate = runPolicyGate({
      missionId: 'm2-test',
      actor: { id: 'x', type: 'robot' } as any,
      action: 'approve',
    });
    expect(gate.ok).toBe(false);
    expect(gate.code).toBe('INVALID_INPUT');
    expect(gate.actor.type).toBe('unknown');
  });

  test('arbiter rejects unauthorized acceptance', () => {
    const result = arbitrateRecommendation({
      missionId: 'm2-test',
      actor: { id: 'atlas', type: 'agent' },
      recommendationId: 'cand-1',
      accept: true,
    });
    expect(result.accepted).toBe(false);
    expect(result.code).toBe('ARBITRATION_DENIED');
  });

  test('arbiter accepts authorized nexus arbitration', () => {
    const result = arbitrateRecommendation({
      missionId: 'm2-test',
      actor: { id: 'nexus', type: 'nexus' },
      recommendationId: 'cand-2',
      accept: true,
    });
    expect(result.accepted).toBe(true);
    expect(result.code).toBe('ARBITRATION_ACCEPTED');
  });

  test('arbiter returns advisory status when acceptance flag is false', () => {
    const result = arbitrateRecommendation({
      missionId: 'm2-test',
      actor: { id: 'nexus', type: 'nexus' },
      recommendationId: 'cand-2',
      accept: false,
    });
    expect(result.accepted).toBe(false);
    expect(result.code).toBe('ARBITRATION_ADVISORY');
  });

  test('arbiter returns invalid when recommendation id is missing', () => {
    const result = arbitrateRecommendation({
      missionId: 'm2-test',
      actor: { id: 'nexus', type: 'nexus' },
      recommendationId: '',
      accept: true,
    });
    expect(result.accepted).toBe(false);
    expect(result.code).toBe('ARBITRATION_INVALID');
  });

  test('human override path is available and explicit', () => {
    const denied = applyHumanOverride({
      missionId: 'm2-test',
      actor: { id: 'nexus', type: 'nexus' },
      targetAction: 'close',
    });
    expect(denied.applied).toBe(false);
    expect(denied.code).toBe('HUMAN_OVERRIDE_DENIED');

    const allowed = applyHumanOverride({
      missionId: 'm2-test',
      actor: { id: 'zach', type: 'human' },
      targetAction: 'close',
    });
    expect(allowed.applied).toBe(true);
    expect(allowed.code).toBe('HUMAN_OVERRIDE_APPLIED');
  });
});

import { canActorPerform } from '../authority-map';
import { evaluatePolicyGate } from '../policy-gate';
import { arbitrateMissionClose } from '../nexus-arbiter';
import type { MissionRecord } from '../mission-state-machine';

function makeMission(phase: MissionRecord['phase'] = 'deliver'): MissionRecord {
  const now = '2026-02-19T00:00:00.000Z';
  return {
    missionId: 'm1',
    phase,
    createdAt: now,
    updatedAt: now,
    brief: { title: 't', description: 'd', requirements: [] },
    plan: { createdAt: now, tasks: [] },
    execution: { startedAt: now, finishedAt: now, taskStatus: {}, results: [] },
    verification: { startedAt: now, finishedAt: now, results: [], overall: 'pass' },
    delivery:
      phase === 'closed' || phase === 'deliver'
        ? {
            deliveredAt: now,
            artifactsDir: '/tmp',
            manifestPath: '/tmp/manifest.json',
            artifacts: [],
            reports: { statusReportPath: '/tmp/s.md', completionSummaryPath: '/tmp/c.md' },
          }
        : undefined,
    history: [],
    metrics: { createdAt: now, updatedAt: now },
  };
}

describe('authority plane', () => {
  test('human is final authority', () => {
    expect(canActorPerform({ id: 'zach', type: 'human' }, 'policy.override').allowed).toBe(true);
  });

  test('bounded agent cannot close mission', () => {
    const decision = canActorPerform({ id: 'oracle', type: 'agent' }, 'mission.close');
    expect(decision.allowed).toBe(false);
  });

  test('policy gate rejects close outside deliver phase', () => {
    const res = evaluatePolicyGate({
      actor: { id: 'nexus', type: 'nexus' },
      action: 'mission.close',
      mission: makeMission('verify'),
    });
    expect(res.allow).toBe(false);
    expect(res.code).toBe('invalid_state');
  });

  test('arbiter requires human callback when configured', async () => {
    const res = await arbitrateMissionClose({
      mission: makeMission('deliver'),
      actor: { id: 'nexus', type: 'nexus' },
      requireHumanFinalApproval: true,
    });

    expect(res.allowClose).toBe(false);
    expect(res.code).toBe('requires_human_approval');
  });

  test('arbiter allows closure when human approves', async () => {
    const res = await arbitrateMissionClose({
      mission: makeMission('deliver'),
      actor: { id: 'nexus', type: 'nexus' },
      requireHumanFinalApproval: true,
      approve: async () => true,
    });

    expect(res.allowClose).toBe(true);
    expect(res.code).toBe('allow');
  });
});

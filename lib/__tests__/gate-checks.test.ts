import { GateChecks } from '../gate-checks';
import type { MissionRecord } from '../mission-state-machine';

function baseMission(overrides: Partial<MissionRecord> = {}): MissionRecord {
  const now = new Date('2026-02-15T00:00:00.000Z').toISOString();
  return {
    missionId: 'm1',
    phase: 'execute',
    createdAt: now,
    updatedAt: now,
    brief: { title: 't', description: 'd', requirements: [] },
    plan: {
      createdAt: now,
      tasks: [{ taskId: 't1', title: 'x', description: 'y', role: 'venture_delivery' }],
    },
    execution: {
      startedAt: now,
      finishedAt: now,
      taskStatus: { t1: 'succeeded' },
      results: [
        {
          taskId: 't1',
          agentId: 'venture_delivery',
          startedAt: now,
          finishedAt: now,
          status: 'succeeded',
          artifacts: [{ name: 'out.md', content: 'ok' }],
        },
      ],
    },
    history: [{ phase: 'brief', enteredAt: now }],
    metrics: { createdAt: now, updatedAt: now },
    ...overrides,
  };
}

describe('GateChecks', () => {
  it('fails when execution has failed tasks', async () => {
    const gates = new GateChecks();
    const mission = baseMission({
      execution: {
        ...baseMission().execution!,
        taskStatus: { t1: 'failed' },
        results: [
          {
            taskId: 't1',
            agentId: 'venture_delivery',
            startedAt: baseMission().createdAt,
            finishedAt: baseMission().createdAt,
            status: 'failed',
            error: { message: 'boom' },
          },
        ],
      },
    });

    const out = await gates.runAll({ mission });
    expect(out.overall).toBe('fail');
    expect(out.results.some((r) => r.status === 'fail')).toBe(true);
  });

  it('detects obvious secrets in task artifact content', async () => {
    const gates = new GateChecks();
    const mission = baseMission({
      execution: {
        ...baseMission().execution!,
        results: [
          {
            taskId: 't1',
            agentId: 'venture_delivery',
            startedAt: baseMission().createdAt,
            finishedAt: baseMission().createdAt,
            status: 'succeeded',
            artifacts: [{ name: 'out.txt', content: 'AKIA1234567890ABCDEF' }],
          },
        ],
      },
    });

    const out = await gates.runAll({ mission });
    expect(out.overall).toBe('fail');
    expect(out.results.find((r) => r.gateId === 'security.artifacts.no_obvious_secrets')?.status).toBe('fail');
  });

  it('requires approval when approval callback returns false', async () => {
    const gates = new GateChecks();
    const mission = baseMission();

    const out = await gates.runAll({
      mission,
      approve: async () => false,
    });

    expect(out.overall).toBe('require_approval');
    expect(out.results.find((r) => r.kind === 'approval')?.status).toBe('require_approval');
  });
});

import { SquadCoordinator } from '../squad-coordinator';

function makeNow(startIso = '2026-02-15T00:00:00.000Z') {
  let t = Date.parse(startIso);
  return () => {
    const d = new Date(t);
    t += 1000;
    return d;
  };
}

describe('SquadCoordinator', () => {
  it('infers roles from brief text', () => {
    const c = new SquadCoordinator({
      agents: [
        { id: 'venture_delivery', async runTask() { return {}; } },
      ],
      now: makeNow(),
    });

    const roles = c.inferRolesFromBrief({
      title: 'Security audit',
      description: 'Run tests and check for vulnerabilities',
      requirements: ['Add documentation'],
    });

    expect(roles).toContain('venture_delivery');
    expect(roles).toContain('venture_security');
    expect(roles).toContain('venture_evidence');
    expect(roles).toContain('venture_memory');
  });

  it('executes tasks and continues after failure when configured', async () => {
    const now = makeNow();

    const c = new SquadCoordinator({
      agents: [
        {
          id: 'venture_delivery',
          async runTask(task) {
            if (task.title.includes('Implement')) throw new Error('impl fail');
            return { summary: 'ok' };
          },
        },
        {
          id: 'venture_research',
          async runTask() {
            return { summary: 'researched' };
          },
        },
      ],
      continueOnFailure: true,
      parallelize: false,
      now,
    });

    const brief = { title: 't', description: 'd', requirements: ['research'] };
    const plan = c.createPlanFromBrief(brief);

    const exec = await c.executePlan('m1', brief, plan);

    // At least one failure expected
    const failed = exec.results.filter((r) => r.status === 'failed');
    expect(failed.length).toBeGreaterThanOrEqual(1);

    // Coordinator returns an execution object instead of throwing
    expect(exec.startedAt).toBeTruthy();
    expect(exec.finishedAt).toBeTruthy();
  });

  it('marks missing-agent tasks as failed but does not crash (continueOnFailure=true)', async () => {
    const now = makeNow();

    const c = new SquadCoordinator({
      agents: [
        { id: 'venture_delivery', async runTask() { return { summary: 'ok' }; } },
      ],
      continueOnFailure: true,
      now,
    });

    const plan = {
      createdAt: now().toISOString(),
      tasks: [
        {
          taskId: 't1',
          title: 'Missing agent',
          description: 'Should fail',
          role: 'venture_evidence' as const,
        },
      ],
    };

    const exec = await c.executePlan('m1', { title: 't', description: 'd', requirements: [] }, plan);
    expect(exec.taskStatus.t1).toBe('failed');
    expect(exec.results[0].error?.message).toContain('No agent registered');
  });
});

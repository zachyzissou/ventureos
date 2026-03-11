import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getProposalLifecycleEngine,
  resetProposalLifecycleEngine,
} from '../../server/proposal-lifecycle.js';

const testRoot = path.join('/tmp', `ventureos-proposal-lifecycle-${process.pid}`);
const dataDir = path.join(testRoot, 'data');

async function waitForMissionTerminal(missionId: string, timeoutMs = 1500): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const engine = getProposalLifecycleEngine(dataDir);
    const mission = engine.getMission(missionId);
    if (!mission) throw new Error(`mission missing: ${missionId}`);
    if (mission.status === 'completed' || mission.status === 'failed' || mission.status === 'blocked') return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`mission did not complete within ${timeoutMs}ms`);
}

beforeEach(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  resetProposalLifecycleEngine(dataDir);
});

afterEach(() => {
  resetProposalLifecycleEngine(dataDir);
  fs.rmSync(testRoot, { recursive: true, force: true });
});

describe('proposal lifecycle engine', () => {
  it('stores proposals in pending queue until reviewed', () => {
    const engine = getProposalLifecycleEngine(dataDir, { stepDelayMs: 0 });
    const proposal = engine.submitProposal({
      title: 'Ship rollout report',
      goal: 'Generate a weekly rollout report with release health summary',
      submittedByAgentId: 'echo',
      estimatedCostUsd: 2.5,
      requiredSkills: ['reporting', 'analysis'],
      riskAssessment: {
        level: 'low',
        summary: 'Low operational risk',
        mitigations: ['Verify data freshness'],
      },
      steps: [
        {
          title: 'Collect release metrics',
          description: 'Gather last 7 days of release metrics',
          agentId: 'oracle',
        },
      ],
    });

    expect(proposal.status).toBe('pending');
    expect(engine.listProposals({ status: 'pending' })).toHaveLength(1);
    expect(engine.listMissions()).toHaveLength(0);
    const summary = engine.getSummary();
    expect(summary.stats.pendingApprovals).toBe(1);
    expect(summary.activeMissions).toHaveLength(0);
  });

  it('creates mission only after approval and executes ordered cross-agent handoffs', async () => {
    const engine = getProposalLifecycleEngine(dataDir, { stepDelayMs: 0 });
    const proposal = engine.submitProposal({
      title: 'Publish integration release',
      goal: 'Prepare, validate, and publish integration release artifacts',
      submittedByAgentId: 'echo',
      estimatedCostUsd: 6.25,
      requiredSkills: ['build', 'qa', 'docs'],
      riskAssessment: {
        level: 'medium',
        summary: 'Requires QA gate before publish',
        mitigations: ['Add smoke tests', 'manual checklist'],
      },
      steps: [
        {
          stepId: 'prep',
          title: 'Prepare build',
          description: 'Build and package artifacts',
          agentId: 'atlas',
        },
        {
          stepId: 'qa',
          title: 'Validate release',
          description: 'Run smoke + regression checks',
          agentId: 'verifier',
          dependsOnStepIds: ['prep'],
        },
        {
          stepId: 'docs',
          title: 'Publish notes',
          description: 'Update changelog and release notes',
          agentId: 'archivist',
          dependsOnStepIds: ['qa'],
        },
      ],
    });

    expect(engine.listMissions()).toHaveLength(0);

    const reviewed = engine.reviewProposal(proposal.proposalId, {
      action: 'approve',
      reviewerId: 'human-operator',
      notes: 'Looks good, proceed',
      autoStart: true,
    });

    expect(reviewed.proposal.status).toBe('approved');
    expect(reviewed.mission).toBeTruthy();

    await waitForMissionTerminal(reviewed.mission!.missionId);
    const mission = engine.getMission(reviewed.mission!.missionId);
    expect(mission?.status).toBe('completed');
    expect(mission?.steps.map((step) => step.status)).toEqual(['completed', 'completed', 'completed']);

    const events = engine.listEvents({ missionId: reviewed.mission!.missionId, limit: 200 });
    expect(events.some((event) => event.type === 'step.handoff' && event.toAgentId === 'verifier')).toBe(true);
    expect(events.some((event) => event.type === 'step.handoff' && event.toAgentId === 'archivist')).toBe(true);
    expect(events.some((event) => event.type === 'mission.completed')).toBe(true);
  });
});

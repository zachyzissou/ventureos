import { explainArenaDecision, runArena } from '../arena/arena-runner';
import type { MissionRecord } from '../mission-state-machine';

function makeMission(phase: MissionRecord['phase'] = 'deliver'): MissionRecord {
  const now = '2026-02-19T00:00:00.000Z';
  return {
    missionId: 'arena-mission',
    phase,
    createdAt: now,
    updatedAt: now,
    brief: { title: 't', description: 'd', requirements: [] },
    plan: { createdAt: now, tasks: [] },
    execution: { startedAt: now, finishedAt: now, taskStatus: {}, results: [] },
    verification: { startedAt: now, finishedAt: now, results: [], overall: 'pass' },
    delivery: {
      deliveredAt: now,
      artifactsDir: '/tmp',
      manifestPath: '/tmp/manifest.json',
      artifacts: [],
      reports: { statusReportPath: '/tmp/s.md', completionSummaryPath: '/tmp/c.md' },
    },
    history: [],
    metrics: { createdAt: now, updatedAt: now },
  };
}

describe('competition arena', () => {
  test('ranks candidates deterministically and returns advisory result by default', () => {
    const out = runArena({
      mission: makeMission(),
      actor: { id: 'nexus', type: 'nexus' },
      candidates: [
        { candidateId: 'c1', agentId: 'oracle', output: 'Short answer', metadata: { speedScore: 90 } },
        { candidateId: 'c2', agentId: 'synth', output: 'Longer answer with evidence because source https://example.com', metadata: { speedScore: 70 } },
      ],
    });

    expect(out.judged.scorecards.length).toBe(2);
    expect(out.judged.winner.agentId).toBe('synth');
    expect(out.accepted).toBe(false);
    expect(out.timeline.some((e) => e.type === 'route.evaluated')).toBe(true);
    expect(out.timeline.some((e) => e.type === 'verdict.generated')).toBe(true);
    expect(out.timeline.some((e) => e.type === 'verdict.advisory')).toBe(true);
  });

  test('allows authorized acceptance (human)', () => {
    const out = runArena({
      mission: makeMission(),
      actor: { id: 'zach', type: 'human' },
      acceptWinner: true,
      candidates: [
        { candidateId: 'c1', agentId: 'oracle', output: 'with evidence therefore source', metadata: { speedScore: 80 } },
        { candidateId: 'c2', agentId: 'atlas', output: 'plain', metadata: { speedScore: 80 } },
      ],
    });

    expect(out.accepted).toBe(true);
    expect(out.acceptanceReason).toMatch(/authorized arbiter/i);
    expect(out.timeline.some((e) => e.type === 'arbitration.accepted')).toBe(true);
  });

  test('rejects unauthorized acceptance (bounded agent)', () => {
    const out = runArena({
      mission: makeMission(),
      actor: { id: 'oracle', type: 'agent' },
      acceptWinner: true,
      candidates: [
        { candidateId: 'c1', agentId: 'oracle', output: 'a', metadata: { speedScore: 80 } },
        { candidateId: 'c2', agentId: 'atlas', output: 'b', metadata: { speedScore: 80 } },
      ],
    });

    expect(out.accepted).toBe(false);
    expect(out.acceptanceReason).toMatch(/authority/i);
    expect(out.timeline.some((e) => e.type === 'arbitration.rejected')).toBe(true);
  });

  test('handles edge-case speed metadata and deterministic tie-breaking', () => {
    const out = runArena({
      mission: makeMission(),
      actor: { id: 'nexus', type: 'nexus' },
      candidates: [
        { candidateId: 'c-a', agentId: 'zeta', output: '', metadata: { speedScore: 'fast' } },
        { candidateId: 'c-b', agentId: 'alpha', output: '', metadata: { speedScore: -5 } },
        { candidateId: 'c-c', agentId: 'beta', output: '', metadata: { speedScore: 500 } },
      ],
      rubric: { qualityWeight: 0.4, reliabilityWeight: 0.25, safetyWeight: 0.25, speedWeight: 0.1 },
    });

    expect(out.judged.scorecards).toHaveLength(3);
    // Should not emit NaN values for speed/total
    for (const s of out.judged.scorecards) {
      expect(Number.isNaN(s.speed)).toBe(false);
      expect(Number.isNaN(s.total)).toBe(false);
    }
  });

  test('throws on invalid rubric weights', () => {
    expect(() =>
      runArena({
        mission: makeMission(),
        actor: { id: 'nexus', type: 'nexus' },
        candidates: [
          { candidateId: 'c1', agentId: 'oracle', output: 'x' },
          { candidateId: 'c2', agentId: 'atlas', output: 'y' },
        ],
        rubric: { qualityWeight: 0.5, reliabilityWeight: 0.5, safetyWeight: 0.5, speedWeight: 0.5 },
      })
    ).toThrow(/weights must sum to 1.0/i);
  });

  test('provides replay-only human explanation text', () => {
    const out = runArena({
      mission: makeMission(),
      actor: { id: 'nexus', type: 'nexus' },
      acceptWinner: true,
      candidates: [
        { candidateId: 'c1', agentId: 'oracle', output: 'with evidence because source', metadata: { speedScore: 80 } },
        { candidateId: 'c2', agentId: 'atlas', output: 'plain', metadata: { speedScore: 80 } },
      ],
    });
    const explanation = explainArenaDecision(out);
    expect(explanation).toContain('Winner candidate');
    expect(explanation).toContain('accepted');
  });
});

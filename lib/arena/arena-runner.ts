import { judgeSubmissions, type JudgeResult } from './judge';
import type { CandidateSubmission, JudgeRubric } from './scorecard';
import type { MissionRecord } from '../mission-state-machine';
import { arbitrateRecommendation } from '../nexus-arbiter';
import type { AuthorityActor } from '../authority-map';

export type ArenaActor = AuthorityActor;

export type ArenaReplayEventType =
  | 'route.evaluated'
  | 'verdict.generated'
  | 'arbitration.accepted'
  | 'arbitration.rejected'
  | 'verdict.advisory';

export interface ArenaReplayEvent {
  type: ArenaReplayEventType;
  ts: number;
  missionId: string;
  actorId: string;
  actorType: ArenaActor['type'];
  details: Record<string, unknown>;
}

export interface ArenaRunInput {
  mission: MissionRecord;
  actor: ArenaActor;
  candidates: CandidateSubmission[];
  rubric?: JudgeRubric;
  acceptWinner?: boolean;
}

export interface ArenaRunResult {
  judged: JudgeResult;
  accepted: boolean;
  acceptanceReason: string;
  timeline: ArenaReplayEvent[];
}

function eventTs(mission: MissionRecord, fallback: number): number {
  const ts = Date.parse(mission.updatedAt);
  return Number.isFinite(ts) ? ts : fallback;
}

function summarizeTopScores(judged: JudgeResult): Array<{ candidateId: string; agentId: string; total: number }> {
  return judged.scorecards
    .slice(0, 3)
    .map((s) => ({ candidateId: s.candidateId, agentId: s.agentId, total: s.total }));
}

export function explainArenaDecision(result: ArenaRunResult): string {
  const winner = result.judged.winner;
  const status = result.accepted ? 'accepted' : 'not accepted';
  return [
    `Winner candidate ${winner.candidateId} (${winner.agentId}) scored ${winner.total}.`,
    `Decision ${status}: ${result.acceptanceReason}.`,
  ].join(' ');
}

export function runArena(input: ArenaRunInput): ArenaRunResult {
  const ts = eventTs(input.mission, Date.now());
  const judged = judgeSubmissions(input.candidates, input.rubric);
  const timeline: ArenaReplayEvent[] = [
    {
      type: 'route.evaluated',
      ts,
      missionId: input.mission.missionId,
      actorId: input.actor.id,
      actorType: input.actor.type,
      details: {
        candidateCount: input.candidates.length,
        phase: input.mission.phase,
      },
    },
    {
      type: 'verdict.generated',
      ts: ts + 1,
      missionId: input.mission.missionId,
      actorId: input.actor.id,
      actorType: input.actor.type,
      details: {
        winnerCandidateId: judged.winner.candidateId,
        winnerAgentId: judged.winner.agentId,
        winnerScore: judged.winner.total,
        topScores: summarizeTopScores(judged),
      },
    },
  ];

  if (!input.acceptWinner) {
    timeline.push({
      type: 'verdict.advisory',
      ts: ts + 2,
      missionId: input.mission.missionId,
      actorId: input.actor.id,
      actorType: input.actor.type,
      details: {
        reason: 'acceptWinner=false',
      },
    });
    return {
      judged,
      accepted: false,
      acceptanceReason: 'Winner is advisory until accepted by arbiter',
      timeline,
    };
  }

  const arbitration = arbitrateRecommendation({
    missionId: input.mission.missionId,
    actor: input.actor,
    recommendationId: judged.winner.candidateId,
    accept: true,
  });

  if (!arbitration.accepted) {
    timeline.push({
      type: 'arbitration.rejected',
      ts: ts + 2,
      missionId: input.mission.missionId,
      actorId: input.actor.id,
      actorType: input.actor.type,
      details: {
        code: arbitration.code,
        reason: arbitration.message,
        overrideAvailable: arbitration.overrideAvailable,
      },
    });
    return {
      judged,
      accepted: false,
      acceptanceReason: arbitration.message,
      timeline,
    };
  }

  timeline.push({
    type: 'arbitration.accepted',
    ts: ts + 2,
    missionId: input.mission.missionId,
    actorId: input.actor.id,
    actorType: input.actor.type,
      details: {
        acceptedBy: input.actor.id,
        acceptedByType: input.actor.type,
        code: arbitration.code,
      },
    });

  return {
    judged,
    accepted: true,
    acceptanceReason: 'Winner accepted by authorized arbiter',
    timeline,
  };
}

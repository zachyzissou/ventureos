import { judgeSubmissions, type JudgeResult } from './judge';
import type { CandidateSubmission, JudgeRubric } from './scorecard';
import type { MissionRecord } from '../mission-state-machine';

export type ArenaActor = { id: string; type: 'human' | 'nexus' | 'agent' };

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
}

export function runArena(input: ArenaRunInput): ArenaRunResult {
  const judged = judgeSubmissions(input.candidates, input.rubric);

  if (!input.acceptWinner) {
    return {
      judged,
      accepted: false,
      acceptanceReason: 'Winner is advisory until accepted by arbiter',
    };
  }

  const authorized = input.actor.type === 'human' || input.actor.type === 'nexus';
  if (!authorized) {
    return {
      judged,
      accepted: false,
      acceptanceReason: 'Competition acceptance requires nexus or human authority',
    };
  }

  return {
    judged,
    accepted: true,
    acceptanceReason: 'Winner accepted by authorized arbiter',
  };
}

import {
  type CandidateSubmission,
  type CandidateScorecard,
  type JudgeRubric,
  scoreSubmission,
  rankScorecards,
} from './scorecard';

export interface JudgeResult {
  scorecards: CandidateScorecard[];
  winner: CandidateScorecard;
}

export function defaultRubric(): JudgeRubric {
  return {
    qualityWeight: 0.4,
    reliabilityWeight: 0.25,
    safetyWeight: 0.25,
    speedWeight: 0.1,
  };
}

function validateRubric(rubric: JudgeRubric): void {
  const sum = rubric.qualityWeight + rubric.reliabilityWeight + rubric.safetyWeight + rubric.speedWeight;
  if (Math.abs(sum - 1.0) > 1e-6) {
    throw new Error(`Invalid JudgeRubric: weights must sum to 1.0 (got ${sum})`);
  }
}

export function judgeSubmissions(submissions: CandidateSubmission[], rubric: JudgeRubric = defaultRubric()): JudgeResult {
  if (submissions.length < 2) throw new Error('Competition requires at least 2 submissions');
  validateRubric(rubric);
  const scorecards = submissions.map((s) => scoreSubmission(s, rubric));
  const ranked = rankScorecards(scorecards);
  return {
    scorecards: ranked.ranked,
    winner: ranked.winner,
  };
}

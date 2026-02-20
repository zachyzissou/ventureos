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

export function judgeSubmissions(submissions: CandidateSubmission[], rubric: JudgeRubric = defaultRubric()): JudgeResult {
  if (submissions.length < 2) throw new Error('Competition requires at least 2 submissions');
  const scorecards = submissions.map((s) => scoreSubmission(s, rubric));
  const ranked = rankScorecards(scorecards);
  return {
    scorecards: ranked.ranked,
    winner: ranked.winner,
  };
}

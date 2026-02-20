export interface CandidateSubmission {
  candidateId: string;
  agentId: string;
  output: string;
  metadata?: Record<string, unknown>;
}

export interface JudgeRubric {
  qualityWeight: number;
  reliabilityWeight: number;
  safetyWeight: number;
  speedWeight: number;
}

export interface CandidateScorecard {
  candidateId: string;
  agentId: string;
  quality: number;
  reliability: number;
  safety: number;
  speed: number;
  total: number;
  reasons: string[];
}

export interface ArenaScoreResult {
  ranked: CandidateScorecard[];
  winner: CandidateScorecard;
}

export function scoreSubmission(submission: CandidateSubmission, rubric: JudgeRubric): CandidateScorecard {
  const text = submission.output ?? '';
  const length = text.length;
  const hasEvidence = /source|http|evidence|because|therefore/i.test(text);
  const hasUnsafe = /ignore rules|bypass|delete all|drop table|exfiltrate/i.test(text);

  const quality = Math.max(0, Math.min(100, Math.round(Math.min(100, length / 8) + (hasEvidence ? 15 : 0))));
  const reliability = Math.max(0, Math.min(100, Math.round((submission.metadata?.retries ? 70 : 85) - (hasUnsafe ? 20 : 0))));
  const safety = hasUnsafe ? 20 : 95;
  const speed = Math.max(0, Math.min(100, Number(submission.metadata?.speedScore ?? 80)));

  const total =
    quality * rubric.qualityWeight +
    reliability * rubric.reliabilityWeight +
    safety * rubric.safetyWeight +
    speed * rubric.speedWeight;

  const reasons = [
    hasEvidence ? 'Includes support/evidence indicators' : 'Limited explicit evidence markers',
    hasUnsafe ? 'Unsafe pattern detected' : 'No unsafe pattern detected',
  ];

  return {
    candidateId: submission.candidateId,
    agentId: submission.agentId,
    quality,
    reliability,
    safety,
    speed,
    total: Number(total.toFixed(2)),
    reasons,
  };
}

export function rankScorecards(scorecards: CandidateScorecard[]): ArenaScoreResult {
  if (!scorecards.length) throw new Error('No scorecards to rank');
  const ranked = [...scorecards].sort((a, b) => b.total - a.total || b.safety - a.safety || a.agentId.localeCompare(b.agentId));
  return { ranked, winner: ranked[0] };
}

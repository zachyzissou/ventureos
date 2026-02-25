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

/**
 * Deterministic heuristic scorer for arena submissions.
 *
 * Inputs:
 * - output text (quality/evidence + safety pattern checks)
 * - metadata.retries (number > 0 lowers reliability)
 * - metadata.speedScore (0-100, defaults to 80)
 *
 * Note: pattern checks are intentionally conservative for M3 safety-first behavior.
 */
export function scoreSubmission(submission: CandidateSubmission, rubric: JudgeRubric): CandidateScorecard {
  const text = submission.output ?? '';
  const length = text.length;
  const hasEvidence = /source|http|evidence|because|therefore/i.test(text);
  const hasUnsafe = /ignore rules|bypass|delete all|drop table|exfiltrate/i.test(text);

  // Quality: length-based base up to 85 + evidence bonus up to 15.
  const baseQuality = Math.min(85, length / 8);
  const evidenceBonus = hasEvidence ? 15 : 0;
  const quality = Math.max(0, Math.min(100, Math.round(baseQuality + evidenceBonus)));

  const retries = typeof submission.metadata?.retries === 'number' ? submission.metadata.retries : 0;
  const reliability = Math.max(0, Math.min(100, Math.round((retries > 0 ? 70 : 85) - (hasUnsafe ? 20 : 0))));
  const safety = hasUnsafe ? 20 : 95;

  const rawSpeed = submission.metadata?.speedScore;
  const parsedSpeed =
    typeof rawSpeed === 'number'
      ? rawSpeed
      : typeof rawSpeed === 'string'
        ? Number.parseFloat(rawSpeed)
        : 80;
  const normalizedSpeed = Number.isNaN(parsedSpeed) ? 80 : parsedSpeed;
  const speed = Math.max(0, Math.min(100, normalizedSpeed));

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
  // Final tiebreaker uses candidateId for deterministic ordering between same-agent multi-candidate runs.
  const ranked = [...scorecards].sort((a, b) => b.total - a.total || b.safety - a.safety || a.candidateId.localeCompare(b.candidateId));
  return { ranked, winner: ranked[0] };
}

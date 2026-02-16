/**
 * QA Framework — VentureOS Output Quality Assurance (P1 #31)
 *
 * Core validator interfaces, scoring engine, and result aggregation
 * for automated quality checking of all agent outputs.
 *
 * Design principles:
 * - Modular: validators are plug-and-play
 * - Extensible: new validators via the Validator interface
 * - Performance-conscious: validators run frequently, keep them fast
 * - Configurable: rubrics and thresholds are tunable
 */

// ============================================================================
// Types & Interfaces
// ============================================================================

/** Severity of a validation finding. */
export type FindingSeverity = 'error' | 'warning' | 'info';

/** A single finding from a validator. */
export interface ValidationFinding {
  /** Unique rule identifier (e.g. 'markdown.header.missing-h1'). */
  ruleId: string;
  severity: FindingSeverity;
  message: string;
  /** Line number (1-indexed) where the issue was found, if applicable. */
  line?: number;
  /** Column number (1-indexed), if applicable. */
  column?: number;
  /** Suggested fix, if available. */
  suggestion?: string;
}

/** Result from a single validator run. */
export interface ValidationResult {
  /** Validator identifier (e.g. 'markdown', 'json-schema'). */
  validatorId: string;
  /** Whether the validation passed (no errors; warnings allowed). */
  passed: boolean;
  /** Individual findings. */
  findings: ValidationFinding[];
  /** Score from 0–100 for the quality dimension this validator covers. */
  score: number;
  /** Execution time in milliseconds. */
  durationMs: number;
  /** Optional metadata from the validator. */
  metadata?: Record<string, unknown>;
}

/** Input to a validator. */
export interface ValidatorInput {
  /** The content to validate. */
  content: string;
  /** Content type hint (e.g. 'markdown', 'json', 'typescript'). */
  contentType?: string;
  /** Filename, if available. */
  filename?: string;
  /** Additional context the validator might need. */
  context?: Record<string, unknown>;
}

/** Base interface all validators must implement. */
export interface Validator {
  /** Unique identifier for this validator. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Content types this validator handles (empty = all). */
  readonly supportedTypes: string[];
  /** Run validation on the given input. */
  validate(input: ValidatorInput): Promise<ValidationResult>;
}

// ============================================================================
// Scoring
// ============================================================================

/** Weight and threshold configuration for a scoring dimension. */
export interface ScoringDimension {
  /** Dimension identifier. */
  dimensionId: string;
  /** Display name. */
  name: string;
  /** Weight (0–1) in the overall score. Weights should sum to 1.0. */
  weight: number;
  /** Score at or above which this dimension is considered "passing". */
  passingThreshold: number;
}

/** Configuration for the scoring engine. */
export interface ScoringConfig {
  dimensions: ScoringDimension[];
  /** Overall score at or above which the output is considered acceptable. */
  overallPassingThreshold: number;
}

/** Score for a single dimension. */
export interface DimensionScore {
  dimensionId: string;
  name: string;
  score: number;
  weight: number;
  weighted: number;
  passed: boolean;
}

/** Aggregated quality report. */
export interface QualityReport {
  /** Unique report identifier. */
  reportId: string;
  /** ISO timestamp of when the report was generated. */
  generatedAt: string;
  /** The content that was validated (truncated for large inputs). */
  inputSummary: string;
  /** Individual validator results. */
  validationResults: ValidationResult[];
  /** Per-dimension scores. */
  dimensionScores: DimensionScore[];
  /** Overall weighted score (0–100). */
  overallScore: number;
  /** Whether the output passes quality bar. */
  passed: boolean;
  /** Total validation time in milliseconds. */
  totalDurationMs: number;
  /** Actionable feedback items. */
  feedback: FeedbackItem[];
}

/** Structured feedback for the producing agent. */
export interface FeedbackItem {
  severity: FindingSeverity;
  category: string;
  message: string;
  suggestion?: string;
}

// ============================================================================
// Scoring Engine
// ============================================================================

const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  dimensions: [
    { dimensionId: 'clarity', name: 'Clarity', weight: 0.25, passingThreshold: 60 },
    { dimensionId: 'completeness', name: 'Completeness', weight: 0.30, passingThreshold: 70 },
    { dimensionId: 'accuracy', name: 'Accuracy', weight: 0.25, passingThreshold: 70 },
    { dimensionId: 'consistency', name: 'Consistency', weight: 0.20, passingThreshold: 60 },
  ],
  overallPassingThreshold: 65,
};

export class ScoringEngine {
  private readonly config: ScoringConfig;

  constructor(config?: Partial<ScoringConfig>) {
    this.config = {
      ...DEFAULT_SCORING_CONFIG,
      ...config,
      dimensions: config?.dimensions ?? DEFAULT_SCORING_CONFIG.dimensions,
    };
  }

  getConfig(): ScoringConfig {
    return { ...this.config, dimensions: [...this.config.dimensions] };
  }

  /**
   * Compute dimension scores from a map of dimensionId → raw score (0–100).
   */
  computeScores(rawScores: Record<string, number>): {
    dimensionScores: DimensionScore[];
    overallScore: number;
    passed: boolean;
  } {
    const dimensionScores: DimensionScore[] = this.config.dimensions.map((dim) => {
      const raw = Math.max(0, Math.min(100, rawScores[dim.dimensionId] ?? 0));
      return {
        dimensionId: dim.dimensionId,
        name: dim.name,
        score: raw,
        weight: dim.weight,
        weighted: raw * dim.weight,
        passed: raw >= dim.passingThreshold,
      };
    });

    const totalWeight = dimensionScores.reduce((s, d) => s + d.weight, 0);
    const overallScore = totalWeight > 0
      ? Math.round(dimensionScores.reduce((s, d) => s + d.weighted, 0) / totalWeight)
      : 0;

    return {
      dimensionScores,
      overallScore,
      passed: overallScore >= this.config.overallPassingThreshold,
    };
  }
}

// ============================================================================
// QA Framework (orchestrator)
// ============================================================================

export interface QAFrameworkConfig {
  /** Validators to run. */
  validators?: Validator[];
  /** Scoring configuration. */
  scoring?: Partial<ScoringConfig>;
  /** Maximum content length stored in report summaries. */
  maxSummaryLength?: number;
  /** Optional deterministic ID generator for tests. */
  generateId?: () => string;
  /** Optional deterministic time source for tests. */
  now?: () => Date;
}

let _idCounter = 0;
function defaultGenerateId(): string {
  _idCounter += 1;
  return `qr-${Date.now()}-${_idCounter}`;
}

/**
 * Maps validator results to scoring dimension raw scores.
 *
 * Strategy: each validator can declare which dimension it contributes to
 * via its metadata.dimension field. When multiple validators map to the
 * same dimension, scores are averaged.
 */
function mapResultsToDimensionScores(
  results: ValidationResult[],
  dimensionIds: string[]
): Record<string, number> {
  const buckets: Record<string, number[]> = {};
  for (const id of dimensionIds) {
    buckets[id] = [];
  }

  for (const r of results) {
    const dim = (r.metadata?.dimension as string) ?? null;
    if (dim && buckets[dim]) {
      buckets[dim].push(r.score);
    }
  }

  // If a dimension has no validators, default to 100 (no issues detected).
  const scores: Record<string, number> = {};
  for (const [id, vals] of Object.entries(buckets)) {
    scores[id] = vals.length > 0
      ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
      : 100;
  }

  return scores;
}

function extractFeedback(results: ValidationResult[]): FeedbackItem[] {
  const items: FeedbackItem[] = [];
  for (const r of results) {
    for (const f of r.findings) {
      if (f.severity === 'error' || f.severity === 'warning') {
        items.push({
          severity: f.severity,
          category: r.validatorId,
          message: f.message,
          suggestion: f.suggestion,
        });
      }
    }
  }
  return items;
}

export class QAFramework {
  private readonly validators: Validator[];
  private readonly scoringEngine: ScoringEngine;
  private readonly maxSummaryLength: number;
  private readonly generateId: () => string;
  private readonly now: () => Date;

  constructor(config: QAFrameworkConfig = {}) {
    this.validators = config.validators ?? [];
    this.scoringEngine = new ScoringEngine(config.scoring);
    this.maxSummaryLength = config.maxSummaryLength ?? 200;
    this.generateId = config.generateId ?? defaultGenerateId;
    this.now = config.now ?? (() => new Date());
  }

  /** Register a validator at runtime. */
  addValidator(validator: Validator): void {
    this.validators.push(validator);
  }

  /** Remove a validator by ID. Returns true if found and removed. */
  removeValidator(validatorId: string): boolean {
    const idx = this.validators.findIndex((v) => v.id === validatorId);
    if (idx === -1) return false;
    this.validators.splice(idx, 1);
    return true;
  }

  /** Get list of registered validators. */
  getValidators(): ReadonlyArray<Validator> {
    return [...this.validators];
  }

  /**
   * Run all applicable validators and produce a quality report.
   */
  async validate(input: ValidatorInput): Promise<QualityReport> {
    const startTime = performance.now();

    // Filter to validators that support this content type.
    const applicable = this.validators.filter((v) => {
      if (v.supportedTypes.length === 0) return true;
      if (!input.contentType) return true;
      return v.supportedTypes.includes(input.contentType);
    });

    // Run all validators (independent — can parallelize).
    // Guard against individual validator runtime exceptions so one failure
    // does not reject the entire quality report.
    const validatorPromises = applicable.map(async (v) => {
      const validatorStart = performance.now();
      try {
        return await v.validate(input);
      } catch (error) {
        const durationMs = Math.round(performance.now() - validatorStart);
        const message = error instanceof Error ? error.message : 'Unknown validator runtime error';

        const fallbackFinding: ValidationFinding = {
          ruleId: 'validator.runtime.error',
          severity: 'error',
          message,
        };

        const fallbackResult: ValidationResult = {
          validatorId: (v as any).id ?? 'unknown-validator',
          passed: false,
          score: 0,
          findings: [fallbackFinding],
          durationMs,
        };

        return fallbackResult;
      }
    });

    const results = await Promise.all(validatorPromises);

    // Compute dimension scores.
    const dimensionIds = this.scoringEngine.getConfig().dimensions.map((d) => d.dimensionId);
    const rawScores = mapResultsToDimensionScores(results, dimensionIds);
    const { dimensionScores, overallScore, passed } = this.scoringEngine.computeScores(rawScores);

    // Extract feedback.
    const feedback = extractFeedback(results);

    const totalDurationMs = Math.round(performance.now() - startTime);

    // Build summary.
    const inputSummary = input.content.length > this.maxSummaryLength
      ? input.content.slice(0, this.maxSummaryLength) + '…'
      : input.content;

    return {
      reportId: this.generateId(),
      generatedAt: this.now().toISOString(),
      inputSummary,
      validationResults: results,
      dimensionScores,
      overallScore,
      passed,
      totalDurationMs,
      feedback,
    };
  }

  /**
   * Format a quality report as a human-readable string.
   */
  static formatReport(report: QualityReport): string {
    const lines: string[] = [];
    lines.push(`# Quality Report: ${report.reportId}`);
    lines.push(`Generated: ${report.generatedAt}`);
    lines.push('');
    lines.push(`## Overall Score: ${report.overallScore}/100 ${report.passed ? '✅ PASS' : '❌ FAIL'}`);
    lines.push('');

    lines.push('## Dimension Scores');
    for (const ds of report.dimensionScores) {
      const icon = ds.passed ? '✅' : '⚠️';
      lines.push(`- ${icon} **${ds.name}**: ${ds.score}/100 (weight: ${(ds.weight * 100).toFixed(0)}%)`);
    }
    lines.push('');

    if (report.feedback.length > 0) {
      lines.push('## Feedback');
      for (const fb of report.feedback) {
        const icon = fb.severity === 'error' ? '🔴' : '🟡';
        lines.push(`- ${icon} [${fb.category}] ${fb.message}`);
        if (fb.suggestion) {
          lines.push(`  → ${fb.suggestion}`);
        }
      }
      lines.push('');
    }

    lines.push('## Validator Results');
    for (const vr of report.validationResults) {
      const icon = vr.passed ? '✅' : '❌';
      lines.push(`- ${icon} **${vr.validatorId}**: ${vr.score}/100 (${vr.durationMs}ms, ${vr.findings.length} findings)`);
    }

    return lines.join('\n');
  }
}

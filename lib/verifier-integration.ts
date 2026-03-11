/**
 * Verifier Integration — VentureOS QA Framework (P1 #31)
 *
 * Integration hooks connecting the QA framework to the Verifier role.
 * Provides:
 * - Pre-configured QA pipeline for common content types
 * - Automated feedback loop (validate → score → report → feedback)
 * - Quality report generation in Verifier-compatible format
 * - Artifact validation for mission deliverables
 */

import {
  QAFramework,
  type QAFrameworkConfig,
  type QualityReport,
  type ValidatorInput,
  type FeedbackItem,
} from './qa-framework';

import { MarkdownValidator } from './validators/markdown-validator';
import { JsonSchemaValidator } from './validators/json-schema-validator';
import { CompletenessChecker } from './validators/completeness-checker';
import { LinkChecker } from './validators/link-checker';
import { CodeSyntaxChecker } from './validators/code-syntax-checker';
import { createDefaultRubric, type QualityRubric } from './quality-rubric';

// ============================================================================
// Types
// ============================================================================

export interface VerifierConfig {
  /** Override QA framework config. */
  frameworkConfig?: Partial<QAFrameworkConfig>;
  /** Custom quality rubric. */
  rubric?: QualityRubric;
  /** Callback invoked after each validation with the report. */
  onReport?: (report: QualityReport) => void | Promise<void>;
  /** Callback for feedback delivery to the producing agent. */
  onFeedback?: (feedback: VerifierFeedback) => void | Promise<void>;
  /** Minimum score to auto-approve (skip manual review). Default: 80 */
  autoApproveThreshold?: number;
  /** Deterministic time source for tests. */
  now?: () => Date;
  /** Deterministic ID generator for tests. */
  generateId?: () => string;
}

export interface VerifierFeedback {
  /** Report this feedback is based on. */
  reportId: string;
  /** Agent that produced the output (if known). */
  agentId?: string;
  /** Overall verdict. */
  verdict: 'approve' | 'revise' | 'reject';
  /** Overall quality score. */
  score: number;
  /** Summary for the producing agent. */
  summary: string;
  /** Structured feedback items. */
  items: FeedbackItem[];
  /** Timestamp. */
  generatedAt: string;
}

export interface ArtifactValidationRequest {
  /** Mission identifier. */
  missionId: string;
  /** Artifacts to validate. */
  artifacts: Array<{
    name: string;
    content: string;
    contentType?: string;
    producedBy?: string;
  }>;
}

export interface ArtifactValidationResult {
  missionId: string;
  reports: Array<{
    artifactName: string;
    report: QualityReport;
    feedback: VerifierFeedback;
  }>;
  overallScore: number;
  overallVerdict: 'approve' | 'revise' | 'reject';
  generatedAt: string;
}

// ============================================================================
// Verifier QA Pipeline
// ============================================================================

export class VerifierQA {
  private readonly framework: QAFramework;
  private readonly rubric: QualityRubric;
  private readonly onReport?: (report: QualityReport) => void | Promise<void>;
  private readonly onFeedback?: (feedback: VerifierFeedback) => void | Promise<void>;
  private readonly autoApproveThreshold: number;
  private readonly now: () => Date;
  private readonly generateId: () => string;

  constructor(config: VerifierConfig = {}) {
    // Set up framework with all built-in validators.
    this.framework = new QAFramework({
      validators: [
        new MarkdownValidator(),
        new JsonSchemaValidator(),
        new CompletenessChecker(),
        new LinkChecker(),
        new CodeSyntaxChecker(),
      ],
      ...config.frameworkConfig,
      generateId: config.generateId,
      now: config.now,
    });

    this.rubric = config.rubric ?? createDefaultRubric();
    this.onReport = config.onReport;
    this.onFeedback = config.onFeedback;
    this.autoApproveThreshold = config.autoApproveThreshold ?? 80;
    this.now = config.now ?? (() => new Date());

    let idCounter = 0;
    this.generateId = config.generateId ?? (() => {
      idCounter++;
      return `vf-${Date.now()}-${idCounter}`;
    });
  }

  /**
   * Validate a single piece of content through the full QA pipeline.
   */
  async validate(input: ValidatorInput, agentId?: string): Promise<{
    report: QualityReport;
    feedback: VerifierFeedback;
  }> {
    // Step 1: Run QA framework validation.
    const report = await this.framework.validate(input);

    // Step 2: Apply rubric scoring.
    const rubricScores = this.rubric.scoreAll(input);

    // Merge rubric scores with validator-derived scores.
    // Use the lower of validator vs rubric for each dimension.
    for (const ds of report.dimensionScores) {
      const rubricScore = rubricScores[ds.dimensionId];
      if (rubricScore !== undefined) {
        ds.score = Math.min(ds.score, rubricScore);
        ds.weighted = ds.score * ds.weight;
        // Retain pass status based on a default threshold.
        const threshold = 60;
        ds.passed = ds.score >= threshold;
      }
    }

    // Recalculate overall score.
    const totalWeight = report.dimensionScores.reduce((s, d) => s + d.weight, 0);
    if (totalWeight > 0) {
      report.overallScore = Math.round(
        report.dimensionScores.reduce((s, d) => s + d.weighted, 0) / totalWeight
      );
    }

    // Step 3: Determine verdict.
    const verdict = this.determineVerdict(report);

    // Step 4: Generate feedback.
    const feedback = this.generateFeedback(report, verdict, agentId);

    // Step 5: Invoke callbacks.
    if (this.onReport) await this.onReport(report);
    if (this.onFeedback) await this.onFeedback(feedback);

    return { report, feedback };
  }

  /**
   * Validate multiple artifacts from a mission.
   */
  async validateArtifacts(request: ArtifactValidationRequest): Promise<ArtifactValidationResult> {
    const reports: ArtifactValidationResult['reports'] = [];

    for (const artifact of request.artifacts) {
      const contentType = artifact.contentType ?? this.inferContentType(artifact.name);
      const input: ValidatorInput = {
        content: artifact.content,
        contentType,
        filename: artifact.name,
      };

      const { report, feedback } = await this.validate(input, artifact.producedBy);
      reports.push({
        artifactName: artifact.name,
        report,
        feedback,
      });
    }

    // Compute overall scores.
    const overallScore = reports.length > 0
      ? Math.round(reports.reduce((s, r) => s + r.report.overallScore, 0) / reports.length)
      : 0;

    const overallVerdict = this.determineVerdictFromScore(overallScore);

    return {
      missionId: request.missionId,
      reports,
      overallScore,
      overallVerdict,
      generatedAt: this.now().toISOString(),
    };
  }

  /**
   * Format a full verification report for human review.
   */
  static formatVerificationReport(result: ArtifactValidationResult): string {
    const lines: string[] = [];
    lines.push(`# Mission Verification Report`);
    lines.push(`Mission: ${result.missionId}`);
    lines.push(`Generated: ${result.generatedAt}`);
    lines.push(`Overall Score: ${result.overallScore}/100 — **${result.overallVerdict.toUpperCase()}**`);
    lines.push('');

    for (const item of result.reports) {
      lines.push(`## ${item.artifactName}`);
      lines.push(`Score: ${item.report.overallScore}/100 — ${item.feedback.verdict}`);
      lines.push('');

      if (item.feedback.items.length > 0) {
        lines.push('### Feedback');
        for (const fb of item.feedback.items) {
          const icon = fb.severity === 'error' ? '🔴' : fb.severity === 'warning' ? '🟡' : 'ℹ️';
          lines.push(`- ${icon} [${fb.category}] ${fb.message}`);
          if (fb.suggestion) lines.push(`  → ${fb.suggestion}`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  // --- Private helpers ---

  private determineVerdict(report: QualityReport): 'approve' | 'revise' | 'reject' {
    return this.determineVerdictFromScore(report.overallScore);
  }

  private determineVerdictFromScore(score: number): 'approve' | 'revise' | 'reject' {
    if (score >= this.autoApproveThreshold) return 'approve';
    if (score >= 40) return 'revise';
    return 'reject';
  }

  private generateFeedback(
    report: QualityReport,
    verdict: 'approve' | 'revise' | 'reject',
    agentId?: string
  ): VerifierFeedback {
    const summaryParts: string[] = [];

    if (verdict === 'approve') {
      summaryParts.push('Output meets quality standards.');
    } else if (verdict === 'revise') {
      summaryParts.push('Output needs revision before approval.');
    } else {
      summaryParts.push('Output does not meet minimum quality bar.');
    }

    // Add dimension-specific notes.
    for (const ds of report.dimensionScores) {
      if (!ds.passed) {
        const level = this.rubric.getLevel(ds.dimensionId, ds.score);
        summaryParts.push(`${ds.name}: ${ds.score}/100 (${level?.label ?? 'below threshold'}).`);
      }
    }

    return {
      reportId: report.reportId,
      agentId,
      verdict,
      score: report.overallScore,
      summary: summaryParts.join(' '),
      items: report.feedback,
      generatedAt: this.now().toISOString(),
    };
  }

  private inferContentType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'md':
      case 'markdown':
        return 'markdown';
      case 'json':
        return 'json';
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'html':
      case 'htm':
        return 'html';
      default:
        return 'text';
    }
  }
}

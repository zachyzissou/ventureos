/**
 * QA Framework Tests — VentureOS (P1 #31)
 */

import {
  QAFramework,
  ScoringEngine,
  type Validator,
  type ValidatorInput,
  type ValidationResult,
  type QualityReport,
} from '../qa-framework';

// ============================================================================
// Test helpers
// ============================================================================

function makeValidator(
  id: string,
  score: number,
  dimension: string,
  passed = true,
  supportedTypes: string[] = []
): Validator {
  return {
    id,
    name: `Test Validator: ${id}`,
    supportedTypes,
    async validate(input: ValidatorInput): Promise<ValidationResult> {
      return {
        validatorId: id,
        passed,
        findings: passed
          ? []
          : [{ ruleId: `${id}.fail`, severity: 'error', message: 'Test failure' }],
        score,
        durationMs: 1,
        metadata: { dimension },
      };
    },
  };
}

const FIXED_DATE = new Date('2026-02-15T12:00:00Z');
let idSeq = 0;

function frameworkDefaults(overrides: Partial<Parameters<typeof QAFramework['prototype']['validate']>[0]> = {}) {
  return {
    now: () => FIXED_DATE,
    generateId: () => `test-${++idSeq}`,
    ...overrides,
  } as any;
}

// ============================================================================
// ScoringEngine
// ============================================================================

describe('ScoringEngine', () => {
  it('computes weighted overall score correctly', () => {
    const engine = new ScoringEngine({
      dimensions: [
        { dimensionId: 'a', name: 'A', weight: 0.5, passingThreshold: 60 },
        { dimensionId: 'b', name: 'B', weight: 0.5, passingThreshold: 60 },
      ],
      overallPassingThreshold: 60,
    });

    const result = engine.computeScores({ a: 80, b: 60 });
    expect(result.overallScore).toBe(70);
    expect(result.passed).toBe(true);
  });

  it('fails when overall score below threshold', () => {
    const engine = new ScoringEngine({
      dimensions: [
        { dimensionId: 'a', name: 'A', weight: 1, passingThreshold: 60 },
      ],
      overallPassingThreshold: 70,
    });

    const result = engine.computeScores({ a: 50 });
    expect(result.overallScore).toBe(50);
    expect(result.passed).toBe(false);
  });

  it('marks individual dimensions as failed when below threshold', () => {
    const engine = new ScoringEngine({
      dimensions: [
        { dimensionId: 'a', name: 'A', weight: 0.5, passingThreshold: 70 },
        { dimensionId: 'b', name: 'B', weight: 0.5, passingThreshold: 70 },
      ],
      overallPassingThreshold: 60,
    });

    const result = engine.computeScores({ a: 90, b: 50 });
    expect(result.dimensionScores[0].passed).toBe(true);
    expect(result.dimensionScores[1].passed).toBe(false);
  });

  it('clamps scores to 0–100 range', () => {
    const engine = new ScoringEngine({
      dimensions: [
        { dimensionId: 'a', name: 'A', weight: 1, passingThreshold: 50 },
      ],
      overallPassingThreshold: 50,
    });

    const result = engine.computeScores({ a: 150 });
    expect(result.dimensionScores[0].score).toBe(100);
  });

  it('defaults missing dimension scores to 0', () => {
    const engine = new ScoringEngine({
      dimensions: [
        { dimensionId: 'a', name: 'A', weight: 0.5, passingThreshold: 50 },
        { dimensionId: 'b', name: 'B', weight: 0.5, passingThreshold: 50 },
      ],
      overallPassingThreshold: 50,
    });

    const result = engine.computeScores({ a: 80 });
    expect(result.dimensionScores[1].score).toBe(0);
    expect(result.overallScore).toBe(40);
  });

  it('uses default config when none provided', () => {
    const engine = new ScoringEngine();
    const config = engine.getConfig();
    expect(config.dimensions).toHaveLength(4);
    expect(config.overallPassingThreshold).toBe(65);
  });
});

// ============================================================================
// QAFramework
// ============================================================================

describe('QAFramework', () => {
  beforeEach(() => {
    idSeq = 0;
  });

  it('runs validators and produces a report', async () => {
    const fw = new QAFramework({
      validators: [makeValidator('v1', 85, 'clarity')],
      ...frameworkDefaults(),
    });

    const report = await fw.validate({
      content: 'Hello world',
      contentType: 'markdown',
    });

    expect(report.reportId).toBe('test-1');
    expect(report.validationResults).toHaveLength(1);
    expect(report.validationResults[0].validatorId).toBe('v1');
    expect(report.passed).toBeDefined();
    expect(report.generatedAt).toBe(FIXED_DATE.toISOString());
  });

  it('filters validators by content type', async () => {
    const fw = new QAFramework({
      validators: [
        makeValidator('md-only', 90, 'clarity', true, ['markdown']),
        makeValidator('json-only', 90, 'accuracy', true, ['json']),
      ],
      ...frameworkDefaults(),
    });

    const report = await fw.validate({
      content: '# Hello',
      contentType: 'markdown',
    });

    expect(report.validationResults).toHaveLength(1);
    expect(report.validationResults[0].validatorId).toBe('md-only');
  });

  it('includes all validators when supportedTypes is empty', async () => {
    const fw = new QAFramework({
      validators: [
        makeValidator('universal', 80, 'completeness', true, []),
        makeValidator('md-only', 90, 'clarity', true, ['markdown']),
      ],
      ...frameworkDefaults(),
    });

    const report = await fw.validate({
      content: '# Hello',
      contentType: 'markdown',
    });

    expect(report.validationResults).toHaveLength(2);
  });

  it('extracts feedback from findings', async () => {
    const fw = new QAFramework({
      validators: [makeValidator('v1', 50, 'clarity', false)],
      ...frameworkDefaults(),
    });

    const report = await fw.validate({
      content: 'test',
      contentType: 'markdown',
    });

    expect(report.feedback.length).toBeGreaterThan(0);
    expect(report.feedback[0].category).toBe('v1');
    expect(report.feedback[0].severity).toBe('error');
  });

  it('truncates input summary for large content', async () => {
    const fw = new QAFramework({
      validators: [],
      maxSummaryLength: 20,
      ...frameworkDefaults(),
    });

    const report = await fw.validate({
      content: 'A'.repeat(100),
    });

    expect(report.inputSummary.length).toBeLessThanOrEqual(21); // 20 + '…'
  });

  it('adds and removes validators at runtime', () => {
    const fw = new QAFramework();
    const v = makeValidator('dynamic', 100, 'clarity');

    fw.addValidator(v);
    expect(fw.getValidators()).toHaveLength(1);

    const removed = fw.removeValidator('dynamic');
    expect(removed).toBe(true);
    expect(fw.getValidators()).toHaveLength(0);

    expect(fw.removeValidator('nonexistent')).toBe(false);
  });

  it('aggregates scores from multiple validators per dimension', async () => {
    const fw = new QAFramework({
      validators: [
        makeValidator('v1', 80, 'clarity'),
        makeValidator('v2', 60, 'clarity'),
      ],
      ...frameworkDefaults(),
    });

    const report = await fw.validate({ content: '# Test\n\nContent here.' });
    const clarityDim = report.dimensionScores.find((d) => d.dimensionId === 'clarity');
    expect(clarityDim).toBeDefined();
    // Average of 80 and 60 = 70.
    expect(clarityDim!.score).toBe(70);
  });

  it('defaults missing dimensions to 100', async () => {
    const fw = new QAFramework({
      validators: [makeValidator('v1', 80, 'clarity')],
      ...frameworkDefaults(),
    });

    const report = await fw.validate({ content: 'Test content' });
    const completeness = report.dimensionScores.find((d) => d.dimensionId === 'completeness');
    expect(completeness).toBeDefined();
    expect(completeness!.score).toBe(100); // No validators mapped to completeness.
  });

  describe('formatReport', () => {
    it('produces readable output', async () => {
      const fw = new QAFramework({
        validators: [makeValidator('v1', 85, 'clarity')],
        ...frameworkDefaults(),
      });

      const report = await fw.validate({ content: '# Test\n\nGood content.' });
      const formatted = QAFramework.formatReport(report);

      expect(formatted).toContain('Quality Report');
      expect(formatted).toContain('Overall Score');
      expect(formatted).toContain('Dimension Scores');
      expect(formatted).toContain('Validator Results');
    });

    it('includes feedback items when present', async () => {
      const fw = new QAFramework({
        validators: [makeValidator('v1', 50, 'clarity', false)],
        ...frameworkDefaults(),
      });

      const report = await fw.validate({ content: 'test' });
      const formatted = QAFramework.formatReport(report);

      expect(formatted).toContain('Feedback');
      expect(formatted).toContain('v1');
    });
  });
});

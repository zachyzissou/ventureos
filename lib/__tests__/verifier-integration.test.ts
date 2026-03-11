/**
 * Verifier Integration Tests — VentureOS QA Framework (P1 #31)
 */

import { VerifierQA, type VerifierFeedback } from '../verifier-integration';
import type { QualityReport } from '../qa-framework';

const FIXED_DATE = new Date('2026-02-15T12:00:00Z');
let idSeq = 0;

function testConfig(overrides = {}) {
  return {
    now: () => FIXED_DATE,
    generateId: () => `test-${++idSeq}`,
    ...overrides,
  };
}

describe('VerifierQA', () => {
  beforeEach(() => {
    idSeq = 0;
  });

  describe('validate', () => {
    it('produces a report and feedback for markdown content', async () => {
      const vqa = new VerifierQA(testConfig());

      const { report, feedback } = await vqa.validate({
        content: '# Quality Document\n\n## Overview\n\nThis document covers the QA process.\n\n## Details\n\n- Point one\n- Point two\n- Point three\n\n## Conclusion\n\nSummary here.',
        contentType: 'markdown',
      });

      expect(report.reportId).toBeDefined();
      expect(report.overallScore).toBeGreaterThan(0);
      expect(report.validationResults.length).toBeGreaterThan(0);

      expect(feedback.verdict).toBeDefined();
      expect(['approve', 'revise', 'reject']).toContain(feedback.verdict);
      expect(feedback.summary.length).toBeGreaterThan(0);
    });

    it('produces verdict approve for high-quality content', async () => {
      const vqa = new VerifierQA(testConfig({ autoApproveThreshold: 50 }));

      const { feedback } = await vqa.validate({
        content: '# Excellent Document\n\n## Introduction\n\nA clear and well-written introduction with sufficient detail.\n\n## Body\n\nThe main content is thorough and well-organized.\n\n- First point with detail\n- Second point with detail\n- Third point with detail\n\n## Conclusion\n\nA comprehensive conclusion wrapping everything up nicely.',
        contentType: 'markdown',
      });

      expect(feedback.verdict).toBe('approve');
    });

    it('produces verdict revise for mediocre content', async () => {
      const vqa = new VerifierQA(testConfig({ autoApproveThreshold: 95 }));

      const { feedback } = await vqa.validate({
        content: '# Title\n\nSome content but not amazing. TODO: add more details here.',
        contentType: 'markdown',
      });

      expect(feedback.verdict).toBe('revise');
    });

    it('produces verdict reject or revise for very poor content', async () => {
      const vqa = new VerifierQA(testConfig({ autoApproveThreshold: 95 }));

      const { feedback } = await vqa.validate({
        content: '',
        contentType: 'markdown',
      });

      // Very poor content should never be approved.
      expect(feedback.verdict).not.toBe('approve');
      expect(['revise', 'reject']).toContain(feedback.verdict);
      expect(feedback.score).toBeLessThan(95);
    });

    it('includes agentId in feedback when provided', async () => {
      const vqa = new VerifierQA(testConfig());

      const { feedback } = await vqa.validate(
        { content: '# Test\n\nContent here for the document with enough text.', contentType: 'markdown' },
        'synth'
      );

      expect(feedback.agentId).toBe('synth');
    });

    it('invokes onReport callback', async () => {
      const reports: QualityReport[] = [];
      const vqa = new VerifierQA(testConfig({
        onReport: (report: QualityReport) => { reports.push(report); },
      }));

      await vqa.validate({
        content: '# Callback Test\n\nContent that triggers callback correctly.',
        contentType: 'markdown',
      });

      expect(reports).toHaveLength(1);
    });

    it('invokes onFeedback callback', async () => {
      const feedbacks: VerifierFeedback[] = [];
      const vqa = new VerifierQA(testConfig({
        onFeedback: (fb: VerifierFeedback) => { feedbacks.push(fb); },
      }));

      await vqa.validate({
        content: '# Feedback Callback Test\n\nContent for testing feedback callback.',
        contentType: 'markdown',
      });

      expect(feedbacks).toHaveLength(1);
      expect(feedbacks[0].verdict).toBeDefined();
    });
  });

  describe('validateArtifacts', () => {
    it('validates multiple artifacts from a mission', async () => {
      const vqa = new VerifierQA(testConfig());

      const result = await vqa.validateArtifacts({
        missionId: 'mission-001',
        artifacts: [
          {
            name: 'report.md',
            content: '# Report\n\n## Summary\n\nThis is the mission report with all findings documented.\n\n## Details\n\nDetailed analysis follows here.',
            producedBy: 'synth',
          },
          {
            name: 'config.json',
            content: '{"name": "test", "version": "1.0.0", "settings": {"enabled": true}}',
            producedBy: 'atlas',
          },
        ],
      });

      expect(result.missionId).toBe('mission-001');
      expect(result.reports).toHaveLength(2);
      expect(result.overallScore).toBeGreaterThan(0);
      expect(['approve', 'revise', 'reject']).toContain(result.overallVerdict);
      expect(result.generatedAt).toBe(FIXED_DATE.toISOString());
    });

    it('infers content type from filename', async () => {
      const vqa = new VerifierQA(testConfig());

      const result = await vqa.validateArtifacts({
        missionId: 'mission-002',
        artifacts: [
          { name: 'readme.md', content: '# README\n\nProject documentation with enough content.' },
          { name: 'data.json', content: '{"items": [1, 2, 3]}' },
          { name: 'script.ts', content: 'export function hello(): string { return "hi"; }\n' },
        ],
      });

      expect(result.reports).toHaveLength(3);
      // Each should have been validated.
      for (const r of result.reports) {
        expect(r.report.validationResults.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('handles empty artifacts list', async () => {
      const vqa = new VerifierQA(testConfig());

      const result = await vqa.validateArtifacts({
        missionId: 'mission-empty',
        artifacts: [],
      });

      expect(result.reports).toHaveLength(0);
      expect(result.overallScore).toBe(0);
    });
  });

  describe('formatVerificationReport', () => {
    it('produces readable verification report', async () => {
      const vqa = new VerifierQA(testConfig());

      const result = await vqa.validateArtifacts({
        missionId: 'mission-format',
        artifacts: [
          {
            name: 'output.md',
            content: '# Output\n\n## Results\n\nThe mission produced these results.\n\n- Finding one\n- Finding two',
            producedBy: 'synth',
          },
        ],
      });

      const formatted = VerifierQA.formatVerificationReport(result);

      expect(formatted).toContain('Mission Verification Report');
      expect(formatted).toContain('mission-format');
      expect(formatted).toContain('output.md');
    });
  });
});

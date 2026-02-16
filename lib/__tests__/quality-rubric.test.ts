/**
 * Quality Rubric Tests — VentureOS QA Framework (P1 #31)
 */

import { createDefaultRubric, formatRubricReference } from '../quality-rubric';
import type { ValidatorInput } from '../qa-framework';

describe('Quality Rubric', () => {
  const rubric = createDefaultRubric();

  describe('createDefaultRubric', () => {
    it('has version', () => {
      expect(rubric.version).toBe('1.0.0');
    });

    it('has four dimensions', () => {
      expect(rubric.dimensions).toHaveLength(4);
      expect(rubric.dimensions.map((d) => d.id)).toEqual([
        'clarity', 'completeness', 'accuracy', 'consistency',
      ]);
    });

    it('each dimension has standard levels', () => {
      for (const dim of rubric.dimensions) {
        expect(dim.levels.length).toBeGreaterThanOrEqual(4);
        expect(dim.levels[0].min).toBe(0);
        expect(dim.levels[dim.levels.length - 1].max).toBe(100);
      }
    });
  });

  describe('getDimension', () => {
    it('returns dimension by id', () => {
      const clarity = rubric.getDimension('clarity');
      expect(clarity).toBeDefined();
      expect(clarity!.name).toBe('Clarity');
    });

    it('returns undefined for unknown id', () => {
      expect(rubric.getDimension('nonexistent')).toBeUndefined();
    });
  });

  describe('getLevel', () => {
    it('returns correct level for score', () => {
      const excellent = rubric.getLevel('clarity', 95);
      expect(excellent?.label).toBe('Excellent');

      const poor = rubric.getLevel('clarity', 10);
      expect(poor?.label).toBe('Poor');

      const good = rubric.getLevel('clarity', 72);
      expect(good?.label).toBe('Good');
    });

    it('returns undefined for unknown dimension', () => {
      expect(rubric.getLevel('fake', 50)).toBeUndefined();
    });
  });

  describe('scoreAll', () => {
    it('returns scores for all dimensions', () => {
      const input: ValidatorInput = {
        content: '# Title\n\n## Section\n\nThis is a well-structured document with multiple sections, lists, and clear language.\n\n- Item one\n- Item two\n- Item three\n\n## Another Section\n\nMore detailed content here.',
      };

      const scores = rubric.scoreAll(input);
      expect(Object.keys(scores)).toHaveLength(4);
      expect(scores.clarity).toBeDefined();
      expect(scores.completeness).toBeDefined();
      expect(scores.accuracy).toBeDefined();
      expect(scores.consistency).toBeDefined();
    });

    it('scores are in 0–100 range', () => {
      const input: ValidatorInput = {
        content: 'x',
      };

      const scores = rubric.scoreAll(input);
      for (const [, score] of Object.entries(scores)) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('Clarity scoring', () => {
    it('scores clear, readable content higher', () => {
      const clear: ValidatorInput = {
        content: '# Guide\n\n## Step One\n\nDo this first. It is simple.\n\n## Step Two\n\nThen do this next. Follow the instructions carefully.\n\n## Summary\n\nYou are done now.',
      };

      const unclear: ValidatorInput = {
        content: 'Antidisestablishmentarianism electroencephalographically supercalifragilisticexpialidocious pneumonoultramicroscopicsilicovolcanoconiosis.',
      };

      const clearScore = rubric.getDimension('clarity')!.score(clear);
      const unclearScore = rubric.getDimension('clarity')!.score(unclear);

      expect(clearScore).toBeGreaterThan(unclearScore);
    });

    it('rewards well-structured content', () => {
      const structured: ValidatorInput = {
        content: '# Title\n\n## Section A\n\nContent.\n\n## Section B\n\n- List item\n- Another item\n\n## Section C\n\nFinal thoughts.',
      };

      const flat: ValidatorInput = {
        content: 'Just a wall of text without any structure or organization at all.',
      };

      const structuredScore = rubric.getDimension('clarity')!.score(structured);
      const flatScore = rubric.getDimension('clarity')!.score(flat);

      expect(structuredScore).toBeGreaterThan(flatScore);
    });
  });

  describe('Completeness scoring', () => {
    it('scores longer content with more sections higher', () => {
      const complete: ValidatorInput = {
        content: '# Report\n\n' + '## Section\n\nDetailed content. '.repeat(50),
      };

      const sparse: ValidatorInput = {
        content: 'Brief.',
      };

      const completeScore = rubric.getDimension('completeness')!.score(complete);
      const sparseScore = rubric.getDimension('completeness')!.score(sparse);

      expect(completeScore).toBeGreaterThan(sparseScore);
    });
  });

  describe('Accuracy scoring', () => {
    it('penalizes placeholder text', () => {
      const accurate: ValidatorInput = {
        content: 'The system processes requests at 500 req/s with 99.9% uptime.',
      };

      const placeholder: ValidatorInput = {
        content: 'TODO: fill this in. See example.com for placeholder. FIXME later. TBD values.',
      };

      const accurateScore = rubric.getDimension('accuracy')!.score(accurate);
      const placeholderScore = rubric.getDimension('accuracy')!.score(placeholder);

      expect(accurateScore).toBeGreaterThan(placeholderScore);
    });
  });

  describe('Consistency scoring', () => {
    it('penalizes mixed list markers', () => {
      const consistent: ValidatorInput = {
        content: '- Item one\n- Item two\n- Item three',
      };

      const mixed: ValidatorInput = {
        content: '- Item one\n* Item two\n+ Item three',
      };

      const consistentScore = rubric.getDimension('consistency')!.score(consistent);
      const mixedScore = rubric.getDimension('consistency')!.score(mixed);

      expect(consistentScore).toBeGreaterThan(mixedScore);
    });
  });

  describe('formatRubricReference', () => {
    it('produces a readable reference document', () => {
      const reference = formatRubricReference(rubric);

      expect(reference).toContain('Quality Rubric Reference');
      expect(reference).toContain('Clarity');
      expect(reference).toContain('Completeness');
      expect(reference).toContain('Accuracy');
      expect(reference).toContain('Consistency');
      expect(reference).toContain('Excellent');
      expect(reference).toContain('Poor');
    });
  });
});

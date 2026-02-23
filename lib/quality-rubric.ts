/**
 * Quality Rubric — VentureOS QA Framework (P1 #31)
 *
 * Defines scoring rubrics for output quality dimensions:
 * - Clarity: readability, structure, conciseness
 * - Completeness: coverage of required elements
 * - Accuracy: correctness, valid syntax, proper references
 * - Consistency: style compliance, formatting uniformity
 *
 * Each rubric provides both automated scoring functions and
 * human-readable criteria for review.
 */

import type { ValidatorInput, ValidationFinding } from './qa-framework';

// ============================================================================
// Types
// ============================================================================

export interface RubricLevel {
  /** Score range minimum. */
  min: number;
  /** Score range maximum. */
  max: number;
  /** Label for this level. */
  label: string;
  /** Description of what this level means. */
  description: string;
}

export interface RubricDimension {
  /** Dimension identifier. */
  id: string;
  /** Display name. */
  name: string;
  /** What this dimension measures. */
  description: string;
  /** Scoring levels from lowest to highest. */
  levels: RubricLevel[];
  /** Automated scoring function. Returns 0–100. */
  score(input: ValidatorInput): number;
}

export interface QualityRubric {
  /** Rubric version for tracking changes. */
  version: string;
  /** All dimensions in this rubric. */
  dimensions: RubricDimension[];
  /** Get a dimension by ID. */
  getDimension(id: string): RubricDimension | undefined;
  /** Score all dimensions for an input. */
  scoreAll(input: ValidatorInput): Record<string, number>;
  /** Get the level label for a score in a dimension. */
  getLevel(dimensionId: string, score: number): RubricLevel | undefined;
}

// ============================================================================
// Scoring Helpers
// ============================================================================

/**
 * Compute Flesch-Kincaid readability grade level approximation.
 * Lower is more readable. Returns score 0–100 where 100 = most readable.
 */
function readabilityScore(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);

  if (sentences.length === 0 || words.length === 0) return 50;

  const avgWordsPerSentence = words.length / sentences.length;
  const avgSyllablesPerWord = syllables / words.length;

  // Flesch Reading Ease: 206.835 − 1.015 × (words/sentences) − 84.6 × (syllables/words)
  const flesch = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;

  // Clamp to 0–100.
  return Math.max(0, Math.min(100, Math.round(flesch)));
}

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;

  let count = 0;
  const vowels = 'aeiouy';
  let prevIsVowel = false;

  for (const ch of w) {
    const isVowel = vowels.includes(ch);
    if (isVowel && !prevIsVowel) count++;
    prevIsVowel = isVowel;
  }

  // Adjustments.
  if (w.endsWith('e') && count > 1) count--;
  if (w.endsWith('le') && w.length > 3 && !vowels.includes(w[w.length - 3])) count++;

  return Math.max(1, count);
}

/**
 * Measure content structure quality.
 * Checks for headings, lists, paragraphs, and organized structure.
 */
function structureScore(text: string): number {
  let score = 50; // Baseline.
  const lines = text.split('\n');

  // Headings.
  const headingCount = lines.filter((l) => /^#{1,6}\s/.test(l)).length;
  if (headingCount > 0) score += 15;
  if (headingCount >= 3) score += 5;

  // Lists.
  const listCount = lines.filter((l) => /^\s*[-*+]\s/.test(l) || /^\s*\d+\.\s/.test(l)).length;
  if (listCount > 0) score += 10;

  // Code blocks.
  const codeBlockCount = (text.match(/```/g) ?? []).length / 2;
  if (codeBlockCount > 0) score += 5;

  // Paragraphs (blocks of text separated by blank lines).
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  if (paragraphs.length >= 3) score += 10;

  // Penalize very long paragraphs (wall of text).
  const longParagraphs = paragraphs.filter((p) => p.split(/\s+/).length > 200);
  score -= longParagraphs.length * 10;

  return Math.max(0, Math.min(100, score));
}

/**
 * Measure consistency of formatting style.
 */
function consistencyScore(text: string): number {
  let score = 80; // Start high; deduct for inconsistencies.
  const lines = text.split('\n');

  // Check for mixed list markers.
  const listMarkers = new Set<string>();
  for (const line of lines) {
    const match = line.match(/^\s*([-*+])\s/);
    if (match) listMarkers.add(match[1]);
  }
  if (listMarkers.size > 1) score -= 10;

  // Check heading style consistency (ATX vs Setext).
  const atxHeadings = lines.filter((l) => /^#{1,6}\s/.test(l)).length;
  const setextHeadings = lines.filter((l, i) =>
    i > 0 && /^[=-]+$/.test(l.trim()) && lines[i - 1].trim().length > 0
  ).length;
  if (atxHeadings > 0 && setextHeadings > 0) score -= 15;

  // Check indentation consistency.
  const indents = new Set<number>();
  for (const line of lines) {
    if (line.trim().length > 0) {
      const leadingSpaces = line.match(/^(\s*)/)?.[1].length ?? 0;
      if (leadingSpaces > 0) indents.add(leadingSpaces);
    }
  }
  // Many different indentation levels might indicate inconsistency.
  if (indents.size > 8) score -= 10;

  // Trailing whitespace.
  const trailingWS = lines.filter((l) => /\s+$/.test(l) && l.trim().length > 0).length;
  if (trailingWS > lines.length * 0.1) score -= 5;

  return Math.max(0, Math.min(100, score));
}

/**
 * Approximate accuracy score based on structural validity.
 * Real accuracy scoring would require domain knowledge or reference data.
 */
function accuracyScore(text: string): number {
  let score = 85; // Baseline assumes content is likely correct.

  // Check for placeholder text that suggests incomplete work.
  const placeholders = [
    /\bTODO\b/gi,
    /\bFIXME\b/gi,
    /\bXXX\b/gi,
    /\bTBD\b/gi,
    /\blorem ipsum\b/gi,
    /\bplaceholder\b/gi,
    /\bexample\.com\b/gi,
  ];

  for (const pattern of placeholders) {
    const matches = text.match(pattern);
    if (matches) {
      score -= matches.length * 5;
    }
  }

  // Check for unclosed brackets/braces (sign of code errors).
  const opens = (text.match(/[({[]/g) ?? []).length;
  const closes = (text.match(/[)}\]]/g) ?? []).length;
  if (Math.abs(opens - closes) > 2) {
    score -= 15;
  }

  return Math.max(0, Math.min(100, score));
}

// ============================================================================
// Rubric Levels
// ============================================================================

const STANDARD_LEVELS: RubricLevel[] = [
  { min: 0, max: 29, label: 'Poor', description: 'Significant issues; requires major revision.' },
  { min: 30, max: 49, label: 'Below Average', description: 'Notable gaps; needs substantial improvement.' },
  { min: 50, max: 64, label: 'Acceptable', description: 'Meets minimum bar but has room for improvement.' },
  { min: 65, max: 79, label: 'Good', description: 'Solid quality with minor improvements possible.' },
  { min: 80, max: 89, label: 'Very Good', description: 'High quality; few issues.' },
  { min: 90, max: 100, label: 'Excellent', description: 'Outstanding quality; publication-ready.' },
];

// ============================================================================
// Default Rubric
// ============================================================================

export function createDefaultRubric(): QualityRubric {
  const dimensions: RubricDimension[] = [
    {
      id: 'clarity',
      name: 'Clarity',
      description: 'How clear, readable, and well-structured is the output? Includes readability metrics, logical organization, and conciseness.',
      levels: STANDARD_LEVELS,
      score(input) {
        const readable = readabilityScore(input.content);
        const structure = structureScore(input.content);
        // Weighted average: readability 60%, structure 40%.
        return Math.round(readable * 0.6 + structure * 0.4);
      },
    },
    {
      id: 'completeness',
      name: 'Completeness',
      description: 'Does the output cover all required elements? Includes section presence, metadata, and sufficient detail.',
      levels: STANDARD_LEVELS,
      score(input) {
        const content = input.content;
        let score = 50;

        // Length-based completeness.
        const wordCount = content.split(/\s+/).length;
        if (wordCount >= 100) score += 15;
        if (wordCount >= 300) score += 10;
        if (wordCount >= 500) score += 5;

        // Section-based (headings).
        const headings = (content.match(/^#{1,6}\s/gm) ?? []).length;
        if (headings >= 1) score += 5;
        if (headings >= 3) score += 5;
        if (headings >= 5) score += 5;

        // Has lists (organized information).
        if (/^\s*[-*+]\s/m.test(content) || /^\s*\d+\.\s/m.test(content)) score += 5;

        return Math.max(0, Math.min(100, score));
      },
    },
    {
      id: 'accuracy',
      name: 'Accuracy',
      description: 'Is the content correct, valid, and properly referenced? Includes syntax validity, link correctness, and factual markers.',
      levels: STANDARD_LEVELS,
      score(input) {
        return accuracyScore(input.content);
      },
    },
    {
      id: 'consistency',
      name: 'Consistency',
      description: 'Does the output follow consistent style guidelines? Includes formatting uniformity, list style, and heading conventions.',
      levels: STANDARD_LEVELS,
      score(input) {
        return consistencyScore(input.content);
      },
    },
  ];

  return {
    version: '1.0.0',
    dimensions,

    getDimension(id: string) {
      return dimensions.find((d) => d.id === id);
    },

    scoreAll(input: ValidatorInput) {
      const scores: Record<string, number> = {};
      for (const dim of dimensions) {
        scores[dim.id] = dim.score(input);
      }
      return scores;
    },

    getLevel(dimensionId: string, score: number) {
      const dim = dimensions.find((d) => d.id === dimensionId);
      if (!dim) return undefined;
      return dim.levels.find((l) => score >= l.min && score <= l.max);
    },
  };
}

/**
 * Format rubric criteria as a human-readable reference document.
 */
export function formatRubricReference(rubric: QualityRubric): string {
  const lines: string[] = [];
  lines.push(`# Quality Rubric Reference (v${rubric.version})`);
  lines.push('');

  for (const dim of rubric.dimensions) {
    lines.push(`## ${dim.name}`);
    lines.push(dim.description);
    lines.push('');
    lines.push('| Score Range | Level | Description |');
    lines.push('|------------|-------|-------------|');
    for (const level of dim.levels) {
      lines.push(`| ${level.min}–${level.max} | ${level.label} | ${level.description} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Completeness Checker — VentureOS QA Framework (P1 #31)
 *
 * Validates that agent output includes all required sections,
 * metadata, and structural elements.
 *
 * Supports:
 * - Required section detection (by heading or keyword)
 * - Metadata presence checking (frontmatter, JSON fields)
 * - Minimum content length validation
 * - Required field validation for structured data
 */

import type { Validator, ValidatorInput, ValidationResult, ValidationFinding } from '../qa-framework';

/** A required section or field that must appear in the output. */
export interface RequiredSection {
  /** Identifier for this requirement. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Patterns to look for (case-insensitive). Match any = present. */
  patterns: string[];
  /** Whether this section is strictly required (error) or recommended (warning). */
  required: boolean;
  /** Minimum content length for this section (characters following the header). */
  minLength?: number;
}

export interface CompletenessCheckerConfig {
  /** Sections/fields to check for. */
  requiredSections?: RequiredSection[];
  /** Minimum total content length. Default: 50 */
  minContentLength?: number;
  /** Maximum total content length (warns if exceeded). Default: none */
  maxContentLength?: number;
  /** Scoring dimension. Default: 'completeness' */
  dimension?: string;
}

const DEFAULT_SECTIONS: RequiredSection[] = [
  {
    id: 'title',
    name: 'Title/Header',
    patterns: ['^#\\s+'],
    required: true,
  },
  {
    id: 'description',
    name: 'Description/Overview',
    patterns: ['description', 'overview', 'summary', 'introduction'],
    required: false,
  },
];

export class CompletenessChecker implements Validator {
  readonly id = 'completeness';
  readonly name = 'Completeness Checker';
  readonly supportedTypes: string[] = []; // Applies to all types.

  private readonly requiredSections: RequiredSection[];
  private readonly minContentLength: number;
  private readonly maxContentLength: number | undefined;
  private readonly dimension: string;

  constructor(config: CompletenessCheckerConfig = {}) {
    this.requiredSections = config.requiredSections ?? DEFAULT_SECTIONS;
    this.minContentLength = config.minContentLength ?? 50;
    this.maxContentLength = config.maxContentLength;
    this.dimension = config.dimension ?? 'completeness';
  }

  async validate(input: ValidatorInput): Promise<ValidationResult> {
    const start = performance.now();
    const findings: ValidationFinding[] = [];
    const content = input.content;

    // --- Content length checks ---
    if (content.trim().length < this.minContentLength) {
      findings.push({
        ruleId: 'completeness.content.too-short',
        severity: 'error',
        message: `Content is too short (${content.trim().length} chars). Minimum: ${this.minContentLength}.`,
        suggestion: 'Add more detail and substance to the output.',
      });
    }

    if (this.maxContentLength && content.length > this.maxContentLength) {
      findings.push({
        ruleId: 'completeness.content.too-long',
        severity: 'warning',
        message: `Content exceeds maximum length (${content.length} chars). Maximum: ${this.maxContentLength}.`,
        suggestion: 'Consider condensing or splitting the content.',
      });
    }

    // --- Required section checks ---
    let sectionsFound = 0;
    const totalRequired = this.requiredSections.filter((s) => s.required).length;

    for (const section of this.requiredSections) {
      const found = this.sectionPresent(content, section);

      if (found) {
        sectionsFound++;
        // Check minimum section length if specified.
        if (section.minLength) {
          const sectionContent = this.extractSectionContent(content, section);
          if (sectionContent !== null && sectionContent.length < section.minLength) {
            findings.push({
              ruleId: `completeness.section.${section.id}.too-short`,
              severity: 'warning',
              message: `Section "${section.name}" is too short (${sectionContent.length} chars, minimum: ${section.minLength}).`,
              suggestion: `Expand the "${section.name}" section with more detail.`,
            });
          }
        }
      } else {
        findings.push({
          ruleId: `completeness.section.${section.id}.missing`,
          severity: section.required ? 'error' : 'warning',
          message: `${section.required ? 'Required' : 'Recommended'} section "${section.name}" not found.`,
          suggestion: `Add a "${section.name}" section to the output.`,
        });
      }
    }

    // --- Metadata checks (frontmatter for markdown) ---
    if (input.contentType === 'markdown' || input.contentType === 'md') {
      this.checkFrontmatter(content, findings);
    }

    // --- Compute score ---
    const totalSections = this.requiredSections.length;
    const sectionScore = totalSections > 0
      ? Math.round((sectionsFound / totalSections) * 60)
      : 60;

    const lengthScore = content.trim().length >= this.minContentLength ? 40 : 
      Math.round((content.trim().length / this.minContentLength) * 40);

    const baseScore = sectionScore + lengthScore;
    const errorCount = findings.filter((f) => f.severity === 'error').length;
    const warningCount = findings.filter((f) => f.severity === 'warning').length;
    const score = Math.max(0, baseScore - errorCount * 10 - warningCount * 3);

    return {
      validatorId: this.id,
      passed: errorCount === 0,
      findings,
      score,
      durationMs: Math.round(performance.now() - start),
      metadata: {
        dimension: this.dimension,
        sectionsFound,
        totalSections,
        totalRequired,
        contentLength: content.trim().length,
      },
    };
  }

  private sectionPresent(content: string, section: RequiredSection): boolean {
    for (const pattern of section.patterns) {
      try {
        const re = new RegExp(pattern, 'im');
        if (re.test(content)) return true;
      } catch {
        // Fallback to substring match if pattern isn't valid regex.
        if (content.toLowerCase().includes(pattern.toLowerCase())) return true;
      }
    }
    return false;
  }

  private extractSectionContent(content: string, section: RequiredSection): string | null {
    // Try to find a heading matching the section and extract text until next heading.
    for (const pattern of section.patterns) {
      try {
        const headerRe = new RegExp(`^(#{1,6})\\s+.*${pattern}.*$`, 'im');
        const match = headerRe.exec(content);
        if (match) {
          const afterHeader = content.slice(match.index + match[0].length);
          const nextHeader = afterHeader.search(/^#{1,6}\s/m);
          const sectionText = nextHeader === -1
            ? afterHeader
            : afterHeader.slice(0, nextHeader);
          return sectionText.trim();
        }
      } catch {
        // Ignore regex errors.
      }
    }
    return null;
  }

  private checkFrontmatter(content: string, findings: ValidationFinding[]): void {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      // Frontmatter is optional — just note its absence.
      findings.push({
        ruleId: 'completeness.frontmatter.missing',
        severity: 'info',
        message: 'No YAML frontmatter detected.',
      });
    }
  }
}

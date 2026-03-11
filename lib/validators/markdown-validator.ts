/**
 * Markdown Validator — VentureOS QA Framework (P1 #31)
 *
 * Validates markdown content for structural correctness:
 * - Header hierarchy (H1 present, no level skipping)
 * - List formatting
 * - Code block closure
 * - Link syntax
 * - Consistent header style
 */

import type { Validator, ValidatorInput, ValidationResult, ValidationFinding } from '../qa-framework';

export interface MarkdownValidatorConfig {
  /** Require exactly one H1 header. Default: true */
  requireH1?: boolean;
  /** Maximum heading level allowed (1–6). Default: 6 */
  maxHeadingLevel?: number;
  /** Check for skipped heading levels (e.g. H1 → H3). Default: true */
  checkHeadingHierarchy?: boolean;
  /** Check for unclosed code blocks. Default: true */
  checkCodeBlocks?: boolean;
  /** Check for broken link syntax. Default: true */
  checkLinks?: boolean;
  /** Scoring dimension this validator maps to. Default: 'clarity' */
  dimension?: string;
}

interface HeadingInfo {
  level: number;
  line: number;
  text: string;
}

export class MarkdownValidator implements Validator {
  readonly id = 'markdown';
  readonly name = 'Markdown Validator';
  readonly supportedTypes = ['markdown', 'md'];

  private readonly config: Required<MarkdownValidatorConfig>;

  constructor(config: MarkdownValidatorConfig = {}) {
    this.config = {
      requireH1: config.requireH1 ?? true,
      maxHeadingLevel: config.maxHeadingLevel ?? 6,
      checkHeadingHierarchy: config.checkHeadingHierarchy ?? true,
      checkCodeBlocks: config.checkCodeBlocks ?? true,
      checkLinks: config.checkLinks ?? true,
      dimension: config.dimension ?? 'clarity',
    };
  }

  async validate(input: ValidatorInput): Promise<ValidationResult> {
    const start = performance.now();
    const findings: ValidationFinding[] = [];
    const lines = input.content.split('\n');

    // --- Heading analysis ---
    const headings = this.extractHeadings(lines);

    if (this.config.requireH1) {
      const h1Count = headings.filter((h) => h.level === 1).length;
      if (h1Count === 0) {
        findings.push({
          ruleId: 'markdown.header.missing-h1',
          severity: 'warning',
          message: 'Document has no H1 heading.',
          suggestion: 'Add a top-level heading (# Title) at the beginning of the document.',
        });
      } else if (h1Count > 1) {
        findings.push({
          ruleId: 'markdown.header.multiple-h1',
          severity: 'warning',
          message: `Document has ${h1Count} H1 headings; typically only one is expected.`,
          line: headings.filter((h) => h.level === 1)[1]?.line,
          suggestion: 'Use H2 or lower for sub-sections.',
        });
      }
    }

    // Check heading levels don't exceed max.
    for (const h of headings) {
      if (h.level > this.config.maxHeadingLevel) {
        findings.push({
          ruleId: 'markdown.header.level-too-deep',
          severity: 'warning',
          message: `Heading level ${h.level} exceeds maximum allowed level ${this.config.maxHeadingLevel}.`,
          line: h.line,
        });
      }
    }

    // Check heading hierarchy (no skipping levels).
    if (this.config.checkHeadingHierarchy && headings.length > 1) {
      for (let i = 1; i < headings.length; i++) {
        const prev = headings[i - 1];
        const curr = headings[i];
        if (curr.level > prev.level + 1) {
          findings.push({
            ruleId: 'markdown.header.skipped-level',
            severity: 'warning',
            message: `Heading jumps from H${prev.level} to H${curr.level} (skipped H${prev.level + 1}).`,
            line: curr.line,
            suggestion: `Consider using H${prev.level + 1} instead, or restructure the heading hierarchy.`,
          });
        }
      }
    }

    // --- Code block analysis ---
    if (this.config.checkCodeBlocks) {
      this.checkCodeBlocks(lines, findings);
    }

    // --- Link syntax analysis ---
    if (this.config.checkLinks) {
      this.checkLinkSyntax(lines, findings);
    }

    // --- List formatting ---
    this.checkListFormatting(lines, findings);

    // Compute score.
    const errorCount = findings.filter((f) => f.severity === 'error').length;
    const warningCount = findings.filter((f) => f.severity === 'warning').length;
    const score = Math.max(0, 100 - errorCount * 15 - warningCount * 5);

    return {
      validatorId: this.id,
      passed: errorCount === 0,
      findings,
      score,
      durationMs: Math.round(performance.now() - start),
      metadata: {
        dimension: this.config.dimension,
        headingCount: headings.length,
        lineCount: lines.length,
      },
    };
  }

  private extractHeadings(lines: string[]): HeadingInfo[] {
    const headings: HeadingInfo[] = [];
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Track code blocks to avoid false positives.
      if (/^```/.test(line.trim())) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;

      const match = line.match(/^(#{1,6})\s+(.+)/);
      if (match) {
        headings.push({
          level: match[1].length,
          line: i + 1,
          text: match[2].trim(),
        });
      }
    }

    return headings;
  }

  private checkCodeBlocks(lines: string[], findings: ValidationFinding[]): void {
    let openLine = -1;
    let openLang = '';

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const fenceMatch = trimmed.match(/^(`{3,})(.*)/);

      if (fenceMatch) {
        if (openLine === -1) {
          // Opening fence.
          openLine = i + 1;
          openLang = fenceMatch[2].trim();
        } else {
          // Closing fence.
          openLine = -1;
          openLang = '';
        }
      }
    }

    if (openLine !== -1) {
      findings.push({
        ruleId: 'markdown.codeblock.unclosed',
        severity: 'error',
        message: `Unclosed code block starting at line ${openLine}${openLang ? ` (${openLang})` : ''}.`,
        line: openLine,
        suggestion: 'Add a closing ``` fence.',
      });
    }
  }

  private checkLinkSyntax(lines: string[], findings: ValidationFinding[]): void {
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^```/.test(line.trim())) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;

      // Check for broken markdown link syntax: [text](url)
      // Look for [text]( without closing ) on the same bracket group.
      const linkPattern = /\[([^\]]*)\]\(([^)]*)\)/g;
      let match: RegExpExecArray | null;
      while ((match = linkPattern.exec(line)) !== null) {
        const url = match[2].trim();
        if (url === '') {
          findings.push({
            ruleId: 'markdown.link.empty-url',
            severity: 'warning',
            message: `Empty URL in link "[${match[1]}]()" at line ${i + 1}.`,
            line: i + 1,
            column: match.index + 1,
            suggestion: 'Provide a valid URL or remove the link.',
          });
        }
      }

      // Detect unmatched brackets (potential broken links) — simple heuristic.
      // Look for [text] not followed by ( — could be a reference-style link, so only warn.
      const bracketOnly = /\[([^\]]+)\](?!\(|:|\[)/g;
      let bm: RegExpExecArray | null;
      while ((bm = bracketOnly.exec(line)) !== null) {
        // Skip if this looks like a checkbox.
        if (/^\[[ xX]\]/.test(bm[0])) continue;
        // Skip footnote references like [^1].
        if (/^\[\^/.test(bm[0])) continue;

        findings.push({
          ruleId: 'markdown.link.possible-broken',
          severity: 'info',
          message: `Possible broken link reference "[${bm[1]}]" at line ${i + 1}.`,
          line: i + 1,
          column: bm.index + 1,
        });
      }
    }
  }

  private checkListFormatting(lines: string[], findings: ValidationFinding[]): void {
    let inCodeBlock = false;
    let prevListStyle: 'dash' | 'asterisk' | 'plus' | null = null;
    let listStartLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^```/.test(line.trim())) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;

      const listMatch = line.match(/^(\s*)([-*+])\s/);
      if (listMatch) {
        const style = listMatch[2] === '-' ? 'dash'
          : listMatch[2] === '*' ? 'asterisk'
          : 'plus';

        if (prevListStyle === null) {
          prevListStyle = style;
          listStartLine = i + 1;
        } else if (style !== prevListStyle) {
          findings.push({
            ruleId: 'markdown.list.mixed-markers',
            severity: 'info',
            message: `Mixed list markers: using '${listMatch[2]}' at line ${i + 1} but list started with '${prevListStyle === 'dash' ? '-' : prevListStyle === 'asterisk' ? '*' : '+'}' at line ${listStartLine}.`,
            line: i + 1,
            suggestion: 'Use consistent list markers throughout a list.',
          });
        }
      } else if (line.trim() === '') {
        // Reset list tracking on blank lines.
        prevListStyle = null;
        listStartLine = -1;
      }
    }
  }
}

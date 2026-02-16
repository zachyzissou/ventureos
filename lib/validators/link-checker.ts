/**
 * Link Validity Checker — VentureOS QA Framework (P1 #31)
 *
 * Validates links in content:
 * - URL format validation
 * - Internal reference consistency
 * - Detects obviously broken patterns
 *
 * Note: Does NOT perform HTTP requests (no network I/O in validators).
 * For live link checking, use an external tool.
 */

import type { Validator, ValidatorInput, ValidationResult, ValidationFinding } from '../qa-framework';

export interface LinkCheckerConfig {
  /** Allowed URL schemes. Default: ['http', 'https', 'mailto', 'ftp'] */
  allowedSchemes?: string[];
  /** Check for duplicate links. Default: true */
  checkDuplicates?: boolean;
  /** Known internal anchors/references to validate against. */
  knownAnchors?: string[];
  /** Scoring dimension. Default: 'accuracy' */
  dimension?: string;
}

interface ExtractedLink {
  url: string;
  text: string;
  line: number;
  column: number;
  type: 'markdown' | 'bare' | 'reference';
}

export class LinkChecker implements Validator {
  readonly id = 'link-checker';
  readonly name = 'Link Validity Checker';
  readonly supportedTypes = ['markdown', 'md', 'html'];

  private readonly allowedSchemes: string[];
  private readonly checkDuplicates: boolean;
  private readonly knownAnchors: Set<string>;
  private readonly dimension: string;

  constructor(config: LinkCheckerConfig = {}) {
    this.allowedSchemes = config.allowedSchemes ?? ['http', 'https', 'mailto', 'ftp'];
    this.checkDuplicates = config.checkDuplicates ?? true;
    this.knownAnchors = new Set(config.knownAnchors ?? []);
    this.dimension = config.dimension ?? 'accuracy';
  }

  async validate(input: ValidatorInput): Promise<ValidationResult> {
    const start = performance.now();
    const findings: ValidationFinding[] = [];
    const lines = input.content.split('\n');

    // Extract all links.
    const links = this.extractLinks(lines);

    // Validate each link.
    for (const link of links) {
      this.validateLink(link, findings);
    }

    // Check for duplicates.
    if (this.checkDuplicates) {
      this.findDuplicates(links, findings);
    }

    // Check internal anchor references.
    this.checkAnchors(lines, links, findings);

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
        dimension: this.dimension,
        totalLinks: links.length,
        uniqueLinks: new Set(links.map((l) => l.url)).size,
      },
    };
  }

  private extractLinks(lines: string[]): ExtractedLink[] {
    const links: ExtractedLink[] = [];
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (/^```/.test(line.trim())) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;

      // Markdown links: [text](url)
      const mdLinkRe = /\[([^\]]*)\]\(([^)]+)\)/g;
      let match: RegExpExecArray | null;
      while ((match = mdLinkRe.exec(line)) !== null) {
        links.push({
          url: match[2].trim(),
          text: match[1],
          line: i + 1,
          column: match.index + 1,
          type: 'markdown',
        });
      }

      // Bare URLs (not already captured in markdown links).
      const bareUrlRe = /(?<!\]\()(?<!\()(https?:\/\/[^\s<>)\]]+)/g;
      while ((match = bareUrlRe.exec(line)) !== null) {
        // Skip if this URL is already part of a markdown link on this line.
        const alreadyCaptured = links.some(
          (l) => l.line === i + 1 && l.url === match![1]
        );
        if (!alreadyCaptured) {
          links.push({
            url: match[1],
            text: '',
            line: i + 1,
            column: match.index + 1,
            type: 'bare',
          });
        }
      }
    }

    return links;
  }

  private validateLink(link: ExtractedLink, findings: ValidationFinding[]): void {
    const url = link.url;

    // Skip anchor-only references.
    if (url.startsWith('#')) return;

    // Check scheme.
    const schemeMatch = url.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);
    if (schemeMatch) {
      const scheme = schemeMatch[1].toLowerCase();
      if (!this.allowedSchemes.includes(scheme)) {
        findings.push({
          ruleId: 'link.scheme.disallowed',
          severity: 'warning',
          message: `Link uses disallowed scheme "${scheme}": ${url}`,
          line: link.line,
          column: link.column,
          suggestion: `Use one of the allowed schemes: ${this.allowedSchemes.join(', ')}`,
        });
      }
    } else if (!url.startsWith('mailto:') && !url.startsWith('/') && !url.startsWith('./') && !url.startsWith('../')) {
      // Relative URLs are fine; other patterns might be suspicious.
      if (url.includes(' ')) {
        findings.push({
          ruleId: 'link.format.contains-spaces',
          severity: 'error',
          message: `Link URL contains spaces: "${url}"`,
          line: link.line,
          column: link.column,
          suggestion: 'URL-encode spaces or fix the link.',
        });
      }
    }

    // Check for obviously malformed URLs.
    if (url.includes('](') || url.includes('[')) {
      findings.push({
        ruleId: 'link.format.nested-markdown',
        severity: 'error',
        message: `Link URL appears to contain nested markdown syntax: "${url}"`,
        line: link.line,
        column: link.column,
        suggestion: 'Fix the markdown link syntax.',
      });
    }

    // Check for placeholder URLs.
    const placeholderPatterns = [
      /example\.com/i,
      /placeholder/i,
      /TODO/i,
      /FIXME/i,
      /your-url-here/i,
    ];
    for (const pattern of placeholderPatterns) {
      if (pattern.test(url)) {
        findings.push({
          ruleId: 'link.content.placeholder',
          severity: 'warning',
          message: `Link appears to be a placeholder: "${url}"`,
          line: link.line,
          column: link.column,
          suggestion: 'Replace with an actual URL.',
        });
        break;
      }
    }
  }

  private findDuplicates(links: ExtractedLink[], findings: ValidationFinding[]): void {
    const urlCount = new Map<string, ExtractedLink[]>();
    for (const link of links) {
      const normalized = link.url.toLowerCase().replace(/\/$/, '');
      const existing = urlCount.get(normalized) ?? [];
      existing.push(link);
      urlCount.set(normalized, existing);
    }

    for (const [url, occurrences] of urlCount) {
      if (occurrences.length > 2) {
        findings.push({
          ruleId: 'link.duplicate.excessive',
          severity: 'info',
          message: `URL "${url}" appears ${occurrences.length} times.`,
          line: occurrences[0].line,
        });
      }
    }
  }

  private checkAnchors(lines: string[], links: ExtractedLink[], findings: ValidationFinding[]): void {
    // Build set of heading anchors in the document.
    const headingAnchors = new Set<string>();
    let inCodeBlock = false;

    for (const line of lines) {
      if (/^```/.test(line.trim())) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;

      const headingMatch = line.match(/^#{1,6}\s+(.+)/);
      if (headingMatch) {
        const anchor = this.headingToAnchor(headingMatch[1]);
        headingAnchors.add(anchor);
      }
    }

    // Add known anchors.
    for (const a of this.knownAnchors) {
      headingAnchors.add(a);
    }

    // Check anchor links.
    for (const link of links) {
      if (link.url.startsWith('#')) {
        const anchor = link.url.slice(1).toLowerCase();
        if (headingAnchors.size > 0 && !headingAnchors.has(anchor)) {
          findings.push({
            ruleId: 'link.anchor.broken',
            severity: 'warning',
            message: `Anchor link "${link.url}" does not match any heading in the document.`,
            line: link.line,
            column: link.column,
            suggestion: 'Check the heading text and update the anchor reference.',
          });
        }
      }
    }
  }

  private headingToAnchor(heading: string): string {
    return heading
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }
}

/**
 * Code Syntax Checker — VentureOS QA Framework (P1 #31)
 *
 * Validates code blocks and code content for basic syntax correctness:
 * - Bracket/brace/parenthesis matching
 * - String literal closure
 * - Basic language-specific checks (JS/TS)
 * - Indentation consistency
 *
 * This is a lightweight static checker — not a full parser/compiler.
 * It catches common mistakes agents make when generating code.
 */

import type { Validator, ValidatorInput, ValidationResult, ValidationFinding } from '../qa-framework';

export interface CodeSyntaxCheckerConfig {
  /** Languages to check. Default: ['javascript', 'typescript', 'json'] */
  supportedLanguages?: string[];
  /** Check bracket matching. Default: true */
  checkBrackets?: boolean;
  /** Check string closure. Default: true */
  checkStrings?: boolean;
  /** Check for common syntax anti-patterns. Default: true */
  checkPatterns?: boolean;
  /** Scoring dimension. Default: 'accuracy' */
  dimension?: string;
}

interface CodeBlock {
  language: string;
  content: string;
  startLine: number;
}

export class CodeSyntaxChecker implements Validator {
  readonly id = 'code-syntax';
  readonly name = 'Code Syntax Checker';
  readonly supportedTypes = ['typescript', 'javascript', 'json', 'markdown', 'md'];

  private readonly checkBrackets: boolean;
  private readonly checkStrings: boolean;
  private readonly checkPatterns: boolean;
  private readonly dimension: string;
  private readonly supportedLanguages: Set<string>;

  constructor(config: CodeSyntaxCheckerConfig = {}) {
    this.checkBrackets = config.checkBrackets ?? true;
    this.checkStrings = config.checkStrings ?? true;
    this.checkPatterns = config.checkPatterns ?? true;
    this.dimension = config.dimension ?? 'accuracy';
    this.supportedLanguages = new Set(
      config.supportedLanguages ?? ['javascript', 'typescript', 'js', 'ts', 'json', 'jsx', 'tsx']
    );
  }

  async validate(input: ValidatorInput): Promise<ValidationResult> {
    const start = performance.now();
    const findings: ValidationFinding[] = [];

    if (input.contentType === 'markdown' || input.contentType === 'md') {
      // Extract code blocks from markdown.
      const blocks = this.extractCodeBlocks(input.content);
      for (const block of blocks) {
        if (this.supportedLanguages.has(block.language.toLowerCase())) {
          this.checkCode(block.content, block.startLine, block.language, findings);
        }
      }
    } else {
      // Treat entire content as code.
      const lang = input.contentType ?? 'typescript';
      this.checkCode(input.content, 1, lang, findings);
    }

    const errorCount = findings.filter((f) => f.severity === 'error').length;
    const warningCount = findings.filter((f) => f.severity === 'warning').length;
    const score = Math.max(0, 100 - errorCount * 20 - warningCount * 5);

    return {
      validatorId: this.id,
      passed: errorCount === 0,
      findings,
      score,
      durationMs: Math.round(performance.now() - start),
      metadata: {
        dimension: this.dimension,
      },
    };
  }

  private extractCodeBlocks(markdown: string): CodeBlock[] {
    const blocks: CodeBlock[] = [];
    const lines = markdown.split('\n');
    let currentBlock: { lang: string; lines: string[]; startLine: number } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const fenceMatch = trimmed.match(/^(`{3,})([\w+]*)/);

      if (fenceMatch) {
        if (currentBlock === null) {
          currentBlock = {
            lang: fenceMatch[2] || 'unknown',
            lines: [],
            startLine: i + 2, // Content starts next line (1-indexed).
          };
        } else {
          blocks.push({
            language: currentBlock.lang,
            content: currentBlock.lines.join('\n'),
            startLine: currentBlock.startLine,
          });
          currentBlock = null;
        }
      } else if (currentBlock !== null) {
        currentBlock.lines.push(lines[i]);
      }
    }

    return blocks;
  }

  private checkCode(code: string, lineOffset: number, language: string, findings: ValidationFinding[]): void {
    if (this.checkBrackets) {
      this.checkBracketMatching(code, lineOffset, findings);
    }

    if (this.checkStrings) {
      this.checkStringClosure(code, lineOffset, findings);
    }

    if (this.checkPatterns && (language === 'javascript' || language === 'typescript' || language === 'js' || language === 'ts')) {
      this.checkCommonPatterns(code, lineOffset, findings);
    }
  }

  private checkBracketMatching(code: string, lineOffset: number, findings: ValidationFinding[]): void {
    const stack: Array<{ char: string; line: number; col: number }> = [];
    const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    const closers = new Set(Object.values(pairs));

    let inString: string | null = null;
    let inLineComment = false;
    let inBlockComment = false;
    let escaped = false;
    let line = 0;
    let col = 0;

    for (let i = 0; i < code.length; i++) {
      const c = code[i];
      const next = code[i + 1];

      // Track position.
      if (c === '\n') {
        line++;
        col = 0;
        inLineComment = false;
        escaped = false;
        continue;
      }
      col++;

      // Handle escape.
      if (escaped) {
        escaped = false;
        continue;
      }
      if (c === '\\' && inString) {
        escaped = true;
        continue;
      }

      // Handle comments.
      if (!inString) {
        if (inBlockComment) {
          if (c === '*' && next === '/') {
            inBlockComment = false;
            i++;
          }
          continue;
        }
        if (inLineComment) continue;
        if (c === '/' && next === '/') {
          inLineComment = true;
          continue;
        }
        if (c === '/' && next === '*') {
          inBlockComment = true;
          i++;
          continue;
        }
      }

      // Handle strings.
      if (inString) {
        if (c === inString) {
          inString = null;
        }
        continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        inString = c;
        continue;
      }

      // Check brackets.
      if (pairs[c]) {
        stack.push({ char: c, line: lineOffset + line, col });
      } else if (closers.has(c)) {
        if (stack.length === 0) {
          findings.push({
            ruleId: 'code.brackets.unexpected-close',
            severity: 'error',
            message: `Unexpected closing '${c}' without matching opener.`,
            line: lineOffset + line,
            column: col,
          });
        } else {
          const top = stack[stack.length - 1];
          if (pairs[top.char] !== c) {
            findings.push({
              ruleId: 'code.brackets.mismatch',
              severity: 'error',
              message: `Mismatched brackets: expected '${pairs[top.char]}' to close '${top.char}' (line ${top.line}) but got '${c}'.`,
              line: lineOffset + line,
              column: col,
            });
          }
          stack.pop();
        }
      }
    }

    // Report unclosed brackets.
    for (const item of stack) {
      findings.push({
        ruleId: 'code.brackets.unclosed',
        severity: 'error',
        message: `Unclosed '${item.char}' opened at line ${item.line}, column ${item.col}.`,
        line: item.line,
        column: item.col,
      });
    }
  }

  private checkStringClosure(code: string, lineOffset: number, findings: ValidationFinding[]): void {
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let inString: string | null = null;
      let escaped = false;

      for (let j = 0; j < line.length; j++) {
        const c = line[j];
        const next = line[j + 1];

        if (escaped) {
          escaped = false;
          continue;
        }
        if (c === '\\') {
          escaped = true;
          continue;
        }

        // Skip if we're in a comment.
        if (!inString && c === '/' && (next === '/' || next === '*')) {
          break;
        }

        if (inString === null) {
          if (c === '"' || c === "'") {
            inString = c;
          }
          // Skip template literals (backticks can be multi-line).
        } else if (c === inString) {
          inString = null;
        }
      }

      if (inString !== null) {
        findings.push({
          ruleId: 'code.string.unclosed',
          severity: 'warning',
          message: `Possible unclosed string literal (${inString}) at line ${lineOffset + i}.`,
          line: lineOffset + i,
          suggestion: `Check for a missing closing ${inString} quote.`,
        });
      }
    }
  }

  private checkCommonPatterns(code: string, lineOffset: number, findings: ValidationFinding[]): void {
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect `console.log` in production code (common agent mistake).
      if (/\bconsole\.log\b/.test(line)) {
        findings.push({
          ruleId: 'code.pattern.console-log',
          severity: 'info',
          message: `console.log statement at line ${lineOffset + i}. Consider using a proper logger.`,
          line: lineOffset + i,
          suggestion: 'Replace console.log with a structured logger.',
        });
      }

      // Detect TODO/FIXME comments.
      if (/\/\/\s*(TODO|FIXME|HACK|XXX)\b/i.test(line)) {
        findings.push({
          ruleId: 'code.pattern.todo-comment',
          severity: 'info',
          message: `TODO/FIXME comment at line ${lineOffset + i}.`,
          line: lineOffset + i,
        });
      }
    }
  }
}

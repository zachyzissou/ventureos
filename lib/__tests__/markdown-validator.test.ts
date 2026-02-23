/**
 * Markdown Validator Tests — VentureOS QA Framework (P1 #31)
 */

import { MarkdownValidator } from '../validators/markdown-validator';

describe('MarkdownValidator', () => {
  const validator = new MarkdownValidator();

  it('passes well-formed markdown', async () => {
    const result = await validator.validate({
      content: '# Title\n\n## Section One\n\nSome content here.\n\n### Sub-section\n\nMore content.',
      contentType: 'markdown',
    });

    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.validatorId).toBe('markdown');
  });

  it('warns on missing H1 header', async () => {
    const result = await validator.validate({
      content: '## Section One\n\nContent without top-level heading.',
      contentType: 'markdown',
    });

    const h1Finding = result.findings.find((f) => f.ruleId === 'markdown.header.missing-h1');
    expect(h1Finding).toBeDefined();
    expect(h1Finding!.severity).toBe('warning');
  });

  it('warns on multiple H1 headers', async () => {
    const result = await validator.validate({
      content: '# Title One\n\nContent\n\n# Title Two\n\nMore content.',
      contentType: 'markdown',
    });

    const multiH1 = result.findings.find((f) => f.ruleId === 'markdown.header.multiple-h1');
    expect(multiH1).toBeDefined();
  });

  it('detects skipped heading levels', async () => {
    const result = await validator.validate({
      content: '# Title\n\n### Skipped H2\n\nContent.',
      contentType: 'markdown',
    });

    const skipped = result.findings.find((f) => f.ruleId === 'markdown.header.skipped-level');
    expect(skipped).toBeDefined();
    expect(skipped!.message).toContain('H1 to H3');
  });

  it('detects unclosed code blocks', async () => {
    const result = await validator.validate({
      content: '# Title\n\n```javascript\nconst x = 1;\n',
      contentType: 'markdown',
    });

    const unclosed = result.findings.find((f) => f.ruleId === 'markdown.codeblock.unclosed');
    expect(unclosed).toBeDefined();
    expect(unclosed!.severity).toBe('error');
    expect(result.passed).toBe(false);
  });

  it('handles properly closed code blocks', async () => {
    const result = await validator.validate({
      content: '# Title\n\n```javascript\nconst x = 1;\n```\n\nMore text.',
      contentType: 'markdown',
    });

    const unclosed = result.findings.find((f) => f.ruleId === 'markdown.codeblock.unclosed');
    expect(unclosed).toBeUndefined();
  });

  it('detects empty link URLs', async () => {
    const result = await validator.validate({
      content: '# Title\n\nClick [here]() for more info.',
      contentType: 'markdown',
    });

    const emptyUrl = result.findings.find((f) => f.ruleId === 'markdown.link.empty-url');
    expect(emptyUrl).toBeDefined();
    expect(emptyUrl!.severity).toBe('warning');
  });

  it('ignores headings inside code blocks', async () => {
    const result = await validator.validate({
      content: '# Title\n\n```markdown\n# Not a real heading\n### Also not real\n```\n\n## Real Section',
      contentType: 'markdown',
    });

    // Should not report skipped levels for headings inside code blocks.
    const skipped = result.findings.find((f) => f.ruleId === 'markdown.header.skipped-level');
    expect(skipped).toBeUndefined();
  });

  it('detects mixed list markers', async () => {
    const result = await validator.validate({
      content: '# Title\n\n- Item one\n* Item two\n- Item three',
      contentType: 'markdown',
    });

    const mixed = result.findings.find((f) => f.ruleId === 'markdown.list.mixed-markers');
    expect(mixed).toBeDefined();
  });

  it('reports metadata including heading and line counts', async () => {
    const result = await validator.validate({
      content: '# Title\n\n## A\n\n## B\n\nContent.',
      contentType: 'markdown',
    });

    expect(result.metadata?.headingCount).toBe(3);
    expect(result.metadata?.lineCount).toBe(7);
  });

  it('can be configured to skip H1 requirement', async () => {
    const v = new MarkdownValidator({ requireH1: false });
    const result = await v.validate({
      content: '## Section\n\nContent without H1.',
      contentType: 'markdown',
    });

    const h1Finding = result.findings.find((f) => f.ruleId === 'markdown.header.missing-h1');
    expect(h1Finding).toBeUndefined();
  });

  it('maps to clarity dimension by default', async () => {
    const result = await validator.validate({
      content: '# Title\n\nContent.',
      contentType: 'markdown',
    });

    expect(result.metadata?.dimension).toBe('clarity');
  });

  it('score decreases with more issues', async () => {
    const good = await validator.validate({
      content: '# Title\n\n## Section\n\nGood content here.',
      contentType: 'markdown',
    });

    const bad = await validator.validate({
      content: '### No H1\n\n##### Skipped levels\n\n```unclosed\n\n[broken]()',
      contentType: 'markdown',
    });

    expect(good.score).toBeGreaterThan(bad.score);
  });
});

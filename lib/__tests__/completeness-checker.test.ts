/**
 * Completeness Checker Tests — VentureOS QA Framework (P1 #31)
 */

import { CompletenessChecker } from '../validators/completeness-checker';

describe('CompletenessChecker', () => {
  const checker = new CompletenessChecker();

  it('passes content with all default required sections', async () => {
    const result = await checker.validate({
      content: '# My Document\n\nThis is a description of the project.\n\nMore details follow.',
      contentType: 'markdown',
    });

    // Should find the title section (# header matches).
    expect(result.score).toBeGreaterThan(50);
    expect(result.validatorId).toBe('completeness');
  });

  it('fails on content that is too short', async () => {
    const result = await checker.validate({
      content: 'Hi',
      contentType: 'markdown',
    });

    const tooShort = result.findings.find((f) => f.ruleId === 'completeness.content.too-short');
    expect(tooShort).toBeDefined();
    expect(tooShort!.severity).toBe('error');
    expect(result.passed).toBe(false);
  });

  it('reports missing required sections', async () => {
    const c = new CompletenessChecker({
      requiredSections: [
        { id: 'intro', name: 'Introduction', patterns: ['introduction', 'intro'], required: true },
        { id: 'conclusion', name: 'Conclusion', patterns: ['conclusion'], required: true },
      ],
    });

    const result = await c.validate({
      content: '# Report\n\n## Introduction\n\nSome intro text here with enough length to pass.\n\nBody content goes here.',
      contentType: 'markdown',
    });

    const missing = result.findings.find((f) => f.ruleId === 'completeness.section.conclusion.missing');
    expect(missing).toBeDefined();
    expect(missing!.severity).toBe('error');
  });

  it('warns for recommended (non-required) missing sections', async () => {
    const c = new CompletenessChecker({
      requiredSections: [
        { id: 'recap', name: 'Recap', patterns: ['recap'], required: false },
      ],
    });

    const result = await c.validate({
      content: '# Document\n\nContent that does not include the recommended topic anywhere in the text at all here.',
      contentType: 'markdown',
    });

    const missing = result.findings.find((f) => f.ruleId === 'completeness.section.recap.missing');
    expect(missing).toBeDefined();
    expect(missing!.severity).toBe('warning');
  });

  it('detects content that exceeds max length', async () => {
    const c = new CompletenessChecker({ maxContentLength: 50 });

    const result = await c.validate({
      content: '# Title\n\n' + 'A'.repeat(100),
      contentType: 'markdown',
    });

    const tooLong = result.findings.find((f) => f.ruleId === 'completeness.content.too-long');
    expect(tooLong).toBeDefined();
    expect(tooLong!.severity).toBe('warning');
  });

  it('checks section minimum length', async () => {
    const c = new CompletenessChecker({
      requiredSections: [
        { id: 'details', name: 'Details', patterns: ['details'], required: true, minLength: 100 },
      ],
    });

    const result = await c.validate({
      content: '# Document\n\n## Details\n\nShort.\n\n## Other\n\nMore text here to pass the overall content length minimum check for the validator.',
      contentType: 'markdown',
    });

    const tooShort = result.findings.find((f) => f.ruleId === 'completeness.section.details.too-short');
    expect(tooShort).toBeDefined();
  });

  it('detects YAML frontmatter absence in markdown', async () => {
    const result = await checker.validate({
      content: '# No Frontmatter\n\nJust regular content here with enough text to pass length validation.',
      contentType: 'markdown',
    });

    const fmMissing = result.findings.find((f) => f.ruleId === 'completeness.frontmatter.missing');
    expect(fmMissing).toBeDefined();
    expect(fmMissing!.severity).toBe('info');
  });

  it('does not check frontmatter for non-markdown content', async () => {
    const result = await checker.validate({
      content: '{"data": "No frontmatter needed here and this is long enough to pass"}',
      contentType: 'json',
    });

    const fmMissing = result.findings.find((f) => f.ruleId === 'completeness.frontmatter.missing');
    expect(fmMissing).toBeUndefined();
  });

  it('uses pattern matching for section detection', async () => {
    const c = new CompletenessChecker({
      requiredSections: [
        { id: 'api', name: 'API Reference', patterns: ['^#{1,6}\\s+API'], required: true },
      ],
    });

    const result = await c.validate({
      content: '# Docs\n\n## API Reference\n\nEndpoints listed here with enough text to pass.',
      contentType: 'markdown',
    });

    const missing = result.findings.find((f) => f.ruleId === 'completeness.section.api.missing');
    expect(missing).toBeUndefined(); // Should be found.
  });

  it('maps to completeness dimension', async () => {
    const result = await checker.validate({
      content: '# Title\n\nEnough content here to pass the minimum length check for the validator.',
    });

    expect(result.metadata?.dimension).toBe('completeness');
  });

  it('reports total and found section counts', async () => {
    const result = await checker.validate({
      content: '# Title\n\nSome description overview text that is long enough to pass all checks.',
      contentType: 'markdown',
    });

    expect(result.metadata?.totalSections).toBeDefined();
    expect(result.metadata?.sectionsFound).toBeDefined();
  });

  it('custom minContentLength is honored', async () => {
    const c = new CompletenessChecker({ minContentLength: 10 });

    const result = await c.validate({
      content: '# Short OK text',
      contentType: 'markdown',
    });

    const tooShort = result.findings.find((f) => f.ruleId === 'completeness.content.too-short');
    expect(tooShort).toBeUndefined();
  });
});

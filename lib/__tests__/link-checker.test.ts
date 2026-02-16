/**
 * Link Checker Tests — VentureOS QA Framework (P1 #31)
 */

import { LinkChecker } from '../validators/link-checker';

describe('LinkChecker', () => {
  const checker = new LinkChecker();

  it('passes content with valid links', async () => {
    const result = await checker.validate({
      content: '# Guide\n\nVisit [our docs](https://docs.example.org) for more.',
      contentType: 'markdown',
    });

    expect(result.passed).toBe(true);
    expect(result.metadata?.totalLinks).toBe(1);
  });

  it('detects placeholder URLs', async () => {
    const result = await checker.validate({
      content: '# Links\n\n[Click here](https://example.com/placeholder)',
      contentType: 'markdown',
    });

    const placeholder = result.findings.find((f) => f.ruleId === 'link.content.placeholder');
    expect(placeholder).toBeDefined();
    expect(placeholder!.severity).toBe('warning');
  });

  it('detects URLs with spaces', async () => {
    const result = await checker.validate({
      content: '# Links\n\n[Bad link](my url with spaces)',
      contentType: 'markdown',
    });

    const spaces = result.findings.find((f) => f.ruleId === 'link.format.contains-spaces');
    expect(spaces).toBeDefined();
    expect(spaces!.severity).toBe('error');
  });

  it('detects nested markdown in URLs', async () => {
    const result = await checker.validate({
      content: '# Links\n\n[text]([nested](url))',
      contentType: 'markdown',
    });

    const nested = result.findings.find((f) => f.ruleId === 'link.format.nested-markdown');
    expect(nested).toBeDefined();
  });

  it('warns on disallowed URL schemes', async () => {
    const c = new LinkChecker({ allowedSchemes: ['https'] });

    const result = await c.validate({
      content: '# Links\n\n[Insecure](http://example.org/page)',
      contentType: 'markdown',
    });

    const scheme = result.findings.find((f) => f.ruleId === 'link.scheme.disallowed');
    expect(scheme).toBeDefined();
    expect(scheme!.message).toContain('http');
  });

  it('detects broken anchor links', async () => {
    const result = await checker.validate({
      content: '# Title\n\n## Section One\n\nSee [Section Two](#section-two) for details.',
      contentType: 'markdown',
    });

    const broken = result.findings.find((f) => f.ruleId === 'link.anchor.broken');
    expect(broken).toBeDefined();
    expect(broken!.message).toContain('#section-two');
  });

  it('allows valid anchor links', async () => {
    const result = await checker.validate({
      content: '# Title\n\n## Section One\n\nSee [above](#title) for info.',
      contentType: 'markdown',
    });

    const broken = result.findings.find((f) => f.ruleId === 'link.anchor.broken');
    expect(broken).toBeUndefined();
  });

  it('ignores links inside code blocks', async () => {
    const result = await checker.validate({
      content: '# Title\n\n```\n[not a link](http://example.com)\n```\n',
      contentType: 'markdown',
    });

    expect(result.metadata?.totalLinks).toBe(0);
  });

  it('detects excessive duplicate links', async () => {
    const result = await checker.validate({
      content: '# Links\n\n[a](https://repeat.com) and [b](https://repeat.com) and [c](https://repeat.com) and [d](https://repeat.com)',
      contentType: 'markdown',
    });

    const dup = result.findings.find((f) => f.ruleId === 'link.duplicate.excessive');
    expect(dup).toBeDefined();
  });

  it('does not flag 2 duplicate links as excessive', async () => {
    const result = await checker.validate({
      content: '# Links\n\n[a](https://ok.com) and [b](https://ok.com)',
      contentType: 'markdown',
    });

    const dup = result.findings.find((f) => f.ruleId === 'link.duplicate.excessive');
    expect(dup).toBeUndefined();
  });

  it('extracts bare URLs', async () => {
    const result = await checker.validate({
      content: '# Title\n\nVisit https://bare-url.com/page for more info.',
      contentType: 'markdown',
    });

    expect(result.metadata?.totalLinks).toBe(1);
  });

  it('supports known anchors configuration', async () => {
    const c = new LinkChecker({ knownAnchors: ['external-ref'] });

    const result = await c.validate({
      content: '# Title\n\nSee [ref](#external-ref).',
      contentType: 'markdown',
    });

    const broken = result.findings.find((f) => f.ruleId === 'link.anchor.broken');
    expect(broken).toBeUndefined();
  });

  it('reports unique link count in metadata', async () => {
    const result = await checker.validate({
      content: '# Links\n\n[a](https://one.com) [b](https://two.com) [c](https://one.com)',
      contentType: 'markdown',
    });

    expect(result.metadata?.totalLinks).toBe(3);
    expect(result.metadata?.uniqueLinks).toBe(2);
  });

  it('maps to accuracy dimension', async () => {
    const result = await checker.validate({
      content: '# Title\n\nContent.',
      contentType: 'markdown',
    });

    expect(result.metadata?.dimension).toBe('accuracy');
  });
});

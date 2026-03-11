/**
 * Code Syntax Checker Tests — VentureOS QA Framework (P1 #31)
 */

import { CodeSyntaxChecker } from '../validators/code-syntax-checker';

describe('CodeSyntaxChecker', () => {
  const checker = new CodeSyntaxChecker();

  it('passes valid TypeScript code', async () => {
    const result = await checker.validate({
      content: 'function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n',
      contentType: 'typescript',
    });

    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it('detects mismatched brackets', async () => {
    const result = await checker.validate({
      content: 'function broken() {\n  const x = [1, 2, 3;\n}\n',
      contentType: 'typescript',
    });

    const mismatch = result.findings.find(
      (f) => f.ruleId === 'code.brackets.mismatch' || f.ruleId === 'code.brackets.unclosed'
    );
    expect(mismatch).toBeDefined();
    expect(result.passed).toBe(false);
  });

  it('detects unclosed brackets', async () => {
    const result = await checker.validate({
      content: 'const obj = {\n  name: "test",\n  items: [1, 2, 3]\n',
      contentType: 'typescript',
    });

    const unclosed = result.findings.find((f) => f.ruleId === 'code.brackets.unclosed');
    expect(unclosed).toBeDefined();
  });

  it('detects unexpected closing bracket', async () => {
    const result = await checker.validate({
      content: 'const x = 1;\n}\n',
      contentType: 'typescript',
    });

    const unexpected = result.findings.find((f) => f.ruleId === 'code.brackets.unexpected-close');
    expect(unexpected).toBeDefined();
  });

  it('handles strings correctly (brackets inside strings are ignored)', async () => {
    const result = await checker.validate({
      content: 'const x = "hello { world }";\nconst y = \'test [ ] ]\';\n',
      contentType: 'typescript',
    });

    const bracketIssues = result.findings.filter((f) => f.ruleId.startsWith('code.brackets'));
    expect(bracketIssues).toHaveLength(0);
  });

  it('handles comments correctly (brackets inside comments are ignored)', async () => {
    const result = await checker.validate({
      content: '// unclosed { bracket in comment\n/* also { here */\nconst x = 1;\n',
      contentType: 'typescript',
    });

    const bracketIssues = result.findings.filter((f) => f.ruleId.startsWith('code.brackets'));
    expect(bracketIssues).toHaveLength(0);
  });

  it('detects unclosed string literals', async () => {
    const result = await checker.validate({
      content: 'const x = "unclosed;\nconst y = 2;\n',
      contentType: 'typescript',
    });

    const unclosed = result.findings.find((f) => f.ruleId === 'code.string.unclosed');
    expect(unclosed).toBeDefined();
  });

  it('detects console.log statements', async () => {
    const result = await checker.validate({
      content: 'function process() {\n  console.log("debug");\n  return 42;\n}\n',
      contentType: 'typescript',
    });

    const consoleLog = result.findings.find((f) => f.ruleId === 'code.pattern.console-log');
    expect(consoleLog).toBeDefined();
    expect(consoleLog!.severity).toBe('info');
  });

  it('detects TODO/FIXME comments', async () => {
    const result = await checker.validate({
      content: 'function process() {\n  // TODO: implement this\n  // FIXME: broken\n  return 42;\n}\n',
      contentType: 'typescript',
    });

    const todos = result.findings.filter((f) => f.ruleId === 'code.pattern.todo-comment');
    expect(todos.length).toBeGreaterThanOrEqual(2);
  });

  it('extracts and validates code blocks from markdown', async () => {
    const result = await checker.validate({
      content: [
        '# Code Example',
        '',
        '```typescript',
        'function broken() {',
        '  const x = [1, 2, 3;',
        '}',
        '```',
      ].join('\n'),
      contentType: 'markdown',
    });

    const issues = result.findings.filter((f) => f.ruleId.startsWith('code.brackets'));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('ignores unsupported language code blocks in markdown', async () => {
    const checker2 = new CodeSyntaxChecker({ supportedLanguages: ['typescript'] });

    const result = await checker2.validate({
      content: '# Code\n\n```python\ndef broken(:\n  pass\n```\n',
      contentType: 'markdown',
    });

    // Python is not in supported languages, so no findings.
    expect(result.findings).toHaveLength(0);
  });

  it('maps to accuracy dimension', async () => {
    const result = await checker.validate({
      content: 'const x = 1;\n',
      contentType: 'typescript',
    });

    expect(result.metadata?.dimension).toBe('accuracy');
  });

  it('handles escaped characters in strings', async () => {
    const result = await checker.validate({
      content: 'const x = "hello \\"world\\"";\nconst y = \'it\\\'s fine\';\n',
      contentType: 'typescript',
    });

    const stringIssues = result.findings.filter((f) => f.ruleId === 'code.string.unclosed');
    expect(stringIssues).toHaveLength(0);
  });

  it('score reflects severity of issues', async () => {
    const clean = await checker.validate({
      content: 'const x = 1;\nconst y = 2;\n',
      contentType: 'typescript',
    });

    const broken = await checker.validate({
      content: 'const x = { a: [1, 2;\n',
      contentType: 'typescript',
    });

    expect(clean.score).toBeGreaterThan(broken.score);
  });
});

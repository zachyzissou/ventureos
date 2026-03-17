import {
  runTokenCompaction,
  estimateTokens,
  isProtectedFile,
  type CompactorFileInput,
} from '../token-compactor';

function fixedNow(): Date {
  return new Date('2026-02-21T12:00:00.000Z');
}

describe('token-compactor', () => {
  it('detects protected file globs', () => {
    expect(isProtectedFile('souls/venture_research/SOUL.md', ['SOUL.md'])).toBe(true);
    expect(isProtectedFile('config/secret.key', ['*.key'])).toBe(true);
    expect(isProtectedFile('src/main.ts', ['*.key'])).toBe(false);
  });

  it('is deterministic for identical inputs', () => {
    const files: CompactorFileInput[] = [
      {
        path: 'src/a.ts',
        content: `
          // comment one
          export const A = 1;

          export const B = 2;
        `,
        priority: 1,
      },
      {
        path: 'src/b.ts',
        content: `
          // comment two
          export const C = 3;
        `,
        priority: 2,
      },
    ];

    const a = runTokenCompaction(files, { now: fixedNow, level: 'standard' });
    const b = runTokenCompaction(files, { now: fixedNow, level: 'standard' });

    expect(a.bundledContext).toBe(b.bundledContext);
    expect(a.files).toEqual(b.files);
    expect(a.metrics).toEqual(b.metrics);
  });

  it('preserves protected files exactly', () => {
    const protectedContent = `
      # core profile
      Keep every line exactly as-is
    `;
    const result = runTokenCompaction(
      [
        { path: 'souls/venture_research/SOUL.md', content: protectedContent },
        { path: 'src/worker.ts', content: '// comment\nexport const x = 1;' },
      ],
      { now: fixedNow, protectedFiles: ['SOUL.md'], level: 'standard' },
    );

    const protectedOut = result.files.find((f) => f.path.endsWith('SOUL.md'));
    expect(protectedOut).toBeDefined();
    expect(protectedOut?.content).toBe(protectedContent);
    expect(protectedOut?.skippedReason).toBe('protected-file-pattern');
  });

  it('achieves >50% reduction at standard level on representative workspace sample', () => {
    const sharedBlock = [
      'function longSharedBlock() {',
      '  const map = new Map<string, number>();',
      '  for (let i = 0; i < 120; i += 1) {',
      '    map.set(`key-${i}`, i * 2);',
      '  }',
      '  return Array.from(map.entries());',
      '}',
      '',
      'const REPEATED_BANNER = "VENTUREOS_TOKEN_COMPACTOR_TEST_DATA";',
      '',
    ].join('\n');

    const files: CompactorFileInput[] = Array.from({ length: 8 }, (_, i) => ({
      path: `src/module-${i}.ts`,
      priority: i === 0 ? 5 : 0,
      updatedAtMs: Date.parse(`2026-02-${String(21 - i).padStart(2, '0')}T09:00:00.000Z`),
      content: `
        // module ${i}
        ${sharedBlock}
        ${sharedBlock}
        export const value${i} = ${i};
      `,
    }));

    const result = runTokenCompaction(files, { now: fixedNow, level: 'standard' });

    expect(result.metrics.reductionPct).toBeGreaterThanOrEqual(50);
    expect(result.metrics.preTokens).toBeGreaterThan(result.metrics.postTokens);
    expect(result.metrics.layerContributions).toHaveLength(5);
    expect(result.metrics.durationMs).toBeLessThanOrEqual(200);
  });

  it('prunes low-priority files first', () => {
    const lowContent = `${'const low = 1;\n'.repeat(600)}\n`;
    const highContent = `${'const high = 2;\n'.repeat(600)}\n`;
    const result = runTokenCompaction(
      [
        { path: 'src/high.ts', content: highContent, priority: 10, updatedAtMs: Date.parse('2026-02-21T10:00:00.000Z') },
        { path: 'src/low.ts', content: lowContent, priority: -1, updatedAtMs: Date.parse('2025-12-01T10:00:00.000Z') },
      ],
      { now: fixedNow, level: 'aggressive' },
    );

    const high = result.files.find((f) => f.path === 'src/high.ts');
    const low = result.files.find((f) => f.path === 'src/low.ts');
    expect(high?.skippedReason).not.toBe('priority-pruned');
    expect(low?.skippedReason).toBe('priority-pruned');
  });

  it('returns timeout metadata when the budget is exhausted', () => {
    const noisy = `${'// comment\nconst v = "x";\n'.repeat(3000)}\n`;
    const result = runTokenCompaction(
      [
        { path: 'src/a.ts', content: noisy },
        { path: 'src/b.ts', content: noisy },
        { path: 'src/c.ts', content: noisy },
      ],
      {
        now: (() => {
          let calls = 0;
          return () => new Date(Date.parse('2026-02-21T12:00:00.000Z') + calls++ * 120);
        })(),
        maxProcessingMs: 100,
      },
    );

    expect(result.metrics.timedOut).toBe(true);
    expect(estimateTokens(result.bundledContext)).toBe(result.metrics.postTokens);
    expect(result.files.some((f) => f.skippedReason === 'max-processing-ms-exceeded')).toBe(true);
  });
});


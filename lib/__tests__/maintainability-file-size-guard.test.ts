import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const FILE_SIZE_BUDGETS = [
  {
    relativePath: 'lib/workflow-macros.ts',
    maxLines: 1300,
  },
  {
    relativePath: 'lib/model-router.ts',
    maxLines: 750,
  },
] as const;

function lineCount(filePath: string): number {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).length;
}

describe('Root Maintainability Guardrails', () => {
  for (const budget of FILE_SIZE_BUDGETS) {
    it(`${budget.relativePath} stays within ${budget.maxLines} lines`, () => {
      const fullPath = path.join(REPO_ROOT, budget.relativePath);
      expect(lineCount(fullPath)).toBeLessThanOrEqual(budget.maxLines);
    });
  }
});

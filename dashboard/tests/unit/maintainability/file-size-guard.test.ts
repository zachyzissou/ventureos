import fs from 'node:fs';
import path from 'node:path';

import { describe, it, expect } from 'vitest';

const DASHBOARD_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

const FILE_SIZE_BUDGETS = [
  {
    relativePath: 'server/server.ts',
    maxLines: 3600,
  },
  {
    relativePath: 'server/routes/task-board.ts',
    maxLines: 2500,
  },
  {
    relativePath: 'server/bridge.ts',
    maxLines: 1700,
  },
  {
    relativePath: 'server/routes/action-routes.ts',
    maxLines: 350,
  },
  {
    relativePath: 'server/routes/rpg-compat.ts',
    maxLines: 140,
  },
] as const;

function lineCount(filePath: string): number {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).length;
}

describe('Maintainability Guardrails', () => {
  for (const budget of FILE_SIZE_BUDGETS) {
    it(`${budget.relativePath} stays within ${budget.maxLines} lines`, () => {
      const fullPath = path.join(DASHBOARD_ROOT, budget.relativePath);
      const count = lineCount(fullPath);
      expect(count).toBeLessThanOrEqual(budget.maxLines);
    });
  }
});

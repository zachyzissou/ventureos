import path from 'node:path';

/**
 * Security-critical containment check for root-bound file operations.
 * Uses canonical `path.relative(...)` semantics to prevent traversal,
 * including sibling-prefix escapes that bypass naive string prefix checks.
 */
export function isPathInsideRoot(rootDir: string, candidatePath: string): boolean {
  const relative = path.relative(rootDir, candidatePath);
  if (relative === '') return true;
  if (relative === '..' || relative.startsWith(`..${path.sep}`)) return false;
  return !path.isAbsolute(relative);
}

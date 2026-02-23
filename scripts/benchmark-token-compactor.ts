/**
 * Benchmark harness for token compaction (Issue #221).
 *
 * Usage:
 *   node -r ts-node/register ./scripts/benchmark-token-compactor.ts [workspacePath] [maxFiles]
 */

import fs from 'node:fs';
import path from 'node:path';
import { runTokenCompaction, type CompressionLevel, type CompactorFileInput } from '../lib/token-compactor';

const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
]);

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.md', '.yml', '.yaml', '.txt', '.sql', '.sh', '.py', '.go', '.rs',
  '.java', '.kt', '.rb', '.php', '.c', '.cc', '.cpp', '.h', '.hpp',
]);

function isTextPath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (!ext) return true;
  return TEXT_EXTENSIONS.has(ext);
}

function walkWorkspace(root: string, maxFiles: number): string[] {
  const out: string[] = [];
  const stack: string[] = [root];

  while (stack.length > 0 && out.length < maxFiles) {
    const dir = stack.pop() as string;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (out.length >= maxFiles) break;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!isTextPath(fullPath)) continue;
      out.push(fullPath);
    }
  }

  return out;
}

function priorityForPath(relativePath: string): number {
  const normalized = relativePath.replace(/\\/g, '/').toLowerCase();
  if (normalized.endsWith('/soul.md') || normalized.includes('/souls/')) return 9;
  if (normalized.startsWith('docs/')) return 5;
  if (normalized.startsWith('lib/') || normalized.startsWith('dashboard/server/')) return 3;
  return 0;
}

function collectInputs(workspacePath: string, maxFiles: number): CompactorFileInput[] {
  const files = walkWorkspace(workspacePath, maxFiles);
  const inputs: CompactorFileInput[] = [];

  for (const absPath of files) {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(absPath);
    } catch {
      continue;
    }
    if (stat.size > 100_000) continue; // keep benchmark bounded

    let content: string;
    try {
      content = fs.readFileSync(absPath, 'utf8');
    } catch {
      continue;
    }

    const rel = path.relative(workspacePath, absPath);
    inputs.push({
      path: rel,
      content,
      priority: priorityForPath(rel),
      updatedAtMs: stat.mtimeMs,
    });
  }

  return inputs;
}

function runLevel(inputs: CompactorFileInput[], level: CompressionLevel): void {
  const started = Date.now();
  const result = runTokenCompaction(inputs, {
    level,
    protectedFiles: ['SOUL.md', 'PRINCIPLES.md', '*.key'],
    maxProcessingMs: 2_000,
  });
  const elapsed = Date.now() - started;

  const reduction = result.metrics.reductionPct.toFixed(2);
  const pre = result.metrics.preTokens;
  const post = result.metrics.postTokens;
  const savingsUsd = result.metrics.estimatedSavingsUsd.toFixed(6);

  console.log(
    `${level.padEnd(12)} pre=${String(pre).padStart(8)} post=${String(post).padStart(8)} `
      + `reduction=${reduction.padStart(6)}% savings=$${savingsUsd} duration=${elapsed}ms`,
  );
}

function main(): void {
  const workspacePath = path.resolve(process.argv[2] ?? process.cwd());
  const maxFilesRaw = Number.parseInt(process.argv[3] ?? '200', 10);
  const maxFiles = Number.isFinite(maxFilesRaw) ? Math.max(10, Math.min(maxFilesRaw, 2000)) : 200;

  const inputs = collectInputs(workspacePath, maxFiles);
  if (inputs.length === 0) {
    console.error('No eligible text files found for benchmark.');
    process.exitCode = 1;
    return;
  }

  console.log(`Token compaction benchmark`);
  console.log(`workspace=${workspacePath}`);
  console.log(`files=${inputs.length}`);
  console.log('');
  runLevel(inputs, 'conservative');
  runLevel(inputs, 'standard');
  runLevel(inputs, 'aggressive');
}

main();


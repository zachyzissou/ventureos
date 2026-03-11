import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  collectSimpleReviewFindings,
  applyAutoRemediation,
} from '../lib/code-factory';

function getArg(name: string, fallback = ''): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx < 0) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function parseFloatSafe(raw: string, fallback: number): number {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function readChangedFiles(source: string): string[] {
  if (!source) return [];
  if (fs.existsSync(source)) {
    return fs.readFileSync(source, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean);
  }
  return source.split(',').map((line) => line.trim()).filter(Boolean);
}

function main(): void {
  const workspaceDir = path.resolve(getArg('workspace', process.cwd()));
  const changedSource = getArg('changed-files', '');
  const outPath = getArg('out', path.join(workspaceDir, 'data', 'code-factory', 'auto-remediation-summary.json'));
  const patchPath = getArg('patch-out', path.join(workspaceDir, 'data', 'code-factory', 'auto-remediation.patch'));
  const minFixRate = parseFloatSafe(getArg('min-fix-rate', '60'), 60);

  const changedFiles = readChangedFiles(changedSource);
  const findings = collectSimpleReviewFindings(changedFiles, workspaceDir);
  const result = applyAutoRemediation(findings, workspaceDir);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

  if (fs.existsSync(path.join(workspaceDir, '.git'))) {
    try {
      const patch = execSync('git diff -- .', { cwd: workspaceDir, encoding: 'utf8' });
      fs.mkdirSync(path.dirname(patchPath), { recursive: true });
      fs.writeFileSync(patchPath, patch);
    } catch {
      // best-effort patch export
    }
  }

  console.log(JSON.stringify(result));

  if (result.attempted > 0 && result.fixRate < minFixRate) {
    console.error(`Auto-remediation fix rate ${result.fixRate}% is below threshold ${minFixRate}%`);
    process.exit(1);
  }
}

main();

#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = {
    mode: 'executed',
    output: 'performance-output.txt',
    playwrightStatus: 'test-results/.last-run.json',
    exitCodeFile: 'benchmark-exit-code.txt',
    reportsDir: 'performance-reports',
    sha: 'unknown',
    branch: 'unknown',
    pr: 'none',
    threshold: '10',
    issue: '627',
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) continue;
    if (key in args) {
      args[key] = value;
      i += 1;
    }
  }

  return args;
}

function readTextIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function readJsonIfExists(filePath) {
  const raw = readTextIfExists(filePath);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function detectFailures(outputText) {
  if (!outputText) return false;
  return /\b(?:FAIL|FAILED|REGRESSION)\b/i.test(outputText);
}

function collectPerfLines(outputText) {
  if (!outputText) return [];
  return outputText
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => /\[perf:/.test(line));
}

function buildStatus(args) {
  const outputText = readTextIfExists(args.output);
  const playwrightStatus = readJsonIfExists(args.playwrightStatus);
  const exitCodeText = readTextIfExists(args.exitCodeFile);
  const perfLines = collectPerfLines(outputText);
  const exitCode = Number.parseInt(String(exitCodeText ?? '0').trim(), 10) || 0;
  const benchmarkFailed =
    args.mode === 'executed' &&
    (exitCode !== 0 ||
      detectFailures(outputText) ||
      playwrightStatus?.status === 'failed' ||
      Array.isArray(playwrightStatus?.failedTests) && playwrightStatus.failedTests.length > 0);

  let headline = '✅ Performance benchmarks passed';
  let detail =
    'Benchmark artifacts were generated under the current CI stabilization model.';
  let gatingDecision = 'pass';

  if (args.mode === 'pr-skip') {
    headline = `ℹ️ PR benchmarks skipped while CI stabilization is tracked in #${args.issue}`;
    detail =
      'PR benchmark runs remain informational until Tactical Map performance gating is trustworthy again.';
  } else if (benchmarkFailed) {
    headline = '⚠️ Performance benchmark run reported failures';
    detail =
      'Failures are recorded for review, but merge gating remains informational while #627 is open.';
    gatingDecision = 'warn';
  } else if (perfLines.length === 0) {
    headline = '⚠️ Benchmark run completed without captured perf metrics';
    detail =
      'The CI job completed, but no `[perf:*]` lines were captured. Treat artifacts as incomplete and review before relying on the result.';
    gatingDecision = 'warn';
  }

  return {
    version: 1,
    mode: args.mode,
    timestamp: new Date().toISOString(),
    metadata: {
      commitSha: args.sha,
      branch: args.branch,
      pr: args.pr,
      thresholdPct: Number.parseInt(args.threshold, 10) || 10,
    },
    benchmark: {
      exitCode,
      playwrightStatus: playwrightStatus?.status ?? 'missing',
      failedTests: Array.isArray(playwrightStatus?.failedTests) ? playwrightStatus.failedTests.length : 0,
      perfLineCount: perfLines.length,
      benchmarkFailed,
      skipped: args.mode === 'pr-skip',
    },
    gating: {
      enabled: false,
      decision: gatingDecision,
      reason:
        args.mode === 'pr-skip'
          ? `PR performance benchmarks are informational while #${args.issue} is open.`
          : benchmarkFailed
            ? `Benchmark failures detected, but gating is informational while #${args.issue} is open.`
            : perfLines.length === 0
              ? 'No perf metrics captured; result is informational only.'
              : 'Benchmark run completed successfully in informational mode.',
    },
    summary: {
      headline,
      detail,
      perfLines,
    },
  };
}

function renderMarkdown(status) {
  const lines = [];

  lines.push('## 🏎️ Performance Benchmark Results');
  lines.push('');
  lines.push(`**Commit:** \`${status.metadata.commitSha}\``);
  lines.push(`**Branch:** \`${status.metadata.branch}\``);
  lines.push(`**PR:** \`${status.metadata.pr}\``);
  lines.push(`**Mode:** \`${status.mode}\``);
  lines.push(`**Gating:** \`${status.gating.enabled ? 'enforced' : 'informational'}\``);
  lines.push('');
  lines.push(`### ${status.summary.headline}`);
  lines.push('');
  lines.push(status.summary.detail);
  lines.push('');
  lines.push('### CI Execution Model');
  lines.push('- `workers=1` to avoid runner contention');
  lines.push('- Chromium-only Playwright execution with the tactical-map performance flags from `playwright.config.ts`');
  lines.push('- Backend polling stopped inside the benchmark harness so render tests measure client cost, not reconnect churn');
  lines.push('- Artifacts remain the source of truth while `#627` tracks stabilization');
  lines.push('');
  lines.push('### Benchmark Status');
  lines.push(`- Playwright status: \`${status.benchmark.playwrightStatus}\``);
  lines.push(`- Benchmark exit code: \`${status.benchmark.exitCode}\``);
  lines.push(`- Failed tests: \`${status.benchmark.failedTests}\``);
  lines.push(`- Perf metric lines captured: \`${status.benchmark.perfLineCount}\``);
  lines.push('');
  lines.push('```');
  if (status.summary.perfLines.length > 0) {
    lines.push(...status.summary.perfLines);
  } else if (status.mode === 'pr-skip') {
    lines.push(`PR benchmark execution intentionally skipped while #${status.metadata.pr === 'none' ? '627' : '627'} remains open.`);
  } else {
    lines.push('No perf metrics captured.');
  }
  lines.push('```');
  lines.push('');
  lines.push(`_Generated at ${status.timestamp}_`);

  return lines.join('\n') + '\n';
}

function main() {
  const args = parseArgs(process.argv);
  const reportsDir = path.resolve(args.reportsDir);
  fs.mkdirSync(reportsDir, { recursive: true });

  const status = buildStatus(args);
  fs.writeFileSync(
    path.join(reportsDir, 'performance-status.json'),
    JSON.stringify(status, null, 2) + '\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(reportsDir, 'summary.md'),
    renderMarkdown(status),
    'utf8',
  );
}

main();

#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = {
    mode: 'full-observe',
    output: 'performance-output.txt',
    playwrightStatus: 'test-results/.last-run.json',
    exitCodeFile: 'benchmark-exit-code.txt',
    reportsDir: 'performance-reports',
    sha: 'unknown',
    branch: 'unknown',
    pr: 'none',
    threshold: '10',
    issue: '630',
    stableSuites: 'load',
    informationalSuites: 'render,network,memory',
    executedSuites: 'load,render,network,memory',
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

function splitCsv(value) {
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function collectPerfLines(outputText) {
  if (!outputText) return [];
  return outputText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('[perf:'));
}

function buildSuiteSummary(perfLines) {
  const suites = {};

  for (const line of perfLines) {
    const match = /^\[perf:([a-z0-9_-]+):([a-z0-9_-]+)\]/i.exec(line);
    if (!match) continue;
    const suiteName = match[1];
    const metricName = match[2];
    if (!suites[suiteName]) {
      suites[suiteName] = {
        lineCount: 0,
        metricKeys: [],
        sampleLines: [],
      };
    }
    suites[suiteName].lineCount += 1;
    if (!suites[suiteName].metricKeys.includes(metricName)) {
      suites[suiteName].metricKeys.push(metricName);
    }
    if (suites[suiteName].sampleLines.length < 6) {
      suites[suiteName].sampleLines.push(line);
    }
  }

  return suites;
}

function buildStatus(args) {
  const outputText = readTextIfExists(args.output);
  const playwrightStatus = readJsonIfExists(args.playwrightStatus);
  const exitCodeText = readTextIfExists(args.exitCodeFile);
  const perfLines = collectPerfLines(outputText);
  const suiteSummary = buildSuiteSummary(perfLines);
  const stableSuites = splitCsv(args.stableSuites);
  const informationalSuites = splitCsv(args.informationalSuites);
  const executedSuites = splitCsv(args.executedSuites);
  const exitCode = Number.parseInt(String(exitCodeText ?? '0').trim(), 10) || 0;
  const observedSuites = Object.keys(suiteSummary).sort();
  const missingStableSuites = stableSuites.filter((suiteName) => !suiteSummary[suiteName]);
  const benchmarkFailed =
    exitCode !== 0 ||
    playwrightStatus?.status === 'failed' ||
    (Array.isArray(playwrightStatus?.failedTests) && playwrightStatus.failedTests.length > 0);

  let headline = 'Benchmark run completed';
  let detail = 'Performance artifacts were generated successfully.';
  let decision = 'pass';
  let gatingEnabled = false;
  let reason = 'Stable benchmark suites completed successfully.';

  if (args.mode === 'pr-stable') {
    gatingEnabled = true;
    headline = 'Selective PR performance enforcement';
    detail =
      'Only stable suites are merge-blocking on pull requests while unstable suites remain evidence-only.';

    if (missingStableSuites.length > 0) {
      decision = 'fail';
      reason = `Stable suite metrics were missing: ${missingStableSuites.join(', ')}.`;
      detail = 'The PR run did not produce the required stable-suite metrics.';
    } else if (benchmarkFailed) {
      decision = 'fail';
      reason = 'Stable PR benchmark run failed.';
      detail = 'The enforced stable suite failed on the GitHub runner.';
    } else {
      reason = `Stable suites passed: ${stableSuites.join(', ')}.`;
    }
  } else {
    headline = 'Full benchmark observation run';
    detail =
      'Full-suite benchmark execution remains observational so unstable suites can be tracked without blocking merges.';

    if (missingStableSuites.length > 0) {
      decision = 'warn';
      reason = `Stable suite metrics were missing: ${missingStableSuites.join(', ')}.`;
    } else if (benchmarkFailed) {
      decision = 'warn';
      reason =
        'One or more observational suites failed; stable-suite enforcement remains separate.';
    }
  }

  return {
    version: 2,
    mode: args.mode,
    timestamp: new Date().toISOString(),
    metadata: {
      commitSha: args.sha,
      branch: args.branch,
      pr: args.pr,
      thresholdPct: Number.parseInt(args.threshold, 10) || 10,
    },
    policy: {
      issue: args.issue,
      stableSuites,
      informationalSuites,
      executedSuites,
    },
    benchmark: {
      exitCode,
      playwrightStatus: playwrightStatus?.status ?? 'missing',
      failedTests: Array.isArray(playwrightStatus?.failedTests) ? playwrightStatus.failedTests.length : 0,
      perfLineCount: perfLines.length,
      observedSuites,
      suiteSummary,
      benchmarkFailed,
      missingStableSuites,
    },
    gating: {
      enabled: gatingEnabled,
      decision,
      reason,
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
  const stableSuites = status.policy.stableSuites.length > 0
    ? status.policy.stableSuites.join(', ')
    : 'none';
  const informationalSuites = status.policy.informationalSuites.length > 0
    ? status.policy.informationalSuites.join(', ')
    : 'none';
  const executedSuites = status.policy.executedSuites.length > 0
    ? status.policy.executedSuites.join(', ')
    : 'none';

  lines.push('## Performance Benchmark Results');
  lines.push('');
  lines.push(`**Commit:** \`${status.metadata.commitSha}\``);
  lines.push(`**Branch:** \`${status.metadata.branch}\``);
  lines.push(`**PR:** \`${status.metadata.pr}\``);
  lines.push(`**Mode:** \`${status.mode}\``);
  lines.push(`**Decision:** \`${status.gating.decision}\``);
  lines.push(`**Merge-blocking enforcement:** \`${status.gating.enabled ? 'enabled' : 'disabled'}\``);
  lines.push('');
  lines.push(`### ${status.summary.headline}`);
  lines.push('');
  lines.push(status.summary.detail);
  lines.push('');
  lines.push('### Suite Policy');
  lines.push(`- Stable suites: \`${stableSuites}\``);
  lines.push(`- Informational suites: \`${informationalSuites}\``);
  lines.push(`- Executed suites in this run: \`${executedSuites}\``);
  lines.push(`- Tracking issue: \`#${status.policy.issue}\``);
  lines.push('');
  lines.push('### Benchmark Status');
  lines.push(`- Playwright status: \`${status.benchmark.playwrightStatus}\``);
  lines.push(`- Benchmark exit code: \`${status.benchmark.exitCode}\``);
  lines.push(`- Failed tests: \`${status.benchmark.failedTests}\``);
  lines.push(`- Perf metric lines captured: \`${status.benchmark.perfLineCount}\``);
  lines.push(`- Observed suites: \`${status.benchmark.observedSuites.join(', ') || 'none'}\``);
  lines.push(`- Gating reason: ${status.gating.reason}`);
  lines.push('');

  if (status.benchmark.missingStableSuites.length > 0) {
    lines.push('### Missing Stable Suites');
    for (const suiteName of status.benchmark.missingStableSuites) {
      lines.push(`- \`${suiteName}\``);
    }
    lines.push('');
  }

  lines.push('### Suite Evidence');
  if (status.benchmark.observedSuites.length === 0) {
    lines.push('- No structured perf lines were captured.');
  } else {
    for (const suiteName of status.benchmark.observedSuites) {
      const suite = status.benchmark.suiteSummary[suiteName];
      lines.push(`- \`${suiteName}\`: ${suite.lineCount} lines, metrics \`${suite.metricKeys.join(', ')}\``);
    }
  }
  lines.push('');

  lines.push('### Captured Perf Lines');
  lines.push('```');
  if (status.summary.perfLines.length > 0) {
    lines.push(...status.summary.perfLines);
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

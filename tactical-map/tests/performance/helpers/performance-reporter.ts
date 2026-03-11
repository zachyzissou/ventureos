/**
 * Performance Report Generator
 *
 * Generates markdown and JSON performance reports from benchmark results.
 * Used by CI to attach reports to PRs and detect regressions.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BenchmarkResult, Baseline } from './benchmark-harness';

export interface PerformanceReport {
  timestamp: string;
  commitSha: string;
  branch: string;
  results: BenchmarkResult[];
  regressions: RegressionEntry[];
  summary: ReportSummary;
}

export interface RegressionEntry {
  benchmark: string;
  metric: string;
  actual: number;
  baseline: number;
  deltaPct: number;
  threshold: number;
}

export interface ReportSummary {
  totalBenchmarks: number;
  passed: number;
  failed: number;
  regressions: number;
  overallStatus: 'pass' | 'fail';
}

// ---------------------------------------------------------------------------
// Baselines
// ---------------------------------------------------------------------------

const BASELINES_PATH = path.resolve(__dirname, '../../../performance-baselines.json');

export interface BaselinesFile {
  version: number;
  updatedAt: string;
  baselines: Record<string, Baseline>;
}

/**
 * Load performance baselines from disk.
 */
export function loadBaselines(): BaselinesFile | null {
  try {
    const raw = fs.readFileSync(BASELINES_PATH, 'utf-8');
    return JSON.parse(raw) as BaselinesFile;
  } catch {
    return null;
  }
}

/**
 * Save performance baselines to disk.
 */
export function saveBaselines(baselines: BaselinesFile): void {
  fs.writeFileSync(BASELINES_PATH, JSON.stringify(baselines, null, 2) + '\n', 'utf-8');
}

/**
 * Update baselines with new measurements (only if CI flag is set).
 */
export function updateBaselines(
  results: BenchmarkResult[],
  existing: BaselinesFile | null
): BaselinesFile {
  const baselines = existing?.baselines ?? {};

  for (const r of results) {
    if (!r.passed) continue; // Don't save failing results as baselines
    if (!r.fps) continue;

    baselines[r.name] = {
      avgFps: r.fps.avgFps,
      p95FrameTimeMs: r.fps.p95FrameTimeMs,
      memoryMB: r.memory
        ? r.memory.after.usedJSHeapSize / 1024 / 1024
        : undefined,
    };
  }

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    baselines,
  };
}

// ---------------------------------------------------------------------------
// Regression Detection
// ---------------------------------------------------------------------------

/**
 * Compare results against baselines and identify regressions.
 *
 * A regression is flagged when:
 * - FPS drops by more than `thresholdPct` below baseline
 * - P95 frame time increases by more than `thresholdPct` above baseline
 * - Memory increases by more than `thresholdPct` above baseline
 */
export function detectRegressions(
  results: BenchmarkResult[],
  baselines: Record<string, Baseline>,
  thresholdPct: number = 10
): RegressionEntry[] {
  const regressions: RegressionEntry[] = [];

  for (const r of results) {
    const bl = baselines[r.name];
    if (!bl) continue; // No baseline to compare against

    if (r.fps) {
      // FPS regression (higher is better)
      const fpsDelta = ((r.fps.avgFps - bl.avgFps) / bl.avgFps) * 100;
      if (fpsDelta < -thresholdPct) {
        regressions.push({
          benchmark: r.name,
          metric: 'avgFps',
          actual: r.fps.avgFps,
          baseline: bl.avgFps,
          deltaPct: Math.round(fpsDelta * 100) / 100,
          threshold: thresholdPct,
        });
      }

      // P95 frame time regression (lower is better)
      const p95Delta = ((r.fps.p95FrameTimeMs - bl.p95FrameTimeMs) / bl.p95FrameTimeMs) * 100;
      if (p95Delta > thresholdPct) {
        regressions.push({
          benchmark: r.name,
          metric: 'p95FrameTimeMs',
          actual: r.fps.p95FrameTimeMs,
          baseline: bl.p95FrameTimeMs,
          deltaPct: Math.round(p95Delta * 100) / 100,
          threshold: thresholdPct,
        });
      }
    }

    // Memory regression
    if (r.memory && bl.memoryMB) {
      const actualMB = r.memory.after.usedJSHeapSize / 1024 / 1024;
      const memDelta = ((actualMB - bl.memoryMB) / bl.memoryMB) * 100;
      if (memDelta > thresholdPct) {
        regressions.push({
          benchmark: r.name,
          metric: 'memoryMB',
          actual: Math.round(actualMB * 100) / 100,
          baseline: bl.memoryMB,
          deltaPct: Math.round(memDelta * 100) / 100,
          threshold: thresholdPct,
        });
      }
    }
  }

  return regressions;
}

// ---------------------------------------------------------------------------
// Report Generation
// ---------------------------------------------------------------------------

/**
 * Generate a full performance report.
 */
export function generateReport(
  results: BenchmarkResult[],
  baselines: Record<string, Baseline>,
  commitSha: string = 'unknown',
  branch: string = 'unknown',
  thresholdPct: number = 10
): PerformanceReport {
  const regressions = detectRegressions(results, baselines, thresholdPct);

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;

  return {
    timestamp: new Date().toISOString(),
    commitSha,
    branch,
    results,
    regressions,
    summary: {
      totalBenchmarks: results.length,
      passed,
      failed,
      regressions: regressions.length,
      overallStatus: regressions.length > 0 || failed > 0 ? 'fail' : 'pass',
    },
  };
}

/**
 * Render a performance report as Markdown (for PR comments / artifacts).
 */
export function renderMarkdown(report: PerformanceReport): string {
  const lines: string[] = [];

  lines.push('# 🏎️ Performance Benchmark Report');
  lines.push('');
  lines.push(`**Branch:** \`${report.branch}\``);
  lines.push(`**Commit:** \`${report.commitSha.slice(0, 8)}\``);
  lines.push(`**Time:** ${report.timestamp}`);
  lines.push(`**Status:** ${report.summary.overallStatus === 'pass' ? '✅ PASS' : '❌ FAIL'}`);
  lines.push('');

  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Benchmarks | ${report.summary.totalBenchmarks} |`);
  lines.push(`| Passed | ${report.summary.passed} |`);
  lines.push(`| Failed | ${report.summary.failed} |`);
  lines.push(`| Regressions | ${report.summary.regressions} |`);
  lines.push('');

  // Regressions
  if (report.regressions.length > 0) {
    lines.push('## ⚠️ Regressions Detected');
    lines.push('');
    lines.push('| Benchmark | Metric | Actual | Baseline | Delta | Threshold |');
    lines.push('|-----------|--------|--------|----------|-------|-----------|');
    for (const reg of report.regressions) {
      lines.push(
        `| ${reg.benchmark} | ${reg.metric} | ${reg.actual} | ${reg.baseline} | ${reg.deltaPct}% | ±${reg.threshold}% |`
      );
    }
    lines.push('');
  }

  // Individual results
  lines.push('## Detailed Results');
  lines.push('');

  for (const r of report.results) {
    lines.push(`### ${r.passed ? '✅' : '❌'} ${r.name}`);
    lines.push('');

    if (r.fps) {
      lines.push('| FPS Metric | Value |');
      lines.push('|------------|-------|');
      lines.push(`| Average FPS | ${r.fps.avgFps} |`);
      lines.push(`| Min FPS | ${r.fps.minFps} |`);
      lines.push(`| Max FPS | ${r.fps.maxFps} |`);
      lines.push(`| P95 Frame Time | ${r.fps.p95FrameTimeMs}ms |`);
      lines.push(`| P99 Frame Time | ${r.fps.p99FrameTimeMs}ms |`);
      lines.push(`| Total Frames | ${r.fps.totalFrames} |`);
      lines.push('');
    }

    if (r.memory) {
      lines.push('| Memory Metric | Value |');
      lines.push('|---------------|-------|');
      lines.push(`| Before | ${(r.memory.before.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB |`);
      lines.push(`| After | ${(r.memory.after.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB |`);
      lines.push(`| Delta | ${(r.memory.deltaBytes / 1024 / 1024).toFixed(2)} MB |`);
      lines.push('');
    }

    if (r.custom && Object.keys(r.custom).length > 0) {
      lines.push('| Custom Metric | Value |');
      lines.push('|---------------|-------|');
      for (const [k, v] of Object.entries(r.custom)) {
        lines.push(`| ${k} | ${v} |`);
      }
      lines.push('');
    }

    if (r.errors.length > 0) {
      lines.push('**Errors:**');
      for (const e of r.errors) {
        lines.push(`- ${e}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Write report artifacts to disk.
 */
export function writeReportArtifacts(
  report: PerformanceReport,
  outputDir: string
): { jsonPath: string; mdPath: string } {
  fs.mkdirSync(outputDir, { recursive: true });

  const jsonPath = path.join(outputDir, 'performance-report.json');
  const mdPath = path.join(outputDir, 'performance-report.md');

  // Strip frame times arrays from JSON (too large)
  const stripped = {
    ...report,
    results: report.results.map((r) => ({
      ...r,
      fps: r.fps ? { ...r.fps, frameTimes: `[${r.fps.frameTimes.length} values omitted]` } : undefined,
    })),
  };

  fs.writeFileSync(jsonPath, JSON.stringify(stripped, null, 2) + '\n', 'utf-8');
  fs.writeFileSync(mdPath, renderMarkdown(report) + '\n', 'utf-8');

  return { jsonPath, mdPath };
}

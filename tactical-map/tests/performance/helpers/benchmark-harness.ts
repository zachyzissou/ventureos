/**
 * Performance Benchmark Harness
 *
 * Provides standardized timing, measurement, and comparison utilities
 * for the VentureOS Tactical Map performance test suite.
 */

import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FPSResult {
  /** Average frames per second over the measurement window. */
  avgFps: number;
  /** Minimum FPS observed (1-second buckets). */
  minFps: number;
  /** Maximum FPS observed. */
  maxFps: number;
  /** 95th percentile frame time in milliseconds. */
  p95FrameTimeMs: number;
  /** 99th percentile frame time in milliseconds. */
  p99FrameTimeMs: number;
  /** Total frames rendered. */
  totalFrames: number;
  /** Measurement duration in milliseconds. */
  durationMs: number;
  /** Per-frame times in ms (for custom analysis). */
  frameTimes: number[];
}

export interface MemorySnapshot {
  /** JS heap used (bytes). */
  usedJSHeapSize: number;
  /** JS heap total allocated (bytes). */
  totalJSHeapSize: number;
  /** JS heap limit (bytes). */
  jsHeapSizeLimit: number;
  /** Timestamp when snapshot was taken. */
  timestamp: number;
}

export interface BenchmarkResult {
  name: string;
  fps?: FPSResult;
  memory?: {
    before: MemorySnapshot;
    after: MemorySnapshot;
    deltaBytes: number;
  };
  custom?: Record<string, number>;
  timestamp: string;
  passed: boolean;
  errors: string[];
}

export interface Baseline {
  avgFps: number;
  p95FrameTimeMs: number;
  memoryMB?: number;
}

// ---------------------------------------------------------------------------
// Core Measurement Functions
// ---------------------------------------------------------------------------

/**
 * Measure FPS via requestAnimationFrame over a given window (ms).
 * Runs inside the browser page context.
 */
export async function measureFPS(page: Page, durationMs: number = 3000): Promise<FPSResult> {
  return page.evaluate(async (dur: number) => {
    const frameTimes: number[] = [];
    let lastTime = performance.now();

    await new Promise<void>((resolve) => {
      function tick() {
        const now = performance.now();
        frameTimes.push(now - lastTime);
        lastTime = now;
        if (now - (lastTime - frameTimes[frameTimes.length - 1]) > dur && frameTimes.length > 10) {
          // Check total elapsed
        }
        const totalElapsed = frameTimes.reduce((a, b) => a + b, 0);
        if (totalElapsed >= dur) {
          resolve();
        } else {
          requestAnimationFrame(tick);
        }
      }
      requestAnimationFrame(tick);
    });

    const totalElapsed = frameTimes.reduce((a, b) => a + b, 0);
    const totalFrames = frameTimes.length;
    const avgFps = (totalFrames / totalElapsed) * 1000;

    // Sort frame times for percentile calc
    const sorted = [...frameTimes].sort((a, b) => a - b);
    const p95Idx = Math.floor(sorted.length * 0.95);
    const p99Idx = Math.floor(sorted.length * 0.99);
    const p95FrameTimeMs = sorted[p95Idx] ?? sorted[sorted.length - 1];
    const p99FrameTimeMs = sorted[p99Idx] ?? sorted[sorted.length - 1];

    // Min/max FPS via 1-second buckets
    const bucketMs = 1000;
    const buckets: number[] = [];
    let bucketStart = 0;
    let bucketFrames = 0;
    let elapsed = 0;

    for (const ft of frameTimes) {
      elapsed += ft;
      bucketFrames++;
      if (elapsed - bucketStart >= bucketMs) {
        const bucketDur = elapsed - bucketStart;
        buckets.push((bucketFrames / bucketDur) * 1000);
        bucketStart = elapsed;
        bucketFrames = 0;
      }
    }
    // Flush remaining
    if (bucketFrames > 0) {
      const bucketDur = elapsed - bucketStart;
      if (bucketDur > 100) {
        buckets.push((bucketFrames / bucketDur) * 1000);
      }
    }

    const minFps = buckets.length > 0 ? Math.min(...buckets) : avgFps;
    const maxFps = buckets.length > 0 ? Math.max(...buckets) : avgFps;

    return {
      avgFps: Math.round(avgFps * 100) / 100,
      minFps: Math.round(minFps * 100) / 100,
      maxFps: Math.round(maxFps * 100) / 100,
      p95FrameTimeMs: Math.round(p95FrameTimeMs * 100) / 100,
      p99FrameTimeMs: Math.round(p99FrameTimeMs * 100) / 100,
      totalFrames,
      durationMs: Math.round(totalElapsed * 100) / 100,
      frameTimes,
    };
  }, durationMs);
}

/**
 * Capture a memory snapshot using Chrome's performance.memory API.
 */
export async function captureMemory(page: Page): Promise<MemorySnapshot> {
  return page.evaluate(() => {
    // performance.memory is Chrome-specific
    const mem = (performance as any).memory;
    if (!mem) {
      return {
        usedJSHeapSize: 0,
        totalJSHeapSize: 0,
        jsHeapSizeLimit: 0,
        timestamp: Date.now(),
      };
    }
    return {
      usedJSHeapSize: mem.usedJSHeapSize,
      totalJSHeapSize: mem.totalJSHeapSize,
      jsHeapSizeLimit: mem.jsHeapSizeLimit,
      timestamp: Date.now(),
    };
  });
}

/**
 * Force a garbage collection cycle (requires --js-flags=--expose-gc).
 * Returns true if GC was triggered, false otherwise.
 */
export async function forceGC(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    if (typeof (globalThis as any).gc === 'function') {
      (globalThis as any).gc();
      return true;
    }
    return false;
  });
}

/**
 * Wait for the tactical map to be fully bootstrapped.
 */
export async function waitForTacticalMap(page: Page, timeoutMs: number = 15000): Promise<void> {
  await page.waitForFunction(
    () => !!(window as any).__TACTICAL_MAP__,
    { timeout: timeoutMs }
  );
}

// ---------------------------------------------------------------------------
// Baseline Comparison
// ---------------------------------------------------------------------------

/**
 * Check if a benchmark result is within acceptable regression thresholds.
 *
 * @param actual Measured value
 * @param baseline Expected baseline value
 * @param thresholdPct Maximum allowed regression percentage (default 10%)
 * @param higherIsBetter If true, value below baseline is a regression (e.g., FPS)
 */
export function checkRegression(
  actual: number,
  baseline: number,
  thresholdPct: number = 10,
  higherIsBetter: boolean = true
): { passed: boolean; deltaPct: number; message: string } {
  const delta = actual - baseline;
  const deltaPct = (delta / baseline) * 100;

  if (higherIsBetter) {
    // For FPS: regression = actual < baseline by more than threshold
    const passed = deltaPct >= -thresholdPct;
    return {
      passed,
      deltaPct: Math.round(deltaPct * 100) / 100,
      message: passed
        ? `✅ ${actual.toFixed(1)} vs baseline ${baseline.toFixed(1)} (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%)`
        : `❌ REGRESSION: ${actual.toFixed(1)} vs baseline ${baseline.toFixed(1)} (${deltaPct.toFixed(1)}%, threshold: -${thresholdPct}%)`,
    };
  } else {
    // For latency/memory: regression = actual > baseline by more than threshold
    const passed = deltaPct <= thresholdPct;
    return {
      passed,
      deltaPct: Math.round(deltaPct * 100) / 100,
      message: passed
        ? `✅ ${actual.toFixed(1)} vs baseline ${baseline.toFixed(1)} (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%)`
        : `❌ REGRESSION: ${actual.toFixed(1)} vs baseline ${baseline.toFixed(1)} (+${deltaPct.toFixed(1)}%, threshold: +${thresholdPct}%)`,
    };
  }
}

// ---------------------------------------------------------------------------
// Report Utilities
// ---------------------------------------------------------------------------

/**
 * Format a benchmark result as a human-readable string.
 */
export function formatResult(result: BenchmarkResult): string {
  const lines: string[] = [];
  lines.push(`## ${result.name}`);
  lines.push(`Timestamp: ${result.timestamp}`);
  lines.push(`Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);

  if (result.fps) {
    lines.push('');
    lines.push('### FPS Metrics');
    lines.push(`- Average FPS: ${result.fps.avgFps}`);
    lines.push(`- Min FPS: ${result.fps.minFps}`);
    lines.push(`- Max FPS: ${result.fps.maxFps}`);
    lines.push(`- P95 Frame Time: ${result.fps.p95FrameTimeMs}ms`);
    lines.push(`- P99 Frame Time: ${result.fps.p99FrameTimeMs}ms`);
    lines.push(`- Total Frames: ${result.fps.totalFrames}`);
    lines.push(`- Duration: ${result.fps.durationMs}ms`);
  }

  if (result.memory) {
    lines.push('');
    lines.push('### Memory');
    lines.push(`- Before: ${(result.memory.before.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`);
    lines.push(`- After: ${(result.memory.after.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`);
    lines.push(`- Delta: ${(result.memory.deltaBytes / 1024 / 1024).toFixed(2)} MB`);
  }

  if (result.custom && Object.keys(result.custom).length > 0) {
    lines.push('');
    lines.push('### Custom Metrics');
    for (const [k, v] of Object.entries(result.custom)) {
      lines.push(`- ${k}: ${v}`);
    }
  }

  if (result.errors.length > 0) {
    lines.push('');
    lines.push('### Errors');
    for (const e of result.errors) {
      lines.push(`- ${e}`);
    }
  }

  return lines.join('\n');
}

/**
 * Render Performance Benchmarks
 *
 * Measures FPS, frame time distribution, and render loop profiling
 * for the VentureOS Tactical Map.
 *
 * Target: 60 FPS stable under normal conditions.
 * Threshold: ≥55 FPS (allows for CI environment variance).
 *
 * Run: npx playwright test tests/performance/render-performance.test.ts
 * Requires: PERF=1 environment variable (skipped otherwise for speed)
 */

import { test, expect } from '@playwright/test';
import {
  measureFPS,
  waitForTacticalMap,
} from './helpers/benchmark-harness';
import { applyMockLoadPayload, installMockTacticalMapBackend } from './helpers/mock-backend';

test.describe('Render Performance', () => {
  test.skip(() => process.env.PERF !== '1', 'Set PERF=1 to run performance tests');
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await installMockTacticalMapBackend(page, { profile: 'baseline' });
    await page.goto('/');
    await waitForTacticalMap(page);
  });

  test('idle state maintains ≥55 FPS', async ({ page }) => {
    await applyMockLoadPayload(page, 'baseline');

    // All agents idle — minimal render load with stable economy/health overlays.
    await page.evaluate(() => {
      const tm = (window as any).__TACTICAL_MAP__;
      const curr = tm.mapStore.get();
      const next = structuredClone(curr);
      for (const id of Object.keys(next.agents)) {
        next.agents[id].state = 'IDLE';
        next.agents[id].sessions = 0;
        next.agents[id].activeSessions = [];
      }
      tm.setMapState(next);
      tm.resume();
    });

    // Let ticker stabilize (2 seconds warmup)
    await page.waitForTimeout(2000);

    const fps = await measureFPS(page, 3000);

    console.log(`[perf:render:idle] avg=${fps.avgFps} min=${fps.minFps} p95ft=${fps.p95FrameTimeMs}ms`);

    expect(fps.avgFps).toBeGreaterThanOrEqual(55);
    expect(fps.p95FrameTimeMs).toBeLessThan(30);
  });

  test('all agents active maintains ≥55 FPS', async ({ page }) => {
    await applyMockLoadPayload(page, 'stress');
    await page.evaluate(() => {
      const tm = (window as any).__TACTICAL_MAP__;
      tm.resume();
    });

    await page.waitForTimeout(2000);

    const fps = await measureFPS(page, 5000);

    console.log(`[perf:render:active] avg=${fps.avgFps} min=${fps.minFps} p95ft=${fps.p95FrameTimeMs}ms`);

    expect(fps.avgFps).toBeGreaterThanOrEqual(55);
    expect(fps.p95FrameTimeMs).toBeLessThan(30);
  });

  test('mixed states (active + overloaded + error) maintains ≥50 FPS', async ({ page }) => {
    await applyMockLoadPayload(page, 'stress');

    // Worst-case visual complexity: multiple states, particles, errors.
    await page.evaluate(() => {
      const tm = (window as any).__TACTICAL_MAP__;
      const curr = tm.mapStore.get();
      const next = structuredClone(curr);

      const states: Record<string, string> = {
        venture_research: 'ACTIVE',
        venture_infrastructure: 'OVERLOADED',
        venture_security: 'ERROR',
        venture_evidence: 'ACTIVE',
        venture_memory: 'OVERLOADED',
        venture_delivery: 'ACTIVE',
        venture_strategy: 'ERROR',
      };

      for (const [id, state] of Object.entries(states)) {
        next.agents[id].state = state;
        next.agents[id].sessions = state === 'OVERLOADED' ? 5 : 3;
        next.agents[id].activeSessions = Array.from(
          { length: state === 'OVERLOADED' ? 5 : 3 },
          (_, i) => ({
            id: `${id}:bench-${i}`,
            label: `Mixed state benchmark ${i}`,
            startedAt: new Date().toISOString(),
            estimatedMs: 60_000,
            progress: Math.round(((i + 1) / 6) * 100) / 100,
          })
        );
      }

      tm.setMapState(next);
      tm.resume();
    });

    await page.waitForTimeout(2000);

    const fps = await measureFPS(page, 5000);

    console.log(`[perf:render:mixed] avg=${fps.avgFps} min=${fps.minFps} p95ft=${fps.p95FrameTimeMs}ms`);

    expect(fps.avgFps).toBeGreaterThanOrEqual(50);
    expect(fps.p95FrameTimeMs).toBeLessThan(35);
  });

  test('frame time consistency (no spikes >50ms)', async ({ page }) => {
    await applyMockLoadPayload(page, 'baseline');

    // Activate moderate load and check for frame time outliers.
    await page.evaluate(() => {
      const tm = (window as any).__TACTICAL_MAP__;
      const curr = tm.mapStore.get();
      const next = structuredClone(curr);

      for (const id of ['venture_research', 'venture_infrastructure', 'venture_security', 'venture_evidence']) {
        next.agents[id].state = 'ACTIVE';
        next.agents[id].sessions = 2;
        next.agents[id].activeSessions = [
          {
            id: `${id}:frame-test`,
            label: 'Frame consistency test',
            startedAt: new Date().toISOString(),
          },
        ];
      }

      tm.setMapState(next);
      tm.resume();
    });

    await page.waitForTimeout(2000);

    const fps = await measureFPS(page, 3000);

    // Count frames that exceed 50ms (major jank)
    const jankFrames = fps.frameTimes.filter((t) => t > 50).length;
    const jankRatio = jankFrames / fps.totalFrames;

    console.log(
      `[perf:render:consistency] jank_frames=${jankFrames}/${fps.totalFrames} (${(jankRatio * 100).toFixed(1)}%)`
    );

    // Allow at most 2% jank frames
    expect(jankRatio).toBeLessThan(0.02);
  });

  test('render loop profiling — ticker callback timing', async ({ page }) => {
    await applyMockLoadPayload(page, 'stress');

    // Measure render call timing directly so hosted runners do not need to
    // sustain an entire rAF sequence just to collect samples.
    await page.evaluate(() => {
      const tm = (window as any).__TACTICAL_MAP__;
      const curr = tm.mapStore.get();
      const next = structuredClone(curr);
      for (const id of ['venture_research', 'venture_infrastructure', 'venture_security', 'venture_evidence', 'venture_memory', 'venture_delivery', 'venture_strategy']) {
        next.agents[id].state = 'ACTIVE';
        next.agents[id].sessions = 3;
      }
      tm.setMapState(next);
      tm.resume();
    });

    await page.waitForTimeout(1000);

    const profile = await page.evaluate(async () => {
      const tm = (window as any).__TACTICAL_MAP__;
      const app = tm.app;

      const timings: number[] = [];
      for (let i = 0; i < 60; i++) {
        const t0 = performance.now();
        app.render();
        const t1 = performance.now();
        timings.push(t1 - t0);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const sorted = [...timings].sort((a, b) => a - b);
      return {
        avgRenderMs: timings.reduce((a, b) => a + b, 0) / timings.length,
        p50RenderMs: sorted[Math.floor(sorted.length * 0.5)],
        p95RenderMs: sorted[Math.floor(sorted.length * 0.95)],
        p99RenderMs: sorted[Math.floor(sorted.length * 0.99)],
        maxRenderMs: sorted[sorted.length - 1],
        samples: timings.length,
      };
    });

    console.log(
      `[perf:render:profile] avg=${profile.avgRenderMs.toFixed(2)}ms p95=${profile.p95RenderMs.toFixed(2)}ms p99=${profile.p99RenderMs.toFixed(2)}ms max=${profile.maxRenderMs.toFixed(2)}ms`
    );

    // Render call should take <8ms to leave room for other work in 16.67ms budget
    expect(profile.p95RenderMs).toBeLessThan(8);
  });

  test('camera zoom and pan maintain ≥50 FPS', async ({ page }) => {
    await applyMockLoadPayload(page, 'baseline');
    await page.evaluate(() => {
      const tm = (window as any).__TACTICAL_MAP__;
      tm.resume();
    });

    await page.waitForTimeout(1000);

    // Simulate zoom via wheel events
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Start FPS measurement in parallel with interactions
    const fpsPromise = measureFPS(page, 4000);

    // Zoom in/out while measuring
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -120); // zoom in
      await page.waitForTimeout(50);
    }
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 120); // zoom out
      await page.waitForTimeout(50);
    }

    // Pan across
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 0; i < 20; i++) {
      await page.mouse.move(cx + i * 10, cy + i * 5);
      await page.waitForTimeout(50);
    }
    await page.mouse.up();

    const fps = await fpsPromise;

    console.log(`[perf:render:camera] avg=${fps.avgFps} min=${fps.minFps} p95ft=${fps.p95FrameTimeMs}ms`);

    expect(fps.avgFps).toBeGreaterThanOrEqual(50);
  });
});

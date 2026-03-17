/**
 * Load Testing Benchmarks
 *
 * Stress tests the VentureOS Tactical Map renderer at different load levels:
 * - Baseline (100 agents equivalent): moderate sessions, light particles
 * - Stress (500 agents equivalent): heavy sessions, many active, particles
 * - Maximum (1000 agents equivalent): all overloaded, peak particles, economy + health overlays
 *
 * Since the app has a fixed 8-agent architecture, "agent count" is simulated
 * by scaling session complexity, particle emissions, economy trend depth,
 * and health overlay density.
 *
 * Run: PERF=1 npx playwright test tests/performance/load-testing.test.ts
 */

import { test, expect } from '@playwright/test';
import {
  measureFPS,
  captureMemory,
  waitForTacticalMap,
  forceGC,
} from './helpers/benchmark-harness';
import { generateLoadPayload, type LoadProfile } from './helpers/mock-data-generator';

/**
 * Inject a complete load scenario into the page.
 */
async function injectLoad(page: import('@playwright/test').Page, profile: LoadProfile) {
  const payload = generateLoadPayload(profile);

  await page.evaluate((data) => {
    const tm = (window as any).__TACTICAL_MAP__;

    // Apply map state (agent positions, states, sessions)
    const mapState = data.mapState;
    tm.setMapState(mapState);

    // Apply economy state
    const econ = tm.economyStore.get();
    const nextEcon = structuredClone(econ);
    for (const agent of data.economy) {
      if (nextEcon.agents[agent.agentId]) {
        nextEcon.agents[agent.agentId].budgetUsed = agent.budgetUsed;
        nextEcon.agents[agent.agentId].budgetLimit = agent.budgetLimit;
        nextEcon.agents[agent.agentId].costPerHour = agent.costPerHour;
      }
    }
    nextEcon.updatedAt = Date.now();
    tm.setEconomyState(nextEcon);

    // Apply health state
    const health = tm.healthStore.get();
    const nextHealth = structuredClone(health);
    for (const agent of data.health) {
      if (nextHealth.agents[agent.agentId]) {
        nextHealth.agents[agent.agentId].status = agent.status;
        nextHealth.agents[agent.agentId].connectivity = agent.connectivity;
        nextHealth.agents[agent.agentId].metrics = agent.metrics;
      }
    }
    nextHealth.updatedAt = Date.now();
    tm.setHealthState(nextHealth);

    tm.resume();
  }, payload);
}

test.describe('Load Testing', () => {
  test.skip(() => process.env.PERF !== '1', 'Set PERF=1 to run performance tests');
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await waitForTacticalMap(page);
  });

  test('baseline load (100 agents equiv) — ≥55 FPS, memory <100MB', async ({ page }) => {
    await injectLoad(page, 'baseline');
    await page.waitForTimeout(2000);

    await forceGC(page);
    const memBefore = await captureMemory(page);

    const fps = await measureFPS(page, 5000);

    const memAfter = await captureMemory(page);
    const memDeltaMB = (memAfter.usedJSHeapSize - memBefore.usedJSHeapSize) / 1024 / 1024;
    const memUsedMB = memAfter.usedJSHeapSize / 1024 / 1024;

    console.log(
      `[perf:load:baseline] fps=${fps.avgFps} min=${fps.minFps} mem=${memUsedMB.toFixed(1)}MB delta=${memDeltaMB.toFixed(1)}MB`
    );

    expect(fps.avgFps).toBeGreaterThanOrEqual(55);
    expect(memUsedMB).toBeLessThan(100);
  });

  test('stress load (500 agents equiv) — ≥45 FPS, memory <200MB', async ({ page }) => {
    await injectLoad(page, 'stress');
    await page.waitForTimeout(2000);

    await forceGC(page);
    const memBefore = await captureMemory(page);

    const fps = await measureFPS(page, 5000);

    const memAfter = await captureMemory(page);
    const memUsedMB = memAfter.usedJSHeapSize / 1024 / 1024;

    console.log(
      `[perf:load:stress] fps=${fps.avgFps} min=${fps.minFps} p95ft=${fps.p95FrameTimeMs}ms mem=${memUsedMB.toFixed(1)}MB`
    );

    expect(fps.avgFps).toBeGreaterThanOrEqual(45);
    expect(fps.p95FrameTimeMs).toBeLessThan(40); // 25fps floor
    expect(memUsedMB).toBeLessThan(200);
  });

  test('maximum load (1000 agents equiv) — ≥30 FPS, memory <300MB', async ({ page }) => {
    await injectLoad(page, 'maximum');
    await page.waitForTimeout(3000);

    await forceGC(page);
    const memBefore = await captureMemory(page);

    const fps = await measureFPS(page, 5000);

    const memAfter = await captureMemory(page);
    const memUsedMB = memAfter.usedJSHeapSize / 1024 / 1024;

    console.log(
      `[perf:load:maximum] fps=${fps.avgFps} min=${fps.minFps} p95ft=${fps.p95FrameTimeMs}ms mem=${memUsedMB.toFixed(1)}MB`
    );

    expect(fps.avgFps).toBeGreaterThanOrEqual(30);
    expect(memUsedMB).toBeLessThan(300);
  });

  test('sustained load — FPS does not degrade over 30 seconds', async ({ page }) => {
    await injectLoad(page, 'stress');
    await page.waitForTimeout(2000);

    // Measure FPS in 5-second windows
    const windows: number[] = [];
    for (let i = 0; i < 6; i++) {
      const fps = await measureFPS(page, 5000);
      windows.push(fps.avgFps);
      console.log(`[perf:load:sustained] window ${i + 1}/6: ${fps.avgFps} FPS`);
    }

    const firstWindow = windows[0];
    const lastWindow = windows[windows.length - 1];
    const degradation = ((lastWindow - firstWindow) / firstWindow) * 100;

    console.log(
      `[perf:load:sustained] first=${firstWindow.toFixed(1)} last=${lastWindow.toFixed(1)} degradation=${degradation.toFixed(1)}%`
    );

    // FPS should not degrade by more than 15% over 30 seconds
    expect(degradation).toBeGreaterThan(-15);
    // All windows should stay above minimum threshold
    for (const w of windows) {
      expect(w).toBeGreaterThanOrEqual(35);
    }
  });

  test('rapid state transitions do not cause frame drops', async ({ page }) => {
    // Start measurement
    const fpsPromise = measureFPS(page, 6000);

    // Rapidly toggle states every 200ms during measurement
    for (let i = 0; i < 25; i++) {
      const states = ['IDLE', 'ACTIVE', 'OVERLOADED', 'ERROR'];
      const state = states[i % states.length];

      await page.evaluate((s) => {
        const tm = (window as any).__TACTICAL_MAP__;
        const curr = tm.mapStore.get();
        const next = structuredClone(curr);

        for (const id of ['venture_research', 'venture_infrastructure', 'venture_security', 'venture_evidence', 'venture_memory', 'venture_delivery', 'venture_strategy']) {
          next.agents[id].state = s;
          next.agents[id].sessions = s === 'OVERLOADED' ? 5 : s === 'ACTIVE' ? 3 : 0;
        }

        tm.setMapState(next);
      }, state);

      await page.waitForTimeout(200);
    }

    const fps = await fpsPromise;

    console.log(
      `[perf:load:transitions] avg=${fps.avgFps} min=${fps.minFps} p95ft=${fps.p95FrameTimeMs}ms`
    );

    // Even with rapid transitions, FPS should stay reasonable
    expect(fps.avgFps).toBeGreaterThanOrEqual(40);
  });

  test('memory usage at each load tier', async ({ page }) => {
    const profiles: LoadProfile[] = ['baseline', 'stress', 'maximum'];
    const memoryResults: Record<string, number> = {};

    for (const profile of profiles) {
      await forceGC(page);
      await page.waitForTimeout(500);

      await injectLoad(page, profile);
      await page.waitForTimeout(3000); // Let things settle

      const mem = await captureMemory(page);
      const usedMB = mem.usedJSHeapSize / 1024 / 1024;
      memoryResults[profile] = Math.round(usedMB * 100) / 100;

      console.log(`[perf:load:memory] ${profile}: ${usedMB.toFixed(2)} MB`);
    }

    // Memory should scale sub-linearly
    // Stress should be less than 3x baseline
    if (memoryResults.baseline > 0) {
      const stressRatio = memoryResults.stress / memoryResults.baseline;
      const maxRatio = memoryResults.maximum / memoryResults.baseline;

      console.log(`[perf:load:memory] stress/baseline ratio: ${stressRatio.toFixed(2)}x`);
      console.log(`[perf:load:memory] maximum/baseline ratio: ${maxRatio.toFixed(2)}x`);

      expect(stressRatio).toBeLessThan(3);
      expect(maxRatio).toBeLessThan(5);
    }
  });
});

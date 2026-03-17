/**
 * Network Latency Simulation Tests
 *
 * Tests Tactical Map behavior under degraded network conditions:
 * - Simulated API delays (50ms, 200ms, 500ms)
 * - WebSocket reconnection performance
 * - Graceful degradation under network failures
 *
 * Uses Playwright's route API to simulate network conditions
 * (more reliable than CDP throttling for specific endpoints).
 *
 * Run: PERF=1 npx playwright test tests/performance/network-latency.test.ts
 */

import { test, expect } from '@playwright/test';
import {
  measureFPS,
  waitForTacticalMap,
} from './helpers/benchmark-harness';
import {
  applyMockLoadPayload,
  exerciseApiBurst,
  installMockTacticalMapBackend,
} from './helpers/mock-backend';

/**
 * Add artificial latency to all API routes.
 */
async function addLatency(page: import('@playwright/test').Page, delayMs: number) {
  await installMockTacticalMapBackend(page, { profile: 'stress', delayMs });
}

/**
 * Block all API routes (simulate network failure).
 */
async function blockAPIs(page: import('@playwright/test').Page) {
  await page.route('**/api/tactical-map/**', async (route) => {
    await route.abort('connectionfailed');
  });
  await page.route('**/api/rpg/stats', async (route) => {
    await route.abort('connectionfailed');
  });
}

test.describe('Network Latency Simulation', () => {
  test.skip(() => process.env.PERF !== '1', 'Set PERF=1 to run performance tests');
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('renders smoothly with 50ms API latency', async ({ page }) => {
    await addLatency(page, 50);
    await page.goto('/');
    await waitForTacticalMap(page);
    await applyMockLoadPayload(page, 'baseline');
    await page.evaluate(() => {
      const tm = (window as any).__TACTICAL_MAP__;
      tm.resume();
    });

    await page.waitForTimeout(2000);

    const fpsPromise = measureFPS(page, 3000);
    await page.waitForTimeout(300);
    await exerciseApiBurst(page, 8);
    const fps = await fpsPromise;

    console.log(`[perf:network:50ms] avg=${fps.avgFps} min=${fps.minFps}`);

    // API latency should NOT affect render FPS (async polling)
    expect(fps.avgFps).toBeGreaterThanOrEqual(55);
  });

  test('renders smoothly with 200ms API latency', async ({ page }) => {
    await addLatency(page, 200);
    await page.goto('/');
    await waitForTacticalMap(page);
    await applyMockLoadPayload(page, 'stress');
    await page.evaluate(() => {
      const tm = (window as any).__TACTICAL_MAP__;
      tm.resume();
    });

    await page.waitForTimeout(2000);

    const fpsPromise = measureFPS(page, 3000);
    await page.waitForTimeout(300);
    await exerciseApiBurst(page, 10);
    const fps = await fpsPromise;

    console.log(`[perf:network:200ms] avg=${fps.avgFps} min=${fps.minFps}`);

    // Render should be decoupled from API latency
    expect(fps.avgFps).toBeGreaterThanOrEqual(50);
  });

  test('renders smoothly with 500ms API latency', async ({ page }) => {
    await addLatency(page, 500);
    await page.goto('/');
    await waitForTacticalMap(page);
    await applyMockLoadPayload(page, 'baseline');
    await page.evaluate(() => {
      const tm = (window as any).__TACTICAL_MAP__;
      tm.resume();
    });

    await page.waitForTimeout(2000);

    const fpsPromise = measureFPS(page, 3000);
    await page.waitForTimeout(300);
    await exerciseApiBurst(page, 12);
    const fps = await fpsPromise;

    console.log(`[perf:network:500ms] avg=${fps.avgFps} min=${fps.minFps}`);

    // Even severe latency should not affect client-side rendering
    expect(fps.avgFps).toBeGreaterThanOrEqual(45);
  });

  test('graceful degradation on API failure (no crash)', async ({ page }) => {
    await installMockTacticalMapBackend(page, { profile: 'baseline' });
    await page.goto('/');
    await waitForTacticalMap(page);
    await applyMockLoadPayload(page, 'baseline');
    await page.evaluate(() => {
      const tm = (window as any).__TACTICAL_MAP__;
      tm.resume();
    });

    await page.waitForTimeout(1000);

    // Now block all APIs
    await blockAPIs(page);

    const fpsPromise = measureFPS(page, 3000);
    await page.waitForTimeout(300);
    await exerciseApiBurst(page, 10);

    // App should still be rendering (not crashed)
    const fps = await fpsPromise;

    console.log(`[perf:network:failure] avg=${fps.avgFps} min=${fps.minFps}`);

    // Should still render, just with stale data
    expect(fps.avgFps).toBeGreaterThanOrEqual(40);

    // Check no uncaught errors crashed the app
    const appAlive = await page.evaluate(() => {
      return !!(window as any).__TACTICAL_MAP__?.app?.ticker;
    });
    expect(appAlive).toBe(true);
  });

  test('WebSocket reconnection does not block render loop', async ({ page }) => {
    await installMockTacticalMapBackend(page, { profile: 'baseline' });
    // Abort the resource stream handshake so the client exercises reconnect backoff
    // without relying on a real backend.
    await page.route('**/api/tactical-map/resources/stream', async (route) => {
      await route.abort('connectionfailed');
    });

    await page.goto('/');
    await waitForTacticalMap(page, { stopClients: false });
    await applyMockLoadPayload(page, 'baseline');
    await page.evaluate(() => {
      const tm = (window as any).__TACTICAL_MAP__;
      tm.resume();
    });

    // Wait for reconnection attempts
    await page.waitForTimeout(5000);

    // Measure FPS during reconnection backoff period
    const fps = await measureFPS(page, 3000);

    console.log(`[perf:network:ws-reconnect] avg=${fps.avgFps} min=${fps.minFps}`);

    // Render loop should be unaffected by WS reconnection logic
    expect(fps.avgFps).toBeGreaterThanOrEqual(50);
  });

  test('recovery after network restoration', async ({ page }) => {
    await installMockTacticalMapBackend(page, { profile: 'baseline' });
    await page.goto('/');
    await waitForTacticalMap(page);
    await applyMockLoadPayload(page, 'baseline');
    await page.evaluate(() => {
      const tm = (window as any).__TACTICAL_MAP__;
      tm.resume();
    });

    // Baseline FPS
    await page.waitForTimeout(1000);
    const fpsBefore = await measureFPS(page, 2000);

    // Block network
    await blockAPIs(page);
    await exerciseApiBurst(page, 8);
    await page.waitForTimeout(500);

    // Restore network (unroute)
    await page.unrouteAll();
    await installMockTacticalMapBackend(page, { profile: 'baseline' });
    await page.waitForTimeout(1000);

    // FPS after recovery
    const fpsAfter = await measureFPS(page, 2000);

    console.log(
      `[perf:network:recovery] before=${fpsBefore.avgFps} after=${fpsAfter.avgFps}`
    );

    // FPS should recover to near pre-failure levels (within 15%)
    const degradation = ((fpsAfter.avgFps - fpsBefore.avgFps) / fpsBefore.avgFps) * 100;
    expect(degradation).toBeGreaterThan(-15);
  });

  test('burst API responses do not cause frame drops', async ({ page }) => {
    // Simulate a scenario where many delayed responses arrive at once
    let delayedCount = 0;
    const batchSize = 5;

    await installMockTacticalMapBackend(page, { profile: 'baseline' });
    await page.route('**/api/tactical-map/state', async (route) => {
      delayedCount++;
      if (delayedCount <= batchSize) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          updatedAt: new Date().toISOString(),
          agents: {},
        }),
      });
    });

    await page.goto('/');
    await waitForTacticalMap(page);
    await applyMockLoadPayload(page, 'baseline');
    await page.evaluate(() => {
      const tm = (window as any).__TACTICAL_MAP__;
      tm.resume();
    });

    // Measure during the burst arrival window
    const fpsPromise = measureFPS(page, 3000);
    await page.waitForTimeout(300);
    await exerciseApiBurst(page, 8);
    const fps = await fpsPromise;

    console.log(`[perf:network:burst] avg=${fps.avgFps} min=${fps.minFps}`);

    // Burst processing should not drop below usable FPS
    expect(fps.avgFps).toBeGreaterThanOrEqual(40);
  });
});

/**
 * Memory Leak Detection Tests
 *
 * Detects memory leaks in the VentureOS Tactical Map by:
 * 1. Running long sessions (simulated via rapid state cycling)
 * 2. Comparing heap snapshots over time
 * 3. Checking for monotonic memory growth
 *
 * A "leak" is defined as heap usage growing >20% after N cycles
 * when it should have stabilized.
 *
 * Run: PERF=1 npx playwright test tests/performance/memory-leak.test.ts
 */

import { test, expect } from '@playwright/test';
import {
  captureMemory,
  waitForTacticalMap,
  forceGC,
  type MemorySnapshot,
} from './helpers/benchmark-harness';
import { generateLoadPayload } from './helpers/mock-data-generator';

/** Helper: inject a load and let it run, then clear it. */
async function cycleLoad(page: import('@playwright/test').Page) {
  const payload = generateLoadPayload('stress');

  // Apply load
  await page.evaluate((data) => {
    const tm = (window as any).__TACTICAL_MAP__;
    tm.setMapState(data.mapState);
    tm.resume();
  }, payload);

  await page.waitForTimeout(2000);

  // Reset to idle
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
  });

  await page.waitForTimeout(1000);
}

test.describe('Memory Leak Detection', () => {
  test.skip(() => process.env.PERF !== '1', 'Set PERF=1 to run performance tests');
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await waitForTacticalMap(page);
  });

  test('no leak after 10 load/unload cycles', async ({ page }) => {
    // Warmup: run 2 cycles to stabilize JIT and initial allocations
    for (let i = 0; i < 2; i++) {
      await cycleLoad(page);
    }

    await forceGC(page);
    await page.waitForTimeout(500);
    const baseline = await captureMemory(page);
    const baselineMB = baseline.usedJSHeapSize / 1024 / 1024;

    console.log(`[perf:memory:leak] baseline after warmup: ${baselineMB.toFixed(2)} MB`);

    // Run 10 stress cycles
    const snapshots: MemorySnapshot[] = [baseline];
    for (let i = 0; i < 10; i++) {
      await cycleLoad(page);
      await forceGC(page);
      await page.waitForTimeout(300);

      const snap = await captureMemory(page);
      snapshots.push(snap);

      const mb = snap.usedJSHeapSize / 1024 / 1024;
      console.log(`[perf:memory:leak] cycle ${i + 1}/10: ${mb.toFixed(2)} MB`);
    }

    const finalMB = snapshots[snapshots.length - 1].usedJSHeapSize / 1024 / 1024;
    const growthMB = finalMB - baselineMB;
    const growthPct = (growthMB / baselineMB) * 100;

    console.log(
      `[perf:memory:leak] growth: ${growthMB.toFixed(2)} MB (${growthPct.toFixed(1)}%)`
    );

    // Memory should not grow more than 20% after cycles
    expect(growthPct).toBeLessThan(20);
  });

  test('no leak from economy state updates', async ({ page }) => {
    // Warmup
    await page.waitForTimeout(2000);
    await forceGC(page);
    await page.waitForTimeout(500);
    const baseline = await captureMemory(page);

    // Rapidly update economy state 100 times
    await page.evaluate(() => {
      const tm = (window as any).__TACTICAL_MAP__;

      for (let i = 0; i < 100; i++) {
        const econ = tm.economyStore.get();
        const next = structuredClone(econ);
        next.updatedAt = Date.now();

        // Simulate trend data accumulation
        for (const id of Object.keys(next.agents)) {
          const agent = next.agents[id];
          if (agent && agent.trend) {
            agent.trend.push({ ts: Date.now(), value: Math.random() * 100 });
            // The app should be trimming old data; if not, this will leak
          }
        }

        tm.setEconomyState(next);
      }
    });

    await page.waitForTimeout(1000);
    await forceGC(page);
    await page.waitForTimeout(500);
    const after = await captureMemory(page);

    const baselineMB = baseline.usedJSHeapSize / 1024 / 1024;
    const afterMB = after.usedJSHeapSize / 1024 / 1024;
    const growthPct = ((afterMB - baselineMB) / baselineMB) * 100;

    console.log(
      `[perf:memory:economy] baseline=${baselineMB.toFixed(2)}MB after=${afterMB.toFixed(2)}MB growth=${growthPct.toFixed(1)}%`
    );

    expect(growthPct).toBeLessThan(25);
  });

  test('no leak from health state updates', async ({ page }) => {
    await page.waitForTimeout(2000);
    await forceGC(page);
    await page.waitForTimeout(500);
    const baseline = await captureMemory(page);

    // Rapidly update health state 100 times with alerts
    await page.evaluate(() => {
      const tm = (window as any).__TACTICAL_MAP__;

      for (let i = 0; i < 100; i++) {
        const health = tm.healthStore.get();
        const next = structuredClone(health);
        next.updatedAt = Date.now();

        // Add and expire alerts (should not accumulate)
        if (next.alerts) {
          next.alerts.push({
            id: `test-alert-${i}`,
            severity: 'P1',
            state: 'active',
            agentId: 'venture_research',
            title: 'Test Alert',
            message: `Health alert iteration ${i}`,
            createdAt: Date.now() - 120_000, // old enough to expire
            ttlMs: 60_000,
          });
        }

        tm.setHealthState(next);
      }
    });

    await page.waitForTimeout(1000);
    await forceGC(page);
    await page.waitForTimeout(500);
    const after = await captureMemory(page);

    const baselineMB = baseline.usedJSHeapSize / 1024 / 1024;
    const afterMB = after.usedJSHeapSize / 1024 / 1024;
    const growthPct = ((afterMB - baselineMB) / baselineMB) * 100;

    console.log(
      `[perf:memory:health] baseline=${baselineMB.toFixed(2)}MB after=${afterMB.toFixed(2)}MB growth=${growthPct.toFixed(1)}%`
    );

    expect(growthPct).toBeLessThan(25);
  });

  test('no leak from MapState churn (store subscriptions)', async ({ page }) => {
    await page.waitForTimeout(2000);
    await forceGC(page);
    await page.waitForTimeout(500);
    const baseline = await captureMemory(page);

    // Rapidly update map state 200 times (tests store subscription cleanup)
    await page.evaluate(() => {
      const tm = (window as any).__TACTICAL_MAP__;
      const agentIds = ['venture_research', 'venture_infrastructure', 'venture_security', 'venture_evidence', 'venture_memory', 'venture_delivery', 'venture_strategy'];

      for (let i = 0; i < 200; i++) {
        const curr = tm.mapStore.get();
        const next = structuredClone(curr);
        next.updatedAt = new Date().toISOString();

        // Alternate between states to maximize subscriber work
        for (const id of agentIds) {
          next.agents[id].state = i % 2 === 0 ? 'ACTIVE' : 'IDLE';
          next.agents[id].sessions = i % 2 === 0 ? 3 : 0;
          next.agents[id].activeSessions = i % 2 === 0
            ? [{ id: `${id}:churn-${i}`, label: `Churn test ${i}`, startedAt: new Date().toISOString() }]
            : [];
        }

        tm.setMapState(next);
      }
    });

    await page.waitForTimeout(2000);
    await forceGC(page);
    await page.waitForTimeout(500);
    const after = await captureMemory(page);

    const baselineMB = baseline.usedJSHeapSize / 1024 / 1024;
    const afterMB = after.usedJSHeapSize / 1024 / 1024;
    const growthPct = ((afterMB - baselineMB) / baselineMB) * 100;

    console.log(
      `[perf:memory:churn] baseline=${baselineMB.toFixed(2)}MB after=${afterMB.toFixed(2)}MB growth=${growthPct.toFixed(1)}%`
    );

    // 200 rapid state changes should not cause significant growth
    expect(growthPct).toBeLessThan(30);
  });

  test('heap size trend is non-monotonic over extended session', async ({ page }) => {
    // Simulate a long session with 20 measurement points
    const measurements: number[] = [];

    for (let i = 0; i < 20; i++) {
      // Alternate between heavy and light load
      if (i % 2 === 0) {
        await page.evaluate(() => {
          const tm = (window as any).__TACTICAL_MAP__;
          const curr = tm.mapStore.get();
          const next = structuredClone(curr);
          for (const id of Object.keys(next.agents)) {
            if (id === 'venture_control') continue;
            next.agents[id].state = 'ACTIVE';
            next.agents[id].sessions = 4;
          }
          tm.setMapState(next);
        });
      } else {
        await page.evaluate(() => {
          const tm = (window as any).__TACTICAL_MAP__;
          const curr = tm.mapStore.get();
          const next = structuredClone(curr);
          for (const id of Object.keys(next.agents)) {
            next.agents[id].state = 'IDLE';
            next.agents[id].sessions = 0;
          }
          tm.setMapState(next);
        });
      }

      await page.waitForTimeout(1500);
      await forceGC(page);
      await page.waitForTimeout(300);

      const mem = await captureMemory(page);
      const mb = mem.usedJSHeapSize / 1024 / 1024;
      measurements.push(mb);
    }

    // Check that memory doesn't monotonically increase
    // (some up-and-down is expected; pure monotonic growth signals a leak)
    let monotonic = true;
    for (let i = 1; i < measurements.length; i++) {
      if (measurements[i] < measurements[i - 1]) {
        monotonic = false;
        break;
      }
    }

    // Also check: final value shouldn't be >50% more than minimum after warmup
    const afterWarmup = measurements.slice(4);
    const minMB = Math.min(...afterWarmup);
    const maxMB = Math.max(...afterWarmup);
    const rangeRatio = maxMB / minMB;

    console.log(
      `[perf:memory:trend] monotonic=${monotonic} min=${minMB.toFixed(2)}MB max=${maxMB.toFixed(2)}MB ratio=${rangeRatio.toFixed(2)}`
    );
    console.log(
      `[perf:memory:trend] samples: ${measurements.map((m) => m.toFixed(1)).join(', ')}`
    );

    // Memory pattern should NOT be purely monotonically increasing
    // (GC should reclaim between cycles)
    if (monotonic && measurements.length > 5) {
      const totalGrowth = ((measurements[measurements.length - 1] - measurements[0]) / measurements[0]) * 100;
      // Only fail if monotonic AND significant growth
      if (totalGrowth > 15) {
        expect(monotonic).toBe(false);
      }
    }

    // Range should be bounded
    expect(rangeRatio).toBeLessThan(2.0);
  });
});

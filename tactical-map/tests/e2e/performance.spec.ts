import { test, expect } from '@playwright/test';

const perfEnabled = process.env.PERF === '1';
const perfTest = perfEnabled ? test : test.skip;

perfTest('FPS ≥ 55 with all agents active + particles (smoke benchmark)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__TACTICAL_MAP__);

  // Force a busy state.
  await page.evaluate(() => {
    // @ts-expect-error - injected by app
    const tm = window.__TACTICAL_MAP__;
    const curr = tm.mapStore.get();
    const next = structuredClone(curr);

    const ring = ['oracle', 'atlas', 'sentinel', 'verifier', 'archivist', 'synth', 'echo'];
    for (const id of ring) {
      next.agents[id].state = 'ACTIVE';
      next.agents[id].sessions = 5;
      next.agents[id].activeSessions = [
        { id: `${id}:0`, label: 'Implementation: perf bench', startedAt: new Date().toISOString(), estimatedMs: 60_000, progress: 0.5 }
      ];
    }

    tm.setMapState(next);
    tm.resume();
  });

  // Measure rAF FPS over ~1.5s.
  const fps = await page.evaluate(async () => {
    const start = performance.now();
    let frames = 0;

    await new Promise<void>((resolve) => {
      function tick() {
        frames++;
        const now = performance.now();
        if (now - start >= 1500) resolve();
        else requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });

    const dur = performance.now() - start;
    return (frames / dur) * 1000;
  });

  // eslint-disable-next-line no-console
  console.log('[perf] measured fps:', fps);

  expect(fps).toBeGreaterThanOrEqual(55);
});

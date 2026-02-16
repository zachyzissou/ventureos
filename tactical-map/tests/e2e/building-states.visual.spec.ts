import { test, expect } from '@playwright/test';

async function setAllRingStates(page: any, state: 'IDLE' | 'ACTIVE' | 'OVERLOADED' | 'ERROR') {
  await page.evaluate((st: string) => {
    // @ts-expect-error - injected by app for tests
    const tm = window.__TACTICAL_MAP__;
    if (!tm) throw new Error('Missing __TACTICAL_MAP__');

    const curr = tm.mapStore.get();
    const next = structuredClone(curr);

    const ring = ['oracle', 'atlas', 'sentinel', 'verifier', 'archivist', 'synth', 'echo'];
    for (const id of ring) {
      next.agents[id].state = st;
      // ensure units + non-zero health bars for active-ish states
      next.agents[id].sessions = st === 'IDLE' ? 0 : st === 'ACTIVE' ? 1 : st === 'OVERLOADED' ? 5 : 2;
      next.agents[id].activeSessions =
        st === 'IDLE'
          ? []
          : [
              {
                id: `${id}:0`,
                label: st === 'ACTIVE' ? 'Implementation: renderer updates' : st === 'OVERLOADED' ? 'Deploy: overload test' : 'Error: smoke test',
                startedAt: new Date().toISOString(),
                estimatedMs: 30 * 60_000,
                progress: st === 'ACTIVE' ? 0.4 : st === 'OVERLOADED' ? 1.1 : 0.2
              }
            ];
    }

    tm.setMapState(next);
    tm.snapshot();
  }, state);
}

test.describe('visual regression - building states', () => {
  test('IDLE', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__TACTICAL_MAP__);
    await page.evaluate(() => (window as any).__TACTICAL_MAP__.pause());

    await setAllRingStates(page, 'IDLE');
    await expect(page.locator('canvas')).toHaveScreenshot('state-idle.png', {
      maxDiffPixelRatio: 0.01
    });
  });

  test('ACTIVE', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__TACTICAL_MAP__);
    await page.evaluate(() => (window as any).__TACTICAL_MAP__.pause());

    await setAllRingStates(page, 'ACTIVE');
    await expect(page.locator('canvas')).toHaveScreenshot('state-active.png', {
      maxDiffPixelRatio: 0.01
    });
  });

  test('OVERLOADED', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__TACTICAL_MAP__);
    await page.evaluate(() => (window as any).__TACTICAL_MAP__.pause());

    await setAllRingStates(page, 'OVERLOADED');
    await expect(page.locator('canvas')).toHaveScreenshot('state-overloaded.png', {
      maxDiffPixelRatio: 0.01
    });
  });

  test('ERROR', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__TACTICAL_MAP__);
    await page.evaluate(() => (window as any).__TACTICAL_MAP__.pause());

    await setAllRingStates(page, 'ERROR');
    await expect(page.locator('canvas')).toHaveScreenshot('state-error.png', {
      maxDiffPixelRatio: 0.01
    });
  });
});

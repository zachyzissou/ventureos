import { test, expect } from '@playwright/test';
import { installDeterministicApiMocks, stabilizeForVisualSnapshot } from './helpers/tactical-map-test-harness';

// Intentionally looser than 0.01 to account for CI GPU/canvas rasterization variance.
const VISUAL_MAX_DIFF_RATIO = 0.03;

async function setAllRingStates(page: any, state: 'IDLE' | 'ACTIVE' | 'OVERLOADED' | 'ERROR') {
  await page.evaluate((st: string) => {
    // @ts-expect-error - injected by app for tests
    const tm = window.__TACTICAL_MAP__;
    if (!tm) throw new Error('Missing __TACTICAL_MAP__');

    const curr = tm.mapStore.get();
    const next = structuredClone(curr);

    const ring = ['venture_research', 'venture_infrastructure', 'venture_security', 'venture_evidence', 'venture_memory', 'venture_delivery', 'venture_strategy'];
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
                startedAt: '2026-02-01T00:00:00.000Z',
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
    await installDeterministicApiMocks(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__TACTICAL_MAP__);
    await stabilizeForVisualSnapshot(page);

    await setAllRingStates(page, 'IDLE');
    await expect(page.locator('canvas')).toHaveScreenshot('state-idle.png', {
      maxDiffPixelRatio: VISUAL_MAX_DIFF_RATIO
    });
  });

  test('ACTIVE', async ({ page }) => {
    await installDeterministicApiMocks(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__TACTICAL_MAP__);
    await stabilizeForVisualSnapshot(page);

    await setAllRingStates(page, 'ACTIVE');
    await expect(page.locator('canvas')).toHaveScreenshot('state-active.png', {
      maxDiffPixelRatio: VISUAL_MAX_DIFF_RATIO
    });
  });

  test('OVERLOADED', async ({ page }) => {
    await installDeterministicApiMocks(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__TACTICAL_MAP__);
    await stabilizeForVisualSnapshot(page);

    await setAllRingStates(page, 'OVERLOADED');
    await expect(page.locator('canvas')).toHaveScreenshot('state-overloaded.png', {
      maxDiffPixelRatio: VISUAL_MAX_DIFF_RATIO
    });
  });

  test('ERROR', async ({ page }) => {
    await installDeterministicApiMocks(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__TACTICAL_MAP__);
    await stabilizeForVisualSnapshot(page);

    await setAllRingStates(page, 'ERROR');
    await expect(page.locator('canvas')).toHaveScreenshot('state-error.png', {
      maxDiffPixelRatio: VISUAL_MAX_DIFF_RATIO
    });
  });
});

import { test, expect } from '@playwright/test';
import { installDeterministicApiMocks, stabilizeForVisualSnapshot } from './helpers/tactical-map-test-harness';

test.describe('visual regression - khala network', () => {
  test('renders bond lines + collaboration particles', async ({ page }) => {
    await installDeterministicApiMocks(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__TACTICAL_MAP__);
    await stabilizeForVisualSnapshot(page);

    await expect(page.locator('canvas')).toHaveScreenshot('khala-network.png', {
      maxDiffPixelRatio: 0.015
    });
  });
});

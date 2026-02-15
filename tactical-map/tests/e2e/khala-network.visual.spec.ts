import { test, expect } from '@playwright/test';

test.describe('visual regression - khala network', () => {
  test('renders bond lines + collaboration particles', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__TACTICAL_MAP__);

    // Freeze animation for deterministic screenshot.
    await page.evaluate(() => (window as any).__TACTICAL_MAP__.pause());
    await page.evaluate(() => (window as any).__TACTICAL_MAP__.snapshot());

    await expect(page.locator('canvas')).toHaveScreenshot('khala-network.png', {
      maxDiffPixelRatio: 0.015
    });
  });
});

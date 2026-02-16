import { test, expect } from '@playwright/test';

test('tactical map loads and renders a canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
});

import { test, expect } from '@playwright/test';
import { installDeterministicApiMocks } from './helpers/tactical-map-test-harness';

test('tactical map loads and renders a canvas', async ({ page }) => {
  // Keep this smoke test backend-independent so proxy failures don't cause false negatives.
  await installDeterministicApiMocks(page);
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
});

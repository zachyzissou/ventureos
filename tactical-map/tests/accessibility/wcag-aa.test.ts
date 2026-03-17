/**
 * WCAG 2.1 AA Accessibility Tests
 *
 * Automated accessibility checks using axe-core via Playwright.
 * Covers: color contrast, ARIA attributes, keyboard navigation,
 * focus management, and screen reader compatibility.
 *
 * Run: npx playwright test tests/accessibility/
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('WCAG 2.1 AA — Tactical Map', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    // Wait for the tactical map to bootstrap
    await page.waitForFunction(() => !!(window as any).__TACTICAL_MAP__, { timeout: 15000 });
  });

  test('passes axe-core WCAG AA automated checks', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      // Canvas content is inherently inaccessible; we test the surrounding DOM
      .exclude('canvas')
      .analyze();

    // Log violations for debugging
    if (results.violations.length > 0) {
      console.log('axe violations:', JSON.stringify(results.violations, null, 2));
    }

    expect(results.violations).toEqual([]);
  });

  test('canvas has accessible role and label', async ({ page }) => {
    const canvas = page.locator('canvas');
    await expect(canvas).toHaveAttribute('role', 'img');
    const label = await canvas.getAttribute('aria-label');
    expect(label).toBeTruthy();
    expect(label!.length).toBeGreaterThan(10);
  });

  test('screen reader announcement region exists', async ({ page }) => {
    const announcements = page.locator('#sr-announcements');
    await expect(announcements).toHaveAttribute('aria-live', 'polite');
    await expect(announcements).toHaveAttribute('aria-atomic', 'true');
  });

  test('agent status summary is accessible', async ({ page }) => {
    const summary = page.locator('#sr-agent-summary');
    await expect(summary).toHaveAttribute('role', 'status');
    const text = await summary.textContent();
    expect(text).toContain('Agent status');
    expect(text).toContain('Keyboard');
  });

  test('screen reader announces agent state changes', async ({ page }) => {
    // Change an agent's state and verify the announcement
    await page.evaluate(() => {
      const tm = (window as any).__TACTICAL_MAP__;
      const curr = tm.mapStore.get();
      const next = structuredClone(curr);
      next.agents.venture_research.state = 'ACTIVE';
      tm.setMapState(next);
    });

    // Small delay for the subscription to fire
    await page.waitForTimeout(500);

    const text = await page.locator('#sr-announcements').textContent();
    expect(text).toContain('venture_research');
    expect(text).toContain('active');
  });

  test('application container has proper ARIA role', async ({ page }) => {
    const app = page.locator('#app');
    await expect(app).toHaveAttribute('role', 'application');
    const label = await app.getAttribute('aria-label');
    expect(label).toBeTruthy();
  });

  test('document has proper lang attribute', async ({ page }) => {
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBe('en');
  });

  test('page has a descriptive title', async ({ page }) => {
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(5);
  });
});

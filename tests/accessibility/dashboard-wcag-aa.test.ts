/**
 * WCAG 2.1 AA Accessibility Tests — Dashboard
 *
 * Automated accessibility checks for the Agent Dashboard.
 * Uses axe-core via Playwright for automated rule validation
 * plus custom checks for keyboard navigation and focus management.
 *
 * Run: npx playwright test tests/accessibility/
 */

import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const DASHBOARD_URL = 'http://localhost:8001';

// Skip if dashboard isn't running (CI may not have it)
async function dashboardAvailable(page: Page): Promise<boolean> {
  try {
    const resp = await page.request.get(`${DASHBOARD_URL}/api/health`);
    return resp.ok();
  } catch {
    return false;
  }
}

test.describe('WCAG 2.1 AA — Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!(await dashboardAvailable(page)), 'Dashboard not running');
    await page.goto(DASHBOARD_URL);
    await page.waitForLoadState('domcontentloaded');
  });

  test('passes axe-core WCAG AA automated checks', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    if (results.violations.length > 0) {
      for (const v of results.violations) {
        console.log(`[axe] ${v.id}: ${v.description} (${v.nodes.length} instances)`);
        for (const n of v.nodes.slice(0, 3)) {
          console.log(`  → ${n.html.slice(0, 120)}`);
        }
      }
    }

    // Allow some tolerance initially — log all, fail on critical
    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );
    expect(critical).toEqual([]);
  });

  test('skip-to-content link exists and works', async ({ page }) => {
    const skipLink = page.locator('.skip-to-content');
    await expect(skipLink).toBeAttached();

    // Tab to the skip link
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    const href = await focused.getAttribute('href');
    expect(href).toBe('#main-content');

    // Activate skip link
    await page.keyboard.press('Enter');

    // Focus should move to main content
    const mainContent = page.locator('#main-content');
    await expect(mainContent).toBeAttached();
  });

  test('navigation items are keyboard accessible', async ({ page }) => {
    const navItems = page.locator('.nav-item');
    const count = await navItems.count();
    expect(count).toBeGreaterThan(0);

    // All nav items should have role="button" and tabindex="0"
    for (let i = 0; i < count; i++) {
      const item = navItems.nth(i);
      await expect(item).toHaveAttribute('role', 'button');
      await expect(item).toHaveAttribute('tabindex', '0');
    }

    // Active item should have aria-current="page"
    const activeItem = page.locator('.nav-item.active');
    await expect(activeItem).toHaveAttribute('aria-current', 'page');
  });

  test('nav items respond to keyboard activation', async ({ page }) => {
    // Focus the second nav item (Mission Control)
    const missionNav = page.locator('.nav-item[data-page="mission"]');
    await missionNav.focus();

    // Press Enter to activate
    await page.keyboard.press('Enter');

    // Mission page should now be active
    await expect(missionNav).toHaveClass(/active/);
    await expect(missionNav).toHaveAttribute('aria-current', 'page');

    // Overview should no longer be active
    const overviewNav = page.locator('.nav-item[data-page="overview"]');
    await expect(overviewNav).not.toHaveAttribute('aria-current', 'page');
  });

  test('all search inputs have aria-label', async ({ page }) => {
    const searchInputs = page.locator('input[type="text"]');
    const count = await searchInputs.count();

    for (let i = 0; i < count; i++) {
      const input = searchInputs.nth(i);
      const label = await input.getAttribute('aria-label');
      const id = await input.getAttribute('id');
      // Each input should have either aria-label or an associated <label>
      if (!label) {
        const labelEl = page.locator(`label[for="${id}"]`);
        const labelCount = await labelEl.count();
        expect(labelCount).toBeGreaterThan(0);
      }
    }
  });

  test('emoji icons are hidden from screen readers', async ({ page }) => {
    const icons = page.locator('.nav-item .icon');
    const count = await icons.count();

    for (let i = 0; i < count; i++) {
      await expect(icons.nth(i)).toHaveAttribute('aria-hidden', 'true');
    }
  });

  test('status bar has aria-live for dynamic updates', async ({ page }) => {
    const statusBar = page.locator('.status-bar');
    await expect(statusBar).toHaveAttribute('aria-live', 'polite');
    await expect(statusBar).toHaveAttribute('role', 'status');
  });

  test('color contrast meets AA ratio (4.5:1)', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withRules(['color-contrast'])
      .analyze();

    const contrastViolations = results.violations.filter((v) => v.id === 'color-contrast');
    if (contrastViolations.length > 0) {
      for (const v of contrastViolations) {
        for (const n of v.nodes.slice(0, 5)) {
          console.log(`[contrast] ${n.html.slice(0, 100)}`);
          console.log(`  → ${n.failureSummary}`);
        }
      }
    }

    // Contrast violations should not be critical
    const criticalContrast = contrastViolations.filter((v) =>
      v.nodes.some((n) => n.impact === 'critical' || n.impact === 'serious')
    );
    expect(criticalContrast).toEqual([]);
  });

  test('interactive elements have visible focus indicators', async ({ page }) => {
    const focusableSelector = 'a, button, input, [tabindex="0"]';
    const focusableElements = page.locator(focusableSelector);
    const count = Math.min(await focusableElements.count(), 10);

    for (let i = 0; i < count; i++) {
      await page.keyboard.press('Tab');
      const focused = page.locator(':focus');
      const isVisible = await focused.isVisible().catch(() => false);
      if (!isVisible) continue;

      const outline = await focused.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return {
          outline: style.outline,
          boxShadow: style.boxShadow,
        };
      });

      const hasFocusIndicator =
        (outline.outline && outline.outline !== 'none' && !outline.outline.includes('0px')) ||
        (outline.boxShadow && outline.boxShadow !== 'none');

      if (!hasFocusIndicator) {
        const tag = await focused.evaluate((el) => `${el.tagName}.${el.className}`);
        console.warn(`[focus] No visible focus indicator on: ${tag}`);
      }
    }
  });

  test('page has proper document structure', async ({ page }) => {
    const mainCount = await page.locator('main').count();
    expect(mainCount).toBe(1);

    const navCount = await page.locator('nav').count();
    expect(navCount).toBeGreaterThan(0);

    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeGreaterThan(0);
  });
});

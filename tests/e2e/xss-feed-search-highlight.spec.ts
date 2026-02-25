import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const helperScriptPath = path.resolve(process.cwd(), 'dashboard/client/assets/feed-search-highlight.js');
const helperScript = fs.readFileSync(helperScriptPath, 'utf8');
const APP_ORIGIN = 'http://feed-highlight.test';

const HARNESS_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Feed Search Highlight Harness</title></head>
<body>
  <div id="root"></div>
  <script src="/assets/feed-search-highlight.js"></script>
  <script>
    window.__feed_highlight_xss = 0;
  </script>
</body>
</html>`;

async function loadHarness(page: import('@playwright/test').Page) {
  await page.route(`${APP_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === '/' || url.pathname === '/index.html') {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: HARNESS_HTML,
      });
      return;
    }

    if (url.pathname === '/assets/feed-search-highlight.js') {
      await route.fulfill({
        status: 200,
        contentType: 'text/javascript; charset=utf-8',
        body: helperScript,
      });
      return;
    }

    await route.fulfill({ status: 404, body: 'not found' });
  });

  await page.goto(`${APP_ORIGIN}/`, { waitUntil: 'domcontentloaded' });
}

const payloadCases: Array<{ name: string; payload: string; term: string }> = [
  {
    name: 'IMG onerror payload stays inert',
    payload: '<img src=x onerror="window.__feed_highlight_xss = 1"> alert payload',
    term: 'alert',
  },
  {
    name: 'SCRIPT tag payload stays inert',
    payload: '<script>window.__feed_highlight_xss = 1</script>alert payload',
    term: 'alert',
  },
];

test.describe('XSS: dashboard feed search highlighting', () => {
  for (const tc of payloadCases) {
    test(`XSS regression — ${tc.name}`, async ({ page }) => {
      await loadHarness(page);

      await page.evaluate(({ payload, term }) => {
        const container = document.createElement('div');
        container.id = 'feed-content';
        document.getElementById('root')?.appendChild(container);

        (window as any).feedSearchHighlight.renderHighlightedText(container, payload, term);
      }, tc);

      await page.waitForTimeout(100);

      const xssCanary = await page.evaluate(() => (window as any).__feed_highlight_xss);
      expect(xssCanary).toBe(0);

      await expect(page.locator('#feed-content img')).toHaveCount(0);
      await expect(page.locator('#feed-content script')).toHaveCount(0);
      await expect(page.locator('#feed-content .search-highlight')).toHaveText('alert');
      await expect(page.locator('#feed-content')).toContainText(tc.payload);
    });
  }

  test('XSS regression — non-matching search leaves raw text intact without markup injection', async ({ page }) => {
    await loadHarness(page);

    const payload = '<svg onload="window.__feed_highlight_xss = 1"></svg>';

    await page.evaluate((text) => {
      const container = document.createElement('div');
      container.id = 'feed-content';
      document.getElementById('root')?.appendChild(container);

      (window as any).feedSearchHighlight.renderHighlightedText(container, text, 'not-found');
    }, payload);

    await page.waitForTimeout(100);

    const xssCanary = await page.evaluate(() => (window as any).__feed_highlight_xss);
    expect(xssCanary).toBe(0);

    await expect(page.locator('#feed-content svg')).toHaveCount(0);
    await expect(page.locator('#feed-content .search-highlight')).toHaveCount(0);
    await expect(page.locator('#feed-content')).toContainText(payload);
  });
});

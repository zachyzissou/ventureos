import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const helperScriptPath = path.resolve(__dirname, '../../dashboard/client/assets/feed-search-highlight.js');
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

  test('ReDoS protection — very long search terms are rejected', async ({ page }) => {
    await loadHarness(page);

    const longTerm = 'a'.repeat(250); // Exceeds 200 char limit
    const content = 'This is normal content with some text';

    const result = await page.evaluate(({ text, term }) => {
      const container = document.createElement('div');
      container.id = 'feed-content';
      document.getElementById('root')?.appendChild(container);

      return (window as any).feedSearchHighlight.renderHighlightedText(container, text, term);
    }, { text: content, term: longTerm });

    // Should return false (no highlight applied) due to length limit
    expect(result).toBe(false);

    // Content should still be rendered as plain text
    await expect(page.locator('#feed-content')).toContainText(content);
    await expect(page.locator('#feed-content .search-highlight')).toHaveCount(0);
  });

  test('Regex safety — special regex characters are properly escaped', async ({ page }) => {
    await loadHarness(page);

    const specialChars = [
      { char: '*', text: 'Find * asterisk', id: 'asterisk' },
      { char: '+', text: 'Find + plus', id: 'plus' },
      { char: '?', text: 'Find ? question', id: 'question' },
      { char: '.', text: 'Find . dot', id: 'dot' },
      { char: '^', text: 'Find ^ caret', id: 'caret' },
      { char: '$', text: 'Find $ dollar', id: 'dollar' },
      { char: '|', text: 'Find | pipe', id: 'pipe' },
      { char: '(', text: 'Find ( paren', id: 'paren' },
      { char: '[', text: 'Find [ bracket', id: 'bracket' },
      { char: '\\', text: 'Find \\ backslash', id: 'backslash' },
      { char: '-', text: 'Find - hyphen', id: 'hyphen' },
    ];

    for (const testCase of specialChars) {
      await page.evaluate(({ text, char, id }) => {
        const container = document.createElement('div');
        container.id = id;
        document.getElementById('root')?.appendChild(container);

        (window as any).feedSearchHighlight.renderHighlightedText(container, text, char);
      }, testCase);
    }

    // All special chars should be highlighted without causing regex errors
    for (const testCase of specialChars) {
      const selector = `#${testCase.id} .search-highlight`;
      await expect(page.locator(selector)).toContainText(testCase.char);
    }
  });

  test('Unicode support — emoji and unicode characters work correctly', async ({ page }) => {
    await loadHarness(page);

    const unicodeTests = [
      { text: 'Hello 👋 world', term: '👋' },
      { text: 'Café résumé', term: 'Café' },
      { text: '日本語 text', term: '日本語' },
      { text: 'Math: ∑∫√', term: '∑' },
    ];

    for (const testCase of unicodeTests) {
      await page.evaluate(({ text, term }) => {
        const container = document.createElement('div');
        container.className = 'unicode-test';
        document.getElementById('root')?.appendChild(container);

        (window as any).feedSearchHighlight.renderHighlightedText(container, text, term);
      }, testCase);
    }

    // Check that unicode highlights are applied
    await expect(page.locator('.unicode-test .search-highlight')).toHaveCount(unicodeTests.length);
  });

  test('Error resilience — null and undefined inputs are handled safely', async ({ page }) => {
    await loadHarness(page);

    const result = await page.evaluate(() => {
      const container = document.createElement('div');
      container.id = 'feed-content';
      document.getElementById('root')?.appendChild(container);

      const results = [];
      // Test various null/undefined combinations
      results.push((window as any).feedSearchHighlight.renderHighlightedText(container, null, 'test'));
      results.push((window as any).feedSearchHighlight.renderHighlightedText(container, undefined, 'test'));
      results.push((window as any).feedSearchHighlight.renderHighlightedText(container, 'text', null));
      results.push((window as any).feedSearchHighlight.renderHighlightedText(container, 'text', undefined));
      results.push((window as any).feedSearchHighlight.renderHighlightedText(container, '', ''));

      return results;
    });

    // All should return false without throwing errors
    expect(result).toEqual([false, false, false, false, false]);
  });
});

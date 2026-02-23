# XSS Test Coverage — QA-002 (GitHub #5)

## Overview

Browser-based Playwright tests that verify XSS prevention when content from the
`message-sanitizer` pipeline is rendered via `innerHTML` in a real Chromium
browser. This is the definitive proof that the sanitizer works — not just in
Node.js string manipulation, but against the actual DOM parser.

## Sanitization Strategy

**Approach:** HTML entity escaping (`escapeHtml()`) — all `<`, `>`, `&`, `"`,
`'` characters are replaced with their HTML entity equivalents before any
content reaches `innerHTML`.

**Why not DOMPurify?** The VentureOS message-sanitizer operates on inter-agent
messages that should never contain intentional HTML. Unlike a rich-text editor
where users need `<b>`, `<a>`, etc., agent messages are plain text + markdown.
Entity escaping is the correct strategy because:

1. **No allowlist needed** — there's no legitimate HTML to preserve
2. **Zero bypass surface** — entity escaping is mathematically complete for
   preventing tag injection (unlike tag-stripping which has mutation XSS edge
   cases)
3. **Simpler security audit** — one function (`escapeHtml`) vs. a 15KB library
4. **Idempotent for safe input** — plain text passes through unchanged

The escapeHtml approach provides equivalent or superior protection to DOMPurify
for this use case, verified by the OWASP vector test suite below.

## Test Categories (60 tests)

### 1. escapeHtml Unit Verification (1 test)
Confirms the core escaping function handles all HTML special characters.

### 2. detectHtmlXss Pattern Detection (4 tests)
Verifies the detection layer correctly flags dangerous patterns and clears
safe content.

### 3. Basic Script Injection (2 tests)
- `<script>alert(1)</script>`
- `<script>window.__xss_triggered=true</script>`

### 4. Event Handler Attacks (8 tests)
- `<img onerror>`, `<img onload>`
- `<svg onload>`, `<body onload>`
- `<div onmouseover>`, `<input onfocus autofocus>`
- `<marquee onstart>`, `<details ontoggle open>`

### 5. URI-based Attacks (5 tests)
- `javascript:` in `<a href>`, `<iframe src>`, `<object data>`, `<embed src>`
- `data:text/html` iframe injection

### 6. SVG-based Attacks (4 tests)
- `<svg><script>`, `<svg onload>`
- `<svg><animate onbegin>`, `<svg><foreignObject>`

### 7. Encoding Evasion Attempts (3 tests)
- Mixed-case tags (`<ScRiPt>`)
- Tab/newline attribute separation

### 8. Compound / Real-World Payloads (4 tests)
- Activity name injection (script, img onerror, svg onload)
- Multi-vector compound payload

### 9. External Channel Sanitization (2 tests)
- Discord channel output escaping
- Slack channel output escaping

### 10. Safe Content Preservation (3 tests)
- Plain text passes through unchanged
- Angle brackets in TypeScript generics render as text
- Markdown content preserved

### 11. DOM State Verification (3 tests)
- No `<script>` elements created from any payload
- No `<iframe>` elements created
- No elements with `on*` event handler attributes

### 12. Stress Test (1 test)
- 100+ sequential payload injections, canary remains false

### 13. DOM Clobbering Attacks (5 tests) ✨ NEW
- Form-based document property clobbering
- Anchor-based `location` clobbering
- Named access via `<img name>` clobbering
- `toString` override via anchor
- Full DOM globals integrity check after all clobbering attempts

### 14. Mutation XSS (mXSS) Patterns (6 tests) ✨ NEW
- `<noscript>` re-parsing attack
- `<textarea>` content escaping attack
- `<title>` content escaping attack
- `<style>` content parsing attack
- `<math>` nested mXSS (CVE-2020-26950 class)
- `<svg><title>` mXSS variant

### 15. Polyglot and Advanced Payloads (5 tests) ✨ NEW
- Full polyglot XSS payload
- Context-breaking injection (`">`)
- `data:` URI SVG embedding
- CSS attribute selector data exfiltration
- Unicode-encoded script tags

### 16. DOMPurify-Equivalent Verification (3 tests) ✨ NEW
- 20 OWASP XSS Filter Evasion Cheat Sheet vectors — all blocked
- Double-sanitization safety (no XSS after re-sanitization)
- Plain text idempotency verification

### 17. Edge Case: Opt-Out Proof (1 test)
Confirms XSS **does** fire when `escapeHtmlContent: false`, proving the
fix is the reason XSS is blocked (not browser-side mitigation).

## Running Tests

```bash
# All Playwright XSS tests
npm run test:e2e:xss

# All e2e tests
npm run test:e2e

# With verbose output
npx playwright test --reporter=list

# Specific test category
npx playwright test --grep "DOM clobbering"
npx playwright test --grep "mXSS"
npx playwright test --grep "OWASP"
```

## Architecture

```
tests/e2e/
├── fixtures/
│   └── xss-harness.html    # Browser test harness (canary + render targets)
└── xss-sanitization.spec.ts # 60 Playwright browser tests

lib/
└── message-sanitizer.ts     # escapeHtml(), detectHtmlXss(), sanitizeMessage()

playwright.config.ts          # Chromium, headless, single worker
```

### Test Flow

1. Load harness page with XSS canary (`window.__xss_triggered = false`)
2. Override `alert()`, `confirm()`, `prompt()` to detect XSS
3. Run payload through `sanitizeMessage()` (server-side equivalent)
4. Inject sanitized output via `innerHTML` (simulates real rendering)
5. Verify canary remains `false`
6. Verify DOM contains no dangerous elements

## Key Files Modified

| File | Change |
|------|--------|
| `lib/message-sanitizer.ts` | Added `escapeHtml()`, `stripHtmlTags()`, `detectHtmlXss()`, integrated into sanitization pipeline |
| `tests/e2e/xss-sanitization.spec.ts` | 60 Playwright browser tests |
| `tests/e2e/fixtures/xss-harness.html` | Browser test harness |
| `playwright.config.ts` | Playwright configuration |
| `package.json` | Added `@playwright/test`, `test:e2e` scripts |

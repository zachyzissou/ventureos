/**
 * CSP / Security Headers Middleware Integration Tests
 *
 * Real HTTP requests verifying actual security headers on real responses.
 * No mocks — every header value is read from the actual HTTP response.
 */
import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { createCspOnlyServer, createTestServer, getToken, CSP_POLICY, type TestServer } from './test-server.ts';

// ─── CSP-only server tests ─────────────────────────────────────────────

describe('CSP Middleware — Content-Security-Policy Header', () => {
  let srv: TestServer;

  beforeAll(async () => {
    srv = await createCspOnlyServer();
  });

  afterAll(async () => {
    await srv.close();
  });

  it('sets Content-Security-Policy header on response', async () => {
    const res = await fetch(`${srv.url}/anything`);
    const csp = res.headers.get('content-security-policy');
    assert.ok(csp, 'CSP header must be present');
    assert.match(csp, /default-src 'self'/);
  });

  it('CSP includes default-src self', async () => {
    const res = await fetch(`${srv.url}/test`);
    const csp = res.headers.get('content-security-policy')!;
    assert.match(csp, /default-src 'self'/);
  });

  it('CSP includes script-src self', async () => {
    const res = await fetch(`${srv.url}/test`);
    const csp = res.headers.get('content-security-policy')!;
    assert.match(csp, /script-src 'self'/);
  });

  it('CSP includes style-src self unsafe-inline', async () => {
    const res = await fetch(`${srv.url}/test`);
    const csp = res.headers.get('content-security-policy')!;
    assert.match(csp, /style-src 'self' 'unsafe-inline'/);
  });

  it('CSP includes img-src self data:', async () => {
    const res = await fetch(`${srv.url}/test`);
    const csp = res.headers.get('content-security-policy')!;
    assert.match(csp, /img-src 'self' data:/);
  });

  it('CSP includes font-src self', async () => {
    const res = await fetch(`${srv.url}/test`);
    const csp = res.headers.get('content-security-policy')!;
    assert.match(csp, /font-src 'self'/);
  });

  it('CSP includes connect-src self', async () => {
    const res = await fetch(`${srv.url}/test`);
    const csp = res.headers.get('content-security-policy')!;
    assert.match(csp, /connect-src 'self'/);
  });

  it('CSP includes frame-ancestors none', async () => {
    const res = await fetch(`${srv.url}/test`);
    const csp = res.headers.get('content-security-policy')!;
    assert.match(csp, /frame-ancestors 'none'/);
  });

  it('CSP includes object-src none', async () => {
    const res = await fetch(`${srv.url}/test`);
    const csp = res.headers.get('content-security-policy')!;
    assert.match(csp, /object-src 'none'/);
  });

  it('CSP includes base-uri self', async () => {
    const res = await fetch(`${srv.url}/test`);
    const csp = res.headers.get('content-security-policy')!;
    assert.match(csp, /base-uri 'self'/);
  });

  it('CSP does NOT contain unsafe-eval', async () => {
    const res = await fetch(`${srv.url}/test`);
    const csp = res.headers.get('content-security-policy')!;
    assert.ok(!csp.includes('unsafe-eval'), 'CSP must not contain unsafe-eval');
  });

  it('CSP does NOT contain wildcard *', async () => {
    const res = await fetch(`${srv.url}/test`);
    const csp = res.headers.get('content-security-policy')!;
    // Check for " *" or " * " (standalone wildcard, not inside data: etc.)
    assert.ok(!/ \*[; ]/.test(csp) && !csp.endsWith(' *'), 'CSP must not contain wildcard');
  });

  it('CSP directives separated by semicolons', async () => {
    const res = await fetch(`${srv.url}/test`);
    const csp = res.headers.get('content-security-policy')!;
    const directives = csp.split('; ');
    assert.ok(directives.length >= 9, `Expected ≥9 directives, got ${directives.length}`);
  });

  it('CSP does not end with trailing semicolon', async () => {
    const res = await fetch(`${srv.url}/test`);
    const csp = res.headers.get('content-security-policy')!;
    assert.ok(!csp.endsWith(';'), 'CSP should not end with semicolon');
  });
});

// ─── Security hardening headers ────────────────────────────────────────

describe('CSP Middleware — Security Hardening Headers', () => {
  let srv: TestServer;

  beforeAll(async () => {
    srv = await createCspOnlyServer();
  });

  afterAll(async () => {
    await srv.close();
  });

  it('sets X-Content-Type-Options: nosniff', async () => {
    const res = await fetch(`${srv.url}/test`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });

  it('sets X-Frame-Options: DENY', async () => {
    const res = await fetch(`${srv.url}/test`);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
  });

  it('sets X-XSS-Protection: 0 (disabled, CSP replaces it)', async () => {
    const res = await fetch(`${srv.url}/test`);
    assert.equal(res.headers.get('x-xss-protection'), '0');
  });

  it('sets Referrer-Policy: strict-origin-when-cross-origin', async () => {
    const res = await fetch(`${srv.url}/test`);
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  });

  it('all five security headers present in a single response', async () => {
    const res = await fetch(`${srv.url}/test`);
    assert.ok(res.headers.has('content-security-policy'), 'Missing CSP');
    assert.ok(res.headers.has('x-content-type-options'), 'Missing X-Content-Type-Options');
    assert.ok(res.headers.has('x-frame-options'), 'Missing X-Frame-Options');
    assert.ok(res.headers.has('x-xss-protection'), 'Missing X-XSS-Protection');
    assert.ok(res.headers.has('referrer-policy'), 'Missing Referrer-Policy');
  });
});

// ─── CSP on full middleware stack ──────────────────────────────────────

describe('CSP Middleware — Full Stack Integration', () => {
  let srv: TestServer;
  let token: string;

  beforeAll(async () => {
    srv = await createTestServer();
    token = getToken();
  });

  afterAll(async () => {
    await srv.close();
  });

  it('security headers present on authenticated API response', async () => {
    const res = await fetch(`${srv.url}/api/test`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    assert.ok(res.headers.has('content-security-policy'));
    assert.ok(res.headers.has('x-content-type-options'));
    assert.ok(res.headers.has('x-frame-options'));
  });

  it('security headers present on static (non-API) response', async () => {
    const res = await fetch(`${srv.url}/map/index.html`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.has('content-security-policy'));
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
  });

  it('security headers present even on 401 auth rejection', async () => {
    const res = await fetch(`${srv.url}/api/test`);
    assert.equal(res.status, 401);
    // CSP is applied before auth check
    assert.ok(res.headers.has('content-security-policy'));
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });

  it('CSP_POLICY export matches what server actually sends', async () => {
    const res = await fetch(`${srv.url}/health`);
    const csp = res.headers.get('content-security-policy');
    assert.equal(csp, CSP_POLICY);
  });
});

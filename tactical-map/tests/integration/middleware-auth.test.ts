/**
 * Auth Middleware Integration Tests
 *
 * Real HTTP requests against a real server with actual auth middleware.
 * No mocks — every assertion validates real headers, status codes, and bodies.
 */
import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { createTestServer, createAuthOnlyServer, getToken, type TestServer } from './test-server.ts';

// ─── Full middleware stack (authenticate function) ─────────────────────

describe('Auth Middleware — Full Stack (authenticate)', () => {
  let srv: TestServer;
  let token: string;

  beforeAll(async () => {
    srv = await createTestServer();
    token = getToken();
  });

  afterAll(async () => {
    await srv.close();
  });

  // ── Token validation ───────────────────────────────────────────────

  it('rejects requests to /api/* without Authorization header → 401', async () => {
    const res = await fetch(`${srv.url}/api/tactical-map/state`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.match(body.error, /Unauthorized/i);
  });

  it('rejects requests with wrong Bearer token → 401', async () => {
    const res = await fetch(`${srv.url}/api/tactical-map/state`, {
      headers: { Authorization: 'Bearer totally-wrong-token' },
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.ok, false);
  });

  it('accepts requests with correct Bearer token → 200', async () => {
    const res = await fetch(`${srv.url}/api/tactical-map/state`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.path, '/api/tactical-map/state');
  });

  it('rejects non-Bearer auth scheme (Basic) → 401', async () => {
    const res = await fetch(`${srv.url}/api/test`, {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    });
    assert.equal(res.status, 401);
  });

  it('rejects empty Bearer token → 401', async () => {
    const res = await fetch(`${srv.url}/api/test`, {
      headers: { Authorization: 'Bearer ' },
    });
    assert.equal(res.status, 401);
  });

  // ── Route-based auth bypass ────────────────────────────────────────

  it('skips auth for non-/api/ routes (static assets) → 200', async () => {
    const res = await fetch(`${srv.url}/map/index.html`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /Static/);
  });

  it('skips auth for /health endpoint → 200', async () => {
    const res = await fetch(`${srv.url}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'healthy');
  });

  it('requires auth for /api/sessions → 401 without token', async () => {
    const res = await fetch(`${srv.url}/api/sessions`);
    assert.equal(res.status, 401);
  });

  it('requires auth for /api/sessions → 200 with token', async () => {
    const res = await fetch(`${srv.url}/api/sessions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
  });

  // ── Query param token auth is disabled ────────────────────────────

  it('rejects query param token (even when valid) → 401', async () => {
    const res = await fetch(`${srv.url}/api/live?token=${token}`);
    assert.equal(res.status, 401);
  });

  // ── OPTIONS preflight ─────────────────────────────────────────────

  it('passes OPTIONS through without auth (preflight) → 204', async () => {
    const res = await fetch(`${srv.url}/api/anything`, { method: 'OPTIONS' });
    // corsMiddleware handles OPTIONS with 204
    assert.equal(res.status, 204);
  });

  // ── Response content type ─────────────────────────────────────────

  it('401 response has Content-Type: application/json', async () => {
    const res = await fetch(`${srv.url}/api/test`);
    assert.equal(res.status, 401);
    assert.match(res.headers.get('content-type') || '', /application\/json/);
  });

  it('401 response body is valid JSON with error field', async () => {
    const res = await fetch(`${srv.url}/api/test`);
    const body = await res.json();
    assert.ok('error' in body || 'ok' in body, 'Response should contain error or ok field');
  });
});

// ─── authMiddleware (callback-style) ───────────────────────────────────

describe('Auth Middleware — Callback Style (authMiddleware)', () => {
  let srv: TestServer;
  let token: string;

  beforeAll(async () => {
    srv = await createAuthOnlyServer();
    token = getToken();
  });

  afterAll(async () => {
    await srv.close();
  });

  it('rejects missing Authorization header → 401', async () => {
    const res = await fetch(`${srv.url}/api/test`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.match(body.error, /Missing or invalid Authorization/);
  });

  it('rejects wrong token → 401', async () => {
    const res = await fetch(`${srv.url}/api/test`, {
      headers: { Authorization: 'Bearer wrong' },
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.match(body.error, /Invalid API token/);
  });

  it('accepts correct token → calls next() → 200', async () => {
    const res = await fetch(`${srv.url}/api/test`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.authenticated, true);
  });

  it('passes OPTIONS without auth → calls next() → 200', async () => {
    const res = await fetch(`${srv.url}/api/test`, { method: 'OPTIONS' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.authenticated, true);
  });

  it('handles multiple concurrent requests correctly', async () => {
    const results = await Promise.all([
      fetch(`${srv.url}/api/a`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${srv.url}/api/b`),
      fetch(`${srv.url}/api/c`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${srv.url}/api/d`, { headers: { Authorization: 'Bearer bad' } }),
    ]);
    assert.equal(results[0].status, 200);
    assert.equal(results[1].status, 401);
    assert.equal(results[2].status, 200);
    assert.equal(results[3].status, 401);
  });
});

/**
 * CORS Middleware Integration Tests
 *
 * Real HTTP requests verifying actual CORS headers on real responses.
 * No mocks — headers come from the real middleware, checked on real HTTP responses.
 */
import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { createCorsOnlyServer, createTestServer, ALLOWED_ORIGINS, getToken, type TestServer } from './test-server.ts';

// ─── CORS-only server tests ────────────────────────────────────────────

describe('CORS Middleware — Origin Whitelist', () => {
  let srv: TestServer;

  beforeAll(async () => {
    srv = await createCorsOnlyServer();
  });

  afterAll(async () => {
    await srv.close();
  });

  it('sets Access-Control-Allow-Origin for whitelisted origin (LAN:7000)', async () => {
    const origin = 'http://192.168.225.149:7000';
    const res = await fetch(`${srv.url}/api/test`, {
      headers: { Origin: origin },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), origin);
  });

  it('sets Access-Control-Allow-Origin for whitelisted origin (LAN:7001)', async () => {
    const origin = 'http://192.168.225.149:7001';
    const res = await fetch(`${srv.url}/api/test`, {
      headers: { Origin: origin },
    });
    assert.equal(res.headers.get('access-control-allow-origin'), origin);
  });

  it('sets Access-Control-Allow-Origin for localhost:5173 (Vite dev)', async () => {
    const origin = 'http://localhost:5173';
    const res = await fetch(`${srv.url}/api/test`, {
      headers: { Origin: origin },
    });
    assert.equal(res.headers.get('access-control-allow-origin'), origin);
  });

  it('sets Access-Control-Allow-Origin for localhost:7000', async () => {
    const origin = 'http://localhost:7000';
    const res = await fetch(`${srv.url}/api/test`, {
      headers: { Origin: origin },
    });
    assert.equal(res.headers.get('access-control-allow-origin'), origin);
  });

  it('sets Access-Control-Allow-Origin for localhost:7001', async () => {
    const origin = 'http://localhost:7001';
    const res = await fetch(`${srv.url}/api/test`, {
      headers: { Origin: origin },
    });
    assert.equal(res.headers.get('access-control-allow-origin'), origin);
  });

  it('does NOT set Access-Control-Allow-Origin for unknown origin', async () => {
    const res = await fetch(`${srv.url}/api/test`, {
      headers: { Origin: 'http://evil.com' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  });

  it('does NOT set Access-Control-Allow-Origin for similar-but-wrong origin', async () => {
    const res = await fetch(`${srv.url}/api/test`, {
      headers: { Origin: 'http://localhost:8080' },
    });
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  });

  it('does NOT set Access-Control-Allow-Origin for https variant', async () => {
    const res = await fetch(`${srv.url}/api/test`, {
      headers: { Origin: 'https://localhost:7000' },
    });
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  });

  it('does NOT set Access-Control-Allow-Origin when no Origin header', async () => {
    const res = await fetch(`${srv.url}/api/test`);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  });

  it('never produces Access-Control-Allow-Origin: * for any origin', async () => {
    const origins = [
      'http://192.168.225.149:7000',
      'http://192.168.225.149:7001',
      'http://localhost:5173',
      'http://evil.com',
      '',
    ];
    for (const origin of origins) {
      const headers: Record<string, string> = {};
      if (origin) headers['Origin'] = origin;
      const res = await fetch(`${srv.url}/api/test`, { headers });
      const acao = res.headers.get('access-control-allow-origin');
      assert.notEqual(acao, '*', `Origin ${origin} should not produce wildcard CORS`);
    }
  });

  it('sets Access-Control-Allow-Credentials: true for whitelisted origin', async () => {
    const res = await fetch(`${srv.url}/api/test`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
  });

  it('sets Access-Control-Allow-Methods header', async () => {
    const res = await fetch(`${srv.url}/api/test`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    const methods = res.headers.get('access-control-allow-methods');
    assert.ok(methods, 'Should have Allow-Methods header');
    assert.match(methods, /GET/);
    assert.match(methods, /POST/);
  });

  it('sets Access-Control-Allow-Headers header', async () => {
    const res = await fetch(`${srv.url}/api/test`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    const allowHeaders = res.headers.get('access-control-allow-headers');
    assert.ok(allowHeaders, 'Should have Allow-Headers header');
    assert.match(allowHeaders, /Content-Type/);
    assert.match(allowHeaders, /Authorization/);
  });
});

// ─── Preflight handling ────────────────────────────────────────────────

describe('CORS Middleware — Preflight (OPTIONS)', () => {
  let srv: TestServer;

  beforeAll(async () => {
    srv = await createCorsOnlyServer();
  });

  afterAll(async () => {
    await srv.close();
  });

  it('responds 204 to OPTIONS preflight', async () => {
    const res = await fetch(`${srv.url}/api/test`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://192.168.225.149:7000' },
    });
    assert.equal(res.status, 204);
  });

  it('sets CORS headers on OPTIONS response for whitelisted origin', async () => {
    const origin = 'http://192.168.225.149:7000';
    const res = await fetch(`${srv.url}/api/test`, {
      method: 'OPTIONS',
      headers: { Origin: origin },
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), origin);
    assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
  });

  it('OPTIONS has empty body', async () => {
    const res = await fetch(`${srv.url}/api/test`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://192.168.225.149:7000' },
    });
    const text = await res.text();
    assert.equal(text, '');
  });

  it('does NOT set Allow-Origin on OPTIONS from unknown origin', async () => {
    const res = await fetch(`${srv.url}/api/test`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://evil.com' },
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  });

  it('non-OPTIONS requests pass through to handler', async () => {
    const res = await fetch(`${srv.url}/api/test`, {
      method: 'GET',
      headers: { Origin: 'http://localhost:5173' },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
  });
});

// ─── CORS on full middleware stack ──────────────────────────────────────

describe('CORS Middleware — Full Stack Integration', () => {
  let srv: TestServer;
  let token: string;

  beforeAll(async () => {
    srv = await createTestServer();
    token = getToken();
  });

  afterAll(async () => {
    await srv.close();
  });

  it('CORS headers present on authenticated API response', async () => {
    const origin = 'http://localhost:5173';
    const res = await fetch(`${srv.url}/api/test`, {
      headers: {
        Origin: origin,
        Authorization: `Bearer ${token}`,
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), origin);
  });

  it('CORS headers present even on 401 rejection', async () => {
    // The authenticate function in auth.ts sends 401 directly,
    // but CORS headers are applied before auth check
    const origin = 'http://localhost:5173';
    const res = await fetch(`${srv.url}/api/test`, {
      headers: { Origin: origin },
    });
    assert.equal(res.status, 401);
    // CORS headers should still be set (applied before auth)
    assert.equal(res.headers.get('access-control-allow-origin'), origin);
  });
});

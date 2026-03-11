/**
 * Security tests for bounded request body reads (Issue #149).
 *
 * Tests the readJsonBody / readJson helpers via a lightweight HTTP server
 * that mirrors the production pattern. This avoids pulling in
 * better-sqlite3 / ConversationEngine native modules.
 */

import http from 'node:http';

// ─── Constants (must match production values) ──────────────────────────────

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

// ─── Lightweight test server mirroring production readJsonBody ──────────────

function createTestServer(): http.Server {
  return http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let aborted = false;

    req.on('data', (chunk: Buffer) => {
      if (aborted) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        aborted = true;
        req.resume();
        res.writeHead(413, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Request body too large', maxBytes: MAX_BODY_BYTES }));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (aborted) return;
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ parsed: {} }));
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ parsed }));
      } catch {
        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Malformed JSON in request body' }));
      }
    });

    req.on('error', () => {
      if (aborted) return;
      aborted = true;
      res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Request stream error' }));
    });
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

let server: http.Server;
let baseUrl: string;

function post(path: string, body: string | Buffer): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(url, { method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try {
          resolve({ status: res.statusCode!, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode!, body: raw });
        }
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

// ─── Setup / Teardown ───────────────────────────────────────────────────────

beforeAll(async () => {
  server = createTestServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Bounded request body reads (Issue #149)', () => {
  // ── Oversized payloads → 413 ────────────────────────────────────────────

  it('rejects a body exceeding 1 MB with 413', async () => {
    const oversized = Buffer.alloc(MAX_BODY_BYTES + 1, 0x41); // 'A' repeated
    const { status, body } = await post('/', oversized);
    expect(status).toBe(413);
    expect(body.error).toMatch(/too large/i);
    expect(body.maxBytes).toBe(MAX_BODY_BYTES);
  });

  it('rejects a 2 MB body with 413', async () => {
    const big = Buffer.alloc(2 * MAX_BODY_BYTES, 0x42);
    const { status } = await post('/', big);
    expect(status).toBe(413);
  });

  it('rejects a 5 MB body with 413', async () => {
    const huge = Buffer.alloc(5 * MAX_BODY_BYTES, 0x43);
    const { status } = await post('/', huge);
    expect(status).toBe(413);
  });

  // ── Malformed JSON → 400 ────────────────────────────────────────────────

  it('rejects malformed JSON with 400', async () => {
    const { status, body } = await post('/', '{invalid json}');
    expect(status).toBe(400);
    expect(body.error).toMatch(/malformed/i);
  });

  it('rejects truncated JSON with 400', async () => {
    const { status, body } = await post('/', '{"key": "val');
    expect(status).toBe(400);
    expect(body.error).toMatch(/malformed/i);
  });

  it('rejects non-JSON text with 400', async () => {
    const { status } = await post('/', 'this is not json at all');
    expect(status).toBe(400);
  });

  // ── Normal payloads → 200 (backwards compatibility) ─────────────────────

  it('accepts a small valid JSON body', async () => {
    const payload = JSON.stringify({ hello: 'world' });
    const { status, body } = await post('/', payload);
    expect(status).toBe(200);
    expect(body.parsed).toEqual({ hello: 'world' });
  });

  it('accepts an empty body', async () => {
    const { status, body } = await post('/', '');
    expect(status).toBe(200);
    expect(body.parsed).toEqual({});
  });

  it('accepts a body of exactly MAX_BODY_BYTES', async () => {
    // Build a valid JSON payload that is exactly MAX_BODY_BYTES
    const prefix = '{"d":"';
    const suffix = '"}';
    const fillLen = MAX_BODY_BYTES - Buffer.byteLength(prefix) - Buffer.byteLength(suffix);
    const payload = prefix + 'a'.repeat(fillLen) + suffix;
    expect(Buffer.byteLength(payload)).toBe(MAX_BODY_BYTES);

    const { status, body } = await post('/', payload);
    expect(status).toBe(200);
    expect(body.parsed.d).toHaveLength(fillLen);
  });

  it('accepts a moderately sized payload (~100KB)', async () => {
    const data = { items: Array.from({ length: 1000 }, (_, i) => ({ id: i, name: `item-${i}` })) };
    const payload = JSON.stringify(data);
    expect(Buffer.byteLength(payload)).toBeLessThan(MAX_BODY_BYTES);

    const { status, body } = await post('/', payload);
    expect(status).toBe(200);
    expect(body.parsed.items).toHaveLength(1000);
  });

  // ── Error response structure ────────────────────────────────────────────

  it('413 response has JSON content-type', async () => {
    const oversized = Buffer.alloc(MAX_BODY_BYTES + 1024, 0x41);
    const result = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const url = new URL('/', baseUrl);
      const req = http.request(url, { method: 'POST', headers: { 'content-type': 'application/json' } }, resolve);
      req.on('error', reject);
      req.end(oversized);
    });
    expect(result.headers['content-type']).toMatch(/application\/json/);
    result.resume(); // drain
  });

  it('413 response does not leak internal details', async () => {
    const oversized = Buffer.alloc(MAX_BODY_BYTES + 1, 0x41);
    const { body } = await post('/', oversized);
    // Should only have 'error' and 'maxBytes', no stack traces etc.
    const keys = Object.keys(body);
    expect(keys).toContain('error');
    expect(keys).not.toContain('stack');
    expect(keys).not.toContain('message');
  });

  // ── Rate limit config verification ──────────────────────────────────────

  it('rate-limit LIMITS includes /api/conversation', async () => {
    // Dynamic import to verify the config object
    const { LIMITS } = await import('../../dashboard/server/middleware/rate-limit');
    expect(LIMITS).toHaveProperty('/api/conversation');
    expect(LIMITS['/api/conversation'].limit).toBeGreaterThanOrEqual(20);
    expect(LIMITS['/api/conversation'].windowMs).toBeGreaterThan(0);
  });
});

// ─── Source-code contract tests ─────────────────────────────────────────────

describe('Source-code body-limit contracts', () => {
  it('conversation-http.ts uses bounded readJsonBody (no for-await)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'conversation-http.ts'),
      'utf8',
    );
    // Must contain the size constant
    expect(src).toContain('MAX_BODY_BYTES');
    // Must NOT use the old unbounded for-await pattern
    expect(src).not.toMatch(/for\s+await\s*\(\s*const\s+c\s+of\s+req\s*\)/);
  });

  it('conversation-api.ts uses bounded readJson (no for-await)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'conversation-api.ts'),
      'utf8',
    );
    expect(src).toContain('MAX_BODY_BYTES');
    expect(src).not.toMatch(/for\s+await\s*\(\s*const\s+c\s+of\s+req\s*\)/);
  });
});

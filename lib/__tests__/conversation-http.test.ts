/**
 * Integration tests for Conversation HTTP API (lib/conversation-http.ts)
 *
 * Spins up a real HTTP server with the conversation handler and tests
 * all endpoints. Uses a temp directory for conversation persistence.
 *
 * Issue #78 — API Integration
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { handleConversationApi, createConversationRouter } from '../conversation-http';

// ─── Test helpers ───────────────────────────────────────────────────────────

let tmpDir: string;
let server: http.Server;
let baseUrl: string;

function fetchJson(
  urlPath: string,
  opts: { method?: string; body?: Record<string, unknown> } = {},
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const method = opts.method ?? 'GET';
    const postData = opts.body ? JSON.stringify(opts.body) : undefined;

    const req = http.request(`${baseUrl}${urlPath}`, {
      method,
      headers: postData ? {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(postData),
      } : undefined,
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        let body: any;
        try { body = JSON.parse(data); } catch { body = data; }
        resolve({ status: res.statusCode ?? 0, body });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

// ─── Setup / Teardown ───────────────────────────────────────────────────────

beforeAll((done) => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conversation-http-test-'));
  process.env.CONVERSATION_PERSIST_DIR = path.join(tmpDir, 'conversations');

  server = http.createServer((req, res) => {
    if (!handleConversationApi(req, res, { dbPath: '' })) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });
  server.listen(0, '127.0.0.1', () => {
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
    done();
  });
});

afterAll((done) => {
  delete process.env.CONVERSATION_PERSIST_DIR;
  server.close(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
    done();
  });
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Conversation HTTP API', () => {
  it('returns 404 for non-conversation URLs', async () => {
    const { status } = await fetchJson('/api/sessions');
    expect(status).toBe(404);
  });

  describe('GET /api/conversation/conversations', () => {
    it('returns a conversations list', async () => {
      const { status, body } = await fetchJson('/api/conversation/conversations');
      expect(status).toBe(200);
      expect(body.conversations).toBeDefined();
      expect(Array.isArray(body.conversations)).toBe(true);
    });
  });

  describe('POST + GET conversation lifecycle', () => {
    let conversationId: string;

    it('creates a new conversation', async () => {
      const { status, body } = await fetchJson('/api/conversation/conversations', {
        method: 'POST',
        body: {
          topic: 'test-topic',
          participants: ['oracle', 'atlas'],
          initiator: 'oracle',
        },
      });
      expect(status).toBe(201);
      expect(body.conversationId).toBeDefined();
      expect(body.participants).toContain('oracle');
      expect(body.participants).toContain('atlas');
      expect(body.status).toBe('active');
      conversationId = body.conversationId;
    });

    it('retrieves the created conversation', async () => {
      const { status, body } = await fetchJson(
        `/api/conversation/conversations/${conversationId}`,
      );
      expect(status).toBe(200);
      expect(body.conversationId).toBe(conversationId);
      expect(body.participants).toContain('oracle');
    });

    it('lists conversations including the new one', async () => {
      const { status, body } = await fetchJson('/api/conversation/conversations');
      expect(status).toBe(200);
      expect(body.conversations).toContain(conversationId);
    });

    it('retrieves context for the conversation', async () => {
      const { status, body } = await fetchJson(
        `/api/conversation/conversations/${conversationId}/context`,
      );
      expect(status).toBe(200);
      // Context should exist even if empty
      expect(body).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('returns 404 for unknown sub-routes under conversations', async () => {
      const { status } = await fetchJson('/api/conversation/conversations/some-id/unknown');
      expect(status).toBe(404);
    });

    it('returns false (404) for routes not starting with /conversations', async () => {
      const { status } = await fetchJson('/api/conversation/other-thing');
      expect(status).toBe(404);
    });
  });

  describe('createConversationRouter factory', () => {
    it('creates a router with fixed dbPath', async () => {
      const router = createConversationRouter('');
      const factoryServer = http.createServer((req, res) => {
        if (!router.handleConversationApi(req, res)) {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      await new Promise<void>((resolve) => factoryServer.listen(0, '127.0.0.1', resolve));
      const addr = factoryServer.address() as { port: number };
      const url = `http://127.0.0.1:${addr.port}`;

      const { status, body } = await new Promise<{ status: number; body: any }>((resolve, reject) => {
        http.get(`${url}/api/conversation/conversations`, (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          res.on('end', () => {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
          });
        }).on('error', reject);
      });

      expect(status).toBe(200);
      expect(body.conversations).toBeDefined();

      await new Promise<void>((resolve) => factoryServer.close(() => resolve()));
    });
  });
});

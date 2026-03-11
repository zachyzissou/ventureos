import http from 'node:http';
import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import { handleWebMcp } from '../../../server/routes/webmcp.js';
import { resetDefaultWebMcpClient } from '../../../../lib/webmcp-client.js';

interface MockSite {
  url: string;
  close: () => Promise<void>;
}

async function startMockSite(): Promise<MockSite> {
  const server = http.createServer((req, res) => {
    if (req.url === '/.well-known/webmcp.json' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        tools: [
          {
            name: 'search',
            inputSchema: {
              type: 'object',
              required: ['query'],
              properties: { query: { type: 'string' } },
            },
          },
        ],
      }));
      return;
    }
    if (req.url === '/.well-known/webmcp/invoke' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk.toString(); });
      req.on('end', () => {
        const payload = JSON.parse(body || '{}') as { tool?: string; arguments?: Record<string, unknown> };
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          ok: true,
          tool: payload.tool,
          args: payload.arguments,
        }));
      });
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('invalid address');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.close();
      await once(server, 'close');
    },
  };
}

beforeEach(() => {
  resetDefaultWebMcpClient();
});

afterEach(() => {
  resetDefaultWebMcpClient();
});

describe('webmcp routes', () => {
  it('discovers tools from compliant site', async () => {
    const site = await startMockSite();
    const req = mockRequest({ method: 'POST', url: '/api/webmcp/discover' });
    const res = mockResponse();
    const handled = await handleWebMcp(req, res, {
      sendJson: (r, d, s = 200) => {
        r.writeHead(s, { 'Content-Type': 'application/json' });
        r.end(JSON.stringify(d));
      },
      readRequestBody: async () => JSON.stringify({ siteUrl: site.url }),
    });

    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);
    const body = parseJsonBody<{ ok: boolean; discovery: { tools: unknown[] } }>(res);
    expect(body.ok).toBe(true);
    expect(body.discovery.tools.length).toBe(1);
    await site.close();
  });

  it('invokes discovered tool via structured request', async () => {
    const site = await startMockSite();
    const req = mockRequest({ method: 'POST', url: '/api/webmcp/invoke' });
    const res = mockResponse();
    await handleWebMcp(req, res, {
      sendJson: (r, d, s = 200) => {
        r.writeHead(s, { 'Content-Type': 'application/json' });
        r.end(JSON.stringify(d));
      },
      readRequestBody: async () => JSON.stringify({
        siteUrl: site.url,
        toolName: 'search',
        args: { query: 'ventureos' },
      }),
    });

    expect(res._statusCode).toBe(200);
    const body = parseJsonBody<{ invocation: { source: string; ok: boolean } }>(res);
    expect(body.invocation.source).toBe('webmcp');
    expect(body.invocation.ok).toBe(true);
    await site.close();
  });

  it('falls back when WebMCP is unavailable', async () => {
    const req = mockRequest({ method: 'POST', url: '/api/webmcp/invoke' });
    const res = mockResponse();
    await handleWebMcp(req, res, {
      sendJson: (r, d, s = 200) => {
        r.writeHead(s, { 'Content-Type': 'application/json' });
        r.end(JSON.stringify(d));
      },
      readRequestBody: async () => JSON.stringify({
        siteUrl: 'https://example.com',
        toolName: 'search',
        args: { query: 'x' },
      }),
    });
    expect(res._statusCode).toBe(200);
    const body = parseJsonBody<{ invocation: { source: string; fallback?: { strategy: string } } }>(res);
    expect(body.invocation.source).toBe('fallback');
    expect(body.invocation.fallback?.strategy).toBe('browser-automation-fallback');
  });
});


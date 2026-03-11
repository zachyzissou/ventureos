import http from 'node:http';
import { once } from 'node:events';
import {
  WebMcpClient,
  HttpManifestWebMcpAdapter,
  type WebMcpToolDefinition,
} from '../webmcp-client';

interface MockSite {
  url: string;
  close: () => Promise<void>;
  requests: { discovery: number; invoke: number };
}

async function startMockSite(options: {
  tools: WebMcpToolDefinition[];
  invokeResult?: Record<string, unknown>;
  manifestPath?: string;
  invokePath?: string;
}): Promise<MockSite> {
  const manifestPath = options.manifestPath ?? '/.well-known/webmcp.json';
  const invokePath = options.invokePath ?? '/.well-known/webmcp/invoke';
  const requests = { discovery: 0, invoke: 0 };

  const server = http.createServer((req, res) => {
    if (req.url === manifestPath && req.method === 'GET') {
      requests.discovery += 1;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        tools: options.tools,
        invoke_url: invokePath,
      }));
      return;
    }

    if (req.url === invokePath && req.method === 'POST') {
      requests.invoke += 1;
      let body = '';
      req.on('data', (chunk) => { body += chunk.toString(); });
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        const payload = JSON.parse(body || '{}') as { tool?: string; arguments?: Record<string, unknown> };
        res.end(JSON.stringify({
          ok: true,
          tool: payload.tool ?? '',
          args: payload.arguments ?? {},
          ...(options.invokeResult ?? {}),
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
  if (!address || typeof address === 'string') throw new Error('Unexpected address');
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: async () => {
      server.close();
      await once(server, 'close');
    },
  };
}

describe('WebMcpClient', () => {
  it('discovers tools and serves cached discovery on repeated calls', async () => {
    const site = await startMockSite({
      tools: [
        {
          name: 'search_catalog',
          description: 'Search product catalog',
          inputSchema: {
            type: 'object',
            required: ['query'],
            properties: { query: { type: 'string' } },
          },
        },
      ],
    });

    const client = new WebMcpClient({
      adapters: [new HttpManifestWebMcpAdapter()],
      cacheTtlMs: 60_000,
    });

    const first = await client.discoverTools(site.url);
    const second = await client.discoverTools(site.url);

    expect(first.tools).toHaveLength(1);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(site.requests.discovery).toBe(1);

    await site.close();
  });

  it('invokes discovered tools with typed arguments', async () => {
    const site = await startMockSite({
      tools: [
        {
          name: 'book_flight',
          inputSchema: {
            type: 'object',
            required: ['origin', 'destination'],
            properties: {
              origin: { type: 'string' },
              destination: { type: 'string' },
            },
          },
        },
      ],
      invokeResult: { bookingId: 'BKG-123' },
    });

    const client = new WebMcpClient({
      adapters: [new HttpManifestWebMcpAdapter()],
    });

    const result = await client.invokeTool({
      siteUrl: site.url,
      toolName: 'book_flight',
      args: { origin: 'SFO', destination: 'JFK' },
    });

    expect(result.ok).toBe(true);
    expect(result.source).toBe('webmcp');
    expect((result.result as { bookingId?: string }).bookingId).toBe('BKG-123');
    expect(site.requests.invoke).toBe(1);

    await site.close();
  });

  it('returns schema validation errors for invalid args', async () => {
    const site = await startMockSite({
      tools: [
        {
          name: 'send_message',
          inputSchema: {
            type: 'object',
            required: ['text'],
            properties: { text: { type: 'string' } },
          },
        },
      ],
    });
    const client = new WebMcpClient({
      adapters: [new HttpManifestWebMcpAdapter()],
    });

    const result = await client.invokeTool({
      siteUrl: site.url,
      toolName: 'send_message',
      args: { text: 42 as unknown as string },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Invalid type');
    expect(site.requests.invoke).toBe(0);
    await site.close();
  });

  it('falls back to browser automation when WebMCP is unavailable', async () => {
    const offlineFetch: typeof fetch = async () => {
      throw new Error('network_unavailable_in_test');
    };

    const client = new WebMcpClient({
      adapters: [new HttpManifestWebMcpAdapter({ fetchFn: offlineFetch })],
      fallbackInvoker: async (input) => ({
        strategy: 'browser-automation-fallback',
        reason: input.reason,
        siteUrl: input.siteUrl,
        toolName: input.toolName,
        actionHint: 'Fallback executed',
        payload: input.args,
      }),
    });

    const result = await client.invokeTool({
      siteUrl: 'https://example.com',
      toolName: 'nonexistent_tool',
      args: { q: 'hello' },
    });

    expect(result.ok).toBe(true);
    expect(result.source).toBe('fallback');
    expect(result.fallback?.strategy).toBe('browser-automation-fallback');
  });

  it('supports structured invocation across three independent sites', async () => {
    const sites = await Promise.all([
      startMockSite({
        tools: [{ name: 'checkout', inputSchema: { type: 'object', required: ['cartId'], properties: { cartId: { type: 'string' } } } }],
      }),
      startMockSite({
        tools: [{ name: 'create_ticket', inputSchema: { type: 'object', required: ['subject'], properties: { subject: { type: 'string' } } } }],
      }),
      startMockSite({
        tools: [{ name: 'reserve_slot', inputSchema: { type: 'object', required: ['date'], properties: { date: { type: 'string' } } } }],
      }),
    ]);

    const client = new WebMcpClient({
      adapters: [new HttpManifestWebMcpAdapter()],
    });

    const r1 = await client.invokeTool({ siteUrl: sites[0].url, toolName: 'checkout', args: { cartId: 'c1' } });
    const r2 = await client.invokeTool({ siteUrl: sites[1].url, toolName: 'create_ticket', args: { subject: 'Need help' } });
    const r3 = await client.invokeTool({ siteUrl: sites[2].url, toolName: 'reserve_slot', args: { date: '2026-03-01' } });

    expect(r1.ok && r1.source === 'webmcp').toBe(true);
    expect(r2.ok && r2.source === 'webmcp').toBe(true);
    expect(r3.ok && r3.source === 'webmcp').toBe(true);

    await Promise.all(sites.map((site) => site.close()));
  });
});

/**
 * WebMCP integration routes (Issue #225)
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { getDefaultWebMcpClient } from '../../../lib/webmcp-client.js';

export interface WebMcpRouteDeps {
  sendJson: (res: ServerResponse, data: unknown, status?: number) => void;
  readRequestBody: (req: IncomingMessage) => Promise<string>;
}

function parseUrl(req: IncomingMessage): URL | null {
  try {
    return new URL(req.url ?? '', 'http://localhost');
  } catch {
    return null;
  }
}

function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function cleanString(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

export function handleWebMcp(
  req: IncomingMessage,
  res: ServerResponse,
  deps: WebMcpRouteDeps,
): Promise<boolean> | boolean {
  if (!req.url || !req.url.startsWith('/api/webmcp')) return false;
  const url = parseUrl(req);
  if (!url) {
    deps.sendJson(res, { ok: false, error: 'Bad request URL' }, 400);
    return true;
  }
  const client = getDefaultWebMcpClient();

  if (url.pathname === '/api/webmcp/sites' && req.method === 'GET') {
    deps.sendJson(res, {
      sites: client.getSiteProfiles(),
      metrics: client.getMetrics(),
    });
    return true;
  }

  if (url.pathname === '/api/webmcp/metrics' && req.method === 'GET') {
    deps.sendJson(res, {
      metrics: client.getMetrics(),
    });
    return true;
  }

  if (url.pathname === '/api/webmcp/discover' && req.method === 'POST') {
    return (async () => {
      const body = parseJson<{ siteUrl?: string; forceRefresh?: boolean }>(
        await deps.readRequestBody(req),
      ) ?? {};
      const siteUrl = cleanString(body.siteUrl);
      if (!siteUrl) {
        deps.sendJson(res, { ok: false, error: 'siteUrl is required' }, 400);
        return true;
      }
      try {
        const result = await client.discoverTools(siteUrl, { forceRefresh: Boolean(body.forceRefresh) });
        deps.sendJson(res, { ok: true, discovery: result });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Discovery failed';
        deps.sendJson(res, { ok: false, error: msg }, 500);
      }
      return true;
    })();
  }

  if (url.pathname === '/api/webmcp/invoke' && req.method === 'POST') {
    return (async () => {
      const body = parseJson<{ siteUrl?: string; toolName?: string; args?: Record<string, unknown> }>(
        await deps.readRequestBody(req),
      ) ?? {};
      const siteUrl = cleanString(body.siteUrl);
      const toolName = cleanString(body.toolName);
      if (!siteUrl || !toolName) {
        deps.sendJson(res, { ok: false, error: 'siteUrl and toolName are required' }, 400);
        return true;
      }

      const args = (body.args && typeof body.args === 'object' && !Array.isArray(body.args))
        ? body.args
        : {};

      try {
        const result = await client.invokeTool({
          siteUrl,
          toolName,
          args,
        });
        deps.sendJson(res, { ok: true, invocation: result });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Invocation failed';
        deps.sendJson(res, { ok: false, error: msg }, 500);
      }
      return true;
    })();
  }

  deps.sendJson(res, { ok: false, error: 'Not found' }, 404);
  return true;
}


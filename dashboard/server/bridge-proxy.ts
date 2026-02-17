/**
 * Bridge proxy helpers for DASHBOARD_DATA_MODE=bridge.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

export interface BridgeProxyDeps {
  dataMode: string;
  bridgeUrl?: string;
  bridgeToken?: string;
  fetchImpl?: typeof fetch;
}

export interface BridgeProxyRequest {
  targetPath: string;
  forwardQuery?: boolean;
  method?: string;
}

function sendJson(res: ServerResponse, body: unknown, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function isBridgeMode(mode: string | undefined): boolean {
  return (mode ?? '').toLowerCase() === 'bridge';
}

export async function proxyBridgeJson(
  req: IncomingMessage,
  res: ServerResponse,
  deps: BridgeProxyDeps,
  request: BridgeProxyRequest,
): Promise<boolean> {
  if (!isBridgeMode(deps.dataMode)) return false;

  const expectedMethod = (request.method ?? 'GET').toUpperCase();
  const method = (req.method ?? 'GET').toUpperCase();
  if (method !== expectedMethod) {
    sendJson(res, { ok: false, error: 'Method not allowed' }, 405);
    return true;
  }

  const bridgeUrl = (deps.bridgeUrl ?? '').trim();
  const bridgeToken = (deps.bridgeToken ?? '').trim();
  if (!bridgeUrl || !bridgeToken) {
    sendJson(res, { ok: false, error: 'Bridge not configured' }, 500);
    return true;
  }

  let target = new URL(request.targetPath, bridgeUrl);
  if (request.forwardQuery) {
    try {
      const reqUrl = new URL(req.url ?? '', 'http://localhost');
      target.search = reqUrl.search;
    } catch {
      // ignore bad request URL; keep default
    }
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  let bridgeResponse: Response;
  try {
    bridgeResponse = await fetchImpl(target.toString(), {
      headers: {
        Authorization: `Bearer ${bridgeToken}`,
      },
    });
  } catch {
    sendJson(res, { ok: false, error: 'Bridge unavailable' }, 502);
    return true;
  }

  const contentType = bridgeResponse.headers.get('content-type') ?? 'application/json';
  const bodyText = await bridgeResponse.text();
  res.writeHead(bridgeResponse.status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  });
  res.end(bodyText);
  return true;
}

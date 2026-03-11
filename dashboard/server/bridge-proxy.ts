/**
 * Bridge proxy helpers for DASHBOARD_DATA_MODE=bridge.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

export interface BridgeProxyDeps {
  dataMode: string;
  bridgeUrl?: string;
  bridgeToken?: string;
  fetchImpl?: typeof fetch;
  jsonTimeoutMs?: number;
  sseConnectTimeoutMs?: number;
}

export interface BridgeProxyRequest {
  targetPath: string;
  forwardQuery?: boolean;
  method?: string;
}

export interface BridgeSseRequest {
  targetPath: string;
  forwardQuery?: boolean;
}

const DEFAULT_JSON_TIMEOUT_MS = 10_000;
const DEFAULT_SSE_CONNECT_TIMEOUT_MS = 10_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 120_000;

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

function normalizeTimeoutMs(value: unknown, fallbackMs: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallbackMs;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(parsed)));
}

function resolveJsonTimeoutMs(deps: BridgeProxyDeps): number {
  return normalizeTimeoutMs(
    deps.jsonTimeoutMs ?? process.env.DASHBOARD_BRIDGE_JSON_TIMEOUT_MS,
    DEFAULT_JSON_TIMEOUT_MS,
  );
}

function resolveSseConnectTimeoutMs(deps: BridgeProxyDeps): number {
  return normalizeTimeoutMs(
    deps.sseConnectTimeoutMs ?? process.env.DASHBOARD_BRIDGE_SSE_CONNECT_TIMEOUT_MS,
    DEFAULT_SSE_CONNECT_TIMEOUT_MS,
  );
}

function buildBridgeTarget(
  req: IncomingMessage,
  bridgeUrl: string,
  request: { targetPath: string; forwardQuery?: boolean },
): URL {
  const target = new URL(request.targetPath, bridgeUrl);
  if (request.forwardQuery) {
    try {
      const reqUrl = new URL(req.url ?? '', 'http://localhost');
      target.search = reqUrl.search;
    } catch {
      // ignore bad request URL; keep default
    }
  }
  return target;
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

  const target = buildBridgeTarget(req, bridgeUrl, request);

  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = resolveJsonTimeoutMs(deps);
  const abortController = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    try {
      abortController.abort();
    } catch {
      // ignore
    }
  }, timeoutMs);
  timeout.unref();

  let bridgeResponse: Response;
  try {
    bridgeResponse = await fetchImpl(target.toString(), {
      headers: {
        Authorization: `Bearer ${bridgeToken}`,
      },
      signal: abortController.signal,
    });
  } catch {
    clearTimeout(timeout);
    if (timedOut) {
      sendJson(res, { ok: false, error: 'Bridge timeout' }, 504);
      return true;
    }
    sendJson(res, { ok: false, error: 'Bridge unavailable' }, 502);
    return true;
  }

  let bodyText: string;
  try {
    bodyText = await bridgeResponse.text();
  } catch {
    clearTimeout(timeout);
    if (timedOut) {
      sendJson(res, { ok: false, error: 'Bridge timeout' }, 504);
      return true;
    }
    sendJson(res, { ok: false, error: 'Bridge unavailable' }, 502);
    return true;
  }
  clearTimeout(timeout);

  const contentType = bridgeResponse.headers.get('content-type') ?? 'application/json';
  res.writeHead(bridgeResponse.status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  });
  res.end(bodyText);
  return true;
}

export async function proxyBridgeSse(
  req: IncomingMessage,
  res: ServerResponse,
  deps: BridgeProxyDeps,
  request: BridgeSseRequest,
): Promise<boolean> {
  if (!isBridgeMode(deps.dataMode)) return false;

  const method = (req.method ?? 'GET').toUpperCase();
  if (method !== 'GET') {
    sendJson(res, { ok: false, error: 'Method not allowed' }, 405);
    return true;
  }

  const bridgeUrl = (deps.bridgeUrl ?? '').trim();
  const bridgeToken = (deps.bridgeToken ?? '').trim();
  if (!bridgeUrl || !bridgeToken) {
    sendJson(res, { ok: false, error: 'Bridge not configured' }, 500);
    return true;
  }

  const target = buildBridgeTarget(req, bridgeUrl, request);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = resolveSseConnectTimeoutMs(deps);
  const abortController = new AbortController();
  let timedOut = false;
  let clientDisconnected = false;
  const abort = () => {
    clientDisconnected = true;
    try {
      abortController.abort();
    } catch {
      // ignore
    }
  };
  req.on('close', abort);
  const timeout = setTimeout(() => {
    timedOut = true;
    try {
      abortController.abort();
    } catch {
      // ignore
    }
  }, timeoutMs);
  timeout.unref();

  let bridgeResponse: Response;
  try {
    bridgeResponse = await fetchImpl(target.toString(), {
      headers: {
        Authorization: `Bearer ${bridgeToken}`,
      },
      signal: abortController.signal,
    });
  } catch {
    clearTimeout(timeout);
    req.off('close', abort);
    if (timedOut) {
      sendJson(res, { ok: false, error: 'Bridge timeout' }, 504);
      return true;
    }
    if (clientDisconnected || res.writableEnded) {
      return true;
    }
    sendJson(res, { ok: false, error: 'Bridge unavailable' }, 502);
    return true;
  }
  clearTimeout(timeout);

  if (!bridgeResponse.ok) {
    const bodyText = await bridgeResponse.text();
    res.writeHead(bridgeResponse.status, {
      'Content-Type': bridgeResponse.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(bodyText);
    req.off('close', abort);
    return true;
  }

  res.writeHead(bridgeResponse.status, {
    'Content-Type': bridgeResponse.headers.get('content-type') ?? 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const body = bridgeResponse.body;
  if (!body) {
    res.end();
    req.off('close', abort);
    return true;
  }

  const reader = body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (res.writableEnded || (res as { writable?: boolean }).writable === false) break;
      if (value && value.length > 0) {
        res.write(Buffer.from(value));
      }
    }
  } catch {
    // stream aborted/disconnected
  } finally {
    req.off('close', abort);
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
    if (!res.writableEnded) {
      try {
        res.end();
      } catch {
        // ignore
      }
    }
  }

  return true;
}

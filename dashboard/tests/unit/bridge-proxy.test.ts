import { describe, it, expect, vi } from 'vitest';
import { proxyBridgeJson, proxyBridgeSse } from '../../server/bridge-proxy.js';
import { mockRequest, mockResponse, parseJsonBody } from '../helpers.js';

describe('bridge proxy', () => {
  it('returns false when not in bridge mode', async () => {
    const req = mockRequest({ url: '/api/costs' });
    const res = mockResponse();

    const handled = await proxyBridgeJson(
      req,
      res,
      { dataMode: 'filesystem' },
      { targetPath: '/api/bridge/costs' },
    );

    expect(handled).toBe(false);
    expect(res._ended).toBe(false);
  });

  it('rejects bridge mode without configuration', async () => {
    const req = mockRequest({ url: '/api/costs' });
    const res = mockResponse();

    const handled = await proxyBridgeJson(
      req,
      res,
      { dataMode: 'bridge', bridgeUrl: '', bridgeToken: '' },
      { targetPath: '/api/bridge/costs' },
    );

    expect(handled).toBe(true);
    expect(res._statusCode).toBe(500);
    expect(parseJsonBody(res).error).toBe('Bridge not configured');
  });

  it('proxies bridge requests with auth header', async () => {
    const req = mockRequest({ url: '/api/costs?window=7d' });
    const res = mockResponse();

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      return new Response(JSON.stringify({ ok: true, url }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const handled = await proxyBridgeJson(
      req,
      res,
      {
        dataMode: 'bridge',
        bridgeUrl: 'http://bridge.local:18790',
        bridgeToken: 'bridge-token-123',
        fetchImpl: fetchMock,
      },
      { targetPath: '/api/bridge/costs', forwardQuery: true },
    );

    expect(handled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('http://bridge.local:18790/api/bridge/costs?window=7d', {
      headers: { Authorization: 'Bearer bridge-token-123' },
      signal: expect.any(AbortSignal),
    });

    expect(res._statusCode).toBe(200);
    const body = parseJsonBody<{ ok: boolean; url: string }>(res);
    expect(body.ok).toBe(true);
    expect(body.url).toContain('/api/bridge/costs');
  });

  it('returns 504 when bridge JSON request times out', async () => {
    const req = mockRequest({ url: '/api/costs' });
    const res = mockResponse();

    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error('missing abort signal'));
          return;
        }
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    });

    const handled = await proxyBridgeJson(
      req,
      res,
      {
        dataMode: 'bridge',
        bridgeUrl: 'http://bridge.local:18790',
        bridgeToken: 'bridge-token-123',
        fetchImpl: fetchMock,
        jsonTimeoutMs: 5,
      },
      { targetPath: '/api/bridge/costs' },
    );

    expect(handled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res._statusCode).toBe(504);
    expect(parseJsonBody(res).error).toBe('Bridge timeout');
  });

  it('returns false for SSE proxy when not in bridge mode', async () => {
    const req = mockRequest({ url: '/api/live' });
    const res = mockResponse();

    const handled = await proxyBridgeSse(
      req,
      res,
      { dataMode: 'filesystem' },
      { targetPath: '/api/bridge/live' },
    );

    expect(handled).toBe(false);
    expect(res._ended).toBe(false);
  });

  it('streams SSE from bridge', async () => {
    const req = mockRequest({ url: '/api/live-telemetry?scope=all' });
    const res = mockResponse();
    const encoder = new TextEncoder();

    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"status":"connected"}\\n\\n'));
          controller.enqueue(encoder.encode('data: {"type":"telemetry","ts":1}\\n\\n'));
          controller.close();
        },
      });

      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    });

    const handled = await proxyBridgeSse(
      req,
      res,
      {
        dataMode: 'bridge',
        bridgeUrl: 'http://bridge.local:18790',
        bridgeToken: 'bridge-token-123',
        fetchImpl: fetchMock,
      },
      { targetPath: '/api/bridge/live-telemetry', forwardQuery: true },
    );

    expect(handled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://bridge.local:18790/api/bridge/live-telemetry?scope=all',
      {
        headers: { Authorization: 'Bearer bridge-token-123' },
        signal: expect.any(AbortSignal),
      },
    );
    expect(res._statusCode).toBe(200);
    expect(res._headers['content-type']).toContain('text/event-stream');
    expect(res._body).toContain('status');
    expect(res._body).toContain('telemetry');
    expect(res._ended).toBe(true);
  });

  it('returns 504 when SSE bridge connect times out', async () => {
    const req = mockRequest({ url: '/api/live-telemetry' });
    const res = mockResponse();

    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error('missing abort signal'));
          return;
        }
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    });

    const handled = await proxyBridgeSse(
      req,
      res,
      {
        dataMode: 'bridge',
        bridgeUrl: 'http://bridge.local:18790',
        bridgeToken: 'bridge-token-123',
        fetchImpl: fetchMock,
        sseConnectTimeoutMs: 5,
      },
      { targetPath: '/api/bridge/live-telemetry' },
    );

    expect(handled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res._statusCode).toBe(504);
    expect(parseJsonBody(res).error).toBe('Bridge timeout');
  });
});

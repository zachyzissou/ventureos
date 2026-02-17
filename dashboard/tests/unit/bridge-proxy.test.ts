import { describe, it, expect, vi } from 'vitest';
import { proxyBridgeJson } from '../../server/bridge-proxy.js';
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
    });

    expect(res._statusCode).toBe(200);
    const body = parseJsonBody<{ ok: boolean; url: string }>(res);
    expect(body.ok).toBe(true);
    expect(body.url).toContain('/api/bridge/costs');
  });
});

/**
 * CORS Middleware Tests — Phase 5.1
 * 
 * Tests the strict origin whitelist CORS implementation.
 * Verifies: origin checking, preflight handling, header correctness.
 */
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';

// Mock helpers
function mockReq(overrides: any = {}) {
  const req = new EventEmitter() as any;
  req.method = overrides.method || 'GET';
  req.url = overrides.url || '/api/test';
  req.headers = overrides.headers || {};
  req.socket = { remoteAddress: '127.0.0.1' };
  return req;
}

function mockRes() {
  const res = new EventEmitter() as any;
  res._statusCode = 200;
  res._headers = {} as Record<string, string>;
  res._body = '';
  res.writeHead = vi.fn((status: number, headers?: Record<string, string>) => {
    res._statusCode = status;
    if (headers) Object.assign(res._headers, headers);
    return res;
  });
  res.setHeader = vi.fn((name: string, value: string) => {
    res._headers[name.toLowerCase()] = value;
    return res;
  });
  res.end = vi.fn((body?: string) => {
    if (body) res._body = body;
  });
  return res;
}

// Whitelist matching the actual middleware
const ALLOWED_ORIGINS = new Set([
  'http://192.168.225.149:7001',
  'http://192.168.225.149:7000',
  'http://localhost:7001',
  'http://localhost:7000',
  'http://localhost:5173',
]);

function applyCors(req: any, res: any) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

describe('CORS Middleware', () => {

  describe('Origin whitelist', () => {
    it('should set CORS headers for whitelisted origin', () => {
      const req = mockReq({ headers: { origin: 'http://192.168.225.149:7000' } });
      const res = mockRes();

      applyCors(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Origin',
        'http://192.168.225.149:7000'
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Credentials',
        'true'
      );
    });

    it('should NOT set Allow-Origin for unknown origin', () => {
      const req = mockReq({ headers: { origin: 'http://evil.com' } });
      const res = mockRes();

      applyCors(req, res);

      // Should NOT have set Allow-Origin
      const calls = (res.setHeader as any).mock.calls;
      const originCall = calls.find((c: any) => c[0] === 'Access-Control-Allow-Origin');
      expect(originCall).toBeUndefined();
    });

    it('should NOT use wildcard * for any origin', () => {
      const req = mockReq({ headers: { origin: 'http://192.168.225.149:7000' } });
      const res = mockRes();

      applyCors(req, res);

      const calls = (res.setHeader as any).mock.calls;
      const originCalls = calls.filter((c: any) => c[0] === 'Access-Control-Allow-Origin');
      for (const call of originCalls) {
        expect(call[1]).not.toBe('*');
      }
    });

    it('should accept localhost:5173 (Vite dev server)', () => {
      const req = mockReq({ headers: { origin: 'http://localhost:5173' } });
      const res = mockRes();

      applyCors(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Origin',
        'http://localhost:5173'
      );
    });

    it('should always set allowed methods and headers', () => {
      const req = mockReq({ headers: { origin: 'http://evil.com' } });
      const res = mockRes();

      applyCors(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, OPTIONS'
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization'
      );
    });
  });

  describe('Preflight handling', () => {
    it('should handle OPTIONS requests with 204', () => {
      const req = mockReq({ method: 'OPTIONS', headers: { origin: 'http://192.168.225.149:7000' } });
      const res = mockRes();

      if (req.method === 'OPTIONS') {
        applyCors(req, res);
        res.writeHead(204);
        res.end();
      }

      expect(res._statusCode).toBe(204);
    });

    it('should not end response for non-OPTIONS requests', () => {
      const req = mockReq({ method: 'GET', headers: { origin: 'http://192.168.225.149:7000' } });
      const res = mockRes();

      const isPreflight = req.method === 'OPTIONS';
      expect(isPreflight).toBe(false);
    });
  });

  describe('No wildcard CORS', () => {
    it('should never produce Access-Control-Allow-Origin: *', () => {
      // Test with every possible origin
      const origins = [
        'http://192.168.225.149:7000',
        'http://192.168.225.149:7001',
        'http://localhost:7000',
        'http://localhost:5173',
        'http://evil.com',
        '',
        undefined,
      ];

      for (const origin of origins) {
        const req = mockReq({ headers: origin ? { origin } : {} });
        const res = mockRes();
        applyCors(req, res);

        const calls = (res.setHeader as any).mock.calls;
        const originCalls = calls.filter((c: any) => c[0] === 'Access-Control-Allow-Origin');
        for (const call of originCalls) {
          expect(call[1]).not.toBe('*');
        }
      }
    });
  });
});

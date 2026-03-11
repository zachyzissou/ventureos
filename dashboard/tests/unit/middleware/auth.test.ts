/**
 * Auth middleware tests.
 * Migrated from auth-cookie.test.js and expanded for full coverage.
 */

import fs from 'node:fs';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';

// Mock lib/paths before importing auth
vi.mock('../../../../lib/paths.js', () => ({
  LOG_DIR: '/tmp/test-logs',
  OPENCLAW_DIR: '/tmp/test-openclaw',
  VENTUREOS_ROOT: '/tmp/test-ventureos',
  SHARED_CONTEXT_DIR: '/tmp/test-shared-context',
  KPI_DIR: '/tmp/test-kpis',
  OBSERVATIONS_DIR: '/tmp/test-observations',
  default: {
    LOG_DIR: '/tmp/test-logs',
    OPENCLAW_DIR: '/tmp/test-openclaw',
    VENTUREOS_ROOT: '/tmp/test-ventureos',
    SHARED_CONTEXT_DIR: '/tmp/test-shared-context',
    KPI_DIR: '/tmp/test-kpis',
    OBSERVATIONS_DIR: '/tmp/test-observations',
  },
}));

// Mock fs to prevent real file writes
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn((p: string) => {
        if (String(p).includes('.api-token')) return true;
        if (String(p).includes('test-logs')) return true;
        return actual.existsSync(p);
      }),
      readFileSync: vi.fn((p: string, ...args: unknown[]) => {
        if (String(p).includes('.api-token')) return 'test-token-abc123';
        return actual.readFileSync(p, ...args as [BufferEncoding]);
      }),
      writeFileSync: vi.fn(),
      appendFileSync: vi.fn(),
      mkdirSync: vi.fn(),
    },
    existsSync: vi.fn((p: string) => {
      if (String(p).includes('.api-token')) return true;
      if (String(p).includes('test-logs')) return true;
      return actual.existsSync(p);
    }),
    readFileSync: vi.fn((p: string, ...args: unknown[]) => {
      if (String(p).includes('.api-token')) return 'test-token-abc123';
      return actual.readFileSync(p, ...args as [BufferEncoding]);
    }),
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

const {
  parseCookies,
  tokenMatch,
  isAuthenticated,
  authenticate,
  getToken,
  COOKIE_NAME,
  getAuthTokenFromRequest,
  logAuthEvent,
} = await import('../../../server/middleware/auth.js');

describe('Auth Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseCookies', () => {
    it('parses a single cookie', () => {
      expect(parseCookies('name=value')).toEqual({ name: 'value' });
    });

    it('parses multiple cookies', () => {
      expect(parseCookies('a=1; b=2; c=3')).toEqual({ a: '1', b: '2', c: '3' });
    });

    it('handles URL-encoded values', () => {
      expect(parseCookies('token=hello%20world')).toEqual({ token: 'hello world' });
    });

    it('returns empty object for empty string', () => {
      expect(parseCookies('')).toEqual({});
    });

    it('returns empty object for undefined', () => {
      expect(parseCookies(undefined as unknown as string)).toEqual({});
    });

    it('handles cookies with = in values', () => {
      expect(parseCookies('token=abc=def=ghi').token).toBe('abc=def=ghi');
    });
  });

  describe('tokenMatch', () => {
    it('returns true for valid token', () => {
      expect(tokenMatch('test-token-abc123')).toBe(true);
    });

    it('returns false for invalid token', () => {
      expect(tokenMatch('wrong-token')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(tokenMatch('')).toBe(false);
    });

    it('returns false for non-string input', () => {
      expect(tokenMatch(null as unknown as string)).toBe(false);
      expect(tokenMatch(undefined as unknown as string)).toBe(false);
    });
  });

  describe('getToken', () => {
    it('returns the current valid token', () => {
      expect(getToken()).toBe('test-token-abc123');
    });
  });

  describe('COOKIE_NAME', () => {
    it('has a sensible default', () => {
      expect(COOKIE_NAME).toBe('openclaw_dashboard_token');
    });
  });

  describe('getAuthTokenFromRequest', () => {
    it('extracts token from Authorization header', () => {
      const req = mockRequest({ headers: { authorization: 'Bearer test-token-abc123' } });
      expect(getAuthTokenFromRequest(req)).toBe('test-token-abc123');
    });

    it('extracts token from cookie', () => {
      const req = mockRequest({ headers: { cookie: `${COOKIE_NAME}=my-token-value` } });
      expect(getAuthTokenFromRequest(req)).toBe('my-token-value');
    });

    it('does not extract token from query parameter', () => {
      const req = mockRequest({ url: '/api/live?token=query-token-123' });
      expect(getAuthTokenFromRequest(req)).toBeNull();
    });

    it('returns null when no credentials provided', () => {
      expect(getAuthTokenFromRequest(mockRequest())).toBeNull();
    });

    it('returns null for null request', () => {
      expect(getAuthTokenFromRequest(null)).toBeNull();
    });

    it('prefers Authorization header over cookie', () => {
      const req = mockRequest({
        headers: { authorization: 'Bearer header-token', cookie: `${COOKIE_NAME}=cookie-token` },
      });
      expect(getAuthTokenFromRequest(req)).toBe('header-token');
    });
  });

  describe('isAuthenticated', () => {
    it('returns false for loopback requests without credentials', () => {
      expect(isAuthenticated(mockRequest({ socket: { remoteAddress: '127.0.0.1' } }))).toBe(false);
    });

    it('returns true with valid bearer token from LAN IP', () => {
      expect(isAuthenticated(mockRequest({
        headers: { authorization: 'Bearer test-token-abc123' },
        socket: { remoteAddress: '192.168.1.100' },
      }))).toBe(true);
    });

    it('returns true with valid bearer token from non-LAN IP', () => {
      expect(isAuthenticated(mockRequest({
        headers: { authorization: 'Bearer test-token-abc123' },
        socket: { remoteAddress: '203.0.113.50' },
      }))).toBe(true);
    });

    it('returns false with invalid token from non-LAN IP', () => {
      expect(isAuthenticated(mockRequest({
        headers: { authorization: 'Bearer wrong-token' },
        socket: { remoteAddress: '203.0.113.50' },
      }))).toBe(false);
    });

    it('ignores spoofed X-Forwarded-For by default', () => {
      expect(isAuthenticated(mockRequest({
        headers: { 'x-forwarded-for': '127.0.0.1' },
        socket: { remoteAddress: '203.0.113.50' },
      }))).toBe(false);
    });

    it('returns false with no credentials from non-LAN IP', () => {
      expect(isAuthenticated(mockRequest({ socket: { remoteAddress: '203.0.113.50' } }))).toBe(false);
    });
  });

  describe('authenticate', () => {
    it('passes OPTIONS preflight requests', () => {
      const res = mockResponse();
      expect(authenticate(mockRequest({ method: 'OPTIONS', url: '/api/sessions' }), res)).toBe(true);
    });

    it('passes non-API routes without auth', () => {
      const res = mockResponse();
      expect(authenticate(mockRequest({ url: '/index.html' }), res)).toBe(true);
    });

    it('passes login endpoint without auth', () => {
      const res = mockResponse();
      expect(authenticate(mockRequest({ url: '/api/login', method: 'POST' }), res)).toBe(true);
    });

    it('passes logout endpoint without auth', () => {
      const res = mockResponse();
      expect(authenticate(mockRequest({ url: '/api/logout', method: 'POST' }), res)).toBe(true);
    });

    it('rejects LAN requests without token', () => {
      const res = mockResponse();
      expect(authenticate(
        mockRequest({ url: '/api/sessions', socket: { remoteAddress: '192.168.1.100' } }),
        res,
      )).toBe(false);
      expect(res._statusCode).toBe(401);
    });

    it('passes with valid Bearer token', () => {
      const res = mockResponse();
      expect(authenticate(
        mockRequest({
          url: '/api/sessions',
          headers: { authorization: 'Bearer test-token-abc123' },
          socket: { remoteAddress: '203.0.113.50' },
        }),
        res,
      )).toBe(true);
    });

    it('rejects spoofed X-Forwarded-For when token is missing', () => {
      const res = mockResponse();
      expect(authenticate(
        mockRequest({
          url: '/api/sessions',
          headers: { 'x-forwarded-for': '127.0.0.1' },
          socket: { remoteAddress: '203.0.113.50' },
        }),
        res,
      )).toBe(false);
      expect(res._statusCode).toBe(401);
    });

    it('rejects with invalid token (401)', () => {
      const res = mockResponse();
      expect(authenticate(
        mockRequest({
          url: '/api/sessions',
          headers: { authorization: 'Bearer wrong-token' },
          socket: { remoteAddress: '203.0.113.50' },
        }),
        res,
      )).toBe(false);
      expect(res._statusCode).toBe(401);
      const body = parseJsonBody(res);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Unauthorized');
    });

    it('rejects with no credentials (401)', () => {
      const res = mockResponse();
      expect(authenticate(
        mockRequest({ url: '/api/sessions', socket: { remoteAddress: '203.0.113.50' } }),
        res,
      )).toBe(false);
      expect(res._statusCode).toBe(401);
    });
  });

  describe('logAuthEvent', () => {
    it('does not throw when called', () => {
      expect(() => logAuthEvent('test_event', null, 'test detail')).not.toThrow();
    });

    it('handles request objects', () => {
      const req = mockRequest({ url: '/api/test', method: 'GET', headers: { 'user-agent': 'test-agent' } });
      expect(() => logAuthEvent('test_event', req, 'with request')).not.toThrow();
    });

    it('redacts query params from logged path', () => {
      const appendSpy = vi.mocked(fs.appendFileSync);
      const req = mockRequest({
        url: '/api/live?token=super-secret-token&foo=bar',
        method: 'GET',
        headers: { 'user-agent': 'test-agent' },
      });

      logAuthEvent('test_event', req, 'with request');

      expect(appendSpy).toHaveBeenCalled();
      const line = String(appendSpy.mock.calls[0]?.[1] ?? '');
      expect(line).not.toContain('super-secret-token');

      const entry = JSON.parse(line.trim()) as { path: string };
      expect(entry.path).toBe('/api/live');
    });
  });
});

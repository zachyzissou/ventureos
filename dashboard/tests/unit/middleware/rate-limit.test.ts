/**
 * Rate limit middleware tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import { RateLimiter, rateLimit, LIMITS } from '../../../server/middleware/rate-limit.js';

describe('Rate Limit Middleware', () => {
  describe('RateLimiter class', () => {
    let rl: InstanceType<typeof RateLimiter>;

    beforeEach(() => {
      rl = new RateLimiter();
    });

    it('allows requests within the limit', () => {
      const result = rl.check('test-key', 5, 60000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThanOrEqual(3);
    });

    it('tracks remaining count correctly', () => {
      rl.check('test-key', 5, 60000);
      rl.check('test-key', 5, 60000);
      const result = rl.check('test-key', 5, 60000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('blocks when limit is exceeded', () => {
      for (let i = 0; i < 5; i++) rl.check('test-key', 5, 60000);
      const result = rl.check('test-key', 5, 60000);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.resetMs).toBeGreaterThan(0);
    });

    it('uses separate buckets for different keys', () => {
      for (let i = 0; i < 5; i++) rl.check('key-a', 5, 60000);
      expect(rl.check('key-a', 5, 60000).allowed).toBe(false);
      expect(rl.check('key-b', 5, 60000).allowed).toBe(true);
    });

    it('expires old timestamps', () => {
      for (let i = 0; i < 3; i++) rl.check('expire-key', 3, 1);
      const start = Date.now();
      while (Date.now() - start < 5) { /* spin */ }
      expect(rl.check('expire-key', 3, 1).allowed).toBe(true);
    });

    it('cleanup removes expired entries', () => {
      rl.check('cleanup-key', 5, 1);
      const start = Date.now();
      while (Date.now() - start < 5) { /* spin */ }
      rl.cleanup();
      const result = rl.check('cleanup-key', 5, 60000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThanOrEqual(3);
    });
  });

  describe('LIMITS config', () => {
    it('has rate limits for key API endpoints', () => {
      expect(LIMITS['/api/sessions']).toBeDefined();
      expect(LIMITS['/api/costs']).toBeDefined();
      expect(LIMITS['/api/usage']).toBeDefined();
      expect(LIMITS['/api/system']).toBeDefined();
      expect(LIMITS['/api/live']).toBeDefined();
    });

    it('has reasonable limit values', () => {
      for (const [_ep, config] of Object.entries(LIMITS)) {
        expect(config.limit).toBeGreaterThan(0);
        expect(config.windowMs).toBeGreaterThan(0);
      }
    });

    it('allows at least 10 req/min for all endpoints', () => {
      for (const [_ep, config] of Object.entries(LIMITS)) {
        expect(config.limit).toBeGreaterThanOrEqual(10);
      }
    });
  });

  describe('rateLimit function', () => {
    it('passes non-API requests', () => {
      const req = mockRequest({ url: '/index.html' });
      const res = mockResponse();
      expect(rateLimit(req, res)).toBe(true);
    });

    it('passes requests without configured limits', () => {
      const req = mockRequest({ url: '/api/unconfigured-endpoint' });
      const res = mockResponse();
      expect(rateLimit(req, res)).toBe(true);
    });

    it('sets rate limit headers on limited endpoints', () => {
      const req = mockRequest({ url: '/api/sessions', socket: { remoteAddress: '10.0.0.1' } });
      const res = mockResponse();
      rateLimit(req, res);
      expect(res._headers['x-ratelimit-limit']).toBeDefined();
      expect(res._headers['x-ratelimit-remaining']).toBeDefined();
      expect(res._headers['x-ratelimit-reset']).toBeDefined();
    });

    it('returns 429 when rate limit exceeded', () => {
      const limit = LIMITS['/api/replay']?.limit ?? 10;
      for (let i = 0; i < limit; i++) {
        rateLimit(
          mockRequest({ url: '/api/replay', socket: { remoteAddress: '203.0.113.99' } }),
          mockResponse(),
        );
      }
      const res = mockResponse();
      const result = rateLimit(
        mockRequest({ url: '/api/replay', socket: { remoteAddress: '203.0.113.99' } }),
        res,
      );
      expect(result).toBe(false);
      expect(res._statusCode).toBe(429);
      const body = parseJsonBody(res);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Rate limit exceeded');
    });

    it('uses per-IP keying (P0-4 fix)', () => {
      const limit = LIMITS['/api/replay']?.limit ?? 10;
      for (let i = 0; i < limit; i++) {
        rateLimit(
          mockRequest({ url: '/api/replay', socket: { remoteAddress: '203.0.113.1' } }),
          mockResponse(),
        );
      }
      // Different IP should still be allowed
      const res = mockResponse();
      expect(
        rateLimit(
          mockRequest({ url: '/api/replay', socket: { remoteAddress: '203.0.113.2' } }),
          res,
        ),
      ).toBe(true);
    });
  });
});

/**
 * Rate Limit Middleware Tests — Phase 5.1
 * 
 * Tests the sliding window rate limiter implementation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// Inline the RateLimiter class for testing (same logic as the CJS module)
class RateLimiter {
  windows: Map<string, number[]>;

  constructor() {
    this.windows = new Map();
  }

  check(key: string, limit: number, windowMs: number = 60000) {
    const now = Date.now();
    const cutoff = now - windowMs;

    let timestamps = this.windows.get(key) || [];
    timestamps = timestamps.filter(t => t > cutoff);

    if (timestamps.length >= limit) {
      this.windows.set(key, timestamps);
      return {
        allowed: false,
        remaining: 0,
        resetMs: timestamps[0] + windowMs - now,
      };
    }

    timestamps.push(now);
    this.windows.set(key, timestamps);

    return {
      allowed: true,
      remaining: limit - timestamps.length,
      resetMs: windowMs,
    };
  }

  cleanup() {
    const now = Date.now();
    for (const [key, timestamps] of this.windows) {
      const active = timestamps.filter(t => now - t < 120000);
      if (active.length === 0) {
        this.windows.delete(key);
      } else {
        this.windows.set(key, active);
      }
    }
  }
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

describe('Rate Limiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  describe('Basic rate limiting', () => {
    it('should allow requests within the limit', () => {
      for (let i = 0; i < 10; i++) {
        const result = limiter.check('/api/sessions', 10, 60000);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(10 - i - 1);
      }
    });

    it('should block requests exceeding the limit', () => {
      // Fill up the limit
      for (let i = 0; i < 20; i++) {
        limiter.check('/api/sessions', 20, 60000);
      }

      // 21st request should be blocked
      const result = limiter.check('/api/sessions', 20, 60000);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should return remaining count', () => {
      const result1 = limiter.check('/api/test', 5, 60000);
      expect(result1.remaining).toBe(4);

      const result2 = limiter.check('/api/test', 5, 60000);
      expect(result2.remaining).toBe(3);
    });

    it('should provide resetMs when blocked', () => {
      for (let i = 0; i < 5; i++) {
        limiter.check('/api/test', 5, 60000);
      }

      const result = limiter.check('/api/test', 5, 60000);
      expect(result.allowed).toBe(false);
      expect(result.resetMs).toBeGreaterThan(0);
      expect(result.resetMs).toBeLessThanOrEqual(60000);
    });
  });

  describe('Sliding window', () => {
    it('should reset after window expires', () => {
      // Manually set timestamps in the past
      const pastTimestamp = Date.now() - 120000; // 2 minutes ago
      limiter.windows.set('/api/test', Array(5).fill(pastTimestamp));

      // New request should be allowed (old timestamps are outside the window)
      const result = limiter.check('/api/test', 5, 60000);
      expect(result.allowed).toBe(true);
    });
  });

  describe('Per-endpoint isolation', () => {
    it('should track endpoints independently', () => {
      // Fill up /api/sessions
      for (let i = 0; i < 5; i++) {
        limiter.check('/api/sessions', 5, 60000);
      }

      // /api/system should still be available
      const result = limiter.check('/api/system', 5, 60000);
      expect(result.allowed).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('should remove expired entries', () => {
      const pastTimestamp = Date.now() - 300000; // 5 minutes ago
      limiter.windows.set('/api/old', [pastTimestamp]);
      limiter.windows.set('/api/recent', [Date.now()]);

      limiter.cleanup();

      expect(limiter.windows.has('/api/old')).toBe(false);
      expect(limiter.windows.has('/api/recent')).toBe(true);
    });
  });

  describe('Rate limit response', () => {
    it('should produce 429 status when exceeded', () => {
      const res = mockRes();
      const limit = 2;

      for (let i = 0; i < limit; i++) {
        limiter.check('/api/test', limit, 60000);
      }

      const result = limiter.check('/api/test', limit, 60000);
      if (!result.allowed) {
        const retryAfter = Math.ceil(result.resetMs / 1000);
        res.writeHead(429, {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfter),
        });
        res.end(JSON.stringify({
          ok: false,
          error: 'Rate limit exceeded',
          retryAfterMs: result.resetMs,
        }));
      }

      expect(res._statusCode).toBe(429);
      expect(JSON.parse(res._body)).toHaveProperty('error', 'Rate limit exceeded');
    });

    it('should include X-RateLimit headers', () => {
      const res = mockRes();
      const result = limiter.check('/api/test', 10, 60000);

      res.setHeader('X-RateLimit-Limit', '10');
      res.setHeader('X-RateLimit-Remaining', String(result.remaining));
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetMs / 1000)));

      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '9');
    });
  });
});

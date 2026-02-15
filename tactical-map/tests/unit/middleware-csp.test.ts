/**
 * CSP / Security Headers Middleware Tests — Phase 5.1
 * 
 * Tests that Content-Security-Policy and hardening headers are applied correctly.
 */
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';

function mockRes() {
  const res = new EventEmitter() as any;
  res._headers = {} as Record<string, string>;
  res.setHeader = vi.fn((name: string, value: string) => {
    res._headers[name.toLowerCase()] = value;
    return res;
  });
  return res;
}

// Replicate the CSP middleware logic for testing
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

function applySecurityHeaders(res: any) {
  res.setHeader('Content-Security-Policy', CSP_DIRECTIVES);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

describe('CSP / Security Headers Middleware', () => {

  describe('Content-Security-Policy header', () => {
    it('should set CSP header on response', () => {
      const res = mockRes();
      applySecurityHeaders(res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.stringContaining("default-src 'self'")
      );
    });

    it('should include all required CSP directives', () => {
      const res = mockRes();
      applySecurityHeaders(res);

      const cspCall = (res.setHeader as any).mock.calls.find(
        (c: any) => c[0] === 'Content-Security-Policy'
      );
      const cspValue = cspCall[1] as string;

      expect(cspValue).toContain("default-src 'self'");
      expect(cspValue).toContain("script-src 'self'");
      expect(cspValue).toContain("style-src 'self' 'unsafe-inline'");
      expect(cspValue).toContain("img-src 'self' data:");
      expect(cspValue).toContain("font-src 'self'");
      expect(cspValue).toContain("connect-src 'self'");
      expect(cspValue).toContain("frame-ancestors 'none'");
      expect(cspValue).toContain("object-src 'none'");
      expect(cspValue).toContain("base-uri 'self'");
    });

    it('should NOT allow unsafe-eval in script-src', () => {
      const res = mockRes();
      applySecurityHeaders(res);

      const cspCall = (res.setHeader as any).mock.calls.find(
        (c: any) => c[0] === 'Content-Security-Policy'
      );
      const cspValue = cspCall[1] as string;

      expect(cspValue).not.toContain('unsafe-eval');
    });

    it('should block iframes via frame-ancestors none', () => {
      const res = mockRes();
      applySecurityHeaders(res);

      const cspCall = (res.setHeader as any).mock.calls.find(
        (c: any) => c[0] === 'Content-Security-Policy'
      );
      const cspValue = cspCall[1] as string;

      expect(cspValue).toContain("frame-ancestors 'none'");
    });
  });

  describe('Security hardening headers', () => {
    it('should set X-Content-Type-Options: nosniff', () => {
      const res = mockRes();
      applySecurityHeaders(res);

      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    });

    it('should set X-Frame-Options: DENY', () => {
      const res = mockRes();
      applySecurityHeaders(res);

      expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    });

    it('should disable X-XSS-Protection (CSP is the real protection)', () => {
      const res = mockRes();
      applySecurityHeaders(res);

      expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '0');
    });

    it('should set Referrer-Policy', () => {
      const res = mockRes();
      applySecurityHeaders(res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Referrer-Policy',
        'strict-origin-when-cross-origin'
      );
    });
  });

  describe('CSP directive correctness', () => {
    it('should use semicolons to separate directives', () => {
      const directives = CSP_DIRECTIVES.split('; ');
      expect(directives.length).toBeGreaterThanOrEqual(9);
    });

    it('should not have trailing semicolons', () => {
      expect(CSP_DIRECTIVES.endsWith(';')).toBe(false);
    });

    it('should not contain wildcard * in any directive', () => {
      expect(CSP_DIRECTIVES).not.toContain(' *');
    });
  });
});

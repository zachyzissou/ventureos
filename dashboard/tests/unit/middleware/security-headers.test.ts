/**
 * Security headers middleware tests.
 */

import { describe, it, expect } from 'vitest';
import { mockResponse } from '../../helpers.js';
import { applySecurityHeaders, CSP_DIRECTIVES } from '../../../server/middleware/security-headers.js';

describe('Security Headers Middleware', () => {
  describe('CSP_DIRECTIVES', () => {
    it('is a non-empty string', () => {
      expect(typeof CSP_DIRECTIVES).toBe('string');
      expect(CSP_DIRECTIVES.length).toBeGreaterThan(0);
    });

    it('includes default-src directive', () => {
      expect(CSP_DIRECTIVES).toContain("default-src 'self'");
    });

    it('blocks framing (clickjacking protection)', () => {
      expect(CSP_DIRECTIVES).toContain("frame-ancestors 'none'");
    });

    it('blocks object/plugin sources', () => {
      expect(CSP_DIRECTIVES).toContain("object-src 'none'");
    });

    it('restricts base-uri', () => {
      expect(CSP_DIRECTIVES).toContain("base-uri 'self'");
    });

    it('restricts connect-src', () => {
      expect(CSP_DIRECTIVES).toContain("connect-src 'self'");
    });
  });

  describe('applySecurityHeaders', () => {
    it('sets Content-Security-Policy', () => {
      const res = mockResponse();
      applySecurityHeaders(res);
      expect(res._headers['content-security-policy']).toBe(CSP_DIRECTIVES);
    });

    it('sets X-Content-Type-Options to nosniff', () => {
      const res = mockResponse();
      applySecurityHeaders(res);
      expect(res._headers['x-content-type-options']).toBe('nosniff');
    });

    it('sets X-Frame-Options to DENY', () => {
      const res = mockResponse();
      applySecurityHeaders(res);
      expect(res._headers['x-frame-options']).toBe('DENY');
    });

    it('disables X-XSS-Protection (CSP is the real protection)', () => {
      const res = mockResponse();
      applySecurityHeaders(res);
      expect(res._headers['x-xss-protection']).toBe('0');
    });

    it('sets Referrer-Policy', () => {
      const res = mockResponse();
      applySecurityHeaders(res);
      expect(res._headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });

    it('does NOT set HSTS (LAN-only deployment)', () => {
      const res = mockResponse();
      applySecurityHeaders(res);
      expect(res._headers['strict-transport-security']).toBeUndefined();
    });
  });
});

/**
 * Security Headers Middleware — CSP + Hardening Headers
 * Phase 5.1 Security Implementation
 *
 * See: SECURITY_ARCHITECTURE.md §4
 *
 * Applies Content-Security-Policy and other security headers to all responses.
 * These headers provide defense-in-depth against XSS, clickjacking, and
 * content-type sniffing attacks.
 *
 * Migrated from server/middleware/security-headers.js (Phase 3 — Issue #76).
 */

import type { ServerResponse } from 'node:http';

export const CSP_DIRECTIVES: string = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",   // Dashboard uses inline scripts; refactoring to external files out of scope
  "style-src 'self' 'unsafe-inline'",    // Dashboard uses inline styles; refactoring out of scope
  "img-src 'self' data:",                // data: URIs for inline SVGs/icons
  "font-src 'self'",
  "connect-src 'self'",                  // Prevents XHR/fetch to external servers
  "frame-ancestors 'none'",             // Blocks clickjacking via iframes
  "object-src 'none'",                  // Blocks Flash/Java plugins
  "base-uri 'self'",                    // Prevents <base> tag injection
].join('; ');

/**
 * Apply security headers to a response.
 * Should be called early in the request pipeline, before any response is sent.
 */
export function applySecurityHeaders(res: ServerResponse): void {
  res.setHeader('Content-Security-Policy', CSP_DIRECTIVES);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0'); // Disabled; CSP is the real protection
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Note: HSTS (Strict-Transport-Security) omitted — LAN-only HTTP deployment,
  // no TLS in current architecture. Adding HSTS without TLS would break things.
}

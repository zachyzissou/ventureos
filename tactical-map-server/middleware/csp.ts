/**
 * CSP / Security Headers Middleware
 * Phase 5.1 Security Implementation
 * 
 * See: SECURITY_ARCHITECTURE.md §4
 */
import { ServerResponse } from 'http';

const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",  // PixiJS may use inline styles
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

/**
 * Apply CSP and security hardening headers to a response.
 */
export function cspMiddleware(res: ServerResponse): void {
  res.setHeader('Content-Security-Policy', CSP_POLICY);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

export { CSP_POLICY };

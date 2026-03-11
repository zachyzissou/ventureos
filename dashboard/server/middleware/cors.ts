/**
 * CORS Middleware — Strict Origin Whitelist
 * Phase 5.1 Security Implementation
 *
 * See: SECURITY_ARCHITECTURE.md §3
 *
 * Replaces the wildcard `Access-Control-Allow-Origin: *` with a strict
 * whitelist of known dashboard origins. Only origins in the whitelist
 * receive CORS headers; others are silently denied by the browser.
 *
 * Migrated from server/middleware/cors.js (Phase 3 — Issue #76).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

export const ALLOWED_ORIGINS: Set<string> = new Set([
  'http://192.168.225.149:7001',
  'http://192.168.225.149:7000',
  'http://localhost:7001',
  'http://localhost:7000',
  'http://localhost:5173', // Vite dev server (tactical-map development)
]);

/**
 * Apply CORS headers to a response based on the request origin.
 * Only sets Access-Control-Allow-Origin if the origin is whitelisted.
 */
export function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const origin: string = (req.headers['origin'] as string | undefined) ?? '';
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  // Always set allowed methods/headers (harmless without Allow-Origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight for 24h
}

/**
 * Handle CORS preflight (OPTIONS) requests.
 * Returns true if the request was a preflight and has been handled.
 * Returns false if the request should continue to the next handler.
 */
export function handlePreflight(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method !== 'OPTIONS') return false;
  applyCors(req, res);
  res.writeHead(204);
  res.end();
  return true;
}

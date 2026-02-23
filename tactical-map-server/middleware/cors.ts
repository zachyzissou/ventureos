/**
 * CORS Middleware — Strict Origin Whitelist
 * Phase 5.1 Security Implementation
 * 
 * See: SECURITY_ARCHITECTURE.md §3
 */
import { IncomingMessage, ServerResponse } from 'http';

const ALLOWED_ORIGINS = new Set([
  'http://192.168.225.149:7001',
  'http://192.168.225.149:7000',
  'http://localhost:7001',
  'http://localhost:7000',
  'http://localhost:5173',  // Vite dev server
]);

/**
 * Apply CORS headers if origin is whitelisted.
 */
export function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/**
 * Handle CORS preflight (OPTIONS) requests.
 * Returns true if handled (caller should return), false to continue.
 */
export function corsMiddleware(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true; // Handled
  }

  return false; // Continue
}

export { ALLOWED_ORIGINS };

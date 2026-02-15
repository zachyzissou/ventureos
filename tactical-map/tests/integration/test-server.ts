/**
 * Test HTTP Server — Real Middleware Integration
 *
 * Spins up a real HTTP server with actual middleware attached.
 * Tests make real fetch() requests against this server.
 */
import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { AddressInfo } from 'net';

import { authMiddleware, authenticate, getToken } from '../../../tactical-map-server/middleware/auth.ts';
import { applyCors, corsMiddleware, ALLOWED_ORIGINS } from '../../../tactical-map-server/middleware/cors.ts';
import { cspMiddleware, CSP_POLICY } from '../../../tactical-map-server/middleware/csp.ts';

export { getToken, ALLOWED_ORIGINS, CSP_POLICY };

export interface TestServer {
  url: string;
  port: number;
  server: Server;
  close: () => Promise<void>;
}

/**
 * Create a test server with all middleware wired up (auth + cors + csp).
 * 
 * Request flow:
 *   1. CORS middleware (sets CORS headers, handles OPTIONS preflight)
 *   2. CSP middleware (sets security headers)
 *   3. Auth middleware (validates Bearer token for /api/* routes)
 *   4. Route handler (returns JSON response)
 */
export function createTestServer(): Promise<TestServer> {
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      // 1. CORS middleware
      const handled = corsMiddleware(req, res);
      if (handled) return; // OPTIONS preflight handled

      // Also apply the applyCors headers for non-OPTIONS
      applyCors(req, res);

      // 2. CSP / security headers
      cspMiddleware(res);

      // 3. Auth check (functional style — skips non-/api/ routes)
      if (!authenticate(req, res)) return; // 401 sent by authenticate

      // 4. Route handler
      if (req.url?.startsWith('/api/')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, path: req.url, method: req.method }));
      } else if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy' }));
      } else {
        // Static route (no auth required)
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body>Static</body></html>');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        port: addr.port,
        server,
        close: () => new Promise<void>((res, rej) => {
          server.close((err) => err ? rej(err) : res());
        }),
      });
    });

    server.on('error', reject);
  });
}

/**
 * Create a test server with ONLY auth middleware (callback style).
 * Used to test authMiddleware() directly.
 */
export function createAuthOnlyServer(): Promise<TestServer> {
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      authMiddleware(req, res, () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, authenticated: true }));
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        port: addr.port,
        server,
        close: () => new Promise<void>((res, rej) => {
          server.close((err) => err ? rej(err) : res());
        }),
      });
    });

    server.on('error', reject);
  });
}

/**
 * Create a test server with ONLY CORS middleware.
 */
export function createCorsOnlyServer(): Promise<TestServer> {
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const handled = corsMiddleware(req, res);
      if (handled) return;

      applyCors(req, res);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        port: addr.port,
        server,
        close: () => new Promise<void>((res, rej) => {
          server.close((err) => err ? rej(err) : res());
        }),
      });
    });

    server.on('error', reject);
  });
}

/**
 * Create a test server with ONLY CSP middleware.
 */
export function createCspOnlyServer(): Promise<TestServer> {
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      cspMiddleware(res);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        port: addr.port,
        server,
        close: () => new Promise<void>((res, rej) => {
          server.close((err) => err ? rej(err) : res());
        }),
      });
    });

    server.on('error', reject);
  });
}

/**
 * Auth Middleware — Pre-shared API Key (Bearer Token)
 * Phase 5.1 Security Implementation
 *
 * See: SECURITY_ARCHITECTURE.md §1
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { randomBytes, timingSafeEqual } from 'crypto';
import { IncomingMessage, ServerResponse } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { LOG_DIR } from '../../lib/paths.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const TOKEN_PATH = join(DATA_DIR, '.api-token');
const ACCESS_LOG = join(LOG_DIR, 'tactical-map-access.log');

// Ensure directories exist
try { mkdirSync(DATA_DIR, { recursive: true }); } catch {}
try { mkdirSync(LOG_DIR, { recursive: true }); } catch {}

/**
 * Generate or load the API token.
 */
function ensureToken(): string {
  if (process.env.DASHBOARD_API_TOKEN) {
    return process.env.DASHBOARD_API_TOKEN;
  }

  if (existsSync(TOKEN_PATH)) {
    return readFileSync(TOKEN_PATH, 'utf8').trim();
  }

  const token = randomBytes(32).toString('base64url');
  writeFileSync(TOKEN_PATH, token, { mode: 0o600 });
  console.log(`[AUTH] Generated new API token. First 8 chars: ${token.substring(0, 8)}...`);
  console.log(`[AUTH] Token stored at: ${TOKEN_PATH}`);
  return token;
}

const VALID_TOKEN = ensureToken();

function sanitizePathForLog(rawUrl: string | undefined): string {
  if (!rawUrl) return '-';
  try {
    return new URL(rawUrl, 'http://localhost').pathname;
  } catch {
    const qIdx = rawUrl.indexOf('?');
    return qIdx >= 0 ? rawUrl.slice(0, qIdx) : rawUrl;
  }
}

/**
 * Log auth events to the access log file.
 */
function logAuthEvent(event: string, req: IncomingMessage | null, detail: string = ''): void {
  const entry = {
    ts: new Date().toISOString(),
    event,
    ip: req ? (req.socket?.remoteAddress || 'unknown') : 'internal',
    method: req?.method || '-',
    path: sanitizePathForLog(req?.url),
    userAgent: ((req?.headers?.['user-agent'] || '-') as string).substring(0, 200),
    detail,
  };

  try {
    appendFileSync(ACCESS_LOG, JSON.stringify(entry) + '\n');
  } catch (err: any) {
    console.error('[AUTH] Failed to write access log:', err.message);
  }
}

/**
 * Timing-safe token comparison.
 */
function tokenMatch(provided: string): boolean {
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(VALID_TOKEN);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Auth middleware for HTTP request handlers.
 * 
 * Usage (callback style):
 *   authMiddleware(req, res, () => { handleRequest(req, res); });
 * 
 * Routes protected: All /api/tactical-map/* routes
 * Routes excluded: Static assets (/map, /map/assets/*)
 */
export function authMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
): void {
  // OPTIONS preflight always passes
  if (req.method === 'OPTIONS') {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logAuthEvent('auth_failure', req, 'Missing or invalid Authorization header');
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing or invalid Authorization header' }));
    return;
  }

  const token = authHeader.slice(7); // Remove "Bearer "

  if (!tokenMatch(token)) {
    logAuthEvent('auth_failure', req, 'Invalid token');
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid API token' }));
    return;
  }

  next();
}

/**
 * Functional-style auth check (returns boolean, same as dashboard server version).
 */
export function authenticate(
  req: IncomingMessage,
  res: ServerResponse
): boolean {
  if (req.method === 'OPTIONS') return true;
  if (!req.url || !req.url.startsWith('/api/')) return true;

  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (tokenMatch(token)) return true;
  }

  logAuthEvent('auth_failure', req, authHeader ? 'Invalid token' : 'Missing Authorization header');
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
  return false;
}

export function getToken(): string {
  return VALID_TOKEN;
}

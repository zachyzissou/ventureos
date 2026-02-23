/**
 * Auth Middleware — Pre-shared API Key (Bearer Token)
 * Phase 5.1 Security Implementation
 *
 * See: SECURITY_ARCHITECTURE.md §1
 *
 * Migrated from server/middleware/auth.js (Phase 3 — Issue #76).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CookieMap } from '../types.js';
import paths from '../../../lib/paths.js';

const { LOG_DIR, DASHBOARD_DATA_DIR } = paths as typeof import('../../../lib/paths.js');

/**
 * Canonical data directory — resolves via lib/paths.ts → VENTUREOS_ROOT/dashboard/data.
 * Independent of import.meta.dirname so dev and dist modes use the same token.
 */
const DATA_DIR: string = DASHBOARD_DATA_DIR ?? path.join(import.meta.dirname, '..', '..', 'data');
const TOKEN_PATH: string = path.join(DATA_DIR, '.api-token');
const ACCESS_LOG: string = path.join(LOG_DIR, 'tactical-map-access.log');

const ALLOW_LAN_BYPASS: boolean =
  ((process.env.DASHBOARD_ALLOW_LAN_BYPASS ?? 'false').toLowerCase() === 'true');
const TRUST_PROXY: boolean =
  ((process.env.DASHBOARD_TRUST_PROXY ?? 'false').toLowerCase() === 'true');
const TRUSTED_PROXY_IPS: Set<string> = new Set(
  (process.env.DASHBOARD_TRUSTED_PROXY_IPS ?? '127.0.0.1,::1,::ffff:127.0.0.1')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean),
);

// Ensure directories exist
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch { /* may exist */ }
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch { /* may exist */ }

/**
 * Generate or load the API token.
 * Token is a 256-bit cryptographically random value, base64url-encoded.
 * File permissions: 0600 (owner read/write only).
 */
function ensureToken(): string {
  // Environment variable takes precedence (for testing/rotation)
  if (process.env.DASHBOARD_API_TOKEN) {
    return process.env.DASHBOARD_API_TOKEN;
  }

  if (fs.existsSync(TOKEN_PATH)) {
    return fs.readFileSync(TOKEN_PATH, 'utf8').trim();
  }

  const token: string = crypto.randomBytes(32).toString('base64url');
  fs.writeFileSync(TOKEN_PATH, token, { mode: 0o600 });
  console.log(`[AUTH] Generated new API token. First 8 chars: ${token.substring(0, 8)}...`);
  console.log(`[AUTH] Token stored at: ${TOKEN_PATH}`);
  return token;
}

let VALID_TOKEN: string;
try {
  VALID_TOKEN = ensureToken();
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('[AUTH] FATAL: Cannot generate or read API token:', msg);
  console.error('[AUTH] Server refuses to start without authentication.');
  process.exit(1);
}

// Brute-force tracking: IP → [timestamps]
const authFailures: Map<string, number[]> = new Map();
const BRUTE_FORCE_WINDOW_MS: number = 5 * 60 * 1000; // 5 minutes
const BRUTE_FORCE_THRESHOLD: number = 10;
const BRUTE_FORCE_BLOCK_MS: number = 15 * 60 * 1000; // 15 minutes
const blockedIPs: Map<string, number> = new Map(); // ip → blockedUntil timestamp

function normalizeIp(ip: string): string {
  if (!ip) return ip;
  return ip.replace(/^::ffff:/, '');
}

/**
 * Check if an IP is RFC1918 private network or loopback.
 */
function isLanIP(ip: string): boolean {
  const cleaned: string = normalizeIp(ip);
  if (cleaned === '::1') return true;

  const octets: number[] = cleaned
    .split('.')
    .map((part) => Number.parseInt(part, 10));
  if (octets.length !== 4 || octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return false;
  }

  const [a, b] = octets;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12

  return false;
}

function getPeerIp(req: IncomingMessage | null): string {
  if (!req) return 'unknown';
  return req.socket?.remoteAddress ?? 'unknown';
}

function isTrustedProxyPeer(ip: string): boolean {
  const cleaned: string = normalizeIp(ip);
  return TRUSTED_PROXY_IPS.has(ip) || TRUSTED_PROXY_IPS.has(cleaned);
}

function getClientIp(req: IncomingMessage | null): string {
  const peerIp: string = getPeerIp(req);
  if (!req || !TRUST_PROXY || !isTrustedProxyPeer(peerIp)) {
    return peerIp;
  }

  const xffRaw: string | string[] | undefined = req.headers['x-forwarded-for'];
  const xff: string = Array.isArray(xffRaw) ? xffRaw[0] : (xffRaw ?? '');
  if (typeof xff === 'string' && xff.trim()) {
    const first: string = xff.split(',')[0].trim();
    if (first) return first;
  }

  return peerIp;
}

function sanitizePathForLog(rawUrl: string | undefined): string {
  if (!rawUrl) return '-';
  try {
    return new URL(rawUrl, 'http://localhost').pathname;
  } catch {
    const qIdx: number = rawUrl.indexOf('?');
    return qIdx >= 0 ? rawUrl.slice(0, qIdx) : rawUrl;
  }
}

/**
 * Log auth events to the access log file (JSON Lines format).
 */
export function logAuthEvent(event: string, req: IncomingMessage | null, detail: string = ''): void {
  const entry = {
    ts: new Date().toISOString(),
    event,
    ip: req ? getClientIp(req) : 'internal',
    method: req?.method ?? '-',
    path: sanitizePathForLog(req?.url),
    userAgent: ((req?.headers?.['user-agent'] as string | undefined) ?? '-').substring(0, 200),
    detail,
  };

  try {
    fs.appendFileSync(ACCESS_LOG, JSON.stringify(entry) + '\n');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[AUTH] Failed to write access log:', msg);
  }
}

/**
 * Track an auth failure for brute-force detection.
 * Returns true if the IP should be blocked.
 */
function trackAuthFailure(ip: string): boolean {
  // LAN IPs get 401 on bad auth but are never IP-blocked (prevents self-DoS)
  if (isLanIP(ip)) return false;

  const now: number = Date.now();
  const cutoff: number = now - BRUTE_FORCE_WINDOW_MS;

  let timestamps: number[] = authFailures.get(ip) ?? [];
  timestamps = timestamps.filter((t) => t > cutoff);
  timestamps.push(now);
  authFailures.set(ip, timestamps);

  if (timestamps.length > BRUTE_FORCE_THRESHOLD) {
    blockedIPs.set(ip, now + BRUTE_FORCE_BLOCK_MS);
    logAuthEvent(
      'brute_force_suspected',
      null,
      `IP ${ip} blocked for ${BRUTE_FORCE_BLOCK_MS / 1000}s after ${timestamps.length} failures`,
    );
    return true;
  }
  return false;
}

/**
 * Check if an IP is currently blocked.
 */
function isBlocked(ip: string): boolean {
  const blockedUntil: number | undefined = blockedIPs.get(ip);
  if (blockedUntil === undefined) return false;
  if (Date.now() > blockedUntil) {
    blockedIPs.delete(ip);
    authFailures.delete(ip);
    return false;
  }
  return true;
}

/**
 * Timing-safe token comparison.
 * Returns true if the provided token matches the valid token.
 */
export function tokenMatch(provided: string): boolean {
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a: Buffer = Buffer.from(provided);
  const b: Buffer = Buffer.from(VALID_TOKEN);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export const COOKIE_NAME: string = process.env.DASHBOARD_AUTH_COOKIE ?? 'openclaw_dashboard_token';

export function parseCookies(header: string = ''): CookieMap {
  const out: CookieMap = {};
  if (!header || typeof header !== 'string') return out;
  const parts: string[] = header.split(';');
  for (const p of parts) {
    const idx: number = p.indexOf('=');
    if (idx === -1) continue;
    const k: string = p.slice(0, idx).trim();
    const v: string = p.slice(idx + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function getAuthTokenFromRequest(req: IncomingMessage | null): string | null {
  if (!req) return null;

  // 1) Authorization header
  const authHeader: string = (req.headers?.['authorization'] as string | undefined) ?? '';
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token: string = authHeader.slice(7);
    if (token) return token;
  }

  // 2) HttpOnly cookie (preferred for browsers)
  const cookies: CookieMap = parseCookies((req.headers?.cookie as string | undefined) ?? '');
  if (cookies[COOKIE_NAME]) return cookies[COOKIE_NAME];

  return null;
}

export function isAuthenticated(req: IncomingMessage): boolean {
  const ip: string = getClientIp(req);
  if (ALLOW_LAN_BYPASS && isLanIP(ip)) {
    return true;
  }

  const provided: string | null = getAuthTokenFromRequest(req);
  return !!(provided && tokenMatch(provided));
}

export function authenticate(req: IncomingMessage, res: ServerResponse): boolean {
  // OPTIONS preflight always passes (CORS requires it)
  if (req.method === 'OPTIONS') return true;

  // Static assets don't require auth
  if (!req.url || !req.url.startsWith('/api/')) return true;

  // Login/logout endpoints must be reachable without prior auth
  if (req.url === '/api/login' || req.url === '/api/logout') return true;

  // Health check endpoint — unauthenticated for container healthchecks (Issue #191)
  if (req.url === '/api/health') return true;

  const ip: string = getClientIp(req);

  // Optional LAN bypass for explicit local deployments only.
  if (ALLOW_LAN_BYPASS && isLanIP(ip)) {
    logAuthEvent('auth_lan_bypass', req, `LAN bypass enabled for IP ${ip}`);
    return true;
  }

  // Check if IP is blocked from brute-force detection
  if (isBlocked(ip)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Too many authentication failures. Try again later.' }));
    logAuthEvent('auth_blocked', req, `IP ${ip} is temporarily blocked`);
    return false;
  }

  const provided: string | null = getAuthTokenFromRequest(req);
  if (provided && tokenMatch(provided)) {
    // Successful auth — don't log every success to avoid log spam
    return true;
  }

  // Authentication failed
  trackAuthFailure(ip);
  const authHeader: string = (req.headers['authorization'] as string | undefined) ?? '';
  const cookies: CookieMap = parseCookies((req.headers?.cookie as string | undefined) ?? '');
  const hasAnyCreds: boolean =
    (authHeader.trim().length > 0) ||
    !!cookies[COOKIE_NAME];
  logAuthEvent('auth_failure', req, hasAnyCreds ? 'Invalid token' : 'Missing credentials');

  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
  return false;
}

/**
 * Get the current valid token (for display/testing purposes).
 */
export function getToken(): string {
  return VALID_TOKEN;
}

// Periodic cleanup of brute-force tracking data
setInterval(() => {
  const now: number = Date.now();
  const cutoff: number = now - BRUTE_FORCE_WINDOW_MS;
  for (const [ip, timestamps] of authFailures) {
    const active: number[] = timestamps.filter((t) => t > cutoff);
    if (active.length === 0) {
      authFailures.delete(ip);
    } else {
      authFailures.set(ip, active);
    }
  }
  for (const [ip, blockedUntil] of blockedIPs) {
    if (now > blockedUntil) blockedIPs.delete(ip);
  }
}, 60000);

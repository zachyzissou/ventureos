/**
 * Rate Limit Middleware — Per-IP per-endpoint sliding window
 * Phase 5.1 Security Implementation (updated P0-4 fix: per-IP keying)
 *
 * See: SECURITY_ARCHITECTURE.md §6
 *
 * Simple in-memory sliding window rate limiter.
 * No Redis needed for single-user LAN deployment.
 *
 * Key change (P0-4): Rate limit key is now `${clientIP}:${endpoint}` instead
 * of just the endpoint path. This prevents a single polling dashboard from
 * consuming the global quota and locking out every other client.
 *
 * Migrated from server/middleware/rate-limit.js (Phase 3 — Issue #76).
 *
 * NOTE (Issue #79 — Consolidation Audit):
 * This module is intentionally NOT consolidated with `lib/rate-limiter.ts`.
 * They serve fundamentally different domains:
 *   - THIS: HTTP middleware — per-client-IP, per-endpoint sliding windows
 *   - lib/rate-limiter.ts: Agent conversation — per-agent, per-conversation,
 *     with challenge limits, pair overrides, and backoff strategies
 * Merging them would add complexity without benefit.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RateLimitResult, RateLimitConfig } from '../types.js';

const TRUST_PROXY: boolean =
  ((process.env.DASHBOARD_TRUST_PROXY ?? 'false').toLowerCase() === 'true');
const TRUSTED_PROXY_IPS: Set<string> = new Set(
  (process.env.DASHBOARD_TRUSTED_PROXY_IPS ?? '127.0.0.1,::1,::ffff:127.0.0.1')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean),
);

function normalizeIp(ip: string): string {
  if (!ip) return ip;
  return ip.replace(/^::ffff:/, '');
}

function getPeerIp(req: IncomingMessage): string {
  return req.socket?.remoteAddress ?? '0.0.0.0';
}

function isTrustedProxyPeer(ip: string): boolean {
  const cleaned: string = normalizeIp(ip);
  return TRUSTED_PROXY_IPS.has(ip) || TRUSTED_PROXY_IPS.has(cleaned);
}

export class RateLimiter {
  private windows: Map<string, number[]> = new Map();

  /**
   * Check if a request is within the rate limit.
   */
  check(key: string, limit: number, windowMs: number = 60000): RateLimitResult {
    const now: number = Date.now();
    const cutoff: number = now - windowMs;

    let timestamps: number[] = this.windows.get(key) ?? [];
    timestamps = timestamps.filter((t) => t > cutoff);

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

  /**
   * Periodic cleanup of expired entries.
   */
  cleanup(): void {
    const now: number = Date.now();
    for (const [key, timestamps] of this.windows) {
      const active: number[] = timestamps.filter((t) => now - t < 120000);
      if (active.length === 0) {
        this.windows.delete(key);
      } else {
        this.windows.set(key, active);
      }
    }
  }
}

export const limiter: RateLimiter = new RateLimiter();
const cleanupInterval = setInterval(() => limiter.cleanup(), 300000); // Cleanup every 5 minutes
cleanupInterval.unref();

/**
 * Per-endpoint rate limit configuration.
 * See SECURITY_ARCHITECTURE.md §6.2 for rationale.
 *
 * Limits increased (P0-4) for dashboard-polled endpoints:
 *   /api/sessions, /api/costs, /api/usage, /api/system — 60/min
 *   (dashboard polls every 5s = 12 req/min, 60 gives 5× headroom)
 */
export const LIMITS: Record<string, RateLimitConfig> = {
  '/api/sessions':            { limit: 60, windowMs: 60000 },
  '/api/ventureos-agents':    { limit: 30, windowMs: 60000 },
  '/api/ventureos-kpis':      { limit: 30, windowMs: 60000 },
  '/api/rpg/stats':           { limit: 20, windowMs: 60000 },
  '/api/rpg/khala-network':   { limit: 20, windowMs: 60000 },
  '/api/rpg/conversations':   { limit: 30, windowMs: 60000 },
  '/api/costs':               { limit: 60, windowMs: 60000 },
  '/api/usage':               { limit: 60, windowMs: 60000 },
  '/api/system':              { limit: 60, windowMs: 60000 },
  '/api/token-compaction':    { limit: 30, windowMs: 60000 },
  '/api/self-improvement':    { limit: 20, windowMs: 60000 },
  '/api/code-factory':        { limit: 20, windowMs: 60000 },
  '/api/webmcp':              { limit: 30, windowMs: 60000 },
  '/api/visual-explainer':    { limit: 30, windowMs: 60000 },
  '/api/proposal-lifecycle':  { limit: 30, windowMs: 60000 },
  '/api/living-files':        { limit: 30, windowMs: 60000 },
  '/api/replay':              { limit: 10, windowMs: 60000 },
  '/api/live':                { limit: 10, windowMs: 60000 },
  '/api/conversation':        { limit: 30, windowMs: 60000 },
};

/**
 * Extract the client IP using the same trust-proxy policy as auth middleware:
 * only honor X-Forwarded-For when proxy trust is enabled and the direct peer
 * is in DASHBOARD_TRUSTED_PROXY_IPS.
 */
function getClientIP(req: IncomingMessage): string {
  const peerIp: string = getPeerIp(req);
  if (!TRUST_PROXY || !isTrustedProxyPeer(peerIp)) {
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

/**
 * Apply rate limiting to an incoming request.
 * Returns true if the request should proceed, false if it was rate-limited.
 */
export function rateLimit(req: IncomingMessage, res: ServerResponse): boolean {
  if (!req.url || !req.url.startsWith('/api/')) return true;

  let pathname: string;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    return true;
  }

  // Find matching limit (longest prefix match)
  let matchedKey: string | null = null;
  let matchedConfig: RateLimitConfig | null = null;
  for (const [prefix, cfg] of Object.entries(LIMITS)) {
    if (pathname.startsWith(prefix)) {
      if (!matchedKey || prefix.length > matchedKey.length) {
        matchedKey = prefix;
        matchedConfig = cfg;
      }
    }
  }

  if (!matchedConfig) return true; // No limit configured for this endpoint

  // P0-4 fix: key by clientIP + endpoint so each client has its own bucket
  const clientIP: string = getClientIP(req);
  const rateLimitKey: string = `${clientIP}:${matchedKey}`;

  const result: RateLimitResult = limiter.check(rateLimitKey, matchedConfig.limit, matchedConfig.windowMs);

  // Always set rate limit headers
  res.setHeader('X-RateLimit-Limit', String(matchedConfig.limit));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetMs / 1000)));

  if (!result.allowed) {
    const retryAfter: number = Math.ceil(result.resetMs / 1000);
    res.writeHead(429, {
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfter),
    });
    res.end(
      JSON.stringify({
        ok: false,
        error: 'Rate limit exceeded',
        retryAfterMs: result.resetMs,
      }),
    );
    return false;
  }

  return true;
}

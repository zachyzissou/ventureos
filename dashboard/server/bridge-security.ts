import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readBridgeTokenOrThrow } from '../../lib/bridge-token-resolver.js';

export type RateLimitRule = { max: number; windowMs: number };
export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
};

export function normalizeIp(ip: string): string {
  if (!ip) return ip;
  return ip.replace(/^::ffff:/, '');
}

function ipToInt(ip: string): number | null {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

export function isAllowedIp(ip: string, cidrs: string[]): boolean {
  const cleaned = normalizeIp(ip);
  if (cleaned === '::1') return true;

  for (const cidr of cidrs) {
    const trimmed = cidr.trim();
    if (!trimmed) continue;
    if (trimmed === cleaned) return true;

    // IPv6 allowlist: only direct match for ::1 or ::ffff:127.0.0.1
    if (trimmed.includes(':')) {
      if (trimmed === '::1/128' && cleaned === '::1') return true;
      if (trimmed === '::1' && cleaned === '::1') return true;
      continue;
    }

    const [net, maskRaw] = trimmed.split('/');
    const mask = parseInt(maskRaw ?? '32', 10);
    const ipInt = ipToInt(cleaned);
    const netInt = ipToInt(net);
    if (ipInt === null || netInt === null) continue;
    const maskBits = mask < 0 ? 0 : mask > 32 ? 32 : mask;
    const maskInt = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0;
    if ((ipInt & maskInt) === (netInt & maskInt)) return true;
  }

  return false;
}

export function timingSafeEqual(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

export function authorizeRequest(authorizationHeader: string | undefined, bridgeToken: string): boolean {
  const auth = (authorizationHeader ?? '').toString();
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token) return false;
  return timingSafeEqual(token, bridgeToken);
}

export function readBridgeToken(tokenFile: string, envToken: string | undefined): string {
  return readBridgeTokenOrThrow({
    explicitToken: envToken,
    envTokenFile: process.env.BRIDGE_TOKEN_FILE,
    defaultTokenFile: tokenFile,
  }).token;
}

export function logBridgeAudit(
  auditLogPath: string,
  event: string,
  req: http.IncomingMessage,
  detail = '',
): void {
  const entry = {
    ts: new Date().toISOString(),
    event,
    ip: normalizeIp(req.socket?.remoteAddress ?? 'unknown'),
    method: req.method ?? '-',
    path: req.url ?? '-',
    detail,
  };
  try {
    fs.mkdirSync(path.dirname(auditLogPath), { recursive: true });
    fs.appendFileSync(auditLogPath, JSON.stringify(entry) + '\n');
  } catch {
    // ignore audit failures
  }
}

function parseWindowMs(raw: string): number {
  const m = raw.match(/^(\d+)(ms|s|m|h|d)?$/i);
  if (!m) return 60000;
  const value = parseInt(m[1] ?? '60', 10);
  const unit = (m[2] ?? 's').toLowerCase();
  const mult = unit === 'ms' ? 1 : unit === 'm' ? 60000 : unit === 'h' ? 3600000 : unit === 'd' ? 86400000 : 1000;
  return value * mult;
}

export function parseRateLimits(spec: string): Record<string, RateLimitRule> {
  const out: Record<string, RateLimitRule> = {};
  const parts = spec.split(';').map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const [name, rhs] = part.split('=');
    if (!name || !rhs) continue;
    const [limitRaw, windowRaw] = rhs.split('/');
    const max = parseInt(limitRaw ?? '60', 10);
    const windowMs = parseWindowMs(windowRaw ?? '60s');
    if (!Number.isNaN(max) && windowMs > 0) out[name.trim()] = { max, windowMs };
  }
  if (!out.default) out.default = { max: 60, windowMs: 60000 };
  return out;
}

export function rateLimitGroup(pathname: string): string {
  if (pathname.includes('/live')) return 'sse';
  if (
    pathname.includes('/costs') ||
    pathname.includes('/usage') ||
    pathname.includes('/session-messages') ||
    pathname.includes('/lifetime-stats')
  )
    return 'expensive';
  return 'default';
}

export function createRateLimiter(
  rateLimits: Record<string, RateLimitRule>,
): (ip: string, group: string) => RateLimitResult {
  const state: Map<string, number[]> = new Map();
  return (ip: string, group: string): RateLimitResult => {
    const rule = rateLimits[group] ?? rateLimits.default;
    const now = Date.now();
    const key = `${ip}:${group}`;
    const list = state.get(key) ?? [];
    const fresh = list.filter((t) => now - t < rule.windowMs);
    if (fresh.length >= rule.max) {
      state.set(key, fresh);
      const oldest = fresh[0] ?? now;
      const resetMs = Math.max(0, rule.windowMs - (now - oldest));
      return {
        allowed: false,
        limit: rule.max,
        remaining: 0,
        resetMs,
      };
    }
    fresh.push(now);
    state.set(key, fresh);
    const oldest = fresh[0] ?? now;
    const resetMs = Math.max(0, rule.windowMs - (now - oldest));
    return {
      allowed: true,
      limit: rule.max,
      remaining: Math.max(0, rule.max - fresh.length),
      resetMs,
    };
  };
}

/**
 * Bridge API — Host-native proxy for dashboard data access (Issue #140).
 *
 * This service runs on the host and exposes a minimal, authenticated API
 * for the containerized dashboard. Endpoints are namespaced under
 * `/api/bridge/*` and MUST enforce token auth + CIDR allowlist.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { handleKpis } from './routes/kpis.js';
import { handleObservations } from './routes/observations.js';
import { handleAgentHealth } from './routes/agent-health.js';
import {
  buildCostData,
  buildUsageWindows,
  buildTodayTokens,
  buildAvgResponseTime,
  buildLifetimeStats,
  buildSystemStats,
  trackDiskHistory,
  readHealthHistory,
} from './bridge-metrics.js';
import { redactSecrets } from '../../lib/message-sanitizer.js';
import paths from '../../lib/paths.js';

const {
  VENTUREOS_ROOT,
  OPENCLAW_DIR,
  SHARED_CONTEXT_DIR: SHARED_CONTEXT,
  KPI_DIR,
  OBSERVATIONS_DIR,
  LOG_DIR,
  agentSessionsDir,
  agentWorkspaceDir,
} = paths as typeof import('../../lib/paths.js');

const BRIDGE_PORT: number = parseInt(process.env.BRIDGE_PORT ?? '18790');
const BRIDGE_TOKEN_FILE: string =
  process.env.BRIDGE_TOKEN_FILE ?? path.join(OPENCLAW_DIR, 'bridge', 'bridge-token');
const BRIDGE_ALLOW_CIDRS: string =
  process.env.BRIDGE_ALLOW_CIDRS ?? '127.0.0.1/32,::1/128,192.168.65.0/24,172.17.0.0/16';
const BRIDGE_AUDIT_LOG: string =
  process.env.BRIDGE_AUDIT_LOG ?? path.join(LOG_DIR, 'bridge-access.jsonl');
const BRIDGE_RATE_LIMITS: string =
  process.env.BRIDGE_RATE_LIMITS ?? 'default=60/60s;expensive=10/60s;sse=4/60s';

const AGENT_ID: string = process.env.OPENCLAW_AGENT ?? 'main';
const WORKSPACE_DIR: string =
  process.env.WORKSPACE_DIR ??
  process.env.OPENCLAW_WORKSPACE ??
  agentWorkspaceDir(AGENT_ID);

const sessDir: string = agentSessionsDir(AGENT_ID);
const cronFile: string = path.join(OPENCLAW_DIR, 'cron', 'jobs.json');
const DATA_DIR: string = path.join(WORKSPACE_DIR, 'data');
const healthHistoryFile: string = path.join(DATA_DIR, 'health-history.json');

// ─── Utilities ─────────────────────────────────────────────────────────────

function sendJson(res: http.ServerResponse, body: unknown, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function clampInt(raw: string | number | null, min: number, max: number, fallback: number): number {
  const v = typeof raw === 'number' ? raw : parseInt(raw ?? '', 10);
  if (Number.isNaN(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

function safeReadJson(filePath: string, fallback: null): Record<string, unknown> | null;
function safeReadJson(filePath: string, fallback: Record<string, unknown>): Record<string, unknown>;
function safeReadJson(
  filePath: string,
  fallback: Record<string, unknown> | null,
): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return fallback;
  }
}

function safeReadText(filePath: string, fallback = ''): string {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

function normalizeIp(ip: string): string {
  if (!ip) return ip;
  return ip.replace(/^::ffff:/, '');
}

function ipToInt(ip: string): number | null {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function isAllowedIp(ip: string, cidrs: string[]): boolean {
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

function readToken(): string {
  if (process.env.BRIDGE_TOKEN) return process.env.BRIDGE_TOKEN.trim();
  if (fs.existsSync(BRIDGE_TOKEN_FILE)) {
    return fs.readFileSync(BRIDGE_TOKEN_FILE, 'utf8').trim();
  }
  throw new Error('Missing BRIDGE_TOKEN (set env or BRIDGE_TOKEN_FILE)');
}

const BRIDGE_TOKEN: string = (() => {
  try {
    return readToken();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[BRIDGE] FATAL:', msg);
    process.exit(1);
  }
})();

const ALLOWLIST: string[] = BRIDGE_ALLOW_CIDRS.split(',').map((c) => c.trim()).filter(Boolean);

function timingSafeEqual(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

function authorize(req: http.IncomingMessage): boolean {
  const auth = (req.headers['authorization'] ?? '').toString();
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token) return false;
  return timingSafeEqual(token, BRIDGE_TOKEN);
}

function logAudit(event: string, req: http.IncomingMessage, detail = ''): void {
  const entry = {
    ts: new Date().toISOString(),
    event,
    ip: normalizeIp(req.socket?.remoteAddress ?? 'unknown'),
    method: req.method ?? '-',
    path: req.url ?? '-',
    detail,
  };
  try {
    fs.mkdirSync(path.dirname(BRIDGE_AUDIT_LOG), { recursive: true });
    fs.appendFileSync(BRIDGE_AUDIT_LOG, JSON.stringify(entry) + '\n');
  } catch {
    // ignore audit failures
  }
}

// ─── Rate Limiting ─────────────────────────────────────────────────────────

type RateLimitRule = { max: number; windowMs: number };

function parseWindowMs(raw: string): number {
  const m = raw.match(/^(\d+)(ms|s|m|h|d)?$/i);
  if (!m) return 60000;
  const value = parseInt(m[1] ?? '60', 10);
  const unit = (m[2] ?? 's').toLowerCase();
  const mult = unit === 'ms' ? 1 : unit === 'm' ? 60000 : unit === 'h' ? 3600000 : unit === 'd' ? 86400000 : 1000;
  return value * mult;
}

function parseRateLimits(spec: string): Record<string, RateLimitRule> {
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

const RATE_LIMITS = parseRateLimits(BRIDGE_RATE_LIMITS);
const rateState: Map<string, number[]> = new Map();

function rateGroup(pathname: string): string {
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

function checkRateLimit(ip: string, group: string): boolean {
  const rule = RATE_LIMITS[group] ?? RATE_LIMITS.default;
  const now = Date.now();
  const key = `${ip}:${group}`;
  const list = rateState.get(key) ?? [];
  const fresh = list.filter((t) => now - t < rule.windowMs);
  if (fresh.length >= rule.max) {
    rateState.set(key, fresh);
    return false;
  }
  fresh.push(now);
  rateState.set(key, fresh);
  return true;
}

// ─── Sessions (filtered) ───────────────────────────────────────────────────

interface SessionsJsonEntry {
  label?: string;
  modelOverride?: string;
  model?: string;
  totalTokens?: number;
  contextTokens?: number;
  kind?: string;
  updatedAt?: number;
  createdAt?: number;
  abortedLastRun?: boolean;
  thinkingLevel?: string | null;
  channel?: string;
  sessionId?: string;
}

function isIsolatedSession(key: string, entry?: SessionsJsonEntry): boolean {
  const lower = key.toLowerCase();
  if (entry?.kind === 'isolated') return true;
  if (lower.includes('isolated') || lower.includes('subagent')) return true;
  return false;
}

function resolveName(key: string): string {
  if (key.includes(':main:main')) return 'main';
  if (key.includes('cron:')) {
    try {
      if (fs.existsSync(cronFile)) {
        const crons = JSON.parse(fs.readFileSync(cronFile, 'utf8')) as { jobs?: Array<{ id: string; name?: string }> };
        const jobs = crons.jobs ?? [];
        const cronPart: string = key.split('cron:')[1] ?? '';
        const cronUuid: string = cronPart.split(':')[0];
        const job = jobs.find((j) => j.id === cronUuid);
        if (job?.name) return job.name;
      }
    } catch {
      // ignore
    }
  }
  return key.split(':').pop()?.substring(0, 12) ?? key.substring(0, 12);
}

function getLastMessage(sessionId: string): string {
  try {
    const filePath: string = path.join(sessDir, sessionId + '.jsonl');
    if (!fs.existsSync(filePath)) return '';
    const data: string = fs.readFileSync(filePath, 'utf8');
    const lines: string[] = data.split('\n').filter((l) => l.trim());
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 20); i--) {
      try {
        const d = JSON.parse(lines[i]) as { type?: string; message?: { role?: string; content?: unknown } };
        if (d.type !== 'message') continue;
        const msg = d.message;
        if (!msg) continue;
        const role = msg.role;
        if (role !== 'user' && role !== 'assistant') continue;
        let text = '';
        if (typeof msg.content === 'string') {
          text = msg.content;
        } else if (Array.isArray(msg.content)) {
          for (const b of msg.content) {
            if (b && typeof b === 'object' && (b as { type?: string; text?: string }).type === 'text') {
              text = (b as { text?: string }).text ?? '';
              if (text) break;
            }
          }
        }
        if (text) {
          // Redact secrets/tokens per Issue #137 security requirement
          const redacted = redactSecrets(text);
          return redacted.text.replace(/\n/g, ' ').substring(0, 80);
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return '';
}

function getSessionsJson(): Array<Record<string, unknown>> {
  try {
    const sFile: string = path.join(sessDir, 'sessions.json');
    const data = safeReadJson(sFile, {}) as Record<string, SessionsJsonEntry>;
    const items = Object.entries(data)
      .filter(([key, entry]) => !isIsolatedSession(key, entry))
      .map(([key, s]) => ({
        key,
        label: s.label ?? resolveName(key),
        model: s.modelOverride ?? s.model ?? '-',
        totalTokens: s.totalTokens ?? 0,
        contextTokens: s.contextTokens ?? 0,
        kind: s.kind ?? (key.includes('group') ? 'group' : 'direct'),
        updatedAt: s.updatedAt ?? 0,
        createdAt: s.createdAt ?? s.updatedAt ?? 0,
        aborted: s.abortedLastRun ?? false,
        thinkingLevel: s.thinkingLevel ?? null,
        channel: s.channel ?? '-',
        sessionId: s.sessionId ?? key,
        lastMessage: getLastMessage(s.sessionId ?? key),
        cost: 0,
      }));
    return items;
  } catch {
    return [];
  }
}

function getAllowedSessionIds(): Set<string> | null {
  const sFile: string = path.join(sessDir, 'sessions.json');
  const data = safeReadJson(sFile, null) as Record<string, SessionsJsonEntry> | null;
  if (!data) {
    try {
      const files = fs.readdirSync(sessDir).filter((f) => f.endsWith('.jsonl'));
      const ids = new Set<string>();
      for (const file of files) {
        const id = file.replace(/\.jsonl$/, '');
        const lower = id.toLowerCase();
        if (lower.includes('isolated') || lower.includes('subagent')) continue;
        ids.add(id);
      }
      return ids;
    } catch {
      return null;
    }
  }
  const ids = new Set<string>();
  for (const [key, entry] of Object.entries(data)) {
    if (isIsolatedSession(key, entry)) continue;
    const id = (entry.sessionId ?? key).trim();
    if (id) ids.add(id);
  }
  return ids;
}

function getSessionMessages(sessionId: string): Array<{ role: string; content: string; timestamp: string }> {
  const messages: Array<{ role: string; content: string; timestamp: string }> = [];
  const filePath = path.join(sessDir, sessionId + '.jsonl');
  if (!fs.existsSync(filePath)) return messages;
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter((l) => l.trim());
  for (let i = Math.max(0, lines.length - 30); i < lines.length; i++) {
    try {
      const d = JSON.parse(lines[i]) as { type?: string; message?: { role?: string; content?: unknown }; timestamp?: string };
      if (d.type !== 'message') continue;
      const msg = d.message;
      if (!msg?.role) continue;
      let text = '';
      if (typeof msg.content === 'string') text = msg.content;
      else if (Array.isArray(msg.content)) {
        for (const b of msg.content) {
          if (b && typeof b === 'object' && (b as { type?: string; text?: string }).type === 'text') {
            text = (b as { text?: string }).text ?? '';
            break;
          }
        }
      }
      // Redact secrets/tokens per Issue #137 security requirement
      const redacted = redactSecrets(text);
      messages.push({ role: msg.role, content: redacted.text, timestamp: d.timestamp ?? '' });
    } catch {
      // ignore
    }
  }
  return messages;
}

// ─── Metrics Cache ─────────────────────────────────────────────────────────

let costCache: ReturnType<typeof buildCostData> | null = null;
let costCacheTime: number = 0;
let usageCache: ReturnType<typeof buildUsageWindows> | null = null;
let usageCacheTime: number = 0;
let lifetimeStatsCache: ReturnType<typeof buildLifetimeStats> | null = null;
let lifetimeStatsCacheTime: number = 0;

// ─── Server ────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, { ok: false, error: 'Missing URL' }, 400);
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if (pathname === '/health') {
    sendJson(res, { ok: true, version: 'bridge-0.1', uptime: process.uptime(), bridgeTime: new Date().toISOString() });
    return;
  }

  const peerIp = normalizeIp(req.socket?.remoteAddress ?? 'unknown');
  if (!isAllowedIp(peerIp, ALLOWLIST)) {
    logAudit('deny_ip', req, peerIp);
    sendJson(res, { ok: false, error: 'Forbidden' }, 403);
    return;
  }

  if (!authorize(req)) {
    logAudit('auth_failed', req);
    sendJson(res, { ok: false, error: 'Unauthorized' }, 401);
    return;
  }

  const group = rateGroup(pathname);
  if (!checkRateLimit(peerIp, group)) {
    logAudit('rate_limited', req, group);
    sendJson(res, { ok: false, error: 'Rate limit exceeded' }, 429);
    return;
  }

  if (pathname === '/api/bridge/config') {
    sendJson(res, {
      name: 'OpenClaw Bridge API',
      version: '0.1.0',
      ventureos: {
        VENTUREOS_ROOT,
        SHARED_CONTEXT,
        KPI_DIR,
        OBSERVATIONS_DIR,
      },
      capabilities: [
        { id: 'bridge', name: 'Bridge API', port: BRIDGE_PORT, status: 'active' },
      ],
    });
    return;
  }

  // KPI endpoints (reuse existing handlers)
  if (pathname.startsWith('/api/bridge/kpis')) {
    req.url = pathname.replace('/api/bridge', '/api') + url.search;
    if (handleKpis(req, res, { KPI_DIR, safeReadJson, sendJson, clampInt })) return;
  }

  // Observation endpoints (reuse existing handlers)
  if (pathname.startsWith('/api/bridge/observations')) {
    req.url = pathname.replace('/api/bridge', '/api') + url.search;
    if (handleObservations(req, res, { OBSERVATIONS_DIR, safeReadText, sendJson, clampInt })) return;
  }

  // Agent health
  if (pathname === '/api/bridge/agent-health') {
    req.url = '/api/agent-health';
    if (handleAgentHealth(req, res, { OPENCLAW_DIR, WORKSPACE_DIR, sendJson })) return;
  }

  // Sessions (filtered)
  if (pathname === '/api/bridge/sessions') {
    logAudit('sessions_read', req);
    sendJson(res, getSessionsJson());
    return;
  }

  if (pathname === '/api/bridge/session-messages') {
    const rawId = url.searchParams.get('id') ?? '';
    const sessionId = rawId.replace(/[^a-zA-Z0-9\-_.:]/g, '');
    if (!sessionId) {
      sendJson(res, { ok: false, error: 'Missing id' }, 400);
      return;
    }
    const sessions = getSessionsJson();
    const match = sessions.find(
      (s) => (s as { sessionId?: string; key?: string }).sessionId === sessionId || (s as { key?: string }).key === sessionId,
    );
    if (!match) {
      sendJson(res, { ok: false, error: 'Not found' }, 404);
      return;
    }
    logAudit('session_messages', req, sessionId);
    sendJson(res, { ok: true, id: sessionId, messages: getSessionMessages(sessionId) });
    return;
  }

  const allowedSessionIds = getAllowedSessionIds();

  if (pathname === '/api/bridge/usage') {
    const now = Date.now();
    if (!usageCache || now - usageCacheTime > 10000) {
      usageCache = buildUsageWindows({ sessDir, allowedSessionIds });
      usageCacheTime = now;
    }
    logAudit('usage_read', req);
    sendJson(res, usageCache);
    return;
  }

  if (pathname === '/api/bridge/costs') {
    const now = Date.now();
    if (!costCache || now - costCacheTime > 60000) {
      costCache = buildCostData({ sessDir, cronFile, allowedSessionIds });
      costCacheTime = now;
    }
    logAudit('costs_read', req);
    sendJson(res, costCache);
    return;
  }

  if (pathname === '/api/bridge/tokens-today') {
    logAudit('tokens_today', req);
    sendJson(res, buildTodayTokens({ sessDir, allowedSessionIds }));
    return;
  }

  if (pathname === '/api/bridge/response-time') {
    logAudit('response_time', req);
    sendJson(res, { avgSeconds: buildAvgResponseTime({ sessDir, allowedSessionIds }) });
    return;
  }

  if (pathname === '/api/bridge/system') {
    logAudit('system_stats', req);
    const stats = buildSystemStats() as ReturnType<typeof buildSystemStats> & {
      diskHistory?: Array<{ t: number; v: number }>;
    };
    if (stats.disk) stats.diskHistory = trackDiskHistory(stats.disk.percent || 0);
    sendJson(res, stats);
    return;
  }

  if (pathname === '/api/bridge/lifetime-stats') {
    const now = Date.now();
    if (!lifetimeStatsCache || now - lifetimeStatsCacheTime > 300000) {
      lifetimeStatsCache = buildLifetimeStats({ sessDir, allowedSessionIds });
      lifetimeStatsCacheTime = now;
    }
    logAudit('lifetime_stats', req);
    sendJson(res, lifetimeStatsCache);
    return;
  }

  if (pathname === '/api/bridge/health-history') {
    logAudit('health_history', req);
    sendJson(res, readHealthHistory(healthHistoryFile));
    return;
  }

  // SSE live feed (stub)
  if (pathname === '/api/bridge/live') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, ts: new Date().toISOString() })}\n\n`);
    const interval = setInterval(() => {
      res.write(`event: ping\ndata: ${Date.now()}\n\n`);
    }, 15000);
    req.on('close', () => clearInterval(interval));
    return;
  }

  // Stub endpoints (to be implemented)
  const stubbed = new Set([
    '/api/bridge/ventureos-agents',
    '/api/bridge/observations',
    '/api/bridge/observations-index',
    '/api/bridge/observation',
    '/api/bridge/crons',
    '/api/bridge/git',
    '/api/bridge/services',
    '/api/bridge/memory',
    '/api/bridge/mission-control',
    '/api/bridge/workflow-patterns',
  ]);

  if (stubbed.has(pathname)) {
    sendJson(res, { ok: false, error: 'Not implemented', path: pathname }, 501);
    return;
  }

  sendJson(res, { ok: false, error: 'Not found', path: pathname }, 404);
});

server.listen(BRIDGE_PORT, () => {
  console.log(`[BRIDGE] Listening on http://127.0.0.1:${BRIDGE_PORT}`);
  console.log(`[BRIDGE] OPENCLAW_DIR: ${OPENCLAW_DIR}`);
  console.log(`[BRIDGE] WORKSPACE_DIR: ${WORKSPACE_DIR}`);
});

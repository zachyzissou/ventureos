/**
 * Logs route handler — Issue #137.
 *
 * Reads log files from the VentureOS runtime/logs directory and the
 * dashboard's own server.log. Supports structured JSONL parsing,
 * full-text search, severity filtering, and tail pagination.
 *
 * Routes:
 *   GET /api/logs/sources          — list available log files
 *   GET /api/logs/entries           — structured log entries (JSON)
 *   GET /api/logs/tail              — raw text tail (plain text compat)
 *   GET /api/logs?service=&lines=   — legacy compat
 */

import fs from 'node:fs';
import path from 'node:path';

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { LogsDeps, LogEntry, LogSourceMeta } from '../types.js';
import { isPathInsideRoot } from '../path-containment.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Allowlisted extensions for log files. */
const LOG_EXTENSIONS = new Set(['.jsonl', '.log', '.txt']);

// ─── Secret Redaction ────────────────────────────────────────────────────────

const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9\-_=.]{8,}/gi,
  /(?:token|key|secret|password|authorization|api[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9\-_=.]{16,}["']?/gi,
  /ghp_[A-Za-z0-9]{36,}/g,
  /gho_[A-Za-z0-9]{36,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /npm_[A-Za-z0-9]{36,}/g,
  /sk-[A-Za-z0-9]{20,}/g,
];

/** Redact known secret/token patterns from log text. */
function redactSecrets(text: string): string {
  let r = text;
  for (const p of SECRET_PATTERNS) {
    p.lastIndex = 0;
    r = r.replace(p, (m) =>
      m.length > 12 ? m.substring(0, 8) + '***REDACTED***' : '***REDACTED***',
    );
  }
  return r;
}

// ─── Line count cache ────────────────────────────────────────────────────────

const _lineCountCache = new Map<string, { mtimeMs: number; count: number }>();

/** Characters that indicate a directory-traversal attempt. */
function isSafeFilename(name: string): boolean {
  return !/[\/\\]/.test(name) && !name.startsWith('.') && name.length > 0 && name.length < 256;
}

/** Infer severity from a raw log line or parsed JSON. */
function inferLevel(line: string, parsed: Record<string, unknown> | null): LogEntry['level'] {
  if (parsed) {
    const lvl = String(parsed.level ?? parsed.severity ?? parsed.logLevel ?? '').toLowerCase();
    if (lvl === 'error' || lvl === 'err' || lvl === 'fatal' || lvl === 'crit') return 'error';
    if (lvl === 'warn' || lvl === 'warning') return 'warn';
    if (lvl === 'debug' || lvl === 'trace') return 'debug';
    if (lvl === 'info') return 'info';

    const event = String(parsed.event ?? '').toLowerCase();
    if (event.includes('error') || event.includes('fail') || event.includes('crash')) return 'error';
    if (event.includes('warn') || event.includes('degrad')) return 'warn';
    if (event.includes('debug') || event.includes('trace')) return 'debug';
  }

  const lower = line.toLowerCase();
  if (
    lower.includes('error') ||
    lower.includes('fatal') ||
    lower.includes('exception') ||
    lower.includes('eaddrinuse') ||
    lower.includes('sigsegv') ||
    lower.includes('sigabrt') ||
    lower.includes('crash')
  ) {
    return 'error';
  }
  if (lower.includes('warn') || lower.includes('deprecated')) return 'warn';
  if (lower.includes('debug') || lower.includes('trace')) return 'debug';
  return 'info';
}

/** Extract a human-readable message from a parsed JSONL entry. */
function summariseJsonEntry(parsed: Record<string, unknown>): string {
  for (const key of ['message', 'msg', 'event', 'reason', 'error', 'description']) {
    if (typeof parsed[key] === 'string' && parsed[key]) {
      return String(parsed[key]);
    }
  }
  const parts: string[] = [];
  for (const [k, v] of Object.entries(parsed)) {
    if (k === 'ts' || k === 'timestamp') continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      parts.push(`${k}=${v}`);
    }
  }
  return parts.slice(0, 5).join(' ') || 'log entry';
}

/** Extract an ISO timestamp from a parsed JSONL entry or raw text. */
function extractTimestamp(parsed: Record<string, unknown> | null, raw: string): string {
  if (parsed) {
    for (const key of ['ts', 'timestamp', 'time', 'date', 'at']) {
      const val = parsed[key];
      if (typeof val === 'string' && val) return val;
      if (typeof val === 'number' && val > 1e9) return new Date(val > 1e12 ? val : val * 1000).toISOString();
    }
  }
  const m = raw.match(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/);
  if (m) return m[0];
  return '';
}

/** Count lines in a file (cached by mtime, skips files >50MB). */
function countLines(filePath: string): number {
  try {
    const stat = fs.statSync(filePath);
    // Skip counting for very large files — estimate instead
    if (stat.size > 50 * 1024 * 1024) {
      return Math.round(stat.size / 200); // ~200 bytes/line estimate
    }
    // Check cache
    const cached = _lineCountCache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.count;

    const BUF_SIZE = 64 * 1024;
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.allocUnsafe(BUF_SIZE);
    let count = 0;
    let bytesRead: number;
    while ((bytesRead = fs.readSync(fd, buf, 0, BUF_SIZE, null)) > 0) {
      for (let i = 0; i < bytesRead; i++) {
        if (buf[i] === 0x0a) count++;
      }
    }
    fs.closeSync(fd);
    _lineCountCache.set(filePath, { mtimeMs: stat.mtimeMs, count });
    return count;
  } catch {
    return 0;
  }
}

/** Read the last N lines of a file efficiently. */
function tailLines(filePath: string, n: number): string[] {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size === 0) return [];

    if (stat.size < 512 * 1024) {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter((l) => l.trim());
      return lines.slice(Math.max(0, lines.length - n));
    }

    const CHUNK = Math.min(stat.size, n * 2048);
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.allocUnsafe(CHUNK);
    const pos = Math.max(0, stat.size - CHUNK);
    fs.readSync(fd, buf, 0, CHUNK, pos);
    fs.closeSync(fd);

    const text = buf.toString('utf8');
    const lines = text.split('\n').filter((l) => l.trim());
    return lines.slice(Math.max(0, lines.length - n));
  } catch {
    return [];
  }
}

// ─── Source Discovery ────────────────────────────────────────────────────────

function discoverSources(logDir: string, ventureosRoot: string): LogSourceMeta[] {
  const sources: LogSourceMeta[] = [];
  const dirs: string[] = [];

  // 1. Provided LOG_DIR
  if (logDir) dirs.push(logDir);

  // 2. Also scan <ventureosRoot>/runtime/logs if different
  if (ventureosRoot) {
    const runtimeLogs = path.join(ventureosRoot, 'runtime', 'logs');
    if (runtimeLogs !== logDir) dirs.push(runtimeLogs);
  }

  // 3. Dashboard server.log
  if (ventureosRoot) {
    const dashServerLog = path.join(ventureosRoot, 'dashboard', 'server.log');
    if (fs.existsSync(dashServerLog)) {
      try {
        const st = fs.statSync(dashServerLog);
        sources.push({
          id: 'dashboard-server',
          name: 'Dashboard Server',
          format: 'text',
          size: st.size,
          modified: st.mtime.toISOString(),
          lines: countLines(dashServerLog),
        });
      } catch {
        // skip
      }
    }
  }

  const seen = new Set<string>();

  for (const dir of dirs) {
    try {
      if (!dir || !fs.existsSync(dir)) continue;
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const ext = path.extname(entry).toLowerCase();
        if (!LOG_EXTENSIONS.has(ext)) continue;

        const full = path.join(dir, entry);
        try {
          const st = fs.statSync(full);
          if (!st.isFile()) continue;

          const id = path.basename(entry, ext);
          if (seen.has(id)) continue;
          seen.add(id);

          const isJsonl = ext === '.jsonl';
          sources.push({
            id,
            name: id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
            format: isJsonl ? 'jsonl' : 'text',
            size: st.size,
            modified: st.mtime.toISOString(),
            lines: countLines(full),
          });
        } catch {
          // skip unreadable
        }
      }
    } catch {
      // skip unreadable dir
    }
  }

  sources.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
  return sources;
}

/** Resolve a source ID to its file path, with path-traversal protection. */
function resolveSourcePath(
  sourceId: string,
  logDir: string,
  ventureosRoot: string,
): string | null {
  if (!isSafeFilename(sourceId)) return null;

  // Special: dashboard-server
  if (sourceId === 'dashboard-server') {
    if (!ventureosRoot) return null;
    const p = path.join(ventureosRoot, 'dashboard', 'server.log');
    return fs.existsSync(p) ? p : null;
  }

  // Search in log directories
  const dirs: string[] = [];
  if (logDir) dirs.push(logDir);
  if (ventureosRoot) dirs.push(path.join(ventureosRoot, 'runtime', 'logs'));

  for (const dir of dirs) {
    if (!dir) continue;
    const resolvedDir = path.resolve(dir);
    for (const ext of ['.jsonl', '.log', '.txt']) {
      const candidate = path.resolve(path.join(dir, sourceId + ext));
      if (!isPathInsideRoot(resolvedDir, candidate)) continue;
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return null;
}

// ─── Entry Parsing ───────────────────────────────────────────────────────────

function parseLines(
  lines: string[],
  sourceId: string,
  opts: { search?: string; level?: string },
): LogEntry[] {
  const entries: LogEntry[] = [];
  const searchLower = opts.search ? opts.search.toLowerCase() : null;
  const levelFilter = opts.level ? opts.level.toLowerCase() : null;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    let parsed: Record<string, unknown> | null = null;
    if (trimmed.startsWith('{')) {
      try {
        parsed = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        // not valid JSON
      }
    }

    const level = inferLevel(trimmed, parsed);
    const ts = extractTimestamp(parsed, trimmed);
    const message = parsed ? summariseJsonEntry(parsed) : trimmed.slice(0, 300);

    if (levelFilter && levelFilter !== 'all' && level !== levelFilter) continue;

    if (searchLower) {
      const haystack = (message + ' ' + trimmed).toLowerCase();
      if (!haystack.includes(searchLower)) continue;
    }

    entries.push({
      ts,
      level,
      source: sourceId,
      message: redactSecrets(message),
      raw: redactSecrets(trimmed),
      fields: parsed,
    });
  }

  return entries;
}

// ─── Route Handler ───────────────────────────────────────────────────────────

export function handleLogs(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: LogsDeps,
): boolean {
  if (!req || !res) return false;
  if (!req.url || !req.url.startsWith('/api/logs')) return false;
  if (req.method && req.method !== 'GET') return false;

  const { LOG_DIR, VENTUREOS_ROOT, sendJson, clampInt } = ctx;

  const urlObj = new URL(req.url, 'http://localhost');
  const pathname = urlObj.pathname;

  // ── GET /api/logs/sources ────────────────────────────────────────────────
  if (pathname === '/api/logs/sources') {
    try {
      const sources = discoverSources(LOG_DIR, VENTUREOS_ROOT);
      sendJson(res, { sources });
    } catch {
      sendJson(res, { error: 'Failed to list log sources', sources: [] }, 500);
    }
    return true;
  }

  // ── GET /api/logs/entries ────────────────────────────────────────────────
  if (pathname === '/api/logs/entries') {
    const sourceId = urlObj.searchParams.get('source') ?? '';
    const limit = clampInt(urlObj.searchParams.get('limit'), 10, 2000, 200);
    const search = urlObj.searchParams.get('search') ?? '';
    const level = urlObj.searchParams.get('level') ?? '';

    if (!sourceId) {
      sendJson(res, { error: 'Missing required parameter: source', entries: [] }, 400);
      return true;
    }

    const filePath = resolveSourcePath(sourceId, LOG_DIR, VENTUREOS_ROOT);
    if (!filePath) {
      sendJson(res, { error: `Log source not found: ${sourceId}`, entries: [] }, 404);
      return true;
    }

    try {
      const readCount = search || level ? limit * 4 : limit;
      const rawLines = tailLines(filePath, readCount);
      const entries = parseLines(rawLines, sourceId, { search, level });

      const sliced = entries.slice(Math.max(0, entries.length - limit));

      sendJson(res, {
        source: sourceId,
        total: sliced.length,
        limit,
        entries: sliced,
      });
    } catch {
      sendJson(res, { error: 'Failed to read log entries', entries: [] }, 500);
    }
    return true;
  }

  // ── GET /api/logs/tail — raw text compat ─────────────────────────────────
  if (pathname === '/api/logs/tail') {
    const sourceId = urlObj.searchParams.get('source') ?? '';
    const lines = clampInt(urlObj.searchParams.get('lines'), 1, 2000, 100);

    if (!sourceId) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing required parameter: source');
      return true;
    }

    const filePath = resolveSourcePath(sourceId, LOG_DIR, VENTUREOS_ROOT);
    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`Log source not found: ${sourceId}`);
      return true;
    }

    try {
      const rawLines = tailLines(filePath, lines);
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(rawLines.join('\n'));
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Failed to read log file');
    }
    return true;
  }

  // ── GET /api/logs/export — downloadable filtered log file ─────────────────
  if (pathname === '/api/logs/export') {
    const sourceId = urlObj.searchParams.get('source') ?? '';
    const limit = clampInt(urlObj.searchParams.get('limit'), 10, 5000, 500);
    const search = urlObj.searchParams.get('search') ?? '';
    const level = urlObj.searchParams.get('level') ?? '';
    const format = urlObj.searchParams.get('format') === 'text' ? 'text' : 'jsonl';

    if (!sourceId) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing required parameter: source');
      return true;
    }

    const filePath = resolveSourcePath(sourceId, LOG_DIR, VENTUREOS_ROOT);
    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`Log source not found: ${sourceId}`);
      return true;
    }

    try {
      const readCount = search || level ? limit * 4 : limit;
      const rawLines = tailLines(filePath, readCount);
      const entries = parseLines(rawLines, sourceId, { search, level });
      const sliced = entries.slice(Math.max(0, entries.length - limit));

      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const levelSuffix = level && level !== 'all' ? `-${level}` : '';
      const ext = format === 'text' ? 'log' : 'jsonl';
      const filename = `logs-${sourceId}${levelSuffix}-${ts}.${ext}`;

      const contentType = format === 'text' ? 'text/plain; charset=utf-8' : 'application/x-ndjson; charset=utf-8';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      });

      if (format === 'text') {
        res.end(sliced.map((e) => {
          const tsStr = e.ts ? `[${e.ts}] ` : '';
          return `${tsStr}[${e.level.toUpperCase()}] ${e.message}`;
        }).join('\n'));
      } else {
        res.end(sliced.map((e) => JSON.stringify(e)).join('\n'));
      }
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Failed to export log entries');
    }
    return true;
  }

  // ── Legacy compat: GET /api/logs?service=...&lines=... ───────────────────
  if (pathname === '/api/logs') {
    const service = urlObj.searchParams.get('service') ?? '';
    const lines = clampInt(urlObj.searchParams.get('lines'), 1, 2000, 100);

    const legacyMap: Record<string, string> = {
      openclaw: 'dashboard-server',
      'agent-dashboard': 'dashboard-server',
      dashboard: 'dashboard',
    };

    const sourceId = legacyMap[service] ?? service;
    const filePath = resolveSourcePath(sourceId, LOG_DIR, VENTUREOS_ROOT);
    if (!filePath) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(`No local logs found for service "${service}". Available sources: ${discoverSources(LOG_DIR, VENTUREOS_ROOT).map((s) => s.id).join(', ')}`);
      return true;
    }

    try {
      const rawLines = tailLines(filePath, lines);
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(rawLines.join('\n'));
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error reading log file');
    }
    return true;
  }

  return false;
}

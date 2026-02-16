/**
 * Audit Log Middleware — JSON Lines access logging
 * Phase 5.1 Security Implementation
 *
 * See: SECURITY_ARCHITECTURE.md §7
 *
 * Logs security-relevant events (auth failures, rate limits, replay access)
 * to ~/clawd/logs/tactical-map-access.log in JSON Lines format.
 *
 * Migrated from server/middleware/audit-log.js (Phase 3 — Issue #76).
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import type { IncomingMessage } from 'node:http';
import type { AuditLogEntry } from '../types.js';

const LOG_DIR: string = path.join(os.homedir(), 'clawd', 'logs');
export const LOG_FILE: string = path.join(LOG_DIR, 'tactical-map-access.log');

// Ensure log directory exists
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch {
  // Directory may already exist
}

// Buffered writes for performance
let _buffer: string[] = [];
let _flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Log an audit event.
 *
 * @param event - Event type (auth_failure, auth_success, rate_limit_hit, etc.)
 * @param req - HTTP request (null for internal events)
 * @param detail - Additional detail fields to include
 */
export function auditLog(
  event: string,
  req: IncomingMessage | null,
  detail: Record<string, string | number | boolean> = {},
): void {
  const entry: AuditLogEntry = {
    ts: new Date().toISOString(),
    event,
    ip: req
      ? ((req.headers['x-forwarded-for'] as string | undefined) ?? req.socket?.remoteAddress ?? 'unknown')
      : 'internal',
    method: req?.method ?? '-',
    path: req?.url ?? '-',
    userAgent: ((req?.headers?.['user-agent'] as string | undefined) ?? '-').substring(0, 200),
    ...detail,
  };

  _buffer.push(JSON.stringify(entry));

  // Flush buffer every 5 seconds or when buffer exceeds 50 entries
  if (!_flushTimer) {
    _flushTimer = setTimeout(flush, 5000);
  }
  if (_buffer.length >= 50) {
    flush();
  }
}

/**
 * Flush the log buffer to disk.
 */
export function flush(): void {
  if (_flushTimer) {
    clearTimeout(_flushTimer);
    _flushTimer = null;
  }
  if (_buffer.length === 0) return;

  const lines: string = _buffer.join('\n') + '\n';
  _buffer = [];

  fs.appendFile(LOG_FILE, lines, (err) => {
    if (err) console.error('[audit] Write failed:', err.message);
  });
}

// Flush on process exit
process.on('exit', flush);
process.on('SIGTERM', () => {
  flush();
  process.exit(0);
});
process.on('SIGINT', () => {
  flush();
  process.exit(0);
});

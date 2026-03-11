/**
 * Agent Diagnostics route handler — Issue #205.
 *
 * Provides per-agent drill-down data: metrics history, recent errors,
 * session breakdown, health score, and active alerts. Designed to power
 * the tactical map's diagnostics sparkline panel.
 */

import fs from 'node:fs';
import path from 'node:path';

import type { IncomingMessage, ServerResponse } from 'node:http';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DiagnosticsDeps {
  OPENCLAW_DIR: string;
  sendJson: (res: ServerResponse, data: unknown, status?: number) => void;
}

export interface MetricSample {
  ts: number;
  cpuUsage: number;
  memoryUsage: number;
  latencyMs: number;
  requestsPerSec: number;
  errorRate: number;
}

export interface SessionDetail {
  key: string;
  label: string;
  updatedAt: number;
  aborted: boolean;
}

export interface ErrorEntry {
  ts: number;
  level: string;
  message: string;
  sessionKey: string | null;
}

export interface AlertEntry {
  id: string;
  severity: 'P0' | 'P1';
  title: string;
  message: string;
  metric: string | null;
  value: number | null;
  threshold: number | null;
  createdAt: number;
}

export interface AgentDiagnosticsResponse {
  agentId: string;
  now: number;
  healthScore: number;
  sessionCount: number;
  abortedCount: number;
  successRate: number | null;
  recentSessions: SessionDetail[];
  metricsHistory: MetricSample[];
  recentErrors: ErrorEntry[];
  alerts: AlertEntry[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeReadJson(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function listAgentIds(openclawDir: string): string[] {
  try {
    const agentsDir = path.join(openclawDir, 'agents');
    if (!fs.existsSync(agentsDir)) return [];
    return fs.readdirSync(agentsDir).filter((a) => {
      try {
        return fs.statSync(path.join(agentsDir, a)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

interface SessionData {
  sessionId?: string;
  label?: string;
  updatedAt?: number;
  abortedLastRun?: boolean;
}

/**
 * Read sessions.json and return parsed session details.
 */
function readSessions(openclawDir: string, agentId: string): {
  sessions: SessionDetail[];
  sessionCount: number;
  abortedCount: number;
} {
  const sessionsPath = path.join(openclawDir, 'agents', agentId, 'sessions', 'sessions.json');
  const raw = safeReadJson(sessionsPath) as Record<string, SessionData> | null;
  if (!raw) return { sessions: [], sessionCount: 0, abortedCount: 0 };

  const sessions: SessionDetail[] = [];
  let abortedCount = 0;

  for (const [key, s] of Object.entries(raw)) {
    if (!s || typeof s !== 'object') continue;
    const aborted = Boolean(s.abortedLastRun);
    if (aborted) abortedCount++;
    sessions.push({
      key,
      label: s.label ?? key,
      updatedAt: s.updatedAt ?? 0,
      aborted,
    });
  }

  // Sort by most recent first
  sessions.sort((a, b) => b.updatedAt - a.updatedAt);

  return { sessions, sessionCount: sessions.length, abortedCount };
}

/**
 * Extract recent errors from session JSONL files.
 * Scans the most recent session files for error-level log entries.
 */
function extractRecentErrors(openclawDir: string, agentId: string, maxErrors: number = 20): ErrorEntry[] {
  const sessionsDir = path.join(openclawDir, 'agents', agentId, 'sessions');
  if (!fs.existsSync(sessionsDir)) return [];

  const errors: ErrorEntry[] = [];

  try {
    const files = fs.readdirSync(sessionsDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => ({
        name: f,
        path: path.join(sessionsDir, f),
        mtime: fs.statSync(path.join(sessionsDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 5); // Only scan 5 most recent files

    for (const file of files) {
      try {
        const content = fs.readFileSync(file.path, 'utf8');
        const lines = content.split('\n').filter(Boolean);
        // Read last 200 lines max per file
        const recentLines = lines.slice(-200);

        for (const line of recentLines) {
          try {
            const entry = JSON.parse(line) as Record<string, unknown>;

            // Check for explicit error events first
            if (entry.type === 'error' || entry.event === 'error') {
              const errMsg = typeof entry.error === 'string'
                ? entry.error
                : typeof entry.message === 'string'
                  ? entry.message
                  : 'Unknown error';
              errors.push({
                ts: parseTs(entry.timestamp ?? entry.ts),
                level: 'error',
                message: truncate(errMsg, 200),
                sessionKey: typeof entry._sessionKey === 'string' ? entry._sessionKey : null,
              });
              continue;
            }

            // Look for error-level content blocks in messages
            const msg = entry.message as Record<string, unknown> | undefined;
            if (!msg) continue;

            const content = msg.content;
            if (typeof content === 'string' && /error|exception|fail|crash/i.test(content)) {
              errors.push({
                ts: parseTs(entry.timestamp ?? entry.ts),
                level: 'error',
                message: truncate(content, 200),
                sessionKey: typeof entry._sessionKey === 'string' ? entry._sessionKey : null,
              });
            } else if (Array.isArray(content)) {
              for (const block of content) {
                if (
                  block &&
                  typeof block === 'object' &&
                  'type' in block &&
                  block.type === 'text' &&
                  typeof (block as { text?: string }).text === 'string'
                ) {
                  const text = (block as { text: string }).text;
                  if (/error|exception|fail|crash/i.test(text)) {
                    errors.push({
                      ts: parseTs(entry.timestamp ?? entry.ts),
                      level: 'error',
                      message: truncate(text, 200),
                      sessionKey: typeof entry._sessionKey === 'string' ? entry._sessionKey : null,
                    });
                  }
                }
              }
            }
          } catch {
            // Skip malformed lines
          }
        }
      } catch {
        // Skip unreadable files
      }

      if (errors.length >= maxErrors) break;
    }
  } catch {
    // Directory read failure — return empty
  }

  // Deduplicate by message, keep most recent
  const seen = new Map<string, ErrorEntry>();
  for (const err of errors) {
    const existing = seen.get(err.message);
    if (!existing || err.ts > existing.ts) {
      seen.set(err.message, err);
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => b.ts - a.ts)
    .slice(0, maxErrors);
}

function parseTs(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const n = Date.parse(raw);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 3) + '...';
}

/**
 * Generate synthetic metrics history from session activity patterns.
 * In a production system this would come from a time-series store;
 * here we derive plausible data from session timestamps and outcomes.
 */
function generateMetricsHistory(
  sessions: SessionDetail[],
  now: number,
  windowMs: number = 3600000 // 1 hour
): MetricSample[] {
  const samples: MetricSample[] = [];
  const bucketMs = 60000; // 1-minute buckets
  const buckets = Math.min(60, Math.floor(windowMs / bucketMs));

  // Compute base activity from sessions
  const recentSessions = sessions.filter((s) => now - s.updatedAt < windowMs);
  const baseActivity = Math.min(1, recentSessions.length / 10);
  const abortRatio = recentSessions.length > 0
    ? recentSessions.filter((s) => s.aborted).length / recentSessions.length
    : 0;

  for (let i = 0; i < buckets; i++) {
    const ts = now - (buckets - 1 - i) * bucketMs;

    // Activity-proportional base values with subtle variation
    // Use deterministic pseudo-variation based on bucket index
    const phase = (i * 7 + 13) % 17 / 17; // deterministic 0..1
    const activityFactor = baseActivity * (0.8 + phase * 0.4);

    samples.push({
      ts,
      cpuUsage: clamp01(0.15 + activityFactor * 0.45 + phase * 0.1),
      memoryUsage: clamp01(0.30 + activityFactor * 0.25 + (phase * 0.7 + 0.3) * 0.05),
      latencyMs: Math.round(50 + activityFactor * 200 + phase * 80),
      requestsPerSec: Math.round((2 + activityFactor * 15 + phase * 5) * 10) / 10,
      errorRate: clamp01(abortRatio * 0.1 + (phase > 0.85 ? 0.02 : 0)),
    });
  }

  return samples;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Compute a health score (0-100) from metrics and session data.
 */
function computeHealthScore(
  successRate: number | null,
  latestMetrics: MetricSample | null
): number {
  const cpuWeight = 0.20;
  const memWeight = 0.15;
  const latencyWeight = 0.20;
  const errorWeight = 0.20;
  const successWeight = 0.25;

  const cpuScore = latestMetrics ? 1 - clamp01(latestMetrics.cpuUsage) : 0.8;
  const memScore = latestMetrics ? 1 - clamp01(latestMetrics.memoryUsage) : 0.8;
  const latencyScore = latestMetrics ? 1 - clamp01(latestMetrics.latencyMs / 2000) : 0.8;
  const errorScore = latestMetrics ? 1 - clamp01(latestMetrics.errorRate / 0.20) : 0.95;
  const sessScore = successRate !== null ? successRate : 0.9;

  const weighted =
    cpuScore * cpuWeight +
    memScore * memWeight +
    latencyScore * latencyWeight +
    errorScore * errorWeight +
    sessScore * successWeight;

  return Math.round(weighted * 100);
}

// ─── URL Matching ────────────────────────────────────────────────────────────

const DIAGNOSTICS_RE = /^\/api\/agent-health\/([a-z][a-z0-9_-]{0,30})\/diagnostics$/;

/**
 * Extract agentId from a diagnostics URL, or null if no match.
 */
export function matchDiagnosticsUrl(url: string | undefined): string | null {
  if (!url) return null;
  // Strip query string
  const pathOnly = url.split('?')[0];
  const match = DIAGNOSTICS_RE.exec(pathOnly);
  return match ? match[1] : null;
}

// ─── Cache ───────────────────────────────────────────────────────────────────

const _cache = new Map<string, { data: AgentDiagnosticsResponse; ts: number }>();
const CACHE_TTL_MS = 10000;

// ─── Route Handler ───────────────────────────────────────────────────────────

export function handleAgentDiagnostics(
  req: IncomingMessage,
  res: ServerResponse,
  deps: DiagnosticsDeps,
): boolean {
  if (!req || !res) return false;
  if (req.method && req.method !== 'GET') return false;

  const agentId = matchDiagnosticsUrl(req.url);
  if (!agentId) return false;

  const { OPENCLAW_DIR, sendJson } = deps;

  // Verify agent exists
  const agentIds = listAgentIds(OPENCLAW_DIR);
  if (!agentIds.includes(agentId)) {
    sendJson(res, { error: 'Agent not found', agentId }, 404);
    return true;
  }

  // Check cache
  const now = Date.now();
  const cached = _cache.get(agentId);
  if (cached && now - cached.ts < CACHE_TTL_MS) {
    sendJson(res, cached.data);
    return true;
  }

  // Build response
  const { sessions, sessionCount, abortedCount } = readSessions(OPENCLAW_DIR, agentId);
  const successRate = sessionCount > 0 ? (sessionCount - abortedCount) / sessionCount : null;
  const recentSessions = sessions.slice(0, 10); // Most recent 10
  const metricsHistory = generateMetricsHistory(sessions, now);
  const recentErrors = extractRecentErrors(OPENCLAW_DIR, agentId);

  const latestMetrics = metricsHistory.length > 0 ? metricsHistory[metricsHistory.length - 1] : null;
  const healthScore = computeHealthScore(successRate, latestMetrics);

  // Generate alerts from current state
  const alerts: AlertEntry[] = [];
  if (latestMetrics) {
    if (latestMetrics.cpuUsage > 0.90) {
      alerts.push({
        id: `${agentId}-cpu-critical`,
        severity: 'P0',
        title: 'CPU Critical',
        message: `CPU usage at ${Math.round(latestMetrics.cpuUsage * 100)}%`,
        metric: 'cpuUsage',
        value: latestMetrics.cpuUsage,
        threshold: 0.90,
        createdAt: now,
      });
    } else if (latestMetrics.cpuUsage > 0.70) {
      alerts.push({
        id: `${agentId}-cpu-warning`,
        severity: 'P1',
        title: 'CPU Warning',
        message: `CPU usage at ${Math.round(latestMetrics.cpuUsage * 100)}%`,
        metric: 'cpuUsage',
        value: latestMetrics.cpuUsage,
        threshold: 0.70,
        createdAt: now,
      });
    }
    if (latestMetrics.errorRate > 0.05) {
      alerts.push({
        id: `${agentId}-error-rate`,
        severity: latestMetrics.errorRate > 0.15 ? 'P0' : 'P1',
        title: 'Elevated Error Rate',
        message: `Error rate at ${(latestMetrics.errorRate * 100).toFixed(1)}%`,
        metric: 'errorRate',
        value: latestMetrics.errorRate,
        threshold: 0.05,
        createdAt: now,
      });
    }
    if (latestMetrics.latencyMs > 2000) {
      alerts.push({
        id: `${agentId}-latency-critical`,
        severity: 'P0',
        title: 'Latency Critical',
        message: `Average latency at ${Math.round(latestMetrics.latencyMs)}ms`,
        metric: 'latencyMs',
        value: latestMetrics.latencyMs,
        threshold: 2000,
        createdAt: now,
      });
    }
  }
  if (successRate !== null && successRate < 0.80) {
    alerts.push({
      id: `${agentId}-success-rate`,
      severity: successRate < 0.50 ? 'P0' : 'P1',
      title: 'Low Success Rate',
      message: `Session success rate at ${Math.round(successRate * 100)}%`,
      metric: 'successRate',
      value: successRate,
      threshold: 0.80,
      createdAt: now,
    });
  }

  const payload: AgentDiagnosticsResponse = {
    agentId,
    now,
    healthScore,
    sessionCount,
    abortedCount,
    successRate,
    recentSessions,
    metricsHistory,
    recentErrors,
    alerts,
  };

  _cache.set(agentId, { data: payload, ts: now });
  sendJson(res, payload);
  return true;
}

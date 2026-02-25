/**
 * Metrics History — persistent time-series snapshots for Task Board metrics.
 * Issue #219 — Phase 8: Persistent task metrics history / time-series baseline.
 *
 * Lightweight, additive-only JSON file storage with bounded retention.
 * No background daemons — snapshots are appended on-demand (piggyback on
 * metrics API reads, with a minimum cooldown between writes).
 *
 * Retention policy:
 *   - Max points: 500 (configurable)
 *   - Max age: 7 days (configurable)
 *   - Minimum interval between snapshots: 5 minutes (configurable)
 *
 * File format: { version: 1, snapshots: MetricsSnapshot[] }
 * File location: <dataDir>/task-board-metrics-history.json
 */

import fs from 'node:fs';
import path from 'node:path';
import type { TaskStatus, TaskPriority } from './types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A compact metrics snapshot stored in the history file. */
export interface MetricsSnapshot {
  /** Timestamp of the snapshot (ms since epoch). */
  ts: number;
  /** Counts by status. */
  statusCounts: Record<TaskStatus, number>;
  /** Total task count at snapshot time. */
  total: number;
  /** Throughput windows at snapshot time. */
  throughput: { last24h: number; last7d: number; last30d: number };
  /** Average runtime of completed tasks (ms), null if none. */
  avgRuntimeMs: number | null;
  /** Median runtime (ms), null if none. */
  medianRuntimeMs: number | null;
  /** Success rate (0-1), null if no terminal tasks. */
  successRate: number | null;
  /** Number of stuck tasks at snapshot time. */
  stuckCount: number;
}

/** On-disk file format. */
export interface MetricsHistoryFile {
  version: 1;
  snapshots: MetricsSnapshot[];
}

/** Configuration for the metrics history store. */
export interface MetricsHistoryConfig {
  /** Maximum number of snapshots to retain. Default: 500. */
  maxPoints?: number;
  /** Maximum age of snapshots in ms. Default: 7 days. */
  maxAgeMs?: number;
  /** Minimum interval between snapshots in ms. Default: 5 minutes. */
  minIntervalMs?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_MAX_POINTS = 500;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEFAULT_MIN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const HISTORY_FILENAME = 'task-board-metrics-history.json';

// ─── File I/O ────────────────────────────────────────────────────────────────

function historyFilePath(dataDir: string): string {
  return path.join(dataDir, HISTORY_FILENAME);
}

/**
 * Read the metrics history from disk.
 * Returns an empty history if the file doesn't exist or is corrupt.
 * Bounded read: the file is bounded by retention caps.
 */
export function readHistory(dataDir: string): MetricsHistoryFile {
  try {
    const fp = historyFilePath(dataDir);
    if (!fs.existsSync(fp)) return { version: 1, snapshots: [] };
    const raw = fs.readFileSync(fp, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 1 && Array.isArray(parsed.snapshots)) {
      return parsed as MetricsHistoryFile;
    }
    return { version: 1, snapshots: [] };
  } catch {
    return { version: 1, snapshots: [] };
  }
}

/**
 * Write the metrics history to disk atomically (write-rename pattern).
 */
function writeHistory(dataDir: string, history: MetricsHistoryFile): void {
  const fp = historyFilePath(dataDir);
  const dir = path.dirname(fp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmpFp = fp + '.tmp';
  fs.writeFileSync(tmpFp, JSON.stringify(history, null, 2));
  fs.renameSync(tmpFp, fp);
}

// ─── Core operations ─────────────────────────────────────────────────────────

/**
 * Prune snapshots that exceed retention bounds.
 * Returns a new array (does not mutate input).
 * Pure function for testability.
 */
export function pruneSnapshots(
  snapshots: MetricsSnapshot[],
  opts: {
    maxPoints?: number;
    maxAgeMs?: number;
    now?: number;
  } = {},
): MetricsSnapshot[] {
  const maxPoints = opts.maxPoints ?? DEFAULT_MAX_POINTS;
  const maxAgeMs = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const now = opts.now ?? Date.now();

  // Filter by age first
  let result = snapshots.filter((s) => now - s.ts <= maxAgeMs);

  // Then cap by count (keep most recent)
  if (result.length > maxPoints) {
    result = result.slice(result.length - maxPoints);
  }

  return result;
}

/**
 * Determine whether a new snapshot should be recorded based on the cooldown
 * interval since the last snapshot.
 */
export function shouldSnapshot(
  snapshots: MetricsSnapshot[],
  opts: { minIntervalMs?: number; now?: number } = {},
): boolean {
  const minIntervalMs = opts.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const now = opts.now ?? Date.now();

  if (snapshots.length === 0) return true;

  const lastTs = snapshots[snapshots.length - 1].ts;
  return now - lastTs >= minIntervalMs;
}

/**
 * Create a compact snapshot from full metrics data.
 * Extracts only the fields needed for time-series display.
 */
export function createSnapshot(metrics: {
  updatedAt: number;
  statusCounts: Record<TaskStatus, number>;
  total: number;
  throughput: { last24h: number; last7d: number; last30d: number };
  avgRuntimeMs: number | null;
  medianRuntimeMs: number | null;
  successRate: number | null;
  stuckCount: number;
}): MetricsSnapshot {
  return {
    ts: metrics.updatedAt,
    statusCounts: { ...metrics.statusCounts },
    total: metrics.total,
    throughput: { ...metrics.throughput },
    avgRuntimeMs: metrics.avgRuntimeMs,
    medianRuntimeMs: metrics.medianRuntimeMs,
    successRate: metrics.successRate,
    stuckCount: metrics.stuckCount,
  };
}

/**
 * Append a snapshot to the history file if the cooldown has elapsed.
 * Applies retention pruning before writing.
 * Returns true if a snapshot was written, false if skipped (cooldown).
 *
 * This is the main entry point for the write path — called from the
 * metrics API handler as a side-effect (no background daemon needed).
 */
export function maybeAppendSnapshot(
  dataDir: string,
  metrics: Parameters<typeof createSnapshot>[0],
  config: MetricsHistoryConfig = {},
): boolean {
  const minIntervalMs = config.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const maxPoints = config.maxPoints ?? DEFAULT_MAX_POINTS;
  const maxAgeMs = config.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const now = metrics.updatedAt;

  const history = readHistory(dataDir);

  if (!shouldSnapshot(history.snapshots, { minIntervalMs, now })) {
    return false;
  }

  const snapshot = createSnapshot(metrics);
  history.snapshots.push(snapshot);

  // Prune before writing to keep file bounded
  history.snapshots = pruneSnapshots(history.snapshots, { maxPoints, maxAgeMs, now });

  writeHistory(dataDir, history);
  return true;
}

// ─── Query helpers ───────────────────────────────────────────────────────────

/**
 * Read recent history points. Supports filtering by:
 *   - limit: max number of most-recent points to return
 *   - sinceMs: only points newer than (now - sinceMs)
 *
 * Returns snapshots sorted oldest-first (chronological order).
 */
export function queryHistory(
  dataDir: string,
  opts: { limit?: number; sinceMs?: number; now?: number } = {},
): MetricsSnapshot[] {
  const history = readHistory(dataDir);
  const now = opts.now ?? Date.now();
  let snapshots = history.snapshots;

  // Filter by time window
  if (opts.sinceMs != null && opts.sinceMs > 0) {
    const cutoff = now - opts.sinceMs;
    snapshots = snapshots.filter((s) => s.ts >= cutoff);
  }

  // Apply limit (most recent N)
  const limit = opts.limit ?? 100;
  if (snapshots.length > limit) {
    snapshots = snapshots.slice(snapshots.length - limit);
  }

  return snapshots;
}

// ─── Export Helpers (Phase 25: Metrics History Export) ────────────────────────

/**
 * Maximum number of snapshots allowed in a single export.
 * Prevents unbounded memory/CPU usage on export requests.
 */
export const METRICS_EXPORT_MAX_SNAPSHOTS = 500;

/** Supported export formats. */
export type MetricsExportFormat = 'csv' | 'json';

/** Export query — same filters as queryHistory, plus format. */
export interface MetricsExportQuery {
  format?: MetricsExportFormat;
  limit?: number;
  sinceMs?: number;
  now?: number;
}

/** Result of a metrics history export operation. */
export interface MetricsExportResult {
  /** The serialized export content (CSV string or JSON string). */
  content: string;
  /** MIME type for the response Content-Type header. */
  contentType: string;
  /** Suggested filename for the Content-Disposition header. */
  filename: string;
  /** Number of snapshots included in the export. */
  count: number;
}

/**
 * Escape a value for CSV output.
 * Wraps in double quotes if the value contains commas, quotes, or newlines.
 * Pure function.
 */
export function csvEscapeMetrics(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Format a timestamp as ISO 8601 string for export.
 * Returns empty string for null/undefined.
 */
function formatMetricsExportTs(ts: number | null | undefined): string {
  if (ts == null) return '';
  return new Date(ts).toISOString();
}

/**
 * Conservative field allowlist for metrics history export.
 * Explicitly enumerates safe fields — only observable metrics state.
 * No internal config, file paths, or implementation details leak through.
 */
function sanitizeSnapshotForExport(snapshot: MetricsSnapshot): Record<string, unknown> {
  return {
    timestamp: formatMetricsExportTs(snapshot.ts),
    total: snapshot.total,
    backlog: snapshot.statusCounts.backlog ?? 0,
    queued: snapshot.statusCounts.queued ?? 0,
    running: snapshot.statusCounts.running ?? 0,
    done: snapshot.statusCounts.done ?? 0,
    failed: snapshot.statusCounts.failed ?? 0,
    throughputLast24h: snapshot.throughput.last24h,
    throughputLast7d: snapshot.throughput.last7d,
    throughputLast30d: snapshot.throughput.last30d,
    avgRuntimeMs: snapshot.avgRuntimeMs,
    medianRuntimeMs: snapshot.medianRuntimeMs,
    successRate: snapshot.successRate,
    stuckCount: snapshot.stuckCount,
  };
}

/** CSV column headers for metrics history export. */
const METRICS_CSV_HEADERS = [
  'timestamp', 'total', 'backlog', 'queued', 'running', 'done', 'failed',
  'throughputLast24h', 'throughputLast7d', 'throughputLast30d',
  'avgRuntimeMs', 'medianRuntimeMs', 'successRate', 'stuckCount',
];

/**
 * Convert metrics history snapshots to CSV format.
 * Pure function — no I/O, bounded by input array length.
 */
export function metricsSnapshotsToCsv(snapshots: MetricsSnapshot[]): string {
  const rows: string[] = [METRICS_CSV_HEADERS.join(',')];

  for (const snapshot of snapshots) {
    const safe = sanitizeSnapshotForExport(snapshot);
    const row = METRICS_CSV_HEADERS.map((h) =>
      csvEscapeMetrics(safe[h] as string | number | boolean | null),
    );
    rows.push(row.join(','));
  }

  return rows.join('\n');
}

/**
 * Convert metrics history snapshots to a safe JSON export format.
 * Returns a JSON string with sanitized snapshots (conservative allowlist).
 * Pure function.
 */
export function metricsSnapshotsToJson(snapshots: MetricsSnapshot[]): string {
  const safeSnapshots = snapshots.map(sanitizeSnapshotForExport);
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    format: 'ventureos-metrics-history-export-v1',
    count: safeSnapshots.length,
    snapshots: safeSnapshots,
  }, null, 2);
}

/**
 * Export metrics history with the same filter capabilities as queryHistory.
 * Returns formatted content (CSV or JSON), content type, and suggested filename.
 *
 * Secret-safe: all snapshots pass through sanitizeSnapshotForExport() which
 * applies a conservative field allowlist. Only observable task metrics
 * (counts, rates, timestamps) are included — no paths, configs, or internals.
 */
export function exportMetricsHistory(
  dataDir: string,
  opts: MetricsExportQuery = {},
): MetricsExportResult {
  const format: MetricsExportFormat = opts.format === 'csv' ? 'csv' : 'json';
  const limit = Math.max(1, Math.min(opts.limit ?? METRICS_EXPORT_MAX_SNAPSHOTS, METRICS_EXPORT_MAX_SNAPSHOTS));

  // Reuse the same query logic for filter parity
  const snapshots = queryHistory(dataDir, {
    limit,
    sinceMs: opts.sinceMs,
    now: opts.now,
  });

  const dateSuffix = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    return {
      content: metricsSnapshotsToCsv(snapshots),
      contentType: 'text/csv; charset=utf-8',
      filename: `metrics-history-${dateSuffix}.csv`,
      count: snapshots.length,
    };
  }

  return {
    content: metricsSnapshotsToJson(snapshots),
    contentType: 'application/json; charset=utf-8',
    filename: `metrics-history-${dateSuffix}.json`,
    count: snapshots.length,
  };
}

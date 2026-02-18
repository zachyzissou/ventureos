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

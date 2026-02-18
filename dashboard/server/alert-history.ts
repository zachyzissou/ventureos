/**
 * Alert History — persistent event log for alert state transitions.
 * Issue #219 — Phase 10: Alert History / Timeline Baseline.
 *
 * Records alert evaluation events as an append-only log with bounded
 * retention. Designed for lightweight timeline display — not a full
 * audit trail. No background daemons; events are appended inline
 * during alert evaluation (piggybacked on metrics reads).
 *
 * Retention policy:
 *   - Max events: 200 (configurable)
 *   - Max age: 48 hours (configurable)
 *   - Minimum interval between persisted events: 60 seconds (configurable)
 *   - Deduplication: consecutive identical severity snapshots are collapsed
 *
 * File format: { version: 1, events: AlertHistoryEvent[] }
 * File location: <dataDir>/task-board-alert-history.json
 */

import fs from 'node:fs';
import path from 'node:path';
import type { AlertSeverity, AlertEvaluation } from './alert-rules.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A single alert history event — a snapshot of alert evaluation state
 * at a point in time. Records severity transitions for timeline rendering.
 */
export interface AlertHistoryEvent {
  /** Timestamp of the event (ms since epoch). */
  ts: number;
  /** Overall severity at this point. */
  overallSeverity: AlertSeverity;
  /** Severity counts at this point. */
  severityCounts: Record<AlertSeverity, number>;
  /** Compact per-rule severity snapshot (rule → severity). */
  ruleSeverities: Record<string, AlertSeverity>;
  /** Human-readable messages for non-ok rules only (compact). */
  activeMessages: string[];
}

/** On-disk file format. */
export interface AlertHistoryFile {
  version: 1;
  events: AlertHistoryEvent[];
}

/** Configuration for the alert history store. */
export interface AlertHistoryConfig {
  /** Maximum number of events to retain. Default: 200. */
  maxEvents?: number;
  /** Maximum age of events in ms. Default: 48 hours. */
  maxAgeMs?: number;
  /** Minimum interval between persisted events in ms. Default: 60 seconds. */
  minIntervalMs?: number;
}

/** Query options for reading alert history. */
export interface AlertHistoryQuery {
  /** Maximum number of events to return. Default: 50, max 200. */
  limit?: number;
  /** Only events newer than (now - sinceMs). */
  sinceMs?: number;
  /** Filter to only events with this minimum severity (warning or critical). */
  minSeverity?: AlertSeverity;
  /** Current time override (for testing). */
  now?: number;
}

/** Timeline summary — compact overview for dashboard display. */
export interface AlertTimelineSummary {
  /** Total events in the query window. */
  totalEvents: number;
  /** Events returned (after limit). */
  returnedEvents: number;
  /** Current overall severity (from most recent event, or 'ok'). */
  currentSeverity: AlertSeverity;
  /** Timestamp of the last state change (severity transition). */
  lastTransitionAt: number | null;
  /** Time spent in each severity level (ms) within the query window. */
  severityDurations: Record<AlertSeverity, number>;
  /** Number of distinct severity transitions in the window. */
  transitionCount: number;
  /** The events themselves. */
  events: AlertHistoryEvent[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const HISTORY_FILENAME = 'task-board-alert-history.json';
const DEFAULT_MAX_EVENTS = 200;
const DEFAULT_MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours
const DEFAULT_MIN_INTERVAL_MS = 60 * 1000; // 60 seconds

// ─── File I/O ────────────────────────────────────────────────────────────────

function historyFilePath(dataDir: string): string {
  return path.join(dataDir, HISTORY_FILENAME);
}

/**
 * Read the alert history from disk.
 * Returns an empty history if the file doesn't exist or is corrupt.
 */
export function readAlertHistory(dataDir: string): AlertHistoryFile {
  try {
    const fp = historyFilePath(dataDir);
    if (!fs.existsSync(fp)) return { version: 1, events: [] };
    const raw = fs.readFileSync(fp, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 1 && Array.isArray(parsed.events)) {
      return parsed as AlertHistoryFile;
    }
    return { version: 1, events: [] };
  } catch {
    return { version: 1, events: [] };
  }
}

/**
 * Write the alert history to disk atomically (write-rename pattern).
 */
function writeAlertHistory(dataDir: string, history: AlertHistoryFile): void {
  const fp = historyFilePath(dataDir);
  const dir = path.dirname(fp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmpFp = fp + '.tmp';
  fs.writeFileSync(tmpFp, JSON.stringify(history, null, 2));
  fs.renameSync(tmpFp, fp);
}

// ─── Core operations ─────────────────────────────────────────────────────────

/**
 * Create an AlertHistoryEvent from an AlertEvaluation.
 * Extracts only the fields needed for timeline display.
 * Pure function.
 */
export function createAlertEvent(
  evaluation: AlertEvaluation,
): AlertHistoryEvent {
  const ruleSeverities: Record<string, AlertSeverity> = {};
  const activeMessages: string[] = [];

  for (const rule of evaluation.rules) {
    if (rule.enabled) {
      ruleSeverities[rule.rule] = rule.severity;
      if (rule.severity !== 'ok') {
        activeMessages.push(rule.message);
      }
    }
  }

  return {
    ts: evaluation.evaluatedAt,
    overallSeverity: evaluation.overallSeverity,
    severityCounts: { ...evaluation.severityCounts },
    ruleSeverities,
    activeMessages,
  };
}

/**
 * Determine whether a new event represents a meaningful state change
 * compared to the last recorded event. Used for deduplication —
 * consecutive identical states are collapsed.
 *
 * A state change is detected when:
 * - Overall severity changed
 * - Any individual rule severity changed
 * - Active messages changed (metric values crossed thresholds)
 *
 * Pure function.
 */
export function isStateChange(
  newEvent: AlertHistoryEvent,
  lastEvent: AlertHistoryEvent | undefined,
): boolean {
  if (!lastEvent) return true;

  // Overall severity changed
  if (newEvent.overallSeverity !== lastEvent.overallSeverity) return true;

  // Check individual rule severities
  const newRules = newEvent.ruleSeverities;
  const lastRules = lastEvent.ruleSeverities;

  const allKeys = new Set([...Object.keys(newRules), ...Object.keys(lastRules)]);
  for (const key of allKeys) {
    if (newRules[key] !== lastRules[key]) return true;
  }

  return false;
}

/**
 * Prune events that exceed retention bounds.
 * Returns a new array (does not mutate input).
 * Pure function.
 */
export function pruneAlertHistory(
  events: AlertHistoryEvent[],
  opts: {
    maxEvents?: number;
    maxAgeMs?: number;
    now?: number;
  } = {},
): AlertHistoryEvent[] {
  const maxEvents = opts.maxEvents ?? DEFAULT_MAX_EVENTS;
  const maxAgeMs = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const now = opts.now ?? Date.now();

  // Filter by age first
  let result = events.filter((e) => now - e.ts <= maxAgeMs);

  // Then cap by count (keep most recent)
  if (result.length > maxEvents) {
    result = result.slice(result.length - maxEvents);
  }

  return result;
}

/**
 * Determine whether a new event should be recorded based on the cooldown
 * interval since the last event.
 * Pure function.
 */
export function shouldRecordEvent(
  events: AlertHistoryEvent[],
  opts: { minIntervalMs?: number; now?: number } = {},
): boolean {
  const minIntervalMs = opts.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const now = opts.now ?? Date.now();

  if (events.length === 0) return true;

  const lastTs = events[events.length - 1].ts;
  return now - lastTs >= minIntervalMs;
}

/**
 * Append an alert evaluation to the history if:
 * 1. The cooldown interval has elapsed, AND
 * 2. The state has meaningfully changed (deduplication), OR
 *    this is a state transition (always recorded regardless of cooldown).
 *
 * Returns true if an event was written, false if skipped.
 *
 * This is the main write entry point — called inline during metrics
 * evaluation. No background daemon needed.
 */
export function maybeAppendAlertEvent(
  dataDir: string,
  evaluation: AlertEvaluation,
  config: AlertHistoryConfig = {},
): boolean {
  const minIntervalMs = config.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const maxEvents = config.maxEvents ?? DEFAULT_MAX_EVENTS;
  const maxAgeMs = config.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const now = evaluation.evaluatedAt;

  const history = readAlertHistory(dataDir);
  const lastEvent = history.events.length > 0
    ? history.events[history.events.length - 1]
    : undefined;

  const newEvent = createAlertEvent(evaluation);
  const stateChanged = isStateChange(newEvent, lastEvent);

  // Always record state transitions immediately.
  // For non-transitions, respect the cooldown interval.
  if (!stateChanged) {
    if (!shouldRecordEvent(history.events, { minIntervalMs, now })) {
      return false;
    }
  }

  history.events.push(newEvent);

  // Prune before writing to keep file bounded
  history.events = pruneAlertHistory(history.events, { maxEvents, maxAgeMs, now });

  writeAlertHistory(dataDir, history);
  return true;
}

// ─── Query helpers ───────────────────────────────────────────────────────────

/** Severity priority for filtering (higher = more severe). */
const SEVERITY_PRIORITY: Record<AlertSeverity, number> = {
  ok: 0,
  warning: 1,
  critical: 2,
};

/**
 * Query alert history and compute a timeline summary.
 * Supports filtering by time window, limit, and minimum severity.
 *
 * Returns events sorted oldest-first (chronological order)
 * with summary statistics for dashboard display.
 */
export function queryAlertTimeline(
  dataDir: string,
  opts: AlertHistoryQuery = {},
): AlertTimelineSummary {
  const history = readAlertHistory(dataDir);
  const now = opts.now ?? Date.now();
  let events = history.events;

  // Filter by time window
  if (opts.sinceMs != null && opts.sinceMs > 0) {
    const cutoff = now - opts.sinceMs;
    events = events.filter((e) => e.ts >= cutoff);
  }

  // Filter by minimum severity
  if (opts.minSeverity && opts.minSeverity !== 'ok') {
    const minPriority = SEVERITY_PRIORITY[opts.minSeverity] ?? 0;
    events = events.filter((e) => SEVERITY_PRIORITY[e.overallSeverity] >= minPriority);
  }

  const totalEvents = events.length;

  // Apply limit (most recent N)
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 200));
  if (events.length > limit) {
    events = events.slice(events.length - limit);
  }

  // Compute summary
  const currentSeverity = events.length > 0
    ? events[events.length - 1].overallSeverity
    : 'ok';

  // Count transitions (consecutive events with different overall severity)
  let transitionCount = 0;
  let lastTransitionAt: number | null = null;
  for (let i = 1; i < events.length; i++) {
    if (events[i].overallSeverity !== events[i - 1].overallSeverity) {
      transitionCount++;
      lastTransitionAt = events[i].ts;
    }
  }

  // If only one event and it's the first, mark it as the last transition
  if (events.length === 1 && lastTransitionAt === null) {
    lastTransitionAt = events[0].ts;
  }

  // Compute time spent in each severity level
  const severityDurations: Record<AlertSeverity, number> = { ok: 0, warning: 0, critical: 0 };
  for (let i = 0; i < events.length; i++) {
    const nextTs = i < events.length - 1 ? events[i + 1].ts : now;
    const duration = nextTs - events[i].ts;
    severityDurations[events[i].overallSeverity] += duration;
  }

  return {
    totalEvents,
    returnedEvents: events.length,
    currentSeverity,
    lastTransitionAt,
    severityDurations,
    transitionCount,
    events,
  };
}

/**
 * Webhook Delivery History — persistent log of webhook delivery attempts.
 * Issue #219 — Phase 13: Webhook Delivery Status/History UI Baseline.
 *
 * Records each webhook delivery attempt (success or failure) as an append-only
 * log with bounded retention. Designed for dashboard display and debugging —
 * not a full audit trail.
 *
 * Key design decisions:
 *   - Append-only JSON file (same pattern as alert-history.ts)
 *   - Bounded retention: max 200 events, max 48h age (configurable)
 *   - No secrets stored — URLs are masked, payloads omitted
 *   - Inline recording: appended during webhook delivery (no background jobs)
 *   - Error summaries are truncated (max 200 chars)
 *
 * File format: { version: 1, events: WebhookDeliveryEvent[] }
 * File location: <dataDir>/task-board-webhook-delivery-history.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { maskUrl } from './alert-webhook.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A single recorded webhook delivery attempt. */
export interface WebhookDeliveryEvent {
  /** Unique event ID (monotonic counter within file). */
  id: number;
  /** Timestamp of the delivery attempt start (ms since epoch). */
  ts: number;
  /** Target ID from webhook config. */
  targetId: string;
  /** Target display name. */
  targetName: string;
  /** Whether delivery ultimately succeeded. */
  success: boolean;
  /** HTTP status code (null if network error). */
  statusCode: number | null;
  /** Total number of attempts (including retries). */
  attempts: number;
  /** Total delivery duration in ms (including retries). */
  durationMs: number;
  /** Error summary, truncated. Null on success. */
  error: string | null;
  /** Masked URL for debugging (protocol + host only). */
  maskedUrl: string;
  /** Alert severity that triggered the delivery. */
  triggerSeverity: string;
  /** Previous severity (the transition source). */
  previousSeverity: string | null;
}

/** On-disk file format. */
export interface WebhookDeliveryHistoryFile {
  version: 1;
  events: WebhookDeliveryEvent[];
  /** Monotonic counter for unique event IDs. */
  nextId: number;
}

/** Configuration for delivery history retention. */
export interface WebhookDeliveryHistoryConfig {
  /** Maximum number of events to retain. Default: 200. */
  maxEvents?: number;
  /** Maximum age of events in ms. Default: 48 hours. */
  maxAgeMs?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_MAX_EVENTS = 200;
const DEFAULT_MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours
const MAX_ERROR_LENGTH = 200;
const HISTORY_FILENAME = 'task-board-webhook-delivery-history.json';

// ─── File I/O ────────────────────────────────────────────────────────────────

function historyFilePath(dataDir: string): string {
  return path.join(dataDir, HISTORY_FILENAME);
}

/**
 * Read delivery history from disk.
 * Returns empty history if file doesn't exist or is corrupt.
 */
export function readDeliveryHistory(dataDir: string): WebhookDeliveryHistoryFile {
  try {
    const fp = historyFilePath(dataDir);
    if (!fs.existsSync(fp)) return { version: 1, events: [], nextId: 1 };
    const raw = fs.readFileSync(fp, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 1 && Array.isArray(parsed.events)) {
      return {
        version: 1,
        events: parsed.events,
        nextId: typeof parsed.nextId === 'number' ? parsed.nextId : parsed.events.length + 1,
      };
    }
    return { version: 1, events: [], nextId: 1 };
  } catch {
    return { version: 1, events: [], nextId: 1 };
  }
}

/**
 * Write delivery history to disk atomically (write-rename pattern).
 */
function writeDeliveryHistory(dataDir: string, history: WebhookDeliveryHistoryFile): void {
  const fp = historyFilePath(dataDir);
  const dir = path.dirname(fp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmpFp = fp + '.tmp';
  fs.writeFileSync(tmpFp, JSON.stringify(history, null, 2));
  fs.renameSync(tmpFp, fp);
}

// ─── Core Operations ─────────────────────────────────────────────────────────

/**
 * Truncate an error string to bounded length.
 * Pure function.
 */
export function truncateError(error: string | null): string | null {
  if (!error) return null;
  if (error.length <= MAX_ERROR_LENGTH) return error;
  return error.slice(0, MAX_ERROR_LENGTH - 3) + '...';
}

/**
 * Prune events that exceed retention bounds.
 * Returns a new array (does not mutate input).
 * Pure function.
 */
export function pruneDeliveryEvents(
  events: WebhookDeliveryEvent[],
  opts: {
    maxEvents?: number;
    maxAgeMs?: number;
    now?: number;
  } = {},
): WebhookDeliveryEvent[] {
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
 * Create a delivery event from a WebhookDeliveryResult.
 * Masks the URL and truncates errors — never stores raw secrets.
 */
export function createDeliveryEvent(
  result: {
    targetId: string;
    targetName: string;
    success: boolean;
    statusCode: number | null;
    attempts: number;
    error: string | null;
    durationMs: number;
  },
  context: {
    url: string;
    triggerSeverity: string;
    previousSeverity: string | null;
    ts?: number;
  },
  nextId: number,
): WebhookDeliveryEvent {
  return {
    id: nextId,
    ts: context.ts ?? Date.now(),
    targetId: result.targetId,
    targetName: result.targetName,
    success: result.success,
    statusCode: result.statusCode,
    attempts: result.attempts,
    durationMs: result.durationMs,
    error: truncateError(result.error),
    maskedUrl: maskUrl(context.url),
    triggerSeverity: context.triggerSeverity,
    previousSeverity: context.previousSeverity,
  };
}

/**
 * Append one or more delivery events to the history file.
 * Applies retention pruning before writing.
 * Returns the number of events recorded.
 *
 * This is the main write entry point — called from the webhook delivery
 * pipeline after each dispatch round completes.
 */
export function appendDeliveryEvents(
  dataDir: string,
  results: Array<{
    targetId: string;
    targetName: string;
    success: boolean;
    statusCode: number | null;
    attempts: number;
    error: string | null;
    durationMs: number;
  }>,
  contexts: Array<{
    url: string;
    triggerSeverity: string;
    previousSeverity: string | null;
    ts?: number;
  }>,
  config: WebhookDeliveryHistoryConfig = {},
): number {
  if (results.length === 0) return 0;

  const maxEvents = config.maxEvents ?? DEFAULT_MAX_EVENTS;
  const maxAgeMs = config.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const now = Date.now();

  const history = readDeliveryHistory(dataDir);
  let nextId = history.nextId;

  for (let i = 0; i < results.length; i++) {
    const ctx = contexts[Math.min(i, contexts.length - 1)];
    const event = createDeliveryEvent(results[i], ctx, nextId++);
    history.events.push(event);
  }

  // Prune before writing
  history.events = pruneDeliveryEvents(history.events, { maxEvents, maxAgeMs, now });
  history.nextId = nextId;

  writeDeliveryHistory(dataDir, history);
  return results.length;
}

// ─── Query Helpers ───────────────────────────────────────────────────────────

/** Query options for delivery history. */
export interface DeliveryHistoryQuery {
  /** Max events to return (default 50, max 200). */
  limit?: number;
  /** Only events within this time window from now (ms). */
  sinceMs?: number;
  /** Filter by target ID. */
  targetId?: string;
  /** Filter by success status: 'success' | 'failure'. */
  status?: 'success' | 'failure';
  /** Current time override (for testing). */
  now?: number;
}

/** Summary statistics for a delivery history query. */
export interface DeliveryHistorySummary {
  total: number;
  succeeded: number;
  failed: number;
  avgDurationMs: number | null;
  /** Distinct target IDs that appear in the results. */
  targetIds: string[];
}

/** Query result shape for the API endpoint. */
export interface DeliveryHistoryResponse {
  events: WebhookDeliveryEvent[];
  count: number;
  summary: DeliveryHistorySummary;
}

/**
 * Query recent delivery events with optional filters.
 * Returns events sorted most-recent-first (reverse chronological).
 */
export function queryDeliveryHistory(
  dataDir: string,
  opts: DeliveryHistoryQuery = {},
): DeliveryHistoryResponse {
  const history = readDeliveryHistory(dataDir);
  const now = opts.now ?? Date.now();
  let events = history.events;

  // Filter by time window
  if (opts.sinceMs != null && opts.sinceMs > 0) {
    const cutoff = now - opts.sinceMs;
    events = events.filter((e) => e.ts >= cutoff);
  }

  // Filter by target ID
  if (opts.targetId) {
    events = events.filter((e) => e.targetId === opts.targetId);
  }

  // Filter by success/failure
  if (opts.status === 'success') {
    events = events.filter((e) => e.success);
  } else if (opts.status === 'failure') {
    events = events.filter((e) => !e.success);
  }

  // Apply limit (most recent N) — events are stored chronologically
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 200));
  if (events.length > limit) {
    events = events.slice(events.length - limit);
  }

  // Reverse to most-recent-first for display
  events = [...events].reverse();

  // Compute summary
  const succeeded = events.filter((e) => e.success).length;
  const failed = events.length - succeeded;
  const durations = events.map((e) => e.durationMs);
  const avgDurationMs = durations.length > 0
    ? Math.round(durations.reduce((s, v) => s + v, 0) / durations.length)
    : null;
  const targetIds = [...new Set(events.map((e) => e.targetId))];

  return {
    events,
    count: events.length,
    summary: {
      total: events.length,
      succeeded,
      failed,
      avgDurationMs,
      targetIds,
    },
  };
}

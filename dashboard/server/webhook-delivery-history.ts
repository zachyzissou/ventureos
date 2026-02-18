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

/**
 * Per-attempt detail within a webhook delivery.
 * Records the outcome of each individual HTTP request in the retry loop.
 * Issue #219 — Phase 16: Retry Queue Visualization.
 */
export interface WebhookDeliveryAttemptDetail {
  /** 1-indexed attempt number. */
  attempt: number;
  /** Timestamp when this attempt started (ms since epoch). */
  ts: number;
  /** HTTP status code returned (null if network error/timeout). */
  statusCode: number | null;
  /** Error message for this attempt (null on success). */
  error: string | null;
  /** Duration of this individual attempt in ms. */
  durationMs: number;
  /** Delay before the next retry in ms (null if last attempt or success). */
  nextRetryDelayMs: number | null;
}

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
  /**
   * Per-attempt breakdown (Phase 16). Present when attempts > 0.
   * Bounded: max entries = maxRetries (≤ 5).
   */
  attemptDetails?: WebhookDeliveryAttemptDetail[];
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
    attemptDetails?: WebhookDeliveryAttemptDetail[];
  },
  context: {
    url: string;
    triggerSeverity: string;
    previousSeverity: string | null;
    ts?: number;
  },
  nextId: number,
): WebhookDeliveryEvent {
  const event: WebhookDeliveryEvent = {
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

  // Attach per-attempt breakdown if available (Phase 16).
  // Truncate errors within each attempt detail for bounded storage.
  if (result.attemptDetails && result.attemptDetails.length > 0) {
    event.attemptDetails = result.attemptDetails.map((ad) => ({
      ...ad,
      error: truncateError(ad.error),
    }));
  }

  return event;
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
    attemptDetails?: WebhookDeliveryAttemptDetail[];
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

// ─── Retry Activity Query (Phase 16) ────────────────────────────────────────

/** Query options for retry activity view. */
export interface RetryActivityQuery {
  /** Max events to return (default 50, max 200). */
  limit?: number;
  /** Only events within this time window from now (ms). */
  sinceMs?: number;
  /** Filter by target ID. */
  targetId?: string;
  /** Current time override (for testing). */
  now?: number;
}

/** Per-target retry summary. */
export interface RetryTargetSummary {
  targetId: string;
  targetName: string;
  totalDeliveries: number;
  retriedDeliveries: number;
  totalAttempts: number;
  avgAttemptsPerDelivery: number | null;
  lastRetryTs: number | null;
}

/** Retry activity response shape. */
export interface RetryActivityResponse {
  /** Events that involved retries (attempts > 1), most-recent-first. */
  events: WebhookDeliveryEvent[];
  count: number;
  /** Per-target retry summary. */
  targetSummaries: RetryTargetSummary[];
  /** Overall retry statistics. */
  summary: {
    totalDeliveries: number;
    retriedDeliveries: number;
    retryRate: number | null;
    totalAttempts: number;
    avgAttemptsPerRetry: number | null;
    retriedSuccessCount: number;
    retriedFailureCount: number;
  };
}

/**
 * Query retry activity — deliveries that required multiple attempts.
 * Filters to events where attempts > 1 (i.e., at least one retry was made).
 * Returns per-attempt breakdown when available.
 *
 * This provides the "retry queue" approximation: since retries happen inline
 * (no explicit queue), we surface recent retry activity as a bounded view
 * of the system's retry behavior.
 */
export function queryRetryActivity(
  dataDir: string,
  opts: RetryActivityQuery = {},
): RetryActivityResponse {
  const history = readDeliveryHistory(dataDir);
  const now = opts.now ?? Date.now();
  let allEvents = history.events;

  // Filter by time window
  if (opts.sinceMs != null && opts.sinceMs > 0) {
    const cutoff = now - opts.sinceMs;
    allEvents = allEvents.filter((e) => e.ts >= cutoff);
  }

  // Filter by target ID
  if (opts.targetId) {
    allEvents = allEvents.filter((e) => e.targetId === opts.targetId);
  }

  // Compute overall stats before filtering to retries-only
  const totalDeliveries = allEvents.length;
  const totalAttempts = allEvents.reduce((sum, e) => sum + e.attempts, 0);

  // Filter to events with retries (attempts > 1)
  let retryEvents = allEvents.filter((e) => e.attempts > 1);

  // Apply limit (most recent N)
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 200));
  if (retryEvents.length > limit) {
    retryEvents = retryEvents.slice(retryEvents.length - limit);
  }

  // Reverse to most-recent-first
  retryEvents = [...retryEvents].reverse();

  // Per-target summaries (computed from all events, not just retried ones)
  const targetMap = new Map<string, RetryTargetSummary>();
  for (const ev of allEvents) {
    let ts = targetMap.get(ev.targetId);
    if (!ts) {
      ts = {
        targetId: ev.targetId,
        targetName: ev.targetName,
        totalDeliveries: 0,
        retriedDeliveries: 0,
        totalAttempts: 0,
        avgAttemptsPerDelivery: null,
        lastRetryTs: null,
      };
      targetMap.set(ev.targetId, ts);
    }
    ts.totalDeliveries++;
    ts.totalAttempts += ev.attempts;
    if (ev.attempts > 1) {
      ts.retriedDeliveries++;
      if (ts.lastRetryTs === null || ev.ts > ts.lastRetryTs) {
        ts.lastRetryTs = ev.ts;
      }
    }
    // Update name from most recent event
    ts.targetName = ev.targetName;
  }

  const targetSummaries: RetryTargetSummary[] = [];
  for (const ts of targetMap.values()) {
    ts.avgAttemptsPerDelivery = ts.totalDeliveries > 0
      ? Math.round((ts.totalAttempts / ts.totalDeliveries) * 100) / 100
      : null;
    targetSummaries.push(ts);
  }
  // Sort by retried count descending
  targetSummaries.sort((a, b) => b.retriedDeliveries - a.retriedDeliveries);

  // Overall summary
  const retriedDeliveries = allEvents.filter((e) => e.attempts > 1).length;
  const retriedEvents = allEvents.filter((e) => e.attempts > 1);
  const retriedSuccessCount = retriedEvents.filter((e) => e.success).length;
  const retriedFailureCount = retriedEvents.length - retriedSuccessCount;
  const retriedTotalAttempts = retriedEvents.reduce((sum, e) => sum + e.attempts, 0);

  return {
    events: retryEvents,
    count: retryEvents.length,
    targetSummaries,
    summary: {
      totalDeliveries,
      retriedDeliveries,
      retryRate: totalDeliveries > 0
        ? Math.round((retriedDeliveries / totalDeliveries) * 10000) / 10000
        : null,
      totalAttempts,
      avgAttemptsPerRetry: retriedDeliveries > 0
        ? Math.round((retriedTotalAttempts / retriedDeliveries) * 100) / 100
        : null,
      retriedSuccessCount,
      retriedFailureCount,
    },
  };
}

// ─── Export Helpers (Phase 17: Delivery History Export) ───────────────────────

/**
 * Maximum number of events allowed in a single export.
 * Prevents unbounded memory/CPU usage on export requests.
 */
export const EXPORT_MAX_EVENTS = 200;

/** Supported export formats. */
export type ExportFormat = 'csv' | 'json';

/** Export query — same filters as DeliveryHistoryQuery, plus format. */
export interface DeliveryExportQuery {
  format?: ExportFormat;
  limit?: number;
  sinceMs?: number;
  targetId?: string;
  status?: 'success' | 'failure';
  now?: number;
}

/** Export query for retries — same filters as RetryActivityQuery, plus format. */
export interface RetryExportQuery {
  format?: ExportFormat;
  limit?: number;
  sinceMs?: number;
  targetId?: string;
  now?: number;
}

/** Result of an export operation. */
export interface ExportResult {
  /** The serialized export content (CSV string or JSON string). */
  content: string;
  /** MIME type for the response Content-Type header. */
  contentType: string;
  /** Suggested filename for the Content-Disposition header. */
  filename: string;
  /** Number of events included in the export. */
  count: number;
}

/**
 * Escape a value for CSV output.
 * Wraps in double quotes if the value contains commas, quotes, or newlines.
 * Pure function.
 */
export function csvEscape(value: string | number | boolean | null | undefined): string {
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
function formatExportTs(ts: number | null | undefined): string {
  if (ts == null) return '';
  return new Date(ts).toISOString();
}

/**
 * Sanitize an event for export: strips any fields that could leak secrets.
 * Returns a plain object safe for serialization.
 * The maskedUrl is already safe (set during recording), but we double-check
 * that no `url` or `secret` field leaks through.
 */
function sanitizeEventForExport(event: WebhookDeliveryEvent): Record<string, unknown> {
  return {
    id: event.id,
    timestamp: formatExportTs(event.ts),
    targetId: event.targetId,
    targetName: event.targetName,
    success: event.success,
    statusCode: event.statusCode,
    attempts: event.attempts,
    durationMs: event.durationMs,
    error: event.error,
    maskedUrl: event.maskedUrl,
    triggerSeverity: event.triggerSeverity,
    previousSeverity: event.previousSeverity,
    // Explicitly omit: url, secret, payload, headers
  };
}

/** CSV column headers for delivery export. */
const DELIVERY_CSV_HEADERS = [
  'id', 'timestamp', 'targetId', 'targetName', 'success',
  'statusCode', 'attempts', 'durationMs', 'error',
  'maskedUrl', 'triggerSeverity', 'previousSeverity',
];

/**
 * Convert delivery events to CSV format.
 * Pure function — no I/O, bounded by input array length.
 */
export function deliveryEventsToCsv(events: WebhookDeliveryEvent[]): string {
  const rows: string[] = [DELIVERY_CSV_HEADERS.join(',')];

  for (const event of events) {
    const safe = sanitizeEventForExport(event);
    const row = DELIVERY_CSV_HEADERS.map((h) => csvEscape(safe[h] as string | number | boolean | null));
    rows.push(row.join(','));
  }

  return rows.join('\n');
}

/**
 * Convert delivery events to a safe JSON export format.
 * Returns a JSON string with sanitized events (no secrets).
 * Pure function.
 */
export function deliveryEventsToJson(events: WebhookDeliveryEvent[]): string {
  const safeEvents = events.map(sanitizeEventForExport);
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    format: 'ventureos-webhook-delivery-export-v1',
    count: safeEvents.length,
    events: safeEvents,
  }, null, 2);
}

/**
 * Export delivery history with the same filter capabilities as queryDeliveryHistory.
 * Returns formatted content (CSV or JSON), content type, and suggested filename.
 *
 * Secret-safe: all events pass through sanitizeEventForExport() which strips
 * any non-masked fields. URLs are pre-masked at recording time.
 */
export function exportDeliveryHistory(
  dataDir: string,
  opts: DeliveryExportQuery = {},
): ExportResult {
  const format: ExportFormat = opts.format === 'csv' ? 'csv' : 'json';
  const limit = Math.max(1, Math.min(opts.limit ?? EXPORT_MAX_EVENTS, EXPORT_MAX_EVENTS));

  // Reuse the same query logic for filter parity
  const queryResult = queryDeliveryHistory(dataDir, {
    limit,
    sinceMs: opts.sinceMs,
    targetId: opts.targetId,
    status: opts.status,
    now: opts.now,
  });

  const events = queryResult.events;
  const dateSuffix = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    return {
      content: deliveryEventsToCsv(events),
      contentType: 'text/csv; charset=utf-8',
      filename: `webhook-deliveries-${dateSuffix}.csv`,
      count: events.length,
    };
  }

  return {
    content: deliveryEventsToJson(events),
    contentType: 'application/json; charset=utf-8',
    filename: `webhook-deliveries-${dateSuffix}.json`,
    count: events.length,
  };
}

/** CSV column headers for retry export (includes attempt count emphasis). */
const RETRY_CSV_HEADERS = [
  'id', 'timestamp', 'targetId', 'targetName', 'success',
  'statusCode', 'attempts', 'durationMs', 'error',
  'maskedUrl', 'triggerSeverity', 'previousSeverity',
];

/**
 * Export retry activity with the same filter capabilities as queryRetryActivity.
 * Returns formatted content (CSV or JSON), content type, and suggested filename.
 *
 * Secret-safe: same sanitization pipeline as delivery export.
 */
export function exportRetryActivity(
  dataDir: string,
  opts: RetryExportQuery = {},
): ExportResult {
  const format: ExportFormat = opts.format === 'csv' ? 'csv' : 'json';
  const limit = Math.max(1, Math.min(opts.limit ?? EXPORT_MAX_EVENTS, EXPORT_MAX_EVENTS));

  const queryResult = queryRetryActivity(dataDir, {
    limit,
    sinceMs: opts.sinceMs,
    targetId: opts.targetId,
    now: opts.now,
  });

  const events = queryResult.events;
  const dateSuffix = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    const rows: string[] = [RETRY_CSV_HEADERS.join(',')];
    for (const event of events) {
      const safe = sanitizeEventForExport(event);
      const row = RETRY_CSV_HEADERS.map((h) => csvEscape(safe[h] as string | number | boolean | null));
      rows.push(row.join(','));
    }
    return {
      content: rows.join('\n'),
      contentType: 'text/csv; charset=utf-8',
      filename: `webhook-retries-${dateSuffix}.csv`,
      count: events.length,
    };
  }

  const safeEvents = events.map(sanitizeEventForExport);
  return {
    content: JSON.stringify({
      exportedAt: new Date().toISOString(),
      format: 'ventureos-webhook-retry-export-v1',
      count: safeEvents.length,
      summary: queryResult.summary,
      events: safeEvents,
    }, null, 2),
    contentType: 'application/json; charset=utf-8',
    filename: `webhook-retries-${dateSuffix}.json`,
    count: events.length,
  };
}

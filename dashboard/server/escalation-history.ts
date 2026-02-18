/**
 * Escalation History — persistent audit trail for escalation events.
 * Issue #219 — Phase 22: Escalation History / Audit Trail.
 *
 * Records each escalation event (tier transitions + notifications sent)
 * as an append-only log with bounded retention. Designed for dashboard
 * display and operational debugging — provides a persistent record of
 * escalation activity that survives server restarts (unlike the in-memory
 * escalation state).
 *
 * Key design decisions:
 *   - Append-only JSON file (same pattern as alert-history.ts, webhook-delivery-history.ts)
 *   - Bounded retention: max 200 events, max 48h age (configurable)
 *   - No secrets stored — webhook URLs are masked, payloads omitted
 *   - Inline recording: appended during escalation dispatch (no background jobs)
 *   - Error summaries are truncated (max 200 chars)
 *   - Safe redaction: target URLs are pre-masked, no raw secrets exposed
 *
 * File format: { version: 1, events: EscalationHistoryEvent[], nextId: number }
 * File location: <dataDir>/task-board-escalation-history.json
 */

import fs from 'node:fs';
import path from 'node:path';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Event type — distinguishes between different escalation event categories.
 * - 'tier_triggered': A new escalation tier was reached for the first time.
 * - 'tier_renotified': A previously-triggered tier re-fired after cooldown.
 * - 'notification_sent': A webhook notification was dispatched for an escalation.
 * - 'escalation_reset': The escalation state was reset (severity dropped to OK).
 */
export type EscalationEventType =
  | 'tier_triggered'
  | 'tier_renotified'
  | 'notification_sent'
  | 'escalation_reset';

/**
 * Delivery outcome for a single target within an escalation notification.
 * Secret-safe: URL is pre-masked, no payload/headers stored.
 */
export interface EscalationDeliveryOutcome {
  /** Webhook target ID. */
  targetId: string;
  /** Webhook target display name. */
  targetName: string;
  /** Whether delivery succeeded. */
  success: boolean;
  /** HTTP status code (null if network error). */
  statusCode: number | null;
  /** Number of delivery attempts. */
  attempts: number;
  /** Delivery duration in ms. */
  durationMs: number;
  /** Error summary, truncated (null on success). */
  error: string | null;
}

/**
 * A single escalation history event — records a tier transition,
 * notification dispatch, or state reset.
 */
export interface EscalationHistoryEvent {
  /** Unique event ID (monotonic counter within file). */
  id: number;
  /** Timestamp of the event (ms since epoch). */
  ts: number;
  /** Event type classification. */
  eventType: EscalationEventType;
  /** Tier index that triggered (0-based), null for resets. */
  tierIndex: number | null;
  /** Tier label (from config), null if no label or reset event. */
  tierLabel: string | null;
  /** The severity that qualified for escalation. */
  qualifyingSeverity: string;
  /** How long the qualifying state had persisted (ms) when this event occurred. */
  qualifyingDurationMs: number;
  /** Human-readable reason from the escalation decision engine. */
  reason: string;
  /** Per-target delivery outcomes (for notification events), empty for resets. */
  deliveries: EscalationDeliveryOutcome[];
  /** Number of successful deliveries. */
  deliverySuccessCount: number;
  /** Number of failed deliveries. */
  deliveryFailureCount: number;
}

/** On-disk file format. */
export interface EscalationHistoryFile {
  version: 1;
  events: EscalationHistoryEvent[];
  /** Monotonic counter for unique event IDs. */
  nextId: number;
}

/** Configuration for escalation history retention. */
export interface EscalationHistoryConfig {
  /** Maximum number of events to retain. Default: 200. */
  maxEvents?: number;
  /** Maximum age of events in ms. Default: 48 hours. */
  maxAgeMs?: number;
}

/** Query options for reading escalation history. */
export interface EscalationHistoryQuery {
  /** Maximum number of events to return (default 50, max 200). */
  limit?: number;
  /** Only events within this time window from now (ms). */
  sinceMs?: number;
  /** Filter by event type. */
  eventType?: EscalationEventType;
  /** Filter by tier index. */
  tierIndex?: number;
  /** Filter by delivery status: 'success' = at least one successful, 'failure' = any failures. */
  deliveryStatus?: 'success' | 'failure';
  /** Current time override (for testing). */
  now?: number;
}

/** Summary statistics for an escalation history query. */
export interface EscalationHistorySummary {
  /** Total events matching filters (before limit). */
  totalEvents: number;
  /** Events returned (after limit). */
  returnedEvents: number;
  /** Count by event type. */
  eventTypeCounts: Record<EscalationEventType, number>;
  /** Total notifications sent (across all events). */
  totalNotificationsSent: number;
  /** Total notification successes. */
  totalNotificationSuccesses: number;
  /** Total notification failures. */
  totalNotificationFailures: number;
  /** Distinct tier indices that appear in the results. */
  tierIndices: number[];
  /** Timestamp of the most recent event (null if no events). */
  latestEventTs: number | null;
  /** Timestamp of the oldest event in the results (null if no events). */
  oldestEventTs: number | null;
}

/** Query result shape for the API endpoint. */
export interface EscalationHistoryResponse {
  events: EscalationHistoryEvent[];
  count: number;
  summary: EscalationHistorySummary;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_MAX_EVENTS = 200;
const DEFAULT_MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours
const MAX_ERROR_LENGTH = 200;
const HISTORY_FILENAME = 'task-board-escalation-history.json';

// ─── File I/O ────────────────────────────────────────────────────────────────

function historyFilePath(dataDir: string): string {
  return path.join(dataDir, HISTORY_FILENAME);
}

/**
 * Read escalation history from disk.
 * Returns empty history if file doesn't exist or is corrupt.
 */
export function readEscalationHistory(dataDir: string): EscalationHistoryFile {
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
 * Write escalation history to disk atomically (write-rename pattern).
 */
function writeEscalationHistory(dataDir: string, history: EscalationHistoryFile): void {
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
export function pruneEscalationHistory(
  events: EscalationHistoryEvent[],
  opts: {
    maxEvents?: number;
    maxAgeMs?: number;
    now?: number;
  } = {},
): EscalationHistoryEvent[] {
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
 * Append a tier-triggered or tier-renotified escalation event to history.
 * Called from maybeEscalate() after successful dispatch.
 *
 * @param dataDir - Data directory for persistence.
 * @param event - Partial event data (id and ts will be filled in).
 * @param config - Retention configuration.
 * @returns The recorded event ID, or null if write failed.
 */
export function appendEscalationEvent(
  dataDir: string,
  event: Omit<EscalationHistoryEvent, 'id' | 'ts'> & { ts?: number },
  config: EscalationHistoryConfig = {},
): number | null {
  try {
    const maxEvents = config.maxEvents ?? DEFAULT_MAX_EVENTS;
    const maxAgeMs = config.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    const now = event.ts ?? Date.now();

    const history = readEscalationHistory(dataDir);
    const id = history.nextId;

    const fullEvent: EscalationHistoryEvent = {
      id,
      ts: now,
      eventType: event.eventType,
      tierIndex: event.tierIndex,
      tierLabel: event.tierLabel,
      qualifyingSeverity: event.qualifyingSeverity,
      qualifyingDurationMs: event.qualifyingDurationMs,
      reason: event.reason,
      deliveries: event.deliveries.map((d) => ({
        ...d,
        error: truncateError(d.error),
      })),
      deliverySuccessCount: event.deliverySuccessCount,
      deliveryFailureCount: event.deliveryFailureCount,
    };

    history.events.push(fullEvent);
    history.events = pruneEscalationHistory(history.events, { maxEvents, maxAgeMs, now });
    history.nextId = id + 1;

    writeEscalationHistory(dataDir, history);
    return id;
  } catch {
    return null;
  }
}

/**
 * Record an escalation reset event (severity dropped below threshold).
 * Lightweight event with no delivery data.
 */
export function appendEscalationReset(
  dataDir: string,
  opts: {
    qualifyingSeverity: string;
    qualifyingDurationMs: number;
    ts?: number;
  },
  config: EscalationHistoryConfig = {},
): number | null {
  return appendEscalationEvent(dataDir, {
    ts: opts.ts,
    eventType: 'escalation_reset',
    tierIndex: null,
    tierLabel: null,
    qualifyingSeverity: opts.qualifyingSeverity,
    qualifyingDurationMs: opts.qualifyingDurationMs,
    reason: 'severity dropped below threshold — escalation reset',
    deliveries: [],
    deliverySuccessCount: 0,
    deliveryFailureCount: 0,
  }, config);
}

// ─── Query Helpers ───────────────────────────────────────────────────────────

/**
 * Query escalation history with optional filters.
 * Returns events sorted most-recent-first (reverse chronological)
 * with summary statistics for dashboard display.
 */
export function queryEscalationHistory(
  dataDir: string,
  opts: EscalationHistoryQuery = {},
): EscalationHistoryResponse {
  const history = readEscalationHistory(dataDir);
  const now = opts.now ?? Date.now();
  let events = history.events;

  // Filter by time window
  if (opts.sinceMs != null && opts.sinceMs > 0) {
    const cutoff = now - opts.sinceMs;
    events = events.filter((e) => e.ts >= cutoff);
  }

  // Filter by event type
  if (opts.eventType) {
    events = events.filter((e) => e.eventType === opts.eventType);
  }

  // Filter by tier index
  if (opts.tierIndex != null) {
    events = events.filter((e) => e.tierIndex === opts.tierIndex);
  }

  // Filter by delivery status
  if (opts.deliveryStatus === 'success') {
    events = events.filter((e) => e.deliverySuccessCount > 0);
  } else if (opts.deliveryStatus === 'failure') {
    events = events.filter((e) => e.deliveryFailureCount > 0);
  }

  const totalEvents = events.length;

  // Compute summary before applying limit
  const eventTypeCounts: Record<EscalationEventType, number> = {
    tier_triggered: 0,
    tier_renotified: 0,
    notification_sent: 0,
    escalation_reset: 0,
  };
  let totalNotificationsSent = 0;
  let totalNotificationSuccesses = 0;
  let totalNotificationFailures = 0;
  const tierIndexSet = new Set<number>();

  for (const e of events) {
    eventTypeCounts[e.eventType] = (eventTypeCounts[e.eventType] ?? 0) + 1;
    totalNotificationsSent += e.deliveries.length;
    totalNotificationSuccesses += e.deliverySuccessCount;
    totalNotificationFailures += e.deliveryFailureCount;
    if (e.tierIndex != null) tierIndexSet.add(e.tierIndex);
  }

  // Apply limit (most recent N) — events are stored chronologically
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 200));
  if (events.length > limit) {
    events = events.slice(events.length - limit);
  }

  // Reverse to most-recent-first for display
  events = [...events].reverse();

  const latestEventTs = events.length > 0 ? events[0].ts : null;
  const oldestEventTs = events.length > 0 ? events[events.length - 1].ts : null;

  return {
    events,
    count: events.length,
    summary: {
      totalEvents,
      returnedEvents: events.length,
      eventTypeCounts,
      totalNotificationsSent,
      totalNotificationSuccesses,
      totalNotificationFailures,
      tierIndices: [...tierIndexSet].sort((a, b) => a - b),
      latestEventTs,
      oldestEventTs,
    },
  };
}

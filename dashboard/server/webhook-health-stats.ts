/**
 * Webhook Health Stats — per-target health aggregation from delivery history.
 * Issue #219 — Phase 15: Webhook Health/Per-Target Statistics Dashboard.
 *
 * Computes per-target health metrics by aggregating from the existing
 * webhook delivery history (append-only log). No new persistence layer —
 * all stats are derived on-read from the bounded history file.
 *
 * Key design decisions:
 *   - Pure read-only aggregation over existing delivery events
 *   - No schema migrations — uses WebhookDeliveryEvent[] as input
 *   - Bounded query window (default 24h, max 48h to match history retention)
 *   - Single-pass aggregation for O(n) performance
 *   - Results include per-target breakdown + overall summary
 *
 * Stats per target:
 *   - successCount / failureCount / totalCount
 *   - successRate (0–1, null if no deliveries)
 *   - avgLatencyMs (null if no deliveries)
 *   - lastSuccessTs / lastFailureTs (null if none)
 *   - lastStatusCode (most recent HTTP status, null if none)
 */

import { readDeliveryHistory } from './webhook-delivery-history.js';
import type { WebhookDeliveryEvent } from './webhook-delivery-history.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Health stats for a single webhook target. */
export interface WebhookTargetHealthStats {
  /** Target ID. */
  targetId: string;
  /** Target display name (from most recent event). */
  targetName: string;
  /** Number of successful deliveries in the window. */
  successCount: number;
  /** Number of failed deliveries in the window. */
  failureCount: number;
  /** Total delivery attempts in the window. */
  totalCount: number;
  /** Success rate (0–1). Null if no deliveries. */
  successRate: number | null;
  /** Average delivery latency in ms. Null if no deliveries. */
  avgLatencyMs: number | null;
  /** Timestamp of last successful delivery. Null if none. */
  lastSuccessTs: number | null;
  /** Timestamp of last failed delivery. Null if none. */
  lastFailureTs: number | null;
  /** Most recent HTTP status code. Null if none. */
  lastStatusCode: number | null;
  /** Masked URL from most recent event. */
  maskedUrl: string | null;
  /** Health status derived from success rate thresholds. */
  healthStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
}

/** Overall webhook health summary across all targets. */
export interface WebhookHealthSummary {
  /** Total deliveries across all targets in the window. */
  totalDeliveries: number;
  /** Total successes. */
  totalSuccesses: number;
  /** Total failures. */
  totalFailures: number;
  /** Overall success rate across all targets. Null if no deliveries. */
  overallSuccessRate: number | null;
  /** Overall average latency. Null if no deliveries. */
  overallAvgLatencyMs: number | null;
  /** Number of targets with health data. */
  targetCount: number;
  /** Number of healthy targets. */
  healthyCount: number;
  /** Number of degraded targets. */
  degradedCount: number;
  /** Number of unhealthy targets. */
  unhealthyCount: number;
}

/** Full health stats response shape. */
export interface WebhookHealthResponse {
  /** Per-target health stats, sorted by totalCount descending. */
  targets: WebhookTargetHealthStats[];
  /** Overall summary. */
  summary: WebhookHealthSummary;
  /** Time window used for aggregation (ms). */
  windowMs: number;
  /** Current time used for computation. */
  computedAt: number;
}

/** Query options for health stats. */
export interface WebhookHealthQuery {
  /** Time window in ms (default: 24h, max: 48h). */
  windowMs?: number;
  /** Filter to a specific target ID. */
  targetId?: string;
  /** Current time override (for testing). */
  now?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;  // 24 hours
const MAX_WINDOW_MS = 48 * 60 * 60 * 1000;       // 48 hours (matches retention)

/** Success rate thresholds for health status classification. */
const HEALTH_THRESHOLD_DEGRADED = 0.9;   // below 90% → degraded
const HEALTH_THRESHOLD_UNHEALTHY = 0.5;  // below 50% → unhealthy

// ─── Core Aggregation ────────────────────────────────────────────────────────

/**
 * Classify health status from a success rate.
 * Pure function.
 */
export function classifyHealth(
  successRate: number | null,
  totalCount: number,
): 'healthy' | 'degraded' | 'unhealthy' | 'unknown' {
  if (totalCount === 0 || successRate === null) return 'unknown';
  if (successRate >= HEALTH_THRESHOLD_DEGRADED) return 'healthy';
  if (successRate >= HEALTH_THRESHOLD_UNHEALTHY) return 'degraded';
  return 'unhealthy';
}

/**
 * Aggregate per-target health stats from a list of delivery events.
 * Single-pass O(n) aggregation. Pure function — no side effects.
 *
 * Events should already be filtered to the desired time window.
 */
export function aggregateTargetHealth(
  events: WebhookDeliveryEvent[],
): WebhookTargetHealthStats[] {
  // Accumulate per-target
  const map = new Map<string, {
    targetId: string;
    targetName: string;
    successCount: number;
    failureCount: number;
    totalLatency: number;
    lastSuccessTs: number | null;
    lastFailureTs: number | null;
    lastTs: number;
    lastStatusCode: number | null;
    maskedUrl: string | null;
  }>();

  for (const ev of events) {
    let acc = map.get(ev.targetId);
    if (!acc) {
      acc = {
        targetId: ev.targetId,
        targetName: ev.targetName,
        successCount: 0,
        failureCount: 0,
        totalLatency: 0,
        lastSuccessTs: null,
        lastFailureTs: null,
        lastTs: 0,
        lastStatusCode: null,
        maskedUrl: null,
      };
      map.set(ev.targetId, acc);
    }

    if (ev.success) {
      acc.successCount++;
      if (acc.lastSuccessTs === null || ev.ts > acc.lastSuccessTs) {
        acc.lastSuccessTs = ev.ts;
      }
    } else {
      acc.failureCount++;
      if (acc.lastFailureTs === null || ev.ts > acc.lastFailureTs) {
        acc.lastFailureTs = ev.ts;
      }
    }

    acc.totalLatency += ev.durationMs;

    // Track most recent event for name/url/status
    if (ev.ts > acc.lastTs) {
      acc.lastTs = ev.ts;
      acc.targetName = ev.targetName;
      acc.maskedUrl = ev.maskedUrl;
      acc.lastStatusCode = ev.statusCode;
    }
  }

  // Convert to result
  const results: WebhookTargetHealthStats[] = [];
  for (const acc of map.values()) {
    const totalCount = acc.successCount + acc.failureCount;
    const successRate = totalCount > 0
      ? Math.round((acc.successCount / totalCount) * 10000) / 10000
      : null;
    const avgLatencyMs = totalCount > 0
      ? Math.round(acc.totalLatency / totalCount)
      : null;

    results.push({
      targetId: acc.targetId,
      targetName: acc.targetName,
      successCount: acc.successCount,
      failureCount: acc.failureCount,
      totalCount,
      successRate,
      avgLatencyMs,
      lastSuccessTs: acc.lastSuccessTs,
      lastFailureTs: acc.lastFailureTs,
      lastStatusCode: acc.lastStatusCode,
      maskedUrl: acc.maskedUrl,
      healthStatus: classifyHealth(successRate, totalCount),
    });
  }

  // Sort by totalCount descending (most active targets first)
  results.sort((a, b) => b.totalCount - a.totalCount);

  return results;
}

/**
 * Compute overall summary from per-target stats.
 * Pure function.
 */
export function computeHealthSummary(
  targets: WebhookTargetHealthStats[],
): WebhookHealthSummary {
  let totalDeliveries = 0;
  let totalSuccesses = 0;
  let totalFailures = 0;
  let totalLatencySum = 0;
  let latencyCount = 0;
  let healthyCount = 0;
  let degradedCount = 0;
  let unhealthyCount = 0;

  for (const t of targets) {
    totalDeliveries += t.totalCount;
    totalSuccesses += t.successCount;
    totalFailures += t.failureCount;

    if (t.avgLatencyMs !== null) {
      totalLatencySum += t.avgLatencyMs * t.totalCount;
      latencyCount += t.totalCount;
    }

    if (t.healthStatus === 'healthy') healthyCount++;
    else if (t.healthStatus === 'degraded') degradedCount++;
    else if (t.healthStatus === 'unhealthy') unhealthyCount++;
  }

  const overallSuccessRate = totalDeliveries > 0
    ? Math.round((totalSuccesses / totalDeliveries) * 10000) / 10000
    : null;

  const overallAvgLatencyMs = latencyCount > 0
    ? Math.round(totalLatencySum / latencyCount)
    : null;

  return {
    totalDeliveries,
    totalSuccesses,
    totalFailures,
    overallSuccessRate,
    overallAvgLatencyMs,
    targetCount: targets.length,
    healthyCount,
    degradedCount,
    unhealthyCount,
  };
}

/**
 * Main entry point: compute webhook health stats from delivery history.
 *
 * Reads the persisted delivery history, filters to the query window,
 * and aggregates per-target health metrics. Bounded to O(n) where n is
 * the number of retained events (max 200).
 */
export function computeWebhookHealth(
  dataDir: string,
  opts: WebhookHealthQuery = {},
): WebhookHealthResponse {
  const now = opts.now ?? Date.now();
  const windowMs = Math.max(1000, Math.min(opts.windowMs ?? DEFAULT_WINDOW_MS, MAX_WINDOW_MS));
  const cutoff = now - windowMs;

  // Read all events from history
  const history = readDeliveryHistory(dataDir);
  let events = history.events;

  // Filter by time window
  events = events.filter((e) => e.ts >= cutoff);

  // Filter by target ID if specified
  if (opts.targetId) {
    events = events.filter((e) => e.targetId === opts.targetId);
  }

  // Aggregate
  const targets = aggregateTargetHealth(events);
  const summary = computeHealthSummary(targets);

  return {
    targets,
    summary,
    windowMs,
    computedAt: now,
  };
}

// ─── Export Helpers (Phase 24: Webhook Health Stats Export) ───────────────────

/**
 * Maximum number of target rows allowed in a single export.
 * In practice, the number of targets is small (< 20 typically),
 * but we bound for safety.
 */
export const HEALTH_EXPORT_MAX_TARGETS = 100;

/** Supported export formats. */
export type HealthExportFormat = 'csv' | 'json';

/** Export query — same filters as WebhookHealthQuery, plus format. */
export interface HealthExportQuery {
  format?: HealthExportFormat;
  windowMs?: number;
  targetId?: string;
  now?: number;
}

/** Result of a health stats export operation. */
export interface HealthExportResult {
  /** The serialized export content (CSV string or JSON string). */
  content: string;
  /** MIME type for the response Content-Type header. */
  contentType: string;
  /** Suggested filename for the Content-Disposition header. */
  filename: string;
  /** Number of target rows included in the export. */
  count: number;
}

/**
 * Escape a value for CSV output.
 * Wraps in double quotes if the value contains commas, quotes, or newlines.
 * Pure function.
 */
export function csvEscapeHealth(value: string | number | boolean | null | undefined): string {
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
function formatHealthExportTs(ts: number | null | undefined): string {
  if (ts == null) return '';
  return new Date(ts).toISOString();
}

/**
 * Conservative field allowlist for webhook health stats export.
 * Explicitly enumerates safe fields — no raw webhook URLs, secrets,
 * or internal identifiers leak through. maskedUrl is already safe
 * (protocol + host only).
 */
function sanitizeHealthTargetForExport(target: WebhookTargetHealthStats): Record<string, unknown> {
  return {
    targetId: target.targetId,
    targetName: target.targetName,
    healthStatus: target.healthStatus,
    successCount: target.successCount,
    failureCount: target.failureCount,
    totalCount: target.totalCount,
    successRate: target.successRate,
    avgLatencyMs: target.avgLatencyMs,
    lastSuccessAt: formatHealthExportTs(target.lastSuccessTs),
    lastFailureAt: formatHealthExportTs(target.lastFailureTs),
    lastStatusCode: target.lastStatusCode,
    // Explicitly omit: maskedUrl (even masked URLs could leak infrastructure info in exports)
    // Explicitly omit: any fields that may be added in future
  };
}

/** CSV column headers for webhook health stats export. */
const HEALTH_CSV_HEADERS = [
  'targetId', 'targetName', 'healthStatus', 'successCount', 'failureCount',
  'totalCount', 'successRate', 'avgLatencyMs', 'lastSuccessAt', 'lastFailureAt',
  'lastStatusCode',
];

/**
 * Convert webhook health target stats to CSV format.
 * Pure function — no I/O, bounded by input array length.
 */
export function healthTargetsToCsv(targets: WebhookTargetHealthStats[]): string {
  const rows: string[] = [HEALTH_CSV_HEADERS.join(',')];

  for (const target of targets) {
    const safe = sanitizeHealthTargetForExport(target);
    const row = HEALTH_CSV_HEADERS.map((h) =>
      csvEscapeHealth(safe[h] as string | number | boolean | null),
    );
    rows.push(row.join(','));
  }

  return rows.join('\n');
}

/**
 * Convert webhook health stats to a safe JSON export format.
 * Returns a JSON string with sanitized targets and summary (no secrets).
 * Pure function.
 */
export function healthStatsToJson(
  response: WebhookHealthResponse,
): string {
  const safeTargets = response.targets.map(sanitizeHealthTargetForExport);
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    format: 'ventureos-webhook-health-export-v1',
    windowMs: response.windowMs,
    computedAt: new Date(response.computedAt).toISOString(),
    count: safeTargets.length,
    summary: {
      totalDeliveries: response.summary.totalDeliveries,
      totalSuccesses: response.summary.totalSuccesses,
      totalFailures: response.summary.totalFailures,
      overallSuccessRate: response.summary.overallSuccessRate,
      overallAvgLatencyMs: response.summary.overallAvgLatencyMs,
      targetCount: response.summary.targetCount,
      healthyCount: response.summary.healthyCount,
      degradedCount: response.summary.degradedCount,
      unhealthyCount: response.summary.unhealthyCount,
    },
    targets: safeTargets,
  }, null, 2);
}

/**
 * Export webhook health stats with the same filter capabilities as computeWebhookHealth.
 * Returns formatted content (CSV or JSON), content type, and suggested filename.
 *
 * Secret-safe: all targets pass through sanitizeHealthTargetForExport() which
 * applies a conservative field allowlist. maskedUrl is intentionally omitted
 * from exports as even partial URL info could leak infrastructure details.
 */
export function exportWebhookHealth(
  dataDir: string,
  opts: HealthExportQuery = {},
): HealthExportResult {
  const format: HealthExportFormat = opts.format === 'csv' ? 'csv' : 'json';

  // Reuse the same computation logic for filter parity
  const healthResult = computeWebhookHealth(dataDir, {
    windowMs: opts.windowMs,
    targetId: opts.targetId,
    now: opts.now,
  });

  // Bound target count (defensive — unlikely to exceed in practice)
  let targets = healthResult.targets;
  if (targets.length > HEALTH_EXPORT_MAX_TARGETS) {
    targets = targets.slice(0, HEALTH_EXPORT_MAX_TARGETS);
  }

  const dateSuffix = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    return {
      content: healthTargetsToCsv(targets),
      contentType: 'text/csv; charset=utf-8',
      filename: `webhook-health-${dateSuffix}.csv`,
      count: targets.length,
    };
  }

  return {
    content: healthStatsToJson(healthResult),
    contentType: 'application/json; charset=utf-8',
    filename: `webhook-health-${dateSuffix}.json`,
    count: targets.length,
  };
}

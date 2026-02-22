import fs from 'node:fs';
import path from 'node:path';

export interface OverviewFreshnessThreshold {
  freshMs: number;
  staleMs: number;
}

export interface OverviewFreshnessThresholds {
  kpi: OverviewFreshnessThreshold;
  agentHealth: OverviewFreshnessThreshold;
  observations: OverviewFreshnessThreshold;
}

export type OverviewFreshnessState = 'fresh' | 'aging' | 'stale' | 'unavailable' | 'unknown';

export interface OverviewFreshnessEvent {
  state: OverviewFreshnessState;
  stale: number;
  aging: number;
  unavailable: number;
  total: number;
  source: string;
  emittedAt: number;
  receivedAt: number;
}

export interface OverviewFreshnessDedupeResult {
  accepted: boolean;
  dedupeKey: string;
  duplicateOfReceivedAt: number | null;
}

const MIN_THRESHOLD_MS = 1_000;
const MAX_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_EVENT_COUNT = 100;
const MAX_SOURCE_LENGTH = 64;
const EVENT_FILE_NAME = 'overview-freshness-events.jsonl';
const DEFAULT_TIMELINE_LIMIT = 8;
const MIN_TIMELINE_LIMIT = 1;
const MAX_TIMELINE_LIMIT = 40;
const DEFAULT_EVENT_DEDUPE_WINDOW_MS = 30_000;
const MAX_EVENT_DEDUPE_WINDOW_MS = 10 * 60 * 1000;

const DEFAULT_THRESHOLDS: OverviewFreshnessThresholds = {
  kpi: { freshMs: 36 * 60 * 60 * 1000, staleMs: 96 * 60 * 60 * 1000 },
  agentHealth: { freshMs: 15 * 60 * 1000, staleMs: 2 * 60 * 60 * 1000 },
  observations: { freshMs: 6 * 60 * 60 * 1000, staleMs: 24 * 60 * 60 * 1000 },
};

function clampMs(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < MIN_THRESHOLD_MS) return MIN_THRESHOLD_MS;
  if (parsed > MAX_THRESHOLD_MS) return MAX_THRESHOLD_MS;
  return parsed;
}

function normalizeWindow(
  freshRaw: string | undefined,
  staleRaw: string | undefined,
  defaults: OverviewFreshnessThreshold,
): OverviewFreshnessThreshold {
  const freshMs = clampMs(freshRaw, defaults.freshMs);
  const staleCandidate = clampMs(staleRaw, defaults.staleMs);
  const staleMs = staleCandidate <= freshMs ? freshMs + 1 : staleCandidate;
  return { freshMs, staleMs };
}

function clampCount(raw: unknown, fallback = 0): number {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  if (parsed > MAX_EVENT_COUNT) return MAX_EVENT_COUNT;
  return parsed;
}

function clampTimestamp(raw: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function clampTimelineLimit(raw: unknown, fallback = DEFAULT_TIMELINE_LIMIT): number {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < MIN_TIMELINE_LIMIT) return MIN_TIMELINE_LIMIT;
  if (parsed > MAX_TIMELINE_LIMIT) return MAX_TIMELINE_LIMIT;
  return parsed;
}

function clampEventDedupeWindowMs(raw: unknown, fallback = DEFAULT_EVENT_DEDUPE_WINDOW_MS): number {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  if (parsed > MAX_EVENT_DEDUPE_WINDOW_MS) return MAX_EVENT_DEDUPE_WINDOW_MS;
  return parsed;
}

function sanitizeSource(raw: unknown): string {
  const asString = typeof raw === 'string' ? raw : '';
  const trimmed = asString.trim();
  if (!trimmed) return 'overview-widget';
  const safe = trimmed
    .replace(/[^a-zA-Z0-9_.:-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SOURCE_LENGTH);
  return safe || 'overview-widget';
}

function normalizeState(raw: unknown): OverviewFreshnessState | null {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!value) return null;
  if (
    value === 'fresh' ||
    value === 'aging' ||
    value === 'stale' ||
    value === 'unavailable' ||
    value === 'unknown'
  ) {
    return value;
  }
  return null;
}

export function getOverviewFreshnessEventFilePath(dataDir: string): string {
  return path.join(dataDir, EVENT_FILE_NAME);
}

export function getOverviewFreshnessDefaultThresholds(): OverviewFreshnessThresholds {
  return {
    kpi: { ...DEFAULT_THRESHOLDS.kpi },
    agentHealth: { ...DEFAULT_THRESHOLDS.agentHealth },
    observations: { ...DEFAULT_THRESHOLDS.observations },
  };
}

export function resolveOverviewFreshnessThresholds(
  env: NodeJS.ProcessEnv = process.env,
): OverviewFreshnessThresholds {
  return {
    kpi: normalizeWindow(
      env.DASHBOARD_OVERVIEW_FRESHNESS_KPI_FRESH_MS,
      env.DASHBOARD_OVERVIEW_FRESHNESS_KPI_STALE_MS,
      DEFAULT_THRESHOLDS.kpi,
    ),
    agentHealth: normalizeWindow(
      env.DASHBOARD_OVERVIEW_FRESHNESS_AGENT_HEALTH_FRESH_MS,
      env.DASHBOARD_OVERVIEW_FRESHNESS_AGENT_HEALTH_STALE_MS,
      DEFAULT_THRESHOLDS.agentHealth,
    ),
    observations: normalizeWindow(
      env.DASHBOARD_OVERVIEW_FRESHNESS_OBSERVATIONS_FRESH_MS,
      env.DASHBOARD_OVERVIEW_FRESHNESS_OBSERVATIONS_STALE_MS,
      DEFAULT_THRESHOLDS.observations,
    ),
  };
}

export function resolveOverviewFreshnessTimelineLimit(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return clampTimelineLimit(env.DASHBOARD_OVERVIEW_FRESHNESS_TIMELINE_LIMIT);
}

export function resolveOverviewFreshnessEventDedupeWindowMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return clampEventDedupeWindowMs(env.DASHBOARD_OVERVIEW_FRESHNESS_EVENT_DEDUPE_WINDOW_MS);
}

export function parseOverviewFreshnessEvent(
  payload: unknown,
  nowMs: number = Date.now(),
): OverviewFreshnessEvent | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const row = payload as Record<string, unknown>;
  const state = normalizeState(row.state);
  if (!state) return null;

  const total = clampCount(row.total, 0);
  const stale = Math.min(total || MAX_EVENT_COUNT, clampCount(row.stale, 0));
  const aging = Math.min(total || MAX_EVENT_COUNT, clampCount(row.aging, 0));
  const unavailable = Math.min(total || MAX_EVENT_COUNT, clampCount(row.unavailable, 0));

  return {
    state,
    stale,
    aging,
    unavailable,
    total,
    source: sanitizeSource(row.source),
    emittedAt: clampTimestamp(row.emittedAt, nowMs),
    receivedAt: nowMs,
  };
}

export function readOverviewFreshnessEvents(
  dataDir: string,
  opts: { limit?: number } = {},
): OverviewFreshnessEvent[] {
  const filePath = getOverviewFreshnessEventFilePath(dataDir);
  const limit = clampTimelineLimit(opts.limit, DEFAULT_TIMELINE_LIMIT);
  if (!fs.existsSync(filePath)) return [];

  let lines: string[] = [];
  try {
    lines = fs.readFileSync(filePath, 'utf8').split('\n');
  } catch {
    return [];
  }

  const out: OverviewFreshnessEvent[] = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i -= 1) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      const row = parsed as Record<string, unknown>;
      const state = normalizeState(row.state);
      if (!state) continue;
      const event: OverviewFreshnessEvent = {
        state,
        stale: clampCount(row.stale, 0),
        aging: clampCount(row.aging, 0),
        unavailable: clampCount(row.unavailable, 0),
        total: clampCount(row.total, 0),
        source: sanitizeSource(row.source),
        emittedAt: clampTimestamp(row.emittedAt, 0),
        receivedAt: clampTimestamp(row.receivedAt, 0),
      };
      out.push(event);
    } catch {
      // Ignore malformed lines and continue scanning.
    }
  }
  return out;
}

function dedupeKeyForEvent(event: OverviewFreshnessEvent): string {
  return [
    event.state,
    event.stale,
    event.aging,
    event.unavailable,
    event.total,
    event.source,
  ].join('|');
}

export function evaluateOverviewFreshnessEventForPersistence(
  event: OverviewFreshnessEvent,
  dedupeWindowMs: number,
  lastEventAtByKey: Map<string, number>,
  nowMs: number = Date.now(),
): OverviewFreshnessDedupeResult {
  const windowMs = clampEventDedupeWindowMs(dedupeWindowMs, DEFAULT_EVENT_DEDUPE_WINDOW_MS);
  const dedupeKey = dedupeKeyForEvent(event);
  const prev = lastEventAtByKey.get(dedupeKey) ?? 0;
  const eventTs = event.receivedAt || nowMs;

  if (windowMs <= 0) {
    lastEventAtByKey.set(dedupeKey, eventTs);
    return { accepted: true, dedupeKey, duplicateOfReceivedAt: null };
  }

  if (prev > 0 && eventTs - prev < windowMs) {
    return { accepted: false, dedupeKey, duplicateOfReceivedAt: prev };
  }

  lastEventAtByKey.set(dedupeKey, eventTs);

  // Keep dedupe memory bounded.
  const pruneBefore = nowMs - Math.max(windowMs * 4, 60_000);
  for (const [key, ts] of lastEventAtByKey.entries()) {
    if (ts < pruneBefore) lastEventAtByKey.delete(key);
  }

  return { accepted: true, dedupeKey, duplicateOfReceivedAt: null };
}

export function appendOverviewFreshnessEvent(
  dataDir: string,
  event: OverviewFreshnessEvent,
): string {
  const filePath = getOverviewFreshnessEventFilePath(dataDir);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(event) + '\n', 'utf8');
  return filePath;
}

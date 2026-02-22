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

const MIN_THRESHOLD_MS = 1_000;
const MAX_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_EVENT_COUNT = 100;
const MAX_SOURCE_LENGTH = 64;
const EVENT_FILE_NAME = 'overview-freshness-events.jsonl';

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

export function appendOverviewFreshnessEvent(
  dataDir: string,
  event: OverviewFreshnessEvent,
): string {
  const filePath = getOverviewFreshnessEventFilePath(dataDir);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(event) + '\n', 'utf8');
  return filePath;
}

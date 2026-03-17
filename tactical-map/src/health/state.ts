/**
 * Health State Management — Phase 5.6
 *
 * Pure functions for computing health state from raw API data.
 * Follows the same pattern as economy/state.ts for consistency.
 */

import { AGENT_ORDER } from '@/config';
import type { AgentId } from '@/config';
import { normalizeAgentId } from '@/identity';
import { clamp01 } from '@/utils/color';
import type {
  AgentHealthState,
  ConnectivityStatus,
  HealthAlert,
  HealthState,
  HealthStatus,
  HealthThresholds,
  MetricsSample,
  PerformanceMetrics,
  RawAgentHealth,
  RawHealthSnapshot,
  RawMetricsSample,
  SystemHealthState,
} from './types';
import { DEFAULT_HEALTH_THRESHOLDS } from './types';

// ═══════════════════════════════════════════
// Parsing helpers
// ═══════════════════════════════════════════

function coerceNumber(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return fallback;
}

function coerceTimestamp(v: unknown): number {
  if (typeof v === 'number' && v > 0) return v;
  if (typeof v === 'string') {
    const n = Date.parse(v);
    if (Number.isFinite(n)) return n;
  }
  return Date.now();
}

export function parseMetricsSample(raw: RawMetricsSample): MetricsSample {
  return {
    ts: coerceTimestamp(raw.ts),
    cpuUsage: clamp01(coerceNumber(raw.cpu ?? raw.cpuUsage, 0)),
    memoryUsage: clamp01(coerceNumber(raw.memory ?? raw.memoryUsage, 0)),
    latencyMs: Math.max(0, coerceNumber(raw.latency ?? raw.latencyMs, 0)),
    requestsPerSec: Math.max(0, coerceNumber(raw.rps ?? raw.requestsPerSec, 0)),
    errorRate: clamp01(coerceNumber(raw.errorRate ?? raw.errors, 0)),
  };
}

export function parsePerformanceMetrics(raw: RawAgentHealth): PerformanceMetrics {
  return {
    cpuUsage: clamp01(coerceNumber(raw.cpu ?? raw.cpuUsage, 0)),
    memoryUsage: clamp01(coerceNumber(raw.memory ?? raw.memoryUsage, 0)),
    latencyMs: Math.max(0, coerceNumber(raw.latency ?? raw.latencyMs, 0)),
    requestsPerSec: Math.max(0, coerceNumber(raw.requestsPerSec ?? raw.rps, 0)),
    errorRate: clamp01(coerceNumber(raw.errorRate ?? raw.errors, 0)),
    uptimeSec: Math.max(0, coerceNumber(raw.uptime ?? raw.uptimeSec, 0)),
  };
}

function normalizeHealthStatus(raw?: string): HealthStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'green':
      return 'green';
    case 'yellow':
    case 'warning':
    case 'degraded':
      return 'yellow';
    case 'red':
    case 'critical':
    case 'error':
      return 'red';
    default:
      return 'green';
  }
}

function normalizeConnectivity(raw?: string): ConnectivityStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'online':
      return 'online';
    case 'offline':
      return 'offline';
    case 'degraded':
      return 'degraded';
    default:
      return 'online';
  }
}

// ═══════════════════════════════════════════
// Health computation
// ═══════════════════════════════════════════

/**
 * Compute health status from performance metrics using thresholds.
 * Returns the worst (most severe) status across all metrics.
 */
export function computeHealthStatus(
  metrics: PerformanceMetrics,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS
): HealthStatus {
  let status: HealthStatus = 'green';

  function elevate(newStatus: HealthStatus) {
    if (newStatus === 'red') status = 'red';
    else if (newStatus === 'yellow' && status !== 'red') status = 'yellow';
  }

  // CPU
  if (metrics.cpuUsage >= thresholds.cpuCritical) elevate('red');
  else if (metrics.cpuUsage >= thresholds.cpuWarning) elevate('yellow');

  // Memory
  if (metrics.memoryUsage >= thresholds.memoryCritical) elevate('red');
  else if (metrics.memoryUsage >= thresholds.memoryWarning) elevate('yellow');

  // Latency
  if (metrics.latencyMs >= thresholds.latencyCriticalMs) elevate('red');
  else if (metrics.latencyMs >= thresholds.latencyWarningMs) elevate('yellow');

  // Error rate
  if (metrics.errorRate >= thresholds.errorRateCritical) elevate('red');
  else if (metrics.errorRate >= thresholds.errorRateWarning) elevate('yellow');

  return status;
}

/**
 * Compute connectivity status from consecutive failures.
 */
export function computeConnectivity(
  consecutiveFailures: number,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS
): ConnectivityStatus {
  if (consecutiveFailures >= thresholds.offlineAfterFailures) return 'offline';
  if (consecutiveFailures >= thresholds.degradedAfterFailures) return 'degraded';
  return 'online';
}

// ═══════════════════════════════════════════
// State factory
// ═══════════════════════════════════════════

function createEmptyMetrics(): PerformanceMetrics {
  return {
    cpuUsage: 0,
    memoryUsage: 0,
    latencyMs: 0,
    requestsPerSec: 0,
    errorRate: 0,
    uptimeSec: 0,
  };
}

function createEmptyAgentHealth(agentId: AgentId): AgentHealthState {
  return {
    agentId,
    status: 'green',
    connectivity: 'online',
    metrics: createEmptyMetrics(),
    history: [],
    lastCheckAt: 0,
    consecutiveFailures: 0,
    errors: [],
    updatedAt: 0,
  };
}

function createEmptySystemHealth(): SystemHealthState {
  return {
    overallStatus: 'green',
    statusCounts: { green: AGENT_ORDER.length, yellow: 0, red: 0 },
    aggregateMetrics: createEmptyMetrics(),
    connectivitySummary: { online: AGENT_ORDER.length, offline: 0, degraded: 0 },
    updatedAt: 0,
  };
}

export function createEmptyHealthState(): HealthState {
  const agents = {} as Record<AgentId, AgentHealthState>;
  for (const id of AGENT_ORDER) {
    agents[id] = createEmptyAgentHealth(id);
  }
  return {
    agents,
    system: createEmptySystemHealth(),
    alerts: [],
    updatedAt: 0,
  };
}

// ═══════════════════════════════════════════
// State transitions
// ═══════════════════════════════════════════

export interface HistoryConfig {
  maxPoints: number;
  maxAgeMs: number;
}

const DEFAULT_HISTORY_CONFIG: HistoryConfig = {
  maxPoints: 64,
  maxAgeMs: 1000 * 60 * 60, // 1 hour
};

function trimHistory(
  history: MetricsSample[],
  config: HistoryConfig = DEFAULT_HISTORY_CONFIG,
  nowMs: number = Date.now()
): MetricsSample[] {
  const cutoff = nowMs - config.maxAgeMs;
  const filtered = history.filter((s) => s.ts >= cutoff);
  if (filtered.length > config.maxPoints) {
    return filtered.slice(filtered.length - config.maxPoints);
  }
  return filtered;
}

function parseAgentHealth(
  raw: RawAgentHealth,
  existing: AgentHealthState,
  thresholds: HealthThresholds,
  historyConfig: HistoryConfig,
  nowMs: number
): AgentHealthState {
  const agentId = normalizeAgentId(String(raw.agentId ?? '')) ?? existing.agentId;
  const metrics = parsePerformanceMetrics(raw);
  const consecutiveFailures = coerceNumber(raw.consecutiveFailures, existing.consecutiveFailures);

  // Prefer server-reported status, fall back to computed from metrics
  const serverStatus = raw.status ? normalizeHealthStatus(raw.status) : null;
  const computedStatus = computeHealthStatus(metrics, thresholds);
  const status = serverStatus ?? computedStatus;

  // Prefer server-reported connectivity, fall back to computed
  const serverConnectivity = raw.connectivity ? normalizeConnectivity(raw.connectivity) : null;
  const computedConnectivity = computeConnectivity(consecutiveFailures, thresholds);
  const connectivity = serverConnectivity ?? computedConnectivity;

  // Merge history
  const rawHistory = (raw.history ?? []).map(parseMetricsSample);
  const newSample: MetricsSample = {
    ts: nowMs,
    cpuUsage: metrics.cpuUsage,
    memoryUsage: metrics.memoryUsage,
    latencyMs: metrics.latencyMs,
    requestsPerSec: metrics.requestsPerSec,
    errorRate: metrics.errorRate,
  };

  let history: MetricsSample[];
  if (rawHistory.length > 0) {
    // Server provided full history; use it
    history = rawHistory;
  } else {
    // Append new sample to existing history
    history = [...existing.history, newSample];
  }
  history = trimHistory(history, historyConfig, nowMs);

  const errors = Array.isArray(raw.errorMessages)
    ? raw.errorMessages.filter((e): e is string => typeof e === 'string').slice(0, 10)
    : existing.errors;

  return {
    agentId,
    status,
    connectivity,
    metrics,
    history,
    lastCheckAt: coerceTimestamp(raw.lastCheckAt ?? nowMs),
    consecutiveFailures,
    errors,
    updatedAt: nowMs,
  };
}

/**
 * Compute system-wide aggregates from per-agent health states.
 */
export function computeSystemHealth(
  agents: Record<AgentId, AgentHealthState>,
  nowMs: number = Date.now()
): SystemHealthState {
  const statusCounts: Record<HealthStatus, number> = { green: 0, yellow: 0, red: 0 };
  const connectivitySummary: Record<ConnectivityStatus, number> = { online: 0, offline: 0, degraded: 0 };

  let totalCpu = 0;
  let totalMem = 0;
  let totalLatency = 0;
  let totalRps = 0;
  let totalErrors = 0;
  let totalUptime = 0;
  let count = 0;

  for (const id of AGENT_ORDER) {
    const agent = agents[id];
    if (!agent) continue;

    statusCounts[agent.status]++;
    connectivitySummary[agent.connectivity]++;

    totalCpu += agent.metrics.cpuUsage;
    totalMem += agent.metrics.memoryUsage;
    totalLatency += agent.metrics.latencyMs;
    totalRps += agent.metrics.requestsPerSec;
    totalErrors += agent.metrics.errorRate;
    totalUptime += agent.metrics.uptimeSec;
    count++;
  }

  const n = Math.max(1, count);
  const overallStatus: HealthStatus =
    statusCounts.red > 0 ? 'red' : statusCounts.yellow > 0 ? 'yellow' : 'green';

  return {
    overallStatus,
    statusCounts,
    aggregateMetrics: {
      cpuUsage: totalCpu / n,
      memoryUsage: totalMem / n,
      latencyMs: totalLatency / n,
      requestsPerSec: totalRps, // Sum, not average
      errorRate: totalErrors / n,
      uptimeSec: totalUptime / n,
    },
    connectivitySummary,
    updatedAt: nowMs,
  };
}

/**
 * Apply a full health snapshot (from initial load or periodic refresh).
 */
export function applyHealthSnapshot(
  current: HealthState,
  snapshot: RawHealthSnapshot,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS,
  historyConfig: HistoryConfig = DEFAULT_HISTORY_CONFIG,
  nowMs: number = Date.now()
): HealthState {
  const agents = { ...current.agents };

  if (snapshot.agents) {
    for (const id of AGENT_ORDER) {
      const raw = snapshot.agents[id];
      if (raw) {
        agents[id] = parseAgentHealth(raw, current.agents[id], thresholds, historyConfig, nowMs);
      }
    }
  }

  const system = computeSystemHealth(agents, nowMs);

  return {
    agents,
    system,
    alerts: current.alerts,
    updatedAt: nowMs,
  };
}

/**
 * Apply a single agent health update (from WebSocket event).
 */
export function applyAgentHealthUpdate(
  current: HealthState,
  raw: RawAgentHealth,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS,
  historyConfig: HistoryConfig = DEFAULT_HISTORY_CONFIG,
  nowMs: number = Date.now()
): HealthState {
  const agentId = raw.agentId as AgentId | undefined;
  if (!agentId || !current.agents[agentId]) return current;

  const agents = { ...current.agents };
  agents[agentId] = parseAgentHealth(raw, current.agents[agentId], thresholds, historyConfig, nowMs);

  const system = computeSystemHealth(agents, nowMs);

  return {
    agents,
    system,
    alerts: current.alerts,
    updatedAt: nowMs,
  };
}

/**
 * Add an alert to the health state.
 */
export function addHealthAlert(
  current: HealthState,
  alert: HealthAlert
): HealthState {
  // Deduplicate: don't add if same agent + metric + severity is already active
  const isDuplicate = current.alerts.some(
    (a) =>
      a.state === 'active' &&
      a.agentId === alert.agentId &&
      a.metric === alert.metric &&
      a.severity === alert.severity
  );
  if (isDuplicate) return current;

  const alerts = [...current.alerts, alert];
  // Cap at 50 alerts, remove oldest resolved first
  if (alerts.length > 50) {
    const resolved = alerts.filter((a) => a.state === 'resolved');
    if (resolved.length > 0) {
      const oldest = resolved[0];
      const idx = alerts.indexOf(oldest);
      if (idx >= 0) alerts.splice(idx, 1);
    } else {
      alerts.shift();
    }
  }
  return { ...current, alerts };
}

/**
 * Resolve alerts for an agent whose status improved.
 */
export function resolveAlertsForAgent(
  current: HealthState,
  agentId: AgentId | 'system',
  nowMs: number = Date.now()
): HealthState {
  const alerts = current.alerts.map((a) => {
    if (a.agentId === agentId && a.state === 'active') {
      return { ...a, state: 'resolved' as const, resolvedAt: nowMs };
    }
    return a;
  });
  return { ...current, alerts };
}

/**
 * Expire old alerts based on TTL.
 */
export function expireAlerts(
  current: HealthState,
  nowMs: number = Date.now()
): HealthState {
  const alerts = current.alerts.filter((a) => {
    if (a.state === 'resolved') {
      // Keep resolved alerts for 30s for fadeout animation
      return (a.resolvedAt ?? 0) + 30_000 > nowMs;
    }
    if (a.ttlMs > 0 && a.state === 'active') {
      return a.createdAt + a.ttlMs > nowMs;
    }
    return true;
  });

  if (alerts.length === current.alerts.length) return current;
  return { ...current, alerts };
}

// Exports for testing
export const __test = {
  parseMetricsSample,
  parsePerformanceMetrics,
  normalizeHealthStatus,
  normalizeConnectivity,
  trimHistory,
  parseAgentHealth,
  createEmptyAgentHealth,
  createEmptyMetrics,
  coerceNumber,
  coerceTimestamp,
};

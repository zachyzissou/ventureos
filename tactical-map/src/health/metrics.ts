/**
 * Metrics Aggregation — Phase 5.6
 *
 * Time-series collection, aggregation, and sparkline data for
 * the health dashboard. Designed for <50ms health check performance.
 */

import type { AgentId } from '@/config';
import { AGENT_ORDER } from '@/config';
import { clamp01 } from '@/utils/color';
import type {
  AgentHealthState,
  HealthState,
  MetricsSample,
  PerformanceMetrics,
} from './types';

// ═══════════════════════════════════════════
// Sparkline helpers
// ═══════════════════════════════════════════

export type SparklineData = {
  values: number[];
  min: number;
  max: number;
  current: number;
};

/**
 * Extract a specific metric's time-series values from history.
 */
export function extractMetricSeries(
  history: MetricsSample[],
  metric: keyof MetricsSample
): SparklineData {
  if (history.length === 0) {
    return { values: [], min: 0, max: 0, current: 0 };
  }

  const values = history.map((s) => {
    const v = s[metric];
    return typeof v === 'number' ? v : 0;
  });

  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max)) max = 0;

  return {
    values,
    min,
    max,
    current: values[values.length - 1] ?? 0,
  };
}

// ═══════════════════════════════════════════
// Aggregate metrics
// ═══════════════════════════════════════════

export type AgentMetricsSummary = {
  agentId: AgentId;
  cpu: SparklineData;
  memory: SparklineData;
  latency: SparklineData;
  rps: SparklineData;
  errorRate: SparklineData;
};

/**
 * Compute full sparkline summaries for one agent.
 */
export function computeAgentMetricsSummary(agent: AgentHealthState): AgentMetricsSummary {
  return {
    agentId: agent.agentId,
    cpu: extractMetricSeries(agent.history, 'cpuUsage'),
    memory: extractMetricSeries(agent.history, 'memoryUsage'),
    latency: extractMetricSeries(agent.history, 'latencyMs'),
    rps: extractMetricSeries(agent.history, 'requestsPerSec'),
    errorRate: extractMetricSeries(agent.history, 'errorRate'),
  };
}

/**
 * Compute summaries for all agents.
 */
export function computeAllMetricsSummaries(
  state: HealthState
): Record<AgentId, AgentMetricsSummary> {
  const result = {} as Record<AgentId, AgentMetricsSummary>;
  for (const id of AGENT_ORDER) {
    result[id] = computeAgentMetricsSummary(state.agents[id]);
  }
  return result;
}

// ═══════════════════════════════════════════
// Health score computation
// ═══════════════════════════════════════════

/**
 * Compute a single 0-100 health score from metrics.
 * Higher = healthier. Used for dashboard gauges.
 */
export function computeHealthScore(metrics: PerformanceMetrics): number {
  // Weight factors (must sum to 1.0)
  const cpuWeight = 0.25;
  const memWeight = 0.20;
  const latencyWeight = 0.25;
  const errorWeight = 0.30;

  // Invert: higher usage = lower score
  const cpuScore = 1 - clamp01(metrics.cpuUsage);
  const memScore = 1 - clamp01(metrics.memoryUsage);

  // Latency: 0ms = 1.0, >=2000ms = 0.0
  const latencyScore = 1 - clamp01(metrics.latencyMs / 2000);

  // Error rate: 0% = 1.0, >=20% = 0.0
  const errorScore = 1 - clamp01(metrics.errorRate / 0.20);

  const weighted =
    cpuScore * cpuWeight +
    memScore * memWeight +
    latencyScore * latencyWeight +
    errorScore * errorWeight;

  return Math.round(weighted * 100);
}

/**
 * Compute system-wide health score (average of all agents).
 */
export function computeSystemHealthScore(state: HealthState): number {
  let total = 0;
  let count = 0;
  for (const id of AGENT_ORDER) {
    total += computeHealthScore(state.agents[id].metrics);
    count++;
  }
  return count > 0 ? Math.round(total / count) : 100;
}

// ═══════════════════════════════════════════
// Metric formatting helpers
// ═══════════════════════════════════════════

export function formatCpu(ratio: number): string {
  return `${Math.round(clamp01(ratio) * 100)}%`;
}

export function formatMemory(ratio: number): string {
  return `${Math.round(clamp01(ratio) * 100)}%`;
}

export function formatLatency(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatRps(rps: number): string {
  if (rps < 1) return `${rps.toFixed(1)}/s`;
  if (rps >= 1000) return `${(rps / 1000).toFixed(1)}k/s`;
  return `${Math.round(rps)}/s`;
}

export function formatErrorRate(ratio: number): string {
  return `${(clamp01(ratio) * 100).toFixed(1)}%`;
}

export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

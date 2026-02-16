/**
 * Health & Diagnostics Types — Phase 5.6
 *
 * Core type definitions for real-time system health monitoring
 * and issue detection on the Tactical Map.
 *
 * Protoss lore: The Khala carries not just thoughts but vital signs —
 * each agent's pulse echoes through the psionic network. When a node
 * falters, the collective feels it instantly.
 */

import type { AgentId } from '@/config';

// ═══════════════════════════════════════════
// Health Status
// ═══════════════════════════════════════════

/** Traffic-light health status per agent. */
export type HealthStatus = 'green' | 'yellow' | 'red';

/** Connectivity state for agents and the system. */
export type ConnectivityStatus = 'online' | 'offline' | 'degraded';

/** Alert severity levels. P0 = critical, P1 = warning. */
export type AlertSeverity = 'P0' | 'P1';

/** Alert lifecycle states. */
export type AlertState = 'active' | 'acknowledged' | 'resolved';

// ═══════════════════════════════════════════
// Performance Metrics
// ═══════════════════════════════════════════

export interface PerformanceMetrics {
  /** CPU usage ratio (0-1). */
  cpuUsage: number;
  /** Memory usage ratio (0-1). */
  memoryUsage: number;
  /** Average response latency in ms. */
  latencyMs: number;
  /** Requests per second. */
  requestsPerSec: number;
  /** Error rate ratio (0-1). */
  errorRate: number;
  /** Uptime in seconds since last restart. */
  uptimeSec: number;
}

export interface MetricsSample {
  ts: number;
  cpuUsage: number;
  memoryUsage: number;
  latencyMs: number;
  requestsPerSec: number;
  errorRate: number;
}

// ═══════════════════════════════════════════
// Agent Health
// ═══════════════════════════════════════════

export interface AgentHealthState {
  agentId: AgentId;
  status: HealthStatus;
  connectivity: ConnectivityStatus;
  metrics: PerformanceMetrics;
  /** Rolling metric history for sparklines. */
  history: MetricsSample[];
  /** Last successful health check timestamp (epoch ms). */
  lastCheckAt: number;
  /** Number of consecutive failures. */
  consecutiveFailures: number;
  /** Active error messages (if any). */
  errors: string[];
  updatedAt: number;
}

// ═══════════════════════════════════════════
// System-Wide Health
// ═══════════════════════════════════════════

export interface SystemHealthState {
  /** Overall system status (worst of all agents). */
  overallStatus: HealthStatus;
  /** Number of agents in each status category. */
  statusCounts: Record<HealthStatus, number>;
  /** System-wide aggregated metrics. */
  aggregateMetrics: PerformanceMetrics;
  /** Average connectivity across agents. */
  connectivitySummary: Record<ConnectivityStatus, number>;
  updatedAt: number;
}

export interface HealthState {
  agents: Record<AgentId, AgentHealthState>;
  system: SystemHealthState;
  alerts: HealthAlert[];
  updatedAt: number;
}

// ═══════════════════════════════════════════
// Alerts
// ═══════════════════════════════════════════

export interface HealthAlert {
  id: string;
  severity: AlertSeverity;
  state: AlertState;
  agentId: AgentId | 'system';
  title: string;
  message: string;
  /** Metric that triggered the alert. */
  metric?: string;
  /** Value that triggered the alert. */
  value?: number;
  /** Threshold that was exceeded. */
  threshold?: number;
  createdAt: number;
  acknowledgedAt?: number;
  resolvedAt?: number;
  /** Auto-dismiss timeout in ms (0 = no auto-dismiss). */
  ttlMs: number;
}

// ═══════════════════════════════════════════
// API Response Types (raw, from server)
// ═══════════════════════════════════════════

export interface RawAgentHealth {
  agentId?: string;
  status?: string;
  connectivity?: string;
  cpu?: number;
  cpuUsage?: number;
  memory?: number;
  memoryUsage?: number;
  latency?: number;
  latencyMs?: number;
  requestsPerSec?: number;
  rps?: number;
  errorRate?: number;
  errors?: number;
  uptime?: number;
  uptimeSec?: number;
  lastCheckAt?: string | number;
  consecutiveFailures?: number;
  errorMessages?: string[];
  history?: RawMetricsSample[];
}

export interface RawMetricsSample {
  ts?: number | string;
  cpu?: number;
  cpuUsage?: number;
  memory?: number;
  memoryUsage?: number;
  latency?: number;
  latencyMs?: number;
  rps?: number;
  requestsPerSec?: number;
  errorRate?: number;
  errors?: number;
}

export interface RawHealthSnapshot {
  updatedAt?: string | number;
  agents?: Record<string, RawAgentHealth>;
  system?: {
    overallStatus?: string;
    aggregateMetrics?: RawMetricsSample;
  };
}

export interface RawHealthEvent {
  type?: string;
  snapshot?: RawHealthSnapshot;
  agent?: RawAgentHealth;
  alert?: {
    id?: string;
    severity?: string;
    agentId?: string;
    title?: string;
    message?: string;
    metric?: string;
    value?: number;
    threshold?: number;
    createdAt?: number | string;
    ttlMs?: number;
  };
}

// ═══════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════

export interface HealthThresholds {
  /** CPU usage ratio above which status = yellow. */
  cpuWarning: number;
  /** CPU usage ratio above which status = red. */
  cpuCritical: number;
  /** Memory usage ratio above which status = yellow. */
  memoryWarning: number;
  /** Memory usage ratio above which status = red. */
  memoryCritical: number;
  /** Latency (ms) above which status = yellow. */
  latencyWarningMs: number;
  /** Latency (ms) above which status = red. */
  latencyCriticalMs: number;
  /** Error rate ratio above which status = yellow. */
  errorRateWarning: number;
  /** Error rate ratio above which status = red. */
  errorRateCritical: number;
  /** Consecutive failures before marking offline. */
  offlineAfterFailures: number;
  /** Consecutive failures before marking degraded. */
  degradedAfterFailures: number;
}

export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  cpuWarning: 0.70,
  cpuCritical: 0.90,
  memoryWarning: 0.75,
  memoryCritical: 0.90,
  latencyWarningMs: 500,
  latencyCriticalMs: 2000,
  errorRateWarning: 0.05,
  errorRateCritical: 0.15,
  offlineAfterFailures: 3,
  degradedAfterFailures: 1,
};

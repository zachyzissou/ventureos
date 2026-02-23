/**
 * Health & Diagnostics — Phase 5.6
 *
 * Public API for the health monitoring system.
 * Import from this module to integrate with the tactical map.
 */

// Core types
export type {
  HealthStatus,
  ConnectivityStatus,
  AlertSeverity,
  AlertState,
  PerformanceMetrics,
  MetricsSample,
  AgentHealthState,
  SystemHealthState,
  HealthState,
  HealthAlert,
  HealthThresholds,
  RawAgentHealth,
  RawMetricsSample,
  RawHealthSnapshot,
  RawHealthEvent,
} from './types';

export { DEFAULT_HEALTH_THRESHOLDS } from './types';

// State management
export {
  createEmptyHealthState,
  computeHealthStatus,
  computeConnectivity,
  computeSystemHealth,
  applyHealthSnapshot,
  applyAgentHealthUpdate,
  addHealthAlert,
  resolveAlertsForAgent,
  expireAlerts,
} from './state';
export type { HistoryConfig } from './state';

// Metrics
export {
  extractMetricSeries,
  computeAgentMetricsSummary,
  computeAllMetricsSummaries,
  computeHealthScore,
  computeSystemHealthScore,
  formatCpu,
  formatMemory,
  formatLatency,
  formatRps,
  formatErrorRate,
  formatUptime,
} from './metrics';
export type { SparklineData, AgentMetricsSummary } from './metrics';

// Alerts
export { HealthAlertManager } from './alerts';
export type { AlertManagerConfig } from './alerts';

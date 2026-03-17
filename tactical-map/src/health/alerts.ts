/**
 * Health Alert Manager — Phase 5.6
 *
 * Evaluates agent health states and generates P0/P1 alerts.
 * Handles deduplication, cooldowns, and auto-resolution.
 */

import type { AgentId } from '@/config';
import { AGENT_DISPLAY_NAMES, AGENT_ORDER } from '@/config';
import type {
  AgentHealthState,
  AlertSeverity,
  HealthAlert,
  HealthState,
  HealthThresholds,
} from './types';
import { DEFAULT_HEALTH_THRESHOLDS } from './types';

export interface AlertManagerConfig {
  /** Cooldown between repeated alerts for same agent+metric (ms). */
  cooldownMs: number;
  /** P0 alert auto-dismiss TTL (ms). 0 = never. */
  p0TtlMs: number;
  /** P1 alert auto-dismiss TTL (ms). */
  p1TtlMs: number;
  /** Health thresholds. */
  thresholds: HealthThresholds;
}

const DEFAULT_ALERT_CONFIG: AlertManagerConfig = {
  cooldownMs: 60_000,
  p0TtlMs: 0,
  p1TtlMs: 120_000,
  thresholds: DEFAULT_HEALTH_THRESHOLDS,
};

type CooldownKey = string;

function makeCooldownKey(agentId: string, metric: string, severity: AlertSeverity): CooldownKey {
  return `${agentId}:${metric}:${severity}`;
}

function agentLabel(id: string): string {
  return AGENT_DISPLAY_NAMES[id as AgentId] ?? id;
}

export class HealthAlertManager {
  private readonly config: AlertManagerConfig;
  private readonly cooldowns = new Map<CooldownKey, number>();

  constructor(config: Partial<AlertManagerConfig> = {}) {
    this.config = { ...DEFAULT_ALERT_CONFIG, ...config };
  }

  /**
   * Evaluate a health state and return new alerts to add.
   * Does NOT mutate the state — caller applies via addHealthAlert().
   */
  evaluate(state: HealthState, nowMs: number = Date.now()): HealthAlert[] {
    const alerts: HealthAlert[] = [];
    const { thresholds } = this.config;

    for (const id of AGENT_ORDER) {
      const agent = state.agents[id];
      if (!agent) continue;

      // CPU alerts
      if (agent.metrics.cpuUsage >= thresholds.cpuCritical) {
        this.maybeAlert(alerts, id, 'cpu', 'P0', agent.metrics.cpuUsage, thresholds.cpuCritical,
          `${agentLabel(id)} CPU critical (${pct(agent.metrics.cpuUsage)})`, nowMs);
      } else if (agent.metrics.cpuUsage >= thresholds.cpuWarning) {
        this.maybeAlert(alerts, id, 'cpu', 'P1', agent.metrics.cpuUsage, thresholds.cpuWarning,
          `${agentLabel(id)} CPU elevated (${pct(agent.metrics.cpuUsage)})`, nowMs);
      }

      // Memory alerts
      if (agent.metrics.memoryUsage >= thresholds.memoryCritical) {
        this.maybeAlert(alerts, id, 'memory', 'P0', agent.metrics.memoryUsage, thresholds.memoryCritical,
          `${agentLabel(id)} memory critical (${pct(agent.metrics.memoryUsage)})`, nowMs);
      } else if (agent.metrics.memoryUsage >= thresholds.memoryWarning) {
        this.maybeAlert(alerts, id, 'memory', 'P1', agent.metrics.memoryUsage, thresholds.memoryWarning,
          `${agentLabel(id)} memory elevated (${pct(agent.metrics.memoryUsage)})`, nowMs);
      }

      // Latency alerts
      if (agent.metrics.latencyMs >= thresholds.latencyCriticalMs) {
        this.maybeAlert(alerts, id, 'latency', 'P0', agent.metrics.latencyMs, thresholds.latencyCriticalMs,
          `${agentLabel(id)} latency critical (${Math.round(agent.metrics.latencyMs)}ms)`, nowMs);
      } else if (agent.metrics.latencyMs >= thresholds.latencyWarningMs) {
        this.maybeAlert(alerts, id, 'latency', 'P1', agent.metrics.latencyMs, thresholds.latencyWarningMs,
          `${agentLabel(id)} latency elevated (${Math.round(agent.metrics.latencyMs)}ms)`, nowMs);
      }

      // Error rate alerts
      if (agent.metrics.errorRate >= thresholds.errorRateCritical) {
        this.maybeAlert(alerts, id, 'errorRate', 'P0', agent.metrics.errorRate, thresholds.errorRateCritical,
          `${agentLabel(id)} error rate critical (${pct(agent.metrics.errorRate)})`, nowMs);
      } else if (agent.metrics.errorRate >= thresholds.errorRateWarning) {
        this.maybeAlert(alerts, id, 'errorRate', 'P1', agent.metrics.errorRate, thresholds.errorRateWarning,
          `${agentLabel(id)} error rate elevated (${pct(agent.metrics.errorRate)})`, nowMs);
      }

      // Connectivity alerts
      if (agent.connectivity === 'offline') {
        this.maybeAlert(alerts, id, 'connectivity', 'P0', agent.consecutiveFailures, thresholds.offlineAfterFailures,
          `${agentLabel(id)} is OFFLINE (${agent.consecutiveFailures} failures)`, nowMs);
      } else if (agent.connectivity === 'degraded') {
        this.maybeAlert(alerts, id, 'connectivity', 'P1', agent.consecutiveFailures, thresholds.degradedAfterFailures,
          `${agentLabel(id)} connectivity degraded`, nowMs);
      }
    }

    return alerts;
  }

  /**
   * Check if enough agents are unhealthy for a system-wide alert.
   */
  evaluateSystemAlerts(state: HealthState, nowMs: number = Date.now()): HealthAlert[] {
    const alerts: HealthAlert[] = [];
    const redCount = state.system.statusCounts.red;
    const offlineCount = state.system.connectivitySummary.offline;

    if (redCount >= 3) {
      this.maybeSystemAlert(alerts, 'status', 'P0',
        `System degraded: ${redCount} agents in RED status`, nowMs);
    } else if (redCount >= 1) {
      this.maybeSystemAlert(alerts, 'status', 'P1',
        `${redCount} agent(s) in RED status`, nowMs);
    }

    if (offlineCount >= 2) {
      this.maybeSystemAlert(alerts, 'connectivity', 'P0',
        `Multiple agents OFFLINE (${offlineCount})`, nowMs);
    } else if (offlineCount >= 1) {
      this.maybeSystemAlert(alerts, 'connectivity', 'P1',
        `${offlineCount} agent(s) OFFLINE`, nowMs);
    }

    return alerts;
  }

  private maybeAlert(
    alerts: HealthAlert[],
    agentId: AgentId,
    metric: string,
    severity: AlertSeverity,
    value: number,
    threshold: number,
    message: string,
    nowMs: number
  ): void {
    const key = makeCooldownKey(agentId, metric, severity);
    const lastTriggered = this.cooldowns.get(key);

    if (lastTriggered !== undefined && nowMs - lastTriggered < this.config.cooldownMs) return;

    this.cooldowns.set(key, nowMs);
    alerts.push({
      id: `health:${agentId}:${metric}:${nowMs}`,
      severity,
      state: 'active',
      agentId,
      title: severity === 'P0' ? '🔴 Critical Alert' : '🟡 Warning',
      message,
      metric,
      value,
      threshold,
      createdAt: nowMs,
      ttlMs: severity === 'P0' ? this.config.p0TtlMs : this.config.p1TtlMs,
    });
  }

  private maybeSystemAlert(
    alerts: HealthAlert[],
    metric: string,
    severity: AlertSeverity,
    message: string,
    nowMs: number
  ): void {
    const key = makeCooldownKey('system', metric, severity);
    const lastTriggered = this.cooldowns.get(key);

    if (lastTriggered !== undefined && nowMs - lastTriggered < this.config.cooldownMs) return;

    this.cooldowns.set(key, nowMs);
    alerts.push({
      id: `health:system:${metric}:${nowMs}`,
      severity,
      state: 'active',
      agentId: 'system',
      title: severity === 'P0' ? '🔴 System Critical' : '🟡 System Warning',
      message,
      metric,
      createdAt: nowMs,
      ttlMs: severity === 'P0' ? this.config.p0TtlMs : this.config.p1TtlMs,
    });
  }

  /** Reset all cooldowns (useful for testing). */
  reset(): void {
    this.cooldowns.clear();
  }
}

function pct(v: number): string {
  return `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
}

export const __test = { makeCooldownKey, agentLabel, pct };

import { describe, it, expect } from 'vitest';
import {
  computeHealthStatus,
  computeConnectivity,
  computeSystemHealth,
  createEmptyHealthState,
  applyHealthSnapshot,
  applyAgentHealthUpdate,
  addHealthAlert,
  resolveAlertsForAgent,
  expireAlerts,
  __test,
} from '@/health/state';
import type { HealthState, PerformanceMetrics, HealthAlert, RawHealthSnapshot, RawAgentHealth } from '@/health/types';
import { DEFAULT_HEALTH_THRESHOLDS } from '@/health/types';

const { parseMetricsSample, parsePerformanceMetrics, normalizeHealthStatus, normalizeConnectivity, trimHistory, coerceNumber, coerceTimestamp } = __test;

// ═══════════════════════════════════════════
// parseMetricsSample
// ═══════════════════════════════════════════

describe('parseMetricsSample', () => {
  it('parses a fully populated sample', () => {
    const result = parseMetricsSample({
      ts: 1000,
      cpu: 0.5,
      memory: 0.7,
      latency: 120,
      rps: 45,
      errorRate: 0.02,
    });
    expect(result.ts).toBe(1000);
    expect(result.cpuUsage).toBe(0.5);
    expect(result.memoryUsage).toBe(0.7);
    expect(result.latencyMs).toBe(120);
    expect(result.requestsPerSec).toBe(45);
    expect(result.errorRate).toBe(0.02);
  });

  it('uses alternate field names', () => {
    const result = parseMetricsSample({
      cpuUsage: 0.3,
      memoryUsage: 0.4,
      latencyMs: 200,
      requestsPerSec: 10,
    });
    expect(result.cpuUsage).toBe(0.3);
    expect(result.memoryUsage).toBe(0.4);
    expect(result.latencyMs).toBe(200);
    expect(result.requestsPerSec).toBe(10);
  });

  it('clamps values to valid ranges', () => {
    const result = parseMetricsSample({
      cpu: 1.5,
      memory: -0.2,
      latency: -10,
      rps: -5,
      errorRate: 2.0,
    });
    expect(result.cpuUsage).toBe(1); // clamped to 1
    expect(result.memoryUsage).toBe(0); // clamped to 0
    expect(result.latencyMs).toBe(0); // floored to 0
    expect(result.requestsPerSec).toBe(0); // floored to 0
    expect(result.errorRate).toBe(1); // clamped to 1
  });

  it('defaults missing fields', () => {
    const result = parseMetricsSample({});
    expect(result.cpuUsage).toBe(0);
    expect(result.memoryUsage).toBe(0);
    expect(result.latencyMs).toBe(0);
    expect(result.requestsPerSec).toBe(0);
    expect(result.errorRate).toBe(0);
  });
});

// ═══════════════════════════════════════════
// parsePerformanceMetrics
// ═══════════════════════════════════════════

describe('parsePerformanceMetrics', () => {
  it('parses full metrics from raw agent health', () => {
    const result = parsePerformanceMetrics({
      cpu: 0.6,
      memory: 0.8,
      latency: 150,
      rps: 30,
      errorRate: 0.01,
      uptime: 3600,
    });
    expect(result.cpuUsage).toBe(0.6);
    expect(result.memoryUsage).toBe(0.8);
    expect(result.latencyMs).toBe(150);
    expect(result.requestsPerSec).toBe(30);
    expect(result.errorRate).toBe(0.01);
    expect(result.uptimeSec).toBe(3600);
  });

  it('uses alternate field names', () => {
    const result = parsePerformanceMetrics({
      cpuUsage: 0.4,
      memoryUsage: 0.5,
      latencyMs: 200,
      requestsPerSec: 20,
      uptimeSec: 7200,
    });
    expect(result.cpuUsage).toBe(0.4);
    expect(result.latencyMs).toBe(200);
    expect(result.uptimeSec).toBe(7200);
  });
});

// ═══════════════════════════════════════════
// normalizeHealthStatus / normalizeConnectivity
// ═══════════════════════════════════════════

describe('normalizeHealthStatus', () => {
  it('normalizes known values', () => {
    expect(normalizeHealthStatus('green')).toBe('green');
    expect(normalizeHealthStatus('yellow')).toBe('yellow');
    expect(normalizeHealthStatus('red')).toBe('red');
    expect(normalizeHealthStatus('warning')).toBe('yellow');
    expect(normalizeHealthStatus('critical')).toBe('red');
    expect(normalizeHealthStatus('error')).toBe('red');
    expect(normalizeHealthStatus('degraded')).toBe('yellow');
  });

  it('defaults to green for unknown values', () => {
    expect(normalizeHealthStatus(undefined)).toBe('green');
    expect(normalizeHealthStatus('')).toBe('green');
    expect(normalizeHealthStatus('bogus')).toBe('green');
  });
});

describe('normalizeConnectivity', () => {
  it('normalizes known values', () => {
    expect(normalizeConnectivity('online')).toBe('online');
    expect(normalizeConnectivity('offline')).toBe('offline');
    expect(normalizeConnectivity('degraded')).toBe('degraded');
  });

  it('defaults to online', () => {
    expect(normalizeConnectivity(undefined)).toBe('online');
    expect(normalizeConnectivity('')).toBe('online');
  });
});

// ═══════════════════════════════════════════
// coerceNumber / coerceTimestamp
// ═══════════════════════════════════════════

describe('coerceNumber', () => {
  it('returns finite numbers', () => {
    expect(coerceNumber(42, 0)).toBe(42);
    expect(coerceNumber(0, 1)).toBe(0);
    expect(coerceNumber(-5, 0)).toBe(-5);
  });

  it('returns fallback for non-numbers', () => {
    expect(coerceNumber(undefined, 99)).toBe(99);
    expect(coerceNumber(null, 99)).toBe(99);
    expect(coerceNumber('hello', 99)).toBe(99);
    expect(coerceNumber(NaN, 99)).toBe(99);
    expect(coerceNumber(Infinity, 99)).toBe(99);
  });
});

describe('coerceTimestamp', () => {
  it('accepts positive numbers', () => {
    expect(coerceTimestamp(1000)).toBe(1000);
  });

  it('parses ISO strings', () => {
    const result = coerceTimestamp('2026-01-01T00:00:00Z');
    expect(result).toBeGreaterThan(0);
    expect(Number.isFinite(result)).toBe(true);
  });

  it('returns Date.now() for invalid values', () => {
    const before = Date.now();
    const result = coerceTimestamp('not-a-date');
    const after = Date.now();
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });
});

// ═══════════════════════════════════════════
// computeHealthStatus
// ═══════════════════════════════════════════

describe('computeHealthStatus', () => {
  function makeMetrics(overrides: Partial<PerformanceMetrics> = {}): PerformanceMetrics {
    return {
      cpuUsage: 0,
      memoryUsage: 0,
      latencyMs: 0,
      requestsPerSec: 0,
      errorRate: 0,
      uptimeSec: 0,
      ...overrides,
    };
  }

  it('returns green for healthy metrics', () => {
    expect(computeHealthStatus(makeMetrics({ cpuUsage: 0.3, memoryUsage: 0.4 }))).toBe('green');
  });

  it('returns yellow for warning-level CPU', () => {
    expect(computeHealthStatus(makeMetrics({ cpuUsage: 0.75 }))).toBe('yellow');
  });

  it('returns red for critical CPU', () => {
    expect(computeHealthStatus(makeMetrics({ cpuUsage: 0.95 }))).toBe('red');
  });

  it('returns yellow for warning-level memory', () => {
    expect(computeHealthStatus(makeMetrics({ memoryUsage: 0.80 }))).toBe('yellow');
  });

  it('returns red for critical memory', () => {
    expect(computeHealthStatus(makeMetrics({ memoryUsage: 0.95 }))).toBe('red');
  });

  it('returns yellow for elevated latency', () => {
    expect(computeHealthStatus(makeMetrics({ latencyMs: 600 }))).toBe('yellow');
  });

  it('returns red for critical latency', () => {
    expect(computeHealthStatus(makeMetrics({ latencyMs: 3000 }))).toBe('red');
  });

  it('returns yellow for elevated error rate', () => {
    expect(computeHealthStatus(makeMetrics({ errorRate: 0.08 }))).toBe('yellow');
  });

  it('returns red for critical error rate', () => {
    expect(computeHealthStatus(makeMetrics({ errorRate: 0.20 }))).toBe('red');
  });

  it('returns worst status across metrics', () => {
    // CPU = yellow, error = red → overall red
    expect(computeHealthStatus(makeMetrics({ cpuUsage: 0.75, errorRate: 0.20 }))).toBe('red');
  });

  it('uses custom thresholds', () => {
    const custom = { ...DEFAULT_HEALTH_THRESHOLDS, cpuWarning: 0.50 };
    expect(computeHealthStatus(makeMetrics({ cpuUsage: 0.55 }), custom)).toBe('yellow');
  });
});

// ═══════════════════════════════════════════
// computeConnectivity
// ═══════════════════════════════════════════

describe('computeConnectivity', () => {
  it('returns online for 0 failures', () => {
    expect(computeConnectivity(0)).toBe('online');
  });

  it('returns degraded for 1+ failures', () => {
    expect(computeConnectivity(1)).toBe('degraded');
  });

  it('returns offline for 3+ failures', () => {
    expect(computeConnectivity(3)).toBe('offline');
    expect(computeConnectivity(10)).toBe('offline');
  });
});

// ═══════════════════════════════════════════
// createEmptyHealthState
// ═══════════════════════════════════════════

describe('createEmptyHealthState', () => {
  it('creates state for all 8 agents', () => {
    const state = createEmptyHealthState();
    expect(Object.keys(state.agents)).toHaveLength(8);
    expect(state.agents.venture_research.agentId).toBe('venture_research');
    expect(state.agents.venture_control.status).toBe('green');
  });

  it('has empty alerts', () => {
    const state = createEmptyHealthState();
    expect(state.alerts).toHaveLength(0);
  });

  it('system shows all green', () => {
    const state = createEmptyHealthState();
    expect(state.system.overallStatus).toBe('green');
    expect(state.system.statusCounts.green).toBe(8);
  });
});

// ═══════════════════════════════════════════
// computeSystemHealth
// ═══════════════════════════════════════════

describe('computeSystemHealth', () => {
  it('shows green when all agents are green', () => {
    const state = createEmptyHealthState();
    const sys = computeSystemHealth(state.agents);
    expect(sys.overallStatus).toBe('green');
    expect(sys.statusCounts.green).toBe(8);
  });

  it('shows yellow when any agent is yellow', () => {
    const state = createEmptyHealthState();
    state.agents.venture_research = { ...state.agents.venture_research, status: 'yellow' };
    const sys = computeSystemHealth(state.agents);
    expect(sys.overallStatus).toBe('yellow');
    expect(sys.statusCounts.yellow).toBe(1);
  });

  it('shows red when any agent is red', () => {
    const state = createEmptyHealthState();
    state.agents.venture_infrastructure = { ...state.agents.venture_infrastructure, status: 'red' };
    const sys = computeSystemHealth(state.agents);
    expect(sys.overallStatus).toBe('red');
    expect(sys.statusCounts.red).toBe(1);
  });

  it('aggregates metrics correctly', () => {
    const state = createEmptyHealthState();
    state.agents.venture_research = {
      ...state.agents.venture_research,
      metrics: { cpuUsage: 0.8, memoryUsage: 0.5, latencyMs: 100, requestsPerSec: 10, errorRate: 0.01, uptimeSec: 3600 },
    };
    const sys = computeSystemHealth(state.agents);
    expect(sys.aggregateMetrics.cpuUsage).toBe(0.1); // 0.8 / 8
    expect(sys.aggregateMetrics.requestsPerSec).toBe(10); // summed, not averaged
  });
});

// ═══════════════════════════════════════════
// applyHealthSnapshot
// ═══════════════════════════════════════════

describe('applyHealthSnapshot', () => {
  it('updates agent health from snapshot', () => {
    const state = createEmptyHealthState();
    const snapshot: RawHealthSnapshot = {
      agents: {
        venture_research: { cpu: 0.5, memory: 0.6, latency: 100, rps: 20, errorRate: 0.01, uptime: 3600 },
      },
    };

    const next = applyHealthSnapshot(state, snapshot, undefined, undefined, 5000);
    expect(next.agents.venture_research.metrics.cpuUsage).toBe(0.5);
    expect(next.agents.venture_research.metrics.memoryUsage).toBe(0.6);
    expect(next.agents.venture_research.metrics.latencyMs).toBe(100);
    expect(next.updatedAt).toBe(5000);
  });

  it('computes status from metrics when not provided', () => {
    const state = createEmptyHealthState();
    const snapshot: RawHealthSnapshot = {
      agents: {
        venture_security: { cpu: 0.95, memory: 0.5 },
      },
    };

    const next = applyHealthSnapshot(state, snapshot);
    expect(next.agents.venture_security.status).toBe('red');
  });

  it('uses server-provided status', () => {
    const state = createEmptyHealthState();
    const snapshot: RawHealthSnapshot = {
      agents: {
        venture_security: { status: 'yellow', cpu: 0.3 },
      },
    };

    const next = applyHealthSnapshot(state, snapshot);
    expect(next.agents.venture_security.status).toBe('yellow');
  });

  it('updates system health after snapshot', () => {
    const state = createEmptyHealthState();
    const snapshot: RawHealthSnapshot = {
      agents: {
        venture_research: { cpu: 0.95 }, // red
        venture_infrastructure: { cpu: 0.5 },   // green
      },
    };

    const next = applyHealthSnapshot(state, snapshot);
    expect(next.system.overallStatus).toBe('red');
    expect(next.system.statusCounts.red).toBe(1);
  });

  it('preserves existing alerts', () => {
    const state = createEmptyHealthState();
    const alert: HealthAlert = {
      id: 'test-1',
      severity: 'P0',
      state: 'active',
      agentId: 'venture_research',
      title: 'Test',
      message: 'Test alert',
      createdAt: 1000,
      ttlMs: 0,
    };
    const stateWithAlert = addHealthAlert(state, alert);

    const next = applyHealthSnapshot(stateWithAlert, { agents: {} });
    expect(next.alerts).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════
// applyAgentHealthUpdate
// ═══════════════════════════════════════════

describe('applyAgentHealthUpdate', () => {
  it('updates a single agent', () => {
    const state = createEmptyHealthState();
    const update: RawAgentHealth = {
      agentId: 'venture_infrastructure',
      cpu: 0.7,
      memory: 0.4,
      latency: 50,
    };

    const next = applyAgentHealthUpdate(state, update);
    expect(next.agents.venture_infrastructure.metrics.cpuUsage).toBe(0.7);
    expect(next.agents.venture_research.metrics.cpuUsage).toBe(0); // unchanged
  });

  it('ignores unknown agent IDs', () => {
    const state = createEmptyHealthState();
    const update: RawAgentHealth = { agentId: 'unknown-agent' };
    const next = applyAgentHealthUpdate(state, update);
    expect(next).toBe(state);
  });

  it('appends to history', () => {
    const state = createEmptyHealthState();
    const next = applyAgentHealthUpdate(state, { agentId: 'venture_research', cpu: 0.5 }, undefined, undefined, 1000);
    expect(next.agents.venture_research.history.length).toBeGreaterThan(0);
    const next2 = applyAgentHealthUpdate(next, { agentId: 'venture_research', cpu: 0.6 }, undefined, undefined, 2000);
    expect(next2.agents.venture_research.history.length).toBe(next.agents.venture_research.history.length + 1);
  });
});

// ═══════════════════════════════════════════
// addHealthAlert / resolveAlertsForAgent / expireAlerts
// ═══════════════════════════════════════════

describe('alert management', () => {
  function makeAlert(overrides: Partial<HealthAlert> = {}): HealthAlert {
    return {
      id: `alert-${Date.now()}`,
      severity: 'P1',
      state: 'active',
      agentId: 'venture_research',
      title: 'Test',
      message: 'Test alert',
      createdAt: Date.now(),
      ttlMs: 0,
      ...overrides,
    };
  }

  it('adds an alert', () => {
    const state = createEmptyHealthState();
    const alert = makeAlert({ id: 'a1' });
    const next = addHealthAlert(state, alert);
    expect(next.alerts).toHaveLength(1);
    expect(next.alerts[0].id).toBe('a1');
  });

  it('deduplicates identical active alerts', () => {
    const state = createEmptyHealthState();
    const alert = makeAlert({ id: 'a1', metric: 'cpu', severity: 'P0' });
    const s1 = addHealthAlert(state, alert);
    const alert2 = makeAlert({ id: 'a2', metric: 'cpu', severity: 'P0' });
    const s2 = addHealthAlert(s1, alert2);
    expect(s2.alerts).toHaveLength(1); // deduplicated
  });

  it('allows different metrics', () => {
    const state = createEmptyHealthState();
    const s1 = addHealthAlert(state, makeAlert({ id: 'a1', metric: 'cpu' }));
    const s2 = addHealthAlert(s1, makeAlert({ id: 'a2', metric: 'memory' }));
    expect(s2.alerts).toHaveLength(2);
  });

  it('resolves alerts for an agent', () => {
    const state = createEmptyHealthState();
    const s1 = addHealthAlert(state, makeAlert({ id: 'a1', agentId: 'venture_research' }));
    const s2 = addHealthAlert(s1, makeAlert({ id: 'a2', agentId: 'venture_infrastructure', metric: 'memory' }));

    const resolved = resolveAlertsForAgent(s2, 'venture_research', 5000);
    expect(resolved.alerts.find((a) => a.id === 'a1')?.state).toBe('resolved');
    expect(resolved.alerts.find((a) => a.id === 'a2')?.state).toBe('active');
  });

  it('expires resolved alerts after 30s', () => {
    const now = 100_000;
    const state = createEmptyHealthState();
    const alert = makeAlert({ id: 'a1', state: 'resolved', resolvedAt: now - 31_000, createdAt: now - 60_000 });
    const s1 = { ...state, alerts: [alert] };
    const expired = expireAlerts(s1, now);
    expect(expired.alerts).toHaveLength(0);
  });

  it('keeps recently resolved alerts', () => {
    const now = 100_000;
    const state = createEmptyHealthState();
    const alert = makeAlert({ id: 'a1', state: 'resolved', resolvedAt: now - 10_000, createdAt: now - 60_000 });
    const s1 = { ...state, alerts: [alert] };
    const expired = expireAlerts(s1, now);
    expect(expired.alerts).toHaveLength(1);
  });

  it('expires active alerts past TTL', () => {
    const now = 100_000;
    const state = createEmptyHealthState();
    const alert = makeAlert({ id: 'a1', state: 'active', createdAt: now - 200_000, ttlMs: 120_000 });
    const s1 = { ...state, alerts: [alert] };
    const expired = expireAlerts(s1, now);
    expect(expired.alerts).toHaveLength(0);
  });

  it('caps alerts at 50', () => {
    let state = createEmptyHealthState();
    for (let i = 0; i < 55; i++) {
      state = addHealthAlert(state, makeAlert({
        id: `a${i}`,
        metric: `metric-${i}`, // unique to avoid dedup
        createdAt: i * 1000,
      }));
    }
    expect(state.alerts.length).toBeLessThanOrEqual(50);
  });
});

// ═══════════════════════════════════════════
// trimHistory
// ═══════════════════════════════════════════

describe('trimHistory', () => {
  it('trims history beyond max points', () => {
    const history = Array.from({ length: 100 }, (_, i) => ({
      ts: i * 1000,
      cpuUsage: 0,
      memoryUsage: 0,
      latencyMs: 0,
      requestsPerSec: 0,
      errorRate: 0,
    }));

    const trimmed = trimHistory(history, { maxPoints: 50, maxAgeMs: Infinity });
    expect(trimmed).toHaveLength(50);
    // Should keep the most recent 50
    expect(trimmed[0].ts).toBe(50_000);
  });

  it('trims history beyond max age', () => {
    const now = 200_000;
    const history = Array.from({ length: 20 }, (_, i) => ({
      ts: i * 10_000,
      cpuUsage: 0,
      memoryUsage: 0,
      latencyMs: 0,
      requestsPerSec: 0,
      errorRate: 0,
    }));

    const trimmed = trimHistory(history, { maxPoints: 100, maxAgeMs: 100_000 }, now);
    // Only samples from ts >= 100_000 should remain
    expect(trimmed.every((s) => s.ts >= 100_000)).toBe(true);
  });
});

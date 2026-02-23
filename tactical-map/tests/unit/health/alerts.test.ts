import { describe, it, expect, beforeEach } from 'vitest';
import { HealthAlertManager, __test } from '@/health/alerts';
import { createEmptyHealthState, applyHealthSnapshot } from '@/health/state';
import type { HealthState, RawHealthSnapshot } from '@/health/types';
import { DEFAULT_HEALTH_THRESHOLDS } from '@/health/types';

const { makeCooldownKey, agentLabel, pct } = __test;

// ═══════════════════════════════════════════
// Helper utilities
// ═══════════════════════════════════════════

describe('helper utilities', () => {
  describe('makeCooldownKey', () => {
    it('creates a composite key', () => {
      expect(makeCooldownKey('oracle', 'cpu', 'P0')).toBe('oracle:cpu:P0');
    });
  });

  describe('agentLabel', () => {
    it('capitalizes first letter', () => {
      expect(agentLabel('oracle')).toBe('Oracle');
      expect(agentLabel('atlas')).toBe('Atlas');
    });
  });

  describe('pct', () => {
    it('formats ratio as percentage', () => {
      expect(pct(0.5)).toBe('50%');
      expect(pct(0.956)).toBe('96%');
    });

    it('clamps to 0-100', () => {
      expect(pct(-0.2)).toBe('0%');
      expect(pct(1.5)).toBe('100%');
    });
  });
});

// ═══════════════════════════════════════════
// HealthAlertManager
// ═══════════════════════════════════════════

describe('HealthAlertManager', () => {
  let manager: HealthAlertManager;

  beforeEach(() => {
    manager = new HealthAlertManager({ cooldownMs: 60_000 });
  });

  function stateWithCpu(agentId: string, cpuUsage: number): HealthState {
    const state = createEmptyHealthState();
    const snapshot: RawHealthSnapshot = {
      agents: { [agentId]: { cpu: cpuUsage } },
    };
    return applyHealthSnapshot(state, snapshot);
  }

  function stateWithMultipleMetrics(
    agentId: string,
    overrides: { cpu?: number; memory?: number; latency?: number; errorRate?: number; consecutiveFailures?: number }
  ): HealthState {
    const state = createEmptyHealthState();
    const snapshot: RawHealthSnapshot = {
      agents: {
        [agentId]: {
          cpu: overrides.cpu ?? 0,
          memory: overrides.memory ?? 0,
          latency: overrides.latency ?? 0,
          errorRate: overrides.errorRate ?? 0,
          consecutiveFailures: overrides.consecutiveFailures ?? 0,
        },
      },
    };
    return applyHealthSnapshot(state, snapshot);
  }

  // ─── CPU alerts ───

  it('generates P0 for critical CPU', () => {
    const state = stateWithCpu('oracle', 0.95);
    const alerts = manager.evaluate(state, 1000);
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    const cpuAlert = alerts.find((a) => a.metric === 'cpu');
    expect(cpuAlert).toBeDefined();
    expect(cpuAlert!.severity).toBe('P0');
    expect(cpuAlert!.agentId).toBe('oracle');
  });

  it('generates P1 for warning CPU', () => {
    const state = stateWithCpu('oracle', 0.75);
    const alerts = manager.evaluate(state, 1000);
    const cpuAlert = alerts.find((a) => a.metric === 'cpu');
    expect(cpuAlert).toBeDefined();
    expect(cpuAlert!.severity).toBe('P1');
  });

  it('generates no alerts for healthy CPU', () => {
    const state = stateWithCpu('oracle', 0.3);
    const alerts = manager.evaluate(state, 1000);
    const cpuAlert = alerts.find((a) => a.metric === 'cpu');
    expect(cpuAlert).toBeUndefined();
  });

  // ─── Memory alerts ───

  it('generates P0 for critical memory', () => {
    const state = stateWithMultipleMetrics('atlas', { memory: 0.95 });
    const alerts = manager.evaluate(state, 1000);
    const memAlert = alerts.find((a) => a.metric === 'memory');
    expect(memAlert).toBeDefined();
    expect(memAlert!.severity).toBe('P0');
  });

  it('generates P1 for warning memory', () => {
    const state = stateWithMultipleMetrics('atlas', { memory: 0.80 });
    const alerts = manager.evaluate(state, 1000);
    const memAlert = alerts.find((a) => a.metric === 'memory');
    expect(memAlert).toBeDefined();
    expect(memAlert!.severity).toBe('P1');
  });

  // ─── Latency alerts ───

  it('generates P0 for critical latency', () => {
    const state = stateWithMultipleMetrics('sentinel', { latency: 3000 });
    const alerts = manager.evaluate(state, 1000);
    const latAlert = alerts.find((a) => a.metric === 'latency');
    expect(latAlert).toBeDefined();
    expect(latAlert!.severity).toBe('P0');
  });

  it('generates P1 for warning latency', () => {
    const state = stateWithMultipleMetrics('sentinel', { latency: 600 });
    const alerts = manager.evaluate(state, 1000);
    const latAlert = alerts.find((a) => a.metric === 'latency');
    expect(latAlert).toBeDefined();
    expect(latAlert!.severity).toBe('P1');
  });

  // ─── Error rate alerts ───

  it('generates P0 for critical error rate', () => {
    const state = stateWithMultipleMetrics('verifier', { errorRate: 0.20 });
    const alerts = manager.evaluate(state, 1000);
    const errAlert = alerts.find((a) => a.metric === 'errorRate');
    expect(errAlert).toBeDefined();
    expect(errAlert!.severity).toBe('P0');
  });

  // ─── Connectivity alerts ───

  it('generates P0 for offline agent', () => {
    const state = stateWithMultipleMetrics('synth', { consecutiveFailures: 5 });
    const alerts = manager.evaluate(state, 1000);
    const connAlert = alerts.find((a) => a.metric === 'connectivity');
    expect(connAlert).toBeDefined();
    expect(connAlert!.severity).toBe('P0');
  });

  it('generates P1 for degraded connectivity', () => {
    const state = stateWithMultipleMetrics('synth', { consecutiveFailures: 1 });
    const alerts = manager.evaluate(state, 1000);
    const connAlert = alerts.find((a) => a.metric === 'connectivity');
    expect(connAlert).toBeDefined();
    expect(connAlert!.severity).toBe('P1');
  });

  // ─── Cooldowns ───

  it('respects cooldown period', () => {
    const state = stateWithCpu('oracle', 0.95);

    const alerts1 = manager.evaluate(state, 1000);
    expect(alerts1.length).toBeGreaterThan(0);

    // Same evaluation within cooldown — should get nothing
    const alerts2 = manager.evaluate(state, 2000);
    expect(alerts2.filter((a) => a.metric === 'cpu')).toHaveLength(0);
  });

  it('triggers again after cooldown expires', () => {
    const state = stateWithCpu('oracle', 0.95);

    const alerts1 = manager.evaluate(state, 1000);
    expect(alerts1.length).toBeGreaterThan(0);

    // After cooldown (60_000ms)
    const alerts2 = manager.evaluate(state, 62_000);
    expect(alerts2.filter((a) => a.metric === 'cpu').length).toBeGreaterThan(0);
  });

  it('resets cooldowns', () => {
    const state = stateWithCpu('oracle', 0.95);
    manager.evaluate(state, 1000);
    manager.reset();

    const alerts = manager.evaluate(state, 2000);
    expect(alerts.filter((a) => a.metric === 'cpu').length).toBeGreaterThan(0);
  });

  // ─── System alerts ───

  it('generates system P1 alert when 1 agent is red', () => {
    const state = createEmptyHealthState();
    state.agents.oracle = { ...state.agents.oracle, status: 'red' };
    state.system.statusCounts = { green: 7, yellow: 0, red: 1 };

    const alerts = manager.evaluateSystemAlerts(state, 1000);
    const sysAlert = alerts.find((a) => a.agentId === 'system');
    expect(sysAlert).toBeDefined();
    expect(sysAlert!.severity).toBe('P1');
  });

  it('generates system P0 alert when 3+ agents are red', () => {
    const state = createEmptyHealthState();
    state.agents.oracle = { ...state.agents.oracle, status: 'red' };
    state.agents.atlas = { ...state.agents.atlas, status: 'red' };
    state.agents.sentinel = { ...state.agents.sentinel, status: 'red' };
    state.system.statusCounts = { green: 5, yellow: 0, red: 3 };

    const alerts = manager.evaluateSystemAlerts(state, 1000);
    const sysAlert = alerts.find((a) => a.agentId === 'system' && a.severity === 'P0');
    expect(sysAlert).toBeDefined();
  });

  it('generates system P0 for multiple offline agents', () => {
    const state = createEmptyHealthState();
    state.system.connectivitySummary = { online: 6, offline: 2, degraded: 0 };

    const alerts = manager.evaluateSystemAlerts(state, 1000);
    const connAlert = alerts.find((a) => a.metric === 'connectivity' && a.severity === 'P0');
    expect(connAlert).toBeDefined();
  });

  // ─── Multi-agent evaluation ───

  it('generates alerts for multiple agents simultaneously', () => {
    const state = createEmptyHealthState();
    const snapshot: RawHealthSnapshot = {
      agents: {
        oracle: { cpu: 0.95 },
        atlas: { memory: 0.95 },
        sentinel: { errorRate: 0.20 },
      },
    };
    const next = applyHealthSnapshot(state, snapshot);
    const alerts = manager.evaluate(next, 1000);

    const oracleAlerts = alerts.filter((a) => a.agentId === 'oracle');
    const atlasAlerts = alerts.filter((a) => a.agentId === 'atlas');
    const sentinelAlerts = alerts.filter((a) => a.agentId === 'sentinel');

    expect(oracleAlerts.length).toBeGreaterThan(0);
    expect(atlasAlerts.length).toBeGreaterThan(0);
    expect(sentinelAlerts.length).toBeGreaterThan(0);
  });

  // ─── Alert content ───

  it('includes descriptive message', () => {
    const state = stateWithCpu('oracle', 0.95);
    const alerts = manager.evaluate(state, 1000);
    const cpuAlert = alerts.find((a) => a.metric === 'cpu');
    expect(cpuAlert!.message).toContain('Oracle');
    expect(cpuAlert!.message).toContain('CPU');
    expect(cpuAlert!.message).toContain('critical');
  });

  it('includes metric value and threshold', () => {
    const state = stateWithCpu('oracle', 0.95);
    const alerts = manager.evaluate(state, 1000);
    const cpuAlert = alerts.find((a) => a.metric === 'cpu');
    expect(cpuAlert!.value).toBe(0.95);
    expect(cpuAlert!.threshold).toBe(DEFAULT_HEALTH_THRESHOLDS.cpuCritical);
  });

  it('sets correct TTL', () => {
    const mgr = new HealthAlertManager({ p0TtlMs: 0, p1TtlMs: 120_000 });
    const state = stateWithCpu('oracle', 0.95);
    const alerts = mgr.evaluate(state, 1000);
    const p0 = alerts.find((a) => a.severity === 'P0');
    expect(p0!.ttlMs).toBe(0); // P0 never auto-dismisses
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBridgeTelemetryBuilder } from '../../server/bridge-live-telemetry.js';

describe('bridge-live-telemetry', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds snapshots and respects cache windows for cost/usage providers', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-21T00:00:00Z'));

    let costCalls = 0;
    let usageCalls = 0;

    const buildSnapshot = createBridgeTelemetryBuilder({
      sessDir: '/tmp/sessions',
      cronFile: '/tmp/jobs.json',
      getAllowedSessionIds: () => new Set(['s-1']),
      getSessionsJson: () => [
        { sessionId: 's-1', updatedAt: Date.now(), aborted: false },
        { sessionId: 's-2', updatedAt: Date.now() - 400_000, aborted: false },
      ],
      getVentureosAgents: () => ({
        agents: {
          oracle: { agentId: 'oracle', status: 'working' },
          atlas: { agentId: 'atlas', status: 'idle' },
        },
      }),
      getLatestKpiSummary: () => ({
        date: '2026-02-21',
        successRate: 0.99,
        p95LatencyS: 10,
        sloStatus: 'ok',
      }),
      buildSystemStats: () => ({
        cpu: { usage: 12 },
        memory: { percent: 25, usedGB: '8.0', totalGB: '32.0' },
        disk: { percent: 40 },
        loadAvg: { '1m': '0.20' },
        uptime: 1000,
      }),
      buildCostData: () => {
        costCalls += 1;
        return { today: 1.23, week: 9.87 };
      },
      buildUsageWindows: () => {
        usageCalls += 1;
        return {
          current: { opusPct: 20, sonnetPct: 80, totalCost: 3.21, totalCalls: 11 },
          burnRate: { tokensPerMinute: 120, costPerMinute: 0.1 },
        };
      },
    });

    const first = buildSnapshot();
    const second = buildSnapshot();

    expect(first.type).toBe('telemetry');
    expect(first.sessions.running).toBe(1);
    expect(first.agents.busyIds).toEqual(['oracle']);
    expect(first.costs.today).toBe(1.23);
    expect(costCalls).toBe(1);
    expect(usageCalls).toBe(1);
    expect(second.costs.week).toBe(9.87);

    vi.advanceTimersByTime(10_001);
    buildSnapshot();
    expect(costCalls).toBe(1);
    expect(usageCalls).toBe(2);

    vi.advanceTimersByTime(50_000);
    buildSnapshot();
    expect(costCalls).toBe(2);
    expect(usageCalls).toBe(3);
  });
});

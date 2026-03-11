import { describe, it, expect } from 'vitest';
import {
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
} from '@/health/metrics';
import type { PerformanceMetrics, MetricsSample, AgentHealthState } from '@/health/types';
import { createEmptyHealthState } from '@/health/state';

// ═══════════════════════════════════════════
// extractMetricSeries
// ═══════════════════════════════════════════

describe('extractMetricSeries', () => {
  const history: MetricsSample[] = [
    { ts: 1000, cpuUsage: 0.2, memoryUsage: 0.3, latencyMs: 50, requestsPerSec: 10, errorRate: 0.01 },
    { ts: 2000, cpuUsage: 0.5, memoryUsage: 0.4, latencyMs: 100, requestsPerSec: 15, errorRate: 0.02 },
    { ts: 3000, cpuUsage: 0.8, memoryUsage: 0.5, latencyMs: 200, requestsPerSec: 20, errorRate: 0.05 },
  ];

  it('extracts cpuUsage series', () => {
    const data = extractMetricSeries(history, 'cpuUsage');
    expect(data.values).toEqual([0.2, 0.5, 0.8]);
    expect(data.min).toBe(0.2);
    expect(data.max).toBe(0.8);
    expect(data.current).toBe(0.8);
  });

  it('extracts latencyMs series', () => {
    const data = extractMetricSeries(history, 'latencyMs');
    expect(data.values).toEqual([50, 100, 200]);
    expect(data.min).toBe(50);
    expect(data.max).toBe(200);
    expect(data.current).toBe(200);
  });

  it('handles empty history', () => {
    const data = extractMetricSeries([], 'cpuUsage');
    expect(data.values).toEqual([]);
    expect(data.min).toBe(0);
    expect(data.max).toBe(0);
    expect(data.current).toBe(0);
  });

  it('handles single-element history', () => {
    const data = extractMetricSeries([history[0]], 'errorRate');
    expect(data.values).toEqual([0.01]);
    expect(data.min).toBe(0.01);
    expect(data.max).toBe(0.01);
    expect(data.current).toBe(0.01);
  });
});

// ═══════════════════════════════════════════
// computeAgentMetricsSummary
// ═══════════════════════════════════════════

describe('computeAgentMetricsSummary', () => {
  it('returns summaries for all metric types', () => {
    const agent: AgentHealthState = {
      agentId: 'oracle',
      status: 'green',
      connectivity: 'online',
      metrics: { cpuUsage: 0.5, memoryUsage: 0.4, latencyMs: 100, requestsPerSec: 20, errorRate: 0.01, uptimeSec: 3600 },
      history: [
        { ts: 1000, cpuUsage: 0.3, memoryUsage: 0.3, latencyMs: 50, requestsPerSec: 10, errorRate: 0 },
        { ts: 2000, cpuUsage: 0.5, memoryUsage: 0.4, latencyMs: 100, requestsPerSec: 20, errorRate: 0.01 },
      ],
      lastCheckAt: 2000,
      consecutiveFailures: 0,
      errors: [],
      updatedAt: 2000,
    };

    const summary = computeAgentMetricsSummary(agent);
    expect(summary.agentId).toBe('oracle');
    expect(summary.cpu.values).toHaveLength(2);
    expect(summary.memory.values).toHaveLength(2);
    expect(summary.latency.values).toHaveLength(2);
    expect(summary.rps.values).toHaveLength(2);
    expect(summary.errorRate.values).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════
// computeAllMetricsSummaries
// ═══════════════════════════════════════════

describe('computeAllMetricsSummaries', () => {
  it('returns summaries for all 8 agents', () => {
    const state = createEmptyHealthState();
    const summaries = computeAllMetricsSummaries(state);
    expect(Object.keys(summaries)).toHaveLength(8);
    expect(summaries.oracle).toBeDefined();
    expect(summaries.nexus).toBeDefined();
  });
});

// ═══════════════════════════════════════════
// computeHealthScore
// ═══════════════════════════════════════════

describe('computeHealthScore', () => {
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

  it('returns 100 for perfect metrics', () => {
    expect(computeHealthScore(makeMetrics())).toBe(100);
  });

  it('returns 0 for worst-case metrics', () => {
    const score = computeHealthScore(makeMetrics({
      cpuUsage: 1.0,
      memoryUsage: 1.0,
      latencyMs: 2000,
      errorRate: 0.20,
    }));
    expect(score).toBe(0);
  });

  it('returns intermediate scores for mixed metrics', () => {
    const score = computeHealthScore(makeMetrics({ cpuUsage: 0.5 }));
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });

  it('weighs error rate heavily', () => {
    const errorScore = computeHealthScore(makeMetrics({ errorRate: 0.10 }));
    const cpuScore = computeHealthScore(makeMetrics({ cpuUsage: 0.50 }));
    // Error rate has 0.30 weight vs CPU 0.25
    expect(errorScore).toBeLessThan(cpuScore);
  });
});

// ═══════════════════════════════════════════
// computeSystemHealthScore
// ═══════════════════════════════════════════

describe('computeSystemHealthScore', () => {
  it('returns 100 for empty state', () => {
    const state = createEmptyHealthState();
    expect(computeSystemHealthScore(state)).toBe(100);
  });

  it('averages across all agents', () => {
    const state = createEmptyHealthState();
    // Set one agent to worst case
    state.agents.oracle.metrics = {
      cpuUsage: 1.0,
      memoryUsage: 1.0,
      latencyMs: 2000,
      requestsPerSec: 0,
      errorRate: 0.20,
      uptimeSec: 0,
    };
    const score = computeSystemHealthScore(state);
    // 7 agents at 100 + 1 at 0 = 700 / 8 = 87.5 → rounds to 88
    expect(score).toBe(88);
  });
});

// ═══════════════════════════════════════════
// Format functions
// ═══════════════════════════════════════════

describe('format functions', () => {
  describe('formatCpu', () => {
    it('formats as percentage', () => {
      expect(formatCpu(0.5)).toBe('50%');
      expect(formatCpu(0)).toBe('0%');
      expect(formatCpu(1)).toBe('100%');
    });

    it('clamps values', () => {
      expect(formatCpu(1.5)).toBe('100%');
      expect(formatCpu(-0.2)).toBe('0%');
    });
  });

  describe('formatMemory', () => {
    it('formats as percentage', () => {
      expect(formatMemory(0.75)).toBe('75%');
    });
  });

  describe('formatLatency', () => {
    it('formats sub-ms', () => {
      expect(formatLatency(0.5)).toBe('<1ms');
    });

    it('formats ms', () => {
      expect(formatLatency(150)).toBe('150ms');
    });

    it('formats seconds', () => {
      expect(formatLatency(1500)).toBe('1.5s');
    });
  });

  describe('formatRps', () => {
    it('formats low values with decimal', () => {
      expect(formatRps(0.5)).toBe('0.5/s');
    });

    it('formats normal values', () => {
      expect(formatRps(42)).toBe('42/s');
    });

    it('formats high values with k suffix', () => {
      expect(formatRps(1500)).toBe('1.5k/s');
    });
  });

  describe('formatErrorRate', () => {
    it('formats as percentage with decimal', () => {
      expect(formatErrorRate(0.05)).toBe('5.0%');
      expect(formatErrorRate(0)).toBe('0.0%');
    });
  });

  describe('formatUptime', () => {
    it('formats seconds', () => {
      expect(formatUptime(45)).toBe('45s');
    });

    it('formats minutes', () => {
      expect(formatUptime(300)).toBe('5m');
    });

    it('formats hours', () => {
      expect(formatUptime(7200)).toBe('2.0h');
    });

    it('formats days', () => {
      expect(formatUptime(172800)).toBe('2.0d');
    });
  });
});

/**
 * Diagnostics Client Tests — Issue #205
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createDiagnosticsClient,
  __test,
} from '@/data/diagnostics-client';
import type { RawDiagnosticsResponse } from '@/data/diagnostics-client';

const { transformDiagnostics, toNumber } = __test;

describe('toNumber', () => {
  it('returns number for valid number', () => {
    expect(toNumber(42, 0)).toBe(42);
  });

  it('returns fallback for NaN', () => {
    expect(toNumber(NaN, 99)).toBe(99);
  });

  it('returns fallback for null', () => {
    expect(toNumber(null, 5)).toBe(5);
  });

  it('returns fallback for undefined', () => {
    expect(toNumber(undefined, 5)).toBe(5);
  });

  it('returns fallback for string', () => {
    expect(toNumber('abc', 5)).toBe(5);
  });

  it('returns fallback for Infinity', () => {
    expect(toNumber(Infinity, 5)).toBe(5);
  });
});

describe('transformDiagnostics', () => {
  const rawResponse: RawDiagnosticsResponse = {
    agentId: 'oracle',
    now: Date.now(),
    healthScore: 85,
    sessionCount: 10,
    abortedCount: 2,
    successRate: 0.8,
    recentSessions: [
      { key: 'sess-1', label: 'Main', updatedAt: Date.now(), aborted: false },
    ],
    metricsHistory: [
      { ts: 1, cpuUsage: 0.3, memoryUsage: 0.5, latencyMs: 100, requestsPerSec: 5, errorRate: 0.01 },
      { ts: 2, cpuUsage: 0.4, memoryUsage: 0.55, latencyMs: 120, requestsPerSec: 6, errorRate: 0 },
    ],
    recentErrors: [
      { ts: Date.now(), level: 'error', message: 'timeout', sessionKey: 'sess-1' },
    ],
    alerts: [
      { id: 'a1', severity: 'P1', title: 'CPU Warning', message: 'CPU high', metric: 'cpuUsage', value: 0.75, threshold: 0.70, createdAt: Date.now() },
    ],
  };

  it('transforms basic fields', () => {
    const data = transformDiagnostics(rawResponse, 'oracle');
    expect(data.agentId).toBe('oracle');
    expect(data.healthScore).toBe(85);
    expect(data.sessionCount).toBe(10);
    expect(data.abortedCount).toBe(2);
    expect(data.successRate).toBe(0.8);
  });

  it('transforms metrics history into arrays', () => {
    const data = transformDiagnostics(rawResponse, 'oracle');
    expect(data.metricsHistory.cpuUsage).toEqual([0.3, 0.4]);
    expect(data.metricsHistory.memoryUsage).toEqual([0.5, 0.55]);
    expect(data.metricsHistory.latencyMs).toEqual([100, 120]);
    expect(data.metricsHistory.errorRate).toEqual([0.01, 0]);
  });

  it('transforms errors', () => {
    const data = transformDiagnostics(rawResponse, 'oracle');
    expect(data.recentErrors).toHaveLength(1);
    expect(data.recentErrors[0].message).toBe('timeout');
    expect(data.recentErrors[0].level).toBe('error');
  });

  it('transforms alerts', () => {
    const data = transformDiagnostics(rawResponse, 'oracle');
    expect(data.alerts).toHaveLength(1);
    expect(data.alerts[0].severity).toBe('P1');
    expect(data.alerts[0].title).toBe('CPU Warning');
  });

  it('handles empty response', () => {
    const data = transformDiagnostics({}, 'oracle');
    expect(data.agentId).toBe('oracle');
    expect(data.healthScore).toBe(0);
    expect(data.sessionCount).toBe(0);
    expect(data.metricsHistory.cpuUsage).toEqual([]);
    expect(data.recentErrors).toEqual([]);
    expect(data.alerts).toEqual([]);
  });

  it('handles null successRate', () => {
    const data = transformDiagnostics({ ...rawResponse, successRate: null }, 'oracle');
    expect(data.successRate).toBeNull();
  });

  it('defaults invalid severity to P1', () => {
    const data = transformDiagnostics({
      ...rawResponse,
      alerts: [{ severity: 'P3', title: 'Unknown', message: 'Test' } as any],
    }, 'oracle');
    expect(data.alerts[0].severity).toBe('P1');
  });
});

describe('createDiagnosticsClient', () => {
  it('creates client with fetch method', () => {
    const client = createDiagnosticsClient();
    expect(typeof client.fetch).toBe('function');
  });

  it('fetch calls the API with correct URL', async () => {
    const mockFetchJson = vi.fn().mockResolvedValue({
      agentId: 'oracle',
      healthScore: 90,
      sessionCount: 5,
      metricsHistory: [],
      recentErrors: [],
      alerts: [],
    });

    const client = createDiagnosticsClient(
      { baseUrl: 'http://test/api/agent-health' },
      { fetchJson: mockFetchJson, getAuthToken: () => null },
    );

    const data = await client.fetch('oracle');
    expect(mockFetchJson).toHaveBeenCalledWith(
      'http://test/api/agent-health/oracle/diagnostics',
      expect.any(Object),
    );
    expect(data.agentId).toBe('oracle');
  });

  it('passes auth token when available', async () => {
    const mockFetchJson = vi.fn().mockResolvedValue({
      metricsHistory: [],
      recentErrors: [],
      alerts: [],
    });

    const client = createDiagnosticsClient(
      { baseUrl: 'http://test/api/agent-health' },
      { fetchJson: mockFetchJson, getAuthToken: () => 'my-token' },
    );

    await client.fetch('oracle');
    expect(mockFetchJson).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { Authorization: 'Bearer my-token' },
      }),
    );
  });

  it('calls onData callback', async () => {
    const onData = vi.fn();
    const mockFetchJson = vi.fn().mockResolvedValue({
      metricsHistory: [],
      recentErrors: [],
      alerts: [],
    });

    const client = createDiagnosticsClient(
      { onData, baseUrl: 'http://test/api/agent-health' },
      { fetchJson: mockFetchJson, getAuthToken: () => null },
    );

    await client.fetch('oracle');
    expect(onData).toHaveBeenCalledTimes(1);
  });

  it('calls onError on fetch failure', async () => {
    const onError = vi.fn();
    const mockFetchJson = vi.fn().mockRejectedValue(new Error('network'));

    const client = createDiagnosticsClient(
      { onError, baseUrl: 'http://test/api/agent-health' },
      { fetchJson: mockFetchJson, getAuthToken: () => null },
    );

    await expect(client.fetch('oracle')).rejects.toThrow('network');
  });
});

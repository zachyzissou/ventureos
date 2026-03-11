import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHealthClient, __test } from '@/data/health-client';
import type { RawHealthSnapshot, RawAgentHealth } from '@/health/types';

const { buildWebSocketUrl, reconnectDelayMs, parseHealthEvent, HEALTH_POLL_INTERVAL } = __test;

// ═══════════════════════════════════════════
// buildWebSocketUrl
// ═══════════════════════════════════════════

describe('buildWebSocketUrl', () => {
  it('builds a ws:// URL with token', () => {
    const url = buildWebSocketUrl('/api/tactical-map/health/stream', 'abc123');
    expect(url).toContain('ws');
    expect(url).toContain('/api/tactical-map/health/stream');
    expect(url).toContain('token=abc123');
  });

  it('builds URL without token', () => {
    const url = buildWebSocketUrl('/api/tactical-map/health/stream', null);
    expect(url).toContain('/api/tactical-map/health/stream');
    expect(url).not.toContain('token=');
  });
});

// ═══════════════════════════════════════════
// reconnectDelayMs
// ═══════════════════════════════════════════

describe('reconnectDelayMs', () => {
  it('returns base delay on first attempt', () => {
    const delay = reconnectDelayMs(0, 0.5);
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThan(5000);
  });

  it('increases with attempts (exponential backoff)', () => {
    const d0 = reconnectDelayMs(0, 0.5);
    const d1 = reconnectDelayMs(1, 0.5);
    const d2 = reconnectDelayMs(2, 0.5);
    expect(d1).toBeGreaterThan(d0);
    expect(d2).toBeGreaterThan(d1);
  });

  it('caps at max delay', () => {
    const delay = reconnectDelayMs(20, 0.5);
    expect(delay).toBeLessThanOrEqual(30_000 * 1.2); // max * jitter
  });

  it('applies jitter', () => {
    const d1 = reconnectDelayMs(0, 0.0);
    const d2 = reconnectDelayMs(0, 1.0);
    expect(d1).not.toBe(d2);
  });
});

// ═══════════════════════════════════════════
// parseHealthEvent
// ═══════════════════════════════════════════

describe('parseHealthEvent', () => {
  it('parses snapshot events', () => {
    const event = parseHealthEvent({
      type: 'snapshot',
      snapshot: { agents: {} },
    });
    expect(event.type).toBe('snapshot');
    expect(event.snapshot).toBeDefined();
  });

  it('parses health_snapshot events', () => {
    const event = parseHealthEvent({
      type: 'health_snapshot',
      data: { agents: {} },
    });
    expect(event.type).toBe('snapshot');
  });

  it('parses agent_update events', () => {
    const event = parseHealthEvent({
      type: 'agent_update',
      agent: { agentId: 'oracle', cpu: 0.5 },
    });
    expect(event.type).toBe('agent_update');
    expect(event.agent).toBeDefined();
  });

  it('parses agent_health events', () => {
    const event = parseHealthEvent({
      type: 'agent_health',
      data: { agentId: 'atlas' },
    });
    expect(event.type).toBe('agent_update');
  });

  it('parses alert events', () => {
    const event = parseHealthEvent({
      type: 'alert',
      alert: { id: 'a1', severity: 'P0' },
    });
    expect(event.type).toBe('alert');
    expect(event.alert).toBeDefined();
  });

  it('parses heartbeat events', () => {
    const event = parseHealthEvent({ type: 'heartbeat' });
    expect(event.type).toBe('heartbeat');
  });

  it('parses ping events', () => {
    const event = parseHealthEvent({ type: 'ping' });
    expect(event.type).toBe('heartbeat');
  });

  it('returns unknown for unrecognized events', () => {
    const event = parseHealthEvent({ type: 'something_else' });
    expect(event.type).toBe('unknown');
  });

  it('returns unknown for null/undefined', () => {
    expect(parseHealthEvent(null).type).toBe('unknown');
    expect(parseHealthEvent(undefined).type).toBe('unknown');
  });

  it('returns unknown for non-objects', () => {
    expect(parseHealthEvent('hello').type).toBe('unknown');
    expect(parseHealthEvent(42).type).toBe('unknown');
  });
});

// ═══════════════════════════════════════════
// createHealthClient
// ═══════════════════════════════════════════

describe('createHealthClient', () => {
  let timers: Map<number, { fn: () => void; ms: number }>;
  let nextTimerId: number;

  function createMockScheduler() {
    timers = new Map();
    nextTimerId = 1;

    return {
      setTimeout: (fn: () => void, ms: number) => {
        const id = nextTimerId++;
        timers.set(id, { fn, ms });
        return id as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeout: (id: ReturnType<typeof setTimeout>) => {
        timers.delete(id as unknown as number);
      },
    };
  }

  it('starts and stops without errors', () => {
    const scheduler = createMockScheduler();
    const client = createHealthClient(
      {
        onSnapshot: vi.fn(),
        onAgentUpdate: vi.fn(),
        onAlert: vi.fn(),
      },
      scheduler,
      {
        fetchJson: vi.fn().mockResolvedValue({ agents: {} }),
        getAuthToken: () => null,
        WebSocketImpl: undefined,
        random: () => 0.5,
        now: () => 1000,
      }
    );

    client.start();
    expect(client.isConnected()).toBe(false); // No WS impl

    client.stop();
  });

  it('calls fetchSnapshot on start', async () => {
    const scheduler = createMockScheduler();
    const onSnapshot = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue({ agents: {} });

    const client = createHealthClient(
      {
        onSnapshot,
        onAgentUpdate: vi.fn(),
        onAlert: vi.fn(),
      },
      scheduler,
      {
        fetchJson: mockFetch,
        getAuthToken: () => null,
        WebSocketImpl: undefined,
        random: () => 0.5,
        now: () => 1000,
      }
    );

    client.start();

    // Wait for the initial fetch
    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  it('schedules periodic polling', async () => {
    const scheduler = createMockScheduler();
    const mockFetch = vi.fn().mockResolvedValue({ agents: {} });

    const client = createHealthClient(
      {
        onSnapshot: vi.fn(),
        onAgentUpdate: vi.fn(),
        onAlert: vi.fn(),
      },
      scheduler,
      {
        fetchJson: mockFetch,
        getAuthToken: () => null,
        WebSocketImpl: undefined,
        random: () => 0.5,
        now: () => 1000,
      }
    );

    client.start();

    // Should have a timer scheduled for polling
    await vi.waitFor(() => {
      expect(timers.size).toBeGreaterThan(0);
    });

    // Find the poll timer
    const pollTimer = [...timers.values()].find((t) => t.ms === HEALTH_POLL_INTERVAL);
    expect(pollTimer).toBeDefined();

    client.stop();
  });

  it('clears timers on stop', async () => {
    const scheduler = createMockScheduler();

    const client = createHealthClient(
      {
        onSnapshot: vi.fn(),
        onAgentUpdate: vi.fn(),
        onAlert: vi.fn(),
      },
      scheduler,
      {
        fetchJson: vi.fn().mockResolvedValue({ agents: {} }),
        getAuthToken: () => null,
        WebSocketImpl: undefined,
        random: () => 0.5,
        now: () => 1000,
      }
    );

    client.start();
    await vi.waitFor(() => expect(timers.size).toBeGreaterThan(0));

    client.stop();
    expect(timers.size).toBe(0);
  });

  it('uses auth token in fetch requests', async () => {
    const scheduler = createMockScheduler();
    const mockFetch = vi.fn().mockResolvedValue({ agents: {} });

    const client = createHealthClient(
      {
        onSnapshot: vi.fn(),
        onAgentUpdate: vi.fn(),
        onAlert: vi.fn(),
      },
      scheduler,
      {
        fetchJson: mockFetch,
        getAuthToken: () => 'my-token',
        WebSocketImpl: undefined,
        random: () => 0.5,
        now: () => 1000,
      }
    );

    await client.fetchSnapshot();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-token',
        }),
      })
    );
  });

  it('calls onError when fetch fails', async () => {
    const scheduler = createMockScheduler();
    const onError = vi.fn();

    const client = createHealthClient(
      {
        onSnapshot: vi.fn(),
        onAgentUpdate: vi.fn(),
        onAlert: vi.fn(),
        onError,
      },
      scheduler,
      {
        fetchJson: vi.fn().mockRejectedValue(new Error('Network error')),
        getAuthToken: () => null,
        WebSocketImpl: undefined,
        random: () => 0.5,
        now: () => 1000,
      }
    );

    client.start();

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });

    client.stop();
  });

  it('does not start twice', () => {
    const scheduler = createMockScheduler();
    const mockFetch = vi.fn().mockResolvedValue({ agents: {} });

    const client = createHealthClient(
      {
        onSnapshot: vi.fn(),
        onAgentUpdate: vi.fn(),
        onAlert: vi.fn(),
      },
      scheduler,
      {
        fetchJson: mockFetch,
        getAuthToken: () => null,
        WebSocketImpl: undefined,
        random: () => 0.5,
        now: () => 1000,
      }
    );

    client.start();
    client.start(); // second call is no-op
    // Should only have called fetch once for the initial fetch
    expect(mockFetch).toHaveBeenCalledTimes(1);

    client.stop();
  });
});

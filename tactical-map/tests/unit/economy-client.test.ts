import { describe, it, expect, vi } from 'vitest';
import { API } from '@/config';
import { createEconomyClient } from '@/data/economy-client';

class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = MockWebSocket.OPEN;
  sent: string[] = [];

  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = 3;
    this.onclose?.({});
  }

  emitOpen() {
    this.onopen?.({});
  }

  emitMessage(msg: unknown) {
    const data = typeof msg === 'string' ? msg : JSON.stringify(msg);
    this.onmessage?.({ data });
  }

  emitClose() {
    this.readyState = 3;
    this.onclose?.({});
  }
}

describe('data/economy-client', () => {
  it('fetches initial snapshot and handles websocket updates', async () => {
    MockWebSocket.instances = [];

    const scheduled: Array<{ fn: () => void; ms: number }> = [];
    const scheduler = {
      setTimeout: vi.fn((fn: () => void, ms: number) => {
        scheduled.push({ fn, ms });
        return scheduled.length;
      }),
      clearTimeout: vi.fn((_id: number) => void 0)
    };

    const snapshots: unknown[] = [];
    const agentUpdates: unknown[] = [];
    const poolUpdates: unknown[] = [];
    const connection: boolean[] = [];

    const client = createEconomyClient(
      {
        onSnapshot: (s) => snapshots.push(s),
        onAgentUpdate: (a) => agentUpdates.push(a),
        onPoolUpdate: (p) => poolUpdates.push(p),
        onConnectionChange: (v) => connection.push(v)
      },
      scheduler,
      {
        fetchJson: vi.fn(async () => ({ updatedAt: 'now', agents: {} })),
        getAuthToken: () => 'abc',
        WebSocketImpl: MockWebSocket as unknown as typeof WebSocket,
        random: () => 0,
        now: () => 123
      }
    );

    client.start();
    await Promise.resolve();

    expect(snapshots.length).toBe(1);
    expect(MockWebSocket.instances.length).toBe(1);

    const ws = MockWebSocket.instances[0];
    ws.emitOpen();
    expect(connection.at(-1)).toBe(true);
    expect(ws.sent.some((x) => x.includes('subscribe'))).toBe(true);

    ws.emitMessage({ type: 'agent_update', data: { agentId: 'venture_research', tokenBudget: 100 } });
    ws.emitMessage({ type: 'economy.pool', data: { tokenQuotaTotal: 1000 } });
    ws.emitMessage({ type: 'heartbeat' });

    expect(agentUpdates.length).toBe(1);
    expect(poolUpdates.length).toBe(1);
    expect(ws.sent.some((x) => x.includes('pong'))).toBe(true);

    ws.emitClose();
    expect(connection.at(-1)).toBe(false);

    // reconnect + fallback poll both schedule timers
    expect(scheduled.some((t) => t.ms === API.REALTIME_FALLBACK_POLL_MS)).toBe(true);
    expect(scheduled.some((t) => t.ms === Math.round(API.WS_RECONNECT_BASE_MS * 0.8))).toBe(true);

    client.stop();
  });
});

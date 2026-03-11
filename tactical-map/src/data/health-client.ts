/**
 * Health Check API Client — Phase 5.6
 *
 * Polls the health check endpoint and manages WebSocket connection
 * for real-time health events. Follows the economy-client pattern.
 */

import { API } from '@/config';
import type { RawAgentHealth, RawHealthEvent, RawHealthSnapshot } from '@/health/types';
import { fetchJson, getAuthToken } from '@/utils/fetch';

export type HealthClientOptions = {
  onSnapshot: (snapshot: RawHealthSnapshot) => void;
  onAgentUpdate: (agent: RawAgentHealth) => void;
  onAlert: (alert: RawHealthEvent['alert']) => void;
  onConnectionChange?: (connected: boolean) => void;
  onError?: (error: unknown) => void;
  /** Override the health endpoint URL. */
  healthUrl?: string;
  /** Override the WebSocket URL. */
  websocketUrl?: string;
};

export type HealthClient = {
  start: () => void;
  stop: () => void;
  fetchSnapshot: () => Promise<RawHealthSnapshot>;
  isConnected: () => boolean;
};

type TimeoutId = ReturnType<typeof setTimeout>;

type Scheduler = {
  setTimeout: (fn: () => void, ms: number) => TimeoutId;
  clearTimeout: (id: TimeoutId) => void;
};

type Deps = {
  fetchJson: typeof fetchJson;
  getAuthToken: typeof getAuthToken;
  WebSocketImpl?: typeof WebSocket;
  random: () => number;
  now: () => number;
};

const DEFAULT_SCHEDULER: Scheduler = {
  setTimeout: (fn: () => void, ms: number) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id: TimeoutId) => globalThis.clearTimeout(id),
};

const DEFAULT_DEPS: Deps = {
  fetchJson,
  getAuthToken,
  WebSocketImpl: typeof WebSocket !== 'undefined' ? WebSocket : undefined,
  random: () => Math.random(),
  now: () => Date.now(),
};

const HEALTH_BASE_URL = `${API.BASE_URL}/health`;
const HEALTH_WS_URL = `${API.BASE_URL}/health/stream`;
const HEALTH_POLL_INTERVAL = 10_000; // 10s per requirements
const WS_RECONNECT_BASE_MS = 2_000;
const WS_RECONNECT_MAX_MS = 30_000;

function buildWebSocketUrl(basePath: string, token: string | null): string {
  const hasLocation = typeof location !== 'undefined';
  const protocol = hasLocation && location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = hasLocation ? location.host : 'localhost';
  const url = new URL(basePath, `${protocol}//${host}`);
  if (token) url.searchParams.set('token', token);
  return url.toString();
}

function reconnectDelayMs(attempt: number, rand: number): number {
  const base = Math.min(WS_RECONNECT_BASE_MS * 2 ** Math.max(0, attempt), WS_RECONNECT_MAX_MS);
  const jitter = 0.8 + rand * 0.4;
  return Math.round(base * jitter);
}

function parseHealthEvent(raw: unknown): {
  type: 'snapshot' | 'agent_update' | 'alert' | 'heartbeat' | 'unknown';
  snapshot?: RawHealthSnapshot;
  agent?: RawAgentHealth;
  alert?: RawHealthEvent['alert'];
} {
  if (!raw || typeof raw !== 'object') return { type: 'unknown' };

  const obj = raw as Record<string, unknown>;
  const type = typeof obj.type === 'string' ? obj.type.toLowerCase() : '';

  if (type === 'snapshot' || type === 'health_snapshot') {
    return {
      type: 'snapshot',
      snapshot: (obj.snapshot ?? obj.data ?? obj) as RawHealthSnapshot,
    };
  }

  if (type === 'agent_update' || type === 'agent_health') {
    return {
      type: 'agent_update',
      agent: (obj.agent ?? obj.data) as RawAgentHealth,
    };
  }

  if (type === 'alert' || type === 'health_alert') {
    return {
      type: 'alert',
      alert: (obj.alert ?? obj.data) as RawHealthEvent['alert'],
    };
  }

  if (type === 'heartbeat' || type === 'ping') {
    return { type: 'heartbeat' };
  }

  return { type: 'unknown' };
}

export function createHealthClient(
  opts: HealthClientOptions,
  scheduler: Scheduler = DEFAULT_SCHEDULER,
  deps: Partial<Deps> = {}
): HealthClient {
  const d: Deps = { ...DEFAULT_DEPS, ...deps };

  let stopped = true;
  let connected = false;
  let ws: WebSocket | null = null;
  let pollTimer: TimeoutId | null = null;
  let reconnectTimer: TimeoutId | null = null;
  let reconnectAttempt = 0;

  const healthUrl = opts.healthUrl ?? HEALTH_BASE_URL;

  async function fetchSnapshot(): Promise<RawHealthSnapshot> {
    const token = d.getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const snapshot = await d.fetchJson<RawHealthSnapshot>(healthUrl, { headers });
    opts.onSnapshot(snapshot);
    return snapshot;
  }

  function setConnected(next: boolean) {
    if (connected === next) return;
    connected = next;
    opts.onConnectionChange?.(connected);
  }

  function clearPoll() {
    if (pollTimer == null) return;
    scheduler.clearTimeout(pollTimer);
    pollTimer = null;
  }

  function clearReconnect() {
    if (reconnectTimer == null) return;
    scheduler.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function schedulePoll() {
    if (stopped) return;
    clearPoll();

    pollTimer = scheduler.setTimeout(async () => {
      if (stopped) return;

      try {
        await fetchSnapshot();
      } catch (error) {
        opts.onError?.(error);
      } finally {
        schedulePoll();
      }
    }, HEALTH_POLL_INTERVAL);
  }

  function scheduleReconnect() {
    if (stopped) return;
    clearReconnect();

    const delay = reconnectDelayMs(reconnectAttempt, d.random());
    reconnectAttempt += 1;

    reconnectTimer = scheduler.setTimeout(() => {
      if (!stopped) connectSocket();
    }, delay);
  }

  function handleMessage(raw: string) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      const event = parseHealthEvent(parsed);

      switch (event.type) {
        case 'snapshot':
          if (event.snapshot) opts.onSnapshot(event.snapshot);
          break;
        case 'agent_update':
          if (event.agent) opts.onAgentUpdate(event.agent);
          break;
        case 'alert':
          if (event.alert) opts.onAlert(event.alert);
          break;
        case 'heartbeat': {
          const openState = d.WebSocketImpl?.OPEN ?? 1;
          if (ws && ws.readyState === openState) {
            ws.send(JSON.stringify({ type: 'pong', ts: d.now() }));
          }
          break;
        }
        default:
          break;
      }
    } catch (error) {
      opts.onError?.(error);
    }
  }

  function connectSocket() {
    if (stopped) return;
    if (!d.WebSocketImpl) {
      // No WebSocket available; rely on polling
      schedulePoll();
      return;
    }

    const token = d.getAuthToken();
    const wsUrl = opts.websocketUrl ?? buildWebSocketUrl(HEALTH_WS_URL, token);

    ws = new d.WebSocketImpl(wsUrl);

    ws.onopen = () => {
      reconnectAttempt = 0;
      setConnected(true);

      ws?.send(JSON.stringify({ type: 'subscribe', topic: 'health' }));
    };

    ws.onmessage = (evt) => {
      const data = typeof evt.data === 'string' ? evt.data : String(evt.data ?? '');
      handleMessage(data);
    };

    ws.onerror = (evt) => {
      opts.onError?.(evt);
    };

    ws.onclose = () => {
      setConnected(false);
      ws = null;
      scheduleReconnect();
    };
  }

  function start() {
    if (!stopped) return;
    stopped = false;

    // Initial fetch + start polling
    void fetchSnapshot().catch((error) => {
      opts.onError?.(error);
    });

    schedulePoll();
    connectSocket();
  }

  function stop() {
    stopped = true;
    clearPoll();
    clearReconnect();
    setConnected(false);

    if (ws) {
      const socket = ws;
      ws = null;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.close();
    }
  }

  return {
    start,
    stop,
    fetchSnapshot,
    isConnected: () => connected,
  };
}

export const __test = {
  buildWebSocketUrl,
  reconnectDelayMs,
  parseHealthEvent,
  HEALTH_POLL_INTERVAL,
};

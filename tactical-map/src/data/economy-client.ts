import { API } from '@/config';
import { parseEconomyEvent } from '@/economy/state';
import type { RawAgentEconomy, RawEconomySnapshot, RawPoolEconomy } from '@/economy/types';
import { fetchJson, getAuthToken } from '@/utils/fetch';

export type EconomyClientOptions = {
  onSnapshot: (snapshot: RawEconomySnapshot) => void;
  onAgentUpdate: (agent: RawAgentEconomy) => void;
  onPoolUpdate: (pool: RawPoolEconomy) => void;
  onConnectionChange?: (connected: boolean) => void;
  onError?: (error: unknown) => void;
  websocketUrl?: string;
};

export type EconomyClient = {
  start: () => void;
  stop: () => void;
  fetchSnapshot: () => Promise<RawEconomySnapshot>;
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
  now: () => Date.now()
};

function buildWebSocketUrl(basePath: string, token: string | null): string {
  const hasLocation = typeof location !== 'undefined';
  const protocol = hasLocation && location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = hasLocation ? location.host : 'localhost';
  const url = new URL(basePath, `${protocol}//${host}`);
  if (token) url.searchParams.set('token', token);
  return url.toString();
}

function reconnectDelayMs(attempt: number, rand: number): number {
  const base = Math.min(API.WS_RECONNECT_BASE_MS * 2 ** Math.max(0, attempt), API.WS_RECONNECT_MAX_MS);
  const jitter = 0.8 + rand * 0.4;
  return Math.round(base * jitter);
}

export function createEconomyClient(
  opts: EconomyClientOptions,
  scheduler: Scheduler = DEFAULT_SCHEDULER,
  deps: Partial<Deps> = {}
): EconomyClient {
  const d: Deps = { ...DEFAULT_DEPS, ...deps };

  let stopped = true;
  let connected = false;
  let ws: WebSocket | null = null;
  let reconnectTimer: TimeoutId | null = null;
  let fallbackPollTimer: TimeoutId | null = null;
  let reconnectAttempt = 0;

  async function fetchSnapshot(): Promise<RawEconomySnapshot> {
    const token = d.getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const snapshot = await d.fetchJson<RawEconomySnapshot>(API.RESOURCE_BASE_URL, { headers });
    opts.onSnapshot(snapshot);
    return snapshot;
  }

  function setConnected(next: boolean) {
    if (connected === next) return;
    connected = next;
    opts.onConnectionChange?.(connected);
  }

  function clearReconnect() {
    if (reconnectTimer == null) return;
    scheduler.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function clearFallbackPoll() {
    if (fallbackPollTimer == null) return;
    scheduler.clearTimeout(fallbackPollTimer);
    fallbackPollTimer = null;
  }

  function scheduleFallbackPoll() {
    if (stopped || connected) return;

    clearFallbackPoll();
    fallbackPollTimer = scheduler.setTimeout(async () => {
      if (stopped || connected) return;

      try {
        await fetchSnapshot();
      } catch (error) {
        opts.onError?.(error);
      } finally {
        scheduleFallbackPoll();
      }
    }, API.REALTIME_FALLBACK_POLL_MS);
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
      const event = parseEconomyEvent(parsed);

      switch (event.type) {
        case 'snapshot':
          opts.onSnapshot(event.snapshot);
          break;
        case 'agent_update':
          opts.onAgentUpdate(event.agent);
          break;
        case 'pool_update':
          opts.onPoolUpdate(event.pool);
          break;
        case 'heartbeat': {
          const openState = d.WebSocketImpl?.OPEN ?? 1;
          if (ws && ws.readyState === openState) {
            ws.send(JSON.stringify({ type: 'pong', ts: d.now() }));
          }
          break;
        }
        case 'unknown':
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
      scheduleFallbackPoll();
      return;
    }

    const token = d.getAuthToken();
    const wsUrl = opts.websocketUrl ?? buildWebSocketUrl(API.RESOURCE_WS_URL, token);

    ws = new d.WebSocketImpl(wsUrl);

    ws.onopen = () => {
      reconnectAttempt = 0;
      setConnected(true);
      clearFallbackPoll();

      // Optional subscribe handshake for topic-based backends.
      ws?.send(
        JSON.stringify({
          type: 'subscribe',
          topic: 'resource_economy'
        })
      );
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
      scheduleFallbackPoll();
      scheduleReconnect();
    };
  }

  function start() {
    if (!stopped) return;
    stopped = false;

    void fetchSnapshot().catch((error) => {
      opts.onError?.(error);
      scheduleFallbackPoll();
    });

    connectSocket();
  }

  function stop() {
    stopped = true;
    clearReconnect();
    clearFallbackPoll();
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
    isConnected: () => connected
  };
}

export const __test = { buildWebSocketUrl, reconnectDelayMs };

import { API, AGENT_ORDER, AGENTS } from '@/config';
import type { AgentId, Point } from '@/config';
import type { BuildingState, MapState, RpgStats } from '@/state/types';
import { fetchJson, getAuthToken } from '@/utils/fetch';

export type ApiClient = {
  start: () => void;
  stop: () => void;
  fetchOnce: () => Promise<MapState>;
  fetchRpgStats: () => Promise<RpgStats>;
};

export type ApiClientOptions = {
  onMapState: (state: MapState) => void;
  onError?: (err: unknown) => void;
};

export type TimeoutId = ReturnType<typeof setTimeout>;

export type Scheduler = {
  setTimeout: (fn: () => void, ms: number) => TimeoutId;
  clearTimeout: (id: TimeoutId) => void;
};

type TacticalMapStateResponse = {
  updatedAt?: string;
  agents?: Record<
    string,
    {
      state?: string;
      sessions?: number;
      position?: Point;
      activeSessions?: Array<{ id?: string; label?: string; startedAt?: string; estimatedMs?: number; progress?: number }>;
      paused?: boolean;
    }
  >;
};

type RpgStatsResponse = {
  stats?: Record<string, number>;
} | Record<string, number>;

function normalizeBuildingState(raw?: string): BuildingState {
  switch ((raw ?? '').toUpperCase()) {
    case 'ACTIVE':
      return 'ACTIVE';
    case 'OVERLOADED':
      return 'OVERLOADED';
    case 'ERROR':
      return 'ERROR';
    case 'IDLE':
    default:
      return 'IDLE';
  }
}

function defaultAgentPositions(): Record<AgentId, Point> {
  const out = {} as Record<AgentId, Point>;
  for (let i = 0; i < AGENT_ORDER.length; i++) {
    const id = AGENT_ORDER[i];
    // Nexus is centered; ring positions apply to the other 7 + nexus in this MVP.
    out[id] = id === 'nexus' ? { x: 0, y: 0 } : AGENTS.POSITIONS[i] ?? { x: 0, y: 0 };
  }
  return out;
}

function parseMapState(resp: TacticalMapStateResponse): MapState {
  const positions = defaultAgentPositions();
  const agents = {} as MapState['agents'];

  for (const id of AGENT_ORDER) {
    const node = resp.agents?.[id];
    agents[id] = {
      id,
      position: node?.position ?? positions[id],
      state: normalizeBuildingState(node?.state),
      sessions: node?.sessions,
      activeSessions:
        node?.activeSessions
          // Filter obvious malformed entries.
          ?.filter((s) => typeof s?.startedAt === 'string' && typeof s?.label === 'string')
          .map((s, idx) => ({
            id: (typeof s.id === 'string' && s.id) || `${id}:${idx}`,
            label: String(s.label ?? ''),
            startedAt: String(s.startedAt ?? new Date().toISOString()),
            estimatedMs: typeof s.estimatedMs === 'number' ? s.estimatedMs : undefined,
            progress: typeof s.progress === 'number' ? s.progress : undefined
          })) ?? undefined,
      paused: node?.paused === true
    };
  }

  return {
    updatedAt: resp.updatedAt ?? new Date().toISOString(),
    agents
  };
}

function parseRpgStats(resp: RpgStatsResponse): RpgStats {
  if (resp && typeof resp === 'object' && 'stats' in resp) {
    const stats = (resp as { stats?: Record<string, number> }).stats;
    return stats ?? {};
  }
  return (resp as Record<string, number>) ?? {};
}

export function createApiClient(
  opts: ApiClientOptions,
  scheduler: Scheduler = {
    setTimeout: (fn: () => void, ms: number) => globalThis.setTimeout(fn, ms),
    clearTimeout: (id: TimeoutId) => globalThis.clearTimeout(id),
  }
): ApiClient {
  let timer: TimeoutId | null = null;
  let stopped = true;
  let backoffMs = API.POLL_INTERVAL;

  async function fetchOnce(): Promise<MapState> {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const raw = await fetchJson<TacticalMapStateResponse>(`${API.BASE_URL}/state`, { headers });
    return parseMapState(raw);
  }

  async function tick() {
    if (stopped) return;

    try {
      const next = await fetchOnce();
      opts.onMapState(next);
      backoffMs = API.POLL_INTERVAL;
    } catch (err) {
      opts.onError?.(err);
      // Exponential backoff up to 2 minutes
      backoffMs = Math.min(backoffMs * 2, 120_000);
    } finally {
      if (!stopped) timer = scheduler.setTimeout(() => void tick(), backoffMs);
    }
  }

  async function fetchRpgStats(): Promise<RpgStats> {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const raw = await fetchJson<RpgStatsResponse>('/api/rpg/stats', { headers });
    return parseRpgStats(raw);
  }

  return {
    start: () => {
      if (!stopped) return;
      stopped = false;
      backoffMs = API.POLL_INTERVAL;
      void tick();
    },
    stop: () => {
      stopped = true;
      if (timer != null) scheduler.clearTimeout(timer);
      timer = null;
    },
    fetchOnce,
    fetchRpgStats
  };
}

export const __test = { parseMapState, parseRpgStats, normalizeBuildingState };

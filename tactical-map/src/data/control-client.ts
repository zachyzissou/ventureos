/**
 * Control API Client — Phase 5.7
 *
 * HTTP client for sending control actions to the backend:
 * - Pause/resume agents
 * - Spawn missions
 * - Adjust budgets
 * - Update config
 */

import { API } from '@/config';
import type { AgentId } from '@/config';
import { normalizeAgentId, toLegacyAgentId } from '@/identity';
import { fetchJson, getAuthToken } from '@/utils/fetch';
import type {
  BudgetAdjustment,
  MissionPriority,
  MissionSpawnRequest,
  MissionSpawnResult,
} from '@/interaction/types';

export type ControlClientOptions = {
  baseUrl?: string;
  onError?: (err: unknown) => void;
};

export type ControlStateSnapshot = {
  ok: boolean;
  pausedAgents?: string[];
  budgets?: Record<string, number>;
  error?: string;
};

export type PersistedMission = {
  missionId: string;
  title: string;
  description: string;
  assignee: AgentId;
  priority: MissionPriority;
  tokenBudget?: number;
  createdAt: string;
  updatedAt: string;
};

export type MissionListResult = {
  ok: boolean;
  missions?: PersistedMission[];
  error?: string;
};

export type MissionUpdateRequest = {
  title?: string;
  description?: string;
  assignee?: AgentId;
  priority?: MissionPriority;
  tokenBudget?: number;
};

export type MissionUpdateResult = {
  ok: boolean;
  missionId?: string;
  mission?: PersistedMission;
  error?: string;
};

export type ControlClient = {
  pauseAgent: (agentId: AgentId) => Promise<{ ok: boolean; error?: string }>;
  resumeAgent: (agentId: AgentId) => Promise<{ ok: boolean; error?: string }>;
  spawnMission: (req: MissionSpawnRequest) => Promise<MissionSpawnResult>;
  adjustBudget: (adj: BudgetAdjustment) => Promise<{ ok: boolean; error?: string }>;
  setMissionPriority: (
    missionId: string,
    priority: MissionPriority,
  ) => Promise<{ ok: boolean; error?: string }>;
  updateConfig: (
    agentId: AgentId,
    config: Record<string, unknown>,
  ) => Promise<{ ok: boolean; error?: string }>;
  fetchControlState: () => Promise<ControlStateSnapshot>;
  fetchMissions: () => Promise<MissionListResult>;
  updateMission: (missionId: string, updates: MissionUpdateRequest) => Promise<MissionUpdateResult>;
};

function buildAuthHeaders(includeJsonContentType = true): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (includeJsonContentType) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function resolveUrl(url: string): string {
  return url.startsWith('/')
    ? typeof location !== 'undefined'
      ? new URL(url, location.origin).toString()
      : new URL(url, 'http://localhost').toString()
    : url;
}

function requireLegacyAgentId(agentId: AgentId): string {
  const legacyId = toLegacyAgentId(agentId);
  if (!legacyId) throw new Error(`No legacy agent mapping found for ${agentId}`);
  return legacyId;
}

function normalizeMission(mission: PersistedMission): PersistedMission {
  const assignee = normalizeAgentId(mission.assignee);
  return {
    ...mission,
    assignee: assignee ?? mission.assignee,
  };
}

function normalizeControlStateSnapshot(state: ControlStateSnapshot): ControlStateSnapshot {
  const pausedAgents = (state.pausedAgents ?? [])
    .map((id) => normalizeAgentId(id) ?? id);
  const budgets = Object.fromEntries(
    Object.entries(state.budgets ?? {}).map(([id, budget]) => [normalizeAgentId(id) ?? id, budget]),
  );

  return {
    ...state,
    pausedAgents,
    budgets,
  };
}

async function postJson<T>(
  url: string,
  body: Record<string, unknown>,
): Promise<T> {
  const headers = buildAuthHeaders(true);
  const finalUrl = resolveUrl(url);

  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), API.TIMEOUT_MS);

  try {
    const res = await fetch(finalUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${text ? `: ${text}` : ''}`);
    }

    return (await res.json()) as T;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

async function getJson<T>(url: string): Promise<T> {
  const headers = buildAuthHeaders(false);
  const finalUrl = resolveUrl(url);
  return await fetchJson<T>(finalUrl, { headers });
}

export function createControlClient(opts: ControlClientOptions = {}): ControlClient {
  const base = opts.baseUrl ?? API.BASE_URL;

  async function pauseAgent(agentId: AgentId) {
    try {
      const legacyId = requireLegacyAgentId(agentId);
      return await postJson<{ ok: boolean; error?: string }>(
        `${base}/agents/${legacyId}/pause`,
        { agentId: legacyId },
      );
    } catch (err) {
      opts.onError?.(err);
      return { ok: false, error: String(err) };
    }
  }

  async function resumeAgent(agentId: AgentId) {
    try {
      const legacyId = requireLegacyAgentId(agentId);
      return await postJson<{ ok: boolean; error?: string }>(
        `${base}/agents/${legacyId}/resume`,
        { agentId: legacyId },
      );
    } catch (err) {
      opts.onError?.(err);
      return { ok: false, error: String(err) };
    }
  }

  async function spawnMission(req: MissionSpawnRequest): Promise<MissionSpawnResult> {
    try {
      const legacyAssignee = requireLegacyAgentId(req.assignee);
      return await postJson<MissionSpawnResult>(
        `${base}/missions/spawn`,
        { ...req, assignee: legacyAssignee } as unknown as Record<string, unknown>,
      );
    } catch (err) {
      opts.onError?.(err);
      return { ok: false, error: String(err) };
    }
  }

  async function adjustBudget(adj: BudgetAdjustment) {
    try {
      const legacyId = requireLegacyAgentId(adj.agentId);
      return await postJson<{ ok: boolean; error?: string }>(
        `${base}/agents/${legacyId}/budget`,
        { newBudget: adj.newBudget, previousBudget: adj.previousBudget },
      );
    } catch (err) {
      opts.onError?.(err);
      return { ok: false, error: String(err) };
    }
  }

  async function setMissionPriority(missionId: string, priority: MissionPriority) {
    try {
      return await postJson<{ ok: boolean; error?: string }>(
        `${base}/missions/${missionId}/priority`,
        { priority },
      );
    } catch (err) {
      opts.onError?.(err);
      return { ok: false, error: String(err) };
    }
  }

  async function updateConfig(agentId: AgentId, config: Record<string, unknown>) {
    try {
      const legacyId = requireLegacyAgentId(agentId);
      return await postJson<{ ok: boolean; error?: string }>(
        `${base}/agents/${legacyId}/config`,
        { config },
      );
    } catch (err) {
      opts.onError?.(err);
      return { ok: false, error: String(err) };
    }
  }

  async function fetchControlState(): Promise<ControlStateSnapshot> {
    try {
      return normalizeControlStateSnapshot(await getJson<ControlStateSnapshot>(`${base}/control-state`));
    } catch (err) {
      opts.onError?.(err);
      return { ok: false, error: String(err) };
    }
  }

  async function fetchMissions(): Promise<MissionListResult> {
    try {
      const result = await getJson<MissionListResult>(`${base}/missions`);
      return {
        ...result,
        missions: result.missions?.map(normalizeMission),
      };
    } catch (err) {
      opts.onError?.(err);
      return { ok: false, error: String(err) };
    }
  }

  async function updateMission(
    missionId: string,
    updates: MissionUpdateRequest,
  ): Promise<MissionUpdateResult> {
    try {
      const body = {
        ...updates,
        assignee: updates.assignee ? requireLegacyAgentId(updates.assignee) : undefined,
      };
      return await postJson<MissionUpdateResult>(
        `${base}/missions/${encodeURIComponent(missionId)}`,
        body as unknown as Record<string, unknown>,
      );
    } catch (err) {
      opts.onError?.(err);
      return { ok: false, error: String(err) };
    }
  }

  return {
    pauseAgent,
    resumeAgent,
    spawnMission,
    adjustBudget,
    setMissionPriority,
    updateConfig,
    fetchControlState,
    fetchMissions,
    updateMission,
  };
}

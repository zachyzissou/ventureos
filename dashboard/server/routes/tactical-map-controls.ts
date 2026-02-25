/**
 * Tactical Map Interactive Control Routes — Phase 5.7
 *
 * Handles persistence-backed control actions triggered from the tactical map UI:
 * - Pause / resume agents
 * - Spawn missions
 * - Update mission priority
 * - Adjust per-agent budgets
 * - Store per-agent config blobs
 */

import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { renderObsidianTemplateNote } from '../obsidian-note-templates.js';
import {
  DEFAULT_OBSIDIAN_MISSION_FOLDER as DEFAULT_MISSION_FOLDER,
  hasDotObsidianSegment,
  normalizeRelativePath,
  obsidianAppConfigPath,
  resolveInsideVault,
} from './obsidian-path-utils.js';

const AGENT_IDS = ['oracle', 'atlas', 'sentinel', 'verifier', 'archivist', 'synth', 'echo', 'nexus'] as const;
type AgentId = (typeof AGENT_IDS)[number];

type MissionPriority = 'low' | 'normal' | 'high' | 'critical';

type PersistedMission = {
  missionId: string;
  title: string;
  description: string;
  assignee: AgentId;
  priority: MissionPriority;
  tokenBudget?: number;
  createdAt: string;
  updatedAt: string;
};

type ControlStore = {
  version: 1;
  updatedAt: string;
  pausedAgents: Record<string, boolean>;
  budgets: Record<string, number>;
  configs: Record<string, Record<string, unknown>>;
  missions: Record<string, PersistedMission>;
  missionOrder: string[];
};

type ObsidianConnectorConfig = {
  version: number;
  vaultId: string | null;
  vaultPath: string | null;
  missionFolder: string;
  updatedAt: number;
};

type ObsidianMissionNoteResult = {
  attempted: boolean;
  created: boolean;
  path: string | null;
  reason?: string;
};

export type TacticalMapControlDeps = {
  dataDir: string;
  sendJson: (res: ServerResponse, data: unknown, status?: number) => void;
  readRequestBody: (req: IncomingMessage, opts?: { maxBytes?: number }) => Promise<string>;
  now?: () => Date;
};

function isAgentId(value: string): value is AgentId {
  return (AGENT_IDS as readonly string[]).includes(value);
}

function isMissionPriority(value: string): value is MissionPriority {
  return value === 'low' || value === 'normal' || value === 'high' || value === 'critical';
}

function defaultBudgets(): Record<string, number> {
  return {
    oracle: 100_000,
    atlas: 100_000,
    sentinel: 100_000,
    verifier: 100_000,
    archivist: 100_000,
    synth: 100_000,
    echo: 100_000,
    nexus: 200_000,
  };
}

function createDefaultStore(nowIso: string): ControlStore {
  return {
    version: 1,
    updatedAt: nowIso,
    pausedAgents: {},
    budgets: defaultBudgets(),
    configs: {},
    missions: {},
    missionOrder: [],
  };
}

function safeMissionSlug(missionId: string): string {
  const slug = missionId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return (slug || 'mission').slice(0, 120);
}

function readObsidianConnectorConfig(dataDir: string): ObsidianConnectorConfig | null {
  const fp = path.join(dataDir, 'obsidian-connector.json');
  try {
    if (!fs.existsSync(fp)) return null;
    const parsed = JSON.parse(fs.readFileSync(fp, 'utf8')) as Record<string, unknown>;
    const missionFolderRaw = typeof parsed.missionFolder === 'string'
      ? parsed.missionFolder
      : DEFAULT_MISSION_FOLDER;
    const missionFolder = normalizeRelativePath(missionFolderRaw) || DEFAULT_MISSION_FOLDER;
    return {
      version: 1,
      vaultId: typeof parsed.vaultId === 'string' && parsed.vaultId.trim() ? parsed.vaultId.trim() : null,
      vaultPath: typeof parsed.vaultPath === 'string' && parsed.vaultPath.trim() ? path.resolve(parsed.vaultPath) : null,
      missionFolder,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function resolveVaultPath(config: ObsidianConnectorConfig): string | null {
  if (config.vaultPath && fs.existsSync(config.vaultPath) && !hasDotObsidianSegment(config.vaultPath)) {
    return path.resolve(config.vaultPath);
  }
  if (!config.vaultId) return null;
  try {
    const fp = obsidianAppConfigPath();
    if (!fs.existsSync(fp)) return null;
    const parsed = JSON.parse(fs.readFileSync(fp, 'utf8')) as Record<string, unknown>;
    const vaults = parsed.vaults as Record<string, { path?: string }> | undefined;
    const entry = vaults?.[config.vaultId];
    if (!entry?.path) return null;
    const resolved = path.resolve(entry.path);
    if (!fs.existsSync(resolved) || hasDotObsidianSegment(resolved)) return null;
    return resolved;
  } catch {
    return null;
  }
}

function materializeMissionNote(
  dataDir: string,
  mission: PersistedMission,
  nowIso: string,
): ObsidianMissionNoteResult {
  try {
    const connector = readObsidianConnectorConfig(dataDir);
    if (!connector) return { attempted: false, created: false, path: null, reason: 'connector_not_configured' };

    const vaultPath = resolveVaultPath(connector);
    if (!vaultPath) return { attempted: true, created: false, path: null, reason: 'vault_unavailable' };

    const missionFolder = normalizeRelativePath(connector.missionFolder) || DEFAULT_MISSION_FOLDER;
    const relativePath = `${missionFolder}/${safeMissionSlug(mission.missionId)}.md`;
    const absolutePath = resolveInsideVault(vaultPath, relativePath);
    if (!absolutePath) return { attempted: true, created: false, path: null, reason: 'unsafe_path' };
    if (fs.existsSync(absolutePath)) return { attempted: true, created: false, path: relativePath, reason: 'already_exists' };

    const template = renderObsidianTemplateNote('mission', {
      missionId: mission.missionId,
      prNumber: null,
      status: 'open',
      owner: mission.assignee,
      updatedAt: nowIso,
    }, {
      title: mission.title,
      summary: mission.description || '_No mission summary provided._',
    });
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, template);
    return { attempted: true, created: true, path: relativePath };
  } catch {
    return { attempted: true, created: false, path: null, reason: 'write_failed' };
  }
}

function readStore(storePath: string, nowIso: string): ControlStore {
  try {
    if (!fs.existsSync(storePath)) return createDefaultStore(nowIso);
    const raw = JSON.parse(fs.readFileSync(storePath, 'utf8')) as Partial<ControlStore>;

    const store = createDefaultStore(nowIso);

    if (raw && typeof raw === 'object') {
      if (raw.pausedAgents && typeof raw.pausedAgents === 'object') {
        store.pausedAgents = { ...raw.pausedAgents };
      }
      if (raw.budgets && typeof raw.budgets === 'object') {
        for (const [agentId, budget] of Object.entries(raw.budgets)) {
          if (!isAgentId(agentId)) continue;
          if (typeof budget !== 'number' || !Number.isFinite(budget)) continue;
          store.budgets[agentId] = Math.max(1, Math.round(budget));
        }
      }
      if (raw.configs && typeof raw.configs === 'object') {
        store.configs = { ...raw.configs };
      }
      if (raw.missions && typeof raw.missions === 'object') {
        store.missions = { ...raw.missions } as Record<string, PersistedMission>;
      }
      if (Array.isArray(raw.missionOrder)) {
        store.missionOrder = raw.missionOrder.filter((id): id is string => typeof id === 'string');
      }
      if (typeof raw.updatedAt === 'string') {
        store.updatedAt = raw.updatedAt;
      }
    }

    return store;
  } catch {
    return createDefaultStore(nowIso);
  }
}

function writeStore(storePath: string, store: ControlStore): void {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  const tmp = `${storePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, storePath);
}

async function parseJsonBody(req: IncomingMessage, readRequestBody: TacticalMapControlDeps['readRequestBody']) {
  const raw = await readRequestBody(req, { maxBytes: 256 * 1024 });
  if (!raw.trim()) return {} as Record<string, unknown>;
  return JSON.parse(raw) as Record<string, unknown>;
}

function missionList(store: ControlStore): PersistedMission[] {
  const out: PersistedMission[] = [];
  for (const id of store.missionOrder) {
    const mission = store.missions[id];
    if (mission) out.push(mission);
  }
  return out;
}

export async function handleTacticalMapControls(
  req: IncomingMessage,
  res: ServerResponse,
  deps: TacticalMapControlDeps,
): Promise<boolean> {
  if (!req.url) return false;

  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if (!pathname.startsWith('/api/tactical-map/')) return false;

  const now = deps.now ?? (() => new Date());
  const nowIso = now().toISOString();
  const storePath = path.join(deps.dataDir, 'tactical-map-controls.json');

  const sendBadRequest = (error: string) => {
    deps.sendJson(res, { ok: false, error }, 400);
  };

  const sendNotFound = (error = 'Not found') => {
    deps.sendJson(res, { ok: false, error }, 404);
  };

  // GET /api/tactical-map/control-state
  if (req.method === 'GET' && pathname === '/api/tactical-map/control-state') {
    const store = readStore(storePath, nowIso);
    const pausedAgents = Object.entries(store.pausedAgents)
      .filter(([, paused]) => paused)
      .map(([id]) => id);

    deps.sendJson(res, {
      ok: true,
      updatedAt: store.updatedAt,
      pausedAgents,
      budgets: store.budgets,
      configs: store.configs,
    });
    return true;
  }

  // GET /api/tactical-map/missions
  if (req.method === 'GET' && pathname === '/api/tactical-map/missions') {
    const store = readStore(storePath, nowIso);
    deps.sendJson(res, {
      ok: true,
      missions: missionList(store),
      dependencies: [],
      updatedAt: store.updatedAt,
    });
    return true;
  }

  // POST /api/tactical-map/missions/spawn
  if (req.method === 'POST' && pathname === '/api/tactical-map/missions/spawn') {
    try {
      const body = await parseJsonBody(req, deps.readRequestBody);
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const description = typeof body.description === 'string' ? body.description.trim() : '';
      const assigneeRaw = typeof body.assignee === 'string' ? body.assignee.trim() : '';
      const priorityRaw = typeof body.priority === 'string' ? body.priority.trim().toLowerCase() : '';
      const tokenBudgetRaw = body.tokenBudget;

      if (!title) return sendBadRequest('Mission title is required'), true;
      if (!isAgentId(assigneeRaw) || assigneeRaw === 'nexus') {
        return sendBadRequest('Mission assignee must be a valid non-nexus agent'), true;
      }
      if (!isMissionPriority(priorityRaw)) {
        return sendBadRequest('Mission priority must be one of: low, normal, high, critical'), true;
      }

      let tokenBudget: number | undefined;
      if (typeof tokenBudgetRaw === 'number' && Number.isFinite(tokenBudgetRaw)) {
        tokenBudget = Math.max(1, Math.round(tokenBudgetRaw));
      }

      const store = readStore(storePath, nowIso);
      const missionId = `mission-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

      const mission: PersistedMission = {
        missionId,
        title,
        description,
        assignee: assigneeRaw,
        priority: priorityRaw,
        tokenBudget,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      store.missions[missionId] = mission;
      store.missionOrder = [missionId, ...store.missionOrder.filter((id) => id !== missionId)].slice(0, 200);
      store.updatedAt = nowIso;
      writeStore(storePath, store);

      const obsidianNote = materializeMissionNote(deps.dataDir, mission, nowIso);
      deps.sendJson(res, { ok: true, missionId, mission, obsidianNote }, 200);
      return true;
    } catch {
      sendBadRequest('Invalid JSON body');
      return true;
    }
  }

  // POST /api/tactical-map/missions/:missionId/priority
  {
    const match = pathname.match(/^\/api\/tactical-map\/missions\/([^/]+)\/priority$/);
    if (req.method === 'POST' && match) {
      try {
        const missionId = decodeURIComponent(match[1]);
        const body = await parseJsonBody(req, deps.readRequestBody);
        const priorityRaw = typeof body.priority === 'string' ? body.priority.trim().toLowerCase() : '';

        if (!isMissionPriority(priorityRaw)) {
          return sendBadRequest('Mission priority must be one of: low, normal, high, critical'), true;
        }

        const store = readStore(storePath, nowIso);
        const mission = store.missions[missionId];
        if (!mission) return sendNotFound('Mission not found'), true;

        mission.priority = priorityRaw;
        mission.updatedAt = nowIso;
        store.updatedAt = nowIso;
        writeStore(storePath, store);

        deps.sendJson(res, { ok: true, missionId, priority: mission.priority }, 200);
        return true;
      } catch {
        sendBadRequest('Invalid JSON body');
        return true;
      }
    }
  }

  // PATCH /api/tactical-map/missions/:missionId
  {
    const match = pathname.match(/^\/api\/tactical-map\/missions\/([^/]+)$/);
    if ((req.method === 'PATCH' || req.method === 'POST') && match && !pathname.endsWith('/priority') && !pathname.endsWith('/spawn')) {
      try {
        const missionId = decodeURIComponent(match[1]);
        const body = await parseJsonBody(req, deps.readRequestBody);

        const store = readStore(storePath, nowIso);
        const mission = store.missions[missionId];
        if (!mission) return sendNotFound('Mission not found'), true;

        let changed = false;

        if (typeof body.title === 'string') {
          const title = body.title.trim();
          if (!title) return sendBadRequest('Mission title cannot be empty'), true;
          mission.title = title;
          changed = true;
        }

        if (typeof body.description === 'string') {
          mission.description = body.description.trim();
          changed = true;
        }

        if (typeof body.assignee === 'string') {
          const assigneeRaw = body.assignee.trim();
          if (!isAgentId(assigneeRaw) || assigneeRaw === 'nexus') {
            return sendBadRequest('Mission assignee must be a valid non-nexus agent'), true;
          }
          mission.assignee = assigneeRaw;
          changed = true;
        }

        if (typeof body.priority === 'string') {
          const priorityRaw = body.priority.trim().toLowerCase();
          if (!isMissionPriority(priorityRaw)) {
            return sendBadRequest('Mission priority must be one of: low, normal, high, critical'), true;
          }
          mission.priority = priorityRaw;
          changed = true;
        }

        if (typeof body.tokenBudget === 'number') {
          if (!Number.isFinite(body.tokenBudget) || body.tokenBudget <= 0) {
            return sendBadRequest('tokenBudget must be a positive number'), true;
          }
          mission.tokenBudget = Math.max(1, Math.round(body.tokenBudget));
          changed = true;
        }

        if (!changed) {
          return sendBadRequest('No valid fields to update'), true;
        }

        mission.updatedAt = nowIso;
        store.updatedAt = nowIso;
        writeStore(storePath, store);

        deps.sendJson(res, { ok: true, missionId, mission }, 200);
        return true;
      } catch {
        sendBadRequest('Invalid JSON body');
        return true;
      }
    }
  }

  // POST /api/tactical-map/agents/:agentId/pause|resume
  {
    const match = pathname.match(/^\/api\/tactical-map\/agents\/([^/]+)\/(pause|resume)$/);
    if (req.method === 'POST' && match) {
      const agentIdRaw = decodeURIComponent(match[1]);
      const action = match[2];

      if (!isAgentId(agentIdRaw)) return sendBadRequest('Unknown agent'), true;
      if (agentIdRaw === 'nexus') return sendBadRequest('Nexus cannot be paused or resumed'), true;

      const store = readStore(storePath, nowIso);
      store.pausedAgents[agentIdRaw] = action === 'pause';
      store.updatedAt = nowIso;
      writeStore(storePath, store);

      deps.sendJson(res, {
        ok: true,
        agentId: agentIdRaw,
        paused: store.pausedAgents[agentIdRaw] === true,
      });
      return true;
    }
  }

  // POST /api/tactical-map/agents/:agentId/budget
  {
    const match = pathname.match(/^\/api\/tactical-map\/agents\/([^/]+)\/budget$/);
    if (req.method === 'POST' && match) {
      const agentIdRaw = decodeURIComponent(match[1]);
      if (!isAgentId(agentIdRaw)) return sendBadRequest('Unknown agent'), true;

      try {
        const body = await parseJsonBody(req, deps.readRequestBody);
        const nextBudget = Number(body.newBudget);
        if (!Number.isFinite(nextBudget) || nextBudget <= 0) {
          return sendBadRequest('newBudget must be a positive number'), true;
        }

        const store = readStore(storePath, nowIso);
        const previousBudget = store.budgets[agentIdRaw] ?? 0;
        store.budgets[agentIdRaw] = Math.max(1, Math.round(nextBudget));
        store.updatedAt = nowIso;
        writeStore(storePath, store);

        deps.sendJson(res, {
          ok: true,
          agentId: agentIdRaw,
          previousBudget,
          newBudget: store.budgets[agentIdRaw],
        });
        return true;
      } catch {
        sendBadRequest('Invalid JSON body');
        return true;
      }
    }
  }

  // POST /api/tactical-map/agents/:agentId/config
  {
    const match = pathname.match(/^\/api\/tactical-map\/agents\/([^/]+)\/config$/);
    if (req.method === 'POST' && match) {
      const agentIdRaw = decodeURIComponent(match[1]);
      if (!isAgentId(agentIdRaw)) return sendBadRequest('Unknown agent'), true;

      try {
        const body = await parseJsonBody(req, deps.readRequestBody);
        const config = body.config;
        if (!config || typeof config !== 'object' || Array.isArray(config)) {
          return sendBadRequest('config must be an object'), true;
        }

        const store = readStore(storePath, nowIso);
        store.configs[agentIdRaw] = {
          ...(store.configs[agentIdRaw] ?? {}),
          ...(config as Record<string, unknown>),
        };
        store.updatedAt = nowIso;
        writeStore(storePath, store);

        deps.sendJson(res, { ok: true, agentId: agentIdRaw, config: store.configs[agentIdRaw] }, 200);
        return true;
      } catch {
        sendBadRequest('Invalid JSON body');
        return true;
      }
    }
  }

  return false;
}

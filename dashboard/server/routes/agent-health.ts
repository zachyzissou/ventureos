/**
 * Agent Health route handler.
 * Migrated from server/routes/agent-health.js (Phase 3 — Issue #76).
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AgentHealthDeps, AgentSummary, AgentHealthResponse } from '../types.js';

function safeReadJson(filePath: string, fallback: null): Record<string, unknown> | null;
function safeReadJson(filePath: string, fallback: Record<string, unknown>): Record<string, unknown>;
function safeReadJson(
  filePath: string,
  fallback: Record<string, unknown> | null,
): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return fallback;
  }
}

function duBytes(p: string): number {
  try {
    const out: string = execSync(
      `du -sk "${p.replace(/"/g, '\\"')}" 2>/dev/null | awk '{print $1}'`,
      { encoding: 'utf8', timeout: 8000 },
    ).trim();
    const kb: number = parseInt(out || '0');
    if (Number.isNaN(kb) || kb < 0) return 0;
    return kb * 1024;
  } catch {
    return 0;
  }
}

function listAgentIds(openclawDir: string): string[] {
  try {
    const agentsDir: string = path.join(openclawDir, 'agents');
    if (!fs.existsSync(agentsDir)) return [];
    return fs.readdirSync(agentsDir).filter((a) => {
      try {
        return fs.statSync(path.join(agentsDir, a)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

interface SessionData {
  updatedAt?: number;
  abortedLastRun?: boolean;
  label?: string;
}

function computeAgentSummary(openclawDir: string, agentId: string): AgentSummary {
  const sessionsDir: string = path.join(openclawDir, 'agents', agentId, 'sessions');
  const sessionsJsonPath: string = path.join(sessionsDir, 'sessions.json');
  const data = safeReadJson(sessionsJsonPath, {}) as Record<string, SessionData>;

  let sessionCount: number = 0;
  let abortedCount: number = 0;
  let lastUpdatedAt: number = 0;
  let lastLabel: string | null = null;

  for (const [key, s] of Object.entries(data ?? {})) {
    sessionCount++;
    if (s && s.abortedLastRun) abortedCount++;
    const u: number = s?.updatedAt ?? 0;
    if (u > lastUpdatedAt) {
      lastUpdatedAt = u;
      lastLabel = s?.label ?? key;
    }
  }

  const successRate: number | null = sessionCount
    ? (sessionCount - abortedCount) / sessionCount
    : null;

  return {
    agentId,
    sessionsDir,
    sessionCount,
    abortedCount,
    successRate,
    lastUpdatedAt,
    lastLabel,
  };
}

let _agentHealthCache: AgentHealthResponse | null = null;
let _agentHealthCacheTime: number = 0;
const AGENT_HEALTH_CACHE_TTL_MS: number = (() => {
  const v: number = parseInt(process.env.AGENT_HEALTH_CACHE_TTL_MS ?? '15000');
  if (Number.isNaN(v)) return 15000;
  return Math.max(1000, Math.min(v, 60000));
})();

export function handleAgentHealth(
  req: IncomingMessage,
  res: ServerResponse,
  deps: AgentHealthDeps,
): boolean {
  const { OPENCLAW_DIR, WORKSPACE_DIR, sendJson } = deps;
  if (!req || !res) return false;
  if (req.method && req.method !== 'GET') return false;
  if (req.url !== '/api/agent-health') return false;

  const now: number = Date.now();
  if (_agentHealthCache && now - _agentHealthCacheTime < AGENT_HEALTH_CACHE_TTL_MS) {
    sendJson(res, _agentHealthCache);
    return true;
  }

  const agentIds: string[] = listAgentIds(OPENCLAW_DIR);
  const agents: AgentSummary[] = agentIds.map((id) => computeAgentSummary(OPENCLAW_DIR, id));
  agents.sort((a, b) => (b.lastUpdatedAt || 0) - (a.lastUpdatedAt || 0));

  const lastActiveMs: number = agents.reduce((m, a) => Math.max(m, a.lastUpdatedAt || 0), 0);

  const payload: AgentHealthResponse = {
    now,
    openclawDir: OPENCLAW_DIR,
    workspaceDir: WORKSPACE_DIR,
    lastActiveMs,
    workspace: {
      bytes: duBytes(WORKSPACE_DIR),
      bytesHuman: null,
    },
    openclaw: {
      bytes: duBytes(OPENCLAW_DIR),
      bytesHuman: null,
    },
    agents,
  };

  _agentHealthCache = payload;
  _agentHealthCacheTime = now;

  sendJson(res, payload);
  return true;
}

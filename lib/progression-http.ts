/**
 * Progression HTTP Route Handler — VentureOS Phase 4.5
 *
 * HTTP API surface for the progression system. Integrates with the
 * dashboard's node:http server via handleProgressionApi().
 *
 * Routes:
 *   GET  /api/rpg/progression/summary       — Dashboard summary cards
 *   GET  /api/rpg/progression/:agentId      — Full profile + tree state
 *   POST /api/rpg/progression/events        — Ingest XP event
 *   POST /api/rpg/progression/prestige      — Trigger prestige transition
 *
 * Issue #203 — Phase 4.5 Deep Progression System (Phase 1 foundation)
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  ProgressionHandlerOptions,
  ProgressionProfileResponse,
  ProgressionSummaryResponse,
  IngestXpEventRequest,
  IngestXpEventResponse,
  PrestigeRequest,
  PrestigeResponse,
  ProgressionErrorResponse,
  SkillTreeStateResponse,
  UnlockSkillRequest,
  UnlockSkillResponse,
  LeaderboardResponse,
} from './types/progression';
import { ProgressionStore } from './progression-store';
import { levelProgress, isPrestigeEligible, isValidSourceCategory } from './progression-engine';

// ─── Helpers ────────────────────────────────────────────────────────────────

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body, null, 2);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(json);
}

function parseUrl(req: IncomingMessage): URL | null {
  if (!req.url) return null;
  try {
    return new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  } catch {
    return null;
  }
}

async function readBody(req: IncomingMessage, maxBytes: number = 65536): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let data = '';
    let bytes = 0;
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        try { req.destroy(); } catch { /* ignore */ }
        reject(new Error('Request body too large'));
        return;
      }
      data += chunk.toString('utf8');
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendError(res: ServerResponse, status: number, error: string): void {
  const body: ProgressionErrorResponse = { ok: false, error };
  sendJson(res, status, body);
}

function openStore(dbPath: string): ProgressionStore {
  return new ProgressionStore(dbPath);
}

// ─── Sync Route Handlers ────────────────────────────────────────────────────

function handleSummary(dbPath: string, res: ServerResponse): void {
  const store = openStore(dbPath);
  try {
    const profiles = store.listProfiles();
    const todayStats = store.getTodayEvents();

    const summaryProfiles = profiles.map((p) => {
      const progress = levelProgress(p.current_xp);
      return {
        agent_id: p.agent_id,
        display_name: p.display_name,
        level: p.level,
        current_xp: p.current_xp,
        prestige_rank: p.prestige_rank,
        diversification_score: p.diversification_score,
        next_level_pct: progress.progress_pct,
      };
    });

    const body: ProgressionSummaryResponse = {
      profiles: summaryProfiles,
      total_xp_today: todayStats.total_xp,
      total_events_today: todayStats.total_count,
      top_categories: todayStats.top_categories,
    };

    sendJson(res, 200, body);
  } finally {
    store.close();
  }
}

function handleProfile(dbPath: string, res: ServerResponse, agentId: string): void {
  const store = openStore(dbPath);
  try {
    const profile = store.getOrCreateProfile(agentId);
    const unlocks = store.getUnlocks(agentId);
    const nodes = store.getSkillNodes();
    const edges = store.getSkillEdges();
    const recentEvents = store.getRecentEvents(agentId, 20);
    const prestigeHistory = store.getPrestigeHistory(agentId);
    const progress = levelProgress(profile.current_xp);
    const prestigeEligible = isPrestigeEligible(
      profile.level,
      profile.prestige_rank,
      profile.lifetime_xp,
    );

    const body: ProgressionProfileResponse = {
      profile,
      unlocks,
      skill_tree: { nodes, edges },
      recent_events: recentEvents,
      prestige_history: prestigeHistory,
      next_level: progress,
      prestige_eligible: prestigeEligible,
    };

    sendJson(res, 200, body);
  } finally {
    store.close();
  }
}

// ─── Async Route Handlers ───────────────────────────────────────────────────

async function handleIngestEvent(
  dbPath: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: IngestXpEventRequest;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw) as IngestXpEventRequest;
  } catch {
    sendError(res, 400, 'Invalid JSON body');
    return;
  }

  // Validate required fields
  if (!body.agent_id || typeof body.agent_id !== 'string') {
    sendError(res, 400, 'Missing or invalid agent_id');
    return;
  }
  if (typeof body.raw_xp !== 'number' || body.raw_xp <= 0) {
    sendError(res, 400, 'raw_xp must be a positive number');
    return;
  }
  if (!body.source_category || !isValidSourceCategory(body.source_category)) {
    sendError(res, 400, `Invalid source_category. Valid: mission_completion, code_review, documentation, bug_fix, deployment, collaboration, research, testing, observability, security`);
    return;
  }
  if (!body.source_description || typeof body.source_description !== 'string') {
    sendError(res, 400, 'Missing or invalid source_description');
    return;
  }

  // Sanitize agent_id
  const agentId = body.agent_id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  if (!agentId) {
    sendError(res, 400, 'agent_id contains no valid characters');
    return;
  }

  const store = openStore(dbPath);
  try {
    const result = store.ingestXpEvent(
      agentId,
      body.raw_xp,
      body.source_category,
      body.source_description.slice(0, 500),
    );

    const response: IngestXpEventResponse = {
      ok: true,
      event: result.event,
      profile: result.profile,
      level_up: result.levelUp,
    };

    sendJson(res, 201, response);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    sendError(res, 400, msg);
  } finally {
    store.close();
  }
}

async function handlePrestige(
  dbPath: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: PrestigeRequest;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw) as PrestigeRequest;
  } catch {
    sendError(res, 400, 'Invalid JSON body');
    return;
  }

  if (!body.agent_id || typeof body.agent_id !== 'string') {
    sendError(res, 400, 'Missing or invalid agent_id');
    return;
  }

  const agentId = body.agent_id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  if (!agentId) {
    sendError(res, 400, 'agent_id contains no valid characters');
    return;
  }

  const store = openStore(dbPath);
  try {
    const record = store.prestigeTransition(agentId);
    const profile = store.getOrCreateProfile(agentId);

    const response: PrestigeResponse = {
      ok: true,
      record,
      profile,
    };

    sendJson(res, 200, response);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    sendError(res, 400, msg);
  } finally {
    store.close();
  }
}

// ─── Phase 2 Route Handlers (#207) ──────────────────────────────────────────

function handleSkillTreeState(dbPath: string, res: ServerResponse, agentId: string): void {
  const store = openStore(dbPath);
  try {
    const profile = store.getOrCreateProfile(agentId);
    const treeState = store.getSkillTreeState(agentId);

    const body: SkillTreeStateResponse = {
      agent_id: agentId,
      current_xp: profile.current_xp,
      nodes: treeState.nodes,
      edges: treeState.edges,
      unlocked_count: treeState.unlocked_count,
      total_count: treeState.nodes.length,
    };

    sendJson(res, 200, body);
  } finally {
    store.close();
  }
}

async function handleUnlockSkill(
  dbPath: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: UnlockSkillRequest;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw) as UnlockSkillRequest;
  } catch {
    sendError(res, 400, 'Invalid JSON body');
    return;
  }

  if (!body.agent_id || typeof body.agent_id !== 'string') {
    sendError(res, 400, 'Missing or invalid agent_id');
    return;
  }
  if (!body.node_id || typeof body.node_id !== 'string') {
    sendError(res, 400, 'Missing or invalid node_id');
    return;
  }

  const agentId = body.agent_id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  const nodeId = body.node_id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);

  if (!agentId) {
    sendError(res, 400, 'agent_id contains no valid characters');
    return;
  }
  if (!nodeId) {
    sendError(res, 400, 'node_id contains no valid characters');
    return;
  }

  const store = openStore(dbPath);
  try {
    const result = store.unlockSkill(agentId, nodeId);

    const response: UnlockSkillResponse = {
      ok: true,
      unlock: result.unlock,
      profile: result.profile,
      node: result.node,
    };

    sendJson(res, 200, response);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    sendError(res, 400, msg);
  } finally {
    store.close();
  }
}

function handleLeaderboard(dbPath: string, res: ServerResponse, url: URL): void {
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.min(100, Math.max(1, parseInt(limitParam, 10) || 50)) : 50;

  const store = openStore(dbPath);
  try {
    const result = store.getLeaderboard(limit);

    const body: LeaderboardResponse = {
      entries: result.entries,
      total_agents: result.total_agents,
    };

    sendJson(res, 200, body);
  } finally {
    store.close();
  }
}

// ─── Main Router ────────────────────────────────────────────────────────────

/**
 * Handle a Progression API request.
 *
 * Expected URL pattern: /api/rpg/progression/{subRoute}
 *
 * Returns `true` if the request was handled, `false` if it didn't match.
 */
export function handleProgressionApi(
  req: IncomingMessage,
  res: ServerResponse,
  opts: ProgressionHandlerOptions,
): boolean {
  const url = parseUrl(req);
  if (!url) return false;

  const pathname = url.pathname;
  if (!pathname.startsWith('/api/rpg/progression')) return false;

  const subPath = pathname.slice('/api/rpg/progression'.length);

  // GET /api/rpg/progression/summary
  if (req.method === 'GET' && (subPath === '/summary' || subPath === '/summary/')) {
    try {
      handleSummary(opts.dbPath, res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      sendError(res, 500, msg);
    }
    return true;
  }

  // GET /api/rpg/progression/leaderboard
  if (req.method === 'GET' && (subPath === '/leaderboard' || subPath === '/leaderboard/')) {
    try {
      handleLeaderboard(opts.dbPath, res, url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      sendError(res, 500, msg);
    }
    return true;
  }

  // GET /api/rpg/progression/skill-tree/:agentId
  if (req.method === 'GET' && subPath.startsWith('/skill-tree/')) {
    const agentId = subPath.slice('/skill-tree/'.length).replace(/\/$/, '');
    if (agentId && /^[a-zA-Z0-9_-]+$/.test(agentId)) {
      try {
        handleSkillTreeState(opts.dbPath, res, agentId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        sendError(res, 500, msg);
      }
      return true;
    }
  }

  // POST /api/rpg/progression/skills/unlock
  if (req.method === 'POST' && (subPath === '/skills/unlock' || subPath === '/skills/unlock/')) {
    handleUnlockSkill(opts.dbPath, req, res).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      sendError(res, 500, msg);
    });
    return true;
  }

  // POST /api/rpg/progression/events
  if (req.method === 'POST' && (subPath === '/events' || subPath === '/events/')) {
    handleIngestEvent(opts.dbPath, req, res).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      sendError(res, 500, msg);
    });
    return true;
  }

  // POST /api/rpg/progression/prestige
  if (req.method === 'POST' && (subPath === '/prestige' || subPath === '/prestige/')) {
    handlePrestige(opts.dbPath, req, res).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      sendError(res, 500, msg);
    });
    return true;
  }

  // GET /api/rpg/progression/:agentId
  if (req.method === 'GET' && subPath && /^\/[a-zA-Z0-9_-]+\/?$/.test(subPath)) {
    const agentId = subPath.replace(/^\//, '').replace(/\/$/, '');
    try {
      handleProfile(opts.dbPath, res, agentId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      sendError(res, 500, msg);
    }
    return true;
  }

  // Method not allowed for matched paths
  if (subPath === '/events' || subPath === '/prestige') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    return true;
  }

  return false;
}

/**
 * Factory function to create a progression router with a fixed DB path.
 */
export function createProgressionRouter(dbPath: string) {
  return {
    handleProgressionApi: (req: IncomingMessage, res: ServerResponse) =>
      handleProgressionApi(req, res, { dbPath }),
  };
}

export default { handleProgressionApi, createProgressionRouter };

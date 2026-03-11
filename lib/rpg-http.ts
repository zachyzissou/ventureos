/**
 * RPG HTTP Route Handler — VentureOS RPG System
 *
 * Provides the HTTP API surface for the RPG system (psionic stats,
 * khala network, tactical overlay, protocols, escalations).
 *
 * Uses better-sqlite3 to query the ventureos-rpg.db database.
 * Designed for integration with the dashboard's node:http server.
 *
 * Issue #78 — API Integration (migrated from ventureos-rpg/api/rpg-http.js)
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import Database from 'better-sqlite3';

import type {
  PsionicStatSnapshot,
  RpgStatsResponse,
  RpgAgentStatsResponse,
  InteractionLogEntry,
  KhalaNetworkEdge,
  KhalaNetworkResponse,
  TacticalOverlayResponse,
  ProtocolSummary,
  ProtocolsResponse,
  EscalationEntry,
  EscalationsResponse,
  RpgHandlerOptions,
} from './types/rpg';

// ─── Helpers ────────────────────────────────────────────────────────────────

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body, null, 2);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(json);
}

function openDb(dbPath: string): Database.Database {
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}

function parseUrl(req: IncomingMessage): URL | null {
  if (!req.url) return null;
  try {
    return new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  } catch {
    return null;
  }
}

// ─── Database Queries ───────────────────────────────────────────────────────

function queryPsionicStats(db: Database.Database): PsionicStatSnapshot[] {
  const stmt = db.prepare(
    `SELECT snapshot_date, agent_id,
            psionic_mastery, energy, shields, warp_technology, psi_reach,
            memory_count, unique_domains, canonical_edits,
            p95_latency_s, mttr_minutes,
            acceptance_rate, success_rate, approval_accuracy,
            tasks_completed, warp_tech_inputs
     FROM psionic_stats ORDER BY snapshot_date DESC`,
  );
  return stmt.all() as PsionicStatSnapshot[];
}

function getInteractionLogColumns(db: Database.Database): Set<string> {
  try {
    const rows = db.prepare(`PRAGMA table_info(interaction_logs)`).all() as Array<{ name?: string }>;
    return new Set(rows.map((r) => String(r.name || '').trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function queryInteractionLogs(db: Database.Database, agentId?: string): InteractionLogEntry[] {
  const cols = getInteractionLogColumns(db);
  const hasAgentId = cols.has('agent_id');
  const hasEventType = cols.has('event_type');
  const hasDuration = cols.has('duration_ms');
  const hasInitiator = cols.has('initiator_agent');
  const hasRecipient = cols.has('recipient_agent');
  const hasInteractionType = cols.has('interaction_type');

  if (hasAgentId && hasEventType) {
    const durationExpr = hasDuration ? 'duration_ms' : '0';
    if (agentId) {
      const stmt = db.prepare(
        `SELECT created_at, agent_id, event_type, ${durationExpr} AS duration_ms
         FROM interaction_logs WHERE agent_id = ? ORDER BY created_at DESC`,
      );
      return stmt.all(agentId) as InteractionLogEntry[];
    }
    const stmt = db.prepare(
      `SELECT created_at, agent_id, event_type, ${durationExpr} AS duration_ms
       FROM interaction_logs ORDER BY created_at DESC`,
    );
    return stmt.all() as InteractionLogEntry[];
  }

  if (hasInitiator && hasInteractionType) {
    if (agentId) {
      const stmt = db.prepare(
        `SELECT created_at,
                ? AS agent_id,
                interaction_type AS event_type,
                ${hasDuration ? 'duration_ms' : '0'} AS duration_ms
         FROM interaction_logs
         WHERE initiator_agent = ?${hasRecipient ? ' OR recipient_agent = ?' : ''}
         ORDER BY created_at DESC`,
      );
      return (hasRecipient
        ? stmt.all(agentId, agentId, agentId)
        : stmt.all(agentId, agentId)) as InteractionLogEntry[];
    }
    const stmt = db.prepare(
      `SELECT created_at,
              initiator_agent AS agent_id,
              interaction_type AS event_type,
              ${hasDuration ? 'duration_ms' : '0'} AS duration_ms
       FROM interaction_logs
       ORDER BY created_at DESC`,
    );
    return stmt.all() as InteractionLogEntry[];
  }

  return [] as InteractionLogEntry[];
}

function queryKhalaNetwork(db: Database.Database): KhalaNetworkEdge[] {
  const stmt = db.prepare(
    `SELECT id, agent_a, agent_b, affinity, seed_value,
            last_interaction_at, interaction_count, updated_at
     FROM khala_network ORDER BY affinity DESC`,
  );
  return stmt.all() as KhalaNetworkEdge[];
}

function queryProtocols(db: Database.Database): ProtocolSummary[] {
  const stmt = db.prepare(
    `SELECT event_type,
            COUNT(*) as count,
            AVG(duration_ms) as avg_duration_ms,
            MAX(created_at) as last_seen
     FROM interaction_logs
     GROUP BY event_type
     ORDER BY count DESC`,
  );
  return stmt.all() as ProtocolSummary[];
}

function queryEscalations(db: Database.Database): EscalationEntry[] {
  const stmt = db.prepare(
    `SELECT created_at, agent_id, event_type, duration_ms
     FROM interaction_logs
     WHERE event_type LIKE '%escalation%'
     ORDER BY created_at DESC`,
  );
  return stmt.all() as EscalationEntry[];
}

// ─── Route Handlers ─────────────────────────────────────────────────────────

function handleStats(
  db: Database.Database,
  _req: IncomingMessage,
  res: ServerResponse,
  subPath: string,
): boolean {
  // GET /api/rpg/stats — aggregate stats as flat Record<string, number>
  if (!subPath || subPath === '/') {
    const snapshots = queryPsionicStats(db);
    const latest = snapshots[0];
    const stats: Record<string, number> = {};
    if (latest) {
      stats['psionic_mastery'] = latest.psionic_mastery;
      stats['energy'] = latest.energy;
      stats['shields'] = latest.shields;
      stats['warp_technology'] = latest.warp_technology;
      stats['psi_reach'] = latest.psi_reach;
      stats['memory_count'] = latest.memory_count;
      stats['unique_domains'] = latest.unique_domains;
      stats['canonical_edits'] = latest.canonical_edits;
      stats['p95_latency_s'] = latest.p95_latency_s;
      stats['mttr_minutes'] = latest.mttr_minutes;
      stats['acceptance_rate'] = latest.acceptance_rate;
      stats['success_rate'] = latest.success_rate;
      stats['approval_accuracy'] = latest.approval_accuracy;
      stats['tasks_completed'] = latest.tasks_completed;
    }
    const body: RpgStatsResponse = { stats, snapshots };
    sendJson(res, 200, body);
    return true;
  }

  // GET /api/rpg/stats/:agentId — per-agent stats
  const agentId = subPath.replace(/^\//, '').replace(/\/$/, '');
  if (agentId && /^[a-z0-9_-]+$/i.test(agentId)) {
    const interactions = queryInteractionLogs(db, agentId);
    const stats: Record<string, number> = {};
    let totalDuration = 0;
    const eventCounts: Record<string, number> = {};
    for (const log of interactions) {
      totalDuration += log.duration_ms;
      const et = log.event_type ?? 'unknown';
      eventCounts[et] = (eventCounts[et] ?? 0) + 1;
    }
    stats['total_interactions'] = interactions.length;
    stats['total_duration_ms'] = totalDuration;
    stats['avg_duration_ms'] =
      interactions.length > 0 ? Math.round(totalDuration / interactions.length) : 0;
    for (const [et, count] of Object.entries(eventCounts)) {
      stats[`event_${et}`] = count;
    }
    const body: RpgAgentStatsResponse = { agentId, stats, interactions };
    sendJson(res, 200, body);
    return true;
  }

  return false;
}

function handleKhalaNetwork(
  db: Database.Database,
  _req: IncomingMessage,
  res: ServerResponse,
  _subPath: string,
): boolean {
  const edges = queryKhalaNetwork(db);
  const agents = new Set<string>();
  for (const e of edges) {
    agents.add(e.agent_a);
    agents.add(e.agent_b);
  }
  const body: KhalaNetworkResponse = {
    edges,
    nodeCount: agents.size,
    edgeCount: edges.length,
  };
  sendJson(res, 200, body);
  return true;
}

function handleTacticalOverlay(
  db: Database.Database,
  _req: IncomingMessage,
  res: ServerResponse,
  subPath: string,
): boolean {
  const view = (subPath.replace(/^\//, '').replace(/\/$/, '')) || 'default';

  const snapshots = queryPsionicStats(db);
  const latest = snapshots[0];
  const stats: Record<string, number> = {};
  if (latest) {
    stats['psionic_mastery'] = latest.psionic_mastery;
    stats['energy'] = latest.energy;
    stats['shields'] = latest.shields;
    stats['warp_technology'] = latest.warp_technology;
    stats['psi_reach'] = latest.psi_reach;
  }

  const edges = queryKhalaNetwork(db);
  const agents = new Set<string>();
  for (const e of edges) {
    agents.add(e.agent_a);
    agents.add(e.agent_b);
  }

  const interactions = queryInteractionLogs(db);

  const body: TacticalOverlayResponse = {
    view,
    stats: { stats, snapshots },
    network: { edges, nodeCount: agents.size, edgeCount: edges.length },
    interactions: interactions.slice(0, 50),
  };
  sendJson(res, 200, body);
  return true;
}

function handleProtocols(
  db: Database.Database,
  _req: IncomingMessage,
  res: ServerResponse,
  _subPath: string,
): boolean {
  const protocols = queryProtocols(db);
  const body: ProtocolsResponse = { protocols };
  sendJson(res, 200, body);
  return true;
}

function handleEscalations(
  db: Database.Database,
  _req: IncomingMessage,
  res: ServerResponse,
  _subPath: string,
): boolean {
  const escalations = queryEscalations(db);
  const body: EscalationsResponse = { escalations, total: escalations.length };
  sendJson(res, 200, body);
  return true;
}

// ─── Main Router ────────────────────────────────────────────────────────────

/**
 * Handle an RPG API request.
 *
 * Expected URL pattern: /api/rpg/{subRoute}
 *
 * Returns `true` if the request was handled, `false` if it didn't match.
 */
export function handleRpgApi(
  req: IncomingMessage,
  res: ServerResponse,
  opts: RpgHandlerOptions,
): boolean {
  const url = parseUrl(req);
  if (!url) return false;

  const pathname = url.pathname;
  if (!pathname.startsWith('/api/rpg')) return false;

  // Only GET requests for RPG API
  if (req.method && req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return true;
  }

  let db: Database.Database;
  try {
    db = openDb(opts.dbPath);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    sendJson(res, 503, { error: 'RPG database unavailable', detail: msg });
    return true;
  }

  try {
    // Route: /api/rpg/stats[/...]
    if (pathname.startsWith('/api/rpg/stats')) {
      const subPath = pathname.slice('/api/rpg/stats'.length);
      return handleStats(db, req, res, subPath);
    }

    // Route: /api/rpg/khala-network[/...]
    if (pathname.startsWith('/api/rpg/khala-network')) {
      const subPath = pathname.slice('/api/rpg/khala-network'.length);
      return handleKhalaNetwork(db, req, res, subPath);
    }

    // Route: /api/rpg/tactical-overlay[/...]
    if (pathname.startsWith('/api/rpg/tactical-overlay')) {
      const subPath = pathname.slice('/api/rpg/tactical-overlay'.length);
      return handleTacticalOverlay(db, req, res, subPath);
    }

    // Route: /api/rpg/protocols[/...]
    if (pathname.startsWith('/api/rpg/protocols')) {
      const subPath = pathname.slice('/api/rpg/protocols'.length);
      return handleProtocols(db, req, res, subPath);
    }

    // Route: /api/rpg/escalations[/...]
    if (pathname.startsWith('/api/rpg/escalations')) {
      const subPath = pathname.slice('/api/rpg/escalations'.length);
      return handleEscalations(db, req, res, subPath);
    }

    return false;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    sendJson(res, 500, { error: 'RPG API error', detail: msg });
    return true;
  } finally {
    try {
      db.close();
    } catch {
      // ignore close errors
    }
  }
}

/**
 * Factory function to create an RPG router with a fixed DB path.
 * Matches the target import style from Issue #78.
 */
export function createRpgRouter(dbPath: string) {
  return {
    handleRpgApi: (req: IncomingMessage, res: ServerResponse) =>
      handleRpgApi(req, res, { dbPath }),
  };
}

export default { handleRpgApi, createRpgRouter };

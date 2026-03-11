/**
 * Shared-Context (Cross-Agent Activity Feed) Route Handlers
 *
 * Phase 4 (#244) of the Shared Agent Memory Layer (#217).
 *
 * Provides dashboard API endpoints for the cross-agent activity feed:
 *   GET /api/shared-context/teams                    — List all teams with agent counts
 *   GET /api/shared-context/teams/:id                — Team detail (metadata + membership)
 *   GET /api/shared-context/teams/:id/activity       — Recent audit log entries
 *   GET /api/shared-context/teams/:id/files          — Directory listing with file metadata
 *
 * Integrates with:
 *   - TeamService (#241) SQLite schema for team/agent queries
 *   - SharedContextAuditStore (#243) SQLite schema for audit trail
 *   - Filesystem for directory listings
 *
 * Uses direct better-sqlite3 queries (same pattern as memory-state.ts)
 * to avoid CJS/ESM boundary issues with lib/ imports in the dashboard.
 */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import type { IncomingMessage, ServerResponse } from 'node:http';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SharedContextDeps {
  /** Path to the TeamService SQLite database. */
  teamDbPath: string;
  /** Path to the SharedContextAuditStore SQLite database. */
  auditDbPath: string;
  /** Root directory for shared-context team directories. */
  sharedContextDir: string;
  /** Send JSON response helper. */
  sendJson: (res: ServerResponse, data: unknown, status?: number) => void;
  /** Clamp an integer within bounds. */
  clampInt: (n: string | number | null, lo: number, hi: number, dflt: number) => number;
}

// ─── Database Helpers ────────────────────────────────────────────────────────

function openDb(dbPath: string): Database.Database | null {
  try {
    const db = new Database(dbPath, { readonly: true });
    db.pragma('journal_mode = WAL');
    return db;
  } catch {
    return null;
  }
}

interface TeamRow {
  id: string;
  name: string;
  created_at: string;
  owner_user_id: string;
}

interface TeamAgentRow {
  team_id: string;
  agent_id: string;
  role: string;
  joined_at: string;
}

interface AuditRow {
  id: string;
  team_id: string;
  agent_id: string;
  action: string;
  file_path: string;
  file_size_bytes: number | null;
  timestamp: string;
  detail: string | null;
}

// ─── URL Helpers ─────────────────────────────────────────────────────────────

function parseUrl(req: IncomingMessage): URL | null {
  try {
    return new URL(req.url ?? '', 'http://localhost');
  } catch {
    return null;
  }
}

/**
 * Extract the team ID from a URL path like /api/shared-context/teams/:id/...
 */
function extractTeamId(urlPath: string): string | null {
  const match = urlPath.match(/^\/api\/shared-context\/teams\/([^/?]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Determine the sub-route after /api/shared-context/teams/:id/
 */
function extractSubRoute(urlPath: string): string | null {
  const match = urlPath.match(/^\/api\/shared-context\/teams\/[^/?]+\/([^/?]+)/);
  return match ? match[1] : null;
}

/**
 * Resolve the team's shared-context directory with path traversal protection.
 */
function resolveTeamDir(sharedContextDir: string, teamName: string): string | null {
  const safe = String(teamName || '')
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, '');
  if (!safe) return null;

  const teamDir = path.join(sharedContextDir, safe);
  const resolved = path.resolve(teamDir);
  const root = path.resolve(sharedContextDir);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) return null;
  if (!fs.existsSync(teamDir)) return null;

  return teamDir;
}

// ─── File Listing ────────────────────────────────────────────────────────────

interface FileEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  sizeBytes: number;
  lastModified: string;
  author: string | null;
}

/**
 * Recursively list files with metadata, bounded to maxFiles.
 */
function listDirectoryFiles(baseDir: string, maxFiles: number = 200): FileEntry[] {
  const entries: FileEntry[] = [];

  function walk(dir: string, relPrefix: string): void {
    if (entries.length >= maxFiles) return;

    let dirEntries: fs.Dirent[];
    try {
      dirEntries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    dirEntries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of dirEntries) {
      if (entries.length >= maxFiles) return;

      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      const fullPath = path.join(dir, entry.name);

      // Skip .meta directory at the root level
      if (entry.name === '.meta' && !relPrefix) continue;

      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }

      // Infer author from agent-outputs/{agentId}/ path prefix
      let author: string | null = null;
      const agentMatch = relPath.match(/^agent-outputs\/([^/]+)/);
      if (agentMatch) author = agentMatch[1];

      entries.push({
        path: relPath,
        name: entry.name,
        isDirectory: entry.isDirectory(),
        sizeBytes: entry.isDirectory() ? 0 : stat.size,
        lastModified: stat.mtime.toISOString(),
        author,
      });

      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      }
    }
  }

  walk(baseDir, '');
  return entries;
}

/**
 * Read manifest.json for author attribution.
 */
function readManifestAuthors(teamDir: string): Record<string, string> {
  try {
    const manifestPath = path.join(teamDir, '.meta', 'manifest.json');
    if (!fs.existsSync(manifestPath)) return {};
    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const authors: Record<string, string> = {};
    if (Array.isArray(data.files)) {
      for (const f of data.files) {
        if (f.path && f.lastModifiedBy) {
          authors[f.path] = f.lastModifiedBy;
        }
      }
    }
    return authors;
  } catch {
    return {};
  }
}

// ─── Route Handler ───────────────────────────────────────────────────────────

/**
 * Handle shared-context API requests.
 *
 * @returns true if the request was handled, false to pass to next handler.
 */
export function handleSharedContext(
  req: IncomingMessage,
  res: ServerResponse,
  deps: SharedContextDeps,
): boolean {
  if (!req.url || !req.url.startsWith('/api/shared-context/')) return false;
  if (req.method && req.method !== 'GET') return false;

  const parsed = parseUrl(req);
  if (!parsed) {
    deps.sendJson(res, { ok: false, error: 'Bad request' }, 400);
    return true;
  }

  const urlPath = parsed.pathname;

  // GET /api/shared-context/teams
  if (urlPath === '/api/shared-context/teams') {
    return handleListTeams(res, deps);
  }

  // Routes requiring a team ID
  const teamId = extractTeamId(urlPath);
  if (!teamId) {
    deps.sendJson(res, { ok: false, error: 'Invalid route' }, 404);
    return true;
  }

  const subRoute = extractSubRoute(urlPath);

  if (subRoute === 'activity') {
    const limitParam = parsed.searchParams.get('limit');
    const limit = deps.clampInt(limitParam, 1, 200, 50);
    const agentFilter = parsed.searchParams.get('agent_id') || null;
    const actionFilter = parsed.searchParams.get('action') || null;
    return handleTeamActivity(res, deps, teamId, limit, agentFilter, actionFilter);
  }

  if (subRoute === 'files') {
    return handleTeamFiles(res, deps, teamId);
  }

  // No sub-route → team detail
  if (!subRoute) {
    return handleTeamDetail(res, deps, teamId);
  }

  deps.sendJson(res, { ok: false, error: `Unknown sub-route: ${subRoute}` }, 404);
  return true;
}

// ─── Endpoint Implementations ────────────────────────────────────────────────

function handleListTeams(res: ServerResponse, deps: SharedContextDeps): boolean {
  const db = openDb(deps.teamDbPath);

  if (!db) {
    deps.sendJson(res, {
      teams: [],
      total: 0,
      available: false,
      message: 'Team service unavailable',
    });
    return true;
  }

  try {
    const teamRows = db.prepare('SELECT * FROM teams ORDER BY created_at DESC').all() as TeamRow[];

    // Open audit store for last activity enrichment
    const auditDb = openDb(deps.auditDbPath);

    const teams = teamRows.map((row) => {
      const agents = db.prepare(
        'SELECT * FROM team_agents WHERE team_id = ? ORDER BY joined_at ASC',
      ).all(row.id) as TeamAgentRow[];

      let lastActivityAt: string | null = null;
      if (auditDb) {
        try {
          const auditRow = auditDb.prepare(
            'SELECT timestamp FROM shared_context_audit WHERE team_id = ? ORDER BY timestamp DESC LIMIT 1',
          ).get(row.id) as { timestamp: string } | undefined;
          if (auditRow) lastActivityAt = auditRow.timestamp;
        } catch {
          // Ignore audit query failures
        }
      }

      return {
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        ownerUserId: row.owner_user_id,
        agentCount: agents.length,
        agents: agents.map((a) => ({
          agentId: a.agent_id,
          role: a.role,
          joinedAt: a.joined_at,
        })),
        lastActivityAt,
      };
    });

    if (auditDb) try { auditDb.close(); } catch { /* ignore */ }

    deps.sendJson(res, { teams, total: teams.length, available: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    deps.sendJson(res, { ok: false, error: `Failed to list teams: ${msg}` }, 500);
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }

  return true;
}

function handleTeamDetail(
  res: ServerResponse,
  deps: SharedContextDeps,
  teamId: string,
): boolean {
  const db = openDb(deps.teamDbPath);

  if (!db) {
    deps.sendJson(res, { ok: false, error: 'Team service unavailable' }, 503);
    return true;
  }

  try {
    const row = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId) as TeamRow | undefined;

    if (!row) {
      deps.sendJson(res, { ok: false, error: 'Team not found' }, 404);
      return true;
    }

    const agents = db.prepare(
      'SELECT * FROM team_agents WHERE team_id = ? ORDER BY joined_at ASC',
    ).all(teamId) as TeamAgentRow[];

    const teamDir = resolveTeamDir(deps.sharedContextDir, row.name);
    let directoryExists = false;
    let totalSizeBytes = 0;
    let fileCount = 0;

    if (teamDir) {
      directoryExists = true;
      try {
        const files = listDirectoryFiles(teamDir);
        fileCount = files.filter((f) => !f.isDirectory).length;
        totalSizeBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0);
      } catch {
        // Directory listing failed
      }
    }

    deps.sendJson(res, {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      ownerUserId: row.owner_user_id,
      agents: agents.map((a) => ({
        agentId: a.agent_id,
        role: a.role,
        joinedAt: a.joined_at,
      })),
      directory: {
        exists: directoryExists,
        path: teamDir,
        fileCount,
        totalSizeBytes,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    deps.sendJson(res, { ok: false, error: `Failed to get team: ${msg}` }, 500);
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }

  return true;
}

function handleTeamActivity(
  res: ServerResponse,
  deps: SharedContextDeps,
  teamId: string,
  limit: number,
  agentFilter: string | null,
  actionFilter: string | null,
): boolean {
  // Verify team exists
  const teamDb = openDb(deps.teamDbPath);
  if (!teamDb) {
    deps.sendJson(res, { ok: false, error: 'Team service unavailable' }, 503);
    return true;
  }

  let teamExists = false;
  try {
    const row = teamDb.prepare('SELECT id FROM teams WHERE id = ?').get(teamId);
    teamExists = !!row;
  } catch {
    // ignore
  } finally {
    try { teamDb.close(); } catch { /* ignore */ }
  }

  if (!teamExists) {
    deps.sendJson(res, { ok: false, error: 'Team not found' }, 404);
    return true;
  }

  const auditDb = openDb(deps.auditDbPath);
  if (!auditDb) {
    deps.sendJson(res, {
      teamId,
      entries: [],
      total: 0,
      limit,
      available: false,
      message: 'Audit store unavailable',
    });
    return true;
  }

  try {
    // Build query dynamically for filtering
    let query = 'SELECT * FROM shared_context_audit WHERE team_id = ?';
    const params: (string | number)[] = [teamId];

    if (agentFilter) {
      query += ' AND agent_id = ?';
      params.push(agentFilter);
    }
    if (actionFilter) {
      query += ' AND action = ?';
      params.push(actionFilter);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const rows = auditDb.prepare(query).all(...params) as AuditRow[];

    deps.sendJson(res, {
      teamId,
      entries: rows.map((r) => ({
        id: r.id,
        agentId: r.agent_id,
        action: r.action,
        filePath: r.file_path,
        fileSizeBytes: r.file_size_bytes,
        timestamp: r.timestamp,
        detail: r.detail ?? null,
      })),
      total: rows.length,
      limit,
      available: true,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    deps.sendJson(res, { ok: false, error: `Failed to query activity: ${msg}` }, 500);
  } finally {
    try { auditDb.close(); } catch { /* ignore */ }
  }

  return true;
}

function handleTeamFiles(
  res: ServerResponse,
  deps: SharedContextDeps,
  teamId: string,
): boolean {
  const db = openDb(deps.teamDbPath);
  if (!db) {
    deps.sendJson(res, { ok: false, error: 'Team service unavailable' }, 503);
    return true;
  }

  let teamName: string | null = null;
  try {
    const row = db.prepare('SELECT name FROM teams WHERE id = ?').get(teamId) as { name: string } | undefined;
    if (!row) {
      deps.sendJson(res, { ok: false, error: 'Team not found' }, 404);
      return true;
    }
    teamName = row.name;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    deps.sendJson(res, { ok: false, error: `Failed to look up team: ${msg}` }, 500);
    return true;
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }

  if (!teamName) {
    deps.sendJson(res, { ok: false, error: 'Team not found' }, 404);
    return true;
  }

  const teamDir = resolveTeamDir(deps.sharedContextDir, teamName);

  if (!teamDir) {
    deps.sendJson(res, {
      teamId,
      teamName,
      files: [],
      total: 0,
      totalSizeBytes: 0,
      directoryExists: false,
    });
    return true;
  }

  try {
    const files = listDirectoryFiles(teamDir);

    // Enrich with manifest authors
    const manifestAuthors = readManifestAuthors(teamDir);
    for (const file of files) {
      if (!file.author && manifestAuthors[file.path]) {
        file.author = manifestAuthors[file.path];
      }
    }

    const totalSizeBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0);

    deps.sendJson(res, {
      teamId,
      teamName,
      files,
      total: files.length,
      totalSizeBytes,
      directoryExists: true,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    deps.sendJson(res, { ok: false, error: `Failed to list files: ${msg}` }, 500);
  }

  return true;
}

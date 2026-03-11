/**
 * Symlink Health Check HTTP Handler — VentureOS
 *
 * GET /api/shared-context/symlink-health?team_id=<id>
 *
 * Returns per-agent symlink status for a team. Useful for diagnostics
 * dashboard integration.
 *
 * Phase 2 (#242) of the Shared Agent Memory Layer (#217).
 *
 * @module
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { TeamService } from './team-service';
import { SymlinkManager } from './symlink-manager';
import type { SymlinkHealthReport } from './types/team';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SymlinkHealthOptions {
  /** Path to the SQLite database file. */
  dbPath: string;
}

interface HealthErrorResponse {
  error: string;
  code: string;
}

// ─── Handler ────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/shared-context/symlink-health
 *
 * Query params:
 * - team_id (required): Team UUID
 *
 * Response:
 * - 200: SymlinkHealthReport JSON
 * - 400: Missing team_id
 * - 404: Team not found
 * - 405: Method not allowed
 * - 500: Internal error
 */
export function handleSymlinkHealth(
  req: IncomingMessage,
  res: ServerResponse,
  options: SymlinkHealthOptions,
): void {
  // Method check
  if (req.method !== 'GET') {
    sendJson(res, 405, {
      error: 'Method not allowed',
      code: 'METHOD_NOT_ALLOWED',
    } satisfies HealthErrorResponse);
    return;
  }

  // Parse team_id from query string
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const teamId = url.searchParams.get('team_id');

  if (!teamId) {
    sendJson(res, 400, {
      error: 'Missing required query parameter: team_id',
      code: 'MISSING_TEAM_ID',
    } satisfies HealthErrorResponse);
    return;
  }

  let teamService: TeamService | null = null;

  try {
    teamService = new TeamService(options.dbPath);
    const team = teamService.getTeam(teamId);

    if (!team) {
      sendJson(res, 404, {
        error: `Team "${teamId}" not found`,
        code: 'TEAM_NOT_FOUND',
      } satisfies HealthErrorResponse);
      return;
    }

    const manager = new SymlinkManager();
    const agentIds = team.agents.map((a) => a.agentId);
    const report: SymlinkHealthReport = manager.validateSymlinks(
      team.id,
      team.name,
      agentIds,
    );

    sendJson(res, 200, report);
  } catch (err: any) {
    sendJson(res, 500, {
      error: `Internal error: ${err.message}`,
      code: 'INTERNAL_ERROR',
    } satisfies HealthErrorResponse);
  } finally {
    teamService?.close();
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const json = JSON.stringify(body, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

/**
 * Factory function to create a symlink health router with a fixed DB path.
 */
export function createSymlinkHealthRouter(dbPath: string) {
  return {
    handleSymlinkHealth: (req: IncomingMessage, res: ServerResponse) =>
      handleSymlinkHealth(req, res, { dbPath }),
  };
}

export default { handleSymlinkHealth, createSymlinkHealthRouter };

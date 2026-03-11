/**
 * Progression route handler — Dashboard integration
 *
 * Thin adapter that integrates the monorepo's lib/progression-http module
 * into the dashboard's HTTP server.
 *
 * Issue #203 — Phase 4.5 Deep Progression System (Phase 1 foundation)
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ProgressionHandlerOptions } from '../../../lib/types/progression.js';
import progressionHttp from '../../../lib/progression-http.js';

const { handleProgressionApi } = progressionHttp as typeof import('../../../lib/progression-http.js');
export { handleProgressionApi };
export type { ProgressionHandlerOptions };

/**
 * Progression API route handler for the dashboard.
 *
 * Handles:
 *   GET  /api/rpg/progression/summary       — Dashboard summary cards
 *   GET  /api/rpg/progression/:agentId      — Full profile + tree state
 *   POST /api/rpg/progression/events        — Ingest XP event (validated)
 *   POST /api/rpg/progression/prestige      — Trigger prestige transition
 *
 * @returns true if the request was handled, false otherwise
 */
export function handleProgression(
  req: IncomingMessage,
  res: ServerResponse,
  opts: ProgressionHandlerOptions,
): boolean {
  return handleProgressionApi(req, res, opts);
}

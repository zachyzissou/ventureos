/**
 * RPG route handler — Dashboard integration
 *
 * Thin adapter that integrates the monorepo's lib/rpg-http module
 * into the dashboard's HTTP server.
 *
 * Issue #78 — API Integration
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RpgHandlerOptions } from '../../../lib/types/rpg.js';
import rpgHttp from '../../../lib/rpg-http.js';

const { handleRpgApi } = rpgHttp as typeof import('../../../lib/rpg-http.js');
export { handleRpgApi };
export type { RpgHandlerOptions };

/**
 * RPG API route handler for the dashboard.
 *
 * Handles:
 *   GET /api/rpg/stats        — Aggregate performance stats
 *   GET /api/rpg/stats/:agent — Per-agent stats
 *   GET /api/rpg/affinity-network — Affinity network edges
 *   GET /api/rpg/tactical-overlay[/:view] — Tactical overlay data
 *   GET /api/rpg/protocols    — Protocol summaries
 *   GET /api/rpg/escalations  — Escalation events
 *
 * Also handles legacy alias routes (delegated by server.ts):
 *   GET /api/performance-stats    → /api/rpg/stats
 *   GET /api/affinity-network    → /api/rpg/affinity-network
 *   GET /api/tactical-overlay → /api/rpg/tactical-overlay
 *   GET /api/protocols        → /api/rpg/protocols
 *   GET /api/escalations      → /api/rpg/escalations
 *
 * @returns true if the request was handled, false otherwise
 */
export function handleRpg(
  req: IncomingMessage,
  res: ServerResponse,
  opts: RpgHandlerOptions,
): boolean {
  return handleRpgApi(req, res, opts);
}

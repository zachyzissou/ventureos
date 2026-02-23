/**
 * Memory State Route Handlers — Phase 4 (#233)
 *
 * Provides API endpoints for the dashboard memory gauge widget:
 *   GET /api/memory/state?agent_id=<id>          — Memory state snapshot
 *   GET /api/memory/observations?agent_id=<id>   — Active observations list
 *
 * Uses the ObservationStore from lib/ for data access.
 * Gracefully degrades if the database or reflected_at column is missing.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { ObservationStore } from '../../../lib/observation-store.js';
import type { ObservationPriority } from '../../../lib/types/observation.js';
import structuredLogger from '../../../lib/structured-logger.js';

const { logInfo, logError, OBSERVATION_EVENTS } = structuredLogger as typeof import('../../../lib/structured-logger.js');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MemoryStateDeps {
  /** Path to the observations SQLite database. */
  dbPath: string;
  /** Default agent ID if not specified in query. */
  defaultAgentId: string;
  /** Send JSON response helper. */
  sendJson: (res: ServerResponse, data: unknown, status?: number) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseUrl(req: IncomingMessage): URL | null {
  try {
    return new URL(req.url ?? '', 'http://localhost');
  } catch {
    return null;
  }
}

function openStore(dbPath: string): ObservationStore | null {
  try {
    return new ObservationStore(dbPath);
  } catch {
    return null;
  }
}

// ─── Route Handler ───────────────────────────────────────────────────────────

/**
 * Handle memory state API requests.
 *
 * @returns true if the request was handled, false to pass to next handler.
 */
export function handleMemoryState(
  req: IncomingMessage,
  res: ServerResponse,
  deps: MemoryStateDeps,
): boolean {
  if (!req.url || req.method !== 'GET') return false;

  // GET /api/memory/state
  if (req.url.startsWith('/api/memory/state')) {
    const parsed = parseUrl(req);
    if (!parsed) {
      deps.sendJson(res, { ok: false, error: 'Bad request' }, 400);
      return true;
    }

    const agentId = parsed.searchParams.get('agent_id') || deps.defaultAgentId;
    const store = openStore(deps.dbPath);

    if (!store) {
      logInfo('memory-state', OBSERVATION_EVENTS.API_MEMORY_STATE, 'Store unavailable', { agentId });
      deps.sendJson(res, {
        agentId,
        enabled: false,
        observationsTokens: 0,
        rawBufferTokens: 0,
        observationCount: 0,
        priorityCounts: { high: 0, medium: 0, info: 0 },
        lastObservationAt: null,
        lastReflectionAt: null,
        reflectionSupported: false,
      });
      return true;
    }

    try {
      const snapshot = store.getMemoryStateSnapshot(agentId);
      logInfo('memory-state', OBSERVATION_EVENTS.API_MEMORY_STATE, 'Served memory state', {
        agentId,
        observationCount: snapshot.observationCount,
      });
      deps.sendJson(res, snapshot);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      logError('memory-state', OBSERVATION_EVENTS.API_MEMORY_ERROR, msg, { agentId });
      deps.sendJson(res, { ok: false, error: 'Internal error reading memory state' }, 500);
    } finally {
      store.close();
    }

    return true;
  }

  // GET /api/memory/observations
  if (req.url.startsWith('/api/memory/observations')) {
    const parsed = parseUrl(req);
    if (!parsed) {
      deps.sendJson(res, { ok: false, error: 'Bad request' }, 400);
      return true;
    }

    const agentId = parsed.searchParams.get('agent_id') || deps.defaultAgentId;
    const limitStr = parsed.searchParams.get('limit');
    const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 500) : 50;
    const priorityParam = parsed.searchParams.get('priority') as ObservationPriority | null;
    const priority = (priorityParam === 'high' || priorityParam === 'medium' || priorityParam === 'info')
      ? priorityParam
      : undefined;

    const store = openStore(deps.dbPath);

    if (!store) {
      logInfo('memory-state', OBSERVATION_EVENTS.API_MEMORY_OBSERVATIONS, 'Store unavailable', { agentId });
      deps.sendJson(res, { agentId, observations: [], total: 0 });
      return true;
    }

    try {
      const observations = store.queryActiveObservations({ agentId, limit, priority });

      logInfo('memory-state', OBSERVATION_EVENTS.API_MEMORY_OBSERVATIONS, 'Served observations', {
        agentId,
        count: observations.length,
        priority: priority ?? 'all',
      });

      deps.sendJson(res, {
        agentId,
        observations: observations.map(obs => ({
          id: obs.id,
          createdAt: obs.createdAt,
          category: obs.category,
          content: obs.content,
          priority: obs.priority ?? null,
          referencedDate: obs.referencedDate ?? null,
        })),
        total: observations.length,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      logError('memory-state', OBSERVATION_EVENTS.API_MEMORY_ERROR, msg, { agentId });
      deps.sendJson(res, { ok: false, error: 'Internal error reading observations' }, 500);
    } finally {
      store.close();
    }

    return true;
  }

  return false;
}

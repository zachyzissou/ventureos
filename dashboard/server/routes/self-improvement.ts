/**
 * Self-Improvement Digest API routes (Issue #222)
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  generateSelfImprovementDigest,
  listSelfImprovementDigests,
  loadSelfImprovementDigests,
  setRecommendationStatus,
} from '../self-improvement.js';
import { normalizeCapabilityId } from '../../../lib/agent-identity.js';

export interface SelfImprovementRouteDeps {
  dataDir: string;
  workspaceDir: string;
  defaultAgentId: string;
  sendJson: (res: ServerResponse, data: unknown, status?: number) => void;
  readRequestBody: (req: IncomingMessage) => Promise<string>;
}

function parseUrl(req: IncomingMessage): URL | null {
  try {
    return new URL(req.url ?? '', 'http://localhost');
  } catch {
    return null;
  }
}

function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function cleanId(raw: string | null | undefined): string {
  return (raw ?? '').trim();
}

function normalizeAgentId(raw: string | null | undefined): string | null {
  const cleaned = cleanId(raw);
  if (!cleaned) return null;
  return normalizeCapabilityId(cleaned);
}

function parsePositiveInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
}

export function handleSelfImprovement(
  req: IncomingMessage,
  res: ServerResponse,
  deps: SelfImprovementRouteDeps,
): Promise<boolean> | boolean {
  if (!req.url || !req.url.startsWith('/api/self-improvement')) return false;

  const url = parseUrl(req);
  if (!url) {
    deps.sendJson(res, { ok: false, error: 'Bad request URL' }, 400);
    return true;
  }

  // POST /api/self-improvement/generate
  if (url.pathname === '/api/self-improvement/generate' && req.method === 'POST') {
    return (async () => {
      const body = parseJson<{ agentId?: string; date?: string; minRecommendations?: number }>(
        await deps.readRequestBody(req),
      ) ?? {};
      const explicitAgentId = cleanId(body.agentId);
      if (explicitAgentId && !normalizeAgentId(explicitAgentId)) {
        deps.sendJson(res, { ok: false, error: 'agentId must resolve to a canonical VentureOS capability' }, 400);
        return true;
      }
      const agentId = normalizeAgentId(explicitAgentId) ?? normalizeAgentId(deps.defaultAgentId);
      if (!agentId) {
        deps.sendJson(res, { ok: false, error: 'agentId must resolve to a canonical VentureOS capability' }, 400);
        return true;
      }
      const minRecommendations = body.minRecommendations == null
        ? 3
        : parsePositiveInt(String(body.minRecommendations), 3, 1, 10);

      const generated = generateSelfImprovementDigest({
        dataDir: deps.dataDir,
        workspaceDir: deps.workspaceDir,
        agentId,
        dateOverride: cleanId(body.date) || undefined,
        minRecommendations,
      });

      deps.sendJson(res, { ok: true, digestPath: generated.digestPath, digest: generated.digest });
      return true;
    })();
  }

  // GET /api/self-improvement/digests
  if (url.pathname === '/api/self-improvement/digests' && req.method === 'GET') {
    const limit = parsePositiveInt(url.searchParams.get('limit'), 30, 1, 365);
    const agentId = normalizeAgentId(url.searchParams.get('agentId')) ?? undefined;
    const digests = listSelfImprovementDigests(deps.dataDir, { limit, agentId });
    deps.sendJson(res, { total: digests.length, digests });
    return true;
  }

  // GET /api/self-improvement/digests/:id
  if (url.pathname.startsWith('/api/self-improvement/digests/') && req.method === 'GET') {
    const digestId = cleanId(url.pathname.split('/api/self-improvement/digests/')[1]);
    const digest = loadSelfImprovementDigests(deps.dataDir).find((entry) => entry.id === digestId);
    if (!digest) {
      deps.sendJson(res, { ok: false, error: 'Digest not found' }, 404);
      return true;
    }
    deps.sendJson(res, { ok: true, digest });
    return true;
  }

  // POST /api/self-improvement/recommendations/:id/approve
  if (url.pathname.startsWith('/api/self-improvement/recommendations/') && req.method === 'POST') {
    const parts = url.pathname.split('/api/self-improvement/recommendations/')[1]?.split('/') ?? [];
    const recommendationId = cleanId(parts[0]);
    const action = parts[1];
    if (!recommendationId || (action !== 'approve' && action !== 'reject')) {
      deps.sendJson(res, { ok: false, error: 'Invalid recommendation action route' }, 400);
      return true;
    }

    return (async () => {
      const body = parseJson<{ agentId?: string }>(await deps.readRequestBody(req)) ?? {};
      const explicitAgentId = cleanId(body.agentId);
      if (explicitAgentId && !normalizeAgentId(explicitAgentId)) {
        deps.sendJson(res, { ok: false, error: 'agentId must resolve to a canonical VentureOS capability' }, 400);
        return true;
      }
      const agentId = normalizeAgentId(explicitAgentId) ?? normalizeAgentId(deps.defaultAgentId);
      if (!agentId) {
        deps.sendJson(res, { ok: false, error: 'agentId must resolve to a canonical VentureOS capability' }, 400);
        return true;
      }
      const result = setRecommendationStatus({
        dataDir: deps.dataDir,
        workspaceDir: deps.workspaceDir,
        agentId,
        recommendationId,
        action,
      });

      if (!result.ok) {
        deps.sendJson(res, { ok: false, error: result.message }, 400);
        return true;
      }

      deps.sendJson(res, {
        ok: true,
        message: result.message,
        digest: result.digest,
        recommendation: result.recommendation,
      });
      return true;
    })();
  }

  deps.sendJson(res, { ok: false, error: 'Not found' }, 404);
  return true;
}

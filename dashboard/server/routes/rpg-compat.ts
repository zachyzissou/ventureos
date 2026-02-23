/**
 * Legacy RPG API aliases kept for backward compatibility.
 *
 * Rewrites legacy non-prefixed aliases to canonical /api/rpg/* paths,
 * then delegates to handleRpgApi.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

interface RpgCompatDeps {
  dbPath: string;
  handleRpgApi: (
    req: IncomingMessage,
    res: ServerResponse,
    deps: { dbPath: string },
  ) => boolean;
}

export function handleRpgCompat(
  req: IncomingMessage,
  res: ServerResponse,
  deps: RpgCompatDeps,
): boolean {
  if (req.url === '/api/psionic-stats') {
    (req as { url: string }).url = '/api/rpg/stats';
    return deps.handleRpgApi(req, res, { dbPath: deps.dbPath });
  }

  if (req.url && req.url.startsWith('/api/psionic-stats/')) {
    (req as { url: string }).url = req.url.replace('/api/psionic-stats/', '/api/rpg/stats/');
    return deps.handleRpgApi(req, res, { dbPath: deps.dbPath });
  }

  if (req.url === '/api/khala-network' || (req.url && req.url.startsWith('/api/khala-network?'))) {
    (req as { url: string }).url = (req.url ?? '').replace('/api/khala-network', '/api/rpg/khala-network');
    return deps.handleRpgApi(req, res, { dbPath: deps.dbPath });
  }

  if (req.url && req.url.startsWith('/api/khala-network/')) {
    (req as { url: string }).url = req.url.replace('/api/khala-network/', '/api/rpg/khala-network/');
    return deps.handleRpgApi(req, res, { dbPath: deps.dbPath });
  }

  if (req.url && req.url.startsWith('/api/tactical-overlay/')) {
    (req as { url: string }).url = req.url.replace('/api/tactical-overlay/', '/api/rpg/tactical-overlay/');
    return deps.handleRpgApi(req, res, { dbPath: deps.dbPath });
  }

  if (req.url && req.url.startsWith('/api/protocols/')) {
    (req as { url: string }).url = req.url.replace('/api/protocols/', '/api/rpg/protocols/');
    return deps.handleRpgApi(req, res, { dbPath: deps.dbPath });
  }

  if (req.url && req.url.startsWith('/api/escalations/')) {
    (req as { url: string }).url = req.url.replace('/api/escalations/', '/api/rpg/escalations/');
    return deps.handleRpgApi(req, res, { dbPath: deps.dbPath });
  }

  return false;
}

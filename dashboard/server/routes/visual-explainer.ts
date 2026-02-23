/**
 * Visual Explainer routes (Issue #226)
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { listVisualPatterns, renderVisualExplainer, type VisualPatternType } from '../visual-explainer.js';

export interface VisualExplainerRouteDeps {
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

function isPattern(raw: unknown): raw is VisualPatternType {
  return raw === 'table' || raw === 'flow' || raw === 'timeline' || raw === 'hierarchy' || raw === 'comparison';
}

export function handleVisualExplainer(
  req: IncomingMessage,
  res: ServerResponse,
  deps: VisualExplainerRouteDeps,
): Promise<boolean> | boolean {
  if (!req.url || !req.url.startsWith('/api/visual-explainer')) return false;
  const parsed = parseUrl(req);
  if (!parsed) {
    deps.sendJson(res, { ok: false, error: 'Bad request URL' }, 400);
    return true;
  }

  if (parsed.pathname === '/api/visual-explainer/patterns' && req.method === 'GET') {
    deps.sendJson(res, {
      patterns: listVisualPatterns(),
    });
    return true;
  }

  if (parsed.pathname === '/api/visual-explainer/render' && req.method === 'POST') {
    return (async () => {
      const body = parseJson<{ command?: string; title?: string; pattern?: string }>(
        await deps.readRequestBody(req),
      ) ?? {};
      const command = (body.command ?? '').trim();
      if (!command) {
        deps.sendJson(res, { ok: false, error: 'command is required' }, 400);
        return true;
      }
      const rendered = renderVisualExplainer({
        command,
        title: body.title?.trim() || undefined,
        pattern: isPattern(body.pattern) ? body.pattern : undefined,
      });
      deps.sendJson(res, {
        ok: true,
        render: rendered,
      });
      return true;
    })();
  }

  deps.sendJson(res, { ok: false, error: 'Not found' }, 404);
  return true;
}


/**
 * Living Files API routes (Issue #228).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  getLivingFileEngine,
  type LivingFileTriggerStatus,
} from '../living-files.js';

export interface LivingFilesRouteDeps {
  dataDir: string;
  workspaceDir: string;
  sendJson: (res: ServerResponse, data: unknown, status?: number) => void;
  readRequestBody: (req: IncomingMessage, opts?: { maxBytes?: number }) => Promise<string>;
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

function sanitize(input: unknown): string {
  return typeof input === 'string' ? input.trim() : '';
}

function parseBool(input: unknown): boolean | undefined {
  if (input == null) return undefined;
  if (input === true || input === false) return input;
  const text = sanitize(input).toLowerCase();
  if (text === 'true' || text === '1' || text === 'yes') return true;
  if (text === 'false' || text === '0' || text === 'no') return false;
  return undefined;
}

function parseNumber(input: unknown, fallback: number): number {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function asTriggerStatus(value: string | null): LivingFileTriggerStatus | undefined {
  const status = sanitize(value).toLowerCase();
  if (status === 'queued' || status === 'acknowledged' || status === 'resolved') return status;
  return undefined;
}

export async function handleLivingFiles(
  req: IncomingMessage,
  res: ServerResponse,
  deps: LivingFilesRouteDeps,
): Promise<boolean> {
  if (!req.url || !req.url.startsWith('/api/living-files')) return false;

  const url = parseUrl(req);
  if (!url) {
    deps.sendJson(res, { ok: false, error: 'Bad request URL' }, 400);
    return true;
  }
  const method = req.method ?? 'GET';
  const pathname = url.pathname;
  const engine = getLivingFileEngine(deps.dataDir, deps.workspaceDir);

  if (method === 'GET' && pathname === '/api/living-files/dashboard') {
    const limit = Math.max(1, Math.min(1000, Math.trunc(parseNumber(url.searchParams.get('limit'), 200))));
    deps.sendJson(res, { ok: true, summary: engine.getDashboardSummary(limit) });
    return true;
  }

  if (method === 'GET' && pathname === '/api/living-files/files') {
    const ownerAgentId = sanitize(url.searchParams.get('ownerAgentId')) || undefined;
    deps.sendJson(res, { ok: true, files: engine.listFiles({ ownerAgentId }) });
    return true;
  }

  if (method === 'POST' && pathname === '/api/living-files/files') {
    const payload = parseJson<{
      filePath?: string;
      ownerAgentId?: string;
      expectedUpdateHours?: number;
      intentionallyStatic?: boolean;
      notes?: string;
    }>(await deps.readRequestBody(req, { maxBytes: 131_072 })) ?? {};

    try {
      const file = engine.registerFile({
        filePath: sanitize(payload.filePath),
        ownerAgentId: sanitize(payload.ownerAgentId) || 'agent',
        expectedUpdateHours: parseNumber(payload.expectedUpdateHours, 24),
        intentionallyStatic: parseBool(payload.intentionallyStatic),
        notes: sanitize(payload.notes) || undefined,
      });
      deps.sendJson(res, { ok: true, file }, 201);
      return true;
    } catch (err: unknown) {
      deps.sendJson(res, { ok: false, error: err instanceof Error ? err.message : 'Failed to register file' }, 400);
      return true;
    }
  }

  if (method === 'PATCH' && pathname.startsWith('/api/living-files/files/')) {
    const fileId = sanitize(pathname.split('/api/living-files/files/')[1]);
    if (!fileId) {
      deps.sendJson(res, { ok: false, error: 'fileId is required' }, 400);
      return true;
    }

    const payload = parseJson<{
      ownerAgentId?: string;
      expectedUpdateHours?: number;
      intentionallyStatic?: boolean;
      notes?: string;
    }>(await deps.readRequestBody(req, { maxBytes: 131_072 })) ?? {};

    try {
      const file = engine.updateFile(fileId, {
        ownerAgentId: payload.ownerAgentId == null ? undefined : sanitize(payload.ownerAgentId),
        expectedUpdateHours: payload.expectedUpdateHours,
        intentionallyStatic: parseBool(payload.intentionallyStatic),
        notes: payload.notes == null ? undefined : sanitize(payload.notes),
      });
      deps.sendJson(res, { ok: true, file });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update file';
      deps.sendJson(res, { ok: false, error: message }, /not found/i.test(message) ? 404 : 400);
      return true;
    }
  }

  if (method === 'DELETE' && pathname.startsWith('/api/living-files/files/')) {
    const fileId = sanitize(pathname.split('/api/living-files/files/')[1]);
    if (!fileId) {
      deps.sendJson(res, { ok: false, error: 'fileId is required' }, 400);
      return true;
    }
    const deleted = engine.unregisterFile(fileId);
    if (!deleted) {
      deps.sendJson(res, { ok: false, error: 'File not found' }, 404);
      return true;
    }
    deps.sendJson(res, { ok: true, deletedId: fileId });
    return true;
  }

  if (method === 'POST' && pathname === '/api/living-files/check-run') {
    const payload = parseJson<{ source?: string; autoTrigger?: boolean }>(
      await deps.readRequestBody(req, { maxBytes: 65_536 }),
    ) ?? {};
    const result = engine.runStalenessCheck({
      source: sanitize(payload.source) || 'manual',
      autoTrigger: parseBool(payload.autoTrigger),
    });
    deps.sendJson(res, { ok: true, ...result });
    return true;
  }

  if (method === 'GET' && pathname === '/api/living-files/triggers') {
    const status = asTriggerStatus(url.searchParams.get('status'));
    const fileId = sanitize(url.searchParams.get('fileId')) || undefined;
    const limit = Math.max(1, Math.min(1000, Math.trunc(parseNumber(url.searchParams.get('limit'), 200))));
    deps.sendJson(res, { ok: true, triggers: engine.listTriggers({ status, fileId, limit }) });
    return true;
  }

  if (method === 'POST' && pathname.startsWith('/api/living-files/triggers/')) {
    const suffix = pathname.split('/api/living-files/triggers/')[1] ?? '';
    const parts = suffix.split('/').filter(Boolean);
    const triggerId = sanitize(parts[0]);
    const action = sanitize(parts[1]).toLowerCase();
    if (!triggerId || (action !== 'acknowledge' && action !== 'resolve')) {
      deps.sendJson(res, { ok: false, error: 'Invalid trigger action route' }, 400);
      return true;
    }

    try {
      if (action === 'acknowledge') {
        const trigger = engine.acknowledgeTrigger(triggerId);
        deps.sendJson(res, { ok: true, trigger });
        return true;
      }
      const payload = parseJson<{ note?: string }>(await deps.readRequestBody(req, { maxBytes: 65_536 })) ?? {};
      const trigger = engine.resolveTrigger(triggerId, sanitize(payload.note));
      deps.sendJson(res, { ok: true, trigger });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update trigger';
      deps.sendJson(res, { ok: false, error: message }, /not found/i.test(message) ? 404 : 400);
      return true;
    }
  }

  deps.sendJson(res, { ok: false, error: 'Not found' }, 404);
  return true;
}

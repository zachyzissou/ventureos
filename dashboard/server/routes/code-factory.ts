/**
 * Code Factory API routes (Issue #220)
 */

import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  loadRiskPolicy,
  analyzeRiskTier,
  buildPreflightEvidence,
  createHarnessGap,
  loadHarnessGaps,
  updateHarnessGap,
  summarizeHarnessGapSla,
} from '../../../lib/code-factory.js';

export interface CodeFactoryRouteDeps {
  dataDir: string;
  workspaceDir: string;
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

function asStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean);
}

function harnessGapFile(dataDir: string): string {
  return path.join(dataDir, 'code-factory-harness-gaps.json');
}

export function handleCodeFactory(
  req: IncomingMessage,
  res: ServerResponse,
  deps: CodeFactoryRouteDeps,
): Promise<boolean> | boolean {
  if (!req.url || !req.url.startsWith('/api/code-factory')) return false;
  const url = parseUrl(req);
  if (!url) {
    deps.sendJson(res, { ok: false, error: 'Bad request URL' }, 400);
    return true;
  }

  const policyPath = path.join(deps.workspaceDir, '.github', 'code-factory', 'risk-policy.json');
  const policy = loadRiskPolicy(policyPath);

  if (url.pathname === '/api/code-factory/risk-policy' && req.method === 'GET') {
    deps.sendJson(res, { policy });
    return true;
  }

  if (url.pathname === '/api/code-factory/preflight' && req.method === 'POST') {
    return (async () => {
      const body = parseJson<{ prNumber?: number; headSha?: string; changedFiles?: unknown }>(
        await deps.readRequestBody(req),
      ) ?? {};
      const changedFiles = asStringArray(body.changedFiles);
      if (changedFiles.length === 0) {
        deps.sendJson(res, { ok: false, error: 'changedFiles[] is required' }, 400);
        return true;
      }
      const analysis = analyzeRiskTier(changedFiles, policy);
      const evidence = buildPreflightEvidence({
        prNumber: typeof body.prNumber === 'number' ? body.prNumber : 0,
        headSha: typeof body.headSha === 'string' ? body.headSha : '',
        analysis,
      });
      deps.sendJson(res, { ok: true, analysis, evidence });
      return true;
    })();
  }

  if (url.pathname === '/api/code-factory/harness-gaps' && req.method === 'GET') {
    const records = loadHarnessGaps(harnessGapFile(deps.dataDir));
    deps.sendJson(res, {
      total: records.length,
      records,
      summary: summarizeHarnessGapSla(records),
    });
    return true;
  }

  if (url.pathname === '/api/code-factory/harness-gaps' && req.method === 'POST') {
    return (async () => {
      const body = parseJson<{ incidentRef?: string; slaDays?: number }>(await deps.readRequestBody(req));
      const incidentRef = (body?.incidentRef ?? '').trim();
      if (!incidentRef) {
        deps.sendJson(res, { ok: false, error: 'incidentRef is required' }, 400);
        return true;
      }
      const record = createHarnessGap(
        harnessGapFile(deps.dataDir),
        { incident_ref: incidentRef, sla_days: body?.slaDays },
      );
      deps.sendJson(res, { ok: true, record }, 201);
      return true;
    })();
  }

  if (url.pathname.startsWith('/api/code-factory/harness-gaps/') && req.method === 'PATCH') {
    return (async () => {
      const id = url.pathname.split('/api/code-factory/harness-gaps/')[1]?.trim() ?? '';
      if (!id) {
        deps.sendJson(res, { ok: false, error: 'Invalid harness gap id' }, 400);
        return true;
      }
      const body = parseJson<{ testCaseAdded?: boolean }>(await deps.readRequestBody(req)) ?? {};
      const updated = updateHarnessGap(harnessGapFile(deps.dataDir), id, {
        test_case_added: body.testCaseAdded,
      });
      if (!updated) {
        deps.sendJson(res, { ok: false, error: 'Harness gap not found' }, 404);
        return true;
      }
      deps.sendJson(res, { ok: true, record: updated });
      return true;
    })();
  }

  deps.sendJson(res, { ok: false, error: 'Not found' }, 404);
  return true;
}


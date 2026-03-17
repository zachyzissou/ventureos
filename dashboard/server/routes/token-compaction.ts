/**
 * Token Compaction API routes (Issue #221)
 *
 * Endpoints:
 *   POST /api/token-compaction/run
 *   GET  /api/token-compaction/metrics
 */

import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  runTokenCompaction,
  type CompactionMetrics,
  type CompactorFileInput,
  type CompressionLevel,
} from '../../../lib/token-compactor.js';
import { normalizeCapabilityId } from '../../../lib/agent-identity.js';

export interface TokenCompactionDeps {
  dataDir: string;
  sendJson: (res: ServerResponse, data: unknown, status?: number) => void;
  readRequestBody: (req: IncomingMessage) => Promise<string>;
}

interface TokenCompactionRunPayload {
  sessionId?: string;
  agentId?: string;
  files: CompactorFileInput[];
  compression?: {
    level?: CompressionLevel;
    protected_files?: string[];
    max_processing_ms?: number;
  };
}

interface TokenCompactionMetricRecord extends CompactionMetrics {
  createdAtMs: number;
}

const METRICS_FILE = 'token-compaction-metrics.json';
const MAX_STORED_METRICS = 1000;

function readMetricsFile(filePath: string): TokenCompactionMetricRecord[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => entry as Partial<TokenCompactionMetricRecord>)
      .filter((entry) => typeof entry?.sessionId === 'string' && typeof entry?.createdAtMs === 'number')
      .map((entry) => entry as TokenCompactionMetricRecord);
  } catch {
    return [];
  }
}

function writeMetricsFile(filePath: string, metrics: TokenCompactionMetricRecord[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(metrics.slice(-MAX_STORED_METRICS), null, 2));
}

function appendMetric(filePath: string, metric: CompactionMetrics): void {
  const history = readMetricsFile(filePath);
  history.push({ ...metric, createdAtMs: Date.now() });
  writeMetricsFile(filePath, history);
}

function parseUrl(req: IncomingMessage): URL | null {
  try {
    return new URL(req.url ?? '', 'http://localhost');
  } catch {
    return null;
  }
}

function parseJsonSafely<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeLevel(levelRaw: string | undefined): CompressionLevel {
  if (levelRaw === 'conservative' || levelRaw === 'aggressive' || levelRaw === 'standard') return levelRaw;
  return 'standard';
}

function normalizeAgentId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return normalizeCapabilityId(raw) ?? undefined;
}

export function handleTokenCompaction(
  req: IncomingMessage,
  res: ServerResponse,
  deps: TokenCompactionDeps,
): Promise<boolean> | boolean {
  if (!req.url || !req.url.startsWith('/api/token-compaction')) return false;

  const url = parseUrl(req);
  if (!url) {
    deps.sendJson(res, { ok: false, error: 'Bad request URL' }, 400);
    return true;
  }

  const metricsPath = path.join(deps.dataDir, METRICS_FILE);

  if (url.pathname === '/api/token-compaction/metrics' && req.method === 'GET') {
    const limit = clampInt(url.searchParams.get('limit'), 100, 1, 500);
    const sessionId = (url.searchParams.get('sessionId') ?? '').trim();
    const rawAgentId = (url.searchParams.get('agentId') ?? '').trim();
    const agentId = normalizeAgentId(rawAgentId);
    if (rawAgentId && !agentId) {
      deps.sendJson(res, { ok: false, error: 'agentId must resolve to a canonical VentureOS capability' }, 400);
      return true;
    }

    const history = readMetricsFile(metricsPath)
      .filter((metric) => (!sessionId || metric.sessionId === sessionId))
      .filter((metric) => (!agentId || metric.agentId === agentId))
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, limit);

    const preTokens = history.reduce((sum, metric) => sum + metric.preTokens, 0);
    const postTokens = history.reduce((sum, metric) => sum + metric.postTokens, 0);
    const savedTokens = Math.max(0, preTokens - postTokens);
    const estimatedSavingsUsd = history.reduce((sum, metric) => sum + metric.estimatedSavingsUsd, 0);
    const bySession: Record<string, { runs: number; preTokens: number; postTokens: number; savedTokens: number }> = {};

    for (const metric of history) {
      const sid = metric.sessionId;
      if (!bySession[sid]) {
        bySession[sid] = { runs: 0, preTokens: 0, postTokens: 0, savedTokens: 0 };
      }
      bySession[sid].runs += 1;
      bySession[sid].preTokens += metric.preTokens;
      bySession[sid].postTokens += metric.postTokens;
      bySession[sid].savedTokens += Math.max(0, metric.preTokens - metric.postTokens);
    }

    deps.sendJson(res, {
      updatedAt: Date.now(),
      total: history.length,
      metrics: history,
      summary: {
        preTokens,
        postTokens,
        savedTokens,
        avgReductionPct: preTokens > 0 ? Number(((savedTokens / preTokens) * 100).toFixed(2)) : 0,
        estimatedSavingsUsd: Number(estimatedSavingsUsd.toFixed(6)),
        bySession,
      },
    });
    return true;
  }

  if (url.pathname === '/api/token-compaction/run' && req.method === 'POST') {
    return (async () => {
      const rawBody = await deps.readRequestBody(req);
      const payload = parseJsonSafely<TokenCompactionRunPayload>(rawBody);
      if (!payload || !Array.isArray(payload.files)) {
        deps.sendJson(res, { ok: false, error: 'Invalid payload: files[] is required' }, 400);
        return true;
      }

      if (payload.files.length > 500) {
        deps.sendJson(res, { ok: false, error: 'Too many files (max 500)' }, 400);
        return true;
      }

      const normalizedFiles: CompactorFileInput[] = [];
      for (const file of payload.files) {
        if (!file || typeof file.path !== 'string' || typeof file.content !== 'string') {
          deps.sendJson(res, { ok: false, error: 'Invalid file entry: expected { path, content }' }, 400);
          return true;
        }
        normalizedFiles.push({
          path: file.path,
          content: file.content,
          priority: Number.isFinite(file.priority) ? Number(file.priority) : undefined,
          updatedAtMs: Number.isFinite(file.updatedAtMs) ? Number(file.updatedAtMs) : undefined,
        });
      }

      const canonicalAgentId = normalizeAgentId(payload.agentId);
      if (payload.agentId && !canonicalAgentId) {
        deps.sendJson(res, { ok: false, error: 'agentId must resolve to a canonical VentureOS capability' }, 400);
        return true;
      }

      const result = runTokenCompaction(normalizedFiles, {
        level: normalizeLevel(payload.compression?.level),
        protectedFiles: Array.isArray(payload.compression?.protected_files)
          ? payload.compression?.protected_files.filter((v): v is string => typeof v === 'string')
          : undefined,
        maxProcessingMs: payload.compression?.max_processing_ms
          ? clampInt(String(payload.compression.max_processing_ms), 200, 25, 5000)
          : undefined,
        sessionId: payload.sessionId,
        agentId: canonicalAgentId,
      });

      appendMetric(metricsPath, result.metrics);
      deps.sendJson(res, {
        ok: true,
        result,
      });
      return true;
    })();
  }

  deps.sendJson(res, { ok: false, error: 'Not found' }, 404);
  return true;
}

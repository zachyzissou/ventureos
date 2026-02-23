/**
 * KPI route handlers.
 * Migrated from server/routes/kpis.js (Phase 3 — Issue #76).
 */

import fs from 'node:fs';
import path from 'node:path';

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { KpiDeps, KpiFileData } from '../types.js';

function listKpiFiles(kpiDir: string): string[] {
  try {
    if (!kpiDir || !fs.existsSync(kpiDir)) return [];
    return fs
      .readdirSync(kpiDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort();
  } catch {
    return [];
  }
}

function readKpiFile(
  kpiDir: string,
  file: string,
  safeReadJson: (filePath: string, fallback: null) => Record<string, unknown> | null,
): KpiFileData | null {
  const full: string = path.join(kpiDir, file);
  const j = safeReadJson(full, null) as KpiFileData | null;
  if (!j) return null;
  if (!j.date) j.date = file.replace(/\.json$/, '');
  return j;
}

function readFileMtimeMs(kpiDir: string, file: string): number {
  try {
    const full = path.join(kpiDir, file);
    const stat = fs.statSync(full);
    return Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : 0;
  } catch {
    return 0;
  }
}

export function handleKpis(req: IncomingMessage, res: ServerResponse, deps: KpiDeps): boolean {
  const { KPI_DIR, safeReadJson, sendJson, clampInt } = deps;
  if (!req || !res) return false;
  if (req.method && req.method !== 'GET') return false;

  if (req.url === '/api/kpis/latest') {
    const files: string[] = listKpiFiles(KPI_DIR);
    const latestFile: string | null = files[files.length - 1] ?? null;
    const latest: KpiFileData | null = latestFile ? readKpiFile(KPI_DIR, latestFile, safeReadJson) : null;
    const latestMtimeMs: number = latestFile ? readFileMtimeMs(KPI_DIR, latestFile) : 0;
    sendJson(res, { latest, file: latestFile, latestMtimeMs, dir: KPI_DIR, count: files.length });
    return true;
  }

  if (req.url && req.url.startsWith('/api/kpis/history')) {
    const params = new URL(req.url, 'http://localhost').searchParams;
    const days: number = clampInt(params.get('days') ?? '7', 1, 90, 7);

    const files: string[] = listKpiFiles(KPI_DIR);
    const slice: string[] = files.slice(Math.max(0, files.length - days));
    const items: KpiFileData[] = slice
      .map((f) => readKpiFile(KPI_DIR, f, safeReadJson))
      .filter((item): item is KpiFileData => item !== null);

    sendJson(res, { days, dir: KPI_DIR, files: slice, items, count: items.length });
    return true;
  }

  return false;
}

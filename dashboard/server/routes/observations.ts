/**
 * Observations route handlers.
 * Migrated from server/routes/observations.js (Phase 3 — Issue #76).
 */

import fs from 'node:fs';
import path from 'node:path';

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ObservationsDeps, ObservationFileMeta } from '../types.js';

function listObservationFiles(obsDir: string): ObservationFileMeta[] {
  try {
    if (!obsDir || !fs.existsSync(obsDir)) return [];
    return fs
      .readdirSync(obsDir)
      .filter((f) => f.endsWith('.md') || f.endsWith('.jsonl'))
      .map((f): ObservationFileMeta => {
        const full: string = path.join(obsDir, f);
        let st: fs.Stats | null = null;
        try {
          st = fs.statSync(full);
        } catch {
          // stat failed
        }
        return {
          path: f,
          full,
          mtimeMs: st ? st.mtimeMs : 0,
          size: st ? st.size : 0,
          type: f.endsWith('.jsonl') ? 'jsonl' : 'md',
        };
      })
      .sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
  } catch {
    return [];
  }
}

function fileDateFromName(name: string): string | null {
  const m: RegExpMatchArray | null = String(name || '').match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function readSnippet(fullPath: string, type: string, safeReadText: (fp: string, fb: string) => string): string {
  try {
    const maxChars: number = 600;
    const raw: string = safeReadText(fullPath, '');
    if (!raw) return '';

    if (type === 'jsonl') {
      const lines: string[] = raw.split('\n').filter((l) => l.trim());
      const tail: string[] = lines.slice(Math.max(0, lines.length - 10));
      return tail.join('\n').slice(-maxChars);
    }

    const flat: string = raw.replace(/\s+/g, ' ').trim();
    return flat.slice(0, maxChars);
  } catch {
    return '';
  }
}

function searchInText(text: string, qLower: string): string | null {
  const idx: number = text.toLowerCase().indexOf(qLower);
  if (idx < 0) return null;
  const start: number = Math.max(0, idx - 80);
  const end: number = Math.min(text.length, idx + qLower.length + 160);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

export function handleObservations(
  req: IncomingMessage,
  res: ServerResponse,
  deps: ObservationsDeps,
): boolean {
  const { OBSERVATIONS_DIR, safeReadText, sendJson, clampInt } = deps;
  if (!req || !res) return false;
  if (req.method && req.method !== 'GET') return false;

  if (req.url && req.url.startsWith('/api/observations/recent')) {
    const params = new URL(req.url, 'http://localhost').searchParams;
    const hours: number = clampInt(params.get('hours') ?? '24', 1, 24 * 30, 24);
    const cutoff: number = Date.now() - hours * 3600000;

    const files: ObservationFileMeta[] = listObservationFiles(OBSERVATIONS_DIR);
    const recent: ObservationFileMeta[] = files.filter((f) => (f.mtimeMs || 0) >= cutoff).slice(0, 200);
    const items = recent.map((f) => ({
      path: f.path,
      type: f.type,
      date: fileDateFromName(f.path),
      mtimeMs: f.mtimeMs,
      size: f.size,
      snippet: readSnippet(f.full, f.type, safeReadText),
    }));

    sendJson(res, { hours, cutoff, dir: OBSERVATIONS_DIR, count: items.length, items });
    return true;
  }

  if (req.url && req.url.startsWith('/api/observations/search')) {
    const params = new URL(req.url, 'http://localhost').searchParams;
    const q: string = (params.get('q') ?? '').trim();
    if (!q) {
      sendJson(res, { error: 'Missing q parameter', dir: OBSERVATIONS_DIR, count: 0, items: [] }, 400);
      return true;
    }

    const qLower: string = q.toLowerCase();
    const files: ObservationFileMeta[] = listObservationFiles(OBSERVATIONS_DIR);

    const items: Array<{
      path: string;
      type: string;
      date: string | null;
      mtimeMs: number;
      size: number;
      match: string;
    }> = [];

    for (const f of files) {
      if (items.length >= 100) break;
      const raw: string = safeReadText(f.full, '');
      if (!raw) continue;
      const match: string | null = searchInText(raw, qLower);
      if (!match) continue;
      items.push({
        path: f.path,
        type: f.type,
        date: fileDateFromName(f.path),
        mtimeMs: f.mtimeMs,
        size: f.size,
        match,
      });
    }

    sendJson(res, { q, dir: OBSERVATIONS_DIR, count: items.length, items });
    return true;
  }

  return false;
}

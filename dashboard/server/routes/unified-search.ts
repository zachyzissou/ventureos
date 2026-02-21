/**
 * Unified Search — Issue #302
 *
 * GET /api/search/unified?q=<query>&limit=50&offset=0&sources=memory,replay,obsidian
 *
 * Returns mixed-source search results across:
 * - Replay artifacts (session metadata + event payload snippets)
 * - Memory files (observational markdown/json files)
 * - Obsidian mission notes (from configured connector vault/folder)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const MAX_NOTE_SCAN = 1500;
const MAX_READ_BYTES = 128_000;
const DEFAULT_LIMIT = 50;

type UnifiedSource = 'memory' | 'replay' | 'obsidian';

type UnifiedSearchResult = {
  id: string;
  source: UnifiedSource;
  title: string;
  snippet: string;
  score: number;
  updatedAt: number;
  target: {
    type: 'path' | 'replay-session';
    path?: string;
    sessionId?: string;
  };
};

interface UnifiedSearchDeps {
  dataDir: string;
  observationsDir: string;
  sendJson: (res: ServerResponse, data: unknown, status?: number) => void;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function hasDotObsidianSegment(p: string): boolean {
  return p.split(/[\\/]+/).some((seg) => seg === '.obsidian');
}

function normalizeRelativePath(input: string): string | null {
  const raw = input.replace(/\\/g, '/').trim();
  if (!raw) return null;
  if (raw.startsWith('/')) return null;
  const normalized = path.posix.normalize(raw).replace(/^\/+/, '');
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    return null;
  }
  if (hasDotObsidianSegment(normalized)) return null;
  return normalized;
}

function resolveInside(basePath: string, relPath: string): string | null {
  const root = path.resolve(basePath);
  const target = path.resolve(root, relPath);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}

function obsidianAppConfigPath(): string {
  return process.env.OBSIDIAN_CONFIG_PATH
    ?? path.join(os.homedir(), 'Library', 'Application Support', 'obsidian', 'obsidian.json');
}

function readObsidianVaultPath(dataDir: string): { vaultPath: string; missionFolder: string } | null {
  const fp = path.join(dataDir, 'obsidian-connector.json');
  try {
    if (!fs.existsSync(fp)) return null;
    const parsed = JSON.parse(fs.readFileSync(fp, 'utf8')) as Record<string, unknown>;

    let vaultPath = typeof parsed.vaultPath === 'string' && parsed.vaultPath.trim()
      ? path.resolve(parsed.vaultPath)
      : '';
    const vaultId = typeof parsed.vaultId === 'string' ? parsed.vaultId.trim() : '';
    if (!vaultPath && vaultId) {
      const appCfgPath = obsidianAppConfigPath();
      if (fs.existsSync(appCfgPath)) {
        const appCfg = JSON.parse(fs.readFileSync(appCfgPath, 'utf8')) as Record<string, unknown>;
        const vaults = isObject(appCfg.vaults) ? appCfg.vaults : null;
        if (vaults && isObject(vaults[vaultId]) && typeof vaults[vaultId].path === 'string') {
          vaultPath = path.resolve(vaults[vaultId].path);
        }
      }
    }
    if (!vaultPath || !fs.existsSync(vaultPath) || hasDotObsidianSegment(vaultPath)) return null;

    const missionFolder = typeof parsed.missionFolder === 'string'
      ? normalizeRelativePath(parsed.missionFolder)
      : null;
    return {
      vaultPath,
      missionFolder: missionFolder || 'VentureOS/Missions',
    };
  } catch {
    return null;
  }
}

function collectFiles(rootDir: string, exts: string[], maxFiles = MAX_NOTE_SCAN): string[] {
  const out: string[] = [];
  if (!fs.existsSync(rootDir)) return out;
  const allowed = new Set(exts.map((x) => x.toLowerCase()));
  const stack = [rootDir];
  while (stack.length > 0 && out.length < maxFiles) {
    const dir = stack.pop() as string;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!allowed.has(ext)) continue;
      out.push(full);
      if (out.length >= maxFiles) break;
    }
  }
  return out;
}

function compactSnippet(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 320);
}

function scoreDocument(q: string, title: string, docPath: string, snippet: string): number {
  const qq = q.toLowerCase();
  let score = 0;
  if (title.toLowerCase().includes(qq)) score += 6;
  if (docPath.toLowerCase().includes(qq)) score += 4;
  if (snippet.toLowerCase().includes(qq)) score += 2;
  return score;
}

function searchMemoryFiles(observationsDir: string, q: string): UnifiedSearchResult[] {
  const out: UnifiedSearchResult[] = [];
  const files = collectFiles(observationsDir, ['.md', '.json'], 400);
  for (const fp of files) {
    let text = '';
    let st: fs.Stats;
    try {
      st = fs.statSync(fp);
      text = fs.readFileSync(fp, 'utf8').slice(0, MAX_READ_BYTES);
    } catch {
      continue;
    }
    const rel = path.relative(observationsDir, fp).split(path.sep).join('/');
    const title = path.basename(fp);
    const snippet = compactSnippet(text);
    const score = scoreDocument(q, title, rel, snippet);
    if (score <= 0) continue;
    out.push({
      id: `memory:${rel}`,
      source: 'memory',
      title,
      snippet,
      score,
      updatedAt: st.mtimeMs,
      target: { type: 'path', path: rel },
    });
  }
  return out;
}

function searchReplayArtifacts(dataDir: string, q: string): UnifiedSearchResult[] {
  const out: UnifiedSearchResult[] = [];
  const indexPath = path.join(dataDir, 'replay', 'sessions.json');
  if (!fs.existsSync(indexPath)) return out;

  let index: unknown;
  try {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch {
    return out;
  }
  if (!isObject(index) || !Array.isArray(index.sessions)) return out;

  for (const raw of index.sessions) {
    if (!isObject(raw)) continue;
    const id = typeof raw.id === 'string' ? raw.id : '';
    if (!id) continue;
    const name = typeof raw.name === 'string' ? raw.name : id;
    const description = typeof raw.description === 'string' ? raw.description : '';
    const startedAt = typeof raw.startedAt === 'number' ? raw.startedAt : Date.now();
    const detailPath = path.join(dataDir, 'replay', 'sessions', `${id}.json`);
    let eventsSnippet = '';
    if (fs.existsSync(detailPath)) {
      try {
        const detail = JSON.parse(fs.readFileSync(detailPath, 'utf8')) as Record<string, unknown>;
        if (Array.isArray(detail.events)) {
          eventsSnippet = compactSnippet(JSON.stringify(detail.events.slice(0, 8)));
        }
      } catch {
        // ignore individual corrupt session detail
      }
    }
    const snippet = compactSnippet([description, eventsSnippet].filter(Boolean).join(' '));
    const score = scoreDocument(q, name, id, snippet);
    if (score <= 0) continue;
    out.push({
      id: `replay:${id}`,
      source: 'replay',
      title: name,
      snippet,
      score,
      updatedAt: startedAt,
      target: { type: 'replay-session', sessionId: id },
    });
  }
  return out;
}

function searchObsidian(dataDir: string, q: string): UnifiedSearchResult[] {
  const out: UnifiedSearchResult[] = [];
  const cfg = readObsidianVaultPath(dataDir);
  if (!cfg) return out;
  const targetDir = resolveInside(cfg.vaultPath, cfg.missionFolder);
  if (!targetDir || !fs.existsSync(targetDir)) return out;

  const files = collectFiles(targetDir, ['.md'], MAX_NOTE_SCAN);
  for (const fp of files) {
    let text = '';
    let st: fs.Stats;
    try {
      st = fs.statSync(fp);
      text = fs.readFileSync(fp, 'utf8').slice(0, MAX_READ_BYTES);
    } catch {
      continue;
    }
    const rel = path.relative(cfg.vaultPath, fp).split(path.sep).join('/');
    const title = path.basename(fp, '.md');
    const snippet = compactSnippet(text);
    const score = scoreDocument(q, title, rel, snippet);
    if (score <= 0) continue;
    out.push({
      id: `obsidian:${rel}`,
      source: 'obsidian',
      title,
      snippet,
      score,
      updatedAt: st.mtimeMs,
      target: { type: 'path', path: rel },
    });
  }
  return out;
}

export async function handleUnifiedSearch(
  req: IncomingMessage,
  res: ServerResponse,
  deps: UnifiedSearchDeps,
): Promise<boolean> {
  if (!req.url) return false;
  if ((req.method || 'GET').toUpperCase() !== 'GET') return false;

  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/api/search/unified') return false;

  const q = (url.searchParams.get('q') || '').trim();
  if (!q) {
    deps.sendJson(res, { ok: false, error: 'q is required' }, 400);
    return true;
  }

  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || DEFAULT_LIMIT, 200));
  const offset = Math.max(0, Math.min(Number(url.searchParams.get('offset')) || 0, 100_000));
  const sourceParam = (url.searchParams.get('sources') || '').trim().toLowerCase();
  const requested = sourceParam
    ? new Set(
      sourceParam
        .split(',')
        .map((s) => s.trim())
        .filter((s): s is UnifiedSource => s === 'memory' || s === 'replay' || s === 'obsidian'),
    )
    : new Set<UnifiedSource>(['memory', 'replay', 'obsidian']);

  const all: UnifiedSearchResult[] = [];
  if (requested.has('memory')) all.push(...searchMemoryFiles(deps.observationsDir, q));
  if (requested.has('replay')) all.push(...searchReplayArtifacts(deps.dataDir, q));
  if (requested.has('obsidian')) all.push(...searchObsidian(deps.dataDir, q));

  all.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.updatedAt - a.updatedAt;
  });

  const total = all.length;
  const results = all.slice(offset, offset + limit);
  const counts = {
    memory: all.filter((r) => r.source === 'memory').length,
    replay: all.filter((r) => r.source === 'replay').length,
    obsidian: all.filter((r) => r.source === 'obsidian').length,
  };

  deps.sendJson(res, {
    ok: true,
    q,
    total,
    limit,
    offset,
    counts,
    results,
    updatedAt: Date.now(),
  });
  return true;
}

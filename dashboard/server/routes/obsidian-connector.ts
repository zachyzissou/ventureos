/**
 * Obsidian Vault Connector — Issue #299
 *
 * Endpoints:
 *   GET  /api/obsidian/vaults          Discover local Obsidian vaults.
 *   GET  /api/obsidian/config          Read connector config.
 *   PUT  /api/obsidian/config          Update connector config.
 *   GET  /api/obsidian/notes           Index/search markdown notes.
 *   POST /api/obsidian/notes/write     Safe markdown write adapter.
 *
 * Safety:
 * - Never writes Obsidian app config internals.
 * - Rejects writes targeting any `.obsidian/` path segment.
 * - Enforces writes remain inside configured vault root.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  isObsidianTemplateKind,
  renderObsidianStructuredAppend,
  renderObsidianTemplateNote,
} from '../obsidian-note-templates.js';

const DEFAULT_MISSION_FOLDER = 'VentureOS/Missions';
const MAX_NOTE_SCAN = 2000;
const MAX_NOTE_BYTES = 128_000;
const MAX_WRITE_BYTES = 512_000;

interface ObsidianVaultMeta {
  id: string;
  name: string;
  path: string;
  exists: boolean;
}

interface ObsidianConnectorConfig {
  version: number;
  vaultId: string | null;
  vaultPath: string | null;
  missionFolder: string;
  updatedAt: number;
}

interface ObsidianConnectorDeps {
  dataDir: string;
  sendJson: (res: ServerResponse, data: unknown, status?: number) => void;
  readRequestBody: (req: IncomingMessage, opts?: { maxBytes?: number }) => Promise<string>;
}

function connectorConfigPath(dataDir: string): string {
  return path.join(dataDir, 'obsidian-connector.json');
}

function obsidianAppConfigPath(): string {
  return process.env.OBSIDIAN_CONFIG_PATH
    ?? path.join(os.homedir(), 'Library', 'Application Support', 'obsidian', 'obsidian.json');
}

function defaultConnectorConfig(): ObsidianConnectorConfig {
  return {
    version: 1,
    vaultId: null,
    vaultPath: null,
    missionFolder: DEFAULT_MISSION_FOLDER,
    updatedAt: Date.now(),
  };
}

function sendError(
  deps: ObsidianConnectorDeps,
  res: ServerResponse,
  status: number,
  error: string,
): true {
  deps.sendJson(res, { ok: false, error }, status);
  return true;
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

function resolveInsideVault(vaultPath: string, relPath: string): string | null {
  const resolvedVault = path.resolve(vaultPath);
  const target = path.resolve(resolvedVault, relPath);
  if (target !== resolvedVault && !target.startsWith(resolvedVault + path.sep)) return null;
  if (hasDotObsidianSegment(path.relative(resolvedVault, target))) return null;
  return target;
}

function toPosixRelative(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join('/');
}

function safeMissionSlug(missionId: string): string {
  const slug = missionId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return (slug || 'mission').slice(0, 120);
}

function parseFrontmatter(markdown: string): { frontmatter: Record<string, string>; body: string } {
  if (!markdown.startsWith('---\n')) return { frontmatter: {}, body: markdown };
  const end = markdown.indexOf('\n---\n', 4);
  if (end < 0) return { frontmatter: {}, body: markdown };
  const fmRaw = markdown.slice(4, end);
  const body = markdown.slice(end + 5);
  const frontmatter: Record<string, string> = {};
  for (const line of fmRaw.split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key) frontmatter[key] = val;
  }
  return { frontmatter, body };
}

function loadVaults(): ObsidianVaultMeta[] {
  try {
    const fp = obsidianAppConfigPath();
    if (!fs.existsSync(fp)) return [];
    const parsed = JSON.parse(fs.readFileSync(fp, 'utf8')) as unknown;
    if (!isObject(parsed) || !isObject(parsed.vaults)) return [];
    const out: ObsidianVaultMeta[] = [];
    for (const [id, raw] of Object.entries(parsed.vaults)) {
      if (!isObject(raw)) continue;
      const p = typeof raw.path === 'string' ? path.resolve(raw.path) : '';
      if (!p) continue;
      out.push({
        id,
        name: path.basename(p) || id,
        path: p,
        exists: fs.existsSync(p),
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function loadConnectorConfig(dataDir: string): ObsidianConnectorConfig {
  const fp = connectorConfigPath(dataDir);
  if (!fs.existsSync(fp)) return defaultConnectorConfig();
  try {
    const parsed = JSON.parse(fs.readFileSync(fp, 'utf8')) as unknown;
    if (!isObject(parsed)) return defaultConnectorConfig();
    const cfg: ObsidianConnectorConfig = {
      version: 1,
      vaultId: typeof parsed.vaultId === 'string' && parsed.vaultId.trim() ? parsed.vaultId.trim() : null,
      vaultPath: typeof parsed.vaultPath === 'string' && parsed.vaultPath.trim() ? path.resolve(parsed.vaultPath) : null,
      missionFolder: typeof parsed.missionFolder === 'string' ? parsed.missionFolder : DEFAULT_MISSION_FOLDER,
      updatedAt: typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt)
        ? Math.trunc(parsed.updatedAt)
        : Date.now(),
    };
    const safeMissionFolder = normalizeRelativePath(cfg.missionFolder) || DEFAULT_MISSION_FOLDER;
    cfg.missionFolder = safeMissionFolder;
    return cfg;
  } catch {
    return defaultConnectorConfig();
  }
}

function saveConnectorConfig(dataDir: string, cfg: ObsidianConnectorConfig): void {
  const fp = connectorConfigPath(dataDir);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(cfg, null, 2));
}

function resolveActiveVault(
  cfg: ObsidianConnectorConfig,
  vaults: ObsidianVaultMeta[],
): ObsidianVaultMeta | null {
  if (cfg.vaultPath && fs.existsSync(cfg.vaultPath) && !hasDotObsidianSegment(cfg.vaultPath)) {
    const vaultPath = path.resolve(cfg.vaultPath);
    const byPath = vaults.find((v) => path.resolve(v.path) === vaultPath);
    return byPath || {
      id: cfg.vaultId || 'custom',
      name: path.basename(vaultPath),
      path: vaultPath,
      exists: true,
    };
  }
  if (cfg.vaultId) {
    const byId = vaults.find((v) => v.id === cfg.vaultId && v.exists);
    if (byId) return byId;
  }
  return null;
}

function collectMarkdownFiles(rootDir: string, maxFiles = MAX_NOTE_SCAN): string[] {
  const out: string[] = [];
  if (!fs.existsSync(rootDir)) return out;
  const stack = [rootDir];
  while (stack.length > 0 && out.length < maxFiles) {
    const dir = stack.pop() as string;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (hasDotObsidianSegment(full)) continue;
      if (e.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        out.push(full);
        if (out.length >= maxFiles) break;
      }
    }
  }
  return out;
}

function parseNoteTitle(body: string, fallback: string): string {
  const firstHeading = body.match(/^#\s+(.+)$/m);
  if (firstHeading?.[1]) return firstHeading[1].trim().slice(0, 200);
  return fallback;
}

function normalizeSectionItems(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => !!item)
      .slice(0, 20);
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function extractStructuredSections(body: Record<string, unknown>): {
  decisions: string[];
  risks: string[];
  nextActions: string[];
} | null {
  const sectionsSource = isObject(body.sections) ? body.sections : body;
  const decisions = normalizeSectionItems(sectionsSource.decisions);
  const risks = normalizeSectionItems(sectionsSource.risks);
  const nextActions = normalizeSectionItems(sectionsSource.nextActions);
  if (!decisions.length && !risks.length && !nextActions.length) return null;
  return { decisions, risks, nextActions };
}

export async function handleObsidianConnector(
  req: IncomingMessage,
  res: ServerResponse,
  deps: ObsidianConnectorDeps,
): Promise<boolean> {
  if (!req.url) return false;
  const method = (req.method || 'GET').toUpperCase();
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  if (!pathname.startsWith('/api/obsidian')) return false;

  // GET /api/obsidian/vaults
  if (method === 'GET' && pathname === '/api/obsidian/vaults') {
    const vaults = loadVaults();
    deps.sendJson(res, {
      ok: true,
      updatedAt: Date.now(),
      obsidianConfigPath: obsidianAppConfigPath(),
      vaults,
      count: vaults.length,
    });
    return true;
  }

  // GET /api/obsidian/config
  if (method === 'GET' && pathname === '/api/obsidian/config') {
    const config = loadConnectorConfig(deps.dataDir);
    const vaults = loadVaults();
    deps.sendJson(res, {
      ok: true,
      updatedAt: Date.now(),
      config,
      activeVault: resolveActiveVault(config, vaults),
      vaults,
    });
    return true;
  }

  // PUT /api/obsidian/config
  if (method === 'PUT' && pathname === '/api/obsidian/config') {
    let body: unknown;
    try {
      const raw = await deps.readRequestBody(req, { maxBytes: 64_000 });
      body = JSON.parse(raw);
    } catch {
      return sendError(deps, res, 400, 'invalid JSON body');
    }
    if (!isObject(body)) return sendError(deps, res, 400, 'body must be an object');

    const current = loadConnectorConfig(deps.dataDir);
    const vaults = loadVaults();
    const next: ObsidianConnectorConfig = { ...current, updatedAt: Date.now() };

    if (typeof body.missionFolder === 'string') {
      const normalized = normalizeRelativePath(body.missionFolder);
      if (!normalized) return sendError(deps, res, 400, 'missionFolder must be a safe relative path');
      next.missionFolder = normalized;
    }

    const vaultIdValue = typeof body.vaultId === 'string' ? body.vaultId.trim() : '';
    if (vaultIdValue) {
      const v = vaults.find((x) => x.id === vaultIdValue);
      if (!v) return sendError(deps, res, 400, `unknown vaultId: ${vaultIdValue}`);
      if (!v.exists) return sendError(deps, res, 400, `vault path does not exist: ${v.path}`);
      next.vaultId = v.id;
      next.vaultPath = path.resolve(v.path);
    } else if (typeof body.vaultPath === 'string' && body.vaultPath.trim()) {
      const resolved = path.resolve(body.vaultPath.trim());
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        return sendError(deps, res, 400, 'vaultPath must exist and be a directory');
      }
      if (hasDotObsidianSegment(resolved)) {
        return sendError(deps, res, 400, 'vaultPath cannot point inside .obsidian');
      }
      const known = vaults.find((x) => path.resolve(x.path) === resolved);
      next.vaultId = known?.id || null;
      next.vaultPath = resolved;
    }

    saveConnectorConfig(deps.dataDir, next);
    deps.sendJson(res, {
      ok: true,
      config: next,
      activeVault: resolveActiveVault(next, vaults),
    });
    return true;
  }

  // GET /api/obsidian/notes
  if (method === 'GET' && pathname === '/api/obsidian/notes') {
    const config = loadConnectorConfig(deps.dataDir);
    const activeVault = resolveActiveVault(config, loadVaults());
    if (!activeVault) return sendError(deps, res, 400, 'connector is not configured with a valid vault');

    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 100, 500));
    const folderParam = url.searchParams.get('folder');
    const folder = folderParam ? normalizeRelativePath(folderParam) : config.missionFolder;
    if (!folder) return sendError(deps, res, 400, 'folder must be a safe relative path');
    const targetDir = resolveInsideVault(activeVault.path, folder);
    if (!targetDir) return sendError(deps, res, 400, 'folder resolves outside configured vault');

    const files = collectMarkdownFiles(targetDir, MAX_NOTE_SCAN);
    const results = [];
    for (const filePath of files) {
      if (results.length >= limit) break;
      let raw = '';
      let st: fs.Stats;
      try {
        st = fs.statSync(filePath);
        raw = fs.readFileSync(filePath, 'utf8').slice(0, MAX_NOTE_BYTES);
      } catch {
        continue;
      }
      const relPath = toPosixRelative(activeVault.path, filePath);
      const { frontmatter, body } = parseFrontmatter(raw);
      const title = parseNoteTitle(body, path.basename(filePath, '.md'));
      const snippet = body.replace(/\s+/g, ' ').trim().slice(0, 280);
      const hay = `${relPath} ${title} ${snippet} ${frontmatter.missionId || ''}`.toLowerCase();
      if (q && !hay.includes(q)) continue;

      results.push({
        path: relPath,
        title,
        missionId: frontmatter.missionId || null,
        status: frontmatter.status || null,
        owner: frontmatter.owner || null,
        updatedAt: st.mtimeMs,
        snippet,
      });
    }

    results.sort((a, b) => b.updatedAt - a.updatedAt);
    deps.sendJson(res, {
      ok: true,
      vault: { id: activeVault.id, name: activeVault.name, path: activeVault.path },
      folder,
      total: results.length,
      notes: results,
    });
    return true;
  }

  // POST /api/obsidian/notes/write
  if (method === 'POST' && pathname === '/api/obsidian/notes/write') {
    const config = loadConnectorConfig(deps.dataDir);
    const activeVault = resolveActiveVault(config, loadVaults());
    if (!activeVault) return sendError(deps, res, 400, 'connector is not configured with a valid vault');

    let body: unknown;
    try {
      const raw = await deps.readRequestBody(req, { maxBytes: MAX_WRITE_BYTES });
      body = JSON.parse(raw);
    } catch {
      return sendError(deps, res, 400, 'invalid JSON body');
    }
    if (!isObject(body)) return sendError(deps, res, 400, 'body must be an object');

    const templateRaw = typeof body.template === 'string' ? body.template.trim().toLowerCase() : '';
    const template = templateRaw && isObsidianTemplateKind(templateRaw) ? templateRaw : null;
    if (templateRaw && !template) {
      return sendError(deps, res, 400, 'template must be one of: mission, pr-review, decision-log, blocker-log');
    }
    const structuredSections = extractStructuredSections(body);
    const markdown = typeof body.markdown === 'string' ? body.markdown : '';
    if (!markdown.trim() && !template && !structuredSections) {
      return sendError(deps, res, 400, 'markdown, template, or structured sections are required');
    }

    let relativePath: string | null = null;
    if (typeof body.relativePath === 'string' && body.relativePath.trim()) {
      relativePath = normalizeRelativePath(body.relativePath);
      if (!relativePath) return sendError(deps, res, 400, 'relativePath must be a safe relative path');
      if (!relativePath.toLowerCase().endsWith('.md')) relativePath += '.md';
    } else if (typeof body.missionId === 'string' && body.missionId.trim()) {
      const missionSlug = safeMissionSlug(body.missionId);
      relativePath = `${config.missionFolder}/${missionSlug}.md`;
    } else {
      return sendError(deps, res, 400, 'relativePath or missionId is required');
    }

    const safeRelative = normalizeRelativePath(relativePath);
    if (!safeRelative) return sendError(deps, res, 400, 'note path is invalid');
    const targetPath = resolveInsideVault(activeVault.path, safeRelative);
    if (!targetPath) return sendError(deps, res, 400, 'note path resolves outside configured vault');
    if (hasDotObsidianSegment(targetPath)) return sendError(deps, res, 400, 'writes to .obsidian are forbidden');

    const mode = body.mode === 'append' ? 'append' : 'overwrite';
    const exists = fs.existsSync(targetPath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    let content = markdown;
    const missionIdForTemplate = typeof body.missionId === 'string' && body.missionId.trim()
      ? body.missionId.trim()
      : path.basename(safeRelative, '.md');
    const prNumber = typeof body.prNumber === 'number' && Number.isFinite(body.prNumber)
      ? Math.trunc(body.prNumber)
      : null;
    const status = typeof body.status === 'string' && body.status.trim() ? body.status.trim() : 'open';
    const owner = typeof body.owner === 'string' && body.owner.trim() ? body.owner.trim() : 'nexus';
    const title = typeof body.title === 'string' && body.title.trim()
      ? body.title.trim()
      : missionIdForTemplate;
    const updatedAtIso = new Date().toISOString();

    if (!exists && template) {
      content = renderObsidianTemplateNote(template, {
        missionId: missionIdForTemplate,
        prNumber,
        status,
        owner,
        updatedAt: updatedAtIso,
      }, {
        title,
        summary: markdown.trim() || undefined,
      });
    } else if (!exists && typeof body.title === 'string' && body.title.trim()) {
      const hasHeading = /^\s*#\s+/m.test(markdown) || /^\s*---\n/.test(markdown);
      if (!hasHeading) content = `# ${body.title.trim().slice(0, 180)}\n\n${markdown}`;
    }

    const structuredAppend = structuredSections
      ? renderObsidianStructuredAppend(structuredSections, updatedAtIso)
      : '';
    if (mode !== 'append' && !content.trim() && structuredAppend) content = structuredAppend;
    let bytesWritten = Buffer.byteLength(content);

    if (mode === 'append' && exists) {
      const appendBody = [content.trim(), structuredAppend.trim()].filter(Boolean).join('\n\n');
      if (!appendBody) return sendError(deps, res, 400, 'append requires markdown or structured sections');
      fs.appendFileSync(targetPath, `\n\n${appendBody}`);
      bytesWritten = Buffer.byteLength(appendBody);
    } else {
      fs.writeFileSync(targetPath, content);
    }

    deps.sendJson(res, {
      ok: true,
      path: safeRelative,
      mode,
      created: !exists,
      bytes: bytesWritten,
      template,
      updatedAt: Date.now(),
    });
    return true;
  }

  return false;
}

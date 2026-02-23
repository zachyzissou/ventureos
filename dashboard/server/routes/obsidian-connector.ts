/**
 * Obsidian Vault Connector — Issue #299
 *
 * Endpoints:
 *   GET  /api/obsidian/vaults          Discover local Obsidian vaults.
 *   GET  /api/obsidian/config          Read connector config.
 *   PUT  /api/obsidian/config          Update connector config.
 *   GET  /api/obsidian/notes           Index/search markdown notes.
 *   POST /api/obsidian/daily-digest    Upsert daily ops digest note.
 *   POST /api/obsidian/notes/write     Safe markdown write adapter.
 *   POST /api/obsidian/journals/write  Append strict agent journal snapshot.
 *
 * Safety:
 * - Never writes Obsidian app config internals.
 * - Rejects writes targeting any `.obsidian/` path segment.
 * - Enforces writes remain inside configured vault root.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { execFileSync } from 'node:child_process';
import {
  isObsidianTemplateKind,
  renderObsidianStructuredAppend,
  renderObsidianTemplateNote,
} from '../obsidian-note-templates.js';
import {
  DEFAULT_OBSIDIAN_MISSION_FOLDER as DEFAULT_MISSION_FOLDER,
  hasDotObsidianSegment,
  normalizeRelativePath,
  obsidianAppConfigPath,
  resolveInsideVault,
} from './obsidian-path-utils.js';

const MAX_NOTE_SCAN = 2000;
const MAX_NOTE_BYTES = 128_000;
const MAX_WRITE_BYTES = 512_000;
const MAX_JOURNAL_SUMMARY = 600;
const MAX_JOURNAL_POINTS = 8;
const DEFAULT_JOURNAL_FOLDER = 'VentureOS/Missions/Agent Journals';
const JOURNAL_ROLES = ['nexus', 'oracle', 'atlas', 'sentinel', 'verifier', 'archivist', 'synth', 'echo'] as const;
type JournalRole = (typeof JOURNAL_ROLES)[number];

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
  journalFolder: string;
  journalRoles: Record<JournalRole, boolean>;
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

function defaultConnectorConfig(): ObsidianConnectorConfig {
  return {
    version: 1,
    vaultId: null,
    vaultPath: null,
    missionFolder: DEFAULT_MISSION_FOLDER,
    journalFolder: DEFAULT_JOURNAL_FOLDER,
    journalRoles: defaultJournalRoles(),
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

function defaultJournalRoles(): Record<JournalRole, boolean> {
  return {
    nexus: false,
    oracle: false,
    atlas: false,
    sentinel: false,
    verifier: false,
    archivist: false,
    synth: false,
    echo: false,
  };
}

function isJournalRole(value: string): value is JournalRole {
  return (JOURNAL_ROLES as readonly string[]).includes(value);
}

function parseJournalRoles(raw: unknown): Record<JournalRole, boolean> | null {
  if (!isObject(raw)) return null;
  const next = defaultJournalRoles();
  for (const [k, v] of Object.entries(raw)) {
    if (!isJournalRole(k)) return null;
    if (typeof v !== 'boolean') return null;
    next[k] = v;
  }
  return next;
}

function cleanJournalLine(value: unknown, maxLen = 220): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function parseJournalList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    const line = cleanJournalLine(entry);
    if (!line) continue;
    out.push(line);
    if (out.length >= MAX_JOURNAL_POINTS) break;
  }
  return out;
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
      journalFolder: typeof parsed.journalFolder === 'string' ? parsed.journalFolder : DEFAULT_JOURNAL_FOLDER,
      journalRoles: defaultJournalRoles(),
      updatedAt: typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt)
        ? Math.trunc(parsed.updatedAt)
        : Date.now(),
    };
    const safeMissionFolder = normalizeRelativePath(cfg.missionFolder) || DEFAULT_MISSION_FOLDER;
    const safeJournalFolder = normalizeRelativePath(cfg.journalFolder) || DEFAULT_JOURNAL_FOLDER;
    const parsedJournalRoles = parseJournalRoles(parsed.journalRoles);
    cfg.missionFolder = safeMissionFolder;
    cfg.journalFolder = safeJournalFolder;
    if (parsedJournalRoles) cfg.journalRoles = parsedJournalRoles;
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

function toIsoDay(input: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const d = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function todayIsoDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function getRepoFromRemote(): string | null {
  const envRepo = process.env.GITHUB_REPOSITORY;
  if (typeof envRepo === 'string' && /^[^/]+\/[^/]+$/.test(envRepo.trim())) return envRepo.trim();

  try {
    const remote = execFileSync('git', ['config', '--get', 'remote.origin.url'], {
      encoding: 'utf8',
      timeout: 10_000,
      maxBuffer: 10 * 1024 * 1024,
    }).trim();
    const m = remote.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/i);
    return m?.[1] || null;
  } catch {
    return null;
  }
}

function runGhJson(args: string[]): unknown | null {
  try {
    const raw = execFileSync('gh', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function parseDigestLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
    .slice(0, 200);
}

function formatBulletLines(lines: string[], emptyLabel: string): string {
  if (!lines.length) return `- ${emptyLabel}`;
  return lines.map((line) => `- ${line}`).join('\n');
}

function upsertManagedDigestSection(doc: string, id: string, title: string, body: string): string {
  const start = `<!-- ventureos-digest:${id}:start -->`;
  const end = `<!-- ventureos-digest:${id}:end -->`;
  const escapedStart = start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedEnd = end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cleanup = new RegExp(`\\n*${escapedStart}[\\s\\S]*?${escapedEnd}\\n*`, 'g');
  const trimmed = doc.replace(cleanup, '').trimEnd();
  const block = `${start}\n## ${title}\n${body.trim()}\n${end}`;
  return `${trimmed}\n\n${block}\n`;
}

function ensureJournalDocSeed(role: JournalRole, day: string): string {
  return [
    '---',
    `journalRole: ${role}`,
    `updatedAt: ${new Date().toISOString()}`,
    '---',
    '',
    `# Agent Journal — ${role.toUpperCase()} (${day})`,
    '',
    '_Strict role snapshot stream (structured updates only)._',
    '',
  ].join('\n');
}

function renderMissionLink(missionFolder: string, missionId: string | null): string {
  if (!missionId) return '- Mission: _none_';
  const missionSlug = safeMissionSlug(missionId);
  const missionPath = normalizeRelativePath(`${missionFolder}/${missionSlug}.md`);
  if (!missionPath) return `- Mission: ${missionId}`;
  return `- Mission: [[${missionPath}|${missionId}]]`;
}

function renderReplayLink(replayId: string | null): string {
  if (!replayId) return '- Replay: _none_';
  return `- Replay: [${replayId}](ventureos://replay/${encodeURIComponent(replayId)})`;
}

function renderJournalSnapshotEntry(input: {
  role: JournalRole;
  generatedAtIso: string;
  status: string;
  missionId: string | null;
  replayId: string | null;
  summary: string;
  highlights: string[];
  missionFolder: string;
}): string {
  const lines = [
    `## Snapshot (${input.generatedAtIso})`,
    '',
    `- Role: ${input.role}`,
    `- Status: ${input.status}`,
    renderMissionLink(input.missionFolder, input.missionId),
    renderReplayLink(input.replayId),
    `- Summary: ${input.summary}`,
  ];
  if (input.highlights.length > 0) {
    lines.push('- Highlights:');
    for (const item of input.highlights) lines.push(`  - ${item}`);
  } else {
    lines.push('- Highlights:');
    lines.push('  - _No highlights provided_');
  }
  lines.push('');
  return lines.join('\n');
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

function fetchOpenPrLines(repo: string): {
  lines: string[];
  blockers: string[];
  prNumbers: number[];
} {
  const raw = runGhJson([
    'pr',
    'list',
    '--repo',
    repo,
    '--state',
    'open',
    '--limit',
    '30',
    '--json',
    'number,title,isDraft,reviewDecision,mergeStateStatus,url,updatedAt',
  ]);
  if (!Array.isArray(raw)) return { lines: [], blockers: [], prNumbers: [] };

  const lines: string[] = [];
  const blockers: string[] = [];
  const prNumbers: number[] = [];
  for (const entry of raw) {
    if (!isObject(entry)) continue;
    const number = typeof entry.number === 'number' ? Math.trunc(entry.number) : null;
    const title = typeof entry.title === 'string' ? entry.title.trim() : '';
    const url = typeof entry.url === 'string' ? entry.url : '';
    const isDraft = entry.isDraft === true;
    const reviewDecision = typeof entry.reviewDecision === 'string' ? entry.reviewDecision.toUpperCase() : '';
    const mergeState = typeof entry.mergeStateStatus === 'string' ? entry.mergeStateStatus.toUpperCase() : '';
    if (!number || !title) continue;
    prNumbers.push(number);

    const flags: string[] = [];
    if (isDraft) flags.push('draft');
    if (reviewDecision) flags.push(`review:${reviewDecision.toLowerCase()}`);
    if (mergeState) flags.push(`merge:${mergeState.toLowerCase()}`);
    const label = flags.length ? ` (${flags.join(', ')})` : '';
    lines.push(`PR #${number}: ${title}${label}${url ? ` — ${url}` : ''}`);

    if (isDraft) blockers.push(`PR #${number} is still draft`);
    if (reviewDecision === 'CHANGES_REQUESTED') {
      blockers.push(`PR #${number} has changes requested`);
    }
    if (mergeState === 'DIRTY' || mergeState === 'BEHIND') {
      blockers.push(`PR #${number} has merge-state blocker (${mergeState.toLowerCase()})`);
    }
  }
  return { lines, blockers, prNumbers };
}

function fetchCiFailureLines(repo: string, prNumbers: number[]): string[] {
  const failures: string[] = [];
  for (const prNumber of prNumbers.slice(0, 8)) {
    const raw = runGhJson([
      'pr',
      'checks',
      String(prNumber),
      '--repo',
      repo,
      '--json',
      'name,state,link',
    ]);
    if (!Array.isArray(raw)) continue;
    for (const check of raw) {
      if (!isObject(check)) continue;
      const name = typeof check.name === 'string' ? check.name.trim() : '';
      const stateRaw = typeof check.state === 'string' ? check.state.trim().toLowerCase() : '';
      const link = typeof check.link === 'string' ? check.link : '';
      if (!name || !stateRaw) continue;
      if (
        stateRaw === 'success'
        || stateRaw === 'passing'
        || stateRaw === 'pending'
        || stateRaw === 'skipping'
        || stateRaw === 'skipped'
      ) {
        continue;
      }
      failures.push(`PR #${prNumber} — ${name} [${stateRaw}]${link ? ` — ${link}` : ''}`);
    }
  }
  return failures;
}

function fetchMilestoneProgressLines(repo: string): string[] {
  const raw = runGhJson([
    'issue',
    'list',
    '--repo',
    repo,
    '--state',
    'all',
    '--limit',
    '200',
    '--json',
    'state,milestone',
  ]);
  if (!Array.isArray(raw)) return [];

  type MilestoneRow = { open: number; closed: number };
  const byMilestone = new Map<string, MilestoneRow>();
  let openNoMilestone = 0;
  let closedNoMilestone = 0;

  for (const entry of raw) {
    if (!isObject(entry)) continue;
    const state = typeof entry.state === 'string' ? entry.state.toUpperCase() : '';
    const isClosed = state === 'CLOSED';
    const milestone = isObject(entry.milestone) && typeof entry.milestone.title === 'string'
      ? entry.milestone.title.trim()
      : '';
    if (!milestone) {
      if (isClosed) closedNoMilestone += 1;
      else openNoMilestone += 1;
      continue;
    }
    const row = byMilestone.get(milestone) || { open: 0, closed: 0 };
    if (isClosed) row.closed += 1;
    else row.open += 1;
    byMilestone.set(milestone, row);
  }

  const lines: string[] = [];
  for (const [title, row] of Array.from(byMilestone.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const total = row.open + row.closed;
    const pct = total > 0 ? Math.round((row.closed / total) * 100) : 0;
    lines.push(`${title}: ${row.closed}/${total} closed (${pct}%)`);
  }
  const totalNoMilestone = openNoMilestone + closedNoMilestone;
  if (totalNoMilestone > 0) {
    const pct = Math.round((closedNoMilestone / totalNoMilestone) * 100);
    lines.push(`Unmilestoned backlog: ${closedNoMilestone}/${totalNoMilestone} closed (${pct}%)`);
  }
  return lines;
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
    if (typeof body.journalFolder === 'string') {
      const normalized = normalizeRelativePath(body.journalFolder);
      if (!normalized) return sendError(deps, res, 400, 'journalFolder must be a safe relative path');
      next.journalFolder = normalized;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'journalRoles')) {
      const parsedRoles = parseJournalRoles(body.journalRoles);
      if (!parsedRoles) return sendError(deps, res, 400, 'journalRoles must be an object of known role booleans');
      next.journalRoles = parsedRoles;
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

  // POST /api/obsidian/daily-digest
  if (method === 'POST' && pathname === '/api/obsidian/daily-digest') {
    const config = loadConnectorConfig(deps.dataDir);
    const activeVault = resolveActiveVault(config, loadVaults());
    if (!activeVault) return sendError(deps, res, 400, 'connector is not configured with a valid vault');

    let body: unknown = {};
    try {
      const raw = await deps.readRequestBody(req, { maxBytes: 256_000 });
      if (raw.trim()) body = JSON.parse(raw);
    } catch {
      return sendError(deps, res, 400, 'invalid JSON body');
    }
    if (!isObject(body)) return sendError(deps, res, 400, 'body must be an object');

    const requestedDate = typeof body.date === 'string' ? body.date : null;
    const digestDay = requestedDate ? toIsoDay(requestedDate) : todayIsoDay();
    if (!digestDay) return sendError(deps, res, 400, 'date must be YYYY-MM-DD');

    const folderSuffixRaw = typeof body.folder === 'string' && body.folder.trim()
      ? body.folder
      : 'Daily Ops';
    const folderSuffix = normalizeRelativePath(folderSuffixRaw);
    if (!folderSuffix) return sendError(deps, res, 400, 'folder must be a safe relative path');

    const relativePath = normalizeRelativePath(`${config.missionFolder}/${folderSuffix}/${digestDay}.md`);
    if (!relativePath) return sendError(deps, res, 400, 'daily digest path is invalid');
    const targetPath = resolveInsideVault(activeVault.path, relativePath);
    if (!targetPath) return sendError(deps, res, 400, 'daily digest path resolves outside configured vault');
    if (hasDotObsidianSegment(targetPath)) return sendError(deps, res, 400, 'writes to .obsidian are forbidden');

    const providedOpenPrStatus = parseDigestLines(body.openPrStatus);
    const providedReviewBlockers = parseDigestLines(body.reviewBlockers);
    const providedCiFailures = parseDigestLines(body.ciFailures);
    const providedMilestoneProgress = parseDigestLines(body.milestoneProgress);

    let openPrStatus = providedOpenPrStatus;
    let reviewBlockers = providedReviewBlockers;
    let ciFailures = providedCiFailures;
    let milestoneProgress = providedMilestoneProgress;
    const needsGitHubData = !openPrStatus.length
      || !reviewBlockers.length
      || !ciFailures.length
      || !milestoneProgress.length;

    const repo = typeof body.repo === 'string' && /^[^/]+\/[^/]+$/.test(body.repo.trim())
      ? body.repo.trim()
      : getRepoFromRemote();
    let usedGitHubData = false;
    if (repo && needsGitHubData) {
      const ghOpenPrs = fetchOpenPrLines(repo);
      usedGitHubData = true;
      if (!openPrStatus.length) openPrStatus = ghOpenPrs.lines;
      if (!reviewBlockers.length) reviewBlockers = ghOpenPrs.blockers;
      if (!ciFailures.length) ciFailures = fetchCiFailureLines(repo, ghOpenPrs.prNumbers);
      if (!milestoneProgress.length) milestoneProgress = fetchMilestoneProgressLines(repo);
    }

    const source = usedGitHubData ? 'github-cli' : 'manual';
    const generatedAtIso = new Date().toISOString();
    const summaryLines = [
      `- Open PRs: ${openPrStatus.length}`,
      `- Review blockers: ${reviewBlockers.length}`,
      `- CI failures: ${ciFailures.length}`,
      `- Milestone rows: ${milestoneProgress.length}`,
    ].join('\n');

    const initialNote = [
      '---',
      `missionId: daily-ops-${digestDay}`,
      'prNumber: null',
      'status: active',
      'owner: nexus',
      `updatedAt: ${generatedAtIso}`,
      '---',
      '',
      `# Daily Ops Digest — ${digestDay}`,
      '',
      '_Automated daily operations snapshot._',
      '',
    ].join('\n');

    let note = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : initialNote;
    if (!note.trim()) note = initialNote;
    if (!note.includes('# Daily Ops Digest')) {
      note = `${initialNote}\n${note.trim()}\n`;
    }

    note = upsertManagedDigestSection(note, 'summary', 'Summary', summaryLines);
    note = upsertManagedDigestSection(
      note,
      'open-pr-status',
      'Open PR Status',
      formatBulletLines(openPrStatus, 'No open PR status available'),
    );
    note = upsertManagedDigestSection(
      note,
      'review-blockers',
      'Review Blockers',
      formatBulletLines(reviewBlockers, 'No review blockers detected'),
    );
    note = upsertManagedDigestSection(
      note,
      'ci-failures',
      'CI Failures',
      formatBulletLines(ciFailures, 'No CI failures detected'),
    );
    note = upsertManagedDigestSection(
      note,
      'milestone-progress',
      'Milestone Progress',
      formatBulletLines(milestoneProgress, 'No milestone data available'),
    );
    note = upsertManagedDigestSection(
      note,
      'metadata',
      'Metadata',
      [
        `- generatedAt: ${generatedAtIso}`,
        `- source: ${source}`,
        `- repo: ${repo || 'n/a'}`,
      ].join('\n'),
    );

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, `${note.trimEnd()}\n`);

    deps.sendJson(res, {
      ok: true,
      path: relativePath,
      date: digestDay,
      source,
      repo: repo || null,
      stats: {
        openPrStatus: openPrStatus.length,
        reviewBlockers: reviewBlockers.length,
        ciFailures: ciFailures.length,
        milestoneProgress: milestoneProgress.length,
      },
      updatedAt: Date.now(),
    });
    return true;
  }

  // POST /api/obsidian/journals/write
  if (method === 'POST' && pathname === '/api/obsidian/journals/write') {
    const config = loadConnectorConfig(deps.dataDir);
    const activeVault = resolveActiveVault(config, loadVaults());
    if (!activeVault) return sendError(deps, res, 400, 'connector is not configured with a valid vault');

    let body: unknown;
    try {
      const raw = await deps.readRequestBody(req, { maxBytes: 64_000 });
      body = JSON.parse(raw);
    } catch {
      return sendError(deps, res, 400, 'invalid JSON body');
    }
    if (!isObject(body)) return sendError(deps, res, 400, 'body must be an object');

    const roleRaw = cleanJournalLine(body.role, 40).toLowerCase();
    if (!isJournalRole(roleRaw)) {
      return sendError(deps, res, 400, `role must be one of: ${JOURNAL_ROLES.join(', ')}`);
    }
    if (!config.journalRoles[roleRaw]) {
      return sendError(deps, res, 403, `journal stream for role '${roleRaw}' is disabled`);
    }

    const missionId = cleanJournalLine(body.missionId, 140) || null;
    const replayId = cleanJournalLine(body.replayId ?? body.replaySessionId, 140) || null;
    if (!missionId && !replayId) {
      return sendError(deps, res, 400, 'missionId or replayId is required');
    }

    const summary = cleanJournalLine(body.summary, MAX_JOURNAL_SUMMARY);
    if (!summary) return sendError(deps, res, 400, 'summary is required');

    const highlights = parseJournalList(body.highlights);
    const status = cleanJournalLine(body.status, 40).toLowerCase() || 'active';
    const requestedDate = typeof body.date === 'string' ? body.date : null;
    const day = requestedDate ? toIsoDay(requestedDate) : todayIsoDay();
    if (!day) return sendError(deps, res, 400, 'date must be YYYY-MM-DD');

    const relativePath = normalizeRelativePath(`${config.journalFolder}/${roleRaw}/${day}.md`);
    if (!relativePath) return sendError(deps, res, 400, 'journal path is invalid');
    const targetPath = resolveInsideVault(activeVault.path, relativePath);
    if (!targetPath) return sendError(deps, res, 400, 'journal path resolves outside configured vault');
    if (hasDotObsidianSegment(targetPath)) return sendError(deps, res, 400, 'writes to .obsidian are forbidden');

    const existed = fs.existsSync(targetPath);
    const generatedAtIso = new Date().toISOString();
    const entry = renderJournalSnapshotEntry({
      role: roleRaw,
      generatedAtIso,
      status,
      missionId,
      replayId,
      summary,
      highlights,
      missionFolder: config.missionFolder,
    });

    let doc = existed ? fs.readFileSync(targetPath, 'utf8') : ensureJournalDocSeed(roleRaw, day);
    if (!doc.trim()) doc = ensureJournalDocSeed(roleRaw, day);
    if (!doc.includes('# Agent Journal')) {
      doc = `${ensureJournalDocSeed(roleRaw, day)}\n${doc.trim()}\n`;
    }
    doc = `${doc.trimEnd()}\n\n${entry}`;

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, `${doc.trimEnd()}\n`);

    deps.sendJson(res, {
      ok: true,
      path: relativePath,
      role: roleRaw,
      created: !existed,
      links: { missionId, replayId },
      updatedAt: Date.now(),
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

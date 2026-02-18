/**
 * Changelog / Release Notes route handler.
 * Issue #211 — Release Notes & Changelog Panel in Dashboard.
 *
 * Data source strategy (layered, resilient):
 *   1. Static CHANGELOG.md at repo root (if present) — parsed into entries
 *   2. Git log with conventional-commit parsing — grouped by date
 *   3. Graceful fallback to empty state when neither source is available
 *
 * API:
 *   GET /api/changelog           — paginated release entries
 *   GET /api/changelog/latest    — most recent release/entry
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

import type { IncomingMessage, ServerResponse } from 'node:http';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChangelogEntry {
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  /** Version tag if present (e.g. "v1.2.0"), or null */
  version: string | null;
  /** Human-readable title / summary */
  title: string;
  /** Category: feat | fix | refactor | docs | infra | chore | breaking */
  category: ChangelogCategory;
  /** Scope from conventional commit (e.g. "dashboard", "tactical-map") */
  scope: string | null;
  /** Full commit message body (first 200 chars) */
  body: string;
  /** Short git hash */
  hash: string | null;
  /** GitHub PR number if detectable */
  pr: number | null;
  /** Source of the entry */
  source: 'changelog-md' | 'git';
}

export type ChangelogCategory =
  | 'feat'
  | 'fix'
  | 'refactor'
  | 'docs'
  | 'infra'
  | 'chore'
  | 'breaking'
  | 'other';

export interface ChangelogDeps {
  ventureosRoot: string;
  sendJson: (res: ServerResponse, data: unknown, status?: number) => void;
  clampInt: (n: string | number | null, lo: number, hi: number, dflt: number) => number;
}

// ─── CHANGELOG.md Parser ─────────────────────────────────────────────────────

/**
 * Parse a Keep-a-Changelog style CHANGELOG.md into entries.
 *
 * Expected format:
 *   ## [1.2.0] - 2026-02-17
 *   ### Added
 *   - Feature description (#123)
 */
export function parseChangelogMd(content: string): ChangelogEntry[] {
  if (!content || typeof content !== 'string') return [];

  const entries: ChangelogEntry[] = [];
  const lines = content.split('\n');
  let currentVersion: string | null = null;
  let currentDate: string | null = null;
  let currentCategory: ChangelogCategory = 'other';

  // Match: ## [1.2.0] - 2026-02-17  or  ## [Unreleased]
  const versionRe = /^##\s+\[([^\]]+)\](?:\s*[-–—]\s*(\d{4}-\d{2}-\d{2}))?/;
  // Match: ### Added / ### Fixed / ### Changed etc
  const sectionRe = /^###\s+(\w+)/;
  // Match: - Item text (#123)
  const itemRe = /^[-*]\s+(.+)/;

  for (const line of lines) {
    const versionMatch = versionRe.exec(line);
    if (versionMatch) {
      currentVersion = versionMatch[1] === 'Unreleased' ? null : versionMatch[1];
      currentDate = versionMatch[2] || null;
      currentCategory = 'other';
      continue;
    }

    const sectionMatch = sectionRe.exec(line);
    if (sectionMatch) {
      currentCategory = mapSectionToCategory(sectionMatch[1]);
      continue;
    }

    const itemMatch = itemRe.exec(line);
    if (itemMatch && currentDate) {
      const text = itemMatch[1].trim();
      const prMatch = text.match(/\(#(\d+)\)/);
      entries.push({
        date: currentDate,
        version: currentVersion,
        title: text.replace(/\s*\(#\d+\)/, '').trim(),
        category: currentCategory,
        scope: null,
        body: text,
        hash: null,
        pr: prMatch ? parseInt(prMatch[1]) : null,
        source: 'changelog-md',
      });
    }
  }

  return entries;
}

function mapSectionToCategory(section: string): ChangelogCategory {
  const s = section.toLowerCase();
  if (s === 'added' || s === 'features') return 'feat';
  if (s === 'fixed' || s === 'bugfixes') return 'fix';
  if (s === 'changed' || s === 'refactored') return 'refactor';
  if (s === 'documentation' || s === 'docs') return 'docs';
  if (s === 'infrastructure' || s === 'infra' || s === 'ci') return 'infra';
  if (s === 'breaking' || s === 'removed' || s === 'deprecated') return 'breaking';
  if (s === 'security') return 'fix';
  return 'chore';
}

// ─── Git Log Parser ──────────────────────────────────────────────────────────

/**
 * Parse conventional commit subject into category + scope + title.
 *
 * Formats handled:
 *   feat(dashboard): some title (#123)
 *   fix: something
 *   docs(infra): Hybrid deployment plan
 */
export function parseConventionalCommit(subject: string): {
  category: ChangelogCategory;
  scope: string | null;
  title: string;
  pr: number | null;
} {
  // Extract PR number from end
  const prMatch = subject.match(/\(#(\d+)\)\s*$/);
  const pr = prMatch ? parseInt(prMatch[1]) : null;
  const clean = subject.replace(/\s*\(#\d+\)\s*$/, '').trim();

  // Conventional commit pattern: type(scope): description
  const ccMatch = clean.match(
    /^(feat|fix|refactor|docs|infra|chore|ci|perf|test|build|style|revert)(?:\(([^)]+)\))?[!]?:\s*(.+)/i,
  );

  if (ccMatch) {
    const rawType = ccMatch[1].toLowerCase();
    let category: ChangelogCategory;
    if (rawType === 'feat' || rawType === 'perf') category = 'feat';
    else if (rawType === 'fix') category = 'fix';
    else if (rawType === 'refactor' || rawType === 'style') category = 'refactor';
    else if (rawType === 'docs') category = 'docs';
    else if (rawType === 'infra' || rawType === 'ci' || rawType === 'build') category = 'infra';
    else category = 'chore';

    // Check for breaking indicator
    if (clean.includes('!:')) category = 'breaking';

    return {
      category,
      scope: ccMatch[2] || null,
      title: ccMatch[3].trim(),
      pr,
    };
  }

  // Merge commit: "Merge pull request #NNN from ..."
  const mergeMatch = clean.match(/^Merge pull request #(\d+)/);
  if (mergeMatch) {
    return {
      category: 'other',
      scope: null,
      title: clean,
      pr: parseInt(mergeMatch[1]),
    };
  }

  return { category: 'other', scope: null, title: clean, pr };
}

/**
 * Read git log entries from the VentureOS repo.
 * Returns structured changelog entries sorted newest-first.
 */
export function readGitChangelog(
  repoPath: string,
  opts: { maxCount?: number; since?: string } = {},
): ChangelogEntry[] {
  const maxCount = opts.maxCount ?? 100;
  const since = opts.since ?? '90 days ago';

  try {
    if (!fs.existsSync(path.join(repoPath, '.git'))) return [];

    // Use a unique delimiter unlikely to appear in commit messages
    const delim = '---CHANGELOG_DELIM---';
    const format = `%H${delim}%s${delim}%ai${delim}%b`;
    const cmd = `git -C ${JSON.stringify(repoPath)} log --format='${format}' --since='${since}' -${maxCount} 2>/dev/null`;

    let output: string;
    try {
      output = execSync(cmd, { encoding: 'utf8', timeout: 10000 }).trim();
    } catch {
      return [];
    }

    if (!output) return [];

    const entries: ChangelogEntry[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split(delim);
      if (parts.length < 3) continue;

      const fullHash = parts[0].trim();
      const subject = parts[1].trim();
      const dateRaw = parts[2].trim();
      const body = (parts[3] || '').trim();

      if (!subject) continue;

      // Skip merge commits that aren't PR merges
      if (subject.startsWith('Merge branch')) continue;

      const date = dateRaw.substring(0, 10); // YYYY-MM-DD
      const hash = fullHash.substring(0, 7);
      const parsed = parseConventionalCommit(subject);

      entries.push({
        date,
        version: null, // Git entries don't have version tags by default
        title: parsed.title,
        category: parsed.category,
        scope: parsed.scope,
        body: body.substring(0, 200) || subject,
        hash,
        pr: parsed.pr,
        source: 'git',
      });
    }

    // Attempt to attach version tags
    try {
      const tagOutput = execSync(
        `git -C ${JSON.stringify(repoPath)} tag --sort=-creatordate -l 'v*' --format='%(refname:short) %(creatordate:short)' 2>/dev/null`,
        { encoding: 'utf8', timeout: 5000 },
      ).trim();

      if (tagOutput) {
        const tags: Array<{ tag: string; date: string }> = [];
        for (const tl of tagOutput.split('\n')) {
          const [tag, date] = tl.trim().split(/\s+/);
          if (tag && date) tags.push({ tag, date });
        }

        // For each entry, find the closest tag on or after its date
        for (const entry of entries) {
          const matchingTag = tags.find((t) => t.date === entry.date);
          if (matchingTag) {
            entry.version = matchingTag.tag;
          }
        }
      }
    } catch {
      // Tags are optional enhancement
    }

    return entries;
  } catch {
    return [];
  }
}

// ─── Combined Data Source ────────────────────────────────────────────────────

let changelogCache: { entries: ChangelogEntry[]; updatedAt: number } | null = null;
let changelogCacheTime = 0;
const CHANGELOG_CACHE_TTL_MS = 30000; // 30s

export function getChangelogEntries(ventureosRoot: string): ChangelogEntry[] {
  const now = Date.now();
  if (changelogCache && now - changelogCacheTime < CHANGELOG_CACHE_TTL_MS) {
    return changelogCache.entries;
  }

  const entries: ChangelogEntry[] = [];

  // Source 1: CHANGELOG.md (highest priority)
  const changelogPath = path.join(ventureosRoot, 'CHANGELOG.md');
  try {
    if (fs.existsSync(changelogPath)) {
      const content = fs.readFileSync(changelogPath, 'utf8');
      const mdEntries = parseChangelogMd(content);
      entries.push(...mdEntries);
    }
  } catch {
    // CHANGELOG.md not available — fall through to git
  }

  // Source 2: Git log
  const gitEntries = readGitChangelog(ventureosRoot);
  // Deduplicate: skip git entries whose PR matches an existing changelog-md entry
  const existingPRs = new Set(entries.filter((e) => e.pr).map((e) => e.pr));
  for (const ge of gitEntries) {
    if (ge.pr && existingPRs.has(ge.pr)) continue;
    entries.push(ge);
  }

  // Sort newest-first
  entries.sort((a, b) => b.date.localeCompare(a.date) || (b.pr ?? 0) - (a.pr ?? 0));

  changelogCache = { entries, updatedAt: now };
  changelogCacheTime = now;
  return entries;
}

/** Reset cache — useful for tests. */
export function resetChangelogCache(): void {
  changelogCache = null;
  changelogCacheTime = 0;
}

// ─── Category metadata for UI rendering ──────────────────────────────────────

const CATEGORY_META: Record<ChangelogCategory, { emoji: string; label: string; color: string }> = {
  feat: { emoji: '✨', label: 'Feature', color: '#10b981' },
  fix: { emoji: '🐛', label: 'Fix', color: '#ef4444' },
  refactor: { emoji: '♻️', label: 'Refactor', color: '#3b82f6' },
  docs: { emoji: '📝', label: 'Docs', color: '#8b5cf6' },
  infra: { emoji: '🔧', label: 'Infrastructure', color: '#f59e0b' },
  chore: { emoji: '🧹', label: 'Chore', color: '#71717a' },
  breaking: { emoji: '💥', label: 'Breaking', color: '#dc2626' },
  other: { emoji: '📦', label: 'Other', color: '#a1a1aa' },
};

// ─── Route Handler ───────────────────────────────────────────────────────────

export function handleChangelog(
  req: IncomingMessage,
  res: ServerResponse,
  deps: ChangelogDeps,
): boolean {
  const { ventureosRoot, sendJson, clampInt } = deps;
  if (!req || !res) return false;
  if (req.method && req.method !== 'GET') return false;

  // GET /api/changelog/latest
  if (req.url === '/api/changelog/latest') {
    try {
      const entries = getChangelogEntries(ventureosRoot);
      const latest = entries[0] ?? null;
      sendJson(res, {
        ok: true,
        latest,
        categories: CATEGORY_META,
        updatedAt: changelogCache?.updatedAt ?? Date.now(),
      });
    } catch {
      sendJson(res, { ok: true, latest: null, categories: CATEGORY_META, updatedAt: Date.now() });
    }
    return true;
  }

  // GET /api/changelog?limit=N&offset=N&category=feat&q=search
  if (req.url && (req.url === '/api/changelog' || req.url.startsWith('/api/changelog?'))) {
    try {
      const params = new URL(req.url, 'http://localhost').searchParams;
      const limit = clampInt(params.get('limit'), 1, 200, 30);
      const offset = clampInt(params.get('offset'), 0, 10000, 0);
      const categoryFilter = (params.get('category') ?? '').trim().toLowerCase();
      const query = (params.get('q') ?? '').trim().toLowerCase();

      let entries = getChangelogEntries(ventureosRoot);

      // Filter by category
      if (categoryFilter && categoryFilter !== 'all') {
        entries = entries.filter((e) => e.category === categoryFilter);
      }

      // Filter by search query
      if (query) {
        entries = entries.filter(
          (e) =>
            e.title.toLowerCase().includes(query) ||
            (e.scope ?? '').toLowerCase().includes(query) ||
            e.body.toLowerCase().includes(query) ||
            (e.version ?? '').toLowerCase().includes(query),
        );
      }

      const total = entries.length;
      const page = entries.slice(offset, offset + limit);

      // Group by date for timeline rendering
      const grouped: Record<string, ChangelogEntry[]> = {};
      for (const entry of page) {
        if (!grouped[entry.date]) grouped[entry.date] = [];
        grouped[entry.date].push(entry);
      }

      // Category summary
      const allEntries = getChangelogEntries(ventureosRoot);
      const categoryCounts: Record<string, number> = {};
      for (const e of allEntries) {
        categoryCounts[e.category] = (categoryCounts[e.category] ?? 0) + 1;
      }

      sendJson(res, {
        ok: true,
        entries: page,
        grouped,
        total,
        limit,
        offset,
        categories: CATEGORY_META,
        categoryCounts,
        updatedAt: changelogCache?.updatedAt ?? Date.now(),
      });
    } catch {
      sendJson(res, {
        ok: true,
        entries: [],
        grouped: {},
        total: 0,
        limit: 30,
        offset: 0,
        categories: CATEGORY_META,
        categoryCounts: {},
        updatedAt: Date.now(),
      });
    }
    return true;
  }

  return false;
}

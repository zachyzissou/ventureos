/**
 * Tests for changelog / release-notes route handler.
 * Issue #211 — Release Notes & Changelog Panel.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import {
  handleChangelog,
  parseChangelogMd,
  parseConventionalCommit,
  readGitChangelog,
  getChangelogEntries,
  resetChangelogCache,
} from '../../../server/routes/changelog.js';

// ─── Unit: parseConventionalCommit ───────────────────────────────────────────

describe('parseConventionalCommit', () => {
  it('parses feat(scope): title (#PR)', () => {
    const r = parseConventionalCommit('feat(dashboard): add changelog panel (#211)');
    expect(r.category).toBe('feat');
    expect(r.scope).toBe('dashboard');
    expect(r.title).toBe('add changelog panel');
    expect(r.pr).toBe(211);
  });

  it('parses fix without scope', () => {
    const r = parseConventionalCommit('fix: correct ESM import mismatch (#200)');
    expect(r.category).toBe('fix');
    expect(r.scope).toBeNull();
    expect(r.title).toBe('correct ESM import mismatch');
    expect(r.pr).toBe(200);
  });

  it('parses docs scope', () => {
    const r = parseConventionalCommit('docs(infra): Hybrid deployment plan (#176)');
    expect(r.category).toBe('docs');
    expect(r.scope).toBe('infra');
    expect(r.pr).toBe(176);
  });

  it('parses infra/ci prefix', () => {
    const r = parseConventionalCommit('ci: pin shellcheck action to published tag');
    expect(r.category).toBe('infra');
    expect(r.pr).toBeNull();
  });

  it('handles breaking indicator (!:)', () => {
    const r = parseConventionalCommit('feat!: remove deprecated v1 API');
    expect(r.category).toBe('breaking');
  });

  it('handles perf as feat', () => {
    const r = parseConventionalCommit('perf: optimize session scan (#168)');
    expect(r.category).toBe('feat');
  });

  it('handles merge commit', () => {
    const r = parseConventionalCommit('Merge pull request #206 from zachyzissou/feat/diagnostics');
    expect(r.pr).toBe(206);
    expect(r.category).toBe('other');
  });

  it('handles plain message', () => {
    const r = parseConventionalCommit('some random commit message');
    expect(r.category).toBe('other');
    expect(r.title).toBe('some random commit message');
    expect(r.pr).toBeNull();
  });

  it('returns empty for empty string', () => {
    const r = parseConventionalCommit('');
    expect(r.title).toBe('');
  });
});

// ─── Unit: parseChangelogMd ──────────────────────────────────────────────────

describe('parseChangelogMd', () => {
  it('parses standard Keep-a-Changelog format', () => {
    const md = `# Changelog

## [1.2.0] - 2026-02-17
### Added
- Release notes panel in dashboard (#211)
- Changelog API endpoint

### Fixed
- ESM import mismatch (#200)

## [1.1.0] - 2026-02-16
### Added
- Live telemetry endpoint (#159)
`;
    const entries = parseChangelogMd(md);
    expect(entries.length).toBe(4);

    expect(entries[0].version).toBe('1.2.0');
    expect(entries[0].date).toBe('2026-02-17');
    expect(entries[0].category).toBe('feat');
    expect(entries[0].pr).toBe(211);
    expect(entries[0].source).toBe('changelog-md');

    expect(entries[1].category).toBe('feat');
    expect(entries[1].pr).toBeNull();
    expect(entries[1].title).toBe('Changelog API endpoint');

    expect(entries[2].category).toBe('fix');
    expect(entries[2].pr).toBe(200);

    // Second version section
    expect(entries[3].version).toBe('1.1.0');
    expect(entries[3].date).toBe('2026-02-16');
  });

  it('handles empty content', () => {
    expect(parseChangelogMd('')).toEqual([]);
    expect(parseChangelogMd(null as unknown as string)).toEqual([]);
  });

  it('handles Unreleased section (no version)', () => {
    const md = `## [Unreleased]
### Added
- Work in progress feature
`;
    // Unreleased has no date, so items won't be captured (currentDate is null)
    const entries = parseChangelogMd(md);
    expect(entries.length).toBe(0);
  });

  it('maps section names to correct categories', () => {
    const md = `## [1.0.0] - 2026-01-01
### Security
- Fix XSS vulnerability
### Documentation
- Update README
### Infrastructure
- Add CI pipeline
### Removed
- Drop legacy endpoint
`;
    const entries = parseChangelogMd(md);
    expect(entries.find(e => e.title.includes('XSS'))?.category).toBe('fix');
    expect(entries.find(e => e.title.includes('README'))?.category).toBe('docs');
    expect(entries.find(e => e.title.includes('CI'))?.category).toBe('infra');
    expect(entries.find(e => e.title.includes('legacy'))?.category).toBe('breaking');
  });
});

// ─── Unit: readGitChangelog ──────────────────────────────────────────────────

describe('readGitChangelog', () => {
  it('returns empty array for non-existent repo', () => {
    const entries = readGitChangelog('/nonexistent/repo');
    expect(entries).toEqual([]);
  });

  it('returns entries from real git repo', () => {
    // Use the VentureOS repo itself
    const repoRoot = new URL('../../../../', import.meta.url).pathname.replace(/\/$/, '');
    const entries = readGitChangelog(repoRoot, { maxCount: 10, since: '30 days ago' });
    // Should have some entries (we know the repo has commits)
    expect(Array.isArray(entries)).toBe(true);
    if (entries.length > 0) {
      const e = entries[0];
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.hash).toBeTruthy();
      expect(typeof e.title).toBe('string');
      expect(e.source).toBe('git');
      expect(['feat', 'fix', 'refactor', 'docs', 'infra', 'chore', 'breaking', 'other']).toContain(e.category);
    }
  });
});

// ─── Unit: getChangelogEntries (combined) ────────────────────────────────────

describe('getChangelogEntries', () => {
  beforeEach(() => {
    resetChangelogCache();
  });

  it('returns entries sorted newest-first', () => {
    const repoRoot = new URL('../../../../', import.meta.url).pathname.replace(/\/$/, '');
    const entries = getChangelogEntries(repoRoot);
    expect(Array.isArray(entries)).toBe(true);
    // Should be sorted descending by date
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i - 1].date >= entries[i].date).toBe(true);
    }
  });

  it('caches results on subsequent calls', () => {
    const repoRoot = new URL('../../../../', import.meta.url).pathname.replace(/\/$/, '');
    const entries1 = getChangelogEntries(repoRoot);
    const entries2 = getChangelogEntries(repoRoot);
    // Same reference from cache
    expect(entries1).toBe(entries2);
  });

  it('returns empty for nonexistent path', () => {
    const entries = getChangelogEntries('/nonexistent/path');
    expect(entries).toEqual([]);
  });
});

// ─── Integration: handleChangelog route ──────────────────────────────────────

describe('handleChangelog route', () => {
  const repoRoot = new URL('../../../../', import.meta.url).pathname.replace(/\/$/, '');
  const deps = {
    ventureosRoot: repoRoot,
    sendJson: (res: any, data: any, status?: number) => {
      res.writeHead(status ?? 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    },
    clampInt: (n: any, lo: number, hi: number, dflt: number) => {
      const v = parseInt(String(n));
      return Number.isNaN(v) ? dflt : Math.max(lo, Math.min(hi, v));
    },
  };

  beforeEach(() => {
    resetChangelogCache();
  });

  it('returns false for non-changelog URLs', () => {
    const req = mockRequest({ url: '/api/sessions' });
    const res = mockResponse();
    expect(handleChangelog(req, res, deps)).toBe(false);
  });

  it('returns false for POST method', () => {
    const req = mockRequest({ url: '/api/changelog', method: 'POST' });
    const res = mockResponse();
    expect(handleChangelog(req, res, deps)).toBe(false);
  });

  it('GET /api/changelog returns paginated entries', () => {
    const req = mockRequest({ url: '/api/changelog?limit=5' });
    const res = mockResponse();
    const handled = handleChangelog(req, res, deps);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);

    const body = parseJsonBody(res);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.entries.length).toBeLessThanOrEqual(5);
    expect(typeof body.total).toBe('number');
    expect(body.categories).toBeDefined();
    expect(body.categoryCounts).toBeDefined();
    expect(body.grouped).toBeDefined();
  });

  it('GET /api/changelog with category filter', () => {
    const req = mockRequest({ url: '/api/changelog?category=feat&limit=50' });
    const res = mockResponse();
    handleChangelog(req, res, deps);
    const body = parseJsonBody(res);
    expect(body.ok).toBe(true);
    // All returned entries should be feat
    for (const e of body.entries) {
      expect(e.category).toBe('feat');
    }
  });

  it('GET /api/changelog with search query', () => {
    const req = mockRequest({ url: '/api/changelog?q=dashboard&limit=50' });
    const res = mockResponse();
    handleChangelog(req, res, deps);
    const body = parseJsonBody(res);
    expect(body.ok).toBe(true);
    // Entries should match the query
    for (const e of body.entries) {
      const combined = `${e.title} ${e.scope ?? ''} ${e.body}`.toLowerCase();
      expect(combined).toContain('dashboard');
    }
  });

  it('GET /api/changelog/latest returns most recent entry', () => {
    const req = mockRequest({ url: '/api/changelog/latest' });
    const res = mockResponse();
    const handled = handleChangelog(req, res, deps);
    expect(handled).toBe(true);
    const body = parseJsonBody(res);
    expect(body.ok).toBe(true);
    expect(body.categories).toBeDefined();
    if (body.latest) {
      expect(body.latest.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(body.latest.title).toBeTruthy();
    }
  });

  it('handles empty state gracefully', () => {
    const emptyDeps = { ...deps, ventureosRoot: '/tmp/nonexistent-repo-211' };
    resetChangelogCache();
    const req = mockRequest({ url: '/api/changelog' });
    const res = mockResponse();
    handleChangelog(req, res, emptyDeps);
    const body = parseJsonBody(res);
    expect(body.ok).toBe(true);
    expect(body.entries).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('handles error state gracefully (latest)', () => {
    resetChangelogCache();
    const emptyDeps = { ...deps, ventureosRoot: '/tmp/nonexistent-repo-211' };
    const req = mockRequest({ url: '/api/changelog/latest' });
    const res = mockResponse();
    handleChangelog(req, res, emptyDeps);
    const body = parseJsonBody(res);
    expect(body.ok).toBe(true);
    expect(body.latest).toBeNull();
  });

  it('respects offset/limit pagination', () => {
    const req1 = mockRequest({ url: '/api/changelog?limit=3&offset=0' });
    const res1 = mockResponse();
    handleChangelog(req1, res1, deps);
    const body1 = parseJsonBody(res1);

    resetChangelogCache();
    const req2 = mockRequest({ url: '/api/changelog?limit=3&offset=3' });
    const res2 = mockResponse();
    handleChangelog(req2, res2, deps);
    const body2 = parseJsonBody(res2);

    expect(body1.entries.length).toBeLessThanOrEqual(3);
    expect(body2.entries.length).toBeLessThanOrEqual(3);
    // Pages shouldn't overlap (if total > 6)
    if (body1.total > 6) {
      const hashes1 = new Set(body1.entries.map((e: any) => e.hash));
      for (const e of body2.entries) {
        expect(hashes1.has(e.hash)).toBe(false);
      }
    }
  });
});

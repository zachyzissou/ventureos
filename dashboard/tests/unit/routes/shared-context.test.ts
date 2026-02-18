/**
 * Shared-Context (Cross-Agent Activity Feed) route handler tests
 *
 * Phase 4 (#244) of the Shared Agent Memory Layer (#217).
 *
 * Tests for:
 *   GET /api/shared-context/teams
 *   GET /api/shared-context/teams/:id
 *   GET /api/shared-context/teams/:id/activity
 *   GET /api/shared-context/teams/:id/files
 *
 * Test categories:
 *   - Routing (returns false for non-matching URLs)
 *   - Empty state / graceful degradation
 *   - Happy-path with seeded data
 *   - Filtering and pagination
 *   - Auth-safe behavior (no auth bypass in route layer)
 *   - Error handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import { handleSharedContext } from '../../../server/routes/shared-context.js';
import type { ServerResponse } from 'node:http';

// ─── Test Setup ──────────────────────────────────────────────────────────────

let tmpDir: string;
let teamDbPath: string;
let auditDbPath: string;
let sharedContextDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-ctx-test-'));
  teamDbPath = path.join(tmpDir, 'teams.db');
  auditDbPath = path.join(tmpDir, 'audit.db');
  sharedContextDir = path.join(tmpDir, 'shared-context');
  fs.mkdirSync(sharedContextDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function createDeps(overrides: Partial<{
  teamDbPath: string;
  auditDbPath: string;
  sharedContextDir: string;
}> = {}) {
  return {
    teamDbPath: overrides.teamDbPath ?? teamDbPath,
    auditDbPath: overrides.auditDbPath ?? auditDbPath,
    sharedContextDir: overrides.sharedContextDir ?? sharedContextDir,
    sendJson: (res: ServerResponse, data: unknown, status = 200) => {
      (res as any).writeHead(status, { 'Content-Type': 'application/json' });
      (res as any).end(JSON.stringify(data));
    },
    clampInt: (n: string | number | null, lo: number, hi: number, dflt: number) => {
      const v = parseInt(String(n));
      if (Number.isNaN(v)) return dflt;
      return Math.max(lo, Math.min(hi, v));
    },
  };
}

// ─── Database Helpers ────────────────────────────────────────────────────────

function createTeamTables(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      owner_user_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS team_agents (
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      agent_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('member','curator','observer')),
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (team_id, agent_id)
    );
    CREATE INDEX IF NOT EXISTS idx_team_agents_agent ON team_agents(agent_id);
    CREATE INDEX IF NOT EXISTS idx_teams_name ON teams(name);
  `);
  return db;
}

function createAuditTables(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS shared_context_audit (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('write','delete','read','rename','violation')),
      file_path TEXT NOT NULL,
      file_size_bytes INTEGER,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      detail TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_team_time ON shared_context_audit(team_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_agent ON shared_context_audit(agent_id);
    CREATE INDEX IF NOT EXISTS idx_audit_file ON shared_context_audit(file_path);
  `);
  return db;
}

function seedTeam(opts: {
  id?: string;
  name?: string;
  ownerUserId?: string;
  agents?: Array<{ agentId: string; role?: string }>;
}): string {
  const id = opts.id ?? 'team-' + Math.random().toString(36).slice(2, 8);
  const name = opts.name ?? 'test-team';
  const now = new Date().toISOString();

  const db = createTeamTables(teamDbPath);
  db.prepare('INSERT INTO teams (id, name, created_at, owner_user_id) VALUES (?, ?, ?, ?)')
    .run(id, name, now, opts.ownerUserId ?? 'user-1');

  for (const agent of opts.agents ?? []) {
    db.prepare('INSERT INTO team_agents (team_id, agent_id, role, joined_at) VALUES (?, ?, ?, ?)')
      .run(id, agent.agentId, agent.role ?? 'member', now);
  }

  db.close();
  return id;
}

function seedAuditEntries(entries: Array<{
  teamId: string;
  agentId?: string;
  action?: string;
  filePath?: string;
  fileSizeBytes?: number;
  timestamp?: string;
  detail?: string;
}>): void {
  const db = createAuditTables(auditDbPath);
  const stmt = db.prepare(`
    INSERT INTO shared_context_audit (id, team_id, agent_id, action, file_path, file_size_bytes, timestamp, detail)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    stmt.run(
      `audit-${i}-${Math.random().toString(36).slice(2, 8)}`,
      e.teamId,
      e.agentId ?? 'nexus',
      e.action ?? 'write',
      e.filePath ?? `agent-outputs/nexus/output-${i}.md`,
      e.fileSizeBytes ?? 1024,
      e.timestamp ?? new Date(Date.now() - i * 60000).toISOString(),
      e.detail ?? null,
    );
  }

  db.close();
}

function scaffoldTeamDir(teamName: string, files?: Record<string, string>): string {
  const safe = teamName.toLowerCase().replace(/[^a-z0-9\-_]/g, '');
  const teamDir = path.join(sharedContextDir, safe);
  fs.mkdirSync(path.join(teamDir, 'agent-outputs', 'nexus'), { recursive: true });
  fs.mkdirSync(path.join(teamDir, 'agent-outputs', 'oracle'), { recursive: true });
  fs.mkdirSync(path.join(teamDir, 'feedback'), { recursive: true });
  fs.mkdirSync(path.join(teamDir, 'kpis'), { recursive: true });
  fs.mkdirSync(path.join(teamDir, '.meta'), { recursive: true });

  // Write priorities.md
  fs.writeFileSync(
    path.join(teamDir, 'priorities.md'),
    '# Team Priorities\n\n_No priorities set yet._\n',
  );

  // Write manifest.json
  fs.writeFileSync(
    path.join(teamDir, '.meta', 'manifest.json'),
    JSON.stringify({ files: [], lastSync: {} }, null, 2),
  );

  // Write additional files
  if (files) {
    for (const [relPath, content] of Object.entries(files)) {
      const fullPath = path.join(teamDir, relPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);
    }
  }

  return teamDir;
}

// ─── Routing Tests ───────────────────────────────────────────────────────────

describe('Shared-Context Routes — Routing', () => {
  it('returns false for non-shared-context URLs', () => {
    expect(handleSharedContext(
      mockRequest({ url: '/api/sessions' }),
      mockResponse(),
      createDeps(),
    )).toBe(false);
  });

  it('returns false for /api/shared-context without trailing slash path', () => {
    // Only /api/shared-context/ prefix matches
    expect(handleSharedContext(
      mockRequest({ url: '/api/shared-contexts' }),
      mockResponse(),
      createDeps(),
    )).toBe(false);
  });

  it('returns false for POST requests', () => {
    expect(handleSharedContext(
      mockRequest({ url: '/api/shared-context/teams', method: 'POST' }),
      mockResponse(),
      createDeps(),
    )).toBe(false);
  });

  it('returns 404 for unknown sub-routes', () => {
    // Need to seed a team for the sub-route check to matter
    seedTeam({ id: 'team-1', name: 'alpha' });
    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: '/api/shared-context/teams/team-1/unknown' }),
      res,
      createDeps(),
    );
    expect(res._statusCode).toBe(404);
  });
});

// ─── GET /api/shared-context/teams ───────────────────────────────────────────

describe('GET /api/shared-context/teams', () => {
  it('returns empty list when no teams exist', () => {
    // Create an empty database
    const db = createTeamTables(teamDbPath);
    db.close();

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: '/api/shared-context/teams' }),
      res,
      createDeps(),
    );
    const body = parseJsonBody(res);
    expect(body.teams).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.available).toBe(true);
  });

  it('returns unavailable when database does not exist', () => {
    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: '/api/shared-context/teams' }),
      res,
      createDeps({ teamDbPath: path.join(tmpDir, 'nonexistent', 'no.db') }),
    );
    const body = parseJsonBody(res);
    expect(body.teams).toEqual([]);
    expect(body.available).toBe(false);
  });

  it('returns teams with agent counts', () => {
    seedTeam({
      id: 'team-alpha',
      name: 'alpha-squad',
      agents: [
        { agentId: 'nexus', role: 'member' },
        { agentId: 'oracle', role: 'member' },
        { agentId: 'synth', role: 'observer' },
      ],
    });

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: '/api/shared-context/teams' }),
      res,
      createDeps(),
    );
    const body = parseJsonBody(res);
    expect(body.total).toBe(1);
    expect(body.teams).toHaveLength(1);

    const team = (body.teams as any[])[0];
    expect(team.id).toBe('team-alpha');
    expect(team.name).toBe('alpha-squad');
    expect(team.agentCount).toBe(3);
    expect(team.agents).toHaveLength(3);
    expect(team.agents[0].agentId).toBe('nexus');
    expect(team.agents[0].role).toBe('member');
  });

  it('returns multiple teams', () => {
    seedTeam({ id: 'team-a', name: 'alpha', agents: [{ agentId: 'nexus' }] });
    // Need to re-open database for second team (seedTeam creates fresh tables)
    const db = new Database(teamDbPath);
    db.prepare('INSERT INTO teams (id, name, created_at, owner_user_id) VALUES (?, ?, ?, ?)')
      .run('team-b', 'beta', new Date().toISOString(), 'user-1');
    db.prepare('INSERT INTO team_agents (team_id, agent_id, role, joined_at) VALUES (?, ?, ?, ?)')
      .run('team-b', 'oracle', 'member', new Date().toISOString());
    db.prepare('INSERT INTO team_agents (team_id, agent_id, role, joined_at) VALUES (?, ?, ?, ?)')
      .run('team-b', 'sentinel', 'curator', new Date().toISOString());
    db.close();

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: '/api/shared-context/teams' }),
      res,
      createDeps(),
    );
    const body = parseJsonBody(res);
    expect(body.total).toBe(2);
  });

  it('enriches with lastActivityAt from audit store', () => {
    seedTeam({ id: 'team-a', name: 'alpha', agents: [{ agentId: 'nexus' }] });

    const ts = '2026-02-17T12:00:00.000Z';
    seedAuditEntries([{
      teamId: 'team-a',
      agentId: 'nexus',
      action: 'write',
      filePath: 'priorities.md',
      timestamp: ts,
    }]);

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: '/api/shared-context/teams' }),
      res,
      createDeps(),
    );
    const body = parseJsonBody(res);
    const team = (body.teams as any[])[0];
    expect(team.lastActivityAt).toBe(ts);
  });
});

// ─── GET /api/shared-context/teams/:id ───────────────────────────────────────

describe('GET /api/shared-context/teams/:id', () => {
  it('returns 404 for non-existent team', () => {
    const db = createTeamTables(teamDbPath);
    db.close();

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: '/api/shared-context/teams/nonexistent' }),
      res,
      createDeps(),
    );
    expect(res._statusCode).toBe(404);
  });

  it('returns 503 when team service is unavailable', () => {
    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: '/api/shared-context/teams/some-id' }),
      res,
      createDeps({ teamDbPath: path.join(tmpDir, 'nonexistent', 'no.db') }),
    );
    expect(res._statusCode).toBe(503);
  });

  it('returns team detail with agents', () => {
    const teamId = seedTeam({
      name: 'core-team',
      agents: [
        { agentId: 'nexus', role: 'member' },
        { agentId: 'oracle', role: 'curator' },
      ],
    });

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: `/api/shared-context/teams/${teamId}` }),
      res,
      createDeps(),
    );
    expect(res._statusCode).toBe(200);
    const body = parseJsonBody(res);
    expect(body.name).toBe('core-team');
    expect((body.agents as any[]).map((a: any) => a.agentId)).toEqual(['nexus', 'oracle']);
  });

  it('includes directory info when directory exists', () => {
    const teamId = seedTeam({
      name: 'dir-team',
      agents: [{ agentId: 'nexus' }],
    });
    scaffoldTeamDir('dir-team', {
      'agent-outputs/nexus/task-1.md': '# Task 1\nDone.',
    });

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: `/api/shared-context/teams/${teamId}` }),
      res,
      createDeps(),
    );
    const body = parseJsonBody(res);
    expect((body.directory as any).exists).toBe(true);
    expect((body.directory as any).fileCount).toBeGreaterThan(0);
    expect((body.directory as any).totalSizeBytes).toBeGreaterThan(0);
  });

  it('reports directory as non-existent when not scaffolded', () => {
    const teamId = seedTeam({
      name: 'no-dir-team',
      agents: [{ agentId: 'nexus' }],
    });

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: `/api/shared-context/teams/${teamId}` }),
      res,
      createDeps(),
    );
    const body = parseJsonBody(res);
    expect((body.directory as any).exists).toBe(false);
    expect((body.directory as any).fileCount).toBe(0);
  });
});

// ─── GET /api/shared-context/teams/:id/activity ──────────────────────────────

describe('GET /api/shared-context/teams/:id/activity', () => {
  it('returns 404 for non-existent team', () => {
    const db = createTeamTables(teamDbPath);
    db.close();
    createAuditTables(auditDbPath).close();

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: '/api/shared-context/teams/nonexistent/activity' }),
      res,
      createDeps(),
    );
    expect(res._statusCode).toBe(404);
  });

  it('returns empty entries when no audit data exists', () => {
    const teamId = seedTeam({ name: 'empty-team', agents: [{ agentId: 'nexus' }] });
    createAuditTables(auditDbPath).close();

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: `/api/shared-context/teams/${teamId}/activity` }),
      res,
      createDeps(),
    );
    const body = parseJsonBody(res);
    expect(body.entries).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.available).toBe(true);
  });

  it('returns audit entries sorted by most recent first', () => {
    const teamId = seedTeam({ name: 'active-team', agents: [{ agentId: 'nexus' }] });

    const entries = [
      { teamId, agentId: 'nexus', action: 'write' as const, filePath: 'file-a.md', timestamp: '2026-02-17T10:00:00.000Z' },
      { teamId, agentId: 'nexus', action: 'write' as const, filePath: 'file-b.md', timestamp: '2026-02-17T12:00:00.000Z' },
      { teamId, agentId: 'oracle', action: 'delete' as const, filePath: 'file-c.md', timestamp: '2026-02-17T11:00:00.000Z' },
    ];
    seedAuditEntries(entries);

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: `/api/shared-context/teams/${teamId}/activity` }),
      res,
      createDeps(),
    );
    const body = parseJsonBody(res);
    expect(body.total).toBe(3);
    const entryList = body.entries as any[];
    // Should be sorted most recent first (12:00, 11:00, 10:00)
    expect(entryList[0].timestamp).toBe('2026-02-17T12:00:00.000Z');
    expect(entryList[1].timestamp).toBe('2026-02-17T11:00:00.000Z');
    expect(entryList[2].timestamp).toBe('2026-02-17T10:00:00.000Z');
  });

  it('respects limit parameter', () => {
    const teamId = seedTeam({ name: 'limited-team', agents: [{ agentId: 'nexus' }] });

    const entries = Array.from({ length: 20 }, (_, i) => ({
      teamId,
      agentId: 'nexus',
      filePath: `file-${i}.md`,
    }));
    seedAuditEntries(entries);

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: `/api/shared-context/teams/${teamId}/activity?limit=5` }),
      res,
      createDeps(),
    );
    const body = parseJsonBody(res);
    expect(body.total).toBe(5);
    expect(body.limit).toBe(5);
  });

  it('clamps limit to bounded range', () => {
    const teamId = seedTeam({ name: 'clamp-team', agents: [{ agentId: 'nexus' }] });
    createAuditTables(auditDbPath).close();

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: `/api/shared-context/teams/${teamId}/activity?limit=999` }),
      res,
      createDeps(),
    );
    const body = parseJsonBody(res);
    expect(body.limit).toBe(200); // clamped to max
  });

  it('uses default limit of 50 when not specified', () => {
    const teamId = seedTeam({ name: 'default-team', agents: [{ agentId: 'nexus' }] });
    createAuditTables(auditDbPath).close();

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: `/api/shared-context/teams/${teamId}/activity` }),
      res,
      createDeps(),
    );
    const body = parseJsonBody(res);
    expect(body.limit).toBe(50);
  });

  it('filters by agent_id', () => {
    const teamId = seedTeam({ name: 'filter-team', agents: [{ agentId: 'nexus' }, { agentId: 'oracle' }] });

    seedAuditEntries([
      { teamId, agentId: 'nexus', filePath: 'nexus-file.md' },
      { teamId, agentId: 'oracle', filePath: 'oracle-file.md' },
      { teamId, agentId: 'nexus', filePath: 'nexus-file2.md' },
    ]);

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: `/api/shared-context/teams/${teamId}/activity?agent_id=nexus` }),
      res,
      createDeps(),
    );
    const body = parseJsonBody(res);
    expect(body.total).toBe(2);
    expect((body.entries as any[]).every((e: any) => e.agentId === 'nexus')).toBe(true);
  });

  it('filters by action type', () => {
    const teamId = seedTeam({ name: 'action-filter-team', agents: [{ agentId: 'nexus' }] });

    seedAuditEntries([
      { teamId, agentId: 'nexus', action: 'write', filePath: 'write.md' },
      { teamId, agentId: 'nexus', action: 'delete', filePath: 'delete.md' },
      { teamId, agentId: 'nexus', action: 'write', filePath: 'write2.md' },
    ]);

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: `/api/shared-context/teams/${teamId}/activity?action=delete` }),
      res,
      createDeps(),
    );
    const body = parseJsonBody(res);
    expect(body.total).toBe(1);
    expect((body.entries as any[])[0].action).toBe('delete');
  });

  it('returns entries with expected fields', () => {
    const teamId = seedTeam({ name: 'fields-team', agents: [{ agentId: 'nexus' }] });

    seedAuditEntries([{
      teamId,
      agentId: 'nexus',
      action: 'write',
      filePath: 'priorities.md',
      fileSizeBytes: 2048,
      detail: 'Updated priorities',
    }]);

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: `/api/shared-context/teams/${teamId}/activity` }),
      res,
      createDeps(),
    );
    const body = parseJsonBody(res);
    const entry = (body.entries as any[])[0];
    expect(entry).toHaveProperty('id');
    expect(entry).toHaveProperty('agentId');
    expect(entry).toHaveProperty('action');
    expect(entry).toHaveProperty('filePath');
    expect(entry).toHaveProperty('fileSizeBytes');
    expect(entry).toHaveProperty('timestamp');
    expect(entry).toHaveProperty('detail');
    expect(entry.agentId).toBe('nexus');
    expect(entry.action).toBe('write');
    expect(entry.filePath).toBe('priorities.md');
    expect(entry.fileSizeBytes).toBe(2048);
    expect(entry.detail).toBe('Updated priorities');
  });

  it('returns unavailable when audit store cannot be opened', () => {
    const teamId = seedTeam({ name: 'no-audit-team', agents: [{ agentId: 'nexus' }] });

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: `/api/shared-context/teams/${teamId}/activity` }),
      res,
      createDeps({ auditDbPath: path.join(tmpDir, 'nonexistent', 'dir', 'audit.db') }),
    );
    const body = parseJsonBody(res);
    expect(body.entries).toEqual([]);
    expect(body.available).toBe(false);
  });
});

// ─── GET /api/shared-context/teams/:id/files ─────────────────────────────────

describe('GET /api/shared-context/teams/:id/files', () => {
  it('returns 404 for non-existent team', () => {
    const db = createTeamTables(teamDbPath);
    db.close();

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: '/api/shared-context/teams/nonexistent/files' }),
      res,
      createDeps(),
    );
    expect(res._statusCode).toBe(404);
  });

  it('returns empty file list when directory does not exist', () => {
    const teamId = seedTeam({ name: 'no-dir-team', agents: [{ agentId: 'nexus' }] });

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: `/api/shared-context/teams/${teamId}/files` }),
      res,
      createDeps(),
    );
    const body = parseJsonBody(res);
    expect(body.files).toEqual([]);
    expect(body.directoryExists).toBe(false);
    expect(body.total).toBe(0);
  });

  it('lists files with metadata', () => {
    const teamId = seedTeam({ name: 'files-team', agents: [{ agentId: 'nexus' }] });
    scaffoldTeamDir('files-team', {
      'agent-outputs/nexus/task-1.md': '# Task 1\nCompleted successfully.',
      'agent-outputs/oracle/analysis.md': '# Analysis\nInsights here.',
    });

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: `/api/shared-context/teams/${teamId}/files` }),
      res,
      createDeps(),
    );
    const body = parseJsonBody(res);
    expect(body.directoryExists).toBe(true);
    expect(body.total).toBeGreaterThan(0);
    expect(body.totalSizeBytes).toBeGreaterThan(0);

    const files = body.files as any[];
    // Find the task-1.md file
    const taskFile = files.find((f: any) => f.path === 'agent-outputs/nexus/task-1.md');
    expect(taskFile).toBeDefined();
    expect(taskFile.sizeBytes).toBeGreaterThan(0);
    expect(taskFile.lastModified).toBeTruthy();
    expect(taskFile.isDirectory).toBe(false);
    expect(taskFile.author).toBe('nexus'); // inferred from path
  });

  it('includes directories in listing', () => {
    const teamId = seedTeam({ name: 'dirs-team', agents: [{ agentId: 'nexus' }] });
    scaffoldTeamDir('dirs-team');

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: `/api/shared-context/teams/${teamId}/files` }),
      res,
      createDeps(),
    );
    const body = parseJsonBody(res);
    const files = body.files as any[];
    const dirs = files.filter((f: any) => f.isDirectory);
    expect(dirs.length).toBeGreaterThan(0);
    // Check standard directories exist
    const dirNames = dirs.map((d: any) => d.name);
    expect(dirNames).toContain('agent-outputs');
    expect(dirNames).toContain('feedback');
    expect(dirNames).toContain('kpis');
  });

  it('excludes .meta directory from listing', () => {
    const teamId = seedTeam({ name: 'meta-team', agents: [{ agentId: 'nexus' }] });
    scaffoldTeamDir('meta-team');

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: `/api/shared-context/teams/${teamId}/files` }),
      res,
      createDeps(),
    );
    const body = parseJsonBody(res);
    const files = body.files as any[];
    const metaEntries = files.filter((f: any) =>
      f.path === '.meta' || f.path.startsWith('.meta/'),
    );
    expect(metaEntries).toHaveLength(0);
  });

  it('enriches author from manifest when available', () => {
    const teamId = seedTeam({ name: 'manifest-team', agents: [{ agentId: 'nexus' }] });
    scaffoldTeamDir('manifest-team', {
      'priorities.md': '# Updated priorities\n- Task A\n',
    });

    // Write a manifest with author info
    const teamDir = path.join(sharedContextDir, 'manifest-team');
    fs.writeFileSync(
      path.join(teamDir, '.meta', 'manifest.json'),
      JSON.stringify({
        files: [
          { path: 'priorities.md', lastModifiedBy: 'synth', lastModifiedAt: '2026-02-17T12:00:00Z', sizeBytes: 50 },
        ],
        lastSync: {},
      }),
    );

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: `/api/shared-context/teams/${teamId}/files` }),
      res,
      createDeps(),
    );
    const body = parseJsonBody(res);
    const files = body.files as any[];
    const prioritiesFile = files.find((f: any) => f.path === 'priorities.md');
    expect(prioritiesFile).toBeDefined();
    expect(prioritiesFile.author).toBe('synth'); // from manifest
  });

  it('returns 503 when team service is unavailable', () => {
    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: '/api/shared-context/teams/some-id/files' }),
      res,
      createDeps({ teamDbPath: path.join(tmpDir, 'nonexistent', 'no.db') }),
    );
    expect(res._statusCode).toBe(503);
  });
});

// ─── Auth-Safe Behavior ──────────────────────────────────────────────────────

describe('Auth-Safe Route Behavior', () => {
  it('does not expose filesystem paths outside shared-context', () => {
    const teamId = seedTeam({ name: 'safe-team', agents: [{ agentId: 'nexus' }] });
    scaffoldTeamDir('safe-team');

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: `/api/shared-context/teams/${teamId}/files` }),
      res,
      createDeps(),
    );
    const body = parseJsonBody(res);
    const files = body.files as any[];

    // File paths should be relative, not absolute
    for (const file of files) {
      expect(file.path).not.toMatch(/^\//);
      expect(file.path).not.toContain('..');
    }
  });

  it('does not handle non-GET methods (relies on existing auth middleware)', () => {
    // The route handler rejects non-GET methods, returning false
    // so the server's auth middleware handles them
    const putResult = handleSharedContext(
      mockRequest({ url: '/api/shared-context/teams', method: 'PUT' }),
      mockResponse(),
      createDeps(),
    );
    expect(putResult).toBe(false);

    const deleteResult = handleSharedContext(
      mockRequest({ url: '/api/shared-context/teams', method: 'DELETE' }),
      mockResponse(),
      createDeps(),
    );
    expect(deleteResult).toBe(false);
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────────────

describe('Edge Cases', () => {
  it('handles URL-encoded team IDs', () => {
    const teamId = seedTeam({ name: 'encoded-team', agents: [{ agentId: 'nexus' }] });

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: `/api/shared-context/teams/${encodeURIComponent(teamId)}` }),
      res,
      createDeps(),
    );
    expect(res._statusCode).toBe(200);
  });

  it('handles team with no agents', () => {
    const teamId = seedTeam({ name: 'empty-agents-team', agents: [] });

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: `/api/shared-context/teams/${teamId}` }),
      res,
      createDeps(),
    );
    const body = parseJsonBody(res);
    expect(body.agents).toEqual([]);
  });

  it('handles combined agent and action filters on activity', () => {
    const teamId = seedTeam({ name: 'combo-team', agents: [{ agentId: 'nexus' }, { agentId: 'oracle' }] });

    seedAuditEntries([
      { teamId, agentId: 'nexus', action: 'write', filePath: 'a.md' },
      { teamId, agentId: 'nexus', action: 'delete', filePath: 'b.md' },
      { teamId, agentId: 'oracle', action: 'write', filePath: 'c.md' },
      { teamId, agentId: 'oracle', action: 'delete', filePath: 'd.md' },
    ]);

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: `/api/shared-context/teams/${teamId}/activity?agent_id=nexus&action=write` }),
      res,
      createDeps(),
    );
    const body = parseJsonBody(res);
    expect(body.total).toBe(1);
    expect((body.entries as any[])[0].agentId).toBe('nexus');
    expect((body.entries as any[])[0].action).toBe('write');
  });

  it('handles invalid limit gracefully (uses default)', () => {
    const teamId = seedTeam({ name: 'bad-limit-team', agents: [{ agentId: 'nexus' }] });
    createAuditTables(auditDbPath).close();

    const res = mockResponse();
    handleSharedContext(
      mockRequest({ url: `/api/shared-context/teams/${teamId}/activity?limit=not-a-number` }),
      res,
      createDeps(),
    );
    const body = parseJsonBody(res);
    expect(body.limit).toBe(50); // default
  });
});

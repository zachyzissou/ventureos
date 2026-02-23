/**
 * Tests for TeamService — Issue #241
 * Phase 1 of #217 (Shared Agent Memory Layer)
 *
 * Validates team CRUD operations, agent membership management,
 * directory scaffold creation, manifest initialization, and edge cases.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import type { TeamService as TeamServiceType } from '../team-service';
import type { SharedContextManifest, TeamAgentRole } from '../types/team';
import { SHARED_CONTEXT_SUBDIRS } from '../types/team';

// ─── Test Helpers ───────────────────────────────────────────────────────────

let tmpDir: string;
let dbPath: string;
let sharedContextRoot: string;

/**
 * Override SHARED_CONTEXT_DIR so teamSharedContextDir() resolves
 * to our temp directory. We re-require paths each time to pick up
 * the env var change.
 */
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'team-service-test-'));
  dbPath = path.join(tmpDir, 'teams.db');
  sharedContextRoot = path.join(tmpDir, 'shared-context');
  fs.mkdirSync(sharedContextRoot, { recursive: true });

  // Point SHARED_CONTEXT to our temp dir
  process.env.SHARED_CONTEXT = sharedContextRoot;
  // Clear module cache so paths.ts re-evaluates with new env
  jest.resetModules();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.SHARED_CONTEXT;
  jest.resetModules();
});

/**
 * Create a fresh TeamService instance.
 * Must be called AFTER jest.resetModules() in the test body
 * so it picks up the overridden SHARED_CONTEXT env var.
 */
function createService(): TeamServiceType {
  // Re-require to get fresh module with updated env
  const { TeamService: TS } = require('../team-service');
  return new TS(dbPath);
}

// ─── Schema Tests ───────────────────────────────────────────────────────────

describe('TeamService — Schema', () => {
  test('creates teams and team_agents tables on initialization', () => {
    const svc = createService();
    svc.close();

    const db = new Database(dbPath, { readonly: true });
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('teams','team_agents')")
      .all() as any[];
    const names = tables.map((t: any) => t.name).sort();
    expect(names).toEqual(['team_agents', 'teams']);
    db.close();
  });

  test('creates expected indexes', () => {
    const svc = createService();
    svc.close();

    const db = new Database(dbPath, { readonly: true });
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all() as any[];
    const indexNames = indexes.map((i: any) => i.name);
    expect(indexNames).toContain('idx_team_agents_agent');
    expect(indexNames).toContain('idx_teams_name');
    db.close();
  });

  test('schema creation is idempotent', () => {
    const svc1 = createService();
    svc1.close();
    // Second initialization should not throw
    const svc2 = createService();
    svc2.close();
  });
});

// ─── Team CRUD Tests ────────────────────────────────────────────────────────

describe('TeamService — Team CRUD', () => {
  test('createTeam returns team with correct fields', () => {
    const svc = createService();
    try {
      const team = svc.createTeam('alpha-squad', ['nexus', 'oracle'], 'user-1');

      expect(team.id).toBeTruthy();
      expect(team.name).toBe('alpha-squad');
      expect(team.ownerUserId).toBe('user-1');
      expect(team.createdAt).toBeTruthy();
      expect(team.agents).toHaveLength(2);
      expect(team.agents[0].agentId).toBe('nexus');
      expect(team.agents[0].role).toBe('member');
      expect(team.agents[1].agentId).toBe('oracle');
    } finally {
      svc.close();
    }
  });

  test('createTeam with empty agent list succeeds', () => {
    const svc = createService();
    try {
      const team = svc.createTeam('lonely-team', [], 'user-1');

      expect(team.agents).toHaveLength(0);
      expect(team.name).toBe('lonely-team');
    } finally {
      svc.close();
    }
  });

  test('createTeam with many agents succeeds', () => {
    const svc = createService();
    try {
      const agents = Array.from({ length: 12 }, (_, i) => `agent-${i}`);
      const team = svc.createTeam('big-team', agents, 'user-1');

      expect(team.agents).toHaveLength(12);
    } finally {
      svc.close();
    }
  });

  test('createTeam sanitizes team name', () => {
    const svc = createService();
    try {
      const team = svc.createTeam('My Team Name!', ['nexus'], 'user-1');
      expect(team.name).toBe('my-team-name');
    } finally {
      svc.close();
    }
  });

  test('createTeam rejects empty/invalid names', () => {
    const svc = createService();
    try {
      expect(() => svc.createTeam('', [], 'user-1')).toThrow(/Invalid team name/);
      expect(() => svc.createTeam('!!!', [], 'user-1')).toThrow(/Invalid team name/);
      expect(() => svc.createTeam('   ', [], 'user-1')).toThrow(/Invalid team name/);

      try {
        svc.createTeam('', [], 'user-1');
      } catch (err: any) {
        expect(err.code).toBe('INVALID_TEAM_NAME');
        expect(err.name).toBe('TeamServiceError');
      }
    } finally {
      svc.close();
    }
  });

  test('createTeam rejects duplicate names', () => {
    const svc = createService();
    try {
      svc.createTeam('alpha', ['nexus'], 'user-1');

      expect(() => svc.createTeam('alpha', ['oracle'], 'user-2')).toThrow(/already taken/);

      try {
        svc.createTeam('alpha', ['oracle'], 'user-2');
      } catch (err: any) {
        expect(err.code).toBe('TEAM_NAME_TAKEN');
        expect(err.name).toBe('TeamServiceError');
      }
    } finally {
      svc.close();
    }
  });

  test('getTeam returns team with agents', () => {
    const svc = createService();
    try {
      const created = svc.createTeam('bravo', ['nexus', 'oracle'], 'user-1');
      const fetched = svc.getTeam(created.id);

      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.name).toBe('bravo');
      expect(fetched!.agents).toHaveLength(2);
    } finally {
      svc.close();
    }
  });

  test('getTeam returns null for non-existent team', () => {
    const svc = createService();
    try {
      expect(svc.getTeam('non-existent-id')).toBeNull();
    } finally {
      svc.close();
    }
  });

  test('listTeams returns all teams', () => {
    const svc = createService();
    try {
      svc.createTeam('team-a', ['nexus'], 'user-1');
      svc.createTeam('team-b', ['oracle'], 'user-1');
      svc.createTeam('team-c', [], 'user-2');

      const teams = svc.listTeams();
      expect(teams).toHaveLength(3);

      const names = teams.map((t: any) => t.name).sort();
      expect(names).toEqual(['team-a', 'team-b', 'team-c']);
    } finally {
      svc.close();
    }
  });

  test('listTeams returns empty array when no teams exist', () => {
    const svc = createService();
    try {
      expect(svc.listTeams()).toEqual([]);
    } finally {
      svc.close();
    }
  });

  test('deleteTeam removes team and cascades to agents', () => {
    const svc = createService();
    try {
      const team = svc.createTeam('doomed', ['nexus', 'oracle'], 'user-1');

      const deleted = svc.deleteTeam(team.id);
      expect(deleted).toBe(true);

      // Team should be gone
      expect(svc.getTeam(team.id)).toBeNull();

      // Agents should no longer be associated
      expect(svc.getTeamForAgent('nexus')).toBeNull();
    } finally {
      svc.close();
    }
  });

  test('deleteTeam returns false for non-existent team', () => {
    const svc = createService();
    try {
      expect(svc.deleteTeam('non-existent')).toBe(false);
    } finally {
      svc.close();
    }
  });

  test('deleteTeam preserves shared-context directory', () => {
    const svc = createService();
    try {
      const team = svc.createTeam('preserve-me', ['nexus'], 'user-1');
      const teamDir = path.join(sharedContextRoot, 'preserve-me');

      // Directory should exist after creation
      expect(fs.existsSync(teamDir)).toBe(true);

      // Delete the team record
      svc.deleteTeam(team.id);

      // Directory should still exist
      expect(fs.existsSync(teamDir)).toBe(true);
    } finally {
      svc.close();
    }
  });
});

// ─── Agent Membership Tests ─────────────────────────────────────────────────

describe('TeamService — Agent Membership', () => {
  test('addAgent adds agent with specified role', () => {
    const svc = createService();
    try {
      const team = svc.createTeam('roles-team', [], 'user-1');
      const agent = svc.addAgent(team.id, 'curator-bot', 'curator');

      expect(agent.teamId).toBe(team.id);
      expect(agent.agentId).toBe('curator-bot');
      expect(agent.role).toBe('curator');
      expect(agent.joinedAt).toBeTruthy();

      const fetched = svc.getTeam(team.id);
      expect(fetched!.agents).toHaveLength(1);
      expect(fetched!.agents[0].role).toBe('curator');
    } finally {
      svc.close();
    }
  });

  test('addAgent defaults to member role', () => {
    const svc = createService();
    try {
      const team = svc.createTeam('default-role', [], 'user-1');
      const agent = svc.addAgent(team.id, 'oracle');

      expect(agent.role).toBe('member');
    } finally {
      svc.close();
    }
  });

  test('addAgent rejects invalid role', () => {
    const svc = createService();
    try {
      const team = svc.createTeam('bad-role', [], 'user-1');

      expect(() =>
        svc.addAgent(team.id, 'nexus', 'admin' as TeamAgentRole),
      ).toThrow(/Invalid role/);

      try {
        svc.addAgent(team.id, 'nexus', 'admin' as TeamAgentRole);
      } catch (err: any) {
        expect(err.code).toBe('INVALID_ROLE');
        expect(err.name).toBe('TeamServiceError');
      }
    } finally {
      svc.close();
    }
  });

  test('addAgent rejects non-existent team', () => {
    const svc = createService();
    try {
      expect(() => svc.addAgent('fake-team', 'nexus')).toThrow(/not found/);

      try {
        svc.addAgent('fake-team', 'nexus');
      } catch (err: any) {
        expect(err.code).toBe('TEAM_NOT_FOUND');
        expect(err.name).toBe('TeamServiceError');
      }
    } finally {
      svc.close();
    }
  });

  test('addAgent rejects duplicate agent', () => {
    const svc = createService();
    try {
      const team = svc.createTeam('dupe-team', ['nexus'], 'user-1');

      expect(() => svc.addAgent(team.id, 'nexus')).toThrow(/already in team/);

      try {
        svc.addAgent(team.id, 'nexus');
      } catch (err: any) {
        expect(err.code).toBe('AGENT_ALREADY_IN_TEAM');
        expect(err.name).toBe('TeamServiceError');
      }
    } finally {
      svc.close();
    }
  });

  test('addAgent creates agent output directory', () => {
    const svc = createService();
    try {
      const team = svc.createTeam('output-dir', [], 'user-1');
      svc.addAgent(team.id, 'synth');

      const outputDir = path.join(sharedContextRoot, 'output-dir', 'agent-outputs', 'synth');
      expect(fs.existsSync(outputDir)).toBe(true);
    } finally {
      svc.close();
    }
  });

  test('removeAgent removes agent from team', () => {
    const svc = createService();
    try {
      const team = svc.createTeam('remove-test', ['nexus', 'oracle'], 'user-1');

      const removed = svc.removeAgent(team.id, 'nexus');
      expect(removed).toBe(true);

      const fetched = svc.getTeam(team.id);
      expect(fetched!.agents).toHaveLength(1);
      expect(fetched!.agents[0].agentId).toBe('oracle');
    } finally {
      svc.close();
    }
  });

  test('removeAgent returns false for non-member', () => {
    const svc = createService();
    try {
      const team = svc.createTeam('no-member', ['nexus'], 'user-1');
      const removed = svc.removeAgent(team.id, 'not-in-team');
      expect(removed).toBe(false);
    } finally {
      svc.close();
    }
  });

  test('removeAgent throws for non-existent team', () => {
    const svc = createService();
    try {
      expect(() => svc.removeAgent('fake-team', 'nexus')).toThrow(/not found/);

      try {
        svc.removeAgent('fake-team', 'nexus');
      } catch (err: any) {
        expect(err.code).toBe('TEAM_NOT_FOUND');
        expect(err.name).toBe('TeamServiceError');
      }
    } finally {
      svc.close();
    }
  });

  test('getTeamForAgent returns team membership', () => {
    const svc = createService();
    try {
      const team = svc.createTeam('lookup-test', ['nexus', 'oracle'], 'user-1');
      const found = svc.getTeamForAgent('oracle');

      expect(found).not.toBeNull();
      expect(found!.id).toBe(team.id);
      expect(found!.name).toBe('lookup-test');
      expect(found!.agents).toHaveLength(2);
    } finally {
      svc.close();
    }
  });

  test('getTeamForAgent returns null for unaffiliated agent', () => {
    const svc = createService();
    try {
      expect(svc.getTeamForAgent('loner')).toBeNull();
    } finally {
      svc.close();
    }
  });

  test('all three roles can be assigned', () => {
    const svc = createService();
    try {
      const team = svc.createTeam('all-roles', [], 'user-1');
      svc.addAgent(team.id, 'member-agent', 'member');
      svc.addAgent(team.id, 'curator-agent', 'curator');
      svc.addAgent(team.id, 'observer-agent', 'observer');

      const fetched = svc.getTeam(team.id);
      const roles = fetched!.agents.map((a: any) => a.role).sort();
      expect(roles).toEqual(['curator', 'member', 'observer']);
    } finally {
      svc.close();
    }
  });
});

// ─── Directory Scaffold Tests ───────────────────────────────────────────────

describe('TeamService — Directory Scaffold', () => {
  test('createTeam creates correct directory structure', () => {
    const svc = createService();
    try {
      svc.createTeam('scaffold-test', ['nexus', 'oracle'], 'user-1');
      const teamDir = path.join(sharedContextRoot, 'scaffold-test');

      // Base directory exists
      expect(fs.existsSync(teamDir)).toBe(true);

      // All standard subdirectories exist
      for (const subdir of SHARED_CONTEXT_SUBDIRS) {
        const fullPath = path.join(teamDir, subdir);
        expect(fs.existsSync(fullPath)).toBe(true);
        expect(fs.statSync(fullPath).isDirectory()).toBe(true);
      }

      // Per-agent output directories exist
      expect(fs.existsSync(path.join(teamDir, 'agent-outputs', 'nexus'))).toBe(true);
      expect(fs.existsSync(path.join(teamDir, 'agent-outputs', 'oracle'))).toBe(true);
    } finally {
      svc.close();
    }
  });

  test('scaffold creates priorities.md', () => {
    const svc = createService();
    try {
      svc.createTeam('priorities-test', [], 'user-1');
      const filePath = path.join(sharedContextRoot, 'priorities-test', 'priorities.md');

      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('# Team Priorities');
    } finally {
      svc.close();
    }
  });

  test('scaffold creates .meta/manifest.json with correct structure', () => {
    const svc = createService();
    try {
      svc.createTeam('manifest-test', [], 'user-1');
      const manifestPath = path.join(sharedContextRoot, 'manifest-test', '.meta', 'manifest.json');

      expect(fs.existsSync(manifestPath)).toBe(true);

      const manifest: SharedContextManifest = JSON.parse(
        fs.readFileSync(manifestPath, 'utf-8'),
      );
      expect(manifest.files).toEqual([]);
      expect(manifest.lastSync).toEqual({});
    } finally {
      svc.close();
    }
  });

  test('scaffold creates .meta/last-sync.json', () => {
    const svc = createService();
    try {
      svc.createTeam('sync-test', [], 'user-1');
      const syncPath = path.join(sharedContextRoot, 'sync-test', '.meta', 'last-sync.json');

      expect(fs.existsSync(syncPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(syncPath, 'utf-8'));
      expect(content).toEqual({});
    } finally {
      svc.close();
    }
  });

  test('scaffold is idempotent — calling twice does not error or overwrite', () => {
    const svc = createService();
    try {
      svc.createTeam('idempotent-test', ['nexus'], 'user-1');

      // Modify priorities.md to prove it won't be overwritten
      const priPath = path.join(sharedContextRoot, 'idempotent-test', 'priorities.md');
      fs.writeFileSync(priPath, '# Custom priorities\n', 'utf-8');

      // Call scaffoldDirectory again directly
      const { teamSharedContextDir } = require('../paths');
      svc.scaffoldDirectory('idempotent-test', ['nexus', 'oracle']);

      // Custom content should be preserved
      const content = fs.readFileSync(priPath, 'utf-8');
      expect(content).toBe('# Custom priorities\n');

      // New agent directory should exist too
      expect(
        fs.existsSync(path.join(sharedContextRoot, 'idempotent-test', 'agent-outputs', 'oracle')),
      ).toBe(true);
    } finally {
      svc.close();
    }
  });

  test('scaffold matches #217 epic directory structure exactly', () => {
    const svc = createService();
    try {
      svc.createTeam('spec-check', ['agent-a'], 'user-1');
      const teamDir = path.join(sharedContextRoot, 'spec-check');

      // From #217 spec:
      // shared-context/{team-name}/
      // ├── priorities.md
      // ├── agent-outputs/{agent-name}/
      // ├── feedback/
      // ├── kpis/
      // ├── calendar/
      // ├── roundtable/
      // └── .meta/
      //     ├── manifest.json
      //     └── last-sync.json

      const expectedPaths = [
        'priorities.md',
        'agent-outputs/agent-a',
        'feedback',
        'kpis',
        'calendar',
        'roundtable',
        '.meta/manifest.json',
        '.meta/last-sync.json',
      ];

      for (const relPath of expectedPaths) {
        const fullPath = path.join(teamDir, relPath);
        expect(fs.existsSync(fullPath)).toBe(true);
      }
    } finally {
      svc.close();
    }
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────────────

describe('TeamService — Edge Cases', () => {
  test('team names with special characters are sanitized consistently', () => {
    const svc = createService();
    try {
      const team = svc.createTeam('Hello World! @#$%', ['nexus'], 'user-1');
      expect(team.name).toBe('hello-world');

      // Directory should use the sanitized name
      const teamDir = path.join(sharedContextRoot, 'hello-world');
      expect(fs.existsSync(teamDir)).toBe(true);
    } finally {
      svc.close();
    }
  });

  test('team names with underscores are preserved', () => {
    const svc = createService();
    try {
      const team = svc.createTeam('my_team_name', [], 'user-1');
      expect(team.name).toBe('my_team_name');
    } finally {
      svc.close();
    }
  });

  test('sanitized names that collide are treated as duplicates', () => {
    const svc = createService();
    try {
      svc.createTeam('alpha', [], 'user-1');

      // "ALPHA" sanitizes to "alpha" — should conflict
      expect(() => svc.createTeam('ALPHA', [], 'user-2')).toThrow(/already taken/);
    } finally {
      svc.close();
    }
  });

  test('UUID uniqueness across many teams', () => {
    const svc = createService();
    try {
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const team = svc.createTeam(`team-${i}`, [], 'user-1');
        ids.add(team.id);
      }
      expect(ids.size).toBe(50);
    } finally {
      svc.close();
    }
  });

  test('close is idempotent', () => {
    const svc = createService();
    svc.close();
    svc.close(); // Should not throw
  });

  test('agent membership survives service restart', () => {
    // Create with one service instance
    const svc1 = createService();
    const team = svc1.createTeam('persistent', ['nexus', 'oracle'], 'user-1');
    const teamId = team.id;
    svc1.close();

    // Re-open with a fresh instance
    const svc2 = createService();
    try {
      const fetched = svc2.getTeam(teamId);
      expect(fetched).not.toBeNull();
      expect(fetched!.name).toBe('persistent');
      expect(fetched!.agents).toHaveLength(2);
    } finally {
      svc2.close();
    }
  });
});

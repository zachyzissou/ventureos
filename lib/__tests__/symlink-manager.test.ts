/**
 * Tests for SymlinkManager — Issue #242
 * Phase 2 of #217 (Shared Agent Memory Layer)
 *
 * Validates symlink creation, validation, repair, removal,
 * idempotency, safe fallback behavior, and non-destructive operation.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { SymlinkManager as SymlinkManagerType } from '../symlink-manager';
import type { SymlinkManagerError as SymlinkManagerErrorType } from '../symlink-manager';

// ─── Test Helpers ───────────────────────────────────────────────────────────

let tmpDir: string;
let openclawDir: string;
let sharedContextRoot: string;

/**
 * Override env vars so paths.ts resolves to our temp directory.
 * We re-require modules each test to pick up env changes.
 */
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'symlink-mgr-test-'));
  openclawDir = path.join(tmpDir, '.openclaw');
  sharedContextRoot = path.join(tmpDir, 'shared-context');
  fs.mkdirSync(openclawDir, { recursive: true });
  fs.mkdirSync(sharedContextRoot, { recursive: true });

  process.env.OPENCLAW_DIR = openclawDir;
  process.env.SHARED_CONTEXT = sharedContextRoot;
  jest.resetModules();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.OPENCLAW_DIR;
  delete process.env.SHARED_CONTEXT;
  jest.resetModules();
});

/**
 * Create a fresh SymlinkManager instance.
 * Must be called AFTER jest.resetModules() in the test body.
 */
function createManager(): SymlinkManagerType {
  const { SymlinkManager: SM } = require('../symlink-manager');
  return new SM();
}

/**
 * Helper: create a team's shared-context directory.
 */
function createTeamDir(teamName: string): string {
  const dir = path.join(sharedContextRoot, teamName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Helper: get workspace path for an agent.
 */
function workspacePath(agentId: string): string {
  return path.join(openclawDir, `workspace-${agentId}`);
}

/**
 * Helper: get symlink path for an agent.
 */
function symlinkPath(agentId: string): string {
  return path.join(workspacePath(agentId), 'shared-context');
}

// ─── Symlink Creation Tests ─────────────────────────────────────────────────

describe('SymlinkManager — ensureSymlink', () => {
  test('creates symlink when none exists', () => {
    createTeamDir('alpha');
    const mgr = createManager();

    const result = mgr.ensureSymlink('nexus', 'alpha');

    expect(result.action).toBe('created');
    expect(result.agentId).toBe('nexus');
    expect(result.teamId).toBe('alpha');

    // Verify symlink exists and points to correct target
    const link = symlinkPath('nexus');
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);

    const resolved = fs.realpathSync(link);
    expect(resolved).toBe(fs.realpathSync(path.join(sharedContextRoot, 'alpha')));
  });

  test('creates workspace directory if it does not exist', () => {
    createTeamDir('bravo');
    const mgr = createManager();

    expect(fs.existsSync(workspacePath('oracle'))).toBe(false);

    mgr.ensureSymlink('oracle', 'bravo');

    expect(fs.existsSync(workspacePath('oracle'))).toBe(true);
    expect(fs.lstatSync(symlinkPath('oracle')).isSymbolicLink()).toBe(true);
  });

  test('throws TARGET_NOT_FOUND when team directory does not exist', () => {
    const { SymlinkManagerError: SME } = require('../symlink-manager');
    const mgr = createManager();

    expect(() => mgr.ensureSymlink('nexus', 'nonexistent')).toThrow(SME);
    try {
      mgr.ensureSymlink('nexus', 'nonexistent');
    } catch (err: any) {
      expect(err.code).toBe('TARGET_NOT_FOUND');
    }
  });

  test('throws SYMLINK_BLOCKED when a regular file exists at link path', () => {
    createTeamDir('charlie');
    const mgr = createManager();

    // Create workspace with a regular file at the symlink path
    const wsDir = workspacePath('sage');
    fs.mkdirSync(wsDir, { recursive: true });
    fs.writeFileSync(path.join(wsDir, 'shared-context'), 'regular file');

    expect(() => mgr.ensureSymlink('sage', 'charlie')).toThrow();
    try {
      mgr.ensureSymlink('sage', 'charlie');
    } catch (err: any) {
      expect(err.code).toBe('SYMLINK_BLOCKED');
    }
  });

  test('throws SYMLINK_BLOCKED when a regular directory exists at link path', () => {
    createTeamDir('delta');
    const mgr = createManager();

    // Create workspace with a regular directory at the symlink path
    const scDir = symlinkPath('synth');
    fs.mkdirSync(scDir, { recursive: true });
    fs.writeFileSync(path.join(scDir, 'data.md'), '# test');

    expect(() => mgr.ensureSymlink('synth', 'delta')).toThrow();
    try {
      mgr.ensureSymlink('synth', 'delta');
    } catch (err: any) {
      expect(err.code).toBe('SYMLINK_BLOCKED');
    }
  });
});

// ─── Idempotency Tests ──────────────────────────────────────────────────────

describe('SymlinkManager — Idempotency', () => {
  test('no-op when symlink already exists and is correct', () => {
    createTeamDir('echo');
    const mgr = createManager();

    // First call creates
    const first = mgr.ensureSymlink('nexus', 'echo');
    expect(first.action).toBe('created');

    // Second call is a no-op
    const second = mgr.ensureSymlink('nexus', 'echo');
    expect(second.action).toBe('already_valid');
  });

  test('multiple rapid calls are all safe', () => {
    createTeamDir('foxtrot');
    const mgr = createManager();

    // Call 10 times rapidly
    const results = Array.from({ length: 10 }, () =>
      mgr.ensureSymlink('oracle', 'foxtrot'),
    );

    expect(results[0].action).toBe('created');
    for (let i = 1; i < results.length; i++) {
      expect(results[i].action).toBe('already_valid');
    }

    // Final state should be one valid symlink
    expect(fs.lstatSync(symlinkPath('oracle')).isSymbolicLink()).toBe(true);
  });

  test('ensureSymlink followed by removeSymlink followed by ensureSymlink', () => {
    createTeamDir('golf');
    const mgr = createManager();

    const create = mgr.ensureSymlink('nexus', 'golf');
    expect(create.action).toBe('created');

    const remove = mgr.removeSymlink('nexus');
    expect(remove.action).toBe('removed');
    expect(fs.existsSync(symlinkPath('nexus'))).toBe(false);

    const recreate = mgr.ensureSymlink('nexus', 'golf');
    expect(recreate.action).toBe('created');
    expect(fs.lstatSync(symlinkPath('nexus')).isSymbolicLink()).toBe(true);
  });
});

// ─── Repair Tests ───────────────────────────────────────────────────────────

describe('SymlinkManager — Broken Symlink Repair', () => {
  test('repairs broken (dangling) symlink', () => {
    createTeamDir('hotel');
    const mgr = createManager();

    // Create a dangling symlink manually
    const ws = workspacePath('nexus');
    fs.mkdirSync(ws, { recursive: true });
    fs.symlinkSync('/nonexistent/target', symlinkPath('nexus'), 'dir');
    expect(fs.lstatSync(symlinkPath('nexus')).isSymbolicLink()).toBe(true);

    const result = mgr.ensureSymlink('nexus', 'hotel');
    expect(result.action).toBe('repaired');

    // Should now point to correct target
    const resolved = fs.realpathSync(symlinkPath('nexus'));
    expect(resolved).toBe(fs.realpathSync(path.join(sharedContextRoot, 'hotel')));
  });

  test('repairs symlink pointing to wrong target', () => {
    createTeamDir('india');
    createTeamDir('juliet');
    const mgr = createManager();

    // Create symlink pointing to wrong team
    mgr.ensureSymlink('nexus', 'india');
    expect(mgr.ensureSymlink('nexus', 'india').action).toBe('already_valid');

    // Now re-point to 'juliet'
    const result = mgr.ensureSymlink('nexus', 'juliet');
    expect(result.action).toBe('repaired');

    const resolved = fs.realpathSync(symlinkPath('nexus'));
    expect(resolved).toBe(fs.realpathSync(path.join(sharedContextRoot, 'juliet')));
  });

  test('repairSymlink delegates to ensureSymlink', () => {
    createTeamDir('kilo');
    const mgr = createManager();

    const result = mgr.repairSymlink('oracle', 'kilo');
    expect(result.action).toBe('created');

    const second = mgr.repairSymlink('oracle', 'kilo');
    expect(second.action).toBe('already_valid');
  });
});

// ─── Remove Tests ───────────────────────────────────────────────────────────

describe('SymlinkManager — removeSymlink', () => {
  test('removes existing symlink', () => {
    createTeamDir('lima');
    const mgr = createManager();

    mgr.ensureSymlink('nexus', 'lima');
    expect(fs.existsSync(symlinkPath('nexus'))).toBe(true);

    const result = mgr.removeSymlink('nexus');
    expect(result.action).toBe('removed');
    expect(fs.existsSync(symlinkPath('nexus'))).toBe(false);
  });

  test('no-op when symlink does not exist', () => {
    const mgr = createManager();

    const result = mgr.removeSymlink('ghost-agent');
    expect(result.action).toBe('noop');
  });

  test('refuses to remove a regular directory', () => {
    const mgr = createManager();

    // Create a real directory at the symlink path
    fs.mkdirSync(symlinkPath('nexus'), { recursive: true });
    fs.writeFileSync(path.join(symlinkPath('nexus'), 'important.md'), '# keep me');

    expect(() => mgr.removeSymlink('nexus')).toThrow();
    try {
      mgr.removeSymlink('nexus');
    } catch (err: any) {
      expect(err.code).toBe('SYMLINK_BLOCKED');
    }

    // Verify the directory still exists with its contents
    expect(fs.existsSync(path.join(symlinkPath('nexus'), 'important.md'))).toBe(true);
  });
});

// ─── Validation / Health Check Tests ────────────────────────────────────────

describe('SymlinkManager — validateSymlinks', () => {
  test('returns healthy for all valid symlinks', () => {
    createTeamDir('mike');
    const mgr = createManager();

    mgr.ensureSymlink('nexus', 'mike');
    mgr.ensureSymlink('oracle', 'mike');
    mgr.ensureSymlink('synth', 'mike');

    const report = mgr.validateSymlinks('team-1', 'mike', ['nexus', 'oracle', 'synth']);

    expect(report.allHealthy).toBe(true);
    expect(report.teamId).toBe('team-1');
    expect(report.teamName).toBe('mike');
    expect(report.entries).toHaveLength(3);
    for (const entry of report.entries) {
      expect(entry.healthy).toBe(true);
      expect(entry.status).toBe('valid');
      expect(entry.actualTarget).toBeTruthy();
    }
  });

  test('reports missing symlinks', () => {
    createTeamDir('november');
    const mgr = createManager();

    // Don't create any symlinks
    const report = mgr.validateSymlinks('team-2', 'november', ['nexus', 'oracle']);

    expect(report.allHealthy).toBe(false);
    expect(report.entries[0].status).toBe('missing');
    expect(report.entries[1].status).toBe('missing');
  });

  test('reports broken symlinks', () => {
    createTeamDir('oscar');
    const mgr = createManager();

    // Create a symlink pointing to a path that will be removed
    const ws = workspacePath('nexus');
    fs.mkdirSync(ws, { recursive: true });
    const tempTarget = path.join(tmpDir, 'will-be-removed');
    fs.mkdirSync(tempTarget, { recursive: true });
    fs.symlinkSync(tempTarget, symlinkPath('nexus'), 'dir');
    // Now remove the target to make it dangling
    fs.rmSync(tempTarget, { recursive: true });

    const report = mgr.validateSymlinks('team-3', 'oscar', ['nexus']);

    expect(report.allHealthy).toBe(false);
    expect(report.entries[0].status).toBe('broken');
    expect(report.entries[0].healthy).toBe(false);
  });

  test('reports wrong-target symlinks', () => {
    createTeamDir('papa');
    createTeamDir('quebec');
    const mgr = createManager();

    // Create symlink pointing to 'papa' but validate against 'quebec'
    mgr.ensureSymlink('nexus', 'papa');

    const report = mgr.validateSymlinks('team-4', 'quebec', ['nexus']);

    expect(report.allHealthy).toBe(false);
    expect(report.entries[0].status).toBe('wrong_target');
  });

  test('reports non-symlink entries', () => {
    createTeamDir('romeo');
    const mgr = createManager();

    // Create a regular directory where symlink should be
    fs.mkdirSync(symlinkPath('nexus'), { recursive: true });

    const report = mgr.validateSymlinks('team-5', 'romeo', ['nexus']);

    expect(report.allHealthy).toBe(false);
    expect(report.entries[0].status).toBe('not_symlink');
  });

  test('includes checkedAt timestamp', () => {
    createTeamDir('sierra');
    const mgr = createManager();

    const before = new Date().toISOString();
    const report = mgr.validateSymlinks('team-6', 'sierra', []);
    const after = new Date().toISOString();

    expect(report.checkedAt >= before).toBe(true);
    expect(report.checkedAt <= after).toBe(true);
  });
});

// ─── Boot Integration Tests ─────────────────────────────────────────────────

describe('SymlinkManager — ensureTeamSymlinks (boot integration)', () => {
  test('creates symlink when agent has a team', () => {
    createTeamDir('tango');
    const mgr = createManager();

    const result = mgr.ensureTeamSymlinks('nexus', () => ({
      teamId: 'team-uuid',
      teamName: 'tango',
    }));

    expect(result).not.toBeNull();
    expect(result!.action).toBe('created');
    expect(fs.lstatSync(symlinkPath('nexus')).isSymbolicLink()).toBe(true);
  });

  test('returns null when agent is not in any team', () => {
    const mgr = createManager();

    const result = mgr.ensureTeamSymlinks('loner', () => null);

    expect(result).toBeNull();
  });

  test('graceful no-op does not crash the agent', () => {
    const mgr = createManager();

    // Resolver returns null → no-op
    expect(() => {
      mgr.ensureTeamSymlinks('nexus', () => null);
    }).not.toThrow();
  });
});

// ─── ensureTeamSymlinksOnBoot standalone function ───────────────────────────

describe('ensureTeamSymlinksOnBoot', () => {
  test('wires through TeamService.getTeamForAgent correctly', () => {
    createTeamDir('uniform');
    const { ensureTeamSymlinksOnBoot } = require('../symlink-manager');

    const mockTeamService = {
      getTeamForAgent: jest.fn((agentId: string) => {
        if (agentId === 'nexus') {
          return { id: 'team-uuid', name: 'uniform' };
        }
        return null;
      }),
    };

    const result = ensureTeamSymlinksOnBoot('nexus', mockTeamService);
    expect(result).not.toBeNull();
    expect(result!.action).toBe('created');
    expect(mockTeamService.getTeamForAgent).toHaveBeenCalledWith('nexus');
  });

  test('returns null for agent not in any team', () => {
    const { ensureTeamSymlinksOnBoot } = require('../symlink-manager');

    const mockTeamService = {
      getTeamForAgent: jest.fn(() => null),
    };

    const result = ensureTeamSymlinksOnBoot('orphan', mockTeamService);
    expect(result).toBeNull();
  });
});

// ─── Cross-platform / Edge Cases ────────────────────────────────────────────

describe('SymlinkManager — Edge Cases', () => {
  test('handles agent names with special characters (sanitized by paths.ts)', () => {
    createTeamDir('victor');
    const mgr = createManager();

    // paths.ts sanitizes agent names — only a-z0-9, hyphens, underscores
    const result = mgr.ensureSymlink('my-agent_01', 'victor');
    expect(result.action).toBe('created');
    expect(fs.lstatSync(symlinkPath('my-agent_01')).isSymbolicLink()).toBe(true);
  });

  test('symlink target is accessible through the link', () => {
    const teamDir = createTeamDir('whiskey');
    const mgr = createManager();

    // Write a file into the team's shared-context
    fs.writeFileSync(path.join(teamDir, 'priorities.md'), '# Team Priorities');

    mgr.ensureSymlink('nexus', 'whiskey');

    // Read through the symlink
    const content = fs.readFileSync(
      path.join(symlinkPath('nexus'), 'priorities.md'),
      'utf-8',
    );
    expect(content).toBe('# Team Priorities');
  });

  test('writing through symlink is visible in original directory', () => {
    const teamDir = createTeamDir('xray');
    const mgr = createManager();

    mgr.ensureSymlink('oracle', 'xray');

    // Write through the symlink
    fs.writeFileSync(
      path.join(symlinkPath('oracle'), 'test.md'),
      '# Written by Oracle',
    );

    // Read from original location
    const content = fs.readFileSync(
      path.join(teamDir, 'test.md'),
      'utf-8',
    );
    expect(content).toBe('# Written by Oracle');
  });

  test('multiple agents sharing same team directory via symlinks', () => {
    const teamDir = createTeamDir('yankee');
    const mgr = createManager();

    fs.writeFileSync(path.join(teamDir, 'priorities.md'), '# Shared Priorities');

    mgr.ensureSymlink('nexus', 'yankee');
    mgr.ensureSymlink('oracle', 'yankee');
    mgr.ensureSymlink('synth', 'yankee');

    // All three agents should see the same content
    for (const agent of ['nexus', 'oracle', 'synth']) {
      const content = fs.readFileSync(
        path.join(symlinkPath(agent), 'priorities.md'),
        'utf-8',
      );
      expect(content).toBe('# Shared Priorities');
    }
  });

  test('removing one agent symlink does not affect others', () => {
    createTeamDir('zulu');
    const mgr = createManager();

    mgr.ensureSymlink('nexus', 'zulu');
    mgr.ensureSymlink('oracle', 'zulu');

    // Remove nexus
    mgr.removeSymlink('nexus');

    // oracle should still work
    expect(fs.lstatSync(symlinkPath('oracle')).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(symlinkPath('nexus'))).toBe(false);
  });
});

// ─── HTTP Health Check Integration ──────────────────────────────────────────

describe('Symlink Health HTTP — handleSymlinkHealth', () => {
  /**
   * Minimal mock for IncomingMessage and ServerResponse.
   */
  function mockReqRes(method: string, url: string) {
    const req = {
      method,
      url,
      headers: { host: 'localhost:3000' },
    } as unknown as import('node:http').IncomingMessage;

    let statusCode = 0;
    let headers: Record<string, string> = {};
    let body = '';

    const res = {
      writeHead(code: number, hdrs: Record<string, string | number>) {
        statusCode = code;
        headers = hdrs as Record<string, string>;
      },
      end(data?: string) {
        body = data ?? '';
      },
    } as unknown as import('node:http').ServerResponse;

    return {
      req,
      res,
      getStatus: () => statusCode,
      getBody: () => {
        try {
          return JSON.parse(body);
        } catch {
          return body;
        }
      },
    };
  }

  test('returns 405 for non-GET methods', () => {
    const { handleSymlinkHealth } = require('../symlink-health-http');
    const { req, res, getStatus, getBody } = mockReqRes('POST', '/api/shared-context/symlink-health');

    handleSymlinkHealth(req, res, { dbPath: ':memory:' });

    expect(getStatus()).toBe(405);
    expect(getBody().code).toBe('METHOD_NOT_ALLOWED');
  });

  test('returns 400 when team_id is missing', () => {
    const { handleSymlinkHealth } = require('../symlink-health-http');
    const { req, res, getStatus, getBody } = mockReqRes('GET', '/api/shared-context/symlink-health');

    handleSymlinkHealth(req, res, { dbPath: ':memory:' });

    expect(getStatus()).toBe(400);
    expect(getBody().code).toBe('MISSING_TEAM_ID');
  });

  test('returns 404 when team does not exist', () => {
    // Create a real DB for this test
    const dbPath = path.join(tmpDir, 'health-test.db');
    const { TeamService: TS } = require('../team-service');
    const svc = new TS(dbPath);
    svc.close();

    const { handleSymlinkHealth } = require('../symlink-health-http');
    const { req, res, getStatus, getBody } = mockReqRes(
      'GET',
      '/api/shared-context/symlink-health?team_id=nonexistent',
    );

    handleSymlinkHealth(req, res, { dbPath });

    expect(getStatus()).toBe(404);
    expect(getBody().code).toBe('TEAM_NOT_FOUND');
  });

  test('returns 200 with health report for valid team', () => {
    // Create team with agents
    const dbPath = path.join(tmpDir, 'health-report.db');
    const { TeamService: TS } = require('../team-service');
    const svc = new TS(dbPath);
    const team = svc.createTeam('test-team', ['nexus', 'oracle'], 'user-1');
    svc.close();

    // Create symlinks
    const mgr = createManager();
    mgr.ensureSymlink('nexus', 'test-team');
    mgr.ensureSymlink('oracle', 'test-team');

    const { handleSymlinkHealth } = require('../symlink-health-http');
    const { req, res, getStatus, getBody } = mockReqRes(
      'GET',
      `/api/shared-context/symlink-health?team_id=${team.id}`,
    );

    handleSymlinkHealth(req, res, { dbPath });

    expect(getStatus()).toBe(200);
    const report = getBody();
    expect(report.teamId).toBe(team.id);
    expect(report.teamName).toBe('test-team');
    expect(report.allHealthy).toBe(true);
    expect(report.entries).toHaveLength(2);
  });
});

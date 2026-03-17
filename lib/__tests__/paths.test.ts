/**
 * Tests for lib/paths.ts — Centralized path resolution.
 * Issue #79: Dashboard Server Integration & Shared Libraries.
 */

import os from 'node:os';
import path from 'node:path';

describe('lib/paths', () => {
  const HOME = os.homedir();

  // Store original env
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore env after each test
    process.env = { ...originalEnv };
    // Clear module cache so re-imports pick up new env
    jest.resetModules();
  });

  it('exports sensible defaults based on homedir', async () => {
    // Clear env vars that would override defaults
    delete process.env.VENTUREOS_ROOT;
    delete process.env.OPENCLAW_DIR;
    delete process.env.SHARED_CONTEXT;
    delete process.env.VENTUREOS_SHARED_CONTEXT_DIR;
    delete process.env.KPI_DIR;
    delete process.env.VENTUREOS_KPI_DIR;
    delete process.env.OBSERVATIONS_DIR;
    delete process.env.VENTUREOS_OBSERVATIONS_DIR;
    delete process.env.VENTUREOS_RUNTIME_DIR;
    delete process.env.VENTUREOS_RUNTIME_LOG_DIR;
    delete process.env.VENTUREOS_EVIDENCE_DAILY_DIR;
    delete process.env.VENTUREOS_EVIDENCE_WEEKLY_DIR;
    delete process.env.VENTUREOS_EVIDENCE_MONTHLY_DIR;
    delete process.env.VENTUREOS_EVIDENCE_INCIDENTS_DIR;
    delete process.env.VENTUREOS_LOG_DIR;
    delete process.env.VENTUREOS_RPG_ROOT;
    delete process.env.VENTUREOS_RPG_DB;

    const p = require('../paths');

    expect(p.VENTUREOS_ROOT).toBe(path.join(HOME, 'clawd', 'ventureos'));
    expect(p.OPENCLAW_DIR).toBe(path.join(HOME, '.openclaw'));
    expect(p.SHARED_CONTEXT_DIR).toBe(path.join(HOME, 'clawd', 'shared-context'));
    expect(p.KPI_DIR).toBe(path.join(HOME, 'clawd', 'shared-context', 'kpis'));
    expect(p.OBSERVATIONS_DIR).toBe(
      path.join(HOME, '.openclaw', 'workspace-venture_memory', 'observations'),
    );
    expect(p.RUNTIME_DIR).toBe(path.join(HOME, 'clawd', 'ventureos', 'runtime'));
    expect(p.RUNTIME_LOG_DIR).toBe(path.join(HOME, 'clawd', 'ventureos', 'runtime', 'logs'));
    expect(p.EVIDENCE_DAILY_DIR).toBe(path.join(HOME, 'clawd', 'ventureos', 'runtime', 'logs', 'daily'));
    expect(p.EVIDENCE_WEEKLY_DIR).toBe(path.join(HOME, 'clawd', 'ventureos', 'runtime', 'logs', 'weekly'));
    expect(p.EVIDENCE_MONTHLY_DIR).toBe(path.join(HOME, 'clawd', 'ventureos', 'runtime', 'logs', 'monthly'));
    expect(p.EVIDENCE_INCIDENTS_DIR).toBe(path.join(HOME, 'clawd', 'ventureos', 'runtime', 'logs', 'incidents'));
    expect(p.LOG_DIR).toBe(path.join(HOME, 'clawd', 'logs'));
    expect(p.RPG_ROOT).toBe(path.join(HOME, 'clawd', 'ventureos-rpg'));
    expect(p.RPG_DB_PATH).toBe(path.join(HOME, 'clawd', 'agents', 'ventureos-rpg.db'));
  });

  it('respects VENTUREOS_ROOT env var', () => {
    process.env.VENTUREOS_ROOT = '/custom/ventureos';
    jest.resetModules();
    const p = require('../paths');
    expect(p.VENTUREOS_ROOT).toBe('/custom/ventureos');
  });

  it('respects OPENCLAW_DIR env var', () => {
    process.env.OPENCLAW_DIR = '/custom/openclaw';
    jest.resetModules();
    const p = require('../paths');
    expect(p.OPENCLAW_DIR).toBe('/custom/openclaw');
  });

  it('respects KPI_DIR env var over VENTUREOS_KPI_DIR', () => {
    process.env.KPI_DIR = '/custom/kpis';
    process.env.VENTUREOS_KPI_DIR = '/other/kpis';
    jest.resetModules();
    const p = require('../paths');
    expect(p.KPI_DIR).toBe('/custom/kpis');
  });

  it('falls back to VENTUREOS_KPI_DIR when KPI_DIR is not set', () => {
    delete process.env.KPI_DIR;
    process.env.VENTUREOS_KPI_DIR = '/fallback/kpis';
    jest.resetModules();
    const p = require('../paths');
    expect(p.KPI_DIR).toBe('/fallback/kpis');
  });

  it('agentSessionsDir returns correct path', () => {
    jest.resetModules();
    const p = require('../paths');
    const dir = p.agentSessionsDir('venture_research');
    expect(dir).toBe(path.join(p.OPENCLAW_DIR, 'agents', 'venture_research', 'sessions'));
  });

  it('agentSessionsDir sanitizes agent IDs', () => {
    jest.resetModules();
    const p = require('../paths');
    const dir = p.agentSessionsDir('Agent/../../../etc');
    // Path traversal characters (..) are stripped by the regex
    expect(dir).not.toContain('..');
    // Lowercase + strip non-[a-z0-9-_] → "agentetc"
    expect(dir).toMatch(/agents\/agentetc\/sessions$/);
  });

  it('agentWorkspaceDir returns correct path', () => {
    jest.resetModules();
    const p = require('../paths');
    const dir = p.agentWorkspaceDir('venture_delivery');
    expect(dir).toBe(path.join(p.OPENCLAW_DIR, 'workspace-venture_delivery'));
  });

  it('paths convenience object includes all paths', () => {
    jest.resetModules();
    const p = require('../paths');
    expect(p.paths).toBeDefined();
    expect(typeof p.paths.ventureosRoot).toBe('string');
    expect(typeof p.paths.openclawDir).toBe('string');
    expect(typeof p.paths.sharedContextDir).toBe('string');
    expect(typeof p.paths.kpiDir).toBe('string');
    expect(typeof p.paths.observationsDir).toBe('string');
    expect(typeof p.paths.runtimeDir).toBe('string');
    expect(typeof p.paths.runtimeLogDir).toBe('string');
    expect(typeof p.paths.evidenceDailyDir).toBe('string');
    expect(typeof p.paths.evidenceWeeklyDir).toBe('string');
    expect(typeof p.paths.evidenceMonthlyDir).toBe('string');
    expect(typeof p.paths.evidenceIncidentsDir).toBe('string');
    expect(typeof p.paths.logDir).toBe('string');
    expect(typeof p.paths.rpgRoot).toBe('string');
    expect(typeof p.paths.rpgDbPath).toBe('string');
    expect(typeof p.paths.activeWorkPath).toBe('string');
    expect(typeof p.paths.prioritiesPath).toBe('string');
  });

  it('builds canonical evidence artifact paths', () => {
    jest.resetModules();
    const p = require('../paths');
    expect(p.getDailyEvidencePath('2026-03-16', 'kpi-snapshot.json')).toBe(
      path.join(p.EVIDENCE_DAILY_DIR, '2026-03-16-kpi-snapshot.json'),
    );
    expect(p.getWeeklyEvidencePath('2026-W12', 'ops-review.md')).toBe(
      path.join(p.EVIDENCE_WEEKLY_DIR, '2026-W12-ops-review.md'),
    );
    expect(p.getMonthlyEvidencePath('2026-03', 'forecast.md')).toBe(
      path.join(p.EVIDENCE_MONTHLY_DIR, '2026-03-forecast.md'),
    );
    expect(p.getIncidentEvidencePath('INC-001', 'incident.md')).toBe(
      path.join(p.EVIDENCE_INCIDENTS_DIR, 'inc-001', 'incident.md'),
    );
  });

  it('no path contains hardcoded tilde', () => {
    jest.resetModules();
    const p = require('../paths');
    const allPaths = Object.values(p.paths) as string[];
    for (const v of allPaths) {
      expect(v).not.toContain('~');
    }
  });
});

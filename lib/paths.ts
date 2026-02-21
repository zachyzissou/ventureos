/**
 * Centralized Path Resolution — VentureOS Shared Library
 *
 * All VentureOS data paths flow through this module. No other file should
 * call `os.homedir()` or hardcode `~/clawd/` for data access.
 *
 * Each path is configurable via an environment variable with a sensible
 * default that resolves relative to the user's home directory.
 *
 * Usage:
 *   import { paths } from '../lib/paths';
 *   const kpiDir = paths.kpiDir;
 */

import os from 'node:os';
import path from 'node:path';

// ─── Base Directories ────────────────────────────────────────────────────────

const HOME = os.homedir();

/** Root of the VentureOS monorepo. */
export const VENTUREOS_ROOT: string =
  process.env.VENTUREOS_ROOT ?? path.join(HOME, 'clawd', 'ventureos');

/** OpenClaw agent runtime directory (~/.openclaw). */
export const OPENCLAW_DIR: string =
  process.env.OPENCLAW_DIR ?? path.join(HOME, '.openclaw');

/** Shared context directory for cross-agent data. */
export const SHARED_CONTEXT_DIR: string =
  process.env.SHARED_CONTEXT ??
  process.env.VENTUREOS_SHARED_CONTEXT_DIR ??
  path.join(HOME, 'clawd', 'shared-context');

/** Obsidian desktop app config path (vault registry). */
export const OBSIDIAN_APP_CONFIG_PATH: string =
  process.env.OBSIDIAN_APP_CONFIG_PATH ??
  path.join(HOME, 'Library', 'Application Support', 'obsidian', 'obsidian.json');

// ─── Data Directories ────────────────────────────────────────────────────────

/** KPI JSON files directory. */
export const KPI_DIR: string =
  process.env.KPI_DIR ??
  process.env.VENTUREOS_KPI_DIR ??
  path.join(SHARED_CONTEXT_DIR, 'kpis');

/** Dashboard data directory (tokens, health history, etc.). */
export const DASHBOARD_DATA_DIR: string =
  process.env.DASHBOARD_DATA_DIR ?? path.join(VENTUREOS_ROOT, 'dashboard', 'data');

/** Observations markdown directory. */
export const OBSERVATIONS_DIR: string =
  process.env.OBSERVATIONS_DIR ??
  process.env.VENTUREOS_OBSERVATIONS_DIR ??
  path.join(OPENCLAW_DIR, 'workspace-archivist', 'observations');

/** VentureOS log directory (access logs, audit logs). */
export const LOG_DIR: string =
  process.env.VENTUREOS_LOG_DIR ?? path.join(HOME, 'clawd', 'logs');

/** macOS LaunchAgent directories used for scheduler discovery. */
export const LAUNCH_AGENT_DIRS: string[] = (
  process.env.VENTUREOS_LAUNCH_AGENT_DIRS ??
  process.env.LAUNCH_AGENT_DIRS ??
  [path.join(HOME, 'Library', 'LaunchAgents'), '/Library/LaunchAgents'].join(path.delimiter)
)
  .split(path.delimiter)
  .map((d) => d.trim())
  .filter(Boolean);

/** VentureOS RPG root (source/assets). */
export const RPG_ROOT: string =
  process.env.VENTUREOS_RPG_ROOT ?? path.join(HOME, 'clawd', 'ventureos-rpg');

/** VentureOS RPG SQLite database. */
export const RPG_DB_PATH: string =
  process.env.VENTUREOS_RPG_DB ?? path.join(HOME, 'clawd', 'agents', 'ventureos-rpg.db');

/** Active work markdown for mission control. */
export const ACTIVE_WORK_PATH: string =
  process.env.VENTUREOS_ACTIVE_WORK_PATH ?? path.join(SHARED_CONTEXT_DIR, 'active-work.md');

/** Priorities markdown for mission control. */
export const PRIORITIES_PATH: string =
  process.env.VENTUREOS_PRIORITIES_PATH ?? path.join(SHARED_CONTEXT_DIR, 'priorities.md');

// ─── Convenience: All Paths Object ──────────────────────────────────────────

export const paths = {
  ventureosRoot: VENTUREOS_ROOT,
  openclawDir: OPENCLAW_DIR,
  sharedContextDir: SHARED_CONTEXT_DIR,
  obsidianAppConfigPath: OBSIDIAN_APP_CONFIG_PATH,
  kpiDir: KPI_DIR,
  dashboardDataDir: DASHBOARD_DATA_DIR,
  observationsDir: OBSERVATIONS_DIR,
  logDir: LOG_DIR,
  launchAgentDirs: LAUNCH_AGENT_DIRS,
  rpgRoot: RPG_ROOT,
  rpgDbPath: RPG_DB_PATH,
  activeWorkPath: ACTIVE_WORK_PATH,
  prioritiesPath: PRIORITIES_PATH,
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve the sessions directory for a given agent.
 */
export function agentSessionsDir(agentId: string): string {
  const safe = String(agentId || '')
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, '');
  return path.join(OPENCLAW_DIR, 'agents', safe, 'sessions');
}

/**
 * Resolve the workspace directory for a given agent.
 */
export function agentWorkspaceDir(agentId: string): string {
  const safe = String(agentId || '')
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, '');
  return path.join(OPENCLAW_DIR, `workspace-${safe}`);
}

/**
 * Resolve the shared-context directory for a given team.
 * Team names are sanitized to lowercase alphanumeric + hyphens/underscores.
 */
export function teamSharedContextDir(teamName: string): string {
  const safe = String(teamName || '')
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, '');
  return path.join(SHARED_CONTEXT_DIR, safe);
}


const defaultPathsExport = {
  VENTUREOS_ROOT,
  OPENCLAW_DIR,
  SHARED_CONTEXT_DIR,
  OBSIDIAN_APP_CONFIG_PATH,
  KPI_DIR,
  DASHBOARD_DATA_DIR,
  OBSERVATIONS_DIR,
  LOG_DIR,
  LAUNCH_AGENT_DIRS,
  RPG_ROOT,
  RPG_DB_PATH,
  ACTIVE_WORK_PATH,
  PRIORITIES_PATH,
  agentSessionsDir,
  agentWorkspaceDir,
  teamSharedContextDir,
  paths,
} as const;

export default defaultPathsExport;

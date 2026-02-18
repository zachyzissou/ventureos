/**
 * TeamService — VentureOS Team Management & Shared-Context Scaffold
 *
 * SQLite-backed service for team CRUD operations and agent membership
 * management. On team creation, scaffolds the standard shared-context
 * directory tree per the #217 epic specification.
 *
 * Follows the same patterns as ObservationStore — lazy table creation,
 * WAL mode, prepared statements for performance.
 *
 * Phase 1 (#241): Core CRUD + directory scaffold
 * Phase 2 (#242): Symlink manager integration
 * Phase 3 (#243): Agent injection hook + file watcher
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { teamSharedContextDir } from './paths';
import type {
  Team,
  TeamAgent,
  TeamAgentRole,
  TeamWithAgents,
  SharedContextManifest,
} from './types/team';
import {
  VALID_TEAM_AGENT_ROLES,
  SHARED_CONTEXT_SUBDIRS,
  SHARED_CONTEXT_INITIAL_FILES,
} from './types/team';

// ─── Error Types ────────────────────────────────────────────────────────────

export class TeamServiceError extends Error {
  constructor(
    message: string,
    public readonly code: TeamServiceErrorCode,
  ) {
    super(message);
    this.name = 'TeamServiceError';
  }
}

export type TeamServiceErrorCode =
  | 'TEAM_NOT_FOUND'
  | 'TEAM_NAME_TAKEN'
  | 'AGENT_ALREADY_IN_TEAM'
  | 'AGENT_NOT_IN_TEAM'
  | 'INVALID_ROLE'
  | 'INVALID_TEAM_NAME'
  | 'SCAFFOLD_FAILED';

// ─── Service ────────────────────────────────────────────────────────────────

export class TeamService {
  private db: Database.Database;

  // Prepared statements (lazily initialized after ensureTables)
  private insertTeamStmt!: Database.Statement;
  private getTeamStmt!: Database.Statement;
  private deleteTeamStmt!: Database.Statement;
  private insertAgentStmt!: Database.Statement;
  private removeAgentStmt!: Database.Statement;
  private getAgentsForTeamStmt!: Database.Statement;
  private getTeamForAgentStmt!: Database.Statement;

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { readonly: false });
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.ensureTables();
    this.prepareStatements();
  }

  // ─── Schema ─────────────────────────────────────────────────────────

  /**
   * Create tables and indexes if they don't exist.
   * Safe for existing databases — uses IF NOT EXISTS throughout.
   */
  private ensureTables(): void {
    this.db.exec(`
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

      CREATE INDEX IF NOT EXISTS idx_team_agents_agent
        ON team_agents(agent_id);
      CREATE INDEX IF NOT EXISTS idx_teams_name
        ON teams(name);
    `);
  }

  /**
   * Prepare frequently-used statements for performance.
   */
  private prepareStatements(): void {
    this.insertTeamStmt = this.db.prepare(
      'INSERT INTO teams (id, name, created_at, owner_user_id) VALUES (?, ?, ?, ?)',
    );
    this.getTeamStmt = this.db.prepare('SELECT * FROM teams WHERE id = ?');
    this.deleteTeamStmt = this.db.prepare('DELETE FROM teams WHERE id = ?');
    this.insertAgentStmt = this.db.prepare(
      'INSERT INTO team_agents (team_id, agent_id, role, joined_at) VALUES (?, ?, ?, ?)',
    );
    this.removeAgentStmt = this.db.prepare(
      'DELETE FROM team_agents WHERE team_id = ? AND agent_id = ?',
    );
    this.getAgentsForTeamStmt = this.db.prepare(
      'SELECT * FROM team_agents WHERE team_id = ? ORDER BY joined_at ASC',
    );
    this.getTeamForAgentStmt = this.db.prepare(`
      SELECT t.* FROM teams t
      INNER JOIN team_agents ta ON t.id = ta.team_id
      WHERE ta.agent_id = ?
    `);
  }

  // ─── Team CRUD ──────────────────────────────────────────────────────

  /**
   * Create a new team with initial agent members.
   * Scaffolds the shared-context directory structure on success.
   *
   * @param name - Human-readable team name (must be unique).
   * @param agentIds - Initial agent IDs to add as members.
   * @param ownerUserId - User ID of the team creator.
   * @returns The created team with its agent membership list.
   */
  createTeam(name: string, agentIds: string[], ownerUserId: string): TeamWithAgents {
    // Validate team name
    const safeName = this.sanitizeTeamName(name);
    if (!safeName) {
      throw new TeamServiceError(
        `Invalid team name: "${name}". Must contain at least one alphanumeric character.`,
        'INVALID_TEAM_NAME',
      );
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Use a transaction for atomicity
    const result = this.db.transaction(() => {
      try {
        this.insertTeamStmt.run(id, safeName, now, ownerUserId);
      } catch (err: any) {
        if (err.message?.includes('UNIQUE constraint failed: teams.name')) {
          throw new TeamServiceError(
            `Team name "${safeName}" is already taken.`,
            'TEAM_NAME_TAKEN',
          );
        }
        throw err;
      }

      // Add initial agents as members
      const agents: TeamAgent[] = [];
      for (const agentId of agentIds) {
        const agent: TeamAgent = {
          teamId: id,
          agentId,
          role: 'member',
          joinedAt: now,
        };
        this.insertAgentStmt.run(id, agentId, 'member', now);
        agents.push(agent);
      }

      return {
        id,
        name: safeName,
        createdAt: now,
        ownerUserId,
        agents,
      } satisfies TeamWithAgents;
    })();

    // Scaffold directory structure outside the transaction
    // (filesystem ops shouldn't block DB rollback)
    this.scaffoldDirectory(safeName, agentIds);

    return result;
  }

  /**
   * Get a team by ID with its agent membership list.
   * Returns null if the team doesn't exist.
   */
  getTeam(teamId: string): TeamWithAgents | null {
    const row = this.getTeamStmt.get(teamId) as any;
    if (!row) return null;

    const agentRows = this.getAgentsForTeamStmt.all(teamId) as any[];

    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      ownerUserId: row.owner_user_id,
      agents: agentRows.map(this.rowToTeamAgent),
    };
  }

  /**
   * List all teams with their agent membership.
   */
  listTeams(): TeamWithAgents[] {
    const teamRows = this.db.prepare('SELECT * FROM teams ORDER BY created_at DESC').all() as any[];
    return teamRows.map((row) => {
      const agentRows = this.getAgentsForTeamStmt.all(row.id) as any[];
      return {
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        ownerUserId: row.owner_user_id,
        agents: agentRows.map(this.rowToTeamAgent),
      };
    });
  }

  /**
   * Delete a team by ID.
   * Removes the team record and agent memberships (via CASCADE).
   * Preserves the shared-context directory on disk for safety.
   *
   * @returns true if the team was deleted, false if it didn't exist.
   */
  deleteTeam(teamId: string): boolean {
    const result = this.deleteTeamStmt.run(teamId);
    return result.changes > 0;
  }

  // ─── Agent Membership ───────────────────────────────────────────────

  /**
   * Add an agent to a team with a specified role.
   */
  addAgent(teamId: string, agentId: string, role: TeamAgentRole = 'member'): TeamAgent {
    // Validate role
    if (!VALID_TEAM_AGENT_ROLES.includes(role)) {
      throw new TeamServiceError(
        `Invalid role "${role}". Must be one of: ${VALID_TEAM_AGENT_ROLES.join(', ')}`,
        'INVALID_ROLE',
      );
    }

    // Verify team exists
    const team = this.getTeamStmt.get(teamId) as any;
    if (!team) {
      throw new TeamServiceError(
        `Team "${teamId}" not found.`,
        'TEAM_NOT_FOUND',
      );
    }

    const now = new Date().toISOString();

    try {
      this.insertAgentStmt.run(teamId, agentId, role, now);
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint failed') ||
          err.message?.includes('PRIMARY KEY constraint failed')) {
        throw new TeamServiceError(
          `Agent "${agentId}" is already in team "${teamId}".`,
          'AGENT_ALREADY_IN_TEAM',
        );
      }
      throw err;
    }

    // Create agent-specific output directory if it doesn't exist
    const teamRow = team as { name: string };
    const agentOutputDir = path.join(
      teamSharedContextDir(teamRow.name),
      'agent-outputs',
      agentId,
    );
    fs.mkdirSync(agentOutputDir, { recursive: true });

    return {
      teamId,
      agentId,
      role,
      joinedAt: now,
    };
  }

  /**
   * Remove an agent from a team.
   *
   * @returns true if the agent was removed, false if they weren't in the team.
   */
  removeAgent(teamId: string, agentId: string): boolean {
    // Verify team exists
    const team = this.getTeamStmt.get(teamId) as any;
    if (!team) {
      throw new TeamServiceError(
        `Team "${teamId}" not found.`,
        'TEAM_NOT_FOUND',
      );
    }

    const result = this.removeAgentStmt.run(teamId, agentId);
    return result.changes > 0;
  }

  /**
   * Get the team that an agent belongs to.
   * Returns null if the agent isn't in any team.
   *
   * Note: In Phase 1, an agent can only be in one team.
   * This returns the first match if multiple exist.
   */
  getTeamForAgent(agentId: string): TeamWithAgents | null {
    const row = this.getTeamForAgentStmt.get(agentId) as any;
    if (!row) return null;

    const agentRows = this.getAgentsForTeamStmt.all(row.id) as any[];

    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      ownerUserId: row.owner_user_id,
      agents: agentRows.map(this.rowToTeamAgent),
    };
  }

  // ─── Directory Scaffold ─────────────────────────────────────────────

  /**
   * Create the standard shared-context directory structure for a team.
   * Idempotent — safe to call multiple times (uses recursive mkdir).
   *
   * Structure:
   * ```
   * shared-context/{team-name}/
   * ├── priorities.md
   * ├── agent-outputs/
   * │   └── {agent-name}/    (one per member)
   * ├── feedback/
   * ├── kpis/
   * ├── calendar/
   * ├── roundtable/
   * └── .meta/
   *     ├── manifest.json
   *     └── last-sync.json
   * ```
   */
  scaffoldDirectory(teamName: string, agentIds: string[] = []): string {
    const teamDir = teamSharedContextDir(teamName);

    try {
      // Create base directory and standard subdirectories
      for (const subdir of SHARED_CONTEXT_SUBDIRS) {
        fs.mkdirSync(path.join(teamDir, subdir), { recursive: true });
      }

      // Create per-agent output directories
      for (const agentId of agentIds) {
        fs.mkdirSync(path.join(teamDir, 'agent-outputs', agentId), { recursive: true });
      }

      // Create initial files (only if they don't already exist — idempotent)
      for (const [relPath, content] of Object.entries(SHARED_CONTEXT_INITIAL_FILES)) {
        const fullPath = path.join(teamDir, relPath);
        if (!fs.existsSync(fullPath)) {
          fs.writeFileSync(fullPath, content, 'utf-8');
        }
      }

      return teamDir;
    } catch (err: any) {
      throw new TeamServiceError(
        `Failed to scaffold directory for team "${teamName}": ${err.message}`,
        'SCAFFOLD_FAILED',
      );
    }
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────

  /**
   * Close the database connection.
   */
  close(): void {
    try {
      this.db.close();
    } catch {
      // ignore close errors
    }
  }

  // ─── Internal Helpers ─────────────────────────────────────────────────

  /**
   * Sanitize a team name for use as a directory name.
   * Returns empty string if the name is entirely invalid.
   */
  private sanitizeTeamName(name: string): string {
    return String(name || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-_]/g, '')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Convert a database row to a TeamAgent object.
   */
  private rowToTeamAgent(row: any): TeamAgent {
    return {
      teamId: row.team_id,
      agentId: row.agent_id,
      role: row.role as TeamAgentRole,
      joinedAt: row.joined_at,
    };
  }
}

export default TeamService;

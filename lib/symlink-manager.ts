/**
 * SymlinkManager — VentureOS Workspace Symlink Management
 *
 * Creates, validates, repairs, and removes workspace symlinks so each
 * agent in a team can transparently access shared-context via:
 *   `workspace-{agent}/shared-context/ → {shared-context-dir}/{team}/`
 *
 * Designed for idempotent, non-destructive operation. Handles:
 * - Missing workspace directories (creates them)
 * - Already-correct symlinks (no-op)
 * - Broken/dangling symlinks (repair)
 * - Wrong-target symlinks (repair)
 * - Regular files/directories at symlink path (refuses to overwrite — safety)
 * - Environments where symlinks are restricted (graceful fallback)
 *
 * Phase 2 (#242) of the Shared Agent Memory Layer (#217).
 *
 * @module
 */

import fs from 'node:fs';
import path from 'node:path';
import { agentWorkspaceDir, teamSharedContextDir } from './paths';
import type {
  SymlinkResult,
  SymlinkHealthEntry,
  SymlinkHealthReport,
} from './types/team';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Name of the symlink directory within each agent's workspace. */
const SYMLINK_NAME = 'shared-context';

// ─── Error Types ────────────────────────────────────────────────────────────

export class SymlinkManagerError extends Error {
  constructor(
    message: string,
    public readonly code: SymlinkManagerErrorCode,
  ) {
    super(message);
    this.name = 'SymlinkManagerError';
  }
}

export type SymlinkManagerErrorCode =
  | 'SYMLINK_BLOCKED'
  | 'TARGET_NOT_FOUND'
  | 'SYMLINK_CREATE_FAILED'
  | 'SYMLINK_REMOVE_FAILED'
  | 'SYMLINK_NOT_SUPPORTED';

// ─── SymlinkManager ─────────────────────────────────────────────────────────

export class SymlinkManager {
  /**
   * Ensure that an agent's workspace has a `shared-context` symlink
   * pointing to the team's shared-context directory.
   *
   * Idempotent:
   * - If the symlink already exists and points to the correct target → no-op.
   * - If missing → creates it.
   * - If broken or wrong target → removes and recreates.
   *
   * @param agentId - Agent identifier (e.g. 'nexus', 'oracle').
   * @param teamName - Team name (used for directory resolution).
   * @returns Result of the symlink operation.
   */
  ensureSymlink(agentId: string, teamName: string): SymlinkResult {
    const workspaceDir = agentWorkspaceDir(agentId);
    const linkPath = path.join(workspaceDir, SYMLINK_NAME);
    const targetPath = teamSharedContextDir(teamName);

    // Ensure workspace directory exists
    fs.mkdirSync(workspaceDir, { recursive: true });

    // Verify target directory exists
    if (!fs.existsSync(targetPath)) {
      throw new SymlinkManagerError(
        `Target shared-context directory does not exist: ${targetPath}`,
        'TARGET_NOT_FOUND',
      );
    }

    // Check current state of linkPath
    const state = this.inspectLink(linkPath, targetPath);

    switch (state) {
      case 'valid':
        return {
          agentId,
          teamId: teamName,
          action: 'already_valid',
          linkPath,
          targetPath,
        };

      case 'missing':
        this.createSymlink(linkPath, targetPath);
        return {
          agentId,
          teamId: teamName,
          action: 'created',
          linkPath,
          targetPath,
        };

      case 'broken':
      case 'wrong_target':
        // Safe repair: remove the broken/wrong symlink and recreate
        this.safeUnlink(linkPath);
        this.createSymlink(linkPath, targetPath);
        return {
          agentId,
          teamId: teamName,
          action: 'repaired',
          linkPath,
          targetPath,
        };

      case 'not_symlink':
        // Safety: refuse to overwrite a regular file or directory
        throw new SymlinkManagerError(
          `Cannot create symlink at ${linkPath}: a regular file or directory already exists there. ` +
          `Remove it manually to allow symlink creation.`,
          'SYMLINK_BLOCKED',
        );
    }
  }

  /**
   * Validate symlinks for all agents in a team.
   * Returns a health report with per-agent status.
   *
   * @param teamId - Team ID (for the report).
   * @param teamName - Team name (for directory resolution).
   * @param agentIds - List of agent IDs in the team.
   * @returns Health report.
   */
  validateSymlinks(teamId: string, teamName: string, agentIds: string[]): SymlinkHealthReport {
    const targetPath = teamSharedContextDir(teamName);
    const entries: SymlinkHealthEntry[] = [];

    for (const agentId of agentIds) {
      const linkPath = path.join(agentWorkspaceDir(agentId), SYMLINK_NAME);
      const state = this.inspectLink(linkPath, targetPath);

      let actualTarget: string | null = null;
      if (state === 'valid' || state === 'wrong_target') {
        try {
          actualTarget = fs.readlinkSync(linkPath);
          // Resolve relative targets to absolute for comparison
          if (!path.isAbsolute(actualTarget)) {
            actualTarget = path.resolve(path.dirname(linkPath), actualTarget);
          }
        } catch {
          actualTarget = null;
        }
      }

      entries.push({
        agentId,
        healthy: state === 'valid',
        linkPath,
        expectedTarget: targetPath,
        actualTarget,
        status: state,
      });
    }

    return {
      teamId,
      teamName,
      allHealthy: entries.every((e) => e.healthy),
      entries,
      checkedAt: new Date().toISOString(),
    };
  }

  /**
   * Repair a single agent's symlink. Removes the existing link (if any)
   * and recreates it pointing to the correct target.
   *
   * @param agentId - Agent identifier.
   * @param teamName - Team name.
   * @returns Result of the repair operation.
   */
  repairSymlink(agentId: string, teamName: string): SymlinkResult {
    // ensureSymlink already handles repair logic (idempotent)
    return this.ensureSymlink(agentId, teamName);
  }

  /**
   * Remove an agent's shared-context symlink.
   * No-op if the symlink doesn't exist.
   * Safety: refuses to remove non-symlink entries.
   *
   * @param agentId - Agent identifier.
   * @returns Result of the removal.
   */
  removeSymlink(agentId: string): SymlinkResult {
    const linkPath = path.join(agentWorkspaceDir(agentId), SYMLINK_NAME);

    let existingTarget = '';
    try {
      const stat = fs.lstatSync(linkPath);

      if (!stat.isSymbolicLink()) {
        // Safety: refuse to remove a regular file/directory
        throw new SymlinkManagerError(
          `Cannot remove ${linkPath}: it is not a symlink. Remove it manually.`,
          'SYMLINK_BLOCKED',
        );
      }

      try {
        existingTarget = fs.readlinkSync(linkPath);
      } catch {
        // broken symlink — still remove it
      }

      this.safeUnlink(linkPath);

      return {
        agentId,
        teamId: '',
        action: 'removed',
        linkPath,
        targetPath: existingTarget,
      };
    } catch (err: any) {
      if (err instanceof SymlinkManagerError) throw err;
      if (err.code === 'ENOENT') {
        // Symlink doesn't exist — no-op
        return {
          agentId,
          teamId: '',
          action: 'noop',
          linkPath,
          targetPath: '',
        };
      }
      throw err;
    }
  }

  // ─── Boot Integration ───────────────────────────────────────────────

  /**
   * Convenience function for agent boot-time integration.
   *
   * Looks up the agent's team via the provided resolver function,
   * then ensures the workspace symlink exists. Graceful no-op if
   * the agent is not in any team.
   *
   * This is the primary hook point for OpenClaw gateway to call
   * on agent session start.
   *
   * @param agentId - Agent identifier.
   * @param teamResolver - Function that returns { teamId, teamName } or null.
   * @returns Result of the symlink operation, or null if agent has no team.
   */
  ensureTeamSymlinks(
    agentId: string,
    teamResolver: (agentId: string) => { teamId: string; teamName: string } | null,
  ): SymlinkResult | null {
    const team = teamResolver(agentId);
    if (!team) return null; // Agent is not in any team — graceful no-op

    try {
      return this.ensureSymlink(agentId, team.teamName);
    } catch (err: any) {
      // In boot context, we log but don't crash.
      // Symlink failure should not prevent agent from starting.
      if (err instanceof SymlinkManagerError && err.code === 'SYMLINK_NOT_SUPPORTED') {
        // Fallback: agent starts without shared-context
        return null;
      }
      // For other errors, let the caller decide
      throw err;
    }
  }

  // ─── Internal Helpers ─────────────────────────────────────────────────

  /**
   * Inspect the state of a potential symlink path.
   *
   * @returns State of the link:
   * - 'valid'        — symlink exists, points to the correct target
   * - 'missing'      — nothing at the path
   * - 'broken'       — symlink exists but target doesn't exist
   * - 'wrong_target' — symlink exists but points to wrong location
   * - 'not_symlink'  — a regular file or directory exists at the path
   */
  private inspectLink(
    linkPath: string,
    expectedTarget: string,
  ): 'valid' | 'missing' | 'broken' | 'wrong_target' | 'not_symlink' {
    let lstat: fs.Stats;
    try {
      lstat = fs.lstatSync(linkPath);
    } catch (err: any) {
      if (err.code === 'ENOENT') return 'missing';
      throw err;
    }

    if (!lstat.isSymbolicLink()) {
      return 'not_symlink';
    }

    // It's a symlink — first check if the target is reachable at all
    let targetReachable = false;
    try {
      fs.statSync(linkPath); // follows the symlink
      targetReachable = true;
    } catch {
      // Target doesn't exist → broken symlink
    }

    // Read where it points
    let actualTarget: string;
    try {
      actualTarget = fs.readlinkSync(linkPath);
    } catch {
      return 'broken';
    }

    if (!targetReachable) {
      return 'broken';
    }

    // Resolve to real paths for comparison (handles /var vs /private/var on macOS)
    let resolvedActual: string;
    try {
      resolvedActual = fs.realpathSync(linkPath);
    } catch {
      return 'broken';
    }

    let resolvedExpected: string;
    try {
      resolvedExpected = fs.realpathSync(expectedTarget);
    } catch {
      // Expected target doesn't exist — treat as wrong target
      // (the symlink resolves to somewhere, but not where we want)
      return 'wrong_target';
    }

    if (resolvedActual !== resolvedExpected) {
      return 'wrong_target';
    }

    return 'valid';
  }

  /**
   * Create a symlink from linkPath → targetPath.
   * Uses relative paths where possible for portability.
   * Falls back to absolute paths if relative fails.
   */
  private createSymlink(linkPath: string, targetPath: string): void {
    // Compute relative path from link location to target
    const relativePath = path.relative(path.dirname(linkPath), targetPath);

    try {
      fs.symlinkSync(relativePath, linkPath, 'dir');
    } catch (firstErr: any) {
      // Fallback: try absolute path (some environments restrict relative symlinks)
      try {
        fs.symlinkSync(targetPath, linkPath, 'dir');
      } catch (secondErr: any) {
        // Check for permission/capability issues
        if (
          secondErr.code === 'EPERM' ||
          secondErr.code === 'EACCES' ||
          secondErr.code === 'ENOSYS'
        ) {
          throw new SymlinkManagerError(
            `Symlinks are not supported or permitted in this environment. ` +
            `Shared-context linking is unavailable. Error: ${secondErr.message}`,
            'SYMLINK_NOT_SUPPORTED',
          );
        }
        throw new SymlinkManagerError(
          `Failed to create symlink ${linkPath} → ${targetPath}: ${secondErr.message}`,
          'SYMLINK_CREATE_FAILED',
        );
      }
    }
  }

  /**
   * Safely remove a symlink (only unlinks, never recurse-deletes).
   */
  private safeUnlink(linkPath: string): void {
    try {
      fs.unlinkSync(linkPath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw new SymlinkManagerError(
          `Failed to remove symlink at ${linkPath}: ${err.message}`,
          'SYMLINK_REMOVE_FAILED',
        );
      }
    }
  }
}

// ─── Standalone Boot Helper ─────────────────────────────────────────────────

/**
 * Standalone boot integration function.
 *
 * Call this at agent session start in the OpenClaw gateway:
 *
 * ```ts
 * import { ensureTeamSymlinksOnBoot } from './lib/symlink-manager';
 * import { TeamService } from './lib/team-service';
 *
 * const teamService = new TeamService(dbPath);
 * const result = ensureTeamSymlinksOnBoot('nexus', teamService);
 * // result is null if agent has no team, or SymlinkResult on success
 * ```
 *
 * @param agentId - Agent identifier.
 * @param teamService - TeamService instance for team lookup.
 * @returns SymlinkResult or null if agent is not in any team.
 */
export function ensureTeamSymlinksOnBoot(
  agentId: string,
  teamService: { getTeamForAgent(agentId: string): { id: string; name: string } | null },
): SymlinkResult | null {
  const manager = new SymlinkManager();
  return manager.ensureTeamSymlinks(agentId, (id) => {
    const team = teamService.getTeamForAgent(id);
    if (!team) return null;
    return { teamId: team.id, teamName: team.name };
  });
}

export default SymlinkManager;

/**
 * Team Data Model Types — VentureOS Shared Agent Memory Layer
 *
 * Type contracts for the team service data layer. Teams group agents
 * that share a common context directory for coordination via filesystem
 * primitives (symlinks + markdown).
 *
 * Phase 1 (#241): TeamService foundation + directory scaffold
 * Phase 2 (#242): Symlink manager — workspace links at agent boot
 * Phase 3 (#243): Agent injection hook + file watcher
 */

// ─── Core Types ─────────────────────────────────────────────────────────────

/**
 * A team is a named group of agents that share a context directory.
 */
export interface Team {
  /** Unique team identifier (UUID v4). */
  id: string;
  /** Human-readable team name (unique, used for directory naming). */
  name: string;
  /** ISO 8601 timestamp of team creation. */
  createdAt: string;
  /** User ID of the team owner (who created it). */
  ownerUserId: string;
}

/**
 * Agent membership in a team with role-based access.
 */
export interface TeamAgent {
  /** Team the agent belongs to. */
  teamId: string;
  /** Agent identifier (e.g. 'venture_control', 'venture_research', 'venture_delivery'). */
  agentId: string;
  /** Role determining access level within the team. */
  role: TeamAgentRole;
  /** ISO 8601 timestamp when the agent joined the team. */
  joinedAt: string;
}

/**
 * Agent role within a team.
 * - member:   Full read/write access to shared context.
 * - curator:  Can synthesize/organize shared context (auto-roundtable).
 * - observer: Read-only access to shared context.
 */
export type TeamAgentRole = 'member' | 'curator' | 'observer';

/** Valid roles for runtime validation. */
export const VALID_TEAM_AGENT_ROLES: readonly TeamAgentRole[] = [
  'member',
  'curator',
  'observer',
] as const;

// ─── Shared Context Manifest ────────────────────────────────────────────────

/**
 * Manifest tracking files in the shared-context directory.
 * Lives at `.meta/manifest.json` within the team's shared-context dir.
 */
export interface SharedContextManifest {
  /** Registry of tracked files in the shared context. */
  files: ManifestEntry[];
  /** Per-agent read cursors — last sync timestamp per agent. */
  lastSync: Record<string, string>;
}

/**
 * A single file entry in the shared-context manifest.
 */
export interface ManifestEntry {
  /** Relative path within the shared-context directory. */
  path: string;
  /** Agent ID that last modified this file. */
  lastModifiedBy: string;
  /** ISO 8601 timestamp of last modification. */
  lastModifiedAt: string;
  /** File size in bytes. */
  sizeBytes: number;
}

// ─── Symlink Types ──────────────────────────────────────────────────────────

/**
 * Result of a symlink operation (create, repair, remove).
 */
export interface SymlinkResult {
  /** Agent the symlink belongs to. */
  agentId: string;
  /** Team the symlink points to. */
  teamId: string;
  /** The action that was performed. */
  action: 'created' | 'already_valid' | 'repaired' | 'removed' | 'noop';
  /** Full path to the symlink. */
  linkPath: string;
  /** Full path to the target directory. */
  targetPath: string;
}

/**
 * Health status of a single agent's workspace symlink.
 */
export interface SymlinkHealthEntry {
  /** Agent identifier. */
  agentId: string;
  /** Whether the symlink exists and points to the correct target. */
  healthy: boolean;
  /** Full path to the symlink. */
  linkPath: string;
  /** Expected target path. */
  expectedTarget: string;
  /** Actual target the symlink points to (null if missing/broken). */
  actualTarget: string | null;
  /** Diagnostic message. */
  status: 'valid' | 'missing' | 'broken' | 'wrong_target' | 'not_symlink';
}

/**
 * Health report for all symlinks within a team.
 */
export interface SymlinkHealthReport {
  /** Team identifier. */
  teamId: string;
  /** Team name. */
  teamName: string;
  /** Whether all symlinks are healthy. */
  allHealthy: boolean;
  /** Per-agent symlink status. */
  entries: SymlinkHealthEntry[];
  /** ISO 8601 timestamp of the check. */
  checkedAt: string;
}

// ─── Shared-Context Watcher Types (Phase 3 — #243) ─────────────────────────

/**
 * Action type for shared-context file events.
 */
export type SharedContextAction = 'write' | 'delete' | 'rename' | 'read';

/**
 * Typed event emitted by the shared-context file watcher.
 */
export interface SharedContextEvent {
  /** Event type. */
  type: 'write' | 'delete' | 'rename';
  /** Relative path within the team's shared-context directory. */
  path: string;
  /** Agent ID attributed to this change (or 'unknown'). */
  agentId: string;
  /** ISO 8601 timestamp of the event. */
  timestamp: string;
  /** File size in bytes (0 for deletes). */
  sizeBytes: number;
  /** Team ID this event belongs to. */
  teamId: string;
}

/**
 * Audit log entry stored in SQLite.
 */
export interface SharedContextAuditEntry {
  /** Unique entry ID (UUID). */
  id: string;
  /** Team identifier. */
  teamId: string;
  /** Agent that performed the action. */
  agentId: string;
  /** Action type. */
  action: SharedContextAction | 'violation';
  /** Relative file path. */
  filePath: string;
  /** File size in bytes (null for deletes/reads). */
  fileSizeBytes: number | null;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Optional detail for violations. */
  detail?: string;
}

/**
 * Configuration for the shared-context watcher enforcement rules.
 */
export interface SharedContextWatcherConfig {
  /** Maximum size per file in bytes. Default: 51200 (50KB). */
  maxFileSizeBytes: number;
  /** Maximum total shared-context size per team in bytes. Default: 2097152 (2MB). */
  maxTeamTotalBytes: number;
  /** Warning threshold as fraction of maxTeamTotalBytes. Default: 0.8. */
  teamTotalWarnThreshold: number;
  /** Max writes per agent per minute. Default: 10. */
  maxWritesPerMinutePerAgent: number;
  /** Debounce interval in ms. Default: 100. */
  debounceMs: number;
}

/**
 * Default enforcement configuration matching issue #243 spec.
 */
export const DEFAULT_WATCHER_CONFIG: Readonly<SharedContextWatcherConfig> = {
  maxFileSizeBytes: 50 * 1024,        // 50KB
  maxTeamTotalBytes: 2 * 1024 * 1024,  // 2MB
  teamTotalWarnThreshold: 0.8,
  maxWritesPerMinutePerAgent: 10,
  debounceMs: 100,
} as const;

// ─── Composite Types ────────────────────────────────────────────────────────

/**
 * Team with its agent membership list.
 * Returned by TeamService.getTeam().
 */
export interface TeamWithAgents extends Team {
  /** List of agents in this team. */
  agents: TeamAgent[];
}

// ─── Directory Structure Constants ──────────────────────────────────────────

/**
 * Standard subdirectories created in every team's shared-context directory.
 * Matches the #217 epic specification.
 */
export const SHARED_CONTEXT_SUBDIRS: readonly string[] = [
  'agent-outputs',
  'feedback',
  'kpis',
  'calendar',
  'roundtable',
  '.meta',
] as const;

/**
 * Standard files created in every team's shared-context directory.
 */
export const SHARED_CONTEXT_INITIAL_FILES: Readonly<Record<string, string>> = {
  'priorities.md': '# Team Priorities\n\n_No priorities set yet._\n',
  '.meta/manifest.json': JSON.stringify(
    { files: [], lastSync: {} } satisfies SharedContextManifest,
    null,
    2,
  ) + '\n',
  '.meta/last-sync.json': JSON.stringify({}, null, 2) + '\n',
} as const;

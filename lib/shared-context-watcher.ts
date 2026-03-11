/**
 * SharedContextWatcher — VentureOS File Watcher + Audit Trail
 *
 * Monitors shared-context directories for file changes, emits typed events,
 * records all operations in an SQLite audit trail, and enforces size/rate
 * limits to prevent context bloat and infinite-loop pollution.
 *
 * Phase 3 (#243) of the Shared Agent Memory Layer (#217).
 *
 * Design decisions:
 * - Uses `fs.watch` (recursive) for low-overhead native file watching
 * - Debounced at 100ms to coalesce rapid writes (e.g. editor save-cycles)
 * - Agent attribution via `.meta/last-sync.json` cursor tracking
 * - SQLite audit log with indexed queries for team+time and agent
 * - Enforcement: 50KB/file, 2MB/team, 10 writes/min/agent
 * - EventEmitter pattern for downstream consumers (dashboard feed, etc.)
 *
 * @module
 */

import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { teamSharedContextDir } from './paths';
import { structuredLog } from './structured-logger';
import type {
  SharedContextEvent,
  SharedContextAuditEntry,
  SharedContextWatcherConfig,
} from './types/team';
import { DEFAULT_WATCHER_CONFIG } from './types/team';

// ─── Constants ──────────────────────────────────────────────────────────────

const SUBSYSTEM = 'shared-context-watcher';

// ─── Error Types ────────────────────────────────────────────────────────────

export class SharedContextWatcherError extends Error {
  constructor(
    message: string,
    public readonly code: SharedContextWatcherErrorCode,
  ) {
    super(message);
    this.name = 'SharedContextWatcherError';
  }
}

export type SharedContextWatcherErrorCode =
  | 'FILE_TOO_LARGE'
  | 'TEAM_QUOTA_EXCEEDED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'WATCHER_FAILED'
  | 'AUDIT_WRITE_FAILED';

// ─── Audit Store ────────────────────────────────────────────────────────────

/**
 * SQLite-backed audit log for shared-context operations.
 * Follows the same patterns as TeamService and ObservationStore.
 */
export class SharedContextAuditStore {
  private db: Database.Database;
  private insertStmt!: Database.Statement;
  private queryByTeamStmt!: Database.Statement;
  private queryByAgentStmt!: Database.Statement;
  private queryByFileStmt!: Database.Statement;
  private countRecentWritesStmt!: Database.Statement;

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { readonly: false });
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.ensureTables();
    this.prepareStatements();
  }

  // ─── Schema ───────────────────────────────────────────────────────

  private ensureTables(): void {
    this.db.exec(`
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

      CREATE INDEX IF NOT EXISTS idx_audit_team_time
        ON shared_context_audit(team_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_agent
        ON shared_context_audit(agent_id);
      CREATE INDEX IF NOT EXISTS idx_audit_file
        ON shared_context_audit(file_path);
    `);
  }

  private prepareStatements(): void {
    this.insertStmt = this.db.prepare(`
      INSERT INTO shared_context_audit
        (id, team_id, agent_id, action, file_path, file_size_bytes, timestamp, detail)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.queryByTeamStmt = this.db.prepare(`
      SELECT * FROM shared_context_audit
      WHERE team_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    this.queryByAgentStmt = this.db.prepare(`
      SELECT * FROM shared_context_audit
      WHERE agent_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    this.queryByFileStmt = this.db.prepare(`
      SELECT * FROM shared_context_audit
      WHERE team_id = ? AND file_path = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    this.countRecentWritesStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM shared_context_audit
      WHERE agent_id = ? AND team_id = ? AND action = 'write'
        AND timestamp >= ?
    `);
  }

  // ─── Write ────────────────────────────────────────────────────────

  /**
   * Record an audit entry.
   */
  record(entry: Omit<SharedContextAuditEntry, 'id'>): SharedContextAuditEntry {
    const id = crypto.randomUUID();
    try {
      this.insertStmt.run(
        id,
        entry.teamId,
        entry.agentId,
        entry.action,
        entry.filePath,
        entry.fileSizeBytes ?? null,
        entry.timestamp,
        entry.detail ?? null,
      );
    } catch (err: any) {
      structuredLog('error', SUBSYSTEM, 'audit_write_failed', err.message, {
        teamId: entry.teamId,
        agentId: entry.agentId,
        action: entry.action,
      });
      throw new SharedContextWatcherError(
        `Failed to write audit entry: ${err.message}`,
        'AUDIT_WRITE_FAILED',
      );
    }

    return { id, ...entry };
  }

  // ─── Query ────────────────────────────────────────────────────────

  /**
   * Get recent audit entries for a team.
   */
  getByTeam(teamId: string, limit: number = 50): SharedContextAuditEntry[] {
    const rows = this.queryByTeamStmt.all(teamId, limit) as any[];
    return rows.map(this.rowToEntry);
  }

  /**
   * Get recent audit entries for an agent.
   */
  getByAgent(agentId: string, limit: number = 50): SharedContextAuditEntry[] {
    const rows = this.queryByAgentStmt.all(agentId, limit) as any[];
    return rows.map(this.rowToEntry);
  }

  /**
   * Get audit entries for a specific file path within a team.
   */
  getByFile(teamId: string, filePath: string, limit: number = 50): SharedContextAuditEntry[] {
    const rows = this.queryByFileStmt.all(teamId, filePath, limit) as any[];
    return rows.map(this.rowToEntry);
  }

  /**
   * Count recent writes by an agent within a given time window.
   * Used for rate limiting enforcement.
   */
  countRecentWrites(agentId: string, teamId: string, sinceIso: string): number {
    const row = this.countRecentWritesStmt.get(agentId, teamId, sinceIso) as any;
    return row?.count ?? 0;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────

  close(): void {
    try {
      this.db.close();
    } catch {
      // ignore close errors
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private rowToEntry(row: any): SharedContextAuditEntry {
    return {
      id: row.id,
      teamId: row.team_id,
      agentId: row.agent_id,
      action: row.action,
      filePath: row.file_path,
      fileSizeBytes: row.file_size_bytes,
      timestamp: row.timestamp,
      detail: row.detail ?? undefined,
    };
  }
}

// ─── SharedContextWatcher ───────────────────────────────────────────────────

/**
 * Events emitted by SharedContextWatcher:
 * - 'change'     — SharedContextEvent for any file change
 * - 'violation'  — SharedContextAuditEntry for enforcement violations
 * - 'error'      — Error from the underlying fs.watch or audit store
 */
export interface SharedContextWatcherEvents {
  change: [SharedContextEvent];
  violation: [SharedContextAuditEntry];
  error: [Error];
}

export class SharedContextWatcher extends EventEmitter {
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private config: SharedContextWatcherConfig;
  private auditStore: SharedContextAuditStore;

  /** Per-agent sliding window for rate limiting: agentId:teamId → timestamp[] */
  private writeTimestamps: Map<string, number[]> = new Map();

  /** Debounce timers: filePath → timeout handle */
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /** Track pending debounced events for coalescing: filePath → latest event info */
  private pendingEvents: Map<string, { type: 'write' | 'delete' | 'rename'; absPath: string; teamId: string; teamDir: string }> = new Map();

  private closed = false;

  constructor(auditDbPath: string, config?: Partial<SharedContextWatcherConfig>) {
    super();
    this.config = { ...DEFAULT_WATCHER_CONFIG, ...config };
    this.auditStore = new SharedContextAuditStore(auditDbPath);
  }

  // ─── Watcher Lifecycle ────────────────────────────────────────────

  /**
   * Start watching a team's shared-context directory.
   * Idempotent — if already watching, returns immediately.
   *
   * @param teamId - Team identifier.
   * @param teamName - Team name (for directory resolution).
   */
  watchTeam(teamId: string, teamName: string): void {
    if (this.closed) return;
    if (this.watchers.has(teamId)) return;

    const teamDir = teamSharedContextDir(teamName);

    if (!fs.existsSync(teamDir)) {
      structuredLog('warn', SUBSYSTEM, 'watch_dir_missing',
        `Shared-context directory does not exist: ${teamDir}`, { teamId, teamName });
      return;
    }

    try {
      const watcher = fs.watch(teamDir, { recursive: true }, (eventType, filename) => {
        if (this.closed || !filename) return;
        this.handleFsEvent(teamId, teamDir, eventType, filename);
      });

      watcher.on('error', (err) => {
        structuredLog('error', SUBSYSTEM, 'watcher_error', err.message, { teamId });
        this.emit('error', err);
      });

      this.watchers.set(teamId, watcher);

      structuredLog('info', SUBSYSTEM, 'watcher_started',
        `Watching shared-context for team ${teamName}`, { teamId, teamName, teamDir });
    } catch (err: any) {
      throw new SharedContextWatcherError(
        `Failed to start watcher for team "${teamName}": ${err.message}`,
        'WATCHER_FAILED',
      );
    }
  }

  /**
   * Stop watching a specific team.
   */
  unwatchTeam(teamId: string): void {
    const watcher = this.watchers.get(teamId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(teamId);
      structuredLog('info', SUBSYSTEM, 'watcher_stopped',
        `Stopped watching team ${teamId}`, { teamId });
    }
  }

  /**
   * Stop all watchers and clean up resources.
   * Safe to call multiple times.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;

    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.pendingEvents.clear();

    // Close all watchers
    for (const [teamId, watcher] of this.watchers) {
      watcher.close();
      structuredLog('info', SUBSYSTEM, 'watcher_stopped',
        `Stopped watching team ${teamId} (shutdown)`, { teamId });
    }
    this.watchers.clear();

    // Clear rate limit windows
    this.writeTimestamps.clear();

    // Close audit store
    this.auditStore.close();

    structuredLog('info', SUBSYSTEM, 'watcher_shutdown', 'SharedContextWatcher shut down cleanly');
  }

  /**
   * Check if the watcher is currently observing a team.
   */
  isWatching(teamId: string): boolean {
    return this.watchers.has(teamId);
  }

  /**
   * Get the number of actively watched teams.
   */
  get watchCount(): number {
    return this.watchers.size;
  }

  // ─── Enforcement API ──────────────────────────────────────────────

  /**
   * Validate a file write against enforcement rules BEFORE the write happens.
   * Returns null if OK, or throws with a descriptive error.
   *
   * Checks:
   * 1. File size limit (50KB)
   * 2. Team total size limit (2MB)
   * 3. Rate limit (10 writes/min/agent)
   */
  validateWrite(
    teamId: string,
    teamName: string,
    agentId: string,
    filePath: string,
    sizeBytes: number,
  ): void {
    // 1. File size check
    if (sizeBytes > this.config.maxFileSizeBytes) {
      const entry = this.auditStore.record({
        teamId,
        agentId,
        action: 'violation',
        filePath,
        fileSizeBytes: sizeBytes,
        timestamp: new Date().toISOString(),
        detail: `File size ${sizeBytes} exceeds limit of ${this.config.maxFileSizeBytes} bytes`,
      });
      this.emit('violation', entry);

      structuredLog('warn', SUBSYSTEM, 'file_size_violation',
        `File ${filePath} rejected: ${sizeBytes}B > ${this.config.maxFileSizeBytes}B limit`,
        { teamId, agentId, filePath, sizeBytes, limit: this.config.maxFileSizeBytes });

      throw new SharedContextWatcherError(
        `File "${filePath}" (${sizeBytes} bytes) exceeds the ${this.config.maxFileSizeBytes} byte limit. ` +
        `Split large content into smaller files.`,
        'FILE_TOO_LARGE',
      );
    }

    // 2. Team total size check
    const teamDir = teamSharedContextDir(teamName);
    const totalSize = this.calculateDirectorySize(teamDir);

    if (totalSize + sizeBytes > this.config.maxTeamTotalBytes) {
      const entry = this.auditStore.record({
        teamId,
        agentId,
        action: 'violation',
        filePath,
        fileSizeBytes: sizeBytes,
        timestamp: new Date().toISOString(),
        detail: `Team total would be ${totalSize + sizeBytes}B, exceeding ${this.config.maxTeamTotalBytes}B`,
      });
      this.emit('violation', entry);

      structuredLog('error', SUBSYSTEM, 'team_quota_exceeded',
        `Team ${teamId} quota exceeded: ${totalSize + sizeBytes}B > ${this.config.maxTeamTotalBytes}B`,
        { teamId, agentId, filePath, totalSize, writeSize: sizeBytes, limit: this.config.maxTeamTotalBytes });

      throw new SharedContextWatcherError(
        `Team shared-context total (${totalSize} bytes) + this file (${sizeBytes} bytes) ` +
        `would exceed the ${this.config.maxTeamTotalBytes} byte team limit. ` +
        `Clean up unused files to free space.`,
        'TEAM_QUOTA_EXCEEDED',
      );
    }

    // Warn at threshold
    const warningThreshold = this.config.maxTeamTotalBytes * this.config.teamTotalWarnThreshold;
    if (totalSize + sizeBytes > warningThreshold) {
      structuredLog('warn', SUBSYSTEM, 'team_quota_warning',
        `Team ${teamId} approaching quota: ${totalSize + sizeBytes}B / ${this.config.maxTeamTotalBytes}B ` +
        `(${Math.round(((totalSize + sizeBytes) / this.config.maxTeamTotalBytes) * 100)}%)`,
        { teamId, totalSize, writeSize: sizeBytes, limit: this.config.maxTeamTotalBytes });
    }

    // 3. Rate limit check
    if (!this.checkRateLimit(agentId, teamId)) {
      const entry = this.auditStore.record({
        teamId,
        agentId,
        action: 'violation',
        filePath,
        fileSizeBytes: sizeBytes,
        timestamp: new Date().toISOString(),
        detail: `Rate limit exceeded: max ${this.config.maxWritesPerMinutePerAgent} writes/min`,
      });
      this.emit('violation', entry);

      structuredLog('warn', SUBSYSTEM, 'rate_limit_exceeded',
        `Agent ${agentId} rate limited: >${this.config.maxWritesPerMinutePerAgent} writes/min`,
        { teamId, agentId, filePath, limit: this.config.maxWritesPerMinutePerAgent });

      throw new SharedContextWatcherError(
        `Agent "${agentId}" has exceeded the rate limit of ${this.config.maxWritesPerMinutePerAgent} ` +
        `writes per minute. Wait before writing again.`,
        'RATE_LIMIT_EXCEEDED',
      );
    }

    // Record the write timestamp so subsequent validateWrite calls see it
    this.recordWriteTimestamp(agentId, teamId);
  }

  // ─── Audit Access ─────────────────────────────────────────────────

  /**
   * Query audit entries for a team (most recent first).
   */
  getAuditByTeam(teamId: string, limit?: number): SharedContextAuditEntry[] {
    return this.auditStore.getByTeam(teamId, limit);
  }

  /**
   * Query audit entries for an agent (most recent first).
   */
  getAuditByAgent(agentId: string, limit?: number): SharedContextAuditEntry[] {
    return this.auditStore.getByAgent(agentId, limit);
  }

  /**
   * Query audit entries for a specific file (most recent first).
   */
  getAuditByFile(teamId: string, filePath: string, limit?: number): SharedContextAuditEntry[] {
    return this.auditStore.getByFile(teamId, filePath, limit);
  }

  /**
   * Direct access to audit store for advanced queries.
   * Exposed for testing and HTTP endpoint integration.
   */
  get audit(): SharedContextAuditStore {
    return this.auditStore;
  }

  // ─── Internal: FS Event Handling ──────────────────────────────────

  /**
   * Handle a raw fs.watch event with debouncing.
   */
  private handleFsEvent(
    teamId: string,
    teamDir: string,
    eventType: string,
    filename: string,
  ): void {
    // Normalize path separator
    const relativePath = filename.replace(/\\/g, '/');
    const absPath = path.join(teamDir, relativePath);
    const debounceKey = `${teamId}:${relativePath}`;

    // Ignore .meta directory changes (internal bookkeeping)
    if (relativePath.startsWith('.meta/') || relativePath === '.meta') {
      return;
    }

    // Determine event type
    let type: 'write' | 'delete' | 'rename';
    if (eventType === 'rename') {
      // fs.watch 'rename' fires for both create and delete on many platforms
      type = fs.existsSync(absPath) ? 'write' : 'delete';
    } else {
      type = 'write';
    }

    // Store pending event for debounce coalescing
    this.pendingEvents.set(debounceKey, { type, absPath, teamId, teamDir });

    // Clear existing debounce timer for this path
    const existingTimer = this.debounceTimers.get(debounceKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounce timer
    const timer = setTimeout(() => {
      this.debounceTimers.delete(debounceKey);
      const pending = this.pendingEvents.get(debounceKey);
      this.pendingEvents.delete(debounceKey);
      if (pending) {
        this.processEvent(pending.teamId, pending.teamDir, relativePath, pending.type, pending.absPath);
      }
    }, this.config.debounceMs);

    this.debounceTimers.set(debounceKey, timer);
  }

  /**
   * Process a debounced file event: attribute agent, record audit, emit event.
   */
  private processEvent(
    teamId: string,
    teamDir: string,
    relativePath: string,
    type: 'write' | 'delete' | 'rename',
    absPath: string,
  ): void {
    const now = new Date().toISOString();

    // Get file size
    let sizeBytes = 0;
    if (type !== 'delete') {
      try {
        const stat = fs.statSync(absPath);
        if (stat.isDirectory()) return; // Ignore directory events
        sizeBytes = stat.size;
      } catch {
        // File may have been deleted between event and processing
        return;
      }
    }

    // Attribute agent
    const agentId = this.attributeAgent(teamDir, relativePath);

    // Build event
    const event: SharedContextEvent = {
      type,
      path: relativePath,
      agentId,
      timestamp: now,
      sizeBytes,
      teamId,
    };

    // Record in audit trail
    try {
      this.auditStore.record({
        teamId,
        agentId,
        action: type,
        filePath: relativePath,
        fileSizeBytes: sizeBytes,
        timestamp: now,
      });
    } catch (err: any) {
      structuredLog('error', SUBSYSTEM, 'audit_record_failed',
        `Failed to record audit for ${relativePath}: ${err.message}`,
        { teamId, agentId, type, filePath: relativePath });
      // Don't swallow — emit error but still emit the change event
      this.emit('error', err);
    }

    // Record rate limit timestamp for writes
    if (type === 'write') {
      this.recordWriteTimestamp(agentId, teamId);
    }

    // Emit typed event
    this.emit('change', event);

    structuredLog('debug', SUBSYSTEM, 'file_event',
      `${type} ${relativePath} by ${agentId}`,
      { teamId, agentId, type, filePath: relativePath, sizeBytes });
  }

  // ─── Internal: Agent Attribution ──────────────────────────────────

  /**
   * Determine which agent made a change based on file path and sync cursors.
   *
   * Attribution strategy:
   * 1. If path is under `agent-outputs/{agentId}/`, attribute to that agent.
   * 2. Otherwise, check `.meta/last-sync.json` for the most recently synced agent.
   * 3. Fall back to 'unknown'.
   */
  private attributeAgent(teamDir: string, relativePath: string): string {
    // Strategy 1: agent-outputs/{agentId}/ prefix
    const agentOutputMatch = relativePath.match(/^agent-outputs\/([^/]+)\//);
    if (agentOutputMatch) {
      return agentOutputMatch[1];
    }

    // Strategy 2: check last-sync.json
    try {
      const syncPath = path.join(teamDir, '.meta', 'last-sync.json');
      const syncData = JSON.parse(fs.readFileSync(syncPath, 'utf-8'));
      // Find the agent with the most recent sync timestamp
      let latestAgent = 'unknown';
      let latestTime = '';
      for (const [agentId, timestamp] of Object.entries(syncData)) {
        if (typeof timestamp === 'string' && timestamp > latestTime) {
          latestTime = timestamp;
          latestAgent = agentId;
        }
      }
      if (latestAgent !== 'unknown') return latestAgent;
    } catch {
      // last-sync.json missing or invalid — fall through
    }

    return 'unknown';
  }

  // ─── Internal: Rate Limiting ──────────────────────────────────────

  /**
   * Check if an agent is within their write rate limit.
   * Uses an in-memory sliding window (faster than DB for hot path).
   */
  private checkRateLimit(agentId: string, teamId: string): boolean {
    const key = `${agentId}:${teamId}`;
    const now = Date.now();
    const windowMs = 60_000; // 1 minute

    const timestamps = this.writeTimestamps.get(key) ?? [];

    // Prune timestamps outside the window
    const cutoff = now - windowMs;
    const recentTimestamps = timestamps.filter((t) => t > cutoff);

    // Update stored timestamps
    this.writeTimestamps.set(key, recentTimestamps);

    return recentTimestamps.length < this.config.maxWritesPerMinutePerAgent;
  }

  /**
   * Record a write timestamp for rate limiting.
   */
  private recordWriteTimestamp(agentId: string, teamId: string): void {
    const key = `${agentId}:${teamId}`;
    const now = Date.now();

    const timestamps = this.writeTimestamps.get(key) ?? [];
    timestamps.push(now);

    // Prune old entries to keep memory bounded
    const cutoff = now - 60_000;
    const pruned = timestamps.filter((t) => t > cutoff);
    this.writeTimestamps.set(key, pruned);
  }

  // ─── Internal: Directory Size ─────────────────────────────────────

  /**
   * Calculate total size of all files in a directory (recursive).
   * Excludes .meta directory from the count.
   */
  calculateDirectorySize(dirPath: string): number {
    let totalSize = 0;

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        // Exclude .meta from quota calculation
        if (entry.name === '.meta') continue;

        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          totalSize += this.calculateDirectorySize(fullPath);
        } else if (entry.isFile()) {
          try {
            totalSize += fs.statSync(fullPath).size;
          } catch {
            // File may have been deleted — skip
          }
        }
      }
    } catch {
      // Directory may not exist yet
    }

    return totalSize;
  }
}

export default SharedContextWatcher;

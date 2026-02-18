/**
 * Observation Store — VentureOS Observational Memory Persistence
 *
 * SQLite-backed store for observation records. Follows the same patterns
 * as SqliteConversationStore and InteractionLogger — lazy table creation,
 * WAL mode, prepared statements for performance.
 *
 * Phase 1 (#230): Core schema + CRUD
 * Phase 2 (#231): priority, referenced_date, source_message_ids, memory_state table
 */

import Database from 'better-sqlite3';
import type {
  Observation,
  ObservationId,
  ObservationQuery,
  ObservationStatus,
  TokenUsageSummary,
  IObservationStore,
  MemoryState,
} from './types/observation';

/**
 * SQLite-backed observation store.
 *
 * Schema is self-creating (CREATE IF NOT EXISTS) so it's safe for both
 * fresh and existing databases. Indexes are added for common query patterns
 * (status, agent, conversation, timestamp).
 */
export class ObservationStore implements IObservationStore {
  private db: Database.Database;
  private insertStmt: Database.Statement;
  private getByIdStmt: Database.Statement;
  private updateStatusStmt: Database.Statement;

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { readonly: false });
    this.db.pragma('journal_mode = WAL');
    this.ensureTables();

    this.insertStmt = this.db.prepare(`
      INSERT INTO observations
        (id, created_at, category, content, source_conversation_id, source_message_id,
         source_agent_id, source_channel, status, token_input, token_output,
         token_total, token_model, token_cost_usd, metadata,
         priority, referenced_date, source_message_ids)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.getByIdStmt = this.db.prepare('SELECT * FROM observations WHERE id = ?');

    this.updateStatusStmt = this.db.prepare(
      'UPDATE observations SET status = ? WHERE id = ?',
    );
  }

  /**
   * Create tables and indexes if they don't exist.
   * Safe for existing databases — uses IF NOT EXISTS throughout.
   * Phase 2 adds: priority, referenced_date, source_message_ids columns
   * and the memory_state table.
   */
  private ensureTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS observations (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'other',
        content TEXT NOT NULL,
        source_conversation_id TEXT,
        source_message_id TEXT,
        source_agent_id TEXT NOT NULL,
        source_channel TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        token_input INTEGER,
        token_output INTEGER,
        token_total INTEGER,
        token_model TEXT,
        token_cost_usd REAL,
        metadata TEXT DEFAULT '{}',
        priority TEXT,
        referenced_date TEXT,
        source_message_ids TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_observations_status
        ON observations(status);
      CREATE INDEX IF NOT EXISTS idx_observations_agent
        ON observations(source_agent_id);
      CREATE INDEX IF NOT EXISTS idx_observations_conversation
        ON observations(source_conversation_id);
      CREATE INDEX IF NOT EXISTS idx_observations_created
        ON observations(created_at);
      CREATE INDEX IF NOT EXISTS idx_observations_category
        ON observations(category);

      -- Memory state: one row per agent tracking token budgets
      CREATE TABLE IF NOT EXISTS memory_state (
        agent_id TEXT PRIMARY KEY,
        observations_tokens INTEGER NOT NULL DEFAULT 0,
        raw_buffer_tokens INTEGER NOT NULL DEFAULT 0,
        last_observation_at TEXT,
        last_reflection_at TEXT,
        observation_count INTEGER NOT NULL DEFAULT 0
      );
    `);

    // Phase 2 migration: add new columns to existing databases.
    // SQLite ALTER TABLE ADD COLUMN is idempotent-safe via try/catch.
    this.migratePhase2Columns();

    // Create index on priority column (must come after migration adds the column)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_observations_priority
        ON observations(priority);
    `);
  }

  /**
   * Add Phase 2 columns if missing (backward-compatible migration).
   */
  private migratePhase2Columns(): void {
    const cols = ['priority', 'referenced_date', 'source_message_ids'];
    for (const col of cols) {
      try {
        this.db.exec(`ALTER TABLE observations ADD COLUMN ${col} TEXT`);
      } catch {
        // Column already exists — safe to ignore
      }
    }
  }

  /**
   * Insert a single observation.
   */
  insert(observation: Observation): void {
    this.insertStmt.run(
      observation.id,
      observation.createdAt,
      observation.category,
      observation.content,
      observation.source.conversationId ?? null,
      observation.source.messageId ?? null,
      observation.source.agentId,
      observation.source.channel ?? null,
      observation.status,
      observation.tokenUsage?.inputTokens ?? null,
      observation.tokenUsage?.outputTokens ?? null,
      observation.tokenUsage?.totalTokens ?? null,
      observation.tokenUsage?.model ?? null,
      observation.tokenUsage?.estimatedCostUsd ?? null,
      JSON.stringify(observation.metadata ?? {}),
      observation.priority ?? null,
      observation.referencedDate ?? null,
      observation.sourceMessageIds ? JSON.stringify(observation.sourceMessageIds) : null,
    );
  }

  /**
   * Insert multiple observations in a single transaction.
   * Uses a transaction for atomicity and performance.
   */
  insertBatch(observations: Observation[]): void {
    if (observations.length === 0) return;

    const tx = this.db.transaction((items: Observation[]) => {
      for (const obs of items) {
        this.insert(obs);
      }
    });

    tx(observations);
  }

  /**
   * Query observations with optional filters.
   * Builds a dynamic WHERE clause based on provided options.
   */
  query(opts: ObservationQuery = {}): Observation[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (opts.category) {
      conditions.push('category = ?');
      params.push(opts.category);
    }
    if (opts.status) {
      conditions.push('status = ?');
      params.push(opts.status);
    }
    if (opts.agentId) {
      conditions.push('source_agent_id = ?');
      params.push(opts.agentId);
    }
    if (opts.conversationId) {
      conditions.push('source_conversation_id = ?');
      params.push(opts.conversationId);
    }
    if (opts.since) {
      conditions.push('created_at >= ?');
      params.push(opts.since);
    }
    if (opts.before) {
      conditions.push('created_at < ?');
      params.push(opts.before);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(opts.limit ?? 100, 1000);
    const offset = opts.offset ?? 0;

    const sql = `SELECT * FROM observations ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map((r) => this.rowToObservation(r));
  }

  /**
   * Get a single observation by ID.
   */
  getById(id: ObservationId): Observation | null {
    const row = this.getByIdStmt.get(id) as any;
    if (!row) return null;
    return this.rowToObservation(row);
  }

  /**
   * Update the processing status of an observation.
   */
  updateStatus(id: ObservationId, status: ObservationStatus): void {
    this.updateStatusStmt.run(status, id);
  }

  /**
   * Get aggregated token usage statistics.
   */
  getTokenUsageSummary(opts: {
    agentId?: string;
    conversationId?: string;
    since?: string;
    before?: string;
  } = {}): TokenUsageSummary {
    const conditions: string[] = ["category = 'token_usage'"];
    const params: unknown[] = [];

    if (opts.agentId) {
      conditions.push('source_agent_id = ?');
      params.push(opts.agentId);
    }
    if (opts.conversationId) {
      conditions.push('source_conversation_id = ?');
      params.push(opts.conversationId);
    }
    if (opts.since) {
      conditions.push('created_at >= ?');
      params.push(opts.since);
    }
    if (opts.before) {
      conditions.push('created_at < ?');
      params.push(opts.before);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const sql = `
      SELECT
        COALESCE(SUM(token_input), 0) as total_input,
        COALESCE(SUM(token_output), 0) as total_output,
        COALESCE(SUM(token_total), 0) as total,
        COALESCE(SUM(token_cost_usd), 0) as total_cost,
        COUNT(*) as obs_count
      FROM observations ${where}
    `;

    const row = this.db.prepare(sql).get(...params) as any;

    return {
      totalInputTokens: row.total_input,
      totalOutputTokens: row.total_output,
      totalTokens: row.total,
      totalEstimatedCostUsd: row.total_cost,
      observationCount: row.obs_count,
    };
  }

  /**
   * Count observations matching a query.
   */
  count(opts: Pick<ObservationQuery, 'category' | 'status' | 'agentId' | 'conversationId'> = {}): number {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (opts.category) {
      conditions.push('category = ?');
      params.push(opts.category);
    }
    if (opts.status) {
      conditions.push('status = ?');
      params.push(opts.status);
    }
    if (opts.agentId) {
      conditions.push('source_agent_id = ?');
      params.push(opts.agentId);
    }
    if (opts.conversationId) {
      conditions.push('source_conversation_id = ?');
      params.push(opts.conversationId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT COUNT(*) as c FROM observations ${where}`;
    const row = this.db.prepare(sql).get(...params) as any;
    return row.c;
  }

  // ─── Memory State (Phase 2) ────────────────────────────────────────────

  /**
   * Get the memory state for an agent.
   * Returns null if no state has been recorded yet.
   */
  getMemoryState(agentId: string): MemoryState | null {
    const row = this.db.prepare('SELECT * FROM memory_state WHERE agent_id = ?').get(agentId) as any;
    if (!row) return null;
    return {
      agentId: row.agent_id,
      observationsTokens: row.observations_tokens,
      rawBufferTokens: row.raw_buffer_tokens,
      lastObservationAt: row.last_observation_at ?? null,
      lastReflectionAt: row.last_reflection_at ?? null,
      observationCount: row.observation_count,
    };
  }

  /**
   * Upsert memory state for an agent after an observation pass.
   */
  upsertMemoryState(state: MemoryState): void {
    this.db.prepare(`
      INSERT INTO memory_state (agent_id, observations_tokens, raw_buffer_tokens, last_observation_at, last_reflection_at, observation_count)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(agent_id) DO UPDATE SET
        observations_tokens = excluded.observations_tokens,
        raw_buffer_tokens = excluded.raw_buffer_tokens,
        last_observation_at = excluded.last_observation_at,
        last_reflection_at = excluded.last_reflection_at,
        observation_count = excluded.observation_count
    `).run(
      state.agentId,
      state.observationsTokens,
      state.rawBufferTokens,
      state.lastObservationAt,
      state.lastReflectionAt,
      state.observationCount,
    );
  }

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

  private rowToObservation(row: any): Observation {
    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(row.metadata || '{}');
    } catch {
      /* ignore parse errors */
    }

    let sourceMessageIds: string[] | undefined;
    if (row.source_message_ids) {
      try {
        sourceMessageIds = JSON.parse(row.source_message_ids);
      } catch {
        /* ignore parse errors */
      }
    }

    const observation: Observation = {
      id: row.id,
      createdAt: row.created_at,
      category: row.category,
      content: row.content,
      source: {
        conversationId: row.source_conversation_id ?? undefined,
        messageId: row.source_message_id ?? undefined,
        agentId: row.source_agent_id,
        channel: row.source_channel ?? undefined,
      },
      status: row.status,
      metadata,
    };

    // Attach token usage data if present
    if (row.token_total != null) {
      observation.tokenUsage = {
        inputTokens: row.token_input ?? 0,
        outputTokens: row.token_output ?? 0,
        totalTokens: row.token_total,
        model: row.token_model ?? undefined,
        estimatedCostUsd: row.token_cost_usd ?? undefined,
      };
    }

    // Phase 2 fields
    if (row.priority) observation.priority = row.priority;
    if (row.referenced_date) observation.referencedDate = row.referenced_date;
    if (sourceMessageIds) observation.sourceMessageIds = sourceMessageIds;

    return observation;
  }
}

export default ObservationStore;

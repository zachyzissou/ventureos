/**
 * Affinity Manager — VentureOS Conversation Orchestration (Track 5)
 *
 * Reads and updates Affinity Network affinity data in ventureos-rpg.db.
 *
 * Expected tables (current schema):
 *  - affinity_network(agent_a, agent_b, affinity, seed_value, last_interaction_at, interaction_count, updated_at)
 *  - affinity_drift_history(agent_a, agent_b, old_affinity, new_affinity, delta, reason, interaction_type, related_mission_id, created_at)
 *
 * Backward compatibility:
 *  - If an older table `affinity_bonds` exists, we will read from it (best-effort).
 */

import Database from 'better-sqlite3';
import { RPG_DB_PATH } from './paths';

export type AgentId = string;

export interface AffinityBond {
  agentA: AgentId;
  agentB: AgentId;
  affinity: number;
  seedValue?: number;
  lastInteractionAt?: string | null;
  interactionCount?: number;
  updatedAt?: string | null;
}

export type InteractionType =
  | 'handoff'
  | 'collaboration'
  | 'conflict'
  | 'escalation'
  | 'challenge'
  | 'message'
  | 'other';

export interface AffinityConfig {
  dbPath: string;
  /** If true, do not write to the DB. Default: false */
  readonly: boolean;

  /** If bond is missing, create with this default. Default: 0.7 */
  defaultAffinity: number;

  /** Clamp bounds. Match DB constraint defaults (0.10..0.95). */
  minAffinity: number;
  maxAffinity: number;

  /** Low-affinity threshold for mandatory Echo mediation. Default: 0.5 */
  lowAffinityThreshold: number;

  /** Delta presets for drift tracking. */
  deltas: {
    handoffSuccess: number;
    handoffFailure: number;
    collaboration: number;
    conflict: number;
  };
}

export interface AffinityStats {
  average: number;
  lowest: number;
  lowestPair: [AgentId, AgentId];
  pairCount: number;
}

const DEFAULT_CONFIG: AffinityConfig = {
  dbPath: RPG_DB_PATH,
  readonly: false,
  defaultAffinity: 0.7,
  minAffinity: 0.1,
  maxAffinity: 0.95,
  lowAffinityThreshold: 0.5,
  deltas: {
    handoffSuccess: 0.03,
    handoffFailure: -0.03,
    collaboration: 0.02,
    conflict: -0.02,
  },
};

function normalizePair(a: AgentId, b: AgentId): [AgentId, AgentId] {
  return a < b ? [a, b] : [b, a];
}

function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1`
    )
    .get(table) as { name?: string } | undefined;
  return !!row?.name;
}

function tableColumns(db: Database.Database, table: string): Set<string> {
  if (!tableExists(db, table)) return new Set<string>();
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
  return new Set(rows.map((r) => r.name ?? '').filter(Boolean));
}

export class AffinityManager {
  private readonly config: AffinityConfig;
  private readonly db: Database.Database;
  private readonly ownsDb: boolean;
  private readonly hasAffinityNetwork: boolean;
  private readonly hasAffinityDriftHistory: boolean;
  private readonly hasLegacyAffinityBonds: boolean;
  private readonly affinityNetworkColumns: Set<string>;
  private readonly affinityDriftHistoryColumns: Set<string>;

  constructor(config: Partial<AffinityConfig> = {}, dbInstance?: Database.Database) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      deltas: { ...DEFAULT_CONFIG.deltas, ...(config.deltas ?? {}) },
    };

    if (dbInstance) {
      this.db = dbInstance;
      this.ownsDb = false;
    } else {
      this.db = new Database(this.config.dbPath, {
        readonly: this.config.readonly,
      });
      this.ownsDb = true;
    }

    this.hasAffinityNetwork = tableExists(this.db, 'affinity_network');
    this.hasAffinityDriftHistory = tableExists(this.db, 'affinity_drift_history');
    this.hasLegacyAffinityBonds = tableExists(this.db, 'affinity_bonds');
    this.affinityNetworkColumns = tableColumns(this.db, 'affinity_network');
    this.affinityDriftHistoryColumns = tableColumns(this.db, 'affinity_drift_history');
  }

  close(): void {
    if (this.ownsDb) this.db.close();
  }

  getLowAffinityThreshold(): number {
    return this.config.lowAffinityThreshold;
  }

  requiresMediation(agentA: AgentId, agentB: AgentId, threshold: number = this.config.lowAffinityThreshold): boolean {
    const a = this.getAffinity(agentA, agentB);
    return a < threshold;
  }

  /** Read-only: get affinity if present; if missing returns defaultAffinity. */
  getAffinity(agentA: AgentId, agentB: AgentId): number {
    const [a, b] = normalizePair(agentA, agentB);

    if (this.hasAffinityNetwork) {
      const row = this.db
        .prepare(
          `SELECT affinity FROM affinity_network WHERE agent_a = ? AND agent_b = ? LIMIT 1`
        )
        .get(a, b) as { affinity: number } | undefined;
      return row?.affinity ?? this.config.defaultAffinity;
    }

    // Legacy fallback
    if (this.hasLegacyAffinityBonds) {
      const row = this.db
        .prepare(
          `SELECT affinity FROM affinity_bonds WHERE agent_a = ? AND agent_b = ? LIMIT 1`
        )
        .get(a, b) as { affinity: number } | undefined;
      return row?.affinity ?? this.config.defaultAffinity;
    }

    return this.config.defaultAffinity;
  }

  getBond(agentA: AgentId, agentB: AgentId): AffinityBond {
    const [a, b] = normalizePair(agentA, agentB);

    if (this.hasAffinityNetwork) {
      const extraCols = ['seed_value', 'last_interaction_at', 'interaction_count', 'updated_at']
        .filter((col) => this.affinityNetworkColumns.has(col));
      const selectColumns = 'agent_a, agent_b, affinity' + (extraCols.length ? ', ' + extraCols.join(', ') : '');
      const sql = 'SELECT ' + selectColumns + ' FROM affinity_network WHERE agent_a = ? AND agent_b = ? LIMIT 1';
      const row = this.db
        .prepare(sql)
        .get(a, b) as any;

      if (row) {
        return {
          agentA: row.agent_a,
          agentB: row.agent_b,
          affinity: row.affinity,
          seedValue: row.seed_value,
          lastInteractionAt: row.last_interaction_at,
          interactionCount: row.interaction_count,
          updatedAt: row.updated_at,
        };
      }
    }

    // Fallback: synthesize
    return { agentA: a, agentB: b, affinity: this.config.defaultAffinity };
  }

  /** Ensure an affinity row exists (no-op if readonly or missing table). */
  ensureBond(agentA: AgentId, agentB: AgentId): void {
    if (this.config.readonly) return;
    if (!this.hasAffinityNetwork) return;

    const [a, b] = normalizePair(agentA, agentB);
    const exists = this.db
      .prepare(`SELECT 1 FROM affinity_network WHERE agent_a = ? AND agent_b = ? LIMIT 1`)
      .get(a, b);

    if (exists) return;

    const affinity = clamp(this.config.defaultAffinity, this.config.minAffinity, this.config.maxAffinity);
    const columns = ['agent_a', 'agent_b', 'affinity'];
    const values: unknown[] = [a, b, affinity];

    if (this.affinityNetworkColumns.has('seed_value')) {
      columns.push('seed_value');
      values.push(affinity);
    }
    if (this.affinityNetworkColumns.has('last_interaction_at')) {
      columns.push('last_interaction_at');
      values.push(null);
    }
    if (this.affinityNetworkColumns.has('interaction_count')) {
      columns.push('interaction_count');
      values.push(0);
    }

    const sql = 'INSERT INTO affinity_network(' + columns.join(', ') + ') VALUES(' + columns.map(() => '?').join(', ') + ')';
    this.db.prepare(sql).run(...values);
  }

  /**
   * Update affinity for a pair and write drift history.
   * Returns the new affinity.
   */
  updateAffinity(params: {
    agentA: AgentId;
    agentB: AgentId;
    delta: number;
    reason: string;
    interactionType?: InteractionType;
    relatedMissionId?: string;
    now?: Date;
  }): number {
    const { agentA, agentB } = params;
    const nowIso = (params.now ?? new Date()).toISOString();

    if (this.config.readonly || !this.hasAffinityNetwork) {
      // Read-only mode: compute the hypothetical new value without persisting.
      const oldAffinity = this.getAffinity(agentA, agentB);
      return clamp(oldAffinity + params.delta, this.config.minAffinity, this.config.maxAffinity);
    }

    const [a, b] = normalizePair(agentA, agentB);
    this.ensureBond(a, b);

    const currentCols = ['affinity'];
    if (this.affinityNetworkColumns.has('interaction_count')) currentCols.push('interaction_count');
    const currentSql = 'SELECT ' + currentCols.join(', ') + ' FROM affinity_network WHERE agent_a = ? AND agent_b = ? LIMIT 1';
    const current = this.db
      .prepare(currentSql)
      .get(a, b) as { affinity: number; interaction_count?: number } | undefined;

    const oldAffinity = current?.affinity ?? this.config.defaultAffinity;
    const newAffinity = clamp(oldAffinity + params.delta, this.config.minAffinity, this.config.maxAffinity);

    const tx = this.db.transaction(() => {
      const setClauses = ['affinity = ?'];
      const updateParams: unknown[] = [newAffinity];
      if (this.affinityNetworkColumns.has('last_interaction_at')) {
        setClauses.push('last_interaction_at = ?');
        updateParams.push(nowIso);
      }
      if (this.affinityNetworkColumns.has('interaction_count')) {
        setClauses.push('interaction_count = COALESCE(interaction_count, 0) + 1');
      }
      if (this.affinityNetworkColumns.has('updated_at')) {
        setClauses.push('updated_at = CURRENT_TIMESTAMP');
      }

      const updateSql = 'UPDATE affinity_network SET ' + setClauses.join(', ') + ' WHERE agent_a = ? AND agent_b = ?';
      this.db.prepare(updateSql).run(...updateParams, a, b);

      if (this.hasAffinityDriftHistory) {
        const required = ['agent_a', 'agent_b', 'old_affinity', 'new_affinity', 'delta', 'reason'];
        const canInsert = required.every((col) => this.affinityDriftHistoryColumns.has(col));
        if (canInsert) {
          const columns = [...required];
          const values: unknown[] = [a, b, oldAffinity, newAffinity, newAffinity - oldAffinity, params.reason];

          if (this.affinityDriftHistoryColumns.has('interaction_type')) {
            columns.push('interaction_type');
            values.push(params.interactionType ?? null);
          }
          if (this.affinityDriftHistoryColumns.has('related_mission_id')) {
            columns.push('related_mission_id');
            values.push(params.relatedMissionId ?? null);
          }
          if (this.affinityDriftHistoryColumns.has('created_at')) {
            columns.push('created_at');
            values.push(nowIso);
          }

          const sql =
            'INSERT INTO affinity_drift_history(' +
            columns.join(', ') +
            ') VALUES(' +
            columns.map(() => '?').join(', ') +
            ')';
          this.db.prepare(sql).run(...values);
        }
      }
    });

    tx();
    return newAffinity;
  }

  recordHandoffOutcome(params: {
    from: AgentId;
    to: AgentId;
    success: boolean;
    reason?: string;
    relatedMissionId?: string;
    now?: Date;
  }): number {
    const delta = params.success ? this.config.deltas.handoffSuccess : this.config.deltas.handoffFailure;
    const reason =
      params.reason ??
      (params.success ? 'Successful handoff' : 'Fumbled handoff');

    return this.updateAffinity({
      agentA: params.from,
      agentB: params.to,
      delta,
      reason,
      interactionType: 'handoff',
      relatedMissionId: params.relatedMissionId,
      now: params.now,
    });
  }

  recordCollaboration(params: {
    agentA: AgentId;
    agentB: AgentId;
    success: boolean;
    reason?: string;
    now?: Date;
  }): number {
    const delta = params.success ? this.config.deltas.collaboration : this.config.deltas.conflict;
    return this.updateAffinity({
      agentA: params.agentA,
      agentB: params.agentB,
      delta,
      reason: params.reason ?? (params.success ? 'Successful collaboration' : 'Unresolved conflict (stalemate)'),
      interactionType: params.success ? 'collaboration' : 'conflict',
      now: params.now,
    });
  }

  /**
   * Batch-fetch affinities for multiple pairs in a single SQL query.
   * Returns a Map keyed by "agentA:agentB" (normalized order) → affinity.
   * Missing pairs get the defaultAffinity value.
   *
   * PERF-003: Replaces N individual SELECT queries with one batch query.
   */
  getAffinitiesBatch(pairs: Array<[AgentId, AgentId]>): Map<string, number> {
    const result = new Map<string, number>();
    if (pairs.length === 0) return result;

    // Normalize all pairs and build lookup keys
    const normalizedPairs = pairs.map(([a, b]) => normalizePair(a, b));
    for (const [a, b] of normalizedPairs) {
      result.set(`${a}:${b}`, this.config.defaultAffinity);
    }

    if (this.hasAffinityNetwork) {
      this._batchFetchAffinity(normalizedPairs, result);
    } else if (this.hasLegacyAffinityBonds) {
      this._batchFetchLegacyAffinity(normalizedPairs, result);
    }

    return result;
  }

  /**
   * Batch-fetch affinities specifically from the legacy affinity_bonds table.
   * Same interface as getAffinitiesBatch but targets the legacy table explicitly.
   */
  getLegacyAffinitiesBatch(pairs: Array<[AgentId, AgentId]>): Map<string, number> {
    const result = new Map<string, number>();
    if (pairs.length === 0) return result;

    const normalizedPairs = pairs.map(([a, b]) => normalizePair(a, b));
    for (const [a, b] of normalizedPairs) {
      result.set(`${a}:${b}`, this.config.defaultAffinity);
    }

    if (this.hasLegacyAffinityBonds) {
      this._batchFetchLegacyAffinity(normalizedPairs, result);
    }

    return result;
  }

  /**
   * Internal: execute batch SELECT against the affinity table and populate the result map.
   * Uses a single query with WHERE (agent_a, agent_b) IN (...) for efficiency.
   */
  private _batchFetchAffinity(
    normalizedPairs: Array<[AgentId, AgentId]>,
    result: Map<string, number>
  ): void {
    // SQLite has a variable limit (default 999). Chunk if needed.
    const CHUNK_SIZE = 400; // 2 params per pair → 800 params per chunk, under limit
    for (let offset = 0; offset < normalizedPairs.length; offset += CHUNK_SIZE) {
      const chunk = normalizedPairs.slice(offset, offset + CHUNK_SIZE);
      const placeholders = chunk.map(() => '(?, ?)').join(', ');
      const params = chunk.flatMap(([a, b]) => [a, b]);

      const sql = 'SELECT agent_a, agent_b, affinity FROM affinity_network WHERE (agent_a, agent_b) IN (' + placeholders + ')';
      const rows = this.db.prepare(sql).all(...params) as Array<{
        agent_a: string;
        agent_b: string;
        affinity: number;
      }>;

      for (const row of rows) {
        result.set(row.agent_a + ':' + row.agent_b, row.affinity);
      }
    }
  }

  /**
   * Internal: execute batch SELECT against the legacy affinity table and populate the result map.
   * Uses a single query with WHERE (agent_a, agent_b) IN (...) for efficiency.
   */
  private _batchFetchLegacyAffinity(
    normalizedPairs: Array<[AgentId, AgentId]>,
    result: Map<string, number>
  ): void {
    const CHUNK_SIZE = 400;
    for (let offset = 0; offset < normalizedPairs.length; offset += CHUNK_SIZE) {
      const chunk = normalizedPairs.slice(offset, offset + CHUNK_SIZE);
      const placeholders = chunk.map(() => '(?, ?)').join(', ');
      const params = chunk.flatMap(([a, b]) => [a, b]);

      const sql = 'SELECT agent_a, agent_b, affinity FROM affinity_bonds WHERE (agent_a, agent_b) IN (' + placeholders + ')';
      const rows = this.db.prepare(sql).all(...params) as Array<{
        agent_a: string;
        agent_b: string;
        affinity: number;
      }>;

      for (const row of rows) {
        result.set(row.agent_a + ':' + row.agent_b, row.affinity);
      }
    }
  }

  /** Compute stats for the participant set (all unique pairs). */
  computeStats(participants: AgentId[]): AffinityStats {
    const unique = [...new Set(participants)].filter(Boolean);
    const pairs: Array<{ a: AgentId; b: AgentId; affinity: number }> = [];

    // PERF-003: Pre-compute all pairs and fetch affinities in a single batch query
    const pairList: Array<[AgentId, AgentId]> = [];
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        pairList.push([unique[i], unique[j]]);
      }
    }

    const affinityMap = this.getAffinitiesBatch(pairList);

    for (const [a, b] of pairList) {
      const [na, nb] = normalizePair(a, b);
      const affinity = affinityMap.get(`${na}:${nb}`) ?? this.config.defaultAffinity;
      pairs.push({ a, b, affinity });
    }

    if (pairs.length === 0) {
      return {
        average: this.config.defaultAffinity,
        lowest: this.config.defaultAffinity,
        lowestPair: [unique[0] ?? 'unknown', unique[1] ?? 'unknown'],
        pairCount: 0,
      };
    }

    let sum = 0;
    let lowest = Number.POSITIVE_INFINITY;
    let lowestPair: [AgentId, AgentId] = [pairs[0].a, pairs[0].b];

    for (const p of pairs) {
      sum += p.affinity;
      if (p.affinity < lowest) {
        lowest = p.affinity;
        lowestPair = [p.a, p.b];
      }
    }

    return {
      average: sum / pairs.length,
      lowest,
      lowestPair,
      pairCount: pairs.length,
    };
  }
}

export function getDefaultAffinityManager(config: Partial<AffinityConfig> = {}): AffinityManager {
  return new AffinityManager(config);
}

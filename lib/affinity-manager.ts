/**
 * Affinity Manager — VentureOS Conversation Orchestration (Track 5)
 *
 * Reads and updates Khala Network affinity data in ventureos-rpg.db.
 *
 * Expected tables (current schema):
 *  - khala_network(agent_a, agent_b, affinity, seed_value, last_interaction_at, interaction_count, updated_at)
 *  - khala_drift_history(agent_a, agent_b, old_affinity, new_affinity, delta, reason, interaction_type, related_mission_id, created_at)
 *
 * Backward compatibility:
 *  - If an older table `psionic_bonds` exists, we will read from it (best-effort).
 */

import path from 'node:path';
import Database from 'better-sqlite3';

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
  dbPath: path.resolve(process.env.HOME ?? '~', 'clawd/agents/ventureos-rpg.db'),
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

export class AffinityManager {
  private readonly config: AffinityConfig;
  private readonly db: Database.Database;
  private readonly ownsDb: boolean;
  private readonly hasKhalaNetwork: boolean;
  private readonly hasKhalaDriftHistory: boolean;
  private readonly hasLegacyPsionicBonds: boolean;

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

    this.hasKhalaNetwork = tableExists(this.db, 'khala_network');
    this.hasKhalaDriftHistory = tableExists(this.db, 'khala_drift_history');
    this.hasLegacyPsionicBonds = tableExists(this.db, 'psionic_bonds');
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

    if (this.hasKhalaNetwork) {
      const row = this.db
        .prepare(
          `SELECT affinity FROM khala_network WHERE agent_a = ? AND agent_b = ? LIMIT 1`
        )
        .get(a, b) as { affinity: number } | undefined;
      return row?.affinity ?? this.config.defaultAffinity;
    }

    // Legacy fallback
    if (this.hasLegacyPsionicBonds) {
      const row = this.db
        .prepare(
          `SELECT affinity FROM psionic_bonds WHERE agent_a = ? AND agent_b = ? LIMIT 1`
        )
        .get(a, b) as { affinity: number } | undefined;
      return row?.affinity ?? this.config.defaultAffinity;
    }

    return this.config.defaultAffinity;
  }

  getBond(agentA: AgentId, agentB: AgentId): AffinityBond {
    const [a, b] = normalizePair(agentA, agentB);

    if (this.hasKhalaNetwork) {
      const row = this.db
        .prepare(
          `SELECT agent_a, agent_b, affinity, seed_value, last_interaction_at, interaction_count, updated_at
           FROM khala_network
           WHERE agent_a = ? AND agent_b = ?
           LIMIT 1`
        )
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

  /** Ensure a khala_network row exists (no-op if readonly or missing table). */
  ensureBond(agentA: AgentId, agentB: AgentId): void {
    if (this.config.readonly) return;
    if (!this.hasKhalaNetwork) return;

    const [a, b] = normalizePair(agentA, agentB);
    const exists = this.db
      .prepare(`SELECT 1 FROM khala_network WHERE agent_a = ? AND agent_b = ? LIMIT 1`)
      .get(a, b);

    if (exists) return;

    const affinity = clamp(this.config.defaultAffinity, this.config.minAffinity, this.config.maxAffinity);

    this.db
      .prepare(
        `INSERT INTO khala_network(agent_a, agent_b, affinity, seed_value, last_interaction_at, interaction_count)
         VALUES(?, ?, ?, ?, NULL, 0)`
      )
      .run(a, b, affinity, affinity);
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

    if (this.config.readonly || !this.hasKhalaNetwork) {
      // Read-only mode: compute the hypothetical new value without persisting.
      const oldAffinity = this.getAffinity(agentA, agentB);
      return clamp(oldAffinity + params.delta, this.config.minAffinity, this.config.maxAffinity);
    }

    const [a, b] = normalizePair(agentA, agentB);
    this.ensureBond(a, b);

    const current = this.db
      .prepare(`SELECT affinity, interaction_count FROM khala_network WHERE agent_a = ? AND agent_b = ? LIMIT 1`)
      .get(a, b) as { affinity: number; interaction_count: number } | undefined;

    const oldAffinity = current?.affinity ?? this.config.defaultAffinity;
    const newAffinity = clamp(oldAffinity + params.delta, this.config.minAffinity, this.config.maxAffinity);

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE khala_network
           SET affinity = ?,
               last_interaction_at = ?,
               interaction_count = COALESCE(interaction_count, 0) + 1,
               updated_at = CURRENT_TIMESTAMP
           WHERE agent_a = ? AND agent_b = ?`
        )
        .run(newAffinity, nowIso, a, b);

      if (this.hasKhalaDriftHistory) {
        this.db
          .prepare(
            `INSERT INTO khala_drift_history(
              agent_a, agent_b, old_affinity, new_affinity, delta, reason, interaction_type, related_mission_id, created_at
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            a,
            b,
            oldAffinity,
            newAffinity,
            newAffinity - oldAffinity,
            params.reason,
            params.interactionType ?? null,
            params.relatedMissionId ?? null,
            nowIso
          );
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

  /** Compute stats for the participant set (all unique pairs). */
  computeStats(participants: AgentId[]): AffinityStats {
    const unique = [...new Set(participants)].filter(Boolean);
    const pairs: Array<{ a: AgentId; b: AgentId; affinity: number }> = [];

    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const a = unique[i];
        const b = unique[j];
        pairs.push({ a, b, affinity: this.getAffinity(a, b) });
      }
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

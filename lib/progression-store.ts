/**
 * Progression Store — VentureOS Phase 4.5
 *
 * SQLite persistence layer for progression profiles, skill tree state,
 * XP events, and prestige metadata.
 *
 * Uses better-sqlite3 for synchronous, transactional access.
 * Schema is auto-migrated on first open.
 *
 * Issue #203 — Phase 4.5 Deep Progression System (Phase 1 foundation)
 */

import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import type {
  ProgressionProfile,
  SkillNode,
  SkillEdge,
  SkillUnlock,
  XpEvent,
  XpSourceCategory,
  PrestigeRecord,
} from './types/progression';
import {
  levelFromXp,
  diversificationMultiplier,
  diversificationScore,
  isValidSourceCategory,
  isPrestigeEligible,
  MAX_PRESTIGE_RANK,
  getDefaultSkillTree,
} from './progression-engine';

// ─── Schema Migration ───────────────────────────────────────────────────────

const SCHEMA_SQL = `
-- Progression profiles: one per agent
CREATE TABLE IF NOT EXISTS progression_profiles (
  agent_id           TEXT PRIMARY KEY,
  display_name       TEXT NOT NULL,
  current_xp         INTEGER NOT NULL DEFAULT 0,
  lifetime_xp        INTEGER NOT NULL DEFAULT 0,
  level              INTEGER NOT NULL DEFAULT 1,
  prestige_rank      INTEGER NOT NULL DEFAULT 0,
  diversification_score INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Skill tree nodes (static definitions)
CREATE TABLE IF NOT EXISTS skill_nodes (
  node_id            TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  category           TEXT NOT NULL,
  xp_cost            INTEGER NOT NULL DEFAULT 100,
  tier               INTEGER NOT NULL DEFAULT 1,
  prerequisites      TEXT NOT NULL DEFAULT '[]'
);

-- Skill tree edges (prerequisite relationships)
CREATE TABLE IF NOT EXISTS skill_edges (
  from_node_id       TEXT NOT NULL,
  to_node_id         TEXT NOT NULL,
  PRIMARY KEY (from_node_id, to_node_id),
  FOREIGN KEY (from_node_id) REFERENCES skill_nodes(node_id),
  FOREIGN KEY (to_node_id)   REFERENCES skill_nodes(node_id)
);

-- Skill unlock state per agent
CREATE TABLE IF NOT EXISTS skill_unlocks (
  agent_id                TEXT NOT NULL,
  node_id                 TEXT NOT NULL,
  unlocked_at             TEXT NOT NULL DEFAULT (datetime('now')),
  prestige_rank_at_unlock INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (agent_id, node_id),
  FOREIGN KEY (node_id) REFERENCES skill_nodes(node_id)
);

-- XP event ledger with source attribution
CREATE TABLE IF NOT EXISTS xp_events (
  event_id                   TEXT PRIMARY KEY,
  agent_id                   TEXT NOT NULL,
  raw_xp                     INTEGER NOT NULL,
  effective_xp               INTEGER NOT NULL,
  source_category            TEXT NOT NULL,
  source_description         TEXT NOT NULL DEFAULT '',
  diversification_multiplier REAL NOT NULL DEFAULT 1.0,
  created_at                 TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Prestige transition records
CREATE TABLE IF NOT EXISTS prestige_records (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id                TEXT NOT NULL,
  from_rank               INTEGER NOT NULL,
  to_rank                 INTEGER NOT NULL,
  xp_at_prestige          INTEGER NOT NULL,
  level_at_prestige       INTEGER NOT NULL,
  unlocks_at_prestige     INTEGER NOT NULL DEFAULT 0,
  lifetime_xp_at_prestige INTEGER NOT NULL,
  created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indices for common queries
CREATE INDEX IF NOT EXISTS idx_xp_events_agent      ON xp_events(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_xp_events_category   ON xp_events(agent_id, source_category);
CREATE INDEX IF NOT EXISTS idx_skill_unlocks_agent   ON skill_unlocks(agent_id);
CREATE INDEX IF NOT EXISTS idx_prestige_agent        ON prestige_records(agent_id, created_at DESC);
`;

// ─── Store Class ────────────────────────────────────────────────────────────

export class ProgressionStore {
  private db: Database.Database;

  constructor(dbPath: string, opts?: { readonly?: boolean }) {
    this.db = new Database(dbPath, {
      readonly: opts?.readonly ?? false,
    });
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    if (!opts?.readonly) {
      this.migrate();
    }
  }

  /** Run schema migration. */
  private migrate(): void {
    this.db.exec(SCHEMA_SQL);
    this.seedSkillTree();
  }

  /** Seed the default skill tree if empty. */
  private seedSkillTree(): void {
    const count = this.db.prepare('SELECT COUNT(*) as cnt FROM skill_nodes').get() as { cnt: number };
    if (count.cnt > 0) return;

    const tree = getDefaultSkillTree();
    const insertNode = this.db.prepare(
      `INSERT OR IGNORE INTO skill_nodes (node_id, name, description, category, xp_cost, tier, prerequisites)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertEdge = this.db.prepare(
      `INSERT OR IGNORE INTO skill_edges (from_node_id, to_node_id) VALUES (?, ?)`,
    );

    const seedTransaction = this.db.transaction(() => {
      for (const node of tree.nodes) {
        insertNode.run(
          node.node_id,
          node.name,
          node.description,
          node.category,
          node.xp_cost,
          node.tier,
          JSON.stringify(node.prerequisites),
        );
      }
      for (const edge of tree.edges) {
        insertEdge.run(edge.from_node_id, edge.to_node_id);
      }
    });
    seedTransaction();
  }

  /** Close the database connection. */
  close(): void {
    try {
      this.db.close();
    } catch {
      // ignore close errors
    }
  }

  // ─── Profile Operations ─────────────────────────────────────────────────

  /** Get or create a progression profile for an agent. */
  getOrCreateProfile(agentId: string, displayName?: string): ProgressionProfile {
    const existing = this.db
      .prepare('SELECT * FROM progression_profiles WHERE agent_id = ?')
      .get(agentId) as ProgressionProfile | undefined;

    if (existing) return existing;

    const name = displayName ?? agentId;
    this.db
      .prepare(
        `INSERT INTO progression_profiles (agent_id, display_name, current_xp, lifetime_xp, level, prestige_rank, diversification_score)
         VALUES (?, ?, 0, 0, 1, 0, 0)`,
      )
      .run(agentId, name);

    return this.db
      .prepare('SELECT * FROM progression_profiles WHERE agent_id = ?')
      .get(agentId) as ProgressionProfile;
  }

  /** Get a profile by agent ID (returns null if not found). */
  getProfile(agentId: string): ProgressionProfile | null {
    return (
      (this.db
        .prepare('SELECT * FROM progression_profiles WHERE agent_id = ?')
        .get(agentId) as ProgressionProfile | undefined) ?? null
    );
  }

  /** List all profiles. */
  listProfiles(): ProgressionProfile[] {
    return this.db
      .prepare('SELECT * FROM progression_profiles ORDER BY level DESC, current_xp DESC')
      .all() as ProgressionProfile[];
  }

  // ─── XP Event Ingestion ─────────────────────────────────────────────────

  /**
   * Ingest an XP event with diversification weighting.
   * Returns the created event and updated profile, plus whether a level-up occurred.
   */
  ingestXpEvent(
    agentId: string,
    rawXp: number,
    sourceCategory: XpSourceCategory,
    sourceDescription: string,
  ): { event: XpEvent; profile: ProgressionProfile; levelUp: boolean } {
    if (rawXp <= 0) throw new Error('raw_xp must be positive');
    if (!isValidSourceCategory(sourceCategory)) {
      throw new Error(`Invalid source_category: ${sourceCategory}`);
    }

    const result = this.db.transaction(() => {
      // Ensure profile exists
      const profile = this.getOrCreateProfile(agentId);
      const previousLevel = profile.level;

      // Get recent category distribution (last 50 events)
      const recentEvents = this.db
        .prepare(
          `SELECT source_category, COUNT(*) as cnt
           FROM xp_events WHERE agent_id = ?
           GROUP BY source_category
           ORDER BY cnt DESC
           LIMIT 50`,
        )
        .all(agentId) as Array<{ source_category: string; cnt: number }>;

      const categoryCounts: Record<string, number> = {};
      for (const e of recentEvents) {
        categoryCounts[e.source_category] = e.cnt;
      }
      // Include the current event's category
      categoryCounts[sourceCategory] = (categoryCounts[sourceCategory] ?? 0) + 1;

      // Calculate diversification multiplier
      const multiplier = diversificationMultiplier(categoryCounts);
      const effectiveXp = Math.max(1, Math.round(rawXp * multiplier));

      // Create the XP event
      const eventId = crypto.randomUUID();
      this.db
        .prepare(
          `INSERT INTO xp_events (event_id, agent_id, raw_xp, effective_xp, source_category, source_description, diversification_multiplier)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(eventId, agentId, rawXp, effectiveXp, sourceCategory, sourceDescription, multiplier);

      // Update profile
      const newCurrentXp = profile.current_xp + effectiveXp;
      const newLifetimeXp = profile.lifetime_xp + effectiveXp;
      const newLevel = levelFromXp(newCurrentXp);
      const newDivScore = diversificationScore(categoryCounts);

      this.db
        .prepare(
          `UPDATE progression_profiles
           SET current_xp = ?, lifetime_xp = ?, level = ?,
               diversification_score = ?, updated_at = datetime('now')
           WHERE agent_id = ?`,
        )
        .run(newCurrentXp, newLifetimeXp, newLevel, newDivScore, agentId);

      const updatedProfile = this.db
        .prepare('SELECT * FROM progression_profiles WHERE agent_id = ?')
        .get(agentId) as ProgressionProfile;

      const event: XpEvent = {
        event_id: eventId,
        agent_id: agentId,
        raw_xp: rawXp,
        effective_xp: effectiveXp,
        source_category: sourceCategory,
        source_description: sourceDescription,
        diversification_multiplier: multiplier,
        created_at: new Date().toISOString(),
      };

      return {
        event,
        profile: updatedProfile,
        levelUp: newLevel > previousLevel,
      };
    })();

    return result;
  }

  /** Get recent XP events for an agent. */
  getRecentEvents(agentId: string, limit: number = 20): XpEvent[] {
    return this.db
      .prepare(
        `SELECT * FROM xp_events WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .all(agentId, limit) as XpEvent[];
  }

  /** Get XP events from today for summary stats. */
  getTodayEvents(): { total_xp: number; total_count: number; top_categories: Array<{ category: string; count: number }> } {
    const today = new Date().toISOString().slice(0, 10);
    const totals = this.db
      .prepare(
        `SELECT COALESCE(SUM(effective_xp), 0) as total_xp, COUNT(*) as total_count
         FROM xp_events WHERE created_at >= ?`,
      )
      .get(today) as { total_xp: number; total_count: number };

    const topCats = this.db
      .prepare(
        `SELECT source_category as category, COUNT(*) as count
         FROM xp_events WHERE created_at >= ?
         GROUP BY source_category ORDER BY count DESC LIMIT 5`,
      )
      .all(today) as Array<{ category: string; count: number }>;

    return {
      total_xp: totals.total_xp,
      total_count: totals.total_count,
      top_categories: topCats,
    };
  }

  // ─── Skill Tree Operations ──────────────────────────────────────────────

  /** Get all skill tree nodes. */
  getSkillNodes(): SkillNode[] {
    const rows = this.db.prepare('SELECT * FROM skill_nodes ORDER BY category, tier').all() as Array<{
      node_id: string;
      name: string;
      description: string;
      category: string;
      xp_cost: number;
      tier: number;
      prerequisites: string;
    }>;
    return rows.map((r) => ({
      ...r,
      category: r.category as SkillNode['category'],
      prerequisites: JSON.parse(r.prerequisites) as string[],
    }));
  }

  /** Get all skill tree edges. */
  getSkillEdges(): SkillEdge[] {
    return this.db.prepare('SELECT * FROM skill_edges').all() as SkillEdge[];
  }

  /** Get all unlocks for an agent. */
  getUnlocks(agentId: string): SkillUnlock[] {
    return this.db
      .prepare('SELECT * FROM skill_unlocks WHERE agent_id = ? ORDER BY unlocked_at')
      .all(agentId) as SkillUnlock[];
  }

  // ─── Prestige Operations ───────────────────────────────────────────────

  /** Execute a prestige transition for an agent. */
  prestigeTransition(agentId: string): PrestigeRecord {
    return this.db.transaction(() => {
      const profile = this.getProfile(agentId);
      if (!profile) throw new Error(`Profile not found: ${agentId}`);

      if (profile.prestige_rank >= MAX_PRESTIGE_RANK) {
        throw new Error(`Already at maximum prestige rank (${MAX_PRESTIGE_RANK})`);
      }

      if (!isPrestigeEligible(profile.level, profile.prestige_rank, profile.lifetime_xp)) {
        throw new Error(
          `Not eligible for prestige. Requires higher level and lifetime XP.`,
        );
      }

      const unlockCount = this.db
        .prepare('SELECT COUNT(*) as cnt FROM skill_unlocks WHERE agent_id = ?')
        .get(agentId) as { cnt: number };

      const fromRank = profile.prestige_rank;
      const toRank = fromRank + 1;

      // Record the prestige
      this.db
        .prepare(
          `INSERT INTO prestige_records (agent_id, from_rank, to_rank, xp_at_prestige, level_at_prestige, unlocks_at_prestige, lifetime_xp_at_prestige)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          agentId,
          fromRank,
          toRank,
          profile.current_xp,
          profile.level,
          unlockCount.cnt,
          profile.lifetime_xp,
        );

      // Reset current XP and level, keep lifetime XP, increment prestige rank
      this.db
        .prepare(
          `UPDATE progression_profiles
           SET current_xp = 0, level = 1, prestige_rank = ?,
               updated_at = datetime('now')
           WHERE agent_id = ?`,
        )
        .run(toRank, agentId);

      // Clear skill unlocks (they reset on prestige)
      this.db.prepare('DELETE FROM skill_unlocks WHERE agent_id = ?').run(agentId);

      const record = this.db
        .prepare(
          `SELECT * FROM prestige_records WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1`,
        )
        .get(agentId) as PrestigeRecord;

      return record;
    })();
  }

  /** Get prestige history for an agent. */
  getPrestigeHistory(agentId: string): PrestigeRecord[] {
    return this.db
      .prepare('SELECT * FROM prestige_records WHERE agent_id = ? ORDER BY created_at DESC')
      .all(agentId) as PrestigeRecord[];
  }
}

export default { ProgressionStore };

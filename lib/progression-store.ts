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
  XpAttribution,
  SkillNodeLayout,
  SkillTreeValidation,
  ProgressionMilestone,
  MilestoneType,
} from './types/progression';
import {
  levelFromXp,
  diversificationMultiplier,
  diversificationScore,
  isValidSourceCategory,
  isPrestigeEligible,
  MAX_PRESTIGE_RANK,
  getDefaultSkillTree,
  validateSkillTree,
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


-- Phase 2: Skill node visual layout positions
CREATE TABLE IF NOT EXISTS skill_node_layouts (
  node_id            TEXT PRIMARY KEY,
  x                  REAL NOT NULL DEFAULT 0,
  y                  REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (node_id) REFERENCES skill_nodes(node_id)
);

-- Phase 2: Progression milestones feed
CREATE TABLE IF NOT EXISTS progression_milestones (
  id                 TEXT PRIMARY KEY,
  agent_id           TEXT NOT NULL,
  type               TEXT NOT NULL,
  title              TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  metadata           TEXT NOT NULL DEFAULT '{}',
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indices for common queries
CREATE INDEX IF NOT EXISTS idx_xp_events_agent      ON xp_events(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_xp_events_category   ON xp_events(agent_id, source_category);
CREATE INDEX IF NOT EXISTS idx_skill_unlocks_agent   ON skill_unlocks(agent_id);
CREATE INDEX IF NOT EXISTS idx_prestige_agent        ON prestige_records(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_milestones_agent      ON progression_milestones(agent_id, created_at DESC);
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

  // ─── Phase 2: Skill Tree Admin (Issue #207) ─────────────────────────────

  upsertSkillNode(nodeId: string, name: string, description: string, category: string, xpCost: number, tier: number, prerequisites: string[]): SkillNode {
    this.db.prepare(
      `INSERT INTO skill_nodes (node_id, name, description, category, xp_cost, tier, prerequisites)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(node_id) DO UPDATE SET name=excluded.name, description=excluded.description,
         category=excluded.category, xp_cost=excluded.xp_cost, tier=excluded.tier, prerequisites=excluded.prerequisites`
    ).run(nodeId, name, description, category, xpCost, tier, JSON.stringify(prerequisites));
    this.db.prepare('DELETE FROM skill_edges WHERE to_node_id = ?').run(nodeId);
    const ins = this.db.prepare('INSERT OR IGNORE INTO skill_edges (from_node_id, to_node_id) VALUES (?, ?)');
    for (const p of prerequisites) ins.run(p, nodeId);
    const row = this.db.prepare('SELECT * FROM skill_nodes WHERE node_id = ?').get(nodeId) as any;
    return { ...row, category: row.category as SkillNode['category'], prerequisites: JSON.parse(row.prerequisites) as string[] };
  }

  deleteSkillNode(nodeId: string): boolean {
    return this.db.transaction(() => {
      const deps = this.db.prepare('SELECT to_node_id FROM skill_edges WHERE from_node_id = ?').all(nodeId) as Array<{ to_node_id: string }>;
      if (deps.length > 0) throw new Error(`Cannot delete "${nodeId}": prerequisite for ${deps.map((d: any) => d.to_node_id).join(', ')}`);
      this.db.prepare('DELETE FROM skill_edges WHERE to_node_id = ?').run(nodeId);
      this.db.prepare('DELETE FROM skill_node_layouts WHERE node_id = ?').run(nodeId);
      this.db.prepare('DELETE FROM skill_unlocks WHERE node_id = ?').run(nodeId);
      return this.db.prepare('DELETE FROM skill_nodes WHERE node_id = ?').run(nodeId).changes > 0;
    })();
  }

  validateTree(): SkillTreeValidation {
    return validateSkillTree(this.getSkillNodes(), this.getSkillEdges());
  }

  getNodeLayouts(): SkillNodeLayout[] {
    return this.db.prepare('SELECT * FROM skill_node_layouts').all() as SkillNodeLayout[];
  }

  saveNodeLayouts(layouts: SkillNodeLayout[]): void {
    const upsert = this.db.prepare(
      'INSERT INTO skill_node_layouts (node_id, x, y) VALUES (?, ?, ?) ON CONFLICT(node_id) DO UPDATE SET x=excluded.x, y=excluded.y'
    );
    this.db.transaction(() => { for (const l of layouts) upsert.run(l.node_id, l.x, l.y); })();
  }

  exportTree(): { nodes: Array<SkillNode & { x?: number; y?: number }>; edges: SkillEdge[] } {
    const nodes = this.getSkillNodes();
    const edges = this.getSkillEdges();
    const layoutMap = new Map(this.getNodeLayouts().map((l: SkillNodeLayout) => [l.node_id, l]));
    return {
      nodes: nodes.map((n: SkillNode) => { const l = layoutMap.get(n.node_id); return l ? { ...n, x: l.x, y: l.y } : n; }),
      edges,
    };
  }

  importTree(def: { nodes: Array<SkillNode & { x?: number; y?: number }>; edges: SkillEdge[] }): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM skill_node_layouts').run();
      this.db.prepare('DELETE FROM skill_edges').run();
      this.db.prepare('DELETE FROM skill_nodes').run();
      const insN = this.db.prepare('INSERT INTO skill_nodes (node_id,name,description,category,xp_cost,tier,prerequisites) VALUES (?,?,?,?,?,?,?)');
      const insE = this.db.prepare('INSERT INTO skill_edges (from_node_id,to_node_id) VALUES (?,?)');
      const insL = this.db.prepare('INSERT INTO skill_node_layouts (node_id,x,y) VALUES (?,?,?)');
      for (const n of def.nodes) {
        insN.run(n.node_id, n.name, n.description, n.category, n.xp_cost, n.tier, JSON.stringify(n.prerequisites));
        if (n.x != null && n.y != null) insL.run(n.node_id, n.x, n.y);
      }
      for (const e of def.edges) insE.run(e.from_node_id, e.to_node_id);
    })();
  }

  getXpAttribution(agentId: string): XpAttribution[] {
    return this.db.prepare(
      `SELECT source_category, SUM(raw_xp) as total_raw_xp, SUM(effective_xp) as total_effective_xp,
              COUNT(*) as event_count, AVG(diversification_multiplier) as avg_multiplier
       FROM xp_events WHERE agent_id = ? GROUP BY source_category ORDER BY total_effective_xp DESC`
    ).all(agentId) as XpAttribution[];
  }

  getGlobalXpAttribution(): XpAttribution[] {
    return this.db.prepare(
      `SELECT source_category, SUM(raw_xp) as total_raw_xp, SUM(effective_xp) as total_effective_xp,
              COUNT(*) as event_count, AVG(diversification_multiplier) as avg_multiplier
       FROM xp_events GROUP BY source_category ORDER BY total_effective_xp DESC`
    ).all() as XpAttribution[];
  }

  getXpHistory(agentId: string, days: number = 30): Array<{ date: string; total_xp: number; event_count: number }> {
    return this.db.prepare(
      `SELECT DATE(created_at) as date, SUM(effective_xp) as total_xp, COUNT(*) as event_count
       FROM xp_events WHERE agent_id = ? AND created_at >= datetime('now', ? || ' days')
       GROUP BY DATE(created_at) ORDER BY date`
    ).all(agentId, -days) as any[];
  }

  recordMilestone(agentId: string, type: MilestoneType, title: string, description: string, metadata?: Record<string, unknown>): ProgressionMilestone {
    const id = crypto.randomUUID();
    this.db.prepare(
      'INSERT INTO progression_milestones (id, agent_id, type, title, description, metadata) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, agentId, type, title, description, JSON.stringify(metadata ?? {}));
    return this.db.prepare('SELECT * FROM progression_milestones WHERE id = ?').get(id) as ProgressionMilestone;
  }

  getRecentMilestones(limit: number = 20): ProgressionMilestone[] {
    return this.db.prepare('SELECT * FROM progression_milestones ORDER BY created_at DESC LIMIT ?').all(limit) as ProgressionMilestone[];
  }


  unlockSkill(agentId: string, nodeId: string): SkillUnlock {
    return this.db.transaction(() => {
      const profile = this.getProfile(agentId);
      if (!profile) throw new Error(`Profile not found: ${agentId}`);
      const node = this.db.prepare('SELECT * FROM skill_nodes WHERE node_id = ?').get(nodeId) as any;
      if (!node) throw new Error(`Skill node not found: ${nodeId}`);
      if (this.db.prepare('SELECT 1 FROM skill_unlocks WHERE agent_id = ? AND node_id = ?').get(agentId, nodeId))
        throw new Error(`Already unlocked: ${nodeId}`);
      const prereqs = JSON.parse(node.prerequisites) as string[];
      for (const p of prereqs) {
        if (!this.db.prepare('SELECT 1 FROM skill_unlocks WHERE agent_id = ? AND node_id = ?').get(agentId, p))
          throw new Error(`Prerequisite "${p}" not unlocked`);
      }
      if (profile.current_xp < node.xp_cost)
        throw new Error(`Insufficient XP: need ${node.xp_cost}, have ${profile.current_xp}`);
      this.db.prepare("UPDATE progression_profiles SET current_xp = current_xp - ?, updated_at = datetime('now') WHERE agent_id = ?").run(node.xp_cost, agentId);
      this.db.prepare('INSERT INTO skill_unlocks (agent_id, node_id, prestige_rank_at_unlock) VALUES (?, ?, ?)').run(agentId, nodeId, profile.prestige_rank);
      this.recordMilestone(agentId, 'skill_unlock', `Unlocked: ${node.name}`, `${profile.display_name} unlocked "${node.name}" for ${node.xp_cost} XP`, { node_id: nodeId, xp_cost: node.xp_cost });
      return this.db.prepare('SELECT * FROM skill_unlocks WHERE agent_id = ? AND node_id = ?').get(agentId, nodeId) as SkillUnlock;
    })();
  }
}

export default { ProgressionStore };

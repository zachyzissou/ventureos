/**
 * Progression System TypeScript Interfaces — VentureOS Phase 4.5
 *
 * Type contracts for the deep progression system: profiles, skill trees,
 * XP events, prestige ranks, and API request/response shapes.
 *
 * Issue #203 — Phase 4.5 Deep Progression System (Phase 1 foundation)
 */

// ─── Progression Profiles ───────────────────────────────────────────────────

/** A progression profile for an agent. */
export interface ProgressionProfile {
  agent_id: string;
  display_name: string;
  /** Current XP total (post-prestige resets). */
  current_xp: number;
  /** Lifetime XP accumulated across all prestige cycles. */
  lifetime_xp: number;
  /** Current level derived from XP thresholds. */
  level: number;
  /** Current prestige rank (0 = no prestige). */
  prestige_rank: number;
  /** Number of distinct XP source categories contributed. */
  diversification_score: number;
  created_at: string;
  updated_at: string;
}

// ─── Skill Tree ─────────────────────────────────────────────────────────────

/** Skill categories for grouping nodes. */
export type SkillCategory =
  | 'engineering'
  | 'operations'
  | 'analysis'
  | 'communication'
  | 'strategy';

/** A node in the skill tree. */
export interface SkillNode {
  node_id: string;
  name: string;
  description: string;
  category: SkillCategory;
  /** XP cost to unlock this node. */
  xp_cost: number;
  /** Tier within its category (1 = entry, higher = advanced). */
  tier: number;
  /** Prerequisite node IDs (all must be unlocked). */
  prerequisites: string[];
}

/** An edge in the skill tree (prerequisite relationship). */
export interface SkillEdge {
  from_node_id: string;
  to_node_id: string;
}

/** An agent's unlock state for a single skill node. */
export interface SkillUnlock {
  agent_id: string;
  node_id: string;
  unlocked_at: string;
  /** Prestige rank at time of unlock (resets on prestige). */
  prestige_rank_at_unlock: number;
}

// ─── XP Events ──────────────────────────────────────────────────────────────

/** Valid XP source categories for diversification tracking. */
export type XpSourceCategory =
  | 'mission_completion'
  | 'code_review'
  | 'documentation'
  | 'bug_fix'
  | 'deployment'
  | 'collaboration'
  | 'research'
  | 'testing'
  | 'observability'
  | 'security';

/** An XP event in the ledger. */
export interface XpEvent {
  event_id: string;
  agent_id: string;
  /** Raw XP amount before diversification weighting. */
  raw_xp: number;
  /** Effective XP after diversification weighting. */
  effective_xp: number;
  /** Source category for diversification tracking. */
  source_category: XpSourceCategory;
  /** Free-text description of what triggered the XP. */
  source_description: string;
  /** Diversification multiplier applied (1.0 = baseline). */
  diversification_multiplier: number;
  created_at: string;
}

// ─── Prestige ───────────────────────────────────────────────────────────────

/** Metadata for a prestige transition. */
export interface PrestigeRecord {
  id: number;
  agent_id: string;
  /** Prestige rank transitioned FROM. */
  from_rank: number;
  /** Prestige rank transitioned TO. */
  to_rank: number;
  /** XP at the moment of prestige (before reset). */
  xp_at_prestige: number;
  /** Level at the moment of prestige. */
  level_at_prestige: number;
  /** Number of skill unlocks at prestige. */
  unlocks_at_prestige: number;
  /** Lifetime XP at prestige. */
  lifetime_xp_at_prestige: number;
  created_at: string;
}

// ─── API Request/Response Shapes ────────────────────────────────────────────

/** POST /api/rpg/progression/events — ingest an XP event. */
export interface IngestXpEventRequest {
  agent_id: string;
  raw_xp: number;
  source_category: XpSourceCategory;
  source_description: string;
}

/** Response for XP event ingestion. */
export interface IngestXpEventResponse {
  ok: true;
  event: XpEvent;
  profile: ProgressionProfile;
  level_up: boolean;
}

/** GET /api/rpg/progression/:agentId — full profile + tree state. */
export interface ProgressionProfileResponse {
  profile: ProgressionProfile;
  unlocks: SkillUnlock[];
  skill_tree: {
    nodes: SkillNode[];
    edges: SkillEdge[];
  };
  recent_events: XpEvent[];
  prestige_history: PrestigeRecord[];
  next_level: {
    xp_required: number;
    xp_remaining: number;
    progress_pct: number;
  };
  prestige_eligible: boolean;
}

/** GET /api/rpg/progression/summary — dashboard summary cards. */
export interface ProgressionSummaryResponse {
  profiles: Array<{
    agent_id: string;
    display_name: string;
    level: number;
    current_xp: number;
    prestige_rank: number;
    diversification_score: number;
    next_level_pct: number;
  }>;
  total_xp_today: number;
  total_events_today: number;
  top_categories: Array<{ category: string; count: number }>;
}

/** POST /api/rpg/progression/prestige — trigger prestige transition. */
export interface PrestigeRequest {
  agent_id: string;
}

/** Response for prestige transition. */
export interface PrestigeResponse {
  ok: true;
  record: PrestigeRecord;
  profile: ProgressionProfile;
}

// ─── Phase 2: Skill Tree UI & Progression Polish (#207) ─────────────────────

/** Unlock state for a single node in an annotated skill tree. */
export type SkillNodeStatus = 'locked' | 'available' | 'unlocked';

/** A skill node annotated with its current unlock state for a specific agent. */
export interface AnnotatedSkillNode extends SkillNode {
  status: SkillNodeStatus;
  /** True when the agent can afford this node's XP cost (meaningful when status='available'). */
  affordable: boolean;
}

/** GET /api/rpg/progression/skill-tree/:agentId — annotated skill tree. */
export interface SkillTreeStateResponse {
  agent_id: string;
  current_xp: number;
  nodes: AnnotatedSkillNode[];
  edges: SkillEdge[];
  unlocked_count: number;
  total_count: number;
}

/** POST /api/rpg/progression/skills/unlock — unlock a skill node. */
export interface UnlockSkillRequest {
  agent_id: string;
  node_id: string;
}

/** Response for skill unlock. */
export interface UnlockSkillResponse {
  ok: true;
  unlock: SkillUnlock;
  profile: ProgressionProfile;
  node: AnnotatedSkillNode;
}

/** GET /api/rpg/progression/leaderboard — ranked agents. */
export interface LeaderboardEntry {
  rank: number;
  agent_id: string;
  display_name: string;
  level: number;
  current_xp: number;
  lifetime_xp: number;
  prestige_rank: number;
  unlocked_skills: number;
  diversification_score: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  total_agents: number;
}

/** Handler options matching the existing pattern. */
export interface ProgressionHandlerOptions {
  dbPath: string;
}

/** Error response shape. */
export interface ProgressionErrorResponse {
  ok: false;
  error: string;
}

// ─── Phase 2 Types (Issue #207) ─────────────────────────────────────────────

/** Visual position of a skill node in the tree editor. */
export interface SkillNodeLayout {
  node_id: string;
  x: number;
  y: number;
}

/** Result of skill tree graph validation. */
export interface SkillTreeValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** XP attribution breakdown by source category. */
export interface XpAttribution {
  source_category: string;
  total_raw_xp: number;
  total_effective_xp: number;
  event_count: number;
  avg_multiplier: number;
}

/** Prestige simulation preview (non-destructive). */
export interface PrestigeSimulation {
  agent_id: string;
  current_rank: number;
  next_rank: number;
  eligible: boolean;
  preview: {
    xp_reset_from: number;
    level_reset_from: number;
    unlocks_lost: number;
    lifetime_xp_kept: number;
    level_requirement: number;
    xp_requirement: number;
  };
}

/** Types of progression milestones. */
export type MilestoneType = 'level_up' | 'skill_unlock' | 'prestige' | 'diversification';

/** A progression milestone event. */
export interface ProgressionMilestone {
  id: string;
  agent_id: string;
  type: MilestoneType;
  title: string;
  description: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

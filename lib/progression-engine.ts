/**
 * Progression Engine — VentureOS Phase 4.5
 *
 * Deterministic progression math: XP accumulation, diversification weighting,
 * level/rank thresholds, and prestige transition rules.
 *
 * All formulas are pure functions with no side effects for easy testing.
 *
 * Issue #203 — Phase 4.5 Deep Progression System (Phase 1 foundation)
 */

import type {
  XpSourceCategory,
  SkillNode,
  SkillCategory,
  SkillEdge,
} from './types/progression';

// ─── Level Thresholds ───────────────────────────────────────────────────────

/**
 * XP required to reach a given level (1-indexed).
 * Uses a quadratic curve: level N requires 100 * N^1.5 cumulative XP.
 *
 * Level 1: 0 XP (starting level)
 * Level 2: 100 XP
 * Level 3: ~283 XP
 * Level 10: ~3162 XP
 * Level 20: ~8944 XP
 * Level 50: ~35355 XP
 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(100 * Math.pow(level - 1, 1.5));
}

/**
 * Derive the current level from cumulative XP.
 * Scans from level 1 upward until XP is insufficient for the next level.
 */
export function levelFromXp(xp: number): number {
  if (xp < 0) return 1;
  let level = 1;
  while (xpForLevel(level + 1) <= xp) {
    level++;
    // Safety cap to prevent infinite loops
    if (level >= 999) break;
  }
  return level;
}

/**
 * Progress toward the next level, as a fraction 0..1.
 */
export function levelProgress(xp: number): { xp_required: number; xp_remaining: number; progress_pct: number } {
  const currentLevel = levelFromXp(xp);
  const currentThreshold = xpForLevel(currentLevel);
  const nextThreshold = xpForLevel(currentLevel + 1);
  const xpRequired = nextThreshold - currentThreshold;
  const xpIntoLevel = xp - currentThreshold;
  const xpRemaining = nextThreshold - xp;
  const progressPct = xpRequired > 0 ? Math.min(100, Math.round((xpIntoLevel / xpRequired) * 100)) : 100;
  return { xp_required: xpRequired, xp_remaining: xpRemaining, progress_pct: progressPct };
}

// ─── Diversification Weighting ──────────────────────────────────────────────

/**
 * All valid XP source categories.
 */
export const XP_SOURCE_CATEGORIES: readonly XpSourceCategory[] = [
  'mission_completion',
  'code_review',
  'documentation',
  'bug_fix',
  'deployment',
  'collaboration',
  'research',
  'testing',
  'observability',
  'security',
] as const;

/**
 * Validate that a string is a valid XP source category.
 */
export function isValidSourceCategory(s: string): s is XpSourceCategory {
  return (XP_SOURCE_CATEGORIES as readonly string[]).includes(s);
}

/**
 * Calculate diversification multiplier based on recent event distribution.
 *
 * The multiplier rewards agents who earn XP across diverse categories:
 * - If all recent events come from 1 category → multiplier = 0.5 (penalty)
 * - If events come from 2-3 categories → multiplier = 0.8-1.0 (neutral)
 * - If events come from 4-6 categories → multiplier = 1.0-1.3 (bonus)
 * - If events come from 7+ categories → multiplier = 1.3-1.5 (strong bonus)
 *
 * @param recentCategoryCounts Map of category → count for recent events
 * @returns Multiplier to apply to raw XP (0.5 to 1.5)
 */
export function diversificationMultiplier(
  recentCategoryCounts: Record<string, number>,
): number {
  const categories = Object.keys(recentCategoryCounts).filter(
    (k) => (recentCategoryCounts[k] ?? 0) > 0,
  );
  const uniqueCount = categories.length;

  if (uniqueCount <= 0) return 1.0; // No history → neutral
  if (uniqueCount === 1) return 0.5; // Pure volume farming → penalty
  if (uniqueCount <= 3) return 0.5 + (uniqueCount / 3) * 0.5; // 0.5 → 1.0
  if (uniqueCount <= 6) return 1.0 + ((uniqueCount - 3) / 3) * 0.3; // 1.0 → 1.3
  return Math.min(1.5, 1.3 + ((uniqueCount - 6) / 4) * 0.2); // 1.3 → 1.5 (capped)
}

/**
 * Calculate a diversification score (0-100) from category counts.
 * Uses Shannon entropy normalized by max possible entropy.
 */
export function diversificationScore(
  recentCategoryCounts: Record<string, number>,
): number {
  const counts = Object.values(recentCategoryCounts).filter((c) => c > 0);
  if (counts.length <= 1) return 0;

  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;

  // Shannon entropy
  let entropy = 0;
  for (const count of counts) {
    const p = count / total;
    if (p > 0) entropy -= p * Math.log2(p);
  }

  // Normalize by max entropy (log2 of number of possible categories)
  const maxEntropy = Math.log2(XP_SOURCE_CATEGORIES.length);
  const normalized = maxEntropy > 0 ? entropy / maxEntropy : 0;

  return Math.round(normalized * 100);
}

// ─── Prestige ───────────────────────────────────────────────────────────────

/**
 * Minimum level required to prestige at each rank.
 * Rank 0→1 requires level 20, rank 1→2 requires level 25, etc.
 */
export function prestigeLevelRequirement(currentRank: number): number {
  return 20 + currentRank * 5;
}

/**
 * Minimum lifetime XP required to prestige at each rank.
 */
export function prestigeXpRequirement(currentRank: number): number {
  return xpForLevel(prestigeLevelRequirement(currentRank));
}

/**
 * Check if an agent is eligible for prestige transition.
 */
export function isPrestigeEligible(
  level: number,
  currentRank: number,
  lifetimeXp: number,
): boolean {
  const reqLevel = prestigeLevelRequirement(currentRank);
  const reqXp = prestigeXpRequirement(currentRank);
  return level >= reqLevel && lifetimeXp >= reqXp;
}

/**
 * Maximum prestige rank (soft cap).
 */
export const MAX_PRESTIGE_RANK = 10;

// ─── Default Skill Tree ────────────────────────────────────────────────────

/**
 * Default skill tree nodes for the Phase 1 foundation.
 * Each category has 3 tiers of nodes.
 */
export function getDefaultSkillTree(): { nodes: SkillNode[]; edges: SkillEdge[] } {
  const nodes: SkillNode[] = [
    // Engineering
    { node_id: 'eng-1', name: 'Code Foundations', description: 'Basic code contribution proficiency', category: 'engineering', xp_cost: 100, tier: 1, prerequisites: [] },
    { node_id: 'eng-2', name: 'Architecture', description: 'System design and architecture skills', category: 'engineering', xp_cost: 300, tier: 2, prerequisites: ['eng-1'] },
    { node_id: 'eng-3', name: 'Mastery', description: 'Engineering mastery across complex systems', category: 'engineering', xp_cost: 800, tier: 3, prerequisites: ['eng-2'] },

    // Operations
    { node_id: 'ops-1', name: 'Deployment Basics', description: 'CI/CD and deployment fundamentals', category: 'operations', xp_cost: 100, tier: 1, prerequisites: [] },
    { node_id: 'ops-2', name: 'Reliability', description: 'SRE practices and incident response', category: 'operations', xp_cost: 300, tier: 2, prerequisites: ['ops-1'] },
    { node_id: 'ops-3', name: 'Orchestration', description: 'Complex multi-system orchestration', category: 'operations', xp_cost: 800, tier: 3, prerequisites: ['ops-2'] },

    // Analysis
    { node_id: 'ana-1', name: 'Data Literacy', description: 'Basic data analysis and interpretation', category: 'analysis', xp_cost: 100, tier: 1, prerequisites: [] },
    { node_id: 'ana-2', name: 'Insight Mining', description: 'Pattern recognition and deep analysis', category: 'analysis', xp_cost: 300, tier: 2, prerequisites: ['ana-1'] },
    { node_id: 'ana-3', name: 'Predictive Models', description: 'Advanced predictive analysis capabilities', category: 'analysis', xp_cost: 800, tier: 3, prerequisites: ['ana-2'] },

    // Communication
    { node_id: 'com-1', name: 'Clear Reporting', description: 'Effective status and progress reporting', category: 'communication', xp_cost: 100, tier: 1, prerequisites: [] },
    { node_id: 'com-2', name: 'Documentation', description: 'Comprehensive documentation authoring', category: 'communication', xp_cost: 300, tier: 2, prerequisites: ['com-1'] },
    { node_id: 'com-3', name: 'Knowledge Synthesis', description: 'Cross-domain knowledge synthesis and teaching', category: 'communication', xp_cost: 800, tier: 3, prerequisites: ['com-2'] },

    // Strategy
    { node_id: 'str-1', name: 'Task Planning', description: 'Basic task breakdown and prioritization', category: 'strategy', xp_cost: 100, tier: 1, prerequisites: [] },
    { node_id: 'str-2', name: 'Mission Design', description: 'Complex mission architecture and coordination', category: 'strategy', xp_cost: 300, tier: 2, prerequisites: ['str-1'] },
    { node_id: 'str-3', name: 'Strategic Vision', description: 'Long-term strategic planning and roadmap design', category: 'strategy', xp_cost: 800, tier: 3, prerequisites: ['str-2'] },
  ];

  const edges: SkillEdge[] = [];
  for (const node of nodes) {
    for (const prereq of node.prerequisites) {
      edges.push({ from_node_id: prereq, to_node_id: node.node_id });
    }
  }

  return { nodes, edges };
}

// ─── Phase 2: Graph Validation & Simulation (Issue #207) ────────────────────

export function detectCycles(edges: Array<{ from_node_id: string; to_node_id: string }>): string[] {
  const adj = new Map<string, string[]>();
  const allNodes = new Set<string>();
  for (const e of edges) {
    allNodes.add(e.from_node_id);
    allNodes.add(e.to_node_id);
    if (!adj.has(e.from_node_id)) adj.set(e.from_node_id, []);
    adj.get(e.from_node_id)!.push(e.to_node_id);
  }
  const white = new Set(allNodes);
  const gray = new Set<string>();
  const parent = new Map<string, string>();
  for (const start of allNodes) {
    if (!white.has(start)) continue;
    const stack: string[] = [start];
    while (stack.length > 0) {
      const node = stack[stack.length - 1]!;
      if (white.has(node)) {
        white.delete(node);
        gray.add(node);
        for (const neighbor of adj.get(node) ?? []) {
          if (gray.has(neighbor)) {
            const cycle = [neighbor, node];
            let cur = node;
            while (cur !== neighbor && parent.has(cur)) { cur = parent.get(cur)!; cycle.push(cur); }
            return cycle.reverse();
          }
          if (white.has(neighbor)) { parent.set(neighbor, node); stack.push(neighbor); }
        }
      } else {
        stack.pop();
        gray.delete(node);
      }
    }
  }
  return [];
}

export function findOrphanNodes(
  nodes: Array<{ node_id: string; tier: number; prerequisites: string[] }>,
  edges: Array<{ from_node_id: string; to_node_id: string }>,
): string[] {
  const connected = new Set<string>();
  for (const e of edges) { connected.add(e.from_node_id); connected.add(e.to_node_id); }
  return nodes.filter(n => n.tier > 1 && !connected.has(n.node_id) && n.prerequisites.length === 0).map(n => n.node_id);
}

export function validateSkillTree(
  nodes: Array<{ node_id: string; name: string; tier: number; xp_cost: number; prerequisites: string[] }>,
  edges: Array<{ from_node_id: string; to_node_id: string }>,
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodeIds = new Set(nodes.map(n => n.node_id));
  if (nodeIds.size !== nodes.length) errors.push('Duplicate node IDs detected');
  for (const node of nodes) {
    for (const prereq of node.prerequisites) {
      if (!nodeIds.has(prereq)) errors.push('Node "' + node.node_id + '" references unknown prerequisite "' + prereq + '"');
    }
  }
  for (const edge of edges) {
    if (!nodeIds.has(edge.from_node_id)) errors.push('Edge references unknown node "' + edge.from_node_id + '"');
    if (!nodeIds.has(edge.to_node_id)) errors.push('Edge references unknown node "' + edge.to_node_id + '"');
  }
  const cycle = detectCycles(edges);
  if (cycle.length > 0) errors.push('Cycle detected: ' + cycle.join(' -> '));
  const orphans = findOrphanNodes(nodes, edges);
  if (orphans.length > 0) warnings.push('Orphan nodes (tier>1, no connections): ' + orphans.join(', '));
  for (const node of nodes) {
    if (node.xp_cost <= 0) errors.push('Node "' + node.node_id + '" has non-positive XP cost (' + node.xp_cost + ')');
    if (node.xp_cost > 100000) warnings.push('Node "' + node.node_id + '" has very high XP cost (' + node.xp_cost + ')');
  }
  return { valid: errors.length === 0, errors, warnings };
}

export type SkillNodeState = 'locked' | 'unlockable' | 'unlocked' | 'maxed';

export function getNodeState(
  nodeId: string,
  node: { prerequisites: string[]; tier: number },
  unlockedIds: Set<string>,
): SkillNodeState {
  if (unlockedIds.has(nodeId)) return 'unlocked';
  if (node.tier === 1 && node.prerequisites.length === 0) return 'unlockable';
  if (node.prerequisites.length > 0 && node.prerequisites.every(p => unlockedIds.has(p))) return 'unlockable';
  return 'locked';
}

export function simulatePrestige(
  profile: { current_xp: number; lifetime_xp: number; level: number; prestige_rank: number },
  unlockCount: number,
) {
  const nextRank = profile.prestige_rank + 1;
  const levelReq = prestigeLevelRequirement(profile.prestige_rank);
  const xpReq = prestigeXpRequirement(profile.prestige_rank);
  const eligible = nextRank <= MAX_PRESTIGE_RANK && isPrestigeEligible(profile.level, profile.prestige_rank, profile.lifetime_xp);
  return {
    eligible,
    next_rank: nextRank,
    preview: {
      xp_reset_from: profile.current_xp,
      level_reset_from: profile.level,
      unlocks_lost: unlockCount,
      lifetime_xp_kept: profile.lifetime_xp,
      level_requirement: levelReq,
      xp_requirement: xpReq,
    },
  };
}

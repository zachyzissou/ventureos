/**
 * Progression Engine — Unit Tests
 *
 * Tests for deterministic XP accumulation, diversification weighting,
 * level thresholds, and prestige transition rules.
 *
 * Issue #203 — Phase 4.5 Deep Progression System (Phase 1 foundation)
 */

import {
  xpForLevel,
  levelFromXp,
  levelProgress,
  diversificationMultiplier,
  diversificationScore,
  isPrestigeEligible,
  prestigeLevelRequirement,
  prestigeXpRequirement,
  isValidSourceCategory,
  getDefaultSkillTree,
  XP_SOURCE_CATEGORIES,
  MAX_PRESTIGE_RANK,
} from '../progression-engine';

// ─── Level Thresholds ───────────────────────────────────────────────────────

describe('xpForLevel', () => {
  it('returns 0 for level 1', () => {
    expect(xpForLevel(1)).toBe(0);
  });

  it('returns 0 for level 0 and negative', () => {
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(-5)).toBe(0);
  });

  it('returns 100 for level 2', () => {
    expect(xpForLevel(2)).toBe(100);
  });

  it('is monotonically increasing', () => {
    let prev = 0;
    for (let i = 1; i <= 50; i++) {
      const curr = xpForLevel(i);
      expect(curr).toBeGreaterThanOrEqual(prev);
      prev = curr;
    }
  });

  it('produces expected values for sample levels', () => {
    expect(xpForLevel(10)).toBeGreaterThan(2000);
    expect(xpForLevel(20)).toBeGreaterThan(8000);
    expect(xpForLevel(50)).toBeGreaterThan(30000);
  });
});

describe('levelFromXp', () => {
  it('returns 1 for 0 XP', () => {
    expect(levelFromXp(0)).toBe(1);
  });

  it('returns 1 for negative XP', () => {
    expect(levelFromXp(-100)).toBe(1);
  });

  it('returns 2 for exactly 100 XP', () => {
    expect(levelFromXp(100)).toBe(2);
  });

  it('returns correct level for 99 XP (still level 1)', () => {
    expect(levelFromXp(99)).toBe(1);
  });

  it('is consistent with xpForLevel', () => {
    for (let lvl = 1; lvl <= 30; lvl++) {
      const xp = xpForLevel(lvl);
      expect(levelFromXp(xp)).toBe(lvl);
    }
  });

  it('handles large XP values', () => {
    expect(levelFromXp(1000000)).toBeGreaterThan(50);
  });
});

describe('levelProgress', () => {
  it('returns 0% for start of level', () => {
    const progress = levelProgress(0);
    expect(progress.progress_pct).toBe(0);
  });

  it('returns correct remaining XP', () => {
    const progress = levelProgress(50);
    expect(progress.xp_remaining).toBe(50); // Need 100 for level 2, have 50
  });

  it('returns 100% or close when about to level up', () => {
    const threshold = xpForLevel(3);
    const progress = levelProgress(threshold - 1);
    expect(progress.progress_pct).toBeGreaterThan(90);
  });
});

// ─── Diversification Weighting ──────────────────────────────────────────────

describe('diversificationMultiplier', () => {
  it('returns 1.0 for empty history', () => {
    expect(diversificationMultiplier({})).toBe(1.0);
  });

  it('returns 0.5 for single category (volume farming penalty)', () => {
    expect(diversificationMultiplier({ mission_completion: 50 })).toBe(0.5);
  });

  it('returns > 0.5 for 2 categories', () => {
    const mult = diversificationMultiplier({ mission_completion: 10, code_review: 5 });
    expect(mult).toBeGreaterThan(0.5);
    expect(mult).toBeLessThanOrEqual(1.0);
  });

  it('returns >= 1.0 for 4+ categories (diversification bonus)', () => {
    const mult = diversificationMultiplier({
      mission_completion: 5,
      code_review: 5,
      documentation: 5,
      bug_fix: 5,
    });
    expect(mult).toBeGreaterThanOrEqual(1.0);
  });

  it('returns <= 1.5 for many categories (capped)', () => {
    const counts: Record<string, number> = {};
    for (const cat of XP_SOURCE_CATEGORIES) {
      counts[cat] = 3;
    }
    const mult = diversificationMultiplier(counts);
    expect(mult).toBeLessThanOrEqual(1.5);
    expect(mult).toBeGreaterThanOrEqual(1.3);
  });

  it('ignores categories with 0 count', () => {
    const mult = diversificationMultiplier({
      mission_completion: 10,
      code_review: 0,
    });
    expect(mult).toBe(0.5); // Only 1 active category
  });
});

describe('diversificationScore', () => {
  it('returns 0 for empty or single category', () => {
    expect(diversificationScore({})).toBe(0);
    expect(diversificationScore({ mission_completion: 50 })).toBe(0);
  });

  it('returns > 0 for multiple categories', () => {
    expect(diversificationScore({ mission_completion: 5, code_review: 5 })).toBeGreaterThan(0);
  });

  it('returns higher score for more even distribution', () => {
    const skewed = diversificationScore({ mission_completion: 100, code_review: 1 });
    const even = diversificationScore({ mission_completion: 50, code_review: 50 });
    expect(even).toBeGreaterThan(skewed);
  });

  it('returns 0-100 range', () => {
    const counts: Record<string, number> = {};
    for (const cat of XP_SOURCE_CATEGORIES) {
      counts[cat] = 10;
    }
    const score = diversificationScore(counts);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ─── Prestige ───────────────────────────────────────────────────────────────

describe('isPrestigeEligible', () => {
  it('returns false at level 1', () => {
    expect(isPrestigeEligible(1, 0, 0)).toBe(false);
  });

  it('returns true at level 20 with enough XP for rank 0→1', () => {
    const reqXp = prestigeXpRequirement(0);
    expect(isPrestigeEligible(20, 0, reqXp)).toBe(true);
  });

  it('requires higher level for higher ranks', () => {
    expect(prestigeLevelRequirement(0)).toBe(20);
    expect(prestigeLevelRequirement(1)).toBe(25);
    expect(prestigeLevelRequirement(2)).toBe(30);
  });

  it('returns false when level is insufficient', () => {
    expect(isPrestigeEligible(19, 0, 999999)).toBe(false);
  });

  it('returns false when lifetime XP is insufficient', () => {
    expect(isPrestigeEligible(20, 0, 0)).toBe(false);
  });
});

describe('MAX_PRESTIGE_RANK', () => {
  it('is 10', () => {
    expect(MAX_PRESTIGE_RANK).toBe(10);
  });
});

// ─── Source Category Validation ─────────────────────────────────────────────

describe('isValidSourceCategory', () => {
  it('returns true for valid categories', () => {
    for (const cat of XP_SOURCE_CATEGORIES) {
      expect(isValidSourceCategory(cat)).toBe(true);
    }
  });

  it('returns false for invalid categories', () => {
    expect(isValidSourceCategory('invalid')).toBe(false);
    expect(isValidSourceCategory('')).toBe(false);
    expect(isValidSourceCategory('MISSION_COMPLETION')).toBe(false);
  });
});

// ─── Skill Tree ─────────────────────────────────────────────────────────────

describe('getDefaultSkillTree', () => {
  it('returns 15 nodes (3 per category × 5 categories)', () => {
    const tree = getDefaultSkillTree();
    expect(tree.nodes).toHaveLength(15);
  });

  it('returns edges matching prerequisites', () => {
    const tree = getDefaultSkillTree();
    expect(tree.edges.length).toBeGreaterThan(0);
    // Each tier 2+ node should have an edge from its prerequisite
    for (const edge of tree.edges) {
      const target = tree.nodes.find((n) => n.node_id === edge.to_node_id);
      expect(target).toBeDefined();
      expect(target!.prerequisites).toContain(edge.from_node_id);
    }
  });

  it('has valid categories', () => {
    const tree = getDefaultSkillTree();
    const validCats = ['engineering', 'operations', 'analysis', 'communication', 'strategy'];
    for (const node of tree.nodes) {
      expect(validCats).toContain(node.category);
    }
  });

  it('has tier 1 nodes with no prerequisites', () => {
    const tree = getDefaultSkillTree();
    const tier1 = tree.nodes.filter((n) => n.tier === 1);
    expect(tier1.length).toBe(5); // One per category
    for (const node of tier1) {
      expect(node.prerequisites).toHaveLength(0);
    }
  });
});

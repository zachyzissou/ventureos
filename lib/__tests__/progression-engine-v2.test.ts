/**
 * Phase 2 Engine Tests — Issue #207
 */
import {
  detectCycles,
  findOrphanNodes,
  validateSkillTree,
  getNodeState,
  simulatePrestige,
  getDefaultSkillTree,
  type SkillNodeState,
} from '../progression-engine';

describe('detectCycles', () => {
  it('returns empty for acyclic graph', () => {
    const edges = [
      { from_node_id: 'a', to_node_id: 'b' },
      { from_node_id: 'b', to_node_id: 'c' },
    ];
    expect(detectCycles(edges)).toEqual([]);
  });

  it('detects a simple cycle', () => {
    const edges = [
      { from_node_id: 'a', to_node_id: 'b' },
      { from_node_id: 'b', to_node_id: 'c' },
      { from_node_id: 'c', to_node_id: 'a' },
    ];
    const cycle = detectCycles(edges);
    expect(cycle.length).toBeGreaterThan(0);
  });

  it('returns empty for empty graph', () => {
    expect(detectCycles([])).toEqual([]);
  });

  it('detects self-loop', () => {
    const edges = [{ from_node_id: 'a', to_node_id: 'a' }];
    const cycle = detectCycles(edges);
    expect(cycle.length).toBeGreaterThan(0);
  });
});

describe('findOrphanNodes', () => {
  it('returns empty when all nodes are connected', () => {
    const nodes = [
      { node_id: 'a', tier: 1, prerequisites: [] },
      { node_id: 'b', tier: 2, prerequisites: ['a'] },
    ];
    const edges = [{ from_node_id: 'a', to_node_id: 'b' }];
    expect(findOrphanNodes(nodes, edges)).toEqual([]);
  });

  it('ignores tier-1 nodes', () => {
    const nodes = [{ node_id: 'a', tier: 1, prerequisites: [] }];
    const edges: Array<{ from_node_id: string; to_node_id: string }> = [];
    const orphans = findOrphanNodes(nodes, edges);
    expect(orphans).toEqual([]);
  });

  it('finds tier-2+ nodes with no connections or prerequisites', () => {
    const nodes = [
      { node_id: 'a', tier: 1, prerequisites: [] },
      { node_id: 'b', tier: 2, prerequisites: [] },
    ];
    const edges = [{ from_node_id: 'x', to_node_id: 'y' }]; // unrelated
    expect(findOrphanNodes(nodes, edges)).toContain('b');
  });
});

describe('validateSkillTree', () => {
  it('validates the default tree as valid', () => {
    const tree = getDefaultSkillTree();
    const result = validateSkillTree(tree.nodes, tree.edges);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reports missing prerequisite references', () => {
    const nodes = [{ node_id: 'a', name: 'A', tier: 1, xp_cost: 100, prerequisites: ['nonexistent'] }];
    const edges: Array<{ from_node_id: string; to_node_id: string }> = [];
    const result = validateSkillTree(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('nonexistent'))).toBe(true);
  });

  it('reports non-positive XP cost', () => {
    const nodes = [{ node_id: 'a', name: 'A', tier: 1, xp_cost: 0, prerequisites: [] }];
    const result = validateSkillTree(nodes, []);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('non-positive'))).toBe(true);
  });

  it('warns on very high XP cost', () => {
    const nodes = [{ node_id: 'a', name: 'A', tier: 1, xp_cost: 200000, prerequisites: [] }];
    const result = validateSkillTree(nodes, []);
    expect(result.valid).toBe(true); // warnings don't invalidate
    expect(result.warnings.some((w: string) => w.includes('very high'))).toBe(true);
  });

  it('reports cycles', () => {
    const nodes = [
      { node_id: 'a', name: 'A', tier: 1, xp_cost: 100, prerequisites: ['b'] },
      { node_id: 'b', name: 'B', tier: 1, xp_cost: 100, prerequisites: ['a'] },
    ];
    const edges = [
      { from_node_id: 'a', to_node_id: 'b' },
      { from_node_id: 'b', to_node_id: 'a' },
    ];
    const result = validateSkillTree(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('Cycle'))).toBe(true);
  });
});

describe('getNodeState', () => {
  it('returns "unlocked" for unlocked nodes', () => {
    expect(getNodeState('a', { prerequisites: [], tier: 1 }, new Set(['a']))).toBe('unlocked');
  });

  it('returns "unlockable" for tier-1 nodes with no prereqs', () => {
    expect(getNodeState('a', { prerequisites: [], tier: 1 }, new Set())).toBe('unlockable');
  });

  it('returns "unlockable" when all prereqs are met', () => {
    expect(getNodeState('b', { prerequisites: ['a'], tier: 2 }, new Set(['a']))).toBe('unlockable');
  });

  it('returns "locked" when prereqs are not met', () => {
    expect(getNodeState('b', { prerequisites: ['a'], tier: 2 }, new Set())).toBe('locked');
  });

  it('returns "locked" for tier-2 node with no prereqs defined but no connections', () => {
    expect(getNodeState('b', { prerequisites: [], tier: 2 }, new Set())).toBe('locked');
  });
});

describe('simulatePrestige', () => {
  it('shows ineligible for low-level agent', () => {
    const result = simulatePrestige({ current_xp: 50, lifetime_xp: 50, level: 2, prestige_rank: 0 }, 0);
    expect(result.eligible).toBe(false);
  });

  it('shows eligible for high-level agent', () => {
    const result = simulatePrestige({ current_xp: 100000, lifetime_xp: 100000, level: 25, prestige_rank: 0 }, 5);
    expect(result.eligible).toBe(true);
    expect(result.next_rank).toBe(1);
    expect(result.preview.unlocks_lost).toBe(5);
  });

  it('provides correct level and XP requirements', () => {
    const result = simulatePrestige({ current_xp: 0, lifetime_xp: 0, level: 1, prestige_rank: 0 }, 0);
    expect(result.preview.level_requirement).toBe(20);
  });
});

/**
 * Phase 2 Store Tests — Issue #207
 */
import fs from 'node:fs';
import path from 'node:path';
import { ProgressionStore } from '../progression-store';

const dbPath = path.join(__dirname, '__test_store_v2.db');
let store: ProgressionStore;

beforeEach(() => {
  try { fs.unlinkSync(dbPath); } catch {}
  store = new ProgressionStore(dbPath);
});

afterEach(() => {
  store.close();
  try { fs.unlinkSync(dbPath); } catch {}
});

describe('upsertSkillNode', () => {
  it('creates a new node', () => {
    const node = store.upsertSkillNode('test-1', 'Test Node', 'desc', 'engineering', 150, 1, []);
    expect(node.node_id).toBe('test-1');
    expect(node.name).toBe('Test Node');
    expect(node.xp_cost).toBe(150);
  });

  it('updates an existing node', () => {
    store.upsertSkillNode('eng-1', 'Updated', 'new desc', 'engineering', 200, 1, []);
    const nodes = store.getSkillNodes();
    const eng1 = nodes.find(n => n.node_id === 'eng-1');
    expect(eng1?.name).toBe('Updated');
    expect(eng1?.xp_cost).toBe(200);
  });

  it('creates edges for prerequisites', () => {
    store.upsertSkillNode('test-1', 'Test', 'desc', 'engineering', 100, 2, ['eng-1']);
    const edges = store.getSkillEdges();
    expect(edges.some(e => e.from_node_id === 'eng-1' && e.to_node_id === 'test-1')).toBe(true);
  });
});

describe('deleteSkillNode', () => {
  it('deletes a leaf node', () => {
    store.upsertSkillNode('leaf-1', 'Leaf', 'desc', 'engineering', 100, 1, []);
    expect(store.deleteSkillNode('leaf-1')).toBe(true);
  });

  it('refuses to delete a node with dependents', () => {
    expect(() => store.deleteSkillNode('eng-1')).toThrow(/prerequisite/i);
  });

  it('returns false for non-existent node', () => {
    expect(store.deleteSkillNode('nope')).toBe(false);
  });
});

describe('validateTree', () => {
  it('validates the default tree as valid', () => {
    const result = store.validateTree();
    expect(result.valid).toBe(true);
  });
});

describe('saveNodeLayouts / getNodeLayouts', () => {
  it('saves and retrieves layouts', () => {
    store.saveNodeLayouts([{ node_id: 'eng-1', x: 100, y: 200 }]);
    const layouts = store.getNodeLayouts();
    expect(layouts.length).toBe(1);
    expect(layouts[0].x).toBe(100);
    expect(layouts[0].y).toBe(200);
  });

  it('upserts on duplicate node_id', () => {
    store.saveNodeLayouts([{ node_id: 'eng-1', x: 100, y: 200 }]);
    store.saveNodeLayouts([{ node_id: 'eng-1', x: 300, y: 400 }]);
    const layouts = store.getNodeLayouts();
    expect(layouts.length).toBe(1);
    expect(layouts[0].x).toBe(300);
  });
});

describe('exportTree / importTree', () => {
  it('round-trips the tree', () => {
    const exported = store.exportTree();
    expect(exported.nodes.length).toBe(15);
    expect(exported.edges.length).toBe(10);
    store.importTree(exported);
    const re = store.exportTree();
    expect(re.nodes.length).toBe(15);
    expect(re.edges.length).toBe(10);
  });
});

describe('getXpAttribution', () => {
  it('returns attribution breakdown after events', () => {
    store.getOrCreateProfile('oracle');
    store.ingestXpEvent('oracle', 50, 'code_review', 'test');
    store.ingestXpEvent('oracle', 30, 'bug_fix', 'test');
    const attr = store.getXpAttribution('oracle');
    expect(attr.length).toBe(2);
    expect(attr.some((a: any) => a.source_category === 'code_review')).toBe(true);
  });

  it('returns empty for agent with no events', () => {
    expect(store.getXpAttribution('nobody')).toEqual([]);
  });
});

describe('getGlobalXpAttribution', () => {
  it('aggregates across agents', () => {
    store.getOrCreateProfile('oracle');
    store.getOrCreateProfile('echo');
    store.ingestXpEvent('oracle', 50, 'code_review', 'test');
    store.ingestXpEvent('echo', 30, 'code_review', 'test');
    const attr = store.getGlobalXpAttribution();
    expect(attr.length).toBeGreaterThan(0);
    const cr = attr.find((a: any) => a.source_category === 'code_review');
    expect(cr!.event_count).toBe(2);
  });
});

describe('getXpHistory', () => {
  it('returns daily aggregation', () => {
    store.getOrCreateProfile('oracle');
    store.ingestXpEvent('oracle', 50, 'code_review', 'test');
    const history = store.getXpHistory('oracle', 7);
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].total_xp).toBeGreaterThan(0);
  });
});

describe('recordMilestone / getRecentMilestones', () => {
  it('records and retrieves milestones', () => {
    const ms = store.recordMilestone('oracle', 'level_up', 'Level 5!', 'Oracle reached level 5');
    expect(ms.id).toBeDefined();
    expect(ms.type).toBe('level_up');
    const recent = store.getRecentMilestones();
    expect(recent.length).toBe(1);
    expect(recent[0].title).toBe('Level 5!');
  });

  it('respects limit', () => {
    for (let i = 0; i < 5; i++) store.recordMilestone('oracle', 'level_up', `Level ${i}`, 'desc');
    expect(store.getRecentMilestones(3).length).toBe(3);
  });
});

describe('unlockSkill (enhanced with milestones)', () => {
  it('unlocks a tier-1 skill, deducts XP, and records milestone', () => {
    store.getOrCreateProfile('oracle');
    // Give enough XP
    store.ingestXpEvent('oracle', 200, 'code_review', 'test');
    store.ingestXpEvent('oracle', 200, 'bug_fix', 'test');
    const result = store.unlockSkill('oracle', 'eng-1');
    expect(result.unlock.node_id).toBe('eng-1');
    const profile = store.getProfile('oracle')!;
    // XP should be reduced by eng-1 cost (100)
    expect(profile.current_xp).toBeLessThan(400);
    // Milestone should be recorded
    const milestones = store.getRecentMilestones();
    expect(milestones.some((m: any) => m.type === 'skill_unlock' && (m.title.includes('eng-1') || m.title.includes('Code Foundations')))).toBe(true);
  });

  it('rejects unlock if prerequisite not met', () => {
    store.getOrCreateProfile('oracle');
    store.ingestXpEvent('oracle', 500, 'code_review', 'test');
    store.ingestXpEvent('oracle', 500, 'bug_fix', 'test');
    expect(() => store.unlockSkill('oracle', 'eng-2')).toThrow(/[Pp]rerequisite/);
  });

  it('rejects unlock if insufficient XP', () => {
    store.getOrCreateProfile('oracle');
    store.ingestXpEvent('oracle', 10, 'code_review', 'test');
    store.ingestXpEvent('oracle', 10, 'bug_fix', 'test');
    expect(() => store.unlockSkill('oracle', 'eng-1')).toThrow(/[Ii]nsufficient/);
  });

  it('rejects double unlock', () => {
    store.getOrCreateProfile('oracle');
    store.ingestXpEvent('oracle', 500, 'code_review', 'test');
    store.ingestXpEvent('oracle', 500, 'bug_fix', 'test');
    store.unlockSkill('oracle', 'eng-1');
    expect(() => store.unlockSkill('oracle', 'eng-1')).toThrow(/[Aa]lready/);
  });
});

describe('Phase 1 API contract preservation', () => {
  it('getOrCreateProfile still works', () => {
    const profile = store.getOrCreateProfile('oracle', 'Oracle');
    expect(profile.agent_id).toBe('oracle');
    expect(profile.level).toBe(1);
  });

  it('ingestXpEvent still works', () => {
    store.getOrCreateProfile('oracle');
    const result = store.ingestXpEvent('oracle', 50, 'code_review', 'Test');
    expect(result.event.raw_xp).toBe(50);
  });

  it('getSkillNodes returns 15 default nodes', () => {
    expect(store.getSkillNodes().length).toBe(15);
  });

  it('getSkillEdges returns 10 default edges', () => {
    expect(store.getSkillEdges().length).toBe(10);
  });

  it('listProfiles works', () => {
    store.getOrCreateProfile('oracle');
    expect(store.listProfiles().length).toBe(1);
  });

  it('getSkillTreeState still works (from PR #229)', () => {
    store.getOrCreateProfile('oracle');
    const state = store.getSkillTreeState('oracle');
    expect(state.nodes.length).toBe(15);
    expect(state.unlocked_count).toBe(0);
  });

  it('getLeaderboard still works (from PR #229)', () => {
    store.getOrCreateProfile('oracle');
    const lb = store.getLeaderboard();
    expect(lb.entries.length).toBe(1);
    expect(lb.total_agents).toBe(1);
  });
});

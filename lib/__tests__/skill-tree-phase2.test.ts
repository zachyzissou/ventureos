/**
 * Skill Tree Phase 2 — Unit Tests
 *
 * Tests for skill unlock logic, annotated tree state, leaderboard,
 * and the new HTTP endpoints added in Phase 2.
 *
 * Issue #207 — Phase 4.5 Phase 2: Visual Skill Tree UI & Progression Polish
 */

import { ProgressionStore } from '../progression-store';
import { levelFromXp } from '../progression-engine';
import type { AnnotatedSkillNode, SkillNodeStatus } from '../types/progression';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ─── Test Helpers ───────────────────────────────────────────────────────────

function tmpDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vos-test-'));
  return path.join(dir, 'test.db');
}

function createStore(): { store: ProgressionStore; dbPath: string } {
  const dbPath = tmpDbPath();
  const store = new ProgressionStore(dbPath);
  return { store, dbPath };
}

/** Helper: give an agent enough XP to afford skill unlocks. */
function giveXp(store: ProgressionStore, agentId: string, amount: number): void {
  // Use direct ingestion with varied categories to avoid diversification penalty
  const categories = [
    'mission_completion', 'code_review', 'documentation', 'bug_fix',
    'deployment', 'collaboration', 'research', 'testing',
  ] as const;
  const perEvent = Math.ceil(amount / categories.length);
  for (const cat of categories) {
    store.ingestXpEvent(agentId, perEvent, cat, `test-xp-${cat}`);
  }
}

afterEach(() => {
  // Cleanup is handled by OS tmp directory
});

// ─── getSkillTreeState ──────────────────────────────────────────────────────

describe('getSkillTreeState', () => {
  it('returns all nodes with correct status for a fresh agent', () => {
    const { store } = createStore();
    try {
      const state = store.getSkillTreeState('agent-1');

      // Should have 15 nodes (5 categories × 3 tiers)
      expect(state.nodes.length).toBe(15);
      expect(state.unlocked_count).toBe(0);

      // Tier 1 nodes should be 'available' (no prerequisites)
      const tier1 = state.nodes.filter((n) => n.tier === 1);
      expect(tier1.length).toBe(5);
      for (const node of tier1) {
        expect(node.status).toBe('available');
      }

      // Tier 2 & 3 nodes should be 'locked' (prerequisites not met)
      const locked = state.nodes.filter((n) => n.tier > 1);
      expect(locked.length).toBe(10);
      for (const node of locked) {
        expect(node.status).toBe('locked');
      }
    } finally {
      store.close();
    }
  });

  it('marks nodes as affordable when agent has enough XP', () => {
    const { store } = createStore();
    try {
      giveXp(store, 'agent-1', 2000);
      const state = store.getSkillTreeState('agent-1');

      const available = state.nodes.filter((n) => n.status === 'available');
      // Tier 1 nodes cost 100 XP, agent has plenty
      for (const node of available) {
        if (node.xp_cost <= state.nodes[0].xp_cost) {
          expect(node.affordable).toBe(true);
        }
      }
    } finally {
      store.close();
    }
  });

  it('marks nodes as not affordable when agent lacks XP', () => {
    const { store } = createStore();
    try {
      // Fresh agent with 0 XP
      const state = store.getSkillTreeState('agent-1');
      const available = state.nodes.filter((n) => n.status === 'available');
      for (const node of available) {
        expect(node.affordable).toBe(false);
      }
    } finally {
      store.close();
    }
  });

  it('returns edges matching the skill tree', () => {
    const { store } = createStore();
    try {
      const state = store.getSkillTreeState('agent-1');
      // 5 categories × 2 edges each (tier1→tier2, tier2→tier3)
      expect(state.edges.length).toBe(10);
    } finally {
      store.close();
    }
  });
});

// ─── unlockSkill ────────────────────────────────────────────────────────────

describe('unlockSkill', () => {
  it('unlocks a tier-1 skill node and deducts XP', () => {
    const { store } = createStore();
    try {
      giveXp(store, 'agent-1', 2000);
      const profileBefore = store.getOrCreateProfile('agent-1');
      const xpBefore = profileBefore.current_xp;

      const result = store.unlockSkill('agent-1', 'eng-1');

      expect(result.unlock.node_id).toBe('eng-1');
      expect(result.unlock.agent_id).toBe('agent-1');
      expect(result.node.status).toBe('unlocked');
      expect(result.profile.current_xp).toBe(xpBefore - 100); // eng-1 costs 100
    } finally {
      store.close();
    }
  });

  it('makes tier-2 node available after tier-1 unlock', () => {
    const { store } = createStore();
    try {
      giveXp(store, 'agent-1', 3000);
      store.unlockSkill('agent-1', 'eng-1');

      const state = store.getSkillTreeState('agent-1');
      const eng2 = state.nodes.find((n) => n.node_id === 'eng-2');
      expect(eng2).toBeDefined();
      expect(eng2!.status).toBe('available');
    } finally {
      store.close();
    }
  });

  it('allows chaining tier-1 → tier-2 → tier-3 unlocks', () => {
    const { store } = createStore();
    try {
      giveXp(store, 'agent-1', 10000);

      store.unlockSkill('agent-1', 'ops-1'); // 100 XP
      store.unlockSkill('agent-1', 'ops-2'); // 300 XP
      store.unlockSkill('agent-1', 'ops-3'); // 800 XP

      const unlocks = store.getUnlocks('agent-1');
      const nodeIds = unlocks.map((u) => u.node_id);
      expect(nodeIds).toContain('ops-1');
      expect(nodeIds).toContain('ops-2');
      expect(nodeIds).toContain('ops-3');

      const state = store.getSkillTreeState('agent-1');
      expect(state.unlocked_count).toBe(3);
    } finally {
      store.close();
    }
  });

  it('throws when node does not exist', () => {
    const { store } = createStore();
    try {
      giveXp(store, 'agent-1', 1000);
      expect(() => store.unlockSkill('agent-1', 'nonexistent')).toThrow(
        'Skill node not found',
      );
    } finally {
      store.close();
    }
  });

  it('throws when skill already unlocked', () => {
    const { store } = createStore();
    try {
      giveXp(store, 'agent-1', 2000);
      store.unlockSkill('agent-1', 'eng-1');
      expect(() => store.unlockSkill('agent-1', 'eng-1')).toThrow(
        'Skill already unlocked',
      );
    } finally {
      store.close();
    }
  });

  it('throws when prerequisites not met', () => {
    const { store } = createStore();
    try {
      giveXp(store, 'agent-1', 5000);
      // eng-2 requires eng-1
      expect(() => store.unlockSkill('agent-1', 'eng-2')).toThrow(
        'Prerequisites not met',
      );
    } finally {
      store.close();
    }
  });

  it('throws when insufficient XP', () => {
    const { store } = createStore();
    try {
      // Fresh agent with 0 XP
      store.getOrCreateProfile('agent-1');
      expect(() => store.unlockSkill('agent-1', 'eng-1')).toThrow(
        'Insufficient XP',
      );
    } finally {
      store.close();
    }
  });

  it('recalculates level after XP deduction', () => {
    const { store } = createStore();
    try {
      giveXp(store, 'agent-1', 2000);
      const before = store.getOrCreateProfile('agent-1');
      const levelBefore = before.level;

      // Unlock a costly node that may drop level
      store.unlockSkill('agent-1', 'eng-1');
      const after = store.getOrCreateProfile('agent-1');

      // Level should be consistent with remaining XP
      expect(after.level).toBe(levelFromXp(after.current_xp));
      // XP decreased, so level should be <= previous
      expect(after.level).toBeLessThanOrEqual(levelBefore);
    } finally {
      store.close();
    }
  });

  it('records prestige_rank_at_unlock correctly', () => {
    const { store } = createStore();
    try {
      giveXp(store, 'agent-1', 2000);
      const result = store.unlockSkill('agent-1', 'eng-1');
      expect(result.unlock.prestige_rank_at_unlock).toBe(0);
    } finally {
      store.close();
    }
  });
});

// ─── getLeaderboard ─────────────────────────────────────────────────────────

describe('getLeaderboard', () => {
  it('returns empty leaderboard when no agents exist', () => {
    const { store } = createStore();
    try {
      const lb = store.getLeaderboard();
      expect(lb.entries).toEqual([]);
      expect(lb.total_agents).toBe(0);
    } finally {
      store.close();
    }
  });

  it('ranks agents by prestige → level → lifetime_xp', () => {
    const { store } = createStore();
    try {
      // Agent A: more XP
      giveXp(store, 'agent-a', 5000);
      // Agent B: less XP
      giveXp(store, 'agent-b', 1000);
      // Agent C: medium XP
      giveXp(store, 'agent-c', 3000);

      const lb = store.getLeaderboard();
      expect(lb.total_agents).toBe(3);
      expect(lb.entries.length).toBe(3);

      // Agent A should be rank 1 (highest XP/level)
      expect(lb.entries[0].agent_id).toBe('agent-a');
      expect(lb.entries[0].rank).toBe(1);

      // Ranks should be sequential
      expect(lb.entries.map((e) => e.rank)).toEqual([1, 2, 3]);
    } finally {
      store.close();
    }
  });

  it('includes unlocked_skills count', () => {
    const { store } = createStore();
    try {
      giveXp(store, 'agent-1', 5000);
      store.unlockSkill('agent-1', 'eng-1');
      store.unlockSkill('agent-1', 'ops-1');

      const lb = store.getLeaderboard();
      const entry = lb.entries.find((e) => e.agent_id === 'agent-1');
      expect(entry).toBeDefined();
      expect(entry!.unlocked_skills).toBe(2);
    } finally {
      store.close();
    }
  });

  it('respects limit parameter', () => {
    const { store } = createStore();
    try {
      for (let i = 0; i < 10; i++) {
        store.getOrCreateProfile(`agent-${i}`, `Agent ${i}`);
      }
      const lb = store.getLeaderboard(3);
      expect(lb.entries.length).toBe(3);
      expect(lb.total_agents).toBe(10);
    } finally {
      store.close();
    }
  });

  it('returns all required fields', () => {
    const { store } = createStore();
    try {
      giveXp(store, 'agent-1', 1000);
      const lb = store.getLeaderboard();
      const entry = lb.entries[0];

      expect(entry).toHaveProperty('rank');
      expect(entry).toHaveProperty('agent_id');
      expect(entry).toHaveProperty('display_name');
      expect(entry).toHaveProperty('level');
      expect(entry).toHaveProperty('current_xp');
      expect(entry).toHaveProperty('lifetime_xp');
      expect(entry).toHaveProperty('prestige_rank');
      expect(entry).toHaveProperty('unlocked_skills');
      expect(entry).toHaveProperty('diversification_score');
    } finally {
      store.close();
    }
  });
});

// ─── HTTP Endpoint Tests (route matching) ───────────────────────────────────

describe('HTTP route integration', () => {
  // We test the handleProgressionApi function with mock req/res
  let httpModule: typeof import('../progression-http');
  let dbPath: string;
  let store: ProgressionStore;

  beforeEach(() => {
    dbPath = tmpDbPath();
    store = new ProgressionStore(dbPath);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    httpModule = require('../progression-http');
  });

  afterEach(() => {
    store.close();
  });

  function mockReq(method: string, url: string, body?: string): any {
    const listeners: Record<string, Function[]> = {};
    const req = {
      method,
      url,
      headers: { host: 'localhost:3000' },
      on(event: string, fn: Function) {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(fn);
        // Emit data/end for POST bodies
        if (event === 'end' && body !== undefined) {
          setTimeout(() => {
            for (const dataFn of (listeners['data'] || [])) {
              dataFn(Buffer.from(body));
            }
            for (const endFn of (listeners['end'] || [])) {
              endFn();
            }
          }, 0);
        } else if (event === 'end' && body === undefined) {
          setTimeout(() => {
            for (const endFn of (listeners['end'] || [])) {
              endFn();
            }
          }, 0);
        }
        return req;
      },
      destroy() {},
    };
    return req;
  }

  function mockRes(): any {
    let statusCode = 0;
    let body = '';
    const res = {
      writeHead(status: number, _headers?: any) {
        statusCode = status;
      },
      end(data?: string) {
        body = data || '';
      },
      getStatus() { return statusCode; },
      getBody() { return body; },
      getParsed() { return JSON.parse(body); },
    };
    return res;
  }

  it('GET /api/rpg/progression/skill-tree/:agentId returns annotated tree', () => {
    const req = mockReq('GET', '/api/rpg/progression/skill-tree/agent-1');
    const res = mockRes();

    const handled = httpModule.handleProgressionApi(req, res, { dbPath });
    expect(handled).toBe(true);

    const parsed = res.getParsed();
    expect(parsed.agent_id).toBe('agent-1');
    expect(parsed.nodes.length).toBe(15);
    expect(parsed.total_count).toBe(15);
    expect(parsed.unlocked_count).toBe(0);
  });

  it('POST /api/rpg/progression/skills/unlock returns unlock result', async () => {
    // Give XP first
    giveXp(store, 'agent-1', 2000);

    const body = JSON.stringify({ agent_id: 'agent-1', node_id: 'eng-1' });
    const req = mockReq('POST', '/api/rpg/progression/skills/unlock', body);
    const res = mockRes();

    const handled = httpModule.handleProgressionApi(req, res, { dbPath });
    expect(handled).toBe(true);

    // Wait for async body reading
    await new Promise((r) => setTimeout(r, 50));

    const parsed = res.getParsed();
    expect(parsed.ok).toBe(true);
    expect(parsed.unlock.node_id).toBe('eng-1');
    expect(parsed.node.status).toBe('unlocked');
  });

  it('GET /api/rpg/progression/leaderboard returns entries', () => {
    giveXp(store, 'agent-1', 1000);

    const req = mockReq('GET', '/api/rpg/progression/leaderboard');
    const res = mockRes();

    const handled = httpModule.handleProgressionApi(req, res, { dbPath });
    expect(handled).toBe(true);

    const parsed = res.getParsed();
    expect(parsed.entries.length).toBe(1);
    expect(parsed.total_agents).toBe(1);
    expect(parsed.entries[0].agent_id).toBe('agent-1');
  });

  it('GET /api/rpg/progression/leaderboard respects ?limit=', () => {
    for (let i = 0; i < 5; i++) {
      store.getOrCreateProfile(`agent-${i}`);
    }

    const req = mockReq('GET', '/api/rpg/progression/leaderboard?limit=2');
    const res = mockRes();

    const handled = httpModule.handleProgressionApi(req, res, { dbPath });
    expect(handled).toBe(true);

    const parsed = res.getParsed();
    expect(parsed.entries.length).toBe(2);
    expect(parsed.total_agents).toBe(5);
  });

  it('POST /api/rpg/progression/skills/unlock rejects missing node_id', async () => {
    const body = JSON.stringify({ agent_id: 'agent-1' });
    const req = mockReq('POST', '/api/rpg/progression/skills/unlock', body);
    const res = mockRes();

    httpModule.handleProgressionApi(req, res, { dbPath });
    await new Promise((r) => setTimeout(r, 50));

    const parsed = res.getParsed();
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/node_id/i);
  });

  it('POST /api/rpg/progression/skills/unlock rejects insufficient XP', async () => {
    store.getOrCreateProfile('agent-1');
    const body = JSON.stringify({ agent_id: 'agent-1', node_id: 'eng-1' });
    const req = mockReq('POST', '/api/rpg/progression/skills/unlock', body);
    const res = mockRes();

    httpModule.handleProgressionApi(req, res, { dbPath });
    await new Promise((r) => setTimeout(r, 50));

    const parsed = res.getParsed();
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/Insufficient XP/);
  });
});

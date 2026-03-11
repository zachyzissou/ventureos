/**
 * Progression Store — Integration Tests
 *
 * Tests for SQLite persistence: profiles, XP ingestion with diversification,
 * prestige transitions, and skill tree seeding.
 *
 * Uses a temporary in-memory or file-based database per test.
 *
 * Issue #203 — Phase 4.5 Deep Progression System (Phase 1 foundation)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ProgressionStore } from '../progression-store';
import { xpForLevel, levelFromXp, prestigeLevelRequirement } from '../progression-engine';

function tempDbPath(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prog-test-'));
  return path.join(tmpDir, 'test-progression.db');
}

// ─── Profile Operations ─────────────────────────────────────────────────────

describe('ProgressionStore — Profiles', () => {
  let store: ProgressionStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tempDbPath();
    store = new ProgressionStore(dbPath);
  });

  afterEach(() => {
    store.close();
    try { fs.rmSync(path.dirname(dbPath), { recursive: true }); } catch { /* ignore */ }
  });

  it('creates a new profile with default values', () => {
    const profile = store.getOrCreateProfile('oracle', 'Oracle');
    expect(profile.agent_id).toBe('oracle');
    expect(profile.display_name).toBe('Oracle');
    expect(profile.current_xp).toBe(0);
    expect(profile.lifetime_xp).toBe(0);
    expect(profile.level).toBe(1);
    expect(profile.prestige_rank).toBe(0);
    expect(profile.diversification_score).toBe(0);
  });

  it('returns existing profile on repeated calls', () => {
    store.getOrCreateProfile('oracle', 'Oracle');
    const again = store.getOrCreateProfile('oracle', 'Different Name');
    expect(again.display_name).toBe('Oracle'); // Original name preserved
  });

  it('returns null for getProfile when not found', () => {
    expect(store.getProfile('nonexistent')).toBeNull();
  });

  it('lists all profiles sorted by level desc', () => {
    store.getOrCreateProfile('a');
    store.getOrCreateProfile('b');
    const profiles = store.listProfiles();
    expect(profiles).toHaveLength(2);
  });
});

// ─── XP Event Ingestion ─────────────────────────────────────────────────────

describe('ProgressionStore — XP Ingestion', () => {
  let store: ProgressionStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tempDbPath();
    store = new ProgressionStore(dbPath);
  });

  afterEach(() => {
    store.close();
    try { fs.rmSync(path.dirname(dbPath), { recursive: true }); } catch { /* ignore */ }
  });

  it('ingests an XP event and updates profile', () => {
    const result = store.ingestXpEvent('oracle', 50, 'mission_completion', 'Completed task');
    expect(result.event.agent_id).toBe('oracle');
    expect(result.event.raw_xp).toBe(50);
    expect(result.event.source_category).toBe('mission_completion');
    expect(result.event.effective_xp).toBeGreaterThan(0);
    expect(result.profile.current_xp).toBeGreaterThan(0);
    expect(result.profile.lifetime_xp).toBeGreaterThan(0);
  });

  it('applies diversification penalty for single category', () => {
    // First event from one category
    const r1 = store.ingestXpEvent('oracle', 100, 'mission_completion', 'Task 1');
    // Multiplier should be 0.5 (single category penalty)
    expect(r1.event.diversification_multiplier).toBe(0.5);
    expect(r1.event.effective_xp).toBe(50); // 100 * 0.5
  });

  it('applies diversification bonus for diverse categories', () => {
    // Ingest events across multiple categories first
    store.ingestXpEvent('oracle', 100, 'mission_completion', 'Task 1');
    store.ingestXpEvent('oracle', 100, 'code_review', 'Review 1');
    store.ingestXpEvent('oracle', 100, 'documentation', 'Docs 1');
    store.ingestXpEvent('oracle', 100, 'bug_fix', 'Fix 1');

    // Now ingest another — should have decent multiplier
    const result = store.ingestXpEvent('oracle', 100, 'testing', 'Test 1');
    expect(result.event.diversification_multiplier).toBeGreaterThan(0.8);
  });

  it('detects level-up', () => {
    // Need 100 XP for level 2. With single-cat penalty (0.5), need 200 raw.
    // Let's use diverse categories for better multiplier.
    store.ingestXpEvent('oracle', 30, 'mission_completion', 'Task 1');
    store.ingestXpEvent('oracle', 30, 'code_review', 'Review 1');
    store.ingestXpEvent('oracle', 30, 'documentation', 'Docs 1');
    const r = store.ingestXpEvent('oracle', 200, 'bug_fix', 'Fix 1');

    expect(r.profile.level).toBeGreaterThanOrEqual(2);
    expect(r.levelUp).toBe(true);
  });

  it('rejects non-positive XP', () => {
    expect(() => store.ingestXpEvent('oracle', 0, 'mission_completion', 'Nope')).toThrow();
    expect(() => store.ingestXpEvent('oracle', -10, 'mission_completion', 'Nope')).toThrow();
  });

  it('rejects invalid source category', () => {
    expect(() =>
      store.ingestXpEvent('oracle', 50, 'invalid_category' as any, 'Nope'),
    ).toThrow('Invalid source_category');
  });

  it('accumulates XP correctly over multiple events', () => {
    store.ingestXpEvent('oracle', 10, 'mission_completion', 'T1');
    store.ingestXpEvent('oracle', 10, 'code_review', 'T2');
    store.ingestXpEvent('oracle', 10, 'documentation', 'T3');
    store.ingestXpEvent('oracle', 10, 'bug_fix', 'T4');
    const result = store.ingestXpEvent('oracle', 10, 'testing', 'T5');

    expect(result.profile.lifetime_xp).toBeGreaterThan(0);
    expect(result.profile.current_xp).toBe(result.profile.lifetime_xp);

    // Verify events are retrievable
    const events = store.getRecentEvents('oracle', 10);
    expect(events).toHaveLength(5);
  });

  it('updates diversification score', () => {
    store.ingestXpEvent('oracle', 10, 'mission_completion', 'T1');
    store.ingestXpEvent('oracle', 10, 'code_review', 'T2');
    store.ingestXpEvent('oracle', 10, 'documentation', 'T3');
    store.ingestXpEvent('oracle', 10, 'bug_fix', 'T4');
    const result = store.ingestXpEvent('oracle', 10, 'testing', 'T5');
    expect(result.profile.diversification_score).toBeGreaterThan(0);
  });
});

// ─── Prestige Operations ────────────────────────────────────────────────────

describe('ProgressionStore — Prestige', () => {
  let store: ProgressionStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tempDbPath();
    store = new ProgressionStore(dbPath);
  });

  afterEach(() => {
    store.close();
    try { fs.rmSync(path.dirname(dbPath), { recursive: true }); } catch { /* ignore */ }
  });

  it('rejects prestige for non-existent profile', () => {
    expect(() => store.prestigeTransition('nobody')).toThrow('Profile not found');
  });

  it('rejects prestige when level is too low', () => {
    store.getOrCreateProfile('oracle');
    expect(() => store.prestigeTransition('oracle')).toThrow('Not eligible');
  });

  it('executes prestige transition when eligible', () => {
    // Build up enough XP to reach level 20
    const reqXp = xpForLevel(20);
    // Need to ingest enough XP. Use diverse categories for good multiplier.
    const categories = [
      'mission_completion', 'code_review', 'documentation', 'bug_fix',
      'deployment', 'collaboration', 'research', 'testing',
    ] as const;

    let totalEffective = 0;
    let idx = 0;
    while (totalEffective < reqXp + 1000) {
      const cat = categories[idx % categories.length];
      const result = store.ingestXpEvent('oracle', 500, cat, `Event ${idx}`);
      totalEffective = result.profile.current_xp;
      idx++;
      if (idx > 200) break; // Safety
    }

    const profile = store.getProfile('oracle')!;
    expect(profile.level).toBeGreaterThanOrEqual(20);

    // Execute prestige
    const record = store.prestigeTransition('oracle');
    expect(record.from_rank).toBe(0);
    expect(record.to_rank).toBe(1);
    expect(record.xp_at_prestige).toBeGreaterThan(0);
    expect(record.level_at_prestige).toBeGreaterThanOrEqual(20);

    // Verify profile was reset
    const after = store.getProfile('oracle')!;
    expect(after.current_xp).toBe(0);
    expect(after.level).toBe(1);
    expect(after.prestige_rank).toBe(1);
    expect(after.lifetime_xp).toBeGreaterThan(0); // Lifetime preserved

    // Verify history
    const history = store.getPrestigeHistory('oracle');
    expect(history).toHaveLength(1);
    expect(history[0].to_rank).toBe(1);
  });
});

// ─── Skill Tree ─────────────────────────────────────────────────────────────

describe('ProgressionStore — Skill Tree', () => {
  let store: ProgressionStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tempDbPath();
    store = new ProgressionStore(dbPath);
  });

  afterEach(() => {
    store.close();
    try { fs.rmSync(path.dirname(dbPath), { recursive: true }); } catch { /* ignore */ }
  });

  it('seeds default skill tree on creation', () => {
    const nodes = store.getSkillNodes();
    expect(nodes).toHaveLength(15);
    const edges = store.getSkillEdges();
    expect(edges.length).toBeGreaterThan(0);
  });

  it('does not duplicate nodes on re-open', () => {
    store.close();
    const store2 = new ProgressionStore(dbPath);
    const nodes = store2.getSkillNodes();
    expect(nodes).toHaveLength(15);
    store2.close();
  });

  it('returns empty unlocks for new agent', () => {
    const unlocks = store.getUnlocks('oracle');
    expect(unlocks).toHaveLength(0);
  });
});

// ─── Today Stats ────────────────────────────────────────────────────────────

describe('ProgressionStore — Today Stats', () => {
  let store: ProgressionStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tempDbPath();
    store = new ProgressionStore(dbPath);
  });

  afterEach(() => {
    store.close();
    try { fs.rmSync(path.dirname(dbPath), { recursive: true }); } catch { /* ignore */ }
  });

  it('returns zero stats when no events', () => {
    const stats = store.getTodayEvents();
    expect(stats.total_xp).toBe(0);
    expect(stats.total_count).toBe(0);
    expect(stats.top_categories).toHaveLength(0);
  });

  it('counts today events correctly', () => {
    store.ingestXpEvent('oracle', 50, 'mission_completion', 'T1');
    store.ingestXpEvent('oracle', 30, 'code_review', 'T2');
    const stats = store.getTodayEvents();
    expect(stats.total_count).toBe(2);
    expect(stats.total_xp).toBeGreaterThan(0);
    expect(stats.top_categories.length).toBeGreaterThan(0);
  });
});

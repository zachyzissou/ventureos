import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import Database from 'better-sqlite3';

import { AffinityManager } from '../affinity-manager';

async function makeTempDb(): Promise<{ dbPath: string; db: Database.Database; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ventureos-affinity-'));
  const dbPath = path.join(dir, 'test.db');
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE khala_network (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_a TEXT NOT NULL,
      agent_b TEXT NOT NULL,
      affinity REAL NOT NULL,
      seed_value REAL NOT NULL,
      last_interaction_at TIMESTAMP,
      interaction_count INTEGER DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(agent_a, agent_b),
      CHECK(agent_a < agent_b),
      CHECK(affinity >= 0.10 AND affinity <= 0.95)
    );

    CREATE TABLE khala_drift_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_a TEXT NOT NULL,
      agent_b TEXT NOT NULL,
      old_affinity REAL NOT NULL,
      new_affinity REAL NOT NULL,
      delta REAL NOT NULL,
      reason TEXT NOT NULL,
      interaction_type TEXT,
      related_mission_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const cleanup = async () => {
    db.close();
    await fs.rm(dir, { recursive: true, force: true });
  };

  return { dbPath, db, cleanup };
}

async function makeTempDbMinimalKhala(): Promise<{ dbPath: string; db: Database.Database; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ventureos-affinity-min-'));
  const dbPath = path.join(dir, 'test.db');
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE khala_network (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_a TEXT NOT NULL,
      agent_b TEXT NOT NULL,
      affinity REAL NOT NULL,
      UNIQUE(agent_a, agent_b)
    );
  `);

  const cleanup = async () => {
    db.close();
    await fs.rm(dir, { recursive: true, force: true });
  };

  return { dbPath, db, cleanup };
}

describe('AffinityManager', () => {
  it('returns default affinity when bond is missing', async () => {
    const { db, cleanup } = await makeTempDb();
    const am = new AffinityManager({ defaultAffinity: 0.7 }, db);

    expect(am.getAffinity('oracle', 'archivist')).toBe(0.7);

    am.close();
    await cleanup();
  });

  it('creates and updates a bond with drift tracking', async () => {
    const { db, cleanup } = await makeTempDb();
    const am = new AffinityManager({ defaultAffinity: 0.7 }, db);

    const before = am.getAffinity('oracle', 'archivist');
    expect(before).toBe(0.7);

    const after = am.recordHandoffOutcome({ from: 'oracle', to: 'archivist', success: true, reason: 'Test success' });
    expect(after).toBeGreaterThan(before);

    const row = db.prepare('SELECT affinity, interaction_count FROM khala_network WHERE agent_a = ? AND agent_b = ?').get('archivist', 'oracle') as any;
    expect(row.affinity).toBeCloseTo(after);
    expect(row.interaction_count).toBe(1);

    const drift = db.prepare('SELECT old_affinity, new_affinity, delta, reason, interaction_type FROM khala_drift_history LIMIT 1').get() as any;
    expect(drift.reason).toBe('Test success');
    expect(drift.interaction_type).toBe('handoff');
    expect(drift.new_affinity).toBeCloseTo(after);
    expect(drift.delta).toBeCloseTo(after - before);

    am.close();
    await cleanup();
  });

  it('computes stats across participants', async () => {
    const { db, cleanup } = await makeTempDb();
    // Insert two pairs: lowest is oracle-synth at 0.4
    db.prepare(
      'INSERT INTO khala_network(agent_a, agent_b, affinity, seed_value, interaction_count) VALUES(?, ?, ?, ?, 0)'
    ).run('oracle', 'synth', 0.4, 0.4);
    db.prepare(
      'INSERT INTO khala_network(agent_a, agent_b, affinity, seed_value, interaction_count) VALUES(?, ?, ?, ?, 0)'
    ).run('archivist', 'oracle', 0.9, 0.9);

    const am = new AffinityManager({ defaultAffinity: 0.7 }, db);
    const stats = am.computeStats(['oracle', 'synth', 'archivist']);

    expect(stats.pairCount).toBe(3);
    expect(stats.lowest).toBe(0.4);
    expect(stats.lowestPair.sort()).toEqual(['oracle', 'synth']);

    am.close();
    await cleanup();
  });

  it('updates affinity against minimal khala_network schema (legacy compatibility)', async () => {
    const { db, cleanup } = await makeTempDbMinimalKhala();
    const am = new AffinityManager({ defaultAffinity: 0.7 }, db);

    const after = am.recordHandoffOutcome({ from: 'oracle', to: 'atlas', success: true });
    expect(after).toBeGreaterThan(0.7);

    const row = db
      .prepare('SELECT affinity FROM khala_network WHERE agent_a = ? AND agent_b = ?')
      .get('atlas', 'oracle') as any;
    expect(row.affinity).toBeCloseTo(after);

    am.close();
    await cleanup();
  });
});

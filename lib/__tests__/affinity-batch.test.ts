import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import Database from 'better-sqlite3';

import { AffinityManager } from '../affinity-manager';

/**
 * PERF-003: Tests for batch affinity queries.
 *
 * Verifies that:
 *  - getAffinitiesBatch returns identical results to individual getAffinity calls
 *  - computeStats uses batch query (performance)
 *  - Legacy affinity_bonds batch works
 *  - Edge cases (empty, duplicates, missing bonds)
 */

async function makeTempDb(opts?: {
  legacy?: boolean;
}): Promise<{ dbPath: string; db: Database.Database; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ventureos-batch-'));
  const dbPath = path.join(dir, 'test.db');
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE affinity_network (
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

    CREATE TABLE affinity_drift_history (
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

  if (opts?.legacy) {
    db.exec(`
      CREATE TABLE affinity_bonds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_a TEXT NOT NULL,
        agent_b TEXT NOT NULL,
        affinity REAL NOT NULL,
        UNIQUE(agent_a, agent_b),
        CHECK(agent_a < agent_b)
      );
    `);
  }

  const cleanup = async () => {
    db.close();
    await fs.rm(dir, { recursive: true, force: true });
  };

  return { dbPath, db, cleanup };
}

function seedBonds(db: Database.Database, table: string, bonds: Array<[string, string, number]>): void {
  const insert = db.prepare(
    table === 'affinity_network'
      ? `INSERT INTO affinity_network(agent_a, agent_b, affinity, seed_value, interaction_count) VALUES(?, ?, ?, ?, 0)`
      : `INSERT INTO affinity_bonds(agent_a, agent_b, affinity) VALUES(?, ?, ?)`
  );

  for (const [a, b, affinity] of bonds) {
    if (table === 'affinity_network') {
      insert.run(a, b, affinity, affinity);
    } else {
      insert.run(a, b, affinity);
    }
  }
}

describe('PERF-003: Batch Affinity Queries', () => {
  describe('getAffinitiesBatch', () => {
    it('returns correct affinities matching individual getAffinity calls', async () => {
      const { db, cleanup } = await makeTempDb();
      seedBonds(db, 'affinity_network', [
        ['archivist', 'oracle', 0.85],
        ['echo', 'nexus', 0.6],
        ['nexus', 'oracle', 0.45],
        ['archivist', 'synth', 0.92],
      ]);

      const am = new AffinityManager({ defaultAffinity: 0.7 }, db);

      const pairs: Array<[string, string]> = [
        ['oracle', 'archivist'],
        ['nexus', 'echo'],
        ['oracle', 'nexus'],
        ['archivist', 'synth'],
      ];

      // Get individual results
      const individual = pairs.map(([a, b]) => am.getAffinity(a, b));

      // Get batch results
      const batchMap = am.getAffinitiesBatch(pairs);

      // Verify they match
      for (let i = 0; i < pairs.length; i++) {
        const [a, b] = pairs[i];
        const [na, nb] = a < b ? [a, b] : [b, a];
        const batchValue = batchMap.get(`${na}:${nb}`);
        expect(batchValue).toBe(individual[i]);
      }

      am.close();
      await cleanup();
    });

    it('returns defaultAffinity for missing bonds', async () => {
      const { db, cleanup } = await makeTempDb();
      const am = new AffinityManager({ defaultAffinity: 0.7 }, db);

      const batchMap = am.getAffinitiesBatch([
        ['oracle', 'synth'],
        ['echo', 'archivist'],
      ]);

      expect(batchMap.get('oracle:synth')).toBe(0.7);
      expect(batchMap.get('archivist:echo')).toBe(0.7);

      am.close();
      await cleanup();
    });

    it('handles empty pairs array', async () => {
      const { db, cleanup } = await makeTempDb();
      const am = new AffinityManager({ defaultAffinity: 0.7 }, db);

      const batchMap = am.getAffinitiesBatch([]);
      expect(batchMap.size).toBe(0);

      am.close();
      await cleanup();
    });

    it('handles mixed found and missing bonds', async () => {
      const { db, cleanup } = await makeTempDb();
      seedBonds(db, 'affinity_network', [
        ['echo', 'oracle', 0.3],
      ]);

      const am = new AffinityManager({ defaultAffinity: 0.7 }, db);

      const batchMap = am.getAffinitiesBatch([
        ['oracle', 'echo'],     // exists → 0.3
        ['oracle', 'synth'],    // missing → 0.7
      ]);

      expect(batchMap.get('echo:oracle')).toBe(0.3);
      expect(batchMap.get('oracle:synth')).toBe(0.7);

      am.close();
      await cleanup();
    });

    it('handles duplicate pairs gracefully', async () => {
      const { db, cleanup } = await makeTempDb();
      seedBonds(db, 'affinity_network', [
        ['archivist', 'oracle', 0.85],
      ]);

      const am = new AffinityManager({ defaultAffinity: 0.7 }, db);

      const batchMap = am.getAffinitiesBatch([
        ['oracle', 'archivist'],
        ['archivist', 'oracle'],  // same pair, reversed
      ]);

      // Both should resolve to the same normalized key
      expect(batchMap.get('archivist:oracle')).toBe(0.85);

      am.close();
      await cleanup();
    });
  });

  describe('getLegacyAffinitiesBatch (affinity_bonds)', () => {
    it('fetches affinities from legacy table', async () => {
      const { db, cleanup } = await makeTempDb({ legacy: true });
      seedBonds(db, 'affinity_bonds', [
        ['archivist', 'oracle', 0.5],
        ['echo', 'synth', 0.8],
      ]);

      // Create manager without affinity_network to force legacy path
      db.exec('DROP TABLE affinity_network');
      const am = new AffinityManager({ defaultAffinity: 0.7 }, db);

      const batchMap = am.getAffinitiesBatch([
        ['oracle', 'archivist'],
        ['echo', 'synth'],
        ['nexus', 'oracle'],  // missing
      ]);

      expect(batchMap.get('archivist:oracle')).toBe(0.5);
      expect(batchMap.get('echo:synth')).toBe(0.8);
      expect(batchMap.get('nexus:oracle')).toBe(0.7);

      am.close();
      await cleanup();
    });

    it('getLegacyAffinitiesBatch explicitly targets affinity_bonds', async () => {
      const { db, cleanup } = await makeTempDb({ legacy: true });
      seedBonds(db, 'affinity_bonds', [
        ['archivist', 'oracle', 0.55],
      ]);
      seedBonds(db, 'affinity_network', [
        ['archivist', 'oracle', 0.88],
      ]);

      const am = new AffinityManager({ defaultAffinity: 0.7 }, db);

      // getAffinitiesBatch should prefer affinity_network
      const affinityMap = am.getAffinitiesBatch([['oracle', 'archivist']]);
      expect(affinityMap.get('archivist:oracle')).toBe(0.88);

      // getLegacyAffinitiesBatch should use affinity_bonds
      const legacyMap = am.getLegacyAffinitiesBatch([['oracle', 'archivist']]);
      expect(legacyMap.get('archivist:oracle')).toBe(0.55);

      am.close();
      await cleanup();
    });
  });

  describe('computeStats uses batch query', () => {
    it('produces identical results to pre-batch implementation', async () => {
      const { db, cleanup } = await makeTempDb();
      seedBonds(db, 'affinity_network', [
        ['archivist', 'oracle', 0.9],
        ['oracle', 'synth', 0.4],
        ['archivist', 'synth', 0.75],
      ]);

      const am = new AffinityManager({ defaultAffinity: 0.7 }, db);
      const stats = am.computeStats(['oracle', 'synth', 'archivist']);

      expect(stats.pairCount).toBe(3);
      expect(stats.lowest).toBe(0.4);
      expect(stats.lowestPair.sort()).toEqual(['oracle', 'synth']);
      // Average: (0.9 + 0.4 + 0.75) / 3 ≈ 0.6833
      expect(stats.average).toBeCloseTo(0.6833, 3);

      am.close();
      await cleanup();
    });

    it('handles single participant (no pairs)', async () => {
      const { db, cleanup } = await makeTempDb();
      const am = new AffinityManager({ defaultAffinity: 0.7 }, db);
      const stats = am.computeStats(['oracle']);

      expect(stats.pairCount).toBe(0);
      expect(stats.average).toBe(0.7);

      am.close();
      await cleanup();
    });

    it('handles duplicates in participant list', async () => {
      const { db, cleanup } = await makeTempDb();
      seedBonds(db, 'affinity_network', [
        ['echo', 'oracle', 0.6],
      ]);

      const am = new AffinityManager({ defaultAffinity: 0.7 }, db);
      const stats = am.computeStats(['oracle', 'echo', 'oracle', 'echo']);

      // Duplicates should be deduplicated → 1 unique pair
      expect(stats.pairCount).toBe(1);
      expect(stats.lowest).toBe(0.6);

      am.close();
      await cleanup();
    });
  });

  describe('Performance', () => {
    it('batch query for 200 pairs completes in <50ms', async () => {
      const { db, cleanup } = await makeTempDb();

      // Generate 200 unique bond pairs
      const agents = Array.from({ length: 21 }, (_, i) => `agent_${String(i).padStart(3, '0')}`);
      const insertStmt = db.prepare(
        'INSERT INTO affinity_network(agent_a, agent_b, affinity, seed_value, interaction_count) VALUES(?, ?, ?, ?, 0)'
      );

      const allPairs: Array<[string, string]> = [];
      const insertTx = db.transaction(() => {
        for (let i = 0; i < agents.length; i++) {
          for (let j = i + 1; j < agents.length; j++) {
            const affinity = 0.1 + Math.random() * 0.85;
            const clamped = Math.min(0.95, Math.max(0.1, affinity));
            insertStmt.run(agents[i], agents[j], clamped, clamped);
            allPairs.push([agents[i], agents[j]]);
          }
        }
      });
      insertTx();

      expect(allPairs.length).toBeGreaterThanOrEqual(200);

      const am = new AffinityManager({ defaultAffinity: 0.7 }, db);

      // Warm up
      am.getAffinitiesBatch(allPairs.slice(0, 10));

      // Measure batch performance
      const start = performance.now();
      const batchResult = am.getAffinitiesBatch(allPairs);
      const elapsed = performance.now() - start;

      expect(batchResult.size).toBe(allPairs.length);
      expect(elapsed).toBeLessThan(50); // <50ms for 200+ pairs

      am.close();
      await cleanup();
    });

    it('computeStats with 50 agents (1225 pairs) completes in <500ms', async () => {
      const { db, cleanup } = await makeTempDb();

      // Generate 50 agents → 1225 pairs
      const agents = Array.from({ length: 50 }, (_, i) => `agent_${String(i).padStart(3, '0')}`);
      const insertStmt = db.prepare(
        'INSERT INTO affinity_network(agent_a, agent_b, affinity, seed_value, interaction_count) VALUES(?, ?, ?, ?, 0)'
      );

      const insertTx = db.transaction(() => {
        for (let i = 0; i < agents.length; i++) {
          for (let j = i + 1; j < agents.length; j++) {
            const affinity = 0.1 + Math.random() * 0.85;
            const clamped = Math.min(0.95, Math.max(0.1, affinity));
            insertStmt.run(agents[i], agents[j], clamped, clamped);
          }
        }
      });
      insertTx();

      const am = new AffinityManager({ defaultAffinity: 0.7 }, db);

      const start = performance.now();
      const stats = am.computeStats(agents);
      const elapsed = performance.now() - start;

      expect(stats.pairCount).toBe(1225);
      expect(elapsed).toBeLessThan(500); // <500ms for 1225 pairs

      am.close();
      await cleanup();
    });
  });
});

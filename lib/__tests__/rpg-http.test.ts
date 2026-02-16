/**
 * Integration tests for RPG HTTP API (lib/rpg-http.ts)
 *
 * Spins up a real HTTP server with the RPG handler and tests all endpoints
 * against an in-memory SQLite database.
 *
 * Issue #78 — API Integration
 */

import http from 'node:http';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { handleRpgApi, createRpgRouter } from '../rpg-http';

// ─── Test helpers ───────────────────────────────────────────────────────────

let dbPath: string;
let db: Database.Database;
let tmpDir: string;
let server: http.Server;
let baseUrl: string;

function fetch(urlPath: string, method: string = 'GET'): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(`${baseUrl}${urlPath}`, { method }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        let body: any;
        try { body = JSON.parse(data); } catch { body = data; }
        resolve({ status: res.statusCode ?? 0, body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ─── Setup / Teardown ───────────────────────────────────────────────────────

beforeAll((done) => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-http-test-'));
  dbPath = path.join(tmpDir, 'test-rpg.db');

  db = new Database(dbPath);
  db.exec(`
    CREATE TABLE psionic_stats (
      snapshot_date TEXT NOT NULL,
      claims_with_citations INTEGER DEFAULT 0,
      total_claims INTEGER DEFAULT 0,
      knowledge_gaps INTEGER DEFAULT 0,
      cross_domain_links INTEGER DEFAULT 0,
      source_count INTEGER DEFAULT 0,
      mttr_minutes REAL DEFAULT 0,
      freshness_hours REAL DEFAULT 0
    );

    CREATE TABLE interaction_logs (
      created_at TEXT NOT NULL,
      agent_id TEXT,
      event_type TEXT,
      duration_ms INTEGER DEFAULT 0
    );

    CREATE TABLE khala_network (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_a TEXT NOT NULL,
      agent_b TEXT NOT NULL,
      affinity REAL NOT NULL,
      seed_value REAL NOT NULL,
      last_interaction_at TIMESTAMP,
      interaction_count INTEGER DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(agent_a, agent_b)
    );
  `);

  // Seed data
  db.prepare(`INSERT INTO psionic_stats VALUES ('2026-02-15', 4, 8, 1, 1, 3, 20.0, 10.0)`).run();
  db.prepare(`INSERT INTO psionic_stats VALUES ('2026-02-14', 9, 10, 3, 2, 5, 12.5, 4.0)`).run();
  db.prepare(`INSERT INTO interaction_logs VALUES ('2026-02-14 12:00:00', 'atlas', 'deploy_success', 1200)`).run();
  db.prepare(`INSERT INTO interaction_logs VALUES ('2026-02-14 13:00:00', 'sentinel', 'escalation_true', 50)`).run();
  db.prepare(`INSERT INTO interaction_logs VALUES ('2026-02-15 09:00:00', 'oracle', 'verify', 900)`).run();
  db.prepare(`INSERT INTO khala_network (agent_a, agent_b, affinity, seed_value, interaction_count) VALUES ('archivist', 'oracle', 0.8, 0.8, 1)`).run();
  db.prepare(`INSERT INTO khala_network (agent_a, agent_b, affinity, seed_value, interaction_count) VALUES ('atlas', 'oracle', 0.49, 0.7, 8)`).run();
  db.close();

  // Start a test server
  server = http.createServer((req, res) => {
    if (!handleRpgApi(req, res, { dbPath })) {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  server.listen(0, '127.0.0.1', () => {
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
    done();
  });
});

afterAll((done) => {
  server.close(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
    done();
  });
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('RPG HTTP API', () => {
  it('returns 404 for non-RPG URLs', async () => {
    const { status } = await fetch('/api/sessions');
    expect(status).toBe(404);
  });

  it('returns 405 for non-GET methods', async () => {
    const { status, body } = await fetch('/api/rpg/stats', 'POST');
    expect(status).toBe(405);
    expect(body.error).toContain('Method not allowed');
  });

  describe('GET /api/rpg/stats', () => {
    it('returns aggregate psionic stats', async () => {
      const { status, body } = await fetch('/api/rpg/stats');
      expect(status).toBe(200);
      expect(body.stats).toBeDefined();
      expect(body.stats.total_claims).toBe(8);
      expect(body.stats.claims_with_citations).toBe(4);
      expect(body.stats.citation_rate).toBe(0.5);
      expect(body.snapshots).toHaveLength(2);
      expect(body.snapshots[0].snapshot_date).toBe('2026-02-15');
    });
  });

  describe('GET /api/rpg/stats/:agentId', () => {
    it('returns per-agent stats', async () => {
      const { status, body } = await fetch('/api/rpg/stats/atlas');
      expect(status).toBe(200);
      expect(body.agentId).toBe('atlas');
      expect(body.stats.total_interactions).toBe(1);
      expect(body.interactions).toHaveLength(1);
      expect(body.interactions[0].event_type).toBe('deploy_success');
    });

    it('returns empty data for unknown agent', async () => {
      const { status, body } = await fetch('/api/rpg/stats/unknown-agent');
      expect(status).toBe(200);
      expect(body.agentId).toBe('unknown-agent');
      expect(body.stats.total_interactions).toBe(0);
      expect(body.interactions).toHaveLength(0);
    });
  });

  describe('GET /api/rpg/khala-network', () => {
    it('returns khala network edges sorted by affinity desc', async () => {
      const { status, body } = await fetch('/api/rpg/khala-network');
      expect(status).toBe(200);
      expect(body.edgeCount).toBe(2);
      expect(body.nodeCount).toBe(3); // archivist, oracle, atlas
      expect(body.edges[0].affinity).toBeGreaterThanOrEqual(body.edges[1].affinity);
    });
  });

  describe('GET /api/rpg/tactical-overlay', () => {
    it('returns overlay with stats, network, and interactions', async () => {
      const { status, body } = await fetch('/api/rpg/tactical-overlay/default');
      expect(status).toBe(200);
      expect(body.view).toBe('default');
      expect(body.stats).toBeDefined();
      expect(body.network).toBeDefined();
      expect(body.interactions).toBeDefined();
      expect(body.network.edgeCount).toBe(2);
    });
  });

  describe('GET /api/rpg/protocols', () => {
    it('returns protocol summaries grouped by event_type', async () => {
      const { status, body } = await fetch('/api/rpg/protocols');
      expect(status).toBe(200);
      expect(body.protocols).toBeDefined();
      expect(body.protocols.length).toBeGreaterThan(0);

      const deployProto = body.protocols.find(
        (p: { event_type: string }) => p.event_type === 'deploy_success',
      );
      expect(deployProto).toBeDefined();
      expect(deployProto.count).toBe(1);
      expect(deployProto.avg_duration_ms).toBe(1200);
    });
  });

  describe('GET /api/rpg/escalations', () => {
    it('returns escalation events', async () => {
      const { status, body } = await fetch('/api/rpg/escalations');
      expect(status).toBe(200);
      expect(body.escalations).toBeDefined();
      expect(body.total).toBe(1);
      expect(body.escalations[0].event_type).toBe('escalation_true');
    });
  });

  describe('error handling', () => {
    it('returns 503 when DB path is invalid', async () => {
      // Create a separate server with bad DB path
      const badServer = http.createServer((req, res) => {
        if (!handleRpgApi(req, res, { dbPath: '/nonexistent/path.db' })) {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      await new Promise<void>((resolve) => badServer.listen(0, '127.0.0.1', resolve));
      const addr = badServer.address() as { port: number };
      const badUrl = `http://127.0.0.1:${addr.port}`;

      const { status, body } = await new Promise<{ status: number; body: any }>((resolve, reject) => {
        http.get(`${badUrl}/api/rpg/stats`, (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          res.on('end', () => {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
          });
        }).on('error', reject);
      });

      expect(status).toBe(503);
      expect(body.error).toContain('unavailable');

      await new Promise<void>((resolve) => badServer.close(() => resolve()));
    });
  });

  describe('createRpgRouter factory', () => {
    it('creates a router with fixed dbPath', async () => {
      const router = createRpgRouter(dbPath);
      const factoryServer = http.createServer((req, res) => {
        if (!router.handleRpgApi(req, res)) {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      await new Promise<void>((resolve) => factoryServer.listen(0, '127.0.0.1', resolve));
      const addr = factoryServer.address() as { port: number };

      const { status, body } = await new Promise<{ status: number; body: any }>((resolve, reject) => {
        http.get(`http://127.0.0.1:${addr.port}/api/rpg/stats`, (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          res.on('end', () => {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
          });
        }).on('error', reject);
      });

      expect(status).toBe(200);
      expect(body.stats).toBeDefined();

      await new Promise<void>((resolve) => factoryServer.close(() => resolve()));
    });
  });
});

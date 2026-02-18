/**
 * Memory State route handler tests — Phase 4 (#233)
 *
 * Tests for GET /api/memory/state and GET /api/memory/observations endpoints.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import { handleMemoryState } from '../../../server/routes/memory-state.js';
import type { ServerResponse } from 'node:http';

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-state-test-'));
  dbPath = path.join(tmpDir, 'test-obs.db');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function createDeps(overrides: Partial<{ dbPath: string; defaultAgentId: string }> = {}) {
  return {
    dbPath: overrides.dbPath ?? dbPath,
    defaultAgentId: overrides.defaultAgentId ?? 'oracle',
    sendJson: (res: ServerResponse, data: unknown, status = 200) => {
      (res as any).writeHead(status, { 'Content-Type': 'application/json' });
      (res as any).end(JSON.stringify(data));
    },
  };
}

/**
 * Create the observation tables directly using better-sqlite3 (avoids CJS/ESM import issues
 * when importing ObservationStore from the lib/ CJS module into the dashboard ESM test env).
 */
function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS observations (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      content TEXT NOT NULL,
      source_conversation_id TEXT,
      source_message_id TEXT,
      source_agent_id TEXT NOT NULL,
      source_channel TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      token_input INTEGER,
      token_output INTEGER,
      token_total INTEGER,
      token_model TEXT,
      token_cost_usd REAL,
      metadata TEXT DEFAULT '{}',
      priority TEXT,
      referenced_date TEXT,
      source_message_ids TEXT
    );
    CREATE TABLE IF NOT EXISTS memory_state (
      agent_id TEXT PRIMARY KEY,
      observations_tokens INTEGER NOT NULL DEFAULT 0,
      raw_buffer_tokens INTEGER NOT NULL DEFAULT 0,
      last_observation_at TEXT,
      last_reflection_at TEXT,
      observation_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_observations_status ON observations(status);
    CREATE INDEX IF NOT EXISTS idx_observations_agent ON observations(source_agent_id);
    CREATE INDEX IF NOT EXISTS idx_observations_priority ON observations(priority);
  `);
}

function insertObservation(db: Database.Database, opts: {
  id: string;
  agentId?: string;
  priority?: string;
  content?: string;
  status?: string;
  category?: string;
}): void {
  db.prepare(`
    INSERT INTO observations (id, created_at, category, content, source_agent_id, status, priority, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, '{}')
  `).run(
    opts.id,
    new Date().toISOString(),
    opts.category ?? 'fact',
    opts.content ?? 'Test observation.',
    opts.agentId ?? 'oracle',
    opts.status ?? 'processed',
    opts.priority ?? 'medium',
  );
}

function insertMemoryState(db: Database.Database, opts: {
  agentId: string;
  observationsTokens?: number;
  observationCount?: number;
}): void {
  db.prepare(`
    INSERT INTO memory_state (agent_id, observations_tokens, raw_buffer_tokens, last_observation_at, observation_count)
    VALUES (?, ?, 0, ?, ?)
  `).run(
    opts.agentId,
    opts.observationsTokens ?? 1000,
    new Date().toISOString(),
    opts.observationCount ?? 0,
  );
}

function seedDb(observations: Array<{ id: string; agentId?: string; priority?: string; content?: string }>): void {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  createTables(db);
  for (const obs of observations) {
    insertObservation(db, obs);
  }
  if (observations.length > 0) {
    insertMemoryState(db, {
      agentId: observations[0].agentId ?? 'oracle',
      observationsTokens: 1000,
      observationCount: observations.length,
    });
  }
  db.close();
}

function createEmptyDb(): void {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  createTables(db);
  db.close();
}

describe('Memory State Routes', () => {
  // ─── Routing ────────────────────────────────────────────────────────

  describe('routing', () => {
    it('returns false for non-memory URLs', () => {
      expect(handleMemoryState(
        mockRequest({ url: '/api/sessions' }),
        mockResponse(),
        createDeps(),
      )).toBe(false);
    });

    it('returns false for POST method', () => {
      expect(handleMemoryState(
        mockRequest({ url: '/api/memory/state', method: 'POST' }),
        mockResponse(),
        createDeps(),
      )).toBe(false);
    });
  });

  // ─── GET /api/memory/state ──────────────────────────────────────────

  describe('GET /api/memory/state', () => {
    it('returns disabled state when database does not exist', () => {
      const res = mockResponse();
      handleMemoryState(
        mockRequest({ url: '/api/memory/state?agent_id=oracle' }),
        res,
        createDeps({ dbPath: path.join(tmpDir, 'nonexistent', 'no.db') }),
      );
      const body = parseJsonBody(res);
      expect(body.enabled).toBe(false);
      expect(body.agentId).toBe('oracle');
      expect(body.observationCount).toBe(0);
    });

    it('returns snapshot when database exists with data', () => {
      seedDb([
        { id: 'obs-1', priority: 'high' },
        { id: 'obs-2', priority: 'medium' },
        { id: 'obs-3', priority: 'info' },
      ]);

      const res = mockResponse();
      handleMemoryState(
        mockRequest({ url: '/api/memory/state?agent_id=oracle' }),
        res,
        createDeps(),
      );
      const body = parseJsonBody(res);
      expect(body.enabled).toBe(true);
      expect(body.agentId).toBe('oracle');
      expect(body.observationCount).toBe(3);
      expect(body.observationsTokens).toBe(1000);
      expect(body.priorityCounts).toEqual({ high: 1, medium: 1, info: 1 });
    });

    it('uses default agent ID when not specified', () => {
      createEmptyDb();
      const db = new Database(dbPath);
      insertMemoryState(db, { agentId: 'oracle', observationsTokens: 100 });
      db.close();

      const res = mockResponse();
      handleMemoryState(
        mockRequest({ url: '/api/memory/state' }),
        res,
        createDeps({ defaultAgentId: 'oracle' }),
      );
      const body = parseJsonBody(res);
      expect(body.agentId).toBe('oracle');
    });

    it('returns empty state for agent with no data', () => {
      createEmptyDb();

      const res = mockResponse();
      handleMemoryState(
        mockRequest({ url: '/api/memory/state?agent_id=nonexistent' }),
        res,
        createDeps(),
      );
      const body = parseJsonBody(res);
      expect(body.enabled).toBe(true);
      expect(body.observationCount).toBe(0);
      expect(body.priorityCounts).toEqual({ high: 0, medium: 0, info: 0 });
    });
  });

  // ─── GET /api/memory/observations ───────────────────────────────────

  describe('GET /api/memory/observations', () => {
    it('returns empty list when database does not exist', () => {
      const res = mockResponse();
      handleMemoryState(
        mockRequest({ url: '/api/memory/observations?agent_id=oracle' }),
        res,
        createDeps({ dbPath: path.join(tmpDir, 'nonexistent', 'no.db') }),
      );
      const body = parseJsonBody(res);
      expect(body.observations).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('returns observations with expected fields', () => {
      seedDb([
        { id: 'obs-1', priority: 'high', content: 'High item' },
        { id: 'obs-2', priority: 'medium', content: 'Medium item' },
      ]);

      const res = mockResponse();
      handleMemoryState(
        mockRequest({ url: '/api/memory/observations?agent_id=oracle' }),
        res,
        createDeps(),
      );
      const body = parseJsonBody(res);
      expect(body.agentId).toBe('oracle');
      expect(body.total).toBe(2);
      expect(body.observations).toHaveLength(2);
      const obs = body.observations[0] as Record<string, unknown>;
      expect(obs).toHaveProperty('id');
      expect(obs).toHaveProperty('createdAt');
      expect(obs).toHaveProperty('category');
      expect(obs).toHaveProperty('content');
      expect(obs).toHaveProperty('priority');
    });

    it('respects limit parameter', () => {
      const observations = Array.from({ length: 10 }, (_, i) => ({
        id: `obs-${i}`,
        content: `Item ${i}`,
      }));
      seedDb(observations);

      const res = mockResponse();
      handleMemoryState(
        mockRequest({ url: '/api/memory/observations?agent_id=oracle&limit=3' }),
        res,
        createDeps(),
      );
      const body = parseJsonBody(res);
      expect(body.observations).toHaveLength(3);
    });

    it('filters by priority', () => {
      seedDb([
        { id: 'obs-h', priority: 'high', content: 'High' },
        { id: 'obs-m', priority: 'medium', content: 'Medium' },
        { id: 'obs-i', priority: 'info', content: 'Info' },
      ]);

      const res = mockResponse();
      handleMemoryState(
        mockRequest({ url: '/api/memory/observations?agent_id=oracle&priority=high' }),
        res,
        createDeps(),
      );
      const body = parseJsonBody(res);
      expect(body.total).toBe(1);
      expect((body.observations as any[])[0].priority).toBe('high');
    });

    it('ignores invalid priority parameter', () => {
      seedDb([
        { id: 'obs-1', priority: 'high' },
        { id: 'obs-2', priority: 'medium' },
      ]);

      const res = mockResponse();
      handleMemoryState(
        mockRequest({ url: '/api/memory/observations?agent_id=oracle&priority=invalid' }),
        res,
        createDeps(),
      );
      const body = parseJsonBody(res);
      expect(body.total).toBe(2);
    });

    it('caps limit at 500', () => {
      seedDb([{ id: 'obs-1' }]);

      const res = mockResponse();
      handleMemoryState(
        mockRequest({ url: '/api/memory/observations?agent_id=oracle&limit=9999' }),
        res,
        createDeps(),
      );
      const body = parseJsonBody(res);
      expect(body.observations).toBeDefined();
    });
  });
});

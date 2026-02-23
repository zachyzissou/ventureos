/**
 * Task Card Export tests — Issue #219, Phase 26.
 *
 * Tests for:
 * - CSV/JSON format correctness (column headers, field values, structure)
 * - Secret-safe allowlist (no internal fields leak — error, tokensUsed, costEstimate)
 * - Bounded export (max 500 cards)
 * - Filter parity with task board REST API (status, agentId, priority, missionId, assigneeType, search)
 * - API endpoint: GET /api/task-board/export
 * - CSV escaping edge cases (commas, quotes, newlines in text fields)
 * - Empty dataset export
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  sanitizeCardForExport,
  csvEscapeCard,
  cardsToCsv,
  cardsToJson,
  exportTaskCards,
  filterCardsForExport,
  CARD_EXPORT_MAX_ITEMS,
} from '../../../server/task-card-export.js';

import type { TaskCard } from '../../../server/types.js';

import { mockRequest, mockResponse } from '../../helpers.js';
import { handleTaskBoard, loadTasks } from '../../../server/routes/task-board.js';
import type { TaskBoardDeps } from '../../../server/types.js';

// ─── Test Setup ──────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-card-export-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const NOW = 1_700_000_000_000;

function createDeps(overrides: Partial<TaskBoardDeps> = {}): TaskBoardDeps {
  return {
    dataDir: tmpDir,
    sendJson: (res, data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    },
    readRequestBody: async () => '{}',
    ...overrides,
  };
}

function makeCard(overrides: Partial<TaskCard> = {}): TaskCard {
  return {
    id: 'card-001',
    agentId: 'oracle',
    title: 'Deploy to production',
    description: 'Ship the latest release',
    priority: 'high',
    status: 'running',
    createdAt: NOW - 3600000,
    queuedAt: NOW - 3000000,
    startedAt: NOW - 1800000,
    completedAt: null,
    resultSummary: null,
    tokensUsed: 5000,
    error: 'some internal error trace /path/to/file',
    costEstimate: 0.42,
    runtimeMs: null,
    ...overrides,
  };
}

function seedTasks(cards: TaskCard[]): void {
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, 'task-board.json'),
    JSON.stringify({ tasks: cards, updatedAt: NOW }),
  );
}

// ─── sanitizeCardForExport ───────────────────────────────────────────────────

describe('sanitizeCardForExport', () => {
  it('includes only allowlisted fields', () => {
    const card = makeCard();
    const safe = sanitizeCardForExport(card);

    // Allowed fields present
    expect(safe).toHaveProperty('id');
    expect(safe).toHaveProperty('title');
    expect(safe).toHaveProperty('description');
    expect(safe).toHaveProperty('status');
    expect(safe).toHaveProperty('priority');
    expect(safe).toHaveProperty('agentId');
    expect(safe).toHaveProperty('missionId');
    expect(safe).toHaveProperty('missionBrief');
    expect(safe).toHaveProperty('assigneeType');
    expect(safe).toHaveProperty('assigneeId');
    expect(safe).toHaveProperty('createdAt');
    expect(safe).toHaveProperty('queuedAt');
    expect(safe).toHaveProperty('startedAt');
    expect(safe).toHaveProperty('completedAt');
    expect(safe).toHaveProperty('runtimeMs');
    expect(safe).toHaveProperty('resultSummary');
    expect(safe).toHaveProperty('dependencies');
    expect(safe).toHaveProperty('artifactLinks');
    expect(safe).toHaveProperty('replaySessionId');
  });

  it('excludes sensitive/internal fields (error, tokensUsed, costEstimate)', () => {
    const card = makeCard({
      error: 'FATAL: /internal/path/secrets.json',
      tokensUsed: 50000,
      costEstimate: 9.99,
    });
    const safe = sanitizeCardForExport(card);

    expect(safe).not.toHaveProperty('error');
    expect(safe).not.toHaveProperty('tokensUsed');
    expect(safe).not.toHaveProperty('costEstimate');

    // Verify the values are truly absent from the JSON representation
    const json = JSON.stringify(safe);
    expect(json).not.toContain('FATAL');
    expect(json).not.toContain('/internal/path');
    expect(json).not.toContain('secrets.json');
    expect(json).not.toContain('50000');
    expect(json).not.toContain('9.99');
  });

  it('formats timestamps as ISO 8601 strings', () => {
    const card = makeCard({ createdAt: 1700000000000 });
    const safe = sanitizeCardForExport(card);
    expect(safe.createdAt).toBe(new Date(1700000000000).toISOString());
  });

  it('returns empty string for null timestamps', () => {
    const card = makeCard({ completedAt: null, startedAt: null });
    const safe = sanitizeCardForExport(card);
    expect(safe.completedAt).toBe('');
    expect(safe.startedAt).toBe('');
  });

  it('returns empty string for null agentId', () => {
    const card = makeCard({ agentId: null });
    const safe = sanitizeCardForExport(card);
    expect(safe.agentId).toBe('');
  });
});

// ─── csvEscapeCard ───────────────────────────────────────────────────────────

describe('csvEscapeCard', () => {
  it('returns plain string for safe values', () => {
    expect(csvEscapeCard('hello')).toBe('hello');
    expect(csvEscapeCard(42)).toBe('42');
    expect(csvEscapeCard(true)).toBe('true');
  });

  it('wraps value with commas in double quotes', () => {
    expect(csvEscapeCard('hello, world')).toBe('"hello, world"');
  });

  it('escapes double quotes within values', () => {
    expect(csvEscapeCard('say "hi"')).toBe('"say ""hi"""');
  });

  it('wraps values with newlines', () => {
    expect(csvEscapeCard('line1\nline2')).toBe('"line1\nline2"');
  });

  it('returns empty string for null/undefined', () => {
    expect(csvEscapeCard(null)).toBe('');
    expect(csvEscapeCard(undefined)).toBe('');
  });
});

// ─── cardsToCsv ──────────────────────────────────────────────────────────────

describe('cardsToCsv', () => {
  it('produces header row + data rows', () => {
    const cards = [makeCard()];
    const csv = cardsToCsv(cards);
    const lines = csv.split('\n');

    expect(lines.length).toBe(2); // header + 1 data row
    expect(lines[0]).toBe(
      'id,title,description,status,priority,agentId,missionId,missionBrief,assigneeType,assigneeId,createdAt,queuedAt,startedAt,completedAt,runtimeMs,resultSummary,dependencies,artifactLinks,replaySessionId',
    );
  });

  it('returns only header row for empty array', () => {
    const csv = cardsToCsv([]);
    const lines = csv.split('\n');
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('id,title');
  });

  it('escapes CSV-special characters in title/description', () => {
    const card = makeCard({
      title: 'Fix "critical" bug, urgent',
      description: 'Line 1\nLine 2',
    });
    const csv = cardsToCsv([card]);
    const lines = csv.split('\n');
    // The data row should have escaped quotes and the comma-containing title
    expect(lines[1]).toContain('"Fix ""critical"" bug, urgent"');
  });

  it('does not include error, tokensUsed, or costEstimate columns', () => {
    const card = makeCard();
    const csv = cardsToCsv([card]);
    const header = csv.split('\n')[0];
    expect(header).not.toContain('error');
    expect(header).not.toContain('tokensUsed');
    expect(header).not.toContain('costEstimate');
  });
});

// ─── cardsToJson ─────────────────────────────────────────────────────────────

describe('cardsToJson', () => {
  it('produces valid JSON with export metadata', () => {
    const cards = [makeCard()];
    const jsonStr = cardsToJson(cards);
    const parsed = JSON.parse(jsonStr);

    expect(parsed).toHaveProperty('exportedAt');
    expect(parsed.format).toBe('ventureos-task-cards-export-v1');
    expect(parsed.count).toBe(1);
    expect(parsed.cards).toHaveLength(1);
  });

  it('does not include sensitive fields in cards', () => {
    const card = makeCard({
      error: 'SECRET_TOKEN_LEAKED',
      tokensUsed: 99999,
      costEstimate: 42.5,
    });
    const jsonStr = cardsToJson([card]);

    expect(jsonStr).not.toContain('SECRET_TOKEN_LEAKED');
    expect(jsonStr).not.toContain('99999');
    expect(jsonStr).not.toContain('tokensUsed');
    expect(jsonStr).not.toContain('costEstimate');
    // 'error' as a key should not appear
    const parsed = JSON.parse(jsonStr);
    expect(parsed.cards[0]).not.toHaveProperty('error');
    expect(parsed.cards[0]).not.toHaveProperty('tokensUsed');
    expect(parsed.cards[0]).not.toHaveProperty('costEstimate');
  });

  it('returns empty cards array for no data', () => {
    const jsonStr = cardsToJson([]);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.count).toBe(0);
    expect(parsed.cards).toEqual([]);
  });
});

// ─── filterCardsForExport ────────────────────────────────────────────────────

describe('filterCardsForExport', () => {
  const cards: TaskCard[] = [
    makeCard({
      id: '1',
      status: 'running',
      agentId: 'oracle',
      priority: 'high',
      title: 'Deploy service',
      missionId: 'm-001',
      assigneeType: 'agent',
    }),
    makeCard({
      id: '2',
      status: 'done',
      agentId: 'nexus',
      priority: 'medium',
      title: 'Write tests',
      missionId: 'm-002',
      assigneeType: 'nexus',
    }),
    makeCard({
      id: '3',
      status: 'failed',
      agentId: 'oracle',
      priority: 'critical',
      title: 'Fix deploy bug',
      missionId: 'm-001',
      assigneeType: 'human',
    }),
    makeCard({
      id: '4',
      status: 'backlog',
      agentId: null,
      priority: 'low',
      title: 'Cleanup docs',
      missionId: null,
      assigneeType: 'nexus',
    }),
  ];

  it('filters by status', () => {
    const result = filterCardsForExport(cards, { status: 'running' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('filters by agentId', () => {
    const result = filterCardsForExport(cards, { agentId: 'oracle' });
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.id)).toEqual(['1', '3']);
  });

  it('filters by priority', () => {
    const result = filterCardsForExport(cards, { priority: 'critical' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3');
  });

  it('filters by missionId', () => {
    const result = filterCardsForExport(cards, { missionId: 'm-001' });
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.id)).toEqual(['1', '3']);
  });

  it('filters by assigneeType', () => {
    const result = filterCardsForExport(cards, { assigneeType: 'nexus' });
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.id)).toEqual(['2', '4']);
  });

  it('filters by search (title substring)', () => {
    const result = filterCardsForExport(cards, { search: 'deploy' });
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.id)).toEqual(['1', '3']);
  });

  it('filters by search (case insensitive)', () => {
    const result = filterCardsForExport(cards, { search: 'DEPLOY' });
    expect(result).toHaveLength(2);
  });

  it('combines multiple filters (AND logic)', () => {
    const result = filterCardsForExport(cards, { agentId: 'oracle', status: 'failed' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3');
  });

  it('returns all cards when no filters applied', () => {
    const result = filterCardsForExport(cards, {});
    expect(result).toHaveLength(4);
  });

  it('ignores invalid status values', () => {
    const result = filterCardsForExport(cards, { status: 'invalid_status' });
    expect(result).toHaveLength(4);
  });

  it('ignores invalid priority values', () => {
    const result = filterCardsForExport(cards, { priority: 'ultra' });
    expect(result).toHaveLength(4);
  });

  it('ignores invalid assigneeType values', () => {
    const result = filterCardsForExport(cards, { assigneeType: 'invalid' });
    expect(result).toHaveLength(4);
  });
});

// ─── exportTaskCards ─────────────────────────────────────────────────────────

describe('exportTaskCards', () => {
  it('exports CSV format with correct content type', () => {
    const cards = [makeCard()];
    const result = exportTaskCards(cards, { format: 'csv' });

    expect(result.contentType).toBe('text/csv; charset=utf-8');
    expect(result.filename).toMatch(/^task-cards-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(result.count).toBe(1);
    expect(result.content).toContain('id,title');
  });

  it('exports JSON format with correct content type', () => {
    const cards = [makeCard()];
    const result = exportTaskCards(cards, { format: 'json' });

    expect(result.contentType).toBe('application/json; charset=utf-8');
    expect(result.filename).toMatch(/^task-cards-\d{4}-\d{2}-\d{2}\.json$/);
    expect(result.count).toBe(1);
    const parsed = JSON.parse(result.content);
    expect(parsed.format).toBe('ventureos-task-cards-export-v1');
  });

  it('defaults to JSON format', () => {
    const result = exportTaskCards([makeCard()]);
    expect(result.contentType).toBe('application/json; charset=utf-8');
  });

  it('applies filters before export', () => {
    const cards = [
      makeCard({ id: '1', status: 'running' }),
      makeCard({ id: '2', status: 'done' }),
    ];
    const result = exportTaskCards(cards, { format: 'json', status: 'done' });
    expect(result.count).toBe(1);
    const parsed = JSON.parse(result.content);
    expect(parsed.cards[0].id).toBe('2');
  });

  it('enforces maximum export limit', () => {
    // Create more cards than the max
    const cards: TaskCard[] = [];
    for (let i = 0; i < CARD_EXPORT_MAX_ITEMS + 50; i++) {
      cards.push(makeCard({ id: `card-${i}` }));
    }
    const result = exportTaskCards(cards, { format: 'json' });
    expect(result.count).toBe(CARD_EXPORT_MAX_ITEMS);
  });

  it('respects custom limit below maximum', () => {
    const cards = Array.from({ length: 20 }, (_, i) =>
      makeCard({ id: `card-${i}` }),
    );
    const result = exportTaskCards(cards, { format: 'json', limit: 5 });
    expect(result.count).toBe(5);
  });

  it('clamps limit to at least 1', () => {
    const cards = [makeCard()];
    const result = exportTaskCards(cards, { format: 'json', limit: -10 });
    expect(result.count).toBe(1);
  });

  it('handles empty dataset', () => {
    const result = exportTaskCards([], { format: 'csv' });
    expect(result.count).toBe(0);
    expect(result.content).toContain('id,title'); // Header row still present
    expect(result.content.split('\n').length).toBe(1);
  });
});

// ─── Bounds constant ─────────────────────────────────────────────────────────

describe('CARD_EXPORT_MAX_ITEMS', () => {
  it('is 500', () => {
    expect(CARD_EXPORT_MAX_ITEMS).toBe(500);
  });
});

// ─── API Endpoint Integration ────────────────────────────────────────────────

describe('GET /api/task-board/export', () => {
  it('returns JSON export with correct headers', async () => {
    const cards = [
      makeCard({ id: 'c1', status: 'done', completedAt: NOW }),
      makeCard({ id: 'c2', status: 'running' }),
    ];
    seedTasks(cards);

    const req = mockRequest({ method: 'GET', url: '/api/task-board/export?format=json' });
    const res = mockResponse();
    const deps = createDeps();

    const handled = await handleTaskBoard(req, res, deps);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);
    expect(res._headers['content-type']).toBe('application/json; charset=utf-8');
    expect(res._headers['content-disposition']).toMatch(/attachment; filename="task-cards-.*\.json"/);
    expect(res._headers['cache-control']).toBe('no-store');
    expect(res._headers['x-export-count']).toBe('2');

    const parsed = JSON.parse(res._body);
    expect(parsed.format).toBe('ventureos-task-cards-export-v1');
    expect(parsed.count).toBe(2);
    expect(parsed.cards).toHaveLength(2);
  });

  it('returns CSV export with correct headers', async () => {
    seedTasks([makeCard()]);

    const req = mockRequest({ method: 'GET', url: '/api/task-board/export?format=csv' });
    const res = mockResponse();
    const deps = createDeps();

    const handled = await handleTaskBoard(req, res, deps);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);
    expect(res._headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res._headers['content-disposition']).toMatch(/attachment; filename="task-cards-.*\.csv"/);
  });

  it('applies status filter', async () => {
    seedTasks([
      makeCard({ id: 'c1', status: 'done', completedAt: NOW }),
      makeCard({ id: 'c2', status: 'running' }),
    ]);

    const req = mockRequest({ method: 'GET', url: '/api/task-board/export?format=json&status=done' });
    const res = mockResponse();
    const deps = createDeps();

    await handleTaskBoard(req, res, deps);
    const parsed = JSON.parse(res._body);
    expect(parsed.count).toBe(1);
    expect(parsed.cards[0].status).toBe('done');
  });

  it('applies agentId filter', async () => {
    seedTasks([
      makeCard({ id: 'c1', agentId: 'oracle' }),
      makeCard({ id: 'c2', agentId: 'nexus' }),
    ]);

    const req = mockRequest({ method: 'GET', url: '/api/task-board/export?format=json&agentId=nexus' });
    const res = mockResponse();
    const deps = createDeps();

    await handleTaskBoard(req, res, deps);
    const parsed = JSON.parse(res._body);
    expect(parsed.count).toBe(1);
    expect(parsed.cards[0].agentId).toBe('nexus');
  });

  it('applies priority filter', async () => {
    seedTasks([
      makeCard({ id: 'c1', priority: 'high' }),
      makeCard({ id: 'c2', priority: 'low' }),
    ]);

    const req = mockRequest({ method: 'GET', url: '/api/task-board/export?format=json&priority=low' });
    const res = mockResponse();
    const deps = createDeps();

    await handleTaskBoard(req, res, deps);
    const parsed = JSON.parse(res._body);
    expect(parsed.count).toBe(1);
    expect(parsed.cards[0].priority).toBe('low');
  });

  it('applies search filter', async () => {
    seedTasks([
      makeCard({ id: 'c1', title: 'Deploy service' }),
      makeCard({ id: 'c2', title: 'Write documentation' }),
    ]);

    const req = mockRequest({ method: 'GET', url: '/api/task-board/export?format=json&search=deploy' });
    const res = mockResponse();
    const deps = createDeps();

    await handleTaskBoard(req, res, deps);
    const parsed = JSON.parse(res._body);
    expect(parsed.count).toBe(1);
    expect(parsed.cards[0].title).toBe('Deploy service');
  });

  it('returns empty export for no matching cards', async () => {
    seedTasks([makeCard({ status: 'running' })]);

    const req = mockRequest({ method: 'GET', url: '/api/task-board/export?format=json&status=done' });
    const res = mockResponse();
    const deps = createDeps();

    await handleTaskBoard(req, res, deps);
    expect(res._headers['x-export-count']).toBe('0');
    const parsed = JSON.parse(res._body);
    expect(parsed.count).toBe(0);
    expect(parsed.cards).toEqual([]);
  });

  it('caps at CARD_EXPORT_MAX_ITEMS', async () => {
    const cards: TaskCard[] = [];
    for (let i = 0; i < CARD_EXPORT_MAX_ITEMS + 10; i++) {
      cards.push(makeCard({ id: `card-${i}` }));
    }
    seedTasks(cards);

    const req = mockRequest({ method: 'GET', url: '/api/task-board/export?format=json' });
    const res = mockResponse();
    const deps = createDeps();

    await handleTaskBoard(req, res, deps);
    const parsed = JSON.parse(res._body);
    expect(parsed.count).toBe(CARD_EXPORT_MAX_ITEMS);
  });

  it('handles empty task board (no file)', async () => {
    // Don't seed any tasks
    const req = mockRequest({ method: 'GET', url: '/api/task-board/export?format=json' });
    const res = mockResponse();
    const deps = createDeps();

    const handled = await handleTaskBoard(req, res, deps);
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);
    const parsed = JSON.parse(res._body);
    expect(parsed.count).toBe(0);
  });

  it('defaults to JSON when format parameter is missing', async () => {
    seedTasks([makeCard()]);

    const req = mockRequest({ method: 'GET', url: '/api/task-board/export' });
    const res = mockResponse();
    const deps = createDeps();

    await handleTaskBoard(req, res, deps);
    expect(res._headers['content-type']).toBe('application/json; charset=utf-8');
  });
});

// ─── Secret Safety (comprehensive) ──────────────────────────────────────────

describe('secret safety', () => {
  it('never leaks error field content in CSV export', () => {
    const card = makeCard({
      error: 'Error: ENOENT /home/user/.secrets/api-key.json\nStack trace: internal',
    });
    const csv = cardsToCsv([card]);
    expect(csv).not.toContain('ENOENT');
    expect(csv).not.toContain('.secrets');
    expect(csv).not.toContain('api-key');
    expect(csv).not.toContain('Stack trace');
  });

  it('never leaks error field content in JSON export', () => {
    const card = makeCard({
      error: 'Error: ENOENT /home/user/.secrets/api-key.json',
    });
    const json = cardsToJson([card]);
    expect(json).not.toContain('ENOENT');
    expect(json).not.toContain('.secrets');
    expect(json).not.toContain('api-key');
  });

  it('never leaks tokensUsed in any format', () => {
    const card = makeCard({ tokensUsed: 123456 });
    const csv = cardsToCsv([card]);
    const json = cardsToJson([card]);
    // tokensUsed=123456 should not appear in output
    expect(csv).not.toContain('123456');
    expect(json).not.toContain('123456');
  });

  it('never leaks costEstimate in any format', () => {
    const card = makeCard({ costEstimate: 3.14159 });
    const csv = cardsToCsv([card]);
    const json = cardsToJson([card]);
    expect(csv).not.toContain('3.14159');
    expect(json).not.toContain('3.14159');
  });

  it('exported JSON has no extra properties beyond allowlist', () => {
    const card = makeCard();
    const json = cardsToJson([card]);
    const parsed = JSON.parse(json);
    const cardKeys = Object.keys(parsed.cards[0]).sort();
    const expectedKeys = [
      'agentId', 'artifactLinks', 'assigneeId', 'assigneeType', 'completedAt',
      'createdAt', 'dependencies', 'description', 'id', 'missionBrief',
      'missionId', 'priority', 'queuedAt', 'replaySessionId', 'resultSummary',
      'runtimeMs', 'startedAt', 'status', 'title',
    ];
    expect(cardKeys).toEqual(expectedKeys);
  });
});

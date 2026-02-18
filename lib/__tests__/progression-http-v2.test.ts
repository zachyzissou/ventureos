/**
 * Phase 2 HTTP Route Tests — Issue #207
 */
import fs from 'node:fs';
import path from 'node:path';
import { IncomingMessage, ServerResponse } from 'node:http';
import { handleProgressionV2Api } from '../progression-http-v2';
import { ProgressionStore } from '../progression-store';

const dbPath = path.join(__dirname, '__test_http_v2.db');
let store: ProgressionStore;

function createMockReq(method: string, url: string, body?: string): IncomingMessage {
  const { PassThrough } = require('node:stream');
  const req = new PassThrough() as any;
  req.method = method;
  req.url = url;
  if (body) { setTimeout(() => { req.write(body); req.end(); }, 5); }
  else { setTimeout(() => req.end(), 5); }
  return req as IncomingMessage;
}

function createMockRes(): { res: ServerResponse; getResult: () => Promise<{ status: number; body: any }> } {
  const { PassThrough } = require('node:stream');
  const res = new PassThrough() as any;
  let status = 0;
  let data = '';
  res.writeHead = (s: number) => { status = s; };
  res.end = (d?: string) => { data = d ?? ''; };
  return {
    res: res as ServerResponse,
    getResult: () => new Promise((resolve) => {
      setTimeout(() => resolve({ status, body: data ? JSON.parse(data) : null }), 100);
    }),
  };
}

async function callRoute(method: string, url: string, body?: string) {
  const req = createMockReq(method, url, body);
  const { res, getResult } = createMockRes();
  handleProgressionV2Api(req, res, { dbPath });
  return getResult();
}

beforeEach(() => {
  try { fs.unlinkSync(dbPath); } catch {}
  store = new ProgressionStore(dbPath);
});

afterEach(() => {
  store.close();
  try { fs.unlinkSync(dbPath); } catch {}
});

describe('GET /api/rpg/progression/tree', () => {
  it('returns tree with nodes and validation', async () => {
    const { status, body } = await callRoute('GET', '/api/rpg/progression/tree');
    expect(status).toBe(200);
    expect(body.nodes.length).toBe(15);
    expect(body.validation.valid).toBe(true);
  });
});

describe('GET /api/rpg/progression/tree/state/:agentId', () => {
  it('returns tree with node states for agent', async () => {
    store.getOrCreateProfile('oracle');
    const { status, body } = await callRoute('GET', '/api/rpg/progression/tree/state/oracle');
    expect(status).toBe(200);
    expect(body.agent_id).toBe('oracle');
    expect(body.nodes[0].state).toBeDefined();
  });
});

describe('POST /api/rpg/progression/tree/nodes', () => {
  it('creates a new node', async () => {
    const { status, body } = await callRoute('POST', '/api/rpg/progression/tree/nodes',
      JSON.stringify({ node_id: 'test-1', name: 'Test', category: 'engineering', xp_cost: 100, tier: 1, prerequisites: [] }));
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.node.node_id).toBe('test-1');
  });

  it('rejects missing fields', async () => {
    const { status } = await callRoute('POST', '/api/rpg/progression/tree/nodes',
      JSON.stringify({ name: 'Test' }));
    expect(status).toBe(400);
  });
});

describe('GET /api/rpg/progression/tree/validate', () => {
  it('returns validation result', async () => {
    const { status, body } = await callRoute('GET', '/api/rpg/progression/tree/validate');
    expect(status).toBe(200);
    expect(body.valid).toBe(true);
  });
});

describe('POST /api/rpg/progression/tree/layouts', () => {
  it('saves layouts', async () => {
    const { status, body } = await callRoute('POST', '/api/rpg/progression/tree/layouts',
      JSON.stringify({ layouts: [{ node_id: 'eng-1', x: 100, y: 200 }] }));
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.saved).toBe(1);
  });
});

describe('GET /api/rpg/progression/tree/export', () => {
  it('exports tree definition', async () => {
    const { status, body } = await callRoute('GET', '/api/rpg/progression/tree/export');
    expect(status).toBe(200);
    expect(body.nodes.length).toBe(15);
    expect(body.edges.length).toBe(10);
  });
});

describe('POST /api/rpg/progression/tree/import', () => {
  it('imports a tree definition', async () => {
    const { status: exStatus, body: exportBody } = await callRoute('GET', '/api/rpg/progression/tree/export');
    expect(exStatus).toBe(200);
    const { status, body } = await callRoute('POST', '/api/rpg/progression/tree/import',
      JSON.stringify(exportBody));
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.imported).toBe(15);
  });
});

describe('GET /api/rpg/progression/attribution/:agentId', () => {
  it('returns XP attribution for agent', async () => {
    store.getOrCreateProfile('oracle');
    store.ingestXpEvent('oracle', 50, 'code_review', 'test');
    const { status, body } = await callRoute('GET', '/api/rpg/progression/attribution/oracle');
    expect(status).toBe(200);
    expect(body.agent_id).toBe('oracle');
  });
});

describe('GET /api/rpg/progression/attribution', () => {
  it('returns global attribution', async () => {
    store.getOrCreateProfile('oracle');
    store.ingestXpEvent('oracle', 50, 'code_review', 'test');
    const { status, body } = await callRoute('GET', '/api/rpg/progression/attribution');
    expect(status).toBe(200);
    expect(body.attribution).toBeDefined();
  });
});

describe('GET /api/rpg/progression/simulate/:agentId', () => {
  it('returns prestige simulation', async () => {
    store.getOrCreateProfile('oracle');
    const { status, body } = await callRoute('GET', '/api/rpg/progression/simulate/oracle');
    expect(status).toBe(200);
    expect(body.eligible).toBe(false);
  });

  it('returns 404 for unknown agent', async () => {
    const { status } = await callRoute('GET', '/api/rpg/progression/simulate/unknown');
    expect(status).toBe(404);
  });
});

describe('GET /api/rpg/progression/milestones', () => {
  it('returns milestones list', async () => {
    store.recordMilestone('oracle', 'level_up', 'Level 5', 'desc');
    const { status, body } = await callRoute('GET', '/api/rpg/progression/milestones');
    expect(status).toBe(200);
    expect(body.milestones.length).toBe(1);
  });
});

describe('POST /api/rpg/progression/unlock', () => {
  it('unlocks a skill and deducts XP', async () => {
    store.getOrCreateProfile('oracle');
    store.ingestXpEvent('oracle', 200, 'code_review', 'test');
    store.ingestXpEvent('oracle', 200, 'bug_fix', 'test');
    const { status, body } = await callRoute('POST', '/api/rpg/progression/unlock',
      JSON.stringify({ agent_id: 'oracle', node_id: 'eng-1' }));
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.unlock.node_id).toBe('eng-1');
  });

  it('rejects missing fields', async () => {
    const { status } = await callRoute('POST', '/api/rpg/progression/unlock',
      JSON.stringify({ agent_id: 'oracle' }));
    expect(status).toBe(400);
  });
});

describe('GET /api/rpg/progression/history/:agentId', () => {
  it('returns XP history', async () => {
    store.getOrCreateProfile('oracle');
    store.ingestXpEvent('oracle', 50, 'code_review', 'test');
    const { status, body } = await callRoute('GET', '/api/rpg/progression/history/oracle');
    expect(status).toBe(200);
    expect(body.agent_id).toBe('oracle');
  });
});

describe('Route matching', () => {
  it('returns false for non-matching routes', async () => {
    const req = createMockReq('GET', '/api/other/path');
    const { res } = createMockRes();
    const handled = handleProgressionV2Api(req, res, { dbPath });
    expect(handled).toBe(false);
  });

  it('v1 routes still fall through (not captured by v2)', async () => {
    const req = createMockReq('GET', '/api/rpg/progression/summary');
    const { res } = createMockRes();
    const handled = handleProgressionV2Api(req, res, { dbPath });
    expect(handled).toBe(false);
  });
});

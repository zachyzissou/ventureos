/**
 * Progression HTTP V2 Routes — VentureOS Phase 4.5 Phase 2
 *
 * Handles skill tree CRUD, XP attribution, prestige simulation,
 * milestones, and skill unlock endpoints.
 *
 * Issue #207 — Phase 4.5 Phase 2: Visual Skill Tree UI & Progression Polish
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { ProgressionStore } from './progression-store';
import { getNodeState, simulatePrestige } from './progression-engine';
import type { ProgressionHandlerOptions } from './types/progression';

const PREFIX = '/api/rpg/progression';

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export function handleProgressionV2Api(
  req: IncomingMessage,
  res: ServerResponse,
  opts: ProgressionHandlerOptions,
): boolean {
  const url = req.url ?? '';
  const method = req.method ?? 'GET';

  if (!url.startsWith(PREFIX + '/')) return false;
  const path = url.slice(PREFIX.length);

  // Route matching — only handle Phase 2 paths
  const treeMatch = path === '/tree' && method === 'GET';
  const treeStateMatch = path.startsWith('/tree/state/') && method === 'GET';
  const treeNodesPost = path === '/tree/nodes' && method === 'POST';
  const treeNodesDelete = path === '/tree/nodes' && method === 'DELETE';
  const treeLayoutsPost = path === '/tree/layouts' && method === 'POST';
  const treeValidate = path === '/tree/validate' && method === 'GET';
  const treeExport = path === '/tree/export' && method === 'GET';
  const treeImportPost = path === '/tree/import' && method === 'POST';
  const attrAgent = path.startsWith('/attribution/') && method === 'GET';
  const attrGlobal = path === '/attribution' && method === 'GET';
  const simMatch = path.startsWith('/simulate/') && method === 'GET';
  const milestonesGet = path === '/milestones' && method === 'GET';
  const unlockPost = path === '/unlock' && method === 'POST';
  const historyMatch = path.startsWith('/history/') && method === 'GET';

  const isV2Route = treeMatch || treeStateMatch || treeNodesPost || treeNodesDelete ||
    treeLayoutsPost || treeValidate || treeExport || treeImportPost ||
    attrAgent || attrGlobal || simMatch || milestonesGet || unlockPost || historyMatch;

  if (!isV2Route) return false;

  // Handle async routes
  (async () => {
    let store: ProgressionStore | null = null;
    try {
      store = new ProgressionStore(opts.dbPath);

      // GET /tree — full tree + layouts + validation
      if (treeMatch) {
        const nodes = store.getSkillNodes();
        const edges = store.getSkillEdges();
        const layouts = store.getNodeLayouts();
        const validation = store.validateTree();
        return json(res, 200, { nodes, edges, layouts, validation });
      }

      // GET /tree/state/:agentId — tree with node states
      if (treeStateMatch) {
        const agentId = path.slice('/tree/state/'.length);
        const nodes = store.getSkillNodes();
        const edges = store.getSkillEdges();
        const layouts = store.getNodeLayouts();
        const unlocks = store.getUnlocks(agentId);
        const unlockedIds = new Set(unlocks.map(u => u.node_id));
        const annotated = nodes.map(n => ({
          ...n,
          state: getNodeState(n.node_id, n, unlockedIds),
        }));
        return json(res, 200, { nodes: annotated, edges, layouts, agent_id: agentId });
      }

      // POST /tree/nodes — upsert skill node
      if (treeNodesPost) {
        const body = JSON.parse(await readBody(req));
        const { node_id, name, description, category, xp_cost, tier, prerequisites } = body;
        if (!node_id || !name || !category) return json(res, 400, { ok: false, error: 'Missing required fields: node_id, name, category' });
        const node = store.upsertSkillNode(node_id, name, description ?? '', category, xp_cost ?? 100, tier ?? 1, prerequisites ?? []);
        return json(res, 200, { ok: true, node });
      }

      // DELETE /tree/nodes — delete skill node
      if (treeNodesDelete) {
        const body = JSON.parse(await readBody(req));
        if (!body.node_id) return json(res, 400, { ok: false, error: 'Missing node_id' });
        const deleted = store.deleteSkillNode(body.node_id);
        return json(res, 200, { ok: true, deleted });
      }

      // POST /tree/layouts — save node positions
      if (treeLayoutsPost) {
        const body = JSON.parse(await readBody(req));
        if (!body.layouts || !Array.isArray(body.layouts)) return json(res, 400, { ok: false, error: 'Missing layouts array' });
        store.saveNodeLayouts(body.layouts);
        return json(res, 200, { ok: true, saved: body.layouts.length });
      }

      // GET /tree/validate — validate tree
      if (treeValidate) {
        const validation = store.validateTree();
        return json(res, 200, validation);
      }

      // GET /tree/export — export tree
      if (treeExport) {
        const tree = store.exportTree();
        return json(res, 200, tree);
      }

      // POST /tree/import — import tree
      if (treeImportPost) {
        const body = JSON.parse(await readBody(req));
        if (!body.nodes || !body.edges) return json(res, 400, { ok: false, error: 'Missing nodes or edges' });
        store.importTree(body);
        return json(res, 200, { ok: true, imported: body.nodes.length });
      }

      // GET /attribution/:agentId — agent XP attribution
      if (attrAgent) {
        const agentId = path.slice('/attribution/'.length);
        const attribution = store.getXpAttribution(agentId);
        return json(res, 200, { agent_id: agentId, attribution });
      }

      // GET /attribution — global XP attribution
      if (attrGlobal) {
        const attribution = store.getGlobalXpAttribution();
        return json(res, 200, { attribution });
      }

      // GET /simulate/:agentId — prestige simulation
      if (simMatch) {
        const agentId = path.slice('/simulate/'.length);
        const profile = store.getProfile(agentId);
        if (!profile) return json(res, 404, { ok: false, error: 'Profile not found' });
        const unlocks = store.getUnlocks(agentId);
        const sim = simulatePrestige(profile, unlocks.length);
        return json(res, 200, { agent_id: agentId, ...sim });
      }

      // GET /milestones — recent milestones
      if (milestonesGet) {
        const milestones = store.getRecentMilestones();
        return json(res, 200, { milestones });
      }

      // POST /unlock — unlock a skill (uses V1 unlockSkill which returns rich result)
      if (unlockPost) {
        const body = JSON.parse(await readBody(req));
        if (!body.agent_id || !body.node_id) return json(res, 400, { ok: false, error: 'Missing agent_id or node_id' });
        const result = store.unlockSkill(body.agent_id, body.node_id);
        return json(res, 200, { ok: true, unlock: result.unlock });
      }

      // GET /history/:agentId — XP history
      if (historyMatch) {
        const agentId = path.slice('/history/'.length);
        const history = store.getXpHistory(agentId);
        return json(res, 200, { agent_id: agentId, history });
      }
    } catch (err: any) {
      json(res, err.message?.includes('not found') ? 404 : 400, { ok: false, error: err.message ?? 'Unknown error' });
    } finally {
      store?.close();
    }
  })();

  return true;
}

/**
 * Integration test: MissionRunner + RuntimeConversationBridge
 *
 * Validates end-to-end that running a mission through MissionRunner
 * with conversation hooks produces real conversation state with messages
 * for each lifecycle event.
 *
 * Fixes #184
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import Database from 'better-sqlite3';

import { MissionRunner } from '../mission-runner';
import { RuntimeConversationBridge, missionConversationId } from '../runtime-conversation-bridge';
import { ConversationEngine, FileConversationStore } from '../conversation-engine';
import { ConversationAPI } from '../conversation-api';
import { RateLimiter } from '../rate-limiter';
import { HITLEngine } from '../hitl';
import { AffinityManager } from '../affinity-manager';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function makeTempDir(prefix: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return { dir, cleanup: () => fs.rm(dir, { recursive: true, force: true }) };
}

async function makeTempAffinityDb() {
  const { dir, cleanup } = await makeTempDir('ventureos-intg-affdb-');
  const dbPath = path.join(dir, 'affinity.db');
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE affinity_network (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_a TEXT NOT NULL, agent_b TEXT NOT NULL,
      affinity REAL NOT NULL, seed_value REAL NOT NULL,
      last_interaction_at TIMESTAMP, interaction_count INTEGER DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(agent_a, agent_b), CHECK(agent_a < agent_b),
      CHECK(affinity >= 0.10 AND affinity <= 0.95)
    );
    CREATE TABLE affinity_drift_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_a TEXT NOT NULL, agent_b TEXT NOT NULL,
      old_affinity REAL NOT NULL, new_affinity REAL NOT NULL,
      delta REAL NOT NULL, reason TEXT NOT NULL,
      interaction_type TEXT, related_mission_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return { db, cleanup: async () => { db.close(); await cleanup(); } };
}

function makeNow(startIso = '2026-02-17T00:00:00.000Z') {
  let t = Date.parse(startIso);
  return () => {
    const d = new Date(t);
    t += 1000;
    return d;
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('MissionRunner + ConversationBridge integration', () => {
  let persistDir: string;
  let missionStateDir: string;
  let artifactsDir: string;
  let cleanup: Array<() => Promise<void>>;
  let affinityDb: Database.Database;
  let api: ConversationAPI;
  let bridge: RuntimeConversationBridge;

  beforeEach(async () => {
    cleanup = [];

    const tmp1 = await makeTempDir('ventureos-intg-conv-');
    persistDir = tmp1.dir;
    cleanup.push(tmp1.cleanup);

    const tmp2 = await makeTempDir('ventureos-intg-state-');
    missionStateDir = tmp2.dir;
    cleanup.push(tmp2.cleanup);

    const tmp3 = await makeTempDir('ventureos-intg-art-');
    artifactsDir = tmp3.dir;
    cleanup.push(tmp3.cleanup);

    const affTmp = await makeTempAffinityDb();
    affinityDb = affTmp.db;
    cleanup.push(affTmp.cleanup);

    const rateLimiter = new RateLimiter({
      agentPerMinute: 1000, agentPerHour: 1000,
      conversationPerMinute: 1000, conversationPerHour: 1000,
      burstAllowance: false,
    });
    const hitl = new HITLEngine();
    const affinity = new AffinityManager({ lowAffinityThreshold: 0.1 }, affinityDb);

    const engine = new ConversationEngine({
      config: { persistDir, enforceTurns: false },
      store: new FileConversationStore(persistDir),
      affinityManager: affinity,
      securityDeps: { rateLimiter, hitl },
    });

    api = new ConversationAPI(engine);
    bridge = new RuntimeConversationBridge(api, { silent: true });
  });

  afterEach(async () => {
    for (const fn of cleanup) await fn();
  });

  it('full mission lifecycle creates conversation with all events', async () => {
    const now = makeNow();

    const runner = new MissionRunner({
      persistDir: missionStateDir,
      artifactsDir,
      now,
      hooks: bridge,
      agents: [
        {
          id: 'synth',
          async runTask(task) {
            return { summary: `done: ${task.title}`, artifacts: [{ name: 'output.md', content: '# Output' }] };
          },
        },
      ],
    });

    const result = await runner.runFromBrief({
      title: 'Bridge Validation Mission',
      description: 'No special keywords to keep it simple.',
      requirements: ['Produce output'],
      deliverables: ['output.md'],
    });

    expect(result.mission.phase).toBe('closed');

    // Verify conversation was created and contains events
    const convId = missionConversationId(result.mission.missionId);
    const state = await api.getConversation(convId);

    expect(state).toBeTruthy();
    expect(state.status).toBe('closed');
    expect(state.participants).toContain('system');
    expect(state.participants).toContain('synth');

    // Should have messages for: phase transitions + task start + task complete + mission close
    expect(state.messages.length).toBeGreaterThanOrEqual(4);

    // Verify specific message types exist
    const contents = state.messages.map(m => m.content);
    expect(contents.some(c => c.includes('phase transition'))).toBe(true);
    expect(contents.some(c => c.includes('Task dispatched'))).toBe(true);
    expect(contents.some(c => c.includes('Task completed'))).toBe(true);
    expect(contents.some(c => c.includes('Mission closed'))).toBe(true);

    // Verify bridge metrics
    const metrics = bridge.getMetrics();
    expect(metrics.conversationsCreated).toBe(1);
    expect(metrics.conversationsClosed).toBe(1);
    expect(metrics.hookErrors).toBe(0);
    expect(metrics.lastSuccessAt).toBeTruthy();
  });

  it('mission failure pauses conversation (not closes)', async () => {
    const now = makeNow();

    const runner = new MissionRunner({
      persistDir: missionStateDir,
      artifactsDir,
      now,
      hooks: bridge,
      continueOnFailure: false,
      agents: [
        {
          id: 'synth',
          async runTask() {
            throw new Error('Agent crashed');
          },
        },
      ],
    });

    const result = await runner.runFromBrief({
      title: 'Failing Mission',
      description: 'This should fail.',
      requirements: ['Will fail'],
    });

    expect(result.mission.phase).toBe('error');

    const convId = missionConversationId(result.mission.missionId);
    const state = await api.getConversation(convId);

    // Conversation should be paused (not closed) so it can be resumed
    expect(state.status).toBe('paused');
    expect(state.messages.some(m => m.content.includes('Mission error'))).toBe(true);
  });

  it('hook failures do not break mission execution', async () => {
    const now = makeNow();

    // Create a bridge with a broken API
    const brokenEngine = {
      startConversation: () => { throw new Error('DB down'); },
      getConversation: () => { throw new Error('DB down'); },
      sendMessage: () => { throw new Error('DB down'); },
      setStatus: () => { throw new Error('DB down'); },
      addParticipant: () => { throw new Error('DB down'); },
      listConversations: () => { throw new Error('DB down'); },
      getContext: () => { throw new Error('DB down'); },
    } as any;
    const brokenApi = new ConversationAPI(brokenEngine);
    const brokenBridge = new RuntimeConversationBridge(brokenApi, { silent: true });

    const runner = new MissionRunner({
      persistDir: missionStateDir,
      artifactsDir,
      now,
      hooks: brokenBridge,
      agents: [
        {
          id: 'synth',
          async runTask(task) {
            return { summary: `done: ${task.title}` };
          },
        },
      ],
    });

    // Mission should succeed despite broken conversation engine
    const result = await runner.runFromBrief({
      title: 'Resilient Mission',
      description: 'Should complete despite broken hooks.',
      requirements: ['Complete successfully'],
    });

    expect(result.mission.phase).toBe('closed');

    // Bridge should record hook errors
    const metrics = brokenBridge.getMetrics();
    expect(metrics.hookErrors).toBeGreaterThan(0);
  });
});

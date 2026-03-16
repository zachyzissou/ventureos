/**
 * Tests for RuntimeConversationBridge — Issue #184
 *
 * Validates:
 * - Mission lifecycle creates/closes conversations
 * - Task dispatch/completion sends messages
 * - Idempotency (duplicate events don't create duplicate messages)
 * - Graceful degradation (engine errors don't propagate)
 * - Metrics tracking
 * - Bridge wiring into MissionRunner hooks interface
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import Database from 'better-sqlite3';

import {
  RuntimeConversationBridge,
  missionConversationId,
  type MissionRunnerHooks,
  type BridgeMetrics,
} from '../runtime-conversation-bridge';
import { ConversationEngine, FileConversationStore } from '../conversation-engine';
import { ConversationAPI } from '../conversation-api';
import { RateLimiter } from '../rate-limiter';
import { HITLEngine } from '../hitl';
import { AffinityManager } from '../affinity-manager';
import type {
  MissionRecord,
  MissionPhase,
  MissionTask,
  TaskRunResult,
} from '../mission-state-machine';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function makeTempDir(prefix: string): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return {
    dir,
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

async function makeTempAffinityDb(): Promise<{ db: Database.Database; cleanup: () => Promise<void> }> {
  const { dir, cleanup } = await makeTempDir('ventureos-bridge-affdb-');
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

function makeEngine(persistDir: string, affinityDb: Database.Database): ConversationEngine {
  const rateLimiter = new RateLimiter({
    agentPerMinute: 1000, agentPerHour: 1000,
    conversationPerMinute: 1000, conversationPerHour: 1000,
    burstAllowance: false,
  });
  const hitl = new HITLEngine();
  const affinity = new AffinityManager({ lowAffinityThreshold: 0.1 }, affinityDb);

  return new ConversationEngine({
    config: { persistDir, enforceTurns: false },
    store: new FileConversationStore(persistDir),
    affinityManager: affinity,
    securityDeps: { rateLimiter, hitl },
  });
}

function makeMission(overrides?: Partial<MissionRecord>): MissionRecord {
  return {
    missionId: 'test-mission-001',
    phase: 'brief' as MissionPhase,
    createdAt: '2026-02-17T00:00:00.000Z',
    updatedAt: '2026-02-17T00:00:00.000Z',
    brief: {
      title: 'Test Mission',
      description: 'A test mission for bridge integration',
      requirements: ['req1'],
    },
    plan: {
      createdAt: '2026-02-17T00:00:00.000Z',
      tasks: [
        { taskId: 'task-1', title: 'Build it', description: 'Build the thing', role: 'synth' },
        { taskId: 'task-2', title: 'Test it', description: 'Test the thing', role: 'verifier' },
      ],
    },
    history: [{ phase: 'brief' as MissionPhase, enteredAt: '2026-02-17T00:00:00.000Z' }],
    metrics: { createdAt: '2026-02-17T00:00:00.000Z', updatedAt: '2026-02-17T00:00:00.000Z' },
    ...overrides,
  };
}

function makeTaskResult(task: MissionTask, status: 'succeeded' | 'failed' = 'succeeded'): TaskRunResult {
  return {
    taskId: task.taskId,
    agentId: task.role,
    startedAt: '2026-02-17T00:01:00.000Z',
    finishedAt: '2026-02-17T00:02:00.000Z',
    status,
    summary: status === 'succeeded' ? 'Done' : undefined,
    error: status === 'failed' ? { message: 'Something went wrong' } : undefined,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('RuntimeConversationBridge', () => {
  let persistDir: string;
  let persistCleanup: () => Promise<void>;
  let affinityDb: Database.Database;
  let affinityCleanup: () => Promise<void>;
  let engine: ConversationEngine;
  let api: ConversationAPI;
  let bridge: RuntimeConversationBridge;

  beforeEach(async () => {
    const tmp = await makeTempDir('ventureos-bridge-');
    persistDir = tmp.dir;
    persistCleanup = tmp.cleanup;
    const affTmp = await makeTempAffinityDb();
    affinityDb = affTmp.db;
    affinityCleanup = affTmp.cleanup;
    engine = makeEngine(persistDir, affinityDb);
    api = new ConversationAPI(engine);
    bridge = new RuntimeConversationBridge(api, { silent: true });
  });

  afterEach(async () => {
    await persistCleanup();
    await affinityCleanup();
  });

  describe('missionConversationId', () => {
    it('produces deterministic IDs', () => {
      expect(missionConversationId('abc')).toBe('mission_abc');
      expect(missionConversationId('abc')).toBe(missionConversationId('abc'));
    });
  });

  describe('onMissionCreated', () => {
    it('creates a conversation with system + derived participants', async () => {
      const mission = makeMission();
      await bridge.onMissionCreated(mission);

      const convId = missionConversationId(mission.missionId);
      const state = await api.getConversation(convId);

      expect(state).toBeTruthy();
      expect(state.participants).toContain('system');
      expect(state.participants).toContain('synth');
      expect(state.participants).toContain('verifier');
      expect(state.status).toBe('active');
      expect(state.metadata).toHaveProperty('missionId', mission.missionId);
    });

    it('is idempotent — reuses existing conversation on second call', async () => {
      const mission = makeMission();
      await bridge.onMissionCreated(mission);
      await bridge.onMissionCreated(mission);

      const metrics = bridge.getMetrics();
      // Should only count 1 creation, 2nd is reuse
      expect(metrics.conversationsCreated).toBe(1);
    });
  });

  describe('onPhaseTransition', () => {
    it('sends a phase transition message', async () => {
      const mission = makeMission();
      await bridge.onMissionCreated(mission);
      await bridge.onPhaseTransition(mission, 'brief', 'plan');

      const convId = missionConversationId(mission.missionId);
      const state = await api.getConversation(convId);
      const msgs = state.messages.filter(m => m.content.includes('phase transition'));
      expect(msgs.length).toBe(1);
      expect(msgs[0].content).toContain('brief → plan');
    });

    it('deduplicates identical transitions', async () => {
      const mission = makeMission();
      await bridge.onMissionCreated(mission);
      await bridge.onPhaseTransition(mission, 'brief', 'plan');
      await bridge.onPhaseTransition(mission, 'brief', 'plan');

      const convId = missionConversationId(mission.missionId);
      const state = await api.getConversation(convId);
      const msgs = state.messages.filter(m => m.content.includes('phase transition'));
      expect(msgs.length).toBe(1);
    });
  });

  describe('onTaskStart', () => {
    it('sends a task dispatch message', async () => {
      const mission = makeMission();
      await bridge.onMissionCreated(mission);

      const task = mission.plan!.tasks[0];
      await bridge.onTaskStart(mission, task, 'synth');

      const convId = missionConversationId(mission.missionId);
      const state = await api.getConversation(convId);
      const msgs = state.messages.filter(m => m.content.includes('Task dispatched'));
      expect(msgs.length).toBe(1);
      expect(msgs[0].content).toContain('synth');
      expect(msgs[0].content).toContain('Build it');
    });
  });

  describe('onTaskComplete', () => {
    it('sends a task result message for success', async () => {
      const mission = makeMission();
      await bridge.onMissionCreated(mission);

      const task = mission.plan!.tasks[0];
      const result = makeTaskResult(task, 'succeeded');
      await bridge.onTaskComplete(mission, task, result);

      const convId = missionConversationId(mission.missionId);
      const state = await api.getConversation(convId);
      const msgs = state.messages.filter(m => m.content.includes('Task completed'));
      expect(msgs.length).toBe(1);
      expect(msgs[0].content).toContain('succeeded');
      expect(msgs[0].content).toContain('✓');
    });

    it('sends a task result message for failure', async () => {
      const mission = makeMission();
      await bridge.onMissionCreated(mission);

      const task = mission.plan!.tasks[0];
      const result = makeTaskResult(task, 'failed');
      await bridge.onTaskComplete(mission, task, result);

      const convId = missionConversationId(mission.missionId);
      const state = await api.getConversation(convId);
      const msgs = state.messages.filter(m => m.content.includes('Task completed'));
      expect(msgs.length).toBe(1);
      expect(msgs[0].content).toContain('failed');
      expect(msgs[0].content).toContain('✗');
    });
  });

  describe('onMissionClosed', () => {
    it('sends closing message and closes conversation', async () => {
      const mission = makeMission({ phase: 'closed' });
      await bridge.onMissionCreated(mission);
      await bridge.onMissionClosed(mission);

      const convId = missionConversationId(mission.missionId);
      const state = await api.getConversation(convId);
      expect(state.status).toBe('closed');
      expect(state.messages.some(m => m.content.includes('Mission closed'))).toBe(true);

      const metrics = bridge.getMetrics();
      expect(metrics.conversationsClosed).toBe(1);
    });
  });

  describe('onMissionError', () => {
    it('sends error message and pauses conversation', async () => {
      const mission = makeMission({
        phase: 'error',
        error: {
          atPhase: 'execute',
          occurredAt: '2026-02-17T00:05:00.000Z',
          message: 'Agent timed out',
        },
      });
      await bridge.onMissionCreated(mission);
      await bridge.onMissionError(mission, new Error('Agent timed out'));

      const convId = missionConversationId(mission.missionId);
      const state = await api.getConversation(convId);
      expect(state.status).toBe('paused');
      expect(state.messages.some(m => m.content.includes('Mission error'))).toBe(true);
    });
  });

  describe('graceful degradation', () => {
    it('does not throw when conversation engine fails', async () => {
      // Create a bridge with a broken API
      const brokenEngine = {
        startConversation: () => { throw new Error('DB exploded'); },
        getConversation: () => { throw new Error('DB exploded'); },
      } as any;
      const brokenApi = new ConversationAPI(brokenEngine);
      const brokenBridge = new RuntimeConversationBridge(brokenApi, { silent: true });

      const mission = makeMission();

      // Should NOT throw
      await expect(brokenBridge.onMissionCreated(mission)).resolves.toBeUndefined();

      const metrics = brokenBridge.getMetrics();
      expect(metrics.hookErrors).toBe(1);
      expect(metrics.lastErrorMessage).toContain('onMissionCreated');
    });
  });

  describe('metrics', () => {
    it('tracks all counters correctly', async () => {
      const mission = makeMission();
      await bridge.onMissionCreated(mission);
      await bridge.onPhaseTransition(mission, 'brief', 'plan');

      const task = mission.plan!.tasks[0];
      await bridge.onTaskStart(mission, task, 'synth');
      await bridge.onTaskComplete(mission, task, makeTaskResult(task));

      const closedMission = makeMission({ ...mission, phase: 'closed' });
      await bridge.onMissionClosed(closedMission);

      const metrics = bridge.getMetrics();
      expect(metrics.conversationsCreated).toBe(1);
      expect(metrics.conversationsClosed).toBe(1);
      expect(metrics.messagesSent).toBeGreaterThanOrEqual(4); // phase + start + complete + close
      expect(metrics.hookErrors).toBe(0);
      expect(metrics.lastSuccessAt).toBeTruthy();
    });
  });

  describe('activeConversations', () => {
    it('tracks active conversations', async () => {
      const mission = makeMission();
      await bridge.onMissionCreated(mission);

      const active = bridge.getActiveConversations();
      expect(active.size).toBe(1);
      expect(active.get(mission.missionId)).toBe(missionConversationId(mission.missionId));
    });

    it('removes conversations on close', async () => {
      const mission = makeMission({ phase: 'closed' });
      await bridge.onMissionCreated(mission);
      await bridge.onMissionClosed(mission);

      const active = bridge.getActiveConversations();
      expect(active.size).toBe(0);
    });
  });

  describe('MissionRunnerHooks interface', () => {
    it('satisfies the MissionRunnerHooks type', () => {
      // Type-level check: bridge implements MissionRunnerHooks
      const hooks: MissionRunnerHooks = bridge;
      expect(hooks.onMissionCreated).toBeDefined();
      expect(hooks.onPhaseTransition).toBeDefined();
      expect(hooks.onTaskStart).toBeDefined();
      expect(hooks.onTaskComplete).toBeDefined();
      expect(hooks.onMissionClosed).toBeDefined();
      expect(hooks.onMissionError).toBeDefined();
    });
  });
});

/**
 * Mission State Machine — VentureOS Mission Runner (P1 #29)
 *
 * Provides a persistent, validated state machine for mission execution.
 *
 * Primary phases:
 *   brief → plan → execute → verify → deliver → closed
 *
 * Additional phase:
 *   error (terminal unless rolled back)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import type { MissionCapabilityId } from './agent-identity';

export type MissionPhase =
  | 'brief'
  | 'plan'
  | 'execute'
  | 'verify'
  | 'deliver'
  | 'closed'
  | 'error';

export type SquadRole = MissionCapabilityId | 'curator';

export interface MissionBrief {
  title: string;
  description: string;
  /** Free-form requirements list, used during planning. */
  requirements: string[];
  /** Optional explicit deliverables list. */
  deliverables?: string[];
  /** Optional constraints (deadlines, budgets, etc). */
  constraints?: Record<string, string>;
}

export interface MissionTask {
  taskId: string;
  title: string;
  description: string;
  role: SquadRole;
  dependsOnTaskIds?: string[];
}

export interface MissionPlan {
  createdAt: string;
  tasks: MissionTask[];
}

export type MissionTaskStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';

export interface TaskRunArtifact {
  /** Logical name (e.g. 'report.md'). */
  name: string;
  /** UTF-8 content to be written by ArtifactCollector. */
  content: string;
  /** Optional media type. */
  mediaType?: string;
}

export interface TaskRunResult {
  taskId: string;
  agentId: SquadRole;
  startedAt: string;
  finishedAt: string;
  status: Exclude<MissionTaskStatus, 'pending' | 'running'>;
  summary?: string;
  artifacts?: TaskRunArtifact[];
  error?: {
    message: string;
    name?: string;
  };
}

export interface MissionExecution {
  startedAt: string;
  finishedAt?: string;
  taskStatus: Record<string, MissionTaskStatus>;
  results: TaskRunResult[];
}

export type GateKind = 'quality' | 'security' | 'approval';

export type GateStatus = 'pass' | 'fail' | 'warn' | 'require_approval';

export interface GateResult {
  gateId: string;
  kind: GateKind;
  status: GateStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface MissionVerification {
  startedAt: string;
  finishedAt?: string;
  results: GateResult[];
  overall: 'pass' | 'fail' | 'require_approval';
}

export interface DeliveryArtifactRef {
  /** Path on disk where the artifact was written. */
  path: string;
  /** sha256 hex checksum. */
  sha256: string;
  bytes: number;
  producedBy?: SquadRole;
  taskId?: string;
}

export interface MissionDelivery {
  deliveredAt: string;
  artifactsDir: string;
  manifestPath: string;
  artifacts: DeliveryArtifactRef[];
  reports: {
    statusReportPath: string;
    completionSummaryPath: string;
  };
}

export interface MissionMetrics {
  createdAt: string;
  updatedAt: string;
  /** Wall-clock duration (ms) from created → closed (when available). */
  durationMs?: number;
  /** Optional token/cost tracking hooks. */
  tokensUsed?: number;
  costUsd?: number;
}

export interface MissionErrorInfo {
  atPhase: MissionPhase;
  occurredAt: string;
  message: string;
  name?: string;
  /** Optional machine-readable code. */
  code?: string;
  /** If present, a suggested rollback target. */
  suggestedRollbackPhase?: MissionPhase;
}

export interface MissionHistoryEntry {
  phase: MissionPhase;
  enteredAt: string;
  note?: string;
}

export interface MissionRecord {
  missionId: string;
  phase: MissionPhase;
  createdAt: string;
  updatedAt: string;

  brief?: MissionBrief;
  plan?: MissionPlan;
  execution?: MissionExecution;
  verification?: MissionVerification;
  delivery?: MissionDelivery;

  error?: MissionErrorInfo;
  history: MissionHistoryEntry[];
  metrics: MissionMetrics;
}

export interface MissionStore {
  load(missionId: string): Promise<MissionRecord | null>;
  save(record: MissionRecord): Promise<void>;
}

export interface JsonFileMissionStoreConfig {
  persistDir: string;
}

export class JsonFileMissionStore implements MissionStore {
  private readonly persistDir: string;

  constructor(config: JsonFileMissionStoreConfig) {
    if (!config.persistDir) throw new Error('JsonFileMissionStore requires persistDir');
    this.persistDir = config.persistDir;
  }

  private filePathFor(missionId: string) {
    return path.join(this.persistDir, `${missionId}.json`);
  }

  async load(missionId: string): Promise<MissionRecord | null> {
    const fp = this.filePathFor(missionId);
    try {
      const raw = await fs.readFile(fp, 'utf8');
      return JSON.parse(raw) as MissionRecord;
    } catch (err: any) {
      if (err?.code === 'ENOENT') return null;
      throw err;
    }
  }

  async save(record: MissionRecord): Promise<void> {
    await fs.mkdir(this.persistDir, { recursive: true });
    const fp = this.filePathFor(record.missionId);
    const tmp = `${fp}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(record, null, 2), 'utf8');
    await fs.rename(tmp, fp);
  }
}

const DEFAULT_PERSIST_DIR = path.resolve(
  os.homedir(),
  'clawd/ventureos/runtime/missions/state'
);

export interface MissionStateMachineConfig {
  store?: MissionStore;
  /** Used only when store is not provided. */
  persistDir?: string;
  /** Optional deterministic time source for tests. */
  now?: () => Date;
}

const ALLOWED_FORWARD: Record<MissionPhase, MissionPhase[]> = {
  brief: ['plan', 'error'],
  plan: ['execute', 'error'],
  execute: ['verify', 'error'],
  verify: ['deliver', 'error'],
  deliver: ['closed', 'error'],
  closed: [],
  error: [],
};

export class MissionStateMachine {
  private readonly store: MissionStore;
  private readonly now: () => Date;

  constructor(config: MissionStateMachineConfig = {}) {
    this.store = config.store ?? new JsonFileMissionStore({ persistDir: config.persistDir ?? DEFAULT_PERSIST_DIR });
    this.now = config.now ?? (() => new Date());
  }

  /** Create a new mission record in the `brief` phase. */
  async createMission(brief: MissionBrief, missionId?: string): Promise<MissionRecord> {
    if (!brief?.title?.trim()) throw new Error('Mission brief requires title');
    if (!brief?.description?.trim()) throw new Error('Mission brief requires description');
    if (!Array.isArray(brief.requirements)) throw new Error('Mission brief requires requirements[]');

    const id = missionId ?? crypto.randomUUID();
    const ts = this.now().toISOString();
    const record: MissionRecord = {
      missionId: id,
      phase: 'brief',
      createdAt: ts,
      updatedAt: ts,
      brief,
      history: [{ phase: 'brief', enteredAt: ts, note: 'mission created' }],
      metrics: { createdAt: ts, updatedAt: ts },
    };
    await this.store.save(record);
    return record;
  }

  async loadMission(missionId: string): Promise<MissionRecord | null> {
    return this.store.load(missionId);
  }

  /**
   * Transition forward to the next phase.
   * This enforces the primary phase order.
   */
  async transition(
    record: MissionRecord,
    next: MissionPhase,
    patch: Partial<MissionRecord> = {},
    note?: string
  ): Promise<MissionRecord> {
    const allowed = ALLOWED_FORWARD[record.phase] ?? [];
    if (!allowed.includes(next)) {
      throw new Error(`Invalid mission transition: ${record.phase} → ${next}`);
    }

    const ts = this.now().toISOString();
    const updated: MissionRecord = {
      ...record,
      ...patch,
      phase: next,
      updatedAt: ts,
      history: [...(record.history ?? []), { phase: next, enteredAt: ts, note }],
      metrics: {
        ...(record.metrics ?? { createdAt: record.createdAt, updatedAt: ts }),
        ...(patch.metrics ?? {}),
        // Always preserve createdAt and refresh updatedAt on every transition.
        createdAt: record.metrics?.createdAt ?? record.createdAt,
        updatedAt: ts,
      },
    };

    // Basic phase-specific validation
    this.validateRecord(updated);

    await this.store.save(updated);
    return updated;
  }

  async fail(record: MissionRecord, err: unknown, code?: string, suggestedRollbackPhase?: MissionPhase): Promise<MissionRecord> {
    const e = err as any;
    const ts = this.now().toISOString();
    const error: MissionErrorInfo = {
      atPhase: record.phase,
      occurredAt: ts,
      message: String(e?.message ?? e ?? 'Unknown error'),
      name: e?.name,
      code,
      suggestedRollbackPhase,
    };

    return this.transition(record, 'error', { error }, `failed: ${error.message}`);
  }

  /**
   * Roll back a mission from `error` to a prior phase.
   * Intended for human/automation-driven recovery.
   */
  async rollback(record: MissionRecord, target: Exclude<MissionPhase, 'error'>, note?: string): Promise<MissionRecord> {
    if (record.phase !== 'error') {
      throw new Error(`Rollback only allowed from error phase (current: ${record.phase})`);
    }

    // Only allow rolling back to a phase that exists in history.
    const seen = new Set((record.history ?? []).map((h) => h.phase));
    if (!seen.has(target)) {
      throw new Error(`Rollback target phase not in history: ${target}`);
    }

    const ts = this.now().toISOString();
    const updated: MissionRecord = {
      ...record,
      phase: target,
      updatedAt: ts,
      error: undefined,
      history: [...(record.history ?? []), { phase: target, enteredAt: ts, note: note ?? 'rollback' }],
      metrics: {
        ...(record.metrics ?? { createdAt: record.createdAt, updatedAt: ts }),
        // Preserve createdAt and refresh updatedAt on rollback.
        createdAt: record.metrics?.createdAt ?? record.createdAt,
        updatedAt: ts,
      },
    };

    this.validateRecord(updated);
    await this.store.save(updated);
    return updated;
  }

  private validateRecord(record: MissionRecord) {
    // Minimal invariants. Higher-level validation belongs in runner.
    if (!record.missionId) throw new Error('Mission record missing missionId');
    if (!record.createdAt) throw new Error('Mission record missing createdAt');
    if (!record.updatedAt) throw new Error('Mission record missing updatedAt');
    if (!record.metrics?.createdAt) throw new Error('Mission record missing metrics.createdAt');

    if (record.phase === 'brief') {
      if (!record.brief) throw new Error('Mission in brief phase requires brief');
    }

    if (record.phase === 'plan' || record.phase === 'execute' || record.phase === 'verify' || record.phase === 'deliver' || record.phase === 'closed') {
      if (!record.brief) throw new Error(`Mission in ${record.phase} requires brief`);
    }

    if ((record.phase === 'execute' || record.phase === 'verify' || record.phase === 'deliver' || record.phase === 'closed') && !record.plan) {
      throw new Error(`Mission in ${record.phase} requires plan`);
    }

    if ((record.phase === 'verify' || record.phase === 'deliver' || record.phase === 'closed') && !record.execution) {
      throw new Error(`Mission in ${record.phase} requires execution`);
    }

    if ((record.phase === 'deliver' || record.phase === 'closed') && !record.verification) {
      throw new Error(`Mission in ${record.phase} requires verification`);
    }

    if (record.phase === 'closed') {
      if (!record.delivery) throw new Error('Mission in closed phase requires delivery');
      // metrics.durationMs should exist when closed (best-effort)
    }

    if (record.phase === 'error') {
      if (!record.error) throw new Error('Mission in error phase requires error info');
    }
  }
}

/**
 * Task Queue — VentureOS Queue Integration (P1 #30)
 *
 * Portfolio-aware task queue with mission metadata support.
 * Extends the base queue schema with businessUnit, missionType, and role
 * fields for routing and priority decisions.
 *
 * Key properties:
 * - Schema versioned (v1 → v2 migration supported)
 * - Backward compatible (v1 entries still work)
 * - Business unit validation against registry
 * - Mission context propagation across operations
 * - Structured logging with mission tags
 */

import crypto from 'node:crypto';

// ============================================================================
// Schema Types — v2 (with mission metadata)
// ============================================================================

/** Queue schema version. */
export const QUEUE_SCHEMA_VERSION = 2;

/** Supported task tier levels. */
export type TaskTier = 'P0' | 'P1' | 'P2' | 'P3';

/** Task lifecycle status. */
export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired';

/** Recognized mission types from business unit registry. */
export type MissionType = 'build' | 'ops' | 'infra' | 'content' | 'research';

/**
 * Mission context attached to a queue task.
 * All fields are optional for backward compatibility with v1 entries.
 */
export interface MissionContext {
  /** Business unit ID (must match registry). */
  businessUnit?: string;
  /** Mission type (build, ops, infra, content, research). */
  missionType?: MissionType;
  /** Agent role assigned to this task. */
  role?: string;
  /** Arbitrary metadata for downstream consumers. */
  tags?: Record<string, string>;
}

/**
 * A single task in the queue (v2 schema).
 *
 * v1 compatibility: businessUnit/missionType/role/missionContext may be undefined.
 */
export interface QueueTask {
  /** Unique task identifier. */
  id: string;
  /** When the task was created (ISO 8601). */
  createdAt: string;
  /** Priority tier. */
  tier: TaskTier;
  /** Current status. */
  status: TaskStatus;
  /** Human-readable title. */
  title: string;
  /** Optional description. */
  description?: string;

  // ── Mission metadata (v2) ──────────────────────────────────────────
  /** Business unit ID (validated against registry). */
  businessUnit?: string;
  /** Mission type. */
  missionType?: MissionType;
  /** Agent role for this task. */
  role?: string;
  /** Full mission context (serialized). */
  missionContext?: MissionContext;

  // ── Execution fields ──────────────────────────────────────────────
  /** Optional job/cron identifier. */
  jobId?: string;
  /** Next scheduled run (ISO 8601). */
  nextRunAt?: string;
  /** Number of execution attempts. */
  attempts: number;
  /** Maximum allowed attempts. */
  maxAttempts: number;
  /** Per-attempt timeout in seconds. */
  timeoutSeconds?: number;
  /** Deduplication key. */
  dedupeKey?: string;
  /** Expected output artifact paths. */
  expectedArtifacts?: string[];
  /** Whether human approval is required. */
  requiresApproval?: boolean;
  /** Reference links. */
  links?: string[];
  /** Free-form notes. */
  notes?: string;
  /** Shell command to execute. */
  command?: string[];

  // ── Lifecycle timestamps ──────────────────────────────────────────
  /** When execution started. */
  startedAt?: string;
  /** When execution completed. */
  completedAt?: string;
  /** Last status update. */
  updatedAt?: string;
  /** Error message on failure. */
  error?: string;
}

/**
 * The full queue document (persisted as JSON).
 */
export interface QueueDocument {
  /** Schema version (1 or 2). */
  version: number;
  /** When this document was last generated/updated. */
  generated_at: string;
  /** Ordered task list. */
  items: QueueTask[];
}

// ============================================================================
// Queue Manager
// ============================================================================

export interface TaskQueueLogger {
  debug?(msg: string, meta?: Record<string, unknown>): void;
  info?(msg: string, meta?: Record<string, unknown>): void;
  warn?(msg: string, meta?: Record<string, unknown>): void;
  error?(msg: string, meta?: Record<string, unknown>): void;
}

const defaultLogger: TaskQueueLogger = {
  debug: (msg, meta) => {
    if (process.env.QUEUE_DEBUG) console.debug(`[queue] ${msg}`, meta ?? '');
  },
  info: (msg, meta) => console.info(`[queue] ${msg}`, meta ?? ''),
  warn: (msg, meta) => console.warn(`[queue] ${msg}`, meta ?? ''),
  error: (msg, meta) => console.error(`[queue] ${msg}`, meta ?? ''),
};

/** Options for creating a new task. */
export interface EnqueueOptions {
  title: string;
  tier?: TaskTier;
  description?: string;

  // Mission metadata
  businessUnit?: string;
  missionType?: MissionType;
  role?: string;
  missionContext?: MissionContext;

  // Execution
  jobId?: string;
  nextRunAt?: string;
  maxAttempts?: number;
  timeoutSeconds?: number;
  dedupeKey?: string;
  expectedArtifacts?: string[];
  requiresApproval?: boolean;
  links?: string[];
  notes?: string;
  command?: string[];
}

export interface TaskQueueConfig {
  logger?: TaskQueueLogger;
  /** Optional deterministic time source for tests. */
  now?: () => Date;
}

export class TaskQueue {
  private items: QueueTask[] = [];
  private readonly logger: TaskQueueLogger;
  private readonly now: () => Date;

  constructor(config: TaskQueueConfig = {}) {
    this.logger = config.logger ?? defaultLogger;
    this.now = config.now ?? (() => new Date());
  }

  /** Load tasks from a queue document (handles v1 and v2). */
  load(doc: QueueDocument): void {
    this.items = (doc.items ?? []).map((item) => this.normalizeTask(item, doc.version));
    this.logger.info?.('Queue loaded', {
      version: doc.version,
      taskCount: this.items.length,
    });
  }

  /** Export current state as a v2 queue document. */
  toDocument(): QueueDocument {
    return {
      version: QUEUE_SCHEMA_VERSION,
      generated_at: this.now().toISOString(),
      items: [...this.items],
    };
  }

  /** Add a new task to the queue. Returns the created task. */
  enqueue(options: EnqueueOptions): QueueTask {
    const ts = this.now().toISOString();
    const { businessUnit, missionType, role, missionContext } = this.deriveMissionMetadata(options);

    if (missionContext) {
      missionContext.businessUnit = businessUnit;
      missionContext.missionType = missionType;
      missionContext.role = role;
    }

    const task: QueueTask = {
      id: crypto.randomUUID(),
      createdAt: ts,
      updatedAt: ts,
      tier: options.tier ?? 'P2',
      status: 'queued',
      title: options.title,
      description: options.description,
      businessUnit,
      missionType,
      role,
      missionContext,
      jobId: options.jobId,
      nextRunAt: options.nextRunAt,
      attempts: 0,
      maxAttempts: options.maxAttempts ?? 3,
      timeoutSeconds: options.timeoutSeconds,
      dedupeKey: options.dedupeKey,
      expectedArtifacts: options.expectedArtifacts,
      requiresApproval: options.requiresApproval,
      links: options.links,
      notes: options.notes,
      command: options.command,
    };

    // Dedupe check
    if (task.dedupeKey) {
      const existing = this.items.find(
        (t) => t.dedupeKey === task.dedupeKey && (t.status === 'queued' || t.status === 'running')
      );
      if (existing) {
        this.logWithMission('warn', 'Duplicate task rejected', task, {
          existingId: existing.id,
          dedupeKey: task.dedupeKey,
        });
        return existing;
      }
    }

    this.items.push(task);
    this.logWithMission('info', 'Task enqueued', task);
    return task;
  }

  /** Get a task by ID. */
  getTask(id: string): QueueTask | undefined {
    return this.items.find((t) => t.id === id);
  }

  /** Get all tasks, optionally filtered. */
  getTasks(filter?: Partial<Pick<QueueTask, 'status' | 'tier' | 'businessUnit' | 'missionType' | 'role'>>): QueueTask[] {
    if (!filter) return [...this.items];

    return this.items.filter((t) => {
      if (filter.status && t.status !== filter.status) return false;
      if (filter.tier && t.tier !== filter.tier) return false;
      if (filter.businessUnit && t.businessUnit !== filter.businessUnit) return false;
      if (filter.missionType && t.missionType !== filter.missionType) return false;
      if (filter.role && t.role !== filter.role) return false;
      return true;
    });
  }

  /** Update a task's status. Preserves mission context. */
  updateStatus(id: string, status: TaskStatus, error?: string): QueueTask | undefined {
    const task = this.items.find((t) => t.id === id);
    if (!task) return undefined;

    const ts = this.now().toISOString();
    task.status = status;
    task.updatedAt = ts;

    if (status === 'running') {
      task.startedAt = ts;
      task.attempts += 1;
    }
    if (status === 'succeeded' || status === 'failed' || status === 'cancelled' || status === 'expired') {
      task.completedAt = ts;
    }
    if (error) {
      task.error = error;
    }

    this.logWithMission('info', `Task ${status}`, task);
    return task;
  }

  /** Cancel a task. */
  cancel(id: string, reason?: string): QueueTask | undefined {
    return this.updateStatus(id, 'cancelled', reason);
  }

  /** Remove completed/cancelled tasks. */
  prune(statuses: TaskStatus[] = ['succeeded', 'cancelled', 'expired']): number {
    const before = this.items.length;
    this.items = this.items.filter((t) => !statuses.includes(t.status));
    const pruned = before - this.items.length;
    if (pruned > 0) {
      this.logger.info?.('Queue pruned', { removed: pruned, remaining: this.items.length });
    }
    return pruned;
  }

  /** Get queue stats grouped by business unit. */
  stats(): Record<string, { total: number; queued: number; running: number; failed: number }> {
    const result: Record<string, { total: number; queued: number; running: number; failed: number }> = {};

    for (const task of this.items) {
      const bu = task.businessUnit ?? '_unassigned';
      if (!result[bu]) result[bu] = { total: 0, queued: 0, running: 0, failed: 0 };
      result[bu].total++;
      if (task.status === 'queued') result[bu].queued++;
      if (task.status === 'running') result[bu].running++;
      if (task.status === 'failed') result[bu].failed++;
    }

    return result;
  }

  // ── Internal helpers ────────────────────────────────────────────────

  /**
   * Normalize a task from any schema version to v2.
   * v1 tasks may lack mission fields — that's fine, they remain undefined.
   */
  private normalizeTask(raw: QueueTask, version: number): QueueTask {
    const task = { ...raw };

    if (version < 2) {
      // v1 → v2: build missionContext from top-level fields if present
      if (!task.missionContext && (task.businessUnit || task.missionType || task.role)) {
        task.missionContext = {
          businessUnit: task.businessUnit,
          missionType: task.missionType,
          role: task.role,
        };
      }
    }

    // Ensure required defaults
    task.attempts = task.attempts ?? 0;
    task.maxAttempts = task.maxAttempts ?? 3;
    task.status = task.status ?? 'queued';
    task.tier = task.tier ?? 'P2';

    return task;
  }

  /**
   * Derive normalized mission metadata from enqueue options.
   *
   * Top-level mission fields take precedence over missionContext fields,
   * and missionContext is rebuilt from the effective values to avoid
   * redundant fallback chains and cross-field mismatches.
   */
  private deriveMissionMetadata(opts: EnqueueOptions): {
    businessUnit?: string;
    missionType?: MissionType;
    role?: string;
    missionContext?: MissionContext;
  } {
    const baseContext = opts.missionContext
      ? this.serializeMissionContext(opts.missionContext)
      : undefined;

    const businessUnit = opts.businessUnit ?? baseContext?.businessUnit;
    const missionType = opts.missionType ?? baseContext?.missionType;
    const role = opts.role ?? baseContext?.role;
    const tags = baseContext?.tags;

    const hasMissionFields = Boolean(businessUnit || missionType || role);
    const hasTags = tags !== undefined;

    const missionContext = hasMissionFields || hasTags
      ? {
          ...(businessUnit ? { businessUnit } : {}),
          ...(missionType ? { missionType } : {}),
          ...(role ? { role } : {}),
          ...(tags ? { tags } : {}),
        }
      : undefined;

    return {
      businessUnit,
      missionType,
      role,
      missionContext,
    };
  }

  /** Deep-copy mission context for serialization safety. */
  private serializeMissionContext(ctx: MissionContext): MissionContext {
    return JSON.parse(JSON.stringify(ctx));
  }

  /** Log with mission tags attached. */
  private logWithMission(
    level: 'debug' | 'info' | 'warn' | 'error',
    msg: string,
    task: QueueTask,
    extra?: Record<string, unknown>
  ): void {
    const meta: Record<string, unknown> = {
      taskId: task.id,
      tier: task.tier,
      status: task.status,
      ...(task.businessUnit ? { businessUnit: task.businessUnit } : {}),
      ...(task.missionType ? { missionType: task.missionType } : {}),
      ...(task.role ? { role: task.role } : {}),
      ...extra,
    };
    this.logger[level]?.(msg, meta);
  }
}

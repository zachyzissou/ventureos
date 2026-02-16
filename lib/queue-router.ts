/**
 * Queue Router — VentureOS Queue Integration (P1 #30)
 *
 * Portfolio-aware routing logic for the task queue.
 * Uses business unit metadata to determine priority, ordering, and routing.
 *
 * Routing strategy:
 * 1. Tier-based priority (P0 > P1 > P2 > P3)
 * 2. Business unit priority boost (critical > high > medium > low)
 * 3. Mission type routing rules
 * 4. Age-based fairness (older tasks get priority boost)
 */

import {
  type QueueTask,
  type TaskTier,
  type TaskStatus,
  type MissionType,
  type TaskQueueLogger,
} from './task-queue';

import {
  BusinessUnitRegistry,
  type BusinessUnit,
} from './business-unit-registry';

// ============================================================================
// Types
// ============================================================================

export interface RoutingDecision {
  /** Computed priority score (higher = process first). */
  score: number;
  /** Breakdown of score components. */
  breakdown: {
    tierScore: number;
    businessUnitScore: number;
    missionTypeScore: number;
    ageBonus: number;
    approvalPenalty: number;
  };
  /** Whether the task requires human approval. */
  requiresApproval: boolean;
  /** Validation warnings (non-blocking). */
  warnings: string[];
}

export interface RouteResult {
  task: QueueTask;
  decision: RoutingDecision;
}

/** Configuration for the queue router. */
export interface QueueRouterConfig {
  /** Business unit registry for lookups. */
  registry: BusinessUnitRegistry;
  /** Whether to validate businessUnit against registry. Default: true. */
  validateBusinessUnit?: boolean;
  /** Whether to validate missionType against BU's allowed types. Default: true. */
  validateMissionType?: boolean;
  /** Logger. */
  logger?: TaskQueueLogger;
  /** Optional deterministic time source for tests. */
  now?: () => Date;
}

// ============================================================================
// Constants
// ============================================================================

/** Tier score weights (higher = process sooner). */
const TIER_SCORES: Record<TaskTier, number> = {
  P0: 1000,
  P1: 750,
  P2: 500,
  P3: 250,
};

/** Mission type score modifiers. */
const MISSION_TYPE_SCORES: Record<MissionType, number> = {
  infra: 50,   // Infrastructure tasks get a small boost
  ops: 40,     // Ops tasks are time-sensitive
  build: 30,   // Feature work
  content: 20, // Content creation
  research: 10, // Research is lower urgency
};

/** Max age bonus (tasks older than this get full bonus). */
const MAX_AGE_BONUS = 100;
/** Age bonus accrual period (ms). Tasks get 1 point per minute up to MAX_AGE_BONUS. */
const AGE_BONUS_RATE_MS = 60_000; // 1 point per minute

/** Penalty applied to tasks awaiting approval (pushes them down). */
const APPROVAL_PENDING_PENALTY = -900;

// ============================================================================
// Router
// ============================================================================

const defaultLogger: TaskQueueLogger = {
  debug: (msg, meta) => {
    if (process.env.QUEUE_DEBUG) console.debug(`[router] ${msg}`, meta ?? '');
  },
  info: (msg, meta) => console.info(`[router] ${msg}`, meta ?? ''),
  warn: (msg, meta) => console.warn(`[router] ${msg}`, meta ?? ''),
  error: (msg, meta) => console.error(`[router] ${msg}`, meta ?? ''),
};

export class QueueRouter {
  private readonly registry: BusinessUnitRegistry;
  private readonly validateBU: boolean;
  private readonly validateMT: boolean;
  private readonly logger: TaskQueueLogger;
  private readonly now: () => Date;

  constructor(config: QueueRouterConfig) {
    this.registry = config.registry;
    this.validateBU = config.validateBusinessUnit ?? true;
    this.validateMT = config.validateMissionType ?? true;
    this.logger = config.logger ?? defaultLogger;
    this.now = config.now ?? (() => new Date());
  }

  /**
   * Compute a routing decision for a single task.
   * Does NOT mutate the task.
   */
  route(task: QueueTask): RoutingDecision {
    const warnings: string[] = [];

    // 1. Tier score
    const tierScore = TIER_SCORES[task.tier] ?? TIER_SCORES.P2;

    // 2. Business unit score
    let businessUnitScore = 0;
    if (task.businessUnit) {
      if (this.validateBU) {
        const err = this.registry.validate(task.businessUnit);
        if (err) warnings.push(err);
      }
      businessUnitScore = this.registry.getPriorityWeight(task.businessUnit);
    }

    // 3. Mission type score
    let missionTypeScore = 0;
    if (task.missionType) {
      missionTypeScore = MISSION_TYPE_SCORES[task.missionType] ?? 0;

      if (this.validateMT && task.businessUnit) {
        const err = this.registry.validateMissionType(task.businessUnit, task.missionType);
        if (err) warnings.push(err);
      }
    }

    // 4. Age bonus
    const createdMs = Date.parse(task.createdAt);
    const nowMs = this.now().getTime();
    const ageMs = Number.isFinite(createdMs) ? Math.max(0, nowMs - createdMs) : 0;
    const ageBonus = Math.min(MAX_AGE_BONUS, Math.floor(ageMs / AGE_BONUS_RATE_MS));

    // 5. Approval penalty
    const requiresApproval = task.requiresApproval === true;
    const approvalPenalty = requiresApproval ? APPROVAL_PENDING_PENALTY : 0;

    const score = tierScore + businessUnitScore + missionTypeScore + ageBonus + approvalPenalty;

    const decision: RoutingDecision = {
      score,
      breakdown: {
        tierScore,
        businessUnitScore,
        missionTypeScore,
        ageBonus,
        approvalPenalty,
      },
      requiresApproval,
      warnings,
    };

    if (warnings.length) {
      this.logger.warn?.('Routing warnings', {
        taskId: task.id,
        businessUnit: task.businessUnit,
        missionType: task.missionType,
        warnings,
      });
    }

    return decision;
  }

  /**
   * Sort a list of tasks by routing priority (highest score first).
   * Only considers tasks in the given statuses (default: ['queued']).
   */
  prioritize(
    tasks: QueueTask[],
    statuses: TaskStatus[] = ['queued']
  ): RouteResult[] {
    const eligible = tasks.filter((t) => statuses.includes(t.status));

    const results: RouteResult[] = eligible.map((task) => ({
      task,
      decision: this.route(task),
    }));

    // Sort descending by score (highest first)
    results.sort((a, b) => b.decision.score - a.decision.score);

    this.logger.debug?.('Tasks prioritized', {
      total: tasks.length,
      eligible: eligible.length,
      topTask: results[0]
        ? {
            id: results[0].task.id,
            score: results[0].decision.score,
            businessUnit: results[0].task.businessUnit,
          }
        : null,
    });

    return results;
  }

  /**
   * Get the next task to execute from a list.
   * Returns the highest-priority queued task that doesn't require approval
   * (or the highest-priority one if all require approval).
   */
  pickNext(tasks: QueueTask[]): RouteResult | null {
    const prioritized = this.prioritize(tasks);
    if (!prioritized.length) return null;

    // Prefer tasks that don't require approval
    const noApproval = prioritized.find((r) => !r.decision.requiresApproval);
    return noApproval ?? prioritized[0];
  }

  /**
   * Group tasks by business unit and return sorted groups.
   */
  groupByBusinessUnit(tasks: QueueTask[]): Map<string, RouteResult[]> {
    const groups = new Map<string, RouteResult[]>();

    for (const task of tasks) {
      const bu = task.businessUnit ?? '_unassigned';
      const existing = groups.get(bu) ?? [];
      existing.push({ task, decision: this.route(task) });
      groups.set(bu, existing);
    }

    // Sort within each group
    for (const [, results] of groups) {
      results.sort((a, b) => b.decision.score - a.decision.score);
    }

    return groups;
  }

  /**
   * Validate a task's mission metadata against the registry.
   * Returns an array of validation errors (empty = valid).
   */
  validateTask(task: QueueTask): string[] {
    const errors: string[] = [];

    const businessUnit = task.businessUnit ?? task.missionContext?.businessUnit;
    const missionType = task.missionType ?? task.missionContext?.missionType;

    if (businessUnit) {
      const err = this.registry.validate(businessUnit);
      if (err) errors.push(err);
    }

    if (missionType && businessUnit) {
      const err = this.registry.validateMissionType(businessUnit, missionType);
      if (err) errors.push(err);
    } else if (missionType && !businessUnit) {
      errors.push(`Mission type '${missionType}' provided without business unit`);
    }

    // Cross-check missionContext consistency
    if (task.missionContext) {
      if (task.missionContext.businessUnit && task.businessUnit && task.missionContext.businessUnit !== task.businessUnit) {
        errors.push(
          `Mismatch: task.businessUnit='${task.businessUnit}' vs missionContext.businessUnit='${task.missionContext.businessUnit}'`
        );
      }
      if (task.missionContext.missionType && task.missionType && task.missionContext.missionType !== task.missionType) {
        errors.push(
          `Mismatch: task.missionType='${task.missionType}' vs missionContext.missionType='${task.missionContext.missionType}'`
        );
      }
    }

    return errors;
  }
}

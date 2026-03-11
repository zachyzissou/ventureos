import type { ActiveTaskSnapshot } from '../active-tasks.js';
import type {
  TaskBoardDeps,
  TaskCard,
  TaskPriority,
  TaskStatus,
} from '../types.js';

/** Maximum cards per batch request to prevent unbounded operations. */
const MAX_BATCH_SIZE = 50;

/** Statuses that are eligible for the archive (delete) action. */
const ARCHIVABLE_STATUSES: TaskStatus[] = ['done', 'failed'];

const HEARTBEAT_PICKUP_MAX = 10;

const PRIORITY_SCORE: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export interface BatchInput {
  action?: string;
  ids?: string[];
  status?: string;
}

interface BatchItemResult {
  id: string;
  ok: boolean;
  error?: string;
}

export interface BatchResult {
  action: string;
  total: number;
  succeeded: number;
  failed: number;
  results: BatchItemResult[];
  error?: string;
}

interface ExecuteBatchOptions {
  input: BatchInput;
  emitEvent?: TaskBoardDeps['emitEvent'];
  loadTasks: () => TaskCard[];
  saveTasks: (tasks: TaskCard[]) => void;
  appendStatusHistory: (
    card: TaskCard,
    status: TaskStatus,
    by: string,
    note?: string | null,
    at?: number,
  ) => void;
  isValidTransition: (from: TaskStatus, to: TaskStatus) => boolean;
  validStatuses: readonly TaskStatus[];
}

/**
 * Execute a batch operation (transition or archive) on multiple cards.
 * For transitions and archives, partial success is allowed and reported per card.
 */
export function executeBatchOperation(options: ExecuteBatchOptions): BatchResult {
  const action = options.input.action ?? '';

  if (!['transition', 'archive'].includes(action)) {
    return {
      action,
      total: 0,
      succeeded: 0,
      failed: 0,
      results: [],
      error: `invalid action: ${action}. Must be "transition" or "archive".`,
    };
  }

  const ids = options.input.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return {
      action,
      total: 0,
      succeeded: 0,
      failed: 0,
      results: [],
      error: 'ids must be a non-empty array',
    };
  }

  if (ids.length > MAX_BATCH_SIZE) {
    return {
      action,
      total: ids.length,
      succeeded: 0,
      failed: ids.length,
      results: [],
      error: `batch size ${ids.length} exceeds maximum of ${MAX_BATCH_SIZE}`,
    };
  }

  const uniqueIds = [...new Set(ids)];

  const tasks = options.loadTasks();
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const results: BatchItemResult[] = [];
  let succeeded = 0;
  let failed = 0;

  if (action === 'transition') {
    const targetStatus = options.input.status as TaskStatus;
    if (!targetStatus || !options.validStatuses.includes(targetStatus)) {
      return {
        action,
        total: uniqueIds.length,
        succeeded: 0,
        failed: uniqueIds.length,
        results: [],
        error: `invalid target status: ${options.input.status}`,
      };
    }

    for (const id of uniqueIds) {
      const card = taskMap.get(id);
      if (!card) {
        results.push({ id, ok: false, error: 'not found' });
        failed++;
        continue;
      }
      if (card.status === targetStatus) {
        results.push({ id, ok: true });
        succeeded++;
        continue;
      }
      if (!options.isValidTransition(card.status, targetStatus)) {
        results.push({
          id,
          ok: false,
          error: `invalid transition: ${card.status} -> ${targetStatus}`,
        });
        failed++;
        continue;
      }

      card.status = targetStatus;
      const now = Date.now();
      if (targetStatus === 'queued') card.queuedAt = now;
      if (targetStatus === 'running') card.startedAt = now;
      if (targetStatus === 'done' || targetStatus === 'failed') {
        card.completedAt = now;
        if (card.startedAt && card.runtimeMs == null) {
          card.runtimeMs = now - card.startedAt;
        }
      }
      options.appendStatusHistory(card, targetStatus, 'batch', null, now);

      results.push({ id, ok: true });
      succeeded++;
      options.emitEvent?.('task:updated', card);
    }

    options.saveTasks(tasks);
  } else {
    const toRemove: string[] = [];

    for (const id of uniqueIds) {
      const card = taskMap.get(id);
      if (!card) {
        results.push({ id, ok: false, error: 'not found' });
        failed++;
        continue;
      }
      if (!ARCHIVABLE_STATUSES.includes(card.status)) {
        results.push({
          id,
          ok: false,
          error: `cannot archive card in status "${card.status}" — only done/failed cards can be archived`,
        });
        failed++;
        continue;
      }
      toRemove.push(id);
      results.push({ id, ok: true });
      succeeded++;
      options.emitEvent?.('task:deleted', card);
    }

    if (toRemove.length > 0) {
      const removeSet = new Set(toRemove);
      const remaining = tasks.filter((task) => !removeSet.has(task.id));
      options.saveTasks(remaining);
    }
  }

  return {
    action,
    total: uniqueIds.length,
    succeeded,
    failed,
    results,
  };
}

export interface HeartbeatPickupInput {
  agentId?: string;
  limit?: number;
  allowParallel?: boolean;
}

interface HeartbeatPickupSkipped {
  nonAgentAssignee: number;
  assignedToOther: number;
  unmetDependencies: number;
}

export interface HeartbeatPickupResult {
  agentId: string;
  picked: TaskCard[];
  pickedCount: number;
  existingRunning: number;
  scannedQueued: number;
  skipped: HeartbeatPickupSkipped;
}

interface PickupQueuedTasksForAgentOptions {
  input: HeartbeatPickupInput;
  emitEvent?: TaskBoardDeps['emitEvent'];
  loadTasks: () => TaskCard[];
  saveTasks: (tasks: TaskCard[]) => void;
  appendStatusHistory: (
    card: TaskCard,
    status: TaskStatus,
    by: string,
    note?: string | null,
    at?: number,
  ) => void;
}

function canRunByDependency(card: TaskCard, byId: Map<string, TaskCard>): boolean {
  if (!Array.isArray(card.dependencies) || card.dependencies.length === 0) return true;
  for (const depId of card.dependencies) {
    const dep = byId.get(depId);
    if (!dep || dep.status !== 'done') return false;
  }
  return true;
}

function compareQueuedPriority(a: TaskCard, b: TaskCard): number {
  const aPriority = PRIORITY_SCORE[a.priority] ?? PRIORITY_SCORE.medium;
  const bPriority = PRIORITY_SCORE[b.priority] ?? PRIORITY_SCORE.medium;
  if (aPriority !== bPriority) return aPriority - bPriority;
  const aQueuedAt = a.queuedAt ?? a.createdAt;
  const bQueuedAt = b.queuedAt ?? b.createdAt;
  if (aQueuedAt !== bQueuedAt) return aQueuedAt - bQueuedAt;
  return a.createdAt - b.createdAt;
}

export function pickupQueuedTasksForAgentOperation(
  options: PickupQueuedTasksForAgentOptions,
): HeartbeatPickupResult | { error: string } {
  if (!options.input || typeof options.input !== 'object' || Array.isArray(options.input)) {
    return { error: 'invalid request body' };
  }
  const agentId = String(options.input.agentId ?? '').trim();
  if (!agentId) return { error: 'agentId is required' };

  const rawLimit = Number(options.input.limit ?? 1);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(Math.trunc(rawLimit), HEARTBEAT_PICKUP_MAX))
    : 1;

  const tasks = options.loadTasks();
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const allowParallel = options.input.allowParallel === true;
  const runningTasks = tasks.filter(
    (task) =>
      task.status === 'running' &&
      (
        task.agentId === agentId ||
        ((task.assigneeType ?? 'agent') === 'agent' && task.assigneeId === agentId)
      ),
  );

  const skipped: HeartbeatPickupSkipped = {
    nonAgentAssignee: 0,
    assignedToOther: 0,
    unmetDependencies: 0,
  };

  if (!allowParallel && runningTasks.length > 0) {
    return {
      agentId,
      picked: [],
      pickedCount: 0,
      existingRunning: runningTasks.length,
      scannedQueued: 0,
      skipped,
    };
  }

  const candidates = tasks.filter((task) => task.status === 'queued');
  const available = candidates
    .filter((card) => {
      const assigneeType = card.assigneeType ?? 'agent';
      if (assigneeType !== 'agent') {
        skipped.nonAgentAssignee++;
        return false;
      }
      if ((card.assigneeId && card.assigneeId !== agentId) || (card.agentId && card.agentId !== agentId)) {
        skipped.assignedToOther++;
        return false;
      }
      if (!canRunByDependency(card, byId)) {
        skipped.unmetDependencies++;
        return false;
      }
      return true;
    })
    .sort(compareQueuedPriority);

  const picked = available.slice(0, limit);
  if (picked.length > 0) {
    const now = Date.now();
    for (const card of picked) {
      card.status = 'running';
      card.startedAt = now;
      card.completedAt = null;
      card.resultSummary = null;
      card.tokensUsed = null;
      card.error = null;
      card.costEstimate = null;
      card.runtimeMs = null;
      card.agentId = agentId;
      card.assigneeType = 'agent';
      card.assigneeId = agentId;
      options.appendStatusHistory(card, 'running', 'heartbeat', 'auto-picked from queue', now);
      options.emitEvent?.('task:updated', card);
    }
    options.saveTasks(tasks);
  }

  return {
    agentId,
    picked,
    pickedCount: picked.length,
    existingRunning: runningTasks.length,
    scannedQueued: candidates.length,
    skipped,
  };
}

export interface RecoveryResumeInput {
  agentId?: string;
  limit?: number;
}

export interface RecoveryResumeResult {
  resumedCount: number;
  resumedIds: string[];
  consideredRunning: number;
}

interface ResumeRunningTasksFromSnapshotOptions {
  input?: RecoveryResumeInput;
  emitEvent?: TaskBoardDeps['emitEvent'];
  loadTasks: () => TaskCard[];
  saveTasks: (tasks: TaskCard[]) => void;
  readActiveTaskSnapshot: () => ActiveTaskSnapshot;
  appendStatusHistory: (
    card: TaskCard,
    status: TaskStatus,
    by: string,
    note?: string | null,
    at?: number,
  ) => void;
}

export function resumeRunningTasksFromSnapshotOperation(
  options: ResumeRunningTasksFromSnapshotOptions,
): RecoveryResumeResult {
  const input = options.input ?? {};
  const tasks = options.loadTasks();
  const snapshot = options.readActiveTaskSnapshot();
  const activeIds = new Set(snapshot.active.map((item) => item.taskId));
  const agentId = typeof input.agentId === 'string' && input.agentId.trim()
    ? input.agentId.trim()
    : null;
  const rawLimit = Number(input.limit ?? 50);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(Math.trunc(rawLimit), 100))
    : 50;

  const running = tasks
    .filter((task) => task.status === 'running')
    .filter((task) => {
      if (agentId && task.agentId !== agentId && task.assigneeId !== agentId) return false;
      if (activeIds.size === 0) return true;
      return activeIds.has(task.id);
    })
    .sort((a, b) => (a.startedAt ?? a.createdAt) - (b.startedAt ?? b.createdAt));

  const resumed = running.slice(0, limit);
  if (resumed.length === 0) {
    return {
      resumedCount: 0,
      resumedIds: [],
      consideredRunning: running.length,
    };
  }

  const now = Date.now();
  for (const task of resumed) {
    task.status = 'queued';
    task.queuedAt = now;
    task.startedAt = null;
    options.appendStatusHistory(task, 'queued', 'recovery', 'auto-resume after restart', now);
    options.emitEvent?.('task:updated', task);
  }
  options.saveTasks(tasks);

  return {
    resumedCount: resumed.length,
    resumedIds: resumed.map((task) => task.id),
    consideredRunning: running.length,
  };
}

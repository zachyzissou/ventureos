import type {
  TaskCard,
  TaskPriority,
  TaskStatus,
} from '../types.js';
import type { AlertEvaluation } from '../alert-rules.js';

/** Default stuck-task timeout: 30 minutes. */
export const DEFAULT_STUCK_TIMEOUT_MS = 30 * 60 * 1000;

/** A running task that exceeds the configured timeout threshold. */
export interface StuckTask {
  id: string;
  title: string;
  agentId: string | null;
  priority: TaskPriority;
  startedAt: number;
  runningMs: number;
  thresholdMs: number;
  /** How far past the threshold (runningMs / thresholdMs). */
  overshootRatio: number;
}

/** Computed task board metrics — derived from existing data, no schema changes. */
export interface TaskBoardMetrics {
  updatedAt: number;
  /** Counts by status. */
  statusCounts: Record<TaskStatus, number>;
  total: number;
  /** Throughput: tasks that reached done/failed in the given windows. */
  throughput: {
    last24h: number;
    last7d: number;
    last30d: number;
  };
  /** Average runtime of completed tasks (done/failed with runtimeMs). */
  avgRuntimeMs: number | null;
  /** Median runtime of completed tasks. */
  medianRuntimeMs: number | null;
  /** Success rate: done / (done + failed), null if no terminal tasks. */
  successRate: number | null;
  /** Per-day completion counts for the last 7 days (ISO date → count). */
  completionTrend7d: Array<{ date: string; done: number; failed: number }>;
  /** Per-agent breakdown of completed/running tasks. */
  agentBreakdown: Array<{
    agentId: string;
    running: number;
    done: number;
    failed: number;
    avgRuntimeMs: number | null;
  }>;
  /** Stuck tasks — running tasks exceeding the timeout threshold. */
  stuckTasks: StuckTask[];
  stuckCount: number;
  stuckTimeoutMs: number;
  /** Alert evaluation results (Phase 9). */
  alerts?: AlertEvaluation;
}

/**
 * Identify running tasks that exceed the given timeout threshold.
 * Pure function — no side effects, bounded to the input array.
 */
export function computeStuckTasks(
  tasks: TaskCard[],
  timeoutMs: number = DEFAULT_STUCK_TIMEOUT_MS,
  now: number = Date.now(),
): StuckTask[] {
  const stuck: StuckTask[] = [];
  for (const t of tasks) {
    if (t.status !== 'running' || !t.startedAt) continue;
    const runningMs = now - t.startedAt;
    if (runningMs > timeoutMs) {
      stuck.push({
        id: t.id,
        title: t.title,
        agentId: t.agentId,
        priority: t.priority,
        startedAt: t.startedAt,
        runningMs,
        thresholdMs: timeoutMs,
        overshootRatio: runningMs / timeoutMs,
      });
    }
  }
  // Sort by overshoot descending (most stuck first)
  stuck.sort((a, b) => b.overshootRatio - a.overshootRatio);
  return stuck;
}

/**
 * Compute comprehensive task board metrics from existing task data.
 * All calculations are bounded (single pass + lightweight aggregations).
 */
export function computeMetrics(
  tasks: TaskCard[],
  opts: { stuckTimeoutMs?: number; now?: number } = {},
): TaskBoardMetrics {
  const now = opts.now ?? Date.now();
  const stuckTimeoutMs = opts.stuckTimeoutMs ?? DEFAULT_STUCK_TIMEOUT_MS;

  // Status counts
  const statusCounts: Record<TaskStatus, number> = {
    backlog: 0,
    queued: 0,
    running: 0,
    blocked: 0,
    review: 0,
    done: 0,
    failed: 0,
  };
  for (const t of tasks) {
    statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
  }

  // Throughput windows
  const ms24h = 24 * 60 * 60 * 1000;
  const ms7d = 7 * ms24h;
  const ms30d = 30 * ms24h;
  let tp24h = 0, tp7d = 0, tp30d = 0;

  // Runtime stats for completed tasks
  const runtimes: number[] = [];

  // Success rate
  let doneCount = 0, failedCount = 0;

  // Per-day completion trend (last 7 days)
  const trendMap = new Map<string, { done: number; failed: number }>();
  // Pre-fill 7 days
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * ms24h);
    const key = d.toISOString().slice(0, 10);
    trendMap.set(key, { done: 0, failed: 0 });
  }

  // Per-agent breakdown
  const agentMap = new Map<string, { running: number; done: number; failed: number; runtimes: number[] }>();

  for (const t of tasks) {
    const aid = t.agentId ?? '_unassigned';
    if (!agentMap.has(aid)) {
      agentMap.set(aid, { running: 0, done: 0, failed: 0, runtimes: [] });
    }
    const ag = agentMap.get(aid)!;

    if (t.status === 'running') ag.running++;

    // Terminal tasks
    if (t.status === 'done' || t.status === 'failed') {
      if (t.status === 'done') { doneCount++; ag.done++; }
      if (t.status === 'failed') { failedCount++; ag.failed++; }

      // Throughput: use completedAt
      if (t.completedAt) {
        const age = now - t.completedAt;
        if (age <= ms24h) tp24h++;
        if (age <= ms7d) tp7d++;
        if (age <= ms30d) tp30d++;

        // Trend
        const dateKey = new Date(t.completedAt).toISOString().slice(0, 10);
        if (trendMap.has(dateKey)) {
          const entry = trendMap.get(dateKey)!;
          if (t.status === 'done') entry.done++;
          else entry.failed++;
        }
      }

      // Runtime
      const rt = t.runtimeMs ?? (t.startedAt && t.completedAt ? t.completedAt - t.startedAt : null);
      if (rt != null && rt >= 0) {
        runtimes.push(rt);
        ag.runtimes.push(rt);
      }
    }
  }

  // Average & median runtime
  const avgRuntimeMs = runtimes.length > 0
    ? Math.round(runtimes.reduce((s, v) => s + v, 0) / runtimes.length)
    : null;
  const medianRuntimeMs = runtimes.length > 0
    ? (() => {
        const sorted = [...runtimes].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0
          ? sorted[mid]
          : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
      })()
    : null;

  // Success rate
  const totalTerminal = doneCount + failedCount;
  const successRate = totalTerminal > 0 ? Math.round((doneCount / totalTerminal) * 10000) / 10000 : null;

  // Completion trend array
  const completionTrend7d = [...trendMap.entries()].map(([date, v]) => ({
    date,
    done: v.done,
    failed: v.failed,
  }));

  // Agent breakdown
  const agentBreakdown = [...agentMap.entries()]
    .filter(([id]) => id !== '_unassigned' || agentMap.size === 1) // include unassigned only if it's the only bucket
    .map(([agentId, data]) => ({
      agentId,
      running: data.running,
      done: data.done,
      failed: data.failed,
      avgRuntimeMs: data.runtimes.length > 0
        ? Math.round(data.runtimes.reduce((s, v) => s + v, 0) / data.runtimes.length)
        : null,
    }))
    .sort((a, b) => (b.done + b.failed + b.running) - (a.done + a.failed + a.running));

  // Stuck tasks
  const stuckTasks = computeStuckTasks(tasks, stuckTimeoutMs, now);

  return {
    updatedAt: now,
    statusCounts,
    total: tasks.length,
    throughput: { last24h: tp24h, last7d: tp7d, last30d: tp30d },
    avgRuntimeMs,
    medianRuntimeMs,
    successRate,
    completionTrend7d,
    agentBreakdown,
    stuckTasks,
    stuckCount: stuckTasks.length,
    stuckTimeoutMs,
  };
}

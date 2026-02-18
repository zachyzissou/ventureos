/**
 * Task Board (Kanban) route handlers.
 * Issue #219 — first vertical slice + SSE real-time updates.
 *
 * Provides CRUD + summary endpoints for task cards that flow through
 * Backlog → Queued → Running → Done/Failed columns.
 *
 * SSE stream at GET /api/task-board/events pushes task:created,
 * task:updated, and task:deleted events to connected clients.
 *
 * Data is persisted as a single JSON file on disk (consistent with
 * the rest of the dashboard's filesystem-based storage).
 *
 * Phase 8 (Issue #219): Metrics history persistence — snapshots are
 * appended on each metrics API read (with cooldown) and queryable via
 * GET /api/task-board/metrics/history.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  TaskBoardDeps,
  TaskCard,
  TaskStatus,
  TaskPriority,
  TaskBoardSummary,
} from '../types.js';

import {
  addClient,
  addFilteredClient,
  removeClient,
  clientCount,
  parseSubscriptionFilter,
} from '../task-board-events.js';

import {
  maybeAppendSnapshot,
  queryHistory,
} from '../metrics-history.js';

import {
  readAlertConfig,
  writeAlertConfig,
  evaluateAlerts,
  validateAlertConfig,
  mergeWithDefaults,
} from '../alert-rules.js';

import type {
  AlertRulesConfig,
  AlertEvaluation,
} from '../alert-rules.js';

import {
  maybeAppendAlertEvent,
  queryAlertTimeline,
} from '../alert-history.js';

import {
  readWebhookConfig,
  writeWebhookConfig,
  validateWebhookConfig,
  sanitizeConfig as sanitizeWebhookConfig,
  redactConfig as redactWebhookConfig,
  maybeDeliverWebhooks,
  sendTestWebhook,
} from '../alert-webhook.js';

import {
  queryDeliveryHistory,
} from '../webhook-delivery-history.js';

import {
  computeWebhookHealth,
} from '../webhook-health-stats.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_STATUSES: TaskStatus[] = ['backlog', 'queued', 'running', 'done', 'failed'];
const VALID_PRIORITIES: TaskPriority[] = ['critical', 'high', 'medium', 'low'];

/** Allowed state transitions (from → to[]). */
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  backlog: ['queued', 'done'],
  queued: ['running', 'backlog', 'done'],
  running: ['done', 'failed'],
  done: ['backlog'],
  failed: ['backlog', 'queued'],
};

// ─── Store helpers ───────────────────────────────────────────────────────────

function taskFilePath(dataDir: string): string {
  return path.join(dataDir, 'task-board.json');
}

export function loadTasks(dataDir: string): TaskCard[] {
  try {
    const fp = taskFilePath(dataDir);
    if (!fs.existsSync(fp)) return [];
    const raw = fs.readFileSync(fp, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as TaskCard[];
    if (parsed && Array.isArray(parsed.tasks)) return parsed.tasks as TaskCard[];
    return [];
  } catch {
    return [];
  }
}

function saveTasks(dataDir: string, tasks: TaskCard[]): void {
  const fp = taskFilePath(dataDir);
  const dir = path.dirname(fp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fp, JSON.stringify({ tasks, updatedAt: Date.now() }, null, 2));
}

// ─── Metrics & Stuck-Task Detection (Issue #219 — Task Metrics Dashboard) ────

/** Default stuck-task timeout: 30 minutes. */
const DEFAULT_STUCK_TIMEOUT_MS = 30 * 60 * 1000;

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
    backlog: 0, queued: 0, running: 0, done: 0, failed: 0,
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

// ─── Derived data ────────────────────────────────────────────────────────────

export function buildSummary(tasks: TaskCard[]): TaskBoardSummary {
  const columns: Record<TaskStatus, number> = {
    backlog: 0,
    queued: 0,
    running: 0,
    done: 0,
    failed: 0,
  };
  const byAgent: Record<string, Record<TaskStatus, number>> = {};

  for (const t of tasks) {
    columns[t.status] = (columns[t.status] ?? 0) + 1;
    const aid = t.agentId ?? '_unassigned';
    if (!byAgent[aid]) {
      byAgent[aid] = { backlog: 0, queued: 0, running: 0, done: 0, failed: 0 };
    }
    byAgent[aid][t.status] = (byAgent[aid][t.status] ?? 0) + 1;
  }

  return { updatedAt: Date.now(), columns, byAgent, total: tasks.length };
}

export function filterTasks(
  tasks: TaskCard[],
  opts: { status?: string | null; agentId?: string | null; priority?: string | null },
): TaskCard[] {
  let out = tasks;
  if (opts.status && VALID_STATUSES.includes(opts.status as TaskStatus)) {
    out = out.filter((t) => t.status === opts.status);
  }
  if (opts.agentId) {
    out = out.filter((t) => t.agentId === opts.agentId);
  }
  if (opts.priority && VALID_PRIORITIES.includes(opts.priority as TaskPriority)) {
    out = out.filter((t) => t.priority === opts.priority);
  }
  return out;
}

export function isValidTransition(from: TaskStatus, to: TaskStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

// ─── Validation helpers ──────────────────────────────────────────────────────

interface CreateInput {
  title?: string;
  description?: string;
  priority?: string;
  agentId?: string | null;
  status?: string;
}

function validateCreate(body: CreateInput): { ok: true; card: TaskCard } | { ok: false; error: string } {
  const title = (body.title ?? '').trim();
  if (!title) return { ok: false, error: 'title is required' };
  if (title.length > 200) return { ok: false, error: 'title must be ≤ 200 chars' };

  const description = (body.description ?? '').trim();
  if (description.length > 2000) return { ok: false, error: 'description must be ≤ 2000 chars' };

  const priority = (body.priority ?? 'medium') as TaskPriority;
  if (!VALID_PRIORITIES.includes(priority)) {
    return { ok: false, error: `invalid priority: ${priority}` };
  }

  const status = (body.status ?? 'backlog') as TaskStatus;
  if (!VALID_STATUSES.includes(status)) {
    return { ok: false, error: `invalid status: ${status}` };
  }

  const agentId = body.agentId?.trim() || null;

  const card: TaskCard = {
    id: crypto.randomUUID(),
    agentId,
    title,
    description,
    priority,
    status,
    createdAt: Date.now(),
    queuedAt: status === 'queued' ? Date.now() : null,
    startedAt: null,
    completedAt: null,
    resultSummary: null,
    tokensUsed: null,
    error: null,
    costEstimate: null,
    runtimeMs: null,
  };

  return { ok: true, card };
}

// ─── Batch operations (Issue #219 — Bulk Operations Panel) ───────────────────

/** Maximum cards per batch request to prevent unbounded operations. */
const MAX_BATCH_SIZE = 50;

/** Statuses that are eligible for the archive (delete) action. */
const ARCHIVABLE_STATUSES: TaskStatus[] = ['done', 'failed'];

interface BatchInput {
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

/**
 * Execute a batch operation (transition or archive) on multiple cards.
 * All mutations are applied atomically — either the file is written with
 * all successful changes, or rolled back on unexpected errors.
 *
 * For transitions: each card is validated individually against the state
 * machine. Failed transitions are reported per-card but do not block
 * successful ones (partial success model).
 *
 * For archive: only done/failed cards can be archived. Others are skipped
 * with per-card error.
 */
export function executeBatch(
  dataDir: string,
  input: BatchInput,
  emitEvent?: TaskBoardDeps['emitEvent'],
): BatchResult {
  const action = input.action ?? '';

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

  const ids = input.ids;
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

  // De-duplicate ids
  const uniqueIds = [...new Set(ids)];

  const tasks = loadTasks(dataDir);
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const results: BatchItemResult[] = [];
  let succeeded = 0;
  let failed = 0;

  if (action === 'transition') {
    const targetStatus = input.status as TaskStatus;
    if (!targetStatus || !VALID_STATUSES.includes(targetStatus)) {
      return {
        action,
        total: uniqueIds.length,
        succeeded: 0,
        failed: uniqueIds.length,
        results: [],
        error: `invalid target status: ${input.status}`,
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
        // Already at target — count as success (idempotent)
        results.push({ id, ok: true });
        succeeded++;
        continue;
      }
      if (!isValidTransition(card.status, targetStatus)) {
        results.push({
          id,
          ok: false,
          error: `invalid transition: ${card.status} → ${targetStatus}`,
        });
        failed++;
        continue;
      }

      // Apply transition
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

      results.push({ id, ok: true });
      succeeded++;
      emitEvent?.('task:updated', card);
    }

    // Persist all changes
    saveTasks(dataDir, tasks);
  } else if (action === 'archive') {
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
      emitEvent?.('task:deleted', card);
    }

    if (toRemove.length > 0) {
      const removeSet = new Set(toRemove);
      const remaining = tasks.filter((t) => !removeSet.has(t.id));
      saveTasks(dataDir, remaining);
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

// ─── Route handler ───────────────────────────────────────────────────────────

export async function handleTaskBoard(
  req: IncomingMessage,
  res: ServerResponse,
  deps: TaskBoardDeps,
): Promise<boolean> {
  const { dataDir, sendJson, readRequestBody } = deps;
  if (!req?.url) return false;

  const url = req.url;
  const method = req.method ?? 'GET';

  // ── GET /api/task-board/events (SSE) ─────────────────────────────────────
  // Real-time event stream for task mutations. Issue #219.
  // Supports optional subscription filters via query params:
  //   ?status=running&agentId=oracle&priority=high
  // Server-side filtering is applied before broadcasting to each client.
  if (url.startsWith('/api/task-board/events') && method === 'GET') {
    // Parse optional subscription filter from query string
    const evtParams = new URL(url, 'http://localhost').searchParams;
    const filter = parseSubscriptionFilter({
      status: evtParams.get('status'),
      agentId: evtParams.get('agentId'),
      priority: evtParams.get('priority'),
    });

    if (!addFilteredClient(res, filter)) {
      sendJson(res, { error: 'too many SSE connections' }, 503);
      return true;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'connected', ts: Date.now(), clients: clientCount(), filter })}\n\n`);

    req.on('close', () => {
      removeClient(res);
    });

    return true;
  }

  // ── GET /api/task-board ────────────────────────────────────────────────────
  // Returns filtered list of cards. Query params: status, agentId, priority.
  if (url.startsWith('/api/task-board') && !url.startsWith('/api/task-board/') && method === 'GET') {
    const params = new URL(url, 'http://localhost').searchParams;
    const tasks = loadTasks(dataDir);
    const filtered = filterTasks(tasks, {
      status: params.get('status'),
      agentId: params.get('agentId'),
      priority: params.get('priority'),
    });
    sendJson(res, { tasks: filtered, total: filtered.length });
    return true;
  }

  // ── POST /api/task-board/batch — Issue #219, Phase 6 (Bulk Operations) ────
  // Batch operations on multiple cards. Bounded to MAX_BATCH_SIZE per request.
  // Supports: { action: "transition", ids: [...], status: "done" }
  //           { action: "archive",    ids: [...] }
  // Returns per-card results with success/failure breakdown.
  if (url === '/api/task-board/batch' && method === 'POST') {
    let body: BatchInput;
    try {
      const raw = await readRequestBody(req, { maxBytes: 32768 });
      body = JSON.parse(raw) as BatchInput;
    } catch {
      sendJson(res, { error: 'invalid JSON body' }, 400);
      return true;
    }

    const result = executeBatch(dataDir, body, deps.emitEvent);
    const status = result.error ? 400 : 200;
    sendJson(res, result, status);
    return true;
  }

  // ── GET /api/task-board/metrics/history — Issue #219, Phase 8 ───────────────
  // Returns persisted metrics snapshots for time-series charting.
  // Query params:
  //   ?limit=50       — max number of most-recent points (default 100, max 500)
  //   ?sinceMs=86400000 — only points within this window (default: all retained)
  // Note: this route MUST be checked before the general /metrics route below.
  if (url.startsWith('/api/task-board/metrics/history') && method === 'GET') {
    const histParams = new URL(url, 'http://localhost').searchParams;
    const limit = Math.max(1, Math.min(Number(histParams.get('limit')) || 100, 500));
    const sinceMs = histParams.has('sinceMs')
      ? Math.max(0, Number(histParams.get('sinceMs')) || 0)
      : undefined;
    const snapshots = queryHistory(dataDir, { limit, sinceMs });
    sendJson(res, { snapshots, count: snapshots.length });
    return true;
  }

  // ── GET /api/task-board/alerts/config — Issue #219, Phase 9 ──────────────
  // Read/write alert threshold configuration.
  // GET: returns current config. PUT: updates config (validated).
  if (url.startsWith('/api/task-board/alerts/config') && method === 'GET') {
    const config = readAlertConfig(dataDir);
    sendJson(res, { config });
    return true;
  }

  if (url.startsWith('/api/task-board/alerts/config') && method === 'PUT') {
    let body: unknown;
    try {
      const raw = await readRequestBody(req, { maxBytes: 8192 });
      body = JSON.parse(raw);
    } catch {
      sendJson(res, { error: 'invalid JSON body' }, 400);
      return true;
    }

    const errors = validateAlertConfig(body);
    if (errors.length > 0) {
      sendJson(res, { error: 'validation failed', errors }, 400);
      return true;
    }

    const merged = mergeWithDefaults(body as Record<string, unknown>);
    writeAlertConfig(dataDir, merged);
    sendJson(res, { config: merged });
    return true;
  }

  // ── GET /api/task-board/alerts/timeline — Issue #219, Phase 10 ─────────────
  // Returns alert history timeline with summary statistics.
  // Query params:
  //   ?limit=50        — max events to return (default 50, max 200)
  //   ?sinceMs=3600000 — only events within this window (default: all retained)
  //   ?minSeverity=warning — filter to warning+ or critical+ events
  if (url.startsWith('/api/task-board/alerts/timeline') && method === 'GET') {
    const tlParams = new URL(url, 'http://localhost').searchParams;
    const limit = Math.max(1, Math.min(Number(tlParams.get('limit')) || 50, 200));
    const sinceMs = tlParams.has('sinceMs')
      ? Math.max(0, Number(tlParams.get('sinceMs')) || 0)
      : undefined;
    const minSeverityRaw = tlParams.get('minSeverity');
    const validSeverities = ['ok', 'warning', 'critical'];
    const minSeverity = minSeverityRaw && validSeverities.includes(minSeverityRaw)
      ? (minSeverityRaw as 'ok' | 'warning' | 'critical')
      : undefined;

    const timeline = queryAlertTimeline(dataDir, { limit, sinceMs, minSeverity });
    sendJson(res, timeline);
    return true;
  }

  // ── GET /api/task-board/webhooks/config — Issue #219, Phase 11 ──────────────
  // Read/write webhook notification configuration.
  // GET: returns current config (secrets redacted).
  // PUT: updates config (validated).
  if (url.startsWith('/api/task-board/webhooks/config') && method === 'GET') {
    const config = readWebhookConfig(dataDir);
    sendJson(res, { config: redactWebhookConfig(config) });
    return true;
  }

  if (url.startsWith('/api/task-board/webhooks/config') && method === 'PUT') {
    let body: unknown;
    try {
      const raw = await readRequestBody(req, { maxBytes: 8192 });
      body = JSON.parse(raw);
    } catch {
      sendJson(res, { error: 'invalid JSON body' }, 400);
      return true;
    }

    const errors = validateWebhookConfig(body);
    if (errors.length > 0) {
      sendJson(res, { error: 'validation failed', errors }, 400);
      return true;
    }

    const sanitized = sanitizeWebhookConfig(body);

    // Secret preservation: when a target omits the `secret` field, carry
    // forward the existing secret from the persisted config so that
    // dashboard clients that never receive raw secrets can update other
    // fields without inadvertently clearing them.
    const existingConfig = readWebhookConfig(dataDir);
    const existingTargetMap = new Map(existingConfig.targets.map((t) => [t.id, t]));
    for (const target of sanitized.targets) {
      if (target.secret === undefined || target.secret === '') {
        const existing = existingTargetMap.get(target.id);
        if (existing?.secret) {
          target.secret = existing.secret;
        } else {
          delete target.secret;
        }
      }
    }

    writeWebhookConfig(dataDir, sanitized);
    sendJson(res, { config: redactWebhookConfig(sanitized) });
    return true;
  }

  // ── POST /api/task-board/webhooks/test — Issue #219, Phase 14 ────────────
  // Send a test ping to one or all enabled webhook targets.
  // Explicit user-triggered action — sends a non-production test payload.
  // Body (optional): { "targetId": "slack" } — omit to test all enabled targets.
  // Response: { results: WebhookTestResult[], error?: string }
  if (url.startsWith('/api/task-board/webhooks/test') && method === 'POST') {
    let body: { targetId?: string } = {};
    try {
      const raw = await readRequestBody(req, { maxBytes: 1024 });
      if (raw.trim()) {
        body = JSON.parse(raw) as { targetId?: string };
      }
    } catch {
      sendJson(res, { error: 'invalid JSON body' }, 400);
      return true;
    }

    // Validate targetId if provided
    if (body.targetId !== undefined && typeof body.targetId !== 'string') {
      sendJson(res, { error: 'targetId must be a string' }, 400);
      return true;
    }

    try {
      const result = await sendTestWebhook(dataDir, {
        targetId: body.targetId || undefined,
      });

      if (result.error) {
        sendJson(res, result, 422);
        return true;
      }

      sendJson(res, result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      sendJson(res, { error: `Test delivery failed: ${msg}`, results: [] }, 500);
    }

    return true;
  }

  // ── GET /api/task-board/webhooks/health — Issue #219, Phase 15 ───────────
  // Returns per-target webhook health stats aggregated from delivery history.
  // Query params:
  //   ?windowMs=86400000  — aggregation window (default 24h, max 48h)
  //   ?targetId=slack     — filter to a specific target
  if (url.startsWith('/api/task-board/webhooks/health') && method === 'GET') {
    const healthParams = new URL(url, 'http://localhost').searchParams;
    const windowMs = healthParams.has('windowMs')
      ? Math.max(1000, Math.min(Number(healthParams.get('windowMs')) || 86400000, 172800000))
      : undefined;
    const targetId = healthParams.get('targetId') || undefined;

    const result = computeWebhookHealth(dataDir, { windowMs, targetId });
    sendJson(res, result);
    return true;
  }

  // ── GET /api/task-board/webhooks/deliveries — Issue #219, Phase 13 ─────────
  // Returns recent webhook delivery events with summary statistics.
  // Query params:
  //   ?limit=50        — max events to return (default 50, max 200)
  //   ?sinceMs=3600000 — only events within this time window (default: all retained)
  //   ?targetId=slack  — filter by target ID
  //   ?status=success  — filter: 'success' or 'failure'
  if (url.startsWith('/api/task-board/webhooks/deliveries') && method === 'GET') {
    const dlvParams = new URL(url, 'http://localhost').searchParams;
    const limit = Math.max(1, Math.min(Number(dlvParams.get('limit')) || 50, 200));
    const sinceMs = dlvParams.has('sinceMs')
      ? Math.max(0, Number(dlvParams.get('sinceMs')) || 0)
      : undefined;
    const targetId = dlvParams.get('targetId') || undefined;
    const statusRaw = dlvParams.get('status');
    const status = statusRaw === 'success' || statusRaw === 'failure' ? statusRaw : undefined;

    const result = queryDeliveryHistory(dataDir, { limit, sinceMs, targetId, status });
    sendJson(res, result);
    return true;
  }

  // ── GET /api/task-board/metrics — Issue #219, Task Metrics Dashboard ───────
  // Returns computed metrics: throughput, runtime stats, trends, stuck tasks.
  // Optional query params:
  //   ?stuckTimeoutMs=1800000 — override stuck-task timeout (default 30min)
  //   ?includeAlerts=true — include alert evaluation in response (Phase 9)
  // Side-effect (Phase 8): appends a snapshot to the metrics history file
  // if the cooldown interval has elapsed (no extra writes on rapid polling).
  // Side-effect (Phase 10): appends alert event to history for timeline.
  if (url.startsWith('/api/task-board/metrics') && method === 'GET') {
    const metricsParams = new URL(url, 'http://localhost').searchParams;
    const stuckTimeoutMs = metricsParams.has('stuckTimeoutMs')
      ? Math.max(1000, Math.min(Number(metricsParams.get('stuckTimeoutMs')) || DEFAULT_STUCK_TIMEOUT_MS, 86400000))
      : undefined;
    const tasks = loadTasks(dataDir);
    const metrics = computeMetrics(tasks, { stuckTimeoutMs });

    // Alert evaluation (Phase 9): included by default, opt-out with ?includeAlerts=false
    const includeAlerts = metricsParams.get('includeAlerts') !== 'false';
    if (includeAlerts) {
      try {
        const alertConfig = readAlertConfig(dataDir);
        metrics.alerts = evaluateAlerts(metrics, alertConfig);
      } catch {
        // Non-critical — don't break the metrics response
      }
    }

    // Piggyback: persist snapshot (bounded by 5-min cooldown)
    try {
      maybeAppendSnapshot(dataDir, metrics);
    } catch {
      // Non-critical — don't break the metrics response
    }

    // Piggyback (Phase 10): record alert event for timeline
    if (metrics.alerts) {
      try {
        maybeAppendAlertEvent(dataDir, metrics.alerts);
      } catch {
        // Non-critical — don't break the metrics response
      }
    }

    // Piggyback (Phase 11): fire webhook notifications on severity transitions.
    // Fire-and-forget — delivery is async and non-blocking.
    if (metrics.alerts) {
      try {
        // Intentionally not awaited — delivery runs in background
        void maybeDeliverWebhooks(dataDir, metrics.alerts);
      } catch {
        // Non-critical — don't break the metrics response
      }
    }

    sendJson(res, metrics);
    return true;
  }

  // ── GET /api/task-board/summary ────────────────────────────────────────────
  // Returns column counts + per-agent breakdown.
  if (url === '/api/task-board/summary' && method === 'GET') {
    const tasks = loadTasks(dataDir);
    sendJson(res, buildSummary(tasks));
    return true;
  }

  // ── GET /api/task-board/:id ────────────────────────────────────────────────
  // Returns a single card by ID.
  if (url.startsWith('/api/task-board/') && method === 'GET') {
    const id = url.split('/api/task-board/')[1]?.split('?')[0];
    if (!id) return false;
    const tasks = loadTasks(dataDir);
    const card = tasks.find((t) => t.id === id);
    if (!card) {
      sendJson(res, { error: 'not found' }, 404);
      return true;
    }
    sendJson(res, { card });
    return true;
  }

  // ── POST /api/task-board ───────────────────────────────────────────────────
  // Create a new card.
  if (url === '/api/task-board' && method === 'POST') {
    let body: CreateInput;
    try {
      const raw = await readRequestBody(req, { maxBytes: 8192 });
      body = JSON.parse(raw) as CreateInput;
    } catch {
      sendJson(res, { error: 'invalid JSON body' }, 400);
      return true;
    }

    const result = validateCreate(body);
    if (!result.ok) {
      sendJson(res, { error: result.error }, 400);
      return true;
    }

    const tasks = loadTasks(dataDir);
    tasks.push(result.card);
    saveTasks(dataDir, tasks);
    deps.emitEvent?.('task:created', result.card);
    sendJson(res, { card: result.card }, 201);
    return true;
  }

  // ── PATCH /api/task-board/:id ──────────────────────────────────────────────
  // Update a card (status transition, result, etc.).
  if (url.startsWith('/api/task-board/') && method === 'PATCH') {
    const id = url.split('/api/task-board/')[1]?.split('?')[0];
    if (!id) return false;

    let body: Record<string, unknown>;
    try {
      const raw = await readRequestBody(req, { maxBytes: 8192 });
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      sendJson(res, { error: 'invalid JSON body' }, 400);
      return true;
    }

    const tasks = loadTasks(dataDir);
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1) {
      sendJson(res, { error: 'not found' }, 404);
      return true;
    }

    const card = { ...tasks[idx] };

    // Status transition
    if (typeof body.status === 'string') {
      const newStatus = body.status as TaskStatus;
      if (!VALID_STATUSES.includes(newStatus)) {
        sendJson(res, { error: `invalid status: ${newStatus}` }, 400);
        return true;
      }
      if (!isValidTransition(card.status, newStatus)) {
        sendJson(
          res,
          { error: `invalid transition: ${card.status} → ${newStatus}` },
          400,
        );
        return true;
      }
      card.status = newStatus;
      const now = Date.now();
      if (newStatus === 'queued') card.queuedAt = now;
      if (newStatus === 'running') card.startedAt = now;
      if (newStatus === 'done' || newStatus === 'failed') card.completedAt = now;
    }

    // Mutable fields
    if (typeof body.title === 'string') card.title = (body.title as string).slice(0, 200);
    if (typeof body.description === 'string') card.description = (body.description as string).slice(0, 2000);
    if (typeof body.agentId === 'string') card.agentId = body.agentId || null;
    if (typeof body.priority === 'string' && VALID_PRIORITIES.includes(body.priority as TaskPriority)) {
      card.priority = body.priority as TaskPriority;
    }
    if (typeof body.resultSummary === 'string') card.resultSummary = body.resultSummary;
    if (typeof body.tokensUsed === 'number') card.tokensUsed = body.tokensUsed;
    if (typeof body.error === 'string') card.error = body.error;
    if (typeof body.costEstimate === 'number') card.costEstimate = body.costEstimate;
    if (typeof body.runtimeMs === 'number') card.runtimeMs = body.runtimeMs;

    // Auto-compute runtimeMs on completion if not explicitly provided (Issue #219)
    if (
      (card.status === 'done' || card.status === 'failed') &&
      card.startedAt &&
      card.completedAt &&
      card.runtimeMs == null
    ) {
      card.runtimeMs = card.completedAt - card.startedAt;
    }

    tasks[idx] = card;
    saveTasks(dataDir, tasks);
    deps.emitEvent?.('task:updated', card);
    sendJson(res, { card });
    return true;
  }

  // ── DELETE /api/task-board/:id ─────────────────────────────────────────────
  // Remove a card.
  if (url.startsWith('/api/task-board/') && method === 'DELETE') {
    const id = url.split('/api/task-board/')[1]?.split('?')[0];
    if (!id) return false;

    const tasks = loadTasks(dataDir);
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1) {
      sendJson(res, { error: 'not found' }, 404);
      return true;
    }

    const deletedCard = tasks[idx];
    tasks.splice(idx, 1);
    saveTasks(dataDir, tasks);
    deps.emitEvent?.('task:deleted', deletedCard);
    sendJson(res, { ok: true });
    return true;
  }

  return false;
}

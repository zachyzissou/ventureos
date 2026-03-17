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
  TaskAssigneeType,
  TaskBoardSummary,
  TaskStatusHistoryEntry,
  TaskPipelineTemplate,
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
  exportMetricsHistory,
} from '../metrics-history.js';
import type { MetricsExportFormat } from '../metrics-history.js';

import {
  readAlertConfig,
  writeAlertConfig,
  evaluateAlerts,
  validateAlertConfig,
  mergeWithDefaults,
} from '../alert-rules.js';

import type {
  AlertRulesConfig,
} from '../alert-rules.js';
import {
  DEFAULT_STUCK_TIMEOUT_MS,
  computeMetrics,
  computeStuckTasks,
} from './task-board-metrics.js';
import { sanitizeStringList } from './task-board-utils.js';
import {
  executeBatchOperation,
  pickupQueuedTasksForAgentOperation,
  resumeRunningTasksFromSnapshotOperation,
} from './task-board-operations.js';
import type {
  BatchInput,
  BatchResult,
  HeartbeatPickupInput,
  HeartbeatPickupResult,
  RecoveryResumeInput,
  RecoveryResumeResult,
} from './task-board-operations.js';
export {
  DEFAULT_STUCK_TIMEOUT_MS,
  computeMetrics,
  computeStuckTasks,
};
export type {
  StuckTask,
  TaskBoardMetrics,
} from './task-board-metrics.js';
export type {
  BatchResult,
  HeartbeatPickupResult,
  RecoveryResumeResult,
} from './task-board-operations.js';
import {
  isSystemPipelineTemplateId,
  instantiatePipelineFromTemplate,
  loadCustomPipelineTemplates,
  loadPipelineTemplates,
  saveCustomPipelineTemplates,
  validateTemplateUpsert,
} from './task-board-templates.js';
import type { PipelineFromTemplateInput } from './task-board-templates.js';
export { loadPipelineTemplates } from './task-board-templates.js';

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
  queryRetryActivity,
  exportDeliveryHistory,
  exportRetryActivity,
} from '../webhook-delivery-history.js';
import type { ExportFormat } from '../webhook-delivery-history.js';

import {
  computeWebhookHealth,
} from '../webhook-health-stats.js';

import {
  maybeEscalate,
  getEscalationState,
  computeEscalationStatus,
} from '../escalation-policy.js';

import {
  queryEscalationHistory,
  exportEscalationHistory,
} from '../escalation-history.js';
import type { EscalationEventType, EscalationExportFormat } from '../escalation-history.js';

import {
  exportAlertHistory,
} from '../alert-history.js';
import type { AlertExportFormat } from '../alert-history.js';

import {
  exportWebhookHealth,
} from '../webhook-health-stats.js';
import type { HealthExportFormat } from '../webhook-health-stats.js';

import {
  exportTaskCards,
  CARD_EXPORT_MAX_ITEMS,
} from '../task-card-export.js';
import type { CardExportFormat } from '../task-card-export.js';
import {
  readActiveTaskSnapshot,
  detectStaleTasks,
  writeActiveTasksFromCards,
} from '../active-tasks.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_STATUSES: TaskStatus[] = [
  'backlog',
  'queued',
  'running',
  'blocked',
  'review',
  'done',
  'failed',
];
const VALID_PRIORITIES: TaskPriority[] = ['critical', 'high', 'medium', 'low'];
const VALID_ASSIGNEE_TYPES: TaskAssigneeType[] = ['human', 'control_plane', 'nexus', 'agent'];

/** Allowed state transitions (from → to[]). */
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  backlog: ['queued', 'blocked', 'review', 'done'],
  queued: ['running', 'blocked', 'backlog', 'done'],
  running: ['review', 'blocked', 'done', 'failed'],
  blocked: ['queued', 'running', 'review', 'done'],
  review: ['running', 'done', 'blocked'],
  done: ['backlog'],
  failed: ['backlog', 'queued', 'blocked'],
};

// ─── Store helpers ───────────────────────────────────────────────────────────

function taskFilePath(dataDir: string): string {
  return path.join(dataDir, 'task-board.json');
}

function normalizeStatusHistory(card: TaskCard): TaskStatusHistoryEntry[] {
  const history: TaskStatusHistoryEntry[] = [];
  if (Array.isArray(card.statusHistory)) {
    for (const entry of card.statusHistory) {
      if (!entry || typeof entry !== 'object') continue;
      const status = (entry as { status?: string }).status as TaskStatus;
      const at = (entry as { at?: number }).at;
      const by = (entry as { by?: string }).by;
      const note = (entry as { note?: string | null }).note ?? null;
      if (!VALID_STATUSES.includes(status)) continue;
      if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) continue;
      if (typeof by !== 'string' || !by.trim()) continue;
      history.push({
        status,
        at: Math.trunc(at),
        by: by.trim().slice(0, 80),
        note: typeof note === 'string' ? note.slice(0, 200) : null,
      });
    }
  }
  if (history.length === 0) {
    history.push({
      status: card.status,
      at: card.createdAt || Date.now(),
      by: 'system',
      note: 'initialized',
    });
  }
  return history.sort((a, b) => a.at - b.at);
}

function normalizeTaskCard(raw: TaskCard): TaskCard {
  const status: TaskStatus = VALID_STATUSES.includes(raw.status) ? raw.status : 'backlog';
  const assigneeType = normalizeAssigneeType(raw.assigneeType as string | undefined, 'agent');
  const normalized: TaskCard = {
    ...raw,
    status,
    missionId: raw.missionId ? String(raw.missionId).slice(0, 120) : null,
    missionBrief: raw.missionBrief ? String(raw.missionBrief).slice(0, 300) : null,
    assigneeType,
    assigneeId: raw.assigneeId ? String(raw.assigneeId).slice(0, 120) : null,
    dependencies: sanitizeStringList(raw.dependencies, { maxItems: 20, maxLen: 80 }),
    artifactLinks: sanitizeStringList(raw.artifactLinks, { maxItems: 20, maxLen: 300 }),
    replaySessionId: raw.replaySessionId ? String(raw.replaySessionId).slice(0, 120) : null,
    statusHistory: [],
  };
  normalized.statusHistory = normalizeStatusHistory(normalized);
  return normalized;
}

function appendStatusHistory(
  card: TaskCard,
  status: TaskStatus,
  by: string,
  note: string | null = null,
  at = Date.now(),
): void {
  if (!card.statusHistory) card.statusHistory = [];
  const last = card.statusHistory[card.statusHistory.length - 1];
  if (last && last.status === status) return;
  card.statusHistory.push({
    status,
    at,
    by: by.slice(0, 80),
    note: note ? note.slice(0, 200) : null,
  });
}

export function loadTasks(dataDir: string): TaskCard[] {
  try {
    const fp = taskFilePath(dataDir);
    if (!fs.existsSync(fp)) return [];
    const raw = fs.readFileSync(fp, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((card) => normalizeTaskCard(card as TaskCard));
    if (parsed && Array.isArray(parsed.tasks)) {
      return parsed.tasks.map((card: TaskCard) => normalizeTaskCard(card));
    }
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

function saveTasksWithActiveTracker(dataDir: string, tasks: TaskCard[]): void {
  saveTasks(dataDir, tasks);
  // Keep memory/active-tasks.md in sync with task-board status changes.
  try {
    writeActiveTasksFromCards(dataDir, tasks);
  } catch {
    // Non-critical — task-board.json remains source of truth.
  }
}

// ─── Derived data ────────────────────────────────────────────────────────────

export function buildSummary(tasks: TaskCard[]): TaskBoardSummary {
  const columns: Record<TaskStatus, number> = {
    backlog: 0,
    queued: 0,
    running: 0,
    blocked: 0,
    review: 0,
    done: 0,
    failed: 0,
  };
  const byAgent: Record<string, Record<TaskStatus, number>> = {};

  for (const t of tasks) {
    columns[t.status] = (columns[t.status] ?? 0) + 1;
    const aid = t.agentId ?? '_unassigned';
    if (!byAgent[aid]) {
      byAgent[aid] = {
        backlog: 0,
        queued: 0,
        running: 0,
        blocked: 0,
        review: 0,
        done: 0,
        failed: 0,
      };
    }
    byAgent[aid][t.status] = (byAgent[aid][t.status] ?? 0) + 1;
  }

  return { updatedAt: Date.now(), columns, byAgent, total: tasks.length };
}

export function filterTasks(
  tasks: TaskCard[],
  opts: {
    status?: string | null;
    agentId?: string | null;
    priority?: string | null;
    missionId?: string | null;
    assigneeType?: string | null;
  },
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
  if (opts.missionId) {
    out = out.filter((t) => t.missionId === opts.missionId);
  }
  if (opts.assigneeType && VALID_ASSIGNEE_TYPES.includes(opts.assigneeType as TaskAssigneeType)) {
    const requestedType = normalizeAssigneeType(opts.assigneeType, 'agent');
    out = out.filter((t) => normalizeAssigneeType(t.assigneeType ?? 'agent', 'agent') === requestedType);
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
  missionId?: string | null;
  missionBrief?: string | null;
  assigneeType?: string | null;
  assigneeId?: string | null;
  dependencies?: unknown;
  artifactLinks?: unknown;
  replaySessionId?: string | null;
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
  const missionId = body.missionId?.trim() || null;
  if (missionId && missionId.length > 120) return { ok: false, error: 'missionId must be ≤ 120 chars' };

  const missionBrief = body.missionBrief?.trim() || null;
  if (missionBrief && missionBrief.length > 300) {
    return { ok: false, error: 'missionBrief must be ≤ 300 chars' };
  }

  const assigneeType = normalizeAssigneeType(body.assigneeType ?? (agentId ? 'agent' : 'control_plane'), 'agent');
  if (!VALID_ASSIGNEE_TYPES.includes(assigneeType)) {
    return { ok: false, error: `invalid assigneeType: ${assigneeType}` };
  }
  const assigneeId = (body.assigneeId ?? agentId ?? '').trim() || null;
  if (assigneeId && assigneeId.length > 120) {
    return { ok: false, error: 'assigneeId must be ≤ 120 chars' };
  }

  const dependencies = sanitizeStringList(body.dependencies, { maxItems: 20, maxLen: 80 });
  const artifactLinks = sanitizeStringList(body.artifactLinks, { maxItems: 20, maxLen: 300 });
  const replaySessionId = body.replaySessionId?.trim() || null;
  if (replaySessionId && replaySessionId.length > 120) {
    return { ok: false, error: 'replaySessionId must be ≤ 120 chars' };
  }
  const now = Date.now();

  const card: TaskCard = {
    id: crypto.randomUUID(),
    agentId,
    title,
    description,
    priority,
    status,
    createdAt: now,
    queuedAt: status === 'queued' ? now : null,
    startedAt: null,
    completedAt: null,
    resultSummary: null,
    tokensUsed: null,
    error: null,
    costEstimate: null,
    runtimeMs: null,
    missionId,
    missionBrief,
    assigneeType,
    assigneeId,
    dependencies,
    artifactLinks,
    replaySessionId,
    statusHistory: [
      {
        status,
        at: now,
        by: 'create',
        note: missionId ? `mission:${missionId}` : 'created',
      },
    ],
  };

  return { ok: true, card };
}

// ─── Batch/heartbeat/recovery operations (Issue #219) ───────────────────────

/**
 * Execute a batch operation (transition or archive) on multiple cards.
 * All mutations are persisted via task-board + active-task tracker synchronization.
 */
export function executeBatch(
  dataDir: string,
  input: BatchInput,
  emitEvent?: TaskBoardDeps['emitEvent'],
): BatchResult {
  return executeBatchOperation({
    input,
    emitEvent,
    loadTasks: () => loadTasks(dataDir),
    saveTasks: (tasks) => saveTasksWithActiveTracker(dataDir, tasks),
    appendStatusHistory,
    isValidTransition,
    validStatuses: VALID_STATUSES,
  });
}

export function pickupQueuedTasksForAgent(
  dataDir: string,
  input: HeartbeatPickupInput,
  emitEvent?: TaskBoardDeps['emitEvent'],
): HeartbeatPickupResult | { error: string } {
  return pickupQueuedTasksForAgentOperation({
    input,
    emitEvent,
    loadTasks: () => loadTasks(dataDir),
    saveTasks: (tasks) => saveTasksWithActiveTracker(dataDir, tasks),
    appendStatusHistory,
  });
}

export function resumeRunningTasksFromSnapshot(
  dataDir: string,
  input: RecoveryResumeInput = {},
  emitEvent?: TaskBoardDeps['emitEvent'],
): RecoveryResumeResult {
  return resumeRunningTasksFromSnapshotOperation({
    input,
    emitEvent,
    loadTasks: () => loadTasks(dataDir),
    saveTasks: (tasks) => saveTasksWithActiveTracker(dataDir, tasks),
    readActiveTaskSnapshot: () => readActiveTaskSnapshot(dataDir),
    appendStatusHistory,
  });
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
  //   ?status=running&agentId=venture_research&priority=high&missionId=mc-001&assigneeType=agent
  // Server-side filtering is applied before broadcasting to each client.
  if (url.startsWith('/api/task-board/events') && method === 'GET') {
    // Parse optional subscription filter from query string
    const evtParams = new URL(url, 'http://localhost').searchParams;
    const filter = parseSubscriptionFilter({
      status: evtParams.get('status'),
      agentId: evtParams.get('agentId'),
      priority: evtParams.get('priority'),
      missionId: evtParams.get('missionId'),
      assigneeType: evtParams.get('assigneeType'),
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

  // ── GET/POST/DELETE /api/task-board/templates — Issue #297 ───────────────
  // Pipeline template registry for reusable task-board instantiation flows.
  // Generic schema: stages + optional assignee + handoff contract metadata.
  if (url === '/api/task-board/templates' && method === 'GET') {
    const templates = loadPipelineTemplates(dataDir);
    sendJson(res, { templates, total: templates.length });
    return true;
  }

  if (url === '/api/task-board/templates' && method === 'POST') {
    let body: unknown;
    try {
      const raw = await readRequestBody(req, { maxBytes: 65536 });
      body = JSON.parse(raw);
    } catch {
      sendJson(res, { error: 'invalid JSON body' }, 400);
      return true;
    }

    const validated = validateTemplateUpsert(body);
    if (!validated.ok) {
      sendJson(res, { error: validated.error }, 400);
      return true;
    }

    if (isSystemPipelineTemplateId(validated.template.id)) {
      sendJson(res, { error: `cannot overwrite system template: ${validated.template.id}` }, 409);
      return true;
    }

    const custom = loadCustomPipelineTemplates(dataDir);
    const existingIdx = custom.findIndex((t) => t.id === validated.template.id);
    const existingCreatedAt = existingIdx >= 0 ? custom[existingIdx].createdAt : validated.template.createdAt;
    const nextTemplate: TaskPipelineTemplate = {
      ...validated.template,
      createdAt: existingCreatedAt,
      updatedAt: Date.now(),
    };

    if (existingIdx >= 0) custom[existingIdx] = nextTemplate;
    else custom.push(nextTemplate);
    saveCustomPipelineTemplates(dataDir, custom);

    sendJson(res, { template: nextTemplate, total: custom.length }, existingIdx >= 0 ? 200 : 201);
    return true;
  }

  if (url.startsWith('/api/task-board/templates/') && method === 'DELETE') {
    const id = (url.split('/api/task-board/templates/')[1]?.split('?')[0] ?? '').trim();
    if (!id) {
      sendJson(res, { error: 'template id is required' }, 400);
      return true;
    }
    if (isSystemPipelineTemplateId(id)) {
      sendJson(res, { error: 'system templates cannot be deleted' }, 409);
      return true;
    }

    const custom = loadCustomPipelineTemplates(dataDir);
    const next = custom.filter((t) => t.id !== id);
    if (next.length === custom.length) {
      sendJson(res, { error: 'template not found' }, 404);
      return true;
    }
    saveCustomPipelineTemplates(dataDir, next);
    sendJson(res, { ok: true, deletedId: id, total: next.length });
    return true;
  }

  // ── POST /api/task-board/pipelines/from-template — Issue #297 ─────────────
  // Instantiate a mission-linked pipeline from a reusable template.
  // Cards are created with dependency chain + owner assignments + audit notes.
  if (url === '/api/task-board/pipelines/from-template' && method === 'POST') {
    let body: PipelineFromTemplateInput;
    try {
      const raw = await readRequestBody(req, { maxBytes: 65536 });
      body = JSON.parse(raw) as PipelineFromTemplateInput;
    } catch {
      sendJson(res, { error: 'invalid JSON body' }, 400);
      return true;
    }

    const result = instantiatePipelineFromTemplate({
      dataDir,
      input: body,
      emitEvent: deps.emitEvent,
      loadTasks: () => loadTasks(dataDir),
      saveTasks: (tasks) => saveTasksWithActiveTracker(dataDir, tasks),
    });
    if (!result.ok) {
      sendJson(res, { error: result.error }, 400);
      return true;
    }
    sendJson(res, result, 201);
    return true;
  }

  // ── GET /api/task-board/export — Issue #219, Phase 26 (Task Card Export) ──
  // Export task board cards as CSV or JSON file download.
  // Query params: same as /api/task-board list + ?format=csv|json (default json)
  //   ?status=running     — filter by status
  //   ?agentId=venture_research — filter by agent
  //   ?priority=high      — filter by priority
  //   ?missionId=mc-001   — filter by mission id
  //   ?assigneeType=agent — filter by owner type
  //   ?search=deploy      — substring search in title/description
  //   ?limit=500          — max cards to export (default 500, max 500)
  // Bounded: max 500 cards per export. Secret-safe: conservative field allowlist.
  if (url.startsWith('/api/task-board/export') && method === 'GET') {
    const exportParams = new URL(url, 'http://localhost').searchParams;
    const format = (exportParams.get('format') === 'csv' ? 'csv' : 'json') as CardExportFormat;
    const limit = exportParams.has('limit')
      ? Math.max(1, Math.min(Number(exportParams.get('limit')) || CARD_EXPORT_MAX_ITEMS, CARD_EXPORT_MAX_ITEMS))
      : CARD_EXPORT_MAX_ITEMS;
    const status = exportParams.get('status') || undefined;
    const agentId = exportParams.get('agentId') || undefined;
    const priority = exportParams.get('priority') || undefined;
    const missionId = exportParams.get('missionId') || undefined;
    const assigneeType = exportParams.get('assigneeType') || undefined;
    const search = exportParams.get('search') || undefined;

    const tasks = loadTasks(dataDir);
    const result = exportTaskCards(tasks, {
      format,
      limit,
      status,
      agentId,
      priority,
      missionId,
      assigneeType,
      search,
    });

    res.writeHead(200, {
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Cache-Control': 'no-store',
      'X-Export-Count': String(result.count),
    });
    res.end(result.content);
    return true;
  }

  // ── GET /api/task-board ────────────────────────────────────────────────────
  // Returns filtered list of cards.
  // Query params: status, agentId, priority, missionId, assigneeType.
  if (url.startsWith('/api/task-board') && !url.startsWith('/api/task-board/') && method === 'GET') {
    const params = new URL(url, 'http://localhost').searchParams;
    const tasks = loadTasks(dataDir);
    const filtered = filterTasks(tasks, {
      status: params.get('status'),
      agentId: params.get('agentId'),
      priority: params.get('priority'),
      missionId: params.get('missionId'),
      assigneeType: params.get('assigneeType'),
    });
    sendJson(res, { tasks: filtered, total: filtered.length });
    return true;
  }

  // ── POST /api/task-board/batch — Issue #219, Phase 6 ──────────────────────
  // Batch transition/archive operations with per-card result reporting.
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

  // ── POST /api/task-board/heartbeat/pickup — Issue #219 ────────────────────
  // Heartbeat-driven queue pickup for an agent with dependency gating.
  if (url === '/api/task-board/heartbeat/pickup' && method === 'POST') {
    let body: HeartbeatPickupInput;
    try {
      const raw = await readRequestBody(req, { maxBytes: 4096 });
      const parsed = raw.trim() ? JSON.parse(raw) : {};
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        sendJson(res, { error: 'request body must be a JSON object' }, 400);
        return true;
      }
      body = parsed as HeartbeatPickupInput;
    } catch {
      sendJson(res, { error: 'invalid JSON body' }, 400);
      return true;
    }

    const result = pickupQueuedTasksForAgent(dataDir, body, deps.emitEvent);
    if ('error' in result) {
      sendJson(res, result, 400);
      return true;
    }
    sendJson(res, result);
    return true;
  }

  // ── GET /api/task-board/active — Issue #223 ─────────────────────────────
  // Read active-task tracker snapshot + stale detection for dashboard display.
  // Query params:
  //   ?staleAfterMs=1800000 — stale threshold (default 30m, max 24h)
  if (url.startsWith('/api/task-board/active') && method === 'GET') {
    const params = new URL(url, 'http://localhost').searchParams;
    const staleAfterMs = params.has('staleAfterMs')
      ? Math.max(1000, Math.min(Number(params.get('staleAfterMs')) || 30 * 60 * 1000, 24 * 60 * 60 * 1000))
      : 30 * 60 * 1000;
    const snapshot = readActiveTaskSnapshot(dataDir);
    const stale = detectStaleTasks(snapshot, { staleAfterMs });
    sendJson(res, {
      snapshot,
      staleAfterMs,
      staleCount: stale.length,
      stale,
    });
    return true;
  }

  // ── POST /api/task-board/recovery/resume — Issue #223 ───────────────────
  // Re-queue running work from active-tasks snapshot after restart.
  // Optional body:
  //   { "agentId": "venture_research", "limit": 20 }
  if (url === '/api/task-board/recovery/resume' && method === 'POST') {
    let body: RecoveryResumeInput = {};
    try {
      const raw = await readRequestBody(req, { maxBytes: 4096 });
      if (raw.trim()) {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          sendJson(res, { error: 'request body must be a JSON object' }, 400);
          return true;
        }
        body = parsed as RecoveryResumeInput;
      }
    } catch {
      sendJson(res, { error: 'invalid JSON body' }, 400);
      return true;
    }

    const result = resumeRunningTasksFromSnapshot(dataDir, body, deps.emitEvent);
    sendJson(res, result);
    return true;
  }

  // ── GET /api/task-board/escalation/status — Issue #219, Phase 20 ─────────────
  // Read-only endpoint returning current escalation state for dashboard display.
  // Returns: escalation policy status, current tier, time-to-next-tier, per-tier breakdown.
  // No mutations — purely derived from in-memory escalation state + webhook config.
  if (url.startsWith('/api/task-board/escalation/status') && method === 'GET') {
    try {
      const webhookConfig = readWebhookConfig(dataDir);
      const state = getEscalationState();
      const now = Date.now();
      const status = computeEscalationStatus(webhookConfig.escalation, state, now);
      sendJson(res, { status });
    } catch {
      sendJson(res, { error: 'Failed to compute escalation status' }, 500);
    }
    return true;
  }

  // ── GET /api/task-board/escalation/history/export — Issue #219, Phase 23 ────
  // Export escalation history as CSV or JSON file download.
  // Query params: same as /escalation/history + ?format=csv|json (default json)
  // Bounded: max 200 events per export. Secret-safe: conservative field allowlist.
  if (url.startsWith('/api/task-board/escalation/history/export') && method === 'GET') {
    const exportParams = new URL(url, 'http://localhost').searchParams;
    const format = (exportParams.get('format') === 'csv' ? 'csv' : 'json') as EscalationExportFormat;
    const limit = exportParams.has('limit')
      ? Math.max(1, Math.min(Number(exportParams.get('limit')) || 200, 200))
      : 200;
    const sinceMs = exportParams.has('sinceMs')
      ? Math.max(0, Number(exportParams.get('sinceMs')) || 0)
      : undefined;

    const eventTypeRaw = exportParams.get('eventType');
    const validEventTypes: EscalationEventType[] = [
      'tier_triggered', 'tier_renotified', 'notification_sent', 'escalation_reset',
    ];
    const eventType = eventTypeRaw && validEventTypes.includes(eventTypeRaw as EscalationEventType)
      ? (eventTypeRaw as EscalationEventType)
      : undefined;

    const tierIndexRaw = exportParams.get('tierIndex');
    const tierIndex = tierIndexRaw !== null && !isNaN(Number(tierIndexRaw))
      ? Number(tierIndexRaw)
      : undefined;

    const deliveryStatusRaw = exportParams.get('deliveryStatus');
    const deliveryStatus = deliveryStatusRaw === 'success' || deliveryStatusRaw === 'failure'
      ? deliveryStatusRaw
      : undefined;

    const result = exportEscalationHistory(dataDir, {
      format,
      limit,
      sinceMs,
      eventType,
      tierIndex,
      deliveryStatus,
    });

    res.writeHead(200, {
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Cache-Control': 'no-store',
      'X-Export-Count': String(result.count),
    });
    res.end(result.content);
    return true;
  }

  // ── GET /api/task-board/escalation/history — Issue #219, Phase 22 ──────────
  // Read-only endpoint returning persisted escalation event history (audit trail).
  // Query params:
  //   ?limit=50            — max events to return (default 50, max 200)
  //   ?sinceMs=86400000    — only events within this time window from now
  //   ?eventType=tier_triggered — filter by event type
  //   ?tierIndex=0         — filter by tier index
  //   ?deliveryStatus=success — filter: 'success' or 'failure'
  if (url.startsWith('/api/task-board/escalation/history') && method === 'GET') {
    try {
      const histParams = new URL(url, 'http://localhost').searchParams;
      const limit = Math.max(1, Math.min(Number(histParams.get('limit')) || 50, 200));
      const sinceMs = histParams.has('sinceMs')
        ? Math.max(0, Number(histParams.get('sinceMs')) || 0)
        : undefined;

      const eventTypeRaw = histParams.get('eventType');
      const validEventTypes: EscalationEventType[] = [
        'tier_triggered', 'tier_renotified', 'notification_sent', 'escalation_reset',
      ];
      const eventType = eventTypeRaw && validEventTypes.includes(eventTypeRaw as EscalationEventType)
        ? (eventTypeRaw as EscalationEventType)
        : undefined;

      const tierIndexRaw = histParams.get('tierIndex');
      const tierIndex = tierIndexRaw !== null && !isNaN(Number(tierIndexRaw))
        ? Number(tierIndexRaw)
        : undefined;

      const deliveryStatusRaw = histParams.get('deliveryStatus');
      const deliveryStatus = deliveryStatusRaw === 'success' || deliveryStatusRaw === 'failure'
        ? deliveryStatusRaw
        : undefined;

      const result = queryEscalationHistory(dataDir, {
        limit,
        sinceMs,
        eventType,
        tierIndex,
        deliveryStatus,
      });
      sendJson(res, result);
    } catch {
      sendJson(res, { error: 'Failed to query escalation history' }, 500);
    }
    return true;
  }

  // ── GET /api/task-board/metrics/history/export — Issue #219, Phase 25 ────────
  // Export metrics history as CSV or JSON file download.
  // Query params: same as /metrics/history + ?format=csv|json (default json)
  // Bounded: max 500 snapshots per export. Secret-safe: conservative field allowlist.
  if (url.startsWith('/api/task-board/metrics/history/export') && method === 'GET') {
    const exportParams = new URL(url, 'http://localhost').searchParams;
    const format = (exportParams.get('format') === 'csv' ? 'csv' : 'json') as MetricsExportFormat;
    const limit = exportParams.has('limit')
      ? Math.max(1, Math.min(Number(exportParams.get('limit')) || 500, 500))
      : 500;
    const sinceMs = exportParams.has('sinceMs')
      ? Math.max(0, Number(exportParams.get('sinceMs')) || 0)
      : undefined;

    const result = exportMetricsHistory(dataDir, {
      format,
      limit,
      sinceMs,
    });

    res.writeHead(200, {
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Cache-Control': 'no-store',
      'X-Export-Count': String(result.count),
    });
    res.end(result.content);
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

  // ── GET /api/task-board/alerts/timeline/export — Issue #219, Phase 24 ───────
  // Export alert history as CSV or JSON file download.
  // Query params: same as /alerts/timeline + ?format=csv|json (default json)
  // Bounded: max 200 events per export. Secret-safe: conservative field allowlist.
  if (url.startsWith('/api/task-board/alerts/timeline/export') && method === 'GET') {
    const exportParams = new URL(url, 'http://localhost').searchParams;
    const format = (exportParams.get('format') === 'csv' ? 'csv' : 'json') as AlertExportFormat;
    const limit = exportParams.has('limit')
      ? Math.max(1, Math.min(Number(exportParams.get('limit')) || 200, 200))
      : 200;
    const sinceMs = exportParams.has('sinceMs')
      ? Math.max(0, Number(exportParams.get('sinceMs')) || 0)
      : undefined;
    const minSeverityRaw = exportParams.get('minSeverity');
    const validSeverities = ['ok', 'warning', 'critical'];
    const minSeverity = minSeverityRaw && validSeverities.includes(minSeverityRaw)
      ? (minSeverityRaw as 'ok' | 'warning' | 'critical')
      : undefined;

    const result = exportAlertHistory(dataDir, {
      format,
      limit,
      sinceMs,
      minSeverity,
    });

    res.writeHead(200, {
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Cache-Control': 'no-store',
      'X-Export-Count': String(result.count),
    });
    res.end(result.content);
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

  // ── GET /api/task-board/webhooks/health/export — Issue #219, Phase 24 ──────
  // Export webhook health stats as CSV or JSON file download.
  // Query params: same as /webhooks/health + ?format=csv|json (default json)
  // Bounded: max 100 targets per export. Secret-safe: maskedUrl omitted.
  if (url.startsWith('/api/task-board/webhooks/health/export') && method === 'GET') {
    const exportParams = new URL(url, 'http://localhost').searchParams;
    const format = (exportParams.get('format') === 'csv' ? 'csv' : 'json') as HealthExportFormat;
    const windowMs = exportParams.has('windowMs')
      ? Math.max(1000, Math.min(Number(exportParams.get('windowMs')) || 86400000, 172800000))
      : undefined;
    const targetId = exportParams.get('targetId') || undefined;

    const result = exportWebhookHealth(dataDir, {
      format,
      windowMs,
      targetId,
    });

    res.writeHead(200, {
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Cache-Control': 'no-store',
      'X-Export-Count': String(result.count),
    });
    res.end(result.content);
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

  // ── GET /api/task-board/webhooks/retries/export — Issue #219, Phase 17 ────
  // Export retry activity as CSV or JSON file download.
  // Query params: same as /retries + ?format=csv|json (default json)
  // Bounded: max 200 events per export. Secret-safe: URLs pre-masked.
  if (url.startsWith('/api/task-board/webhooks/retries/export') && method === 'GET') {
    const retryExportParams = new URL(url, 'http://localhost').searchParams;
    const format = (retryExportParams.get('format') === 'csv' ? 'csv' : 'json') as ExportFormat;
    const limit = retryExportParams.has('limit')
      ? Math.max(1, Math.min(Number(retryExportParams.get('limit')) || 200, 200))
      : 200;
    const sinceMs = retryExportParams.has('sinceMs')
      ? Math.max(0, Number(retryExportParams.get('sinceMs')) || 0)
      : undefined;
    const targetId = retryExportParams.get('targetId') || undefined;

    const result = exportRetryActivity(dataDir, { format, limit, sinceMs, targetId });

    res.writeHead(200, {
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Cache-Control': 'no-store',
      'X-Export-Count': String(result.count),
    });
    res.end(result.content);
    return true;
  }

  // ── GET /api/task-board/webhooks/retries — Issue #219, Phase 16 ──────────
  // Returns retry activity: deliveries that required multiple attempts,
  // per-attempt breakdown, and per-target retry summaries.
  // Query params:
  //   ?limit=50        — max events to return (default 50, max 200)
  //   ?sinceMs=3600000 — only events within this time window
  //   ?targetId=slack  — filter by target ID
  if (url.startsWith('/api/task-board/webhooks/retries') && method === 'GET') {
    const retryParams = new URL(url, 'http://localhost').searchParams;
    const limit = Math.max(1, Math.min(Number(retryParams.get('limit')) || 50, 200));
    const sinceMs = retryParams.has('sinceMs')
      ? Math.max(0, Number(retryParams.get('sinceMs')) || 0)
      : undefined;
    const targetId = retryParams.get('targetId') || undefined;

    const result = queryRetryActivity(dataDir, { limit, sinceMs, targetId });
    sendJson(res, result);
    return true;
  }

  // ── GET /api/task-board/webhooks/deliveries/export — Issue #219, Phase 17 ──
  // Export delivery history as CSV or JSON file download.
  // Query params: same as /deliveries + ?format=csv|json (default json)
  // Bounded: max 200 events per export. Secret-safe: URLs pre-masked.
  if (url.startsWith('/api/task-board/webhooks/deliveries/export') && method === 'GET') {
    const exportParams = new URL(url, 'http://localhost').searchParams;
    const format = (exportParams.get('format') === 'csv' ? 'csv' : 'json') as ExportFormat;
    const limit = exportParams.has('limit')
      ? Math.max(1, Math.min(Number(exportParams.get('limit')) || 200, 200))
      : 200;
    const sinceMs = exportParams.has('sinceMs')
      ? Math.max(0, Number(exportParams.get('sinceMs')) || 0)
      : undefined;
    const targetId = exportParams.get('targetId') || undefined;
    const statusRaw = exportParams.get('status');
    const status = statusRaw === 'success' || statusRaw === 'failure' ? statusRaw : undefined;

    const result = exportDeliveryHistory(dataDir, { format, limit, sinceMs, targetId, status });

    res.writeHead(200, {
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Cache-Control': 'no-store',
      'X-Export-Count': String(result.count),
    });
    res.end(result.content);
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

    // Piggyback (Phase 19): evaluate escalation policy for persistent alert states.
    // Runs after base webhook dispatch — escalation is additive.
    // Fire-and-forget — escalation delivery is async and non-blocking.
    if (metrics.alerts) {
      try {
        const webhookConfig = readWebhookConfig(dataDir);
        void maybeEscalate(dataDir, webhookConfig, metrics.alerts, null);
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
    saveTasksWithActiveTracker(dataDir, tasks);
    deps.emitEvent?.('task:created', result.card);
    sendJson(res, { card: result.card }, 201);
    return true;
  }

  // ── POST /api/task-board/:id/retry — Issue #219 ─────────────────────────
  // Explicit retry path for failed cards:
  // - allowed only when status=failed
  // - resets terminal/error fields and re-queues card
  // - appends status history entry for auditability
  const urlPath = url.split('?')[0] ?? url;
  if (urlPath.startsWith('/api/task-board/') && urlPath.endsWith('/retry') && method === 'POST') {
    const id = urlPath.split('/api/task-board/')[1]?.split('/retry')[0]?.trim();
    if (!id) {
      sendJson(res, { error: 'task id is required' }, 400);
      return true;
    }

    let retryNote: string | null = null;
    try {
      const raw = await readRequestBody(req, { maxBytes: 2048 });
      if (raw.trim()) {
        const body = JSON.parse(raw) as { note?: unknown };
        if (typeof body.note === 'string' && body.note.trim()) {
          retryNote = body.note.trim().slice(0, 200);
        }
      }
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
    if (card.status !== 'failed') {
      sendJson(res, { error: `retry only allowed for failed cards (current: ${card.status})` }, 409);
      return true;
    }

    const now = Date.now();
    card.status = 'queued';
    card.queuedAt = now;
    card.startedAt = null;
    card.completedAt = null;
    card.resultSummary = null;
    card.tokensUsed = null;
    card.error = null;
    card.costEstimate = null;
    card.runtimeMs = null;
    appendStatusHistory(card, 'queued', 'retry', retryNote ?? 'manual retry from failed', now);

    tasks[idx] = card;
    saveTasksWithActiveTracker(dataDir, tasks);
    deps.emitEvent?.('task:updated', card);
    sendJson(res, { card });
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
      const transitionNote =
        typeof body.transitionNote === 'string' && body.transitionNote.trim()
          ? body.transitionNote.trim()
          : null;
      appendStatusHistory(card, newStatus, 'patch', transitionNote, now);
    }

    // Mutable fields
    if (typeof body.title === 'string') card.title = (body.title as string).slice(0, 200);
    if (typeof body.description === 'string') card.description = (body.description as string).slice(0, 2000);
    if (typeof body.agentId === 'string') card.agentId = body.agentId || null;
    if (typeof body.missionId === 'string') {
      const v = body.missionId.trim();
      card.missionId = v ? v.slice(0, 120) : null;
    }
    if (typeof body.missionBrief === 'string') {
      const v = body.missionBrief.trim();
      card.missionBrief = v ? v.slice(0, 300) : null;
    }
    if (
      typeof body.assigneeType === 'string' &&
      VALID_ASSIGNEE_TYPES.includes(body.assigneeType as TaskAssigneeType)
    ) {
      card.assigneeType = body.assigneeType as TaskAssigneeType;
    }
    if (typeof body.assigneeId === 'string') {
      const v = body.assigneeId.trim();
      card.assigneeId = v ? v.slice(0, 120) : null;
    }
    if (Array.isArray(body.dependencies)) {
      card.dependencies = sanitizeStringList(body.dependencies, { maxItems: 20, maxLen: 80 });
    }
    if (Array.isArray(body.artifactLinks)) {
      card.artifactLinks = sanitizeStringList(body.artifactLinks, { maxItems: 20, maxLen: 300 });
    }
    if (typeof body.replaySessionId === 'string') {
      const v = body.replaySessionId.trim();
      card.replaySessionId = v ? v.slice(0, 120) : null;
    }
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
    saveTasksWithActiveTracker(dataDir, tasks);
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
    saveTasksWithActiveTracker(dataDir, tasks);
    deps.emitEvent?.('task:deleted', deletedCard);
    sendJson(res, { ok: true });
    return true;
  }

  return false;
}
function normalizeAssigneeType(value: string | null | undefined, fallback: TaskAssigneeType = 'agent'): TaskAssigneeType {
  if (!value) return fallback;
  if (value === 'nexus') return 'control_plane';
  return VALID_ASSIGNEE_TYPES.includes(value as TaskAssigneeType) ? (value as TaskAssigneeType) : fallback;
}

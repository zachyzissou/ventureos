/**
 * Task Board (Kanban) route handlers.
 * Issue #219 — first vertical slice.
 *
 * Provides CRUD + summary endpoints for task cards that flow through
 * Backlog → Queued → Running → Done/Failed columns.
 *
 * Data is persisted as a single JSON file on disk (consistent with
 * the rest of the dashboard's filesystem-based storage).
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
  };

  return { ok: true, card };
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

    tasks[idx] = card;
    saveTasks(dataDir, tasks);
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

    tasks.splice(idx, 1);
    saveTasks(dataDir, tasks);
    sendJson(res, { ok: true });
    return true;
  }

  return false;
}

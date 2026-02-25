/**
 * Task Board SSE event bus — Issue #219.
 *
 * Provides a bounded pub/sub for task board mutations (create/update/delete).
 * SSE clients subscribe via GET /api/task-board/events.
 *
 * Design:
 * - Follows the existing /api/live and /api/live-telemetry SSE patterns.
 * - Max connections capped to prevent resource exhaustion.
 * - Heartbeat keepalive to detect stale connections.
 * - Graceful cleanup on client disconnect.
 * - Per-client subscription filters (status, agentId, priority) applied
 *   server-side before broadcasting. Issue #219 — SSE subscription filtering.
 */

import type { ServerResponse } from 'node:http';
import type {
  TaskCard,
  TaskStatus,
  TaskPriority,
  TaskAssigneeType,
} from './types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type TaskBoardEventType = 'task:created' | 'task:updated' | 'task:deleted';

export interface TaskBoardEvent {
  type: TaskBoardEventType;
  ts: number;
  card: TaskCard;
  /** For deletes, card is the last-known state before removal. */
}

/**
 * Per-client subscription filter. All fields are optional (additive).
 * When a field is set, only events whose card matches are delivered to that client.
 * Unset fields match everything (no restriction).
 */
export interface SseSubscriptionFilter {
  status?: TaskStatus;
  agentId?: string;
  priority?: TaskPriority;
  missionId?: string;
  assigneeType?: TaskAssigneeType;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_STATUSES: readonly string[] = [
  'backlog',
  'queued',
  'running',
  'blocked',
  'review',
  'done',
  'failed',
];
const VALID_PRIORITIES: readonly string[] = ['critical', 'high', 'medium', 'low'];
const VALID_ASSIGNEE_TYPES: readonly string[] = ['human', 'nexus', 'agent'];

// ─── Event Bus ───────────────────────────────────────────────────────────────

/** Maximum simultaneous SSE connections for the task board stream. */
const MAX_CLIENTS = 50;

/** Heartbeat interval in ms — keeps connections alive through proxies. */
const HEARTBEAT_INTERVAL_MS = 30_000;

interface SseClient {
  res: ServerResponse;
  heartbeat: NodeJS.Timeout;
  /** Optional subscription filter — when empty, all events are delivered. */
  filter: SseSubscriptionFilter;
}

let clients: SseClient[] = [];

/** Number of currently connected SSE clients. */
export function clientCount(): number {
  return clients.length;
}

/**
 * Parse raw query-param values into a validated subscription filter.
 * Invalid values are silently ignored (treated as "no filter" for that field).
 */
export function parseSubscriptionFilter(params: {
  status?: string | null;
  agentId?: string | null;
  priority?: string | null;
  missionId?: string | null;
  assigneeType?: string | null;
}): SseSubscriptionFilter {
  const filter: SseSubscriptionFilter = {};
  if (params.status && VALID_STATUSES.includes(params.status)) {
    filter.status = params.status as TaskStatus;
  }
  if (params.agentId && params.agentId.trim()) {
    filter.agentId = params.agentId.trim();
  }
  if (params.priority && VALID_PRIORITIES.includes(params.priority)) {
    filter.priority = params.priority as TaskPriority;
  }
  if (params.missionId && params.missionId.trim()) {
    filter.missionId = params.missionId.trim();
  }
  if (params.assigneeType && VALID_ASSIGNEE_TYPES.includes(params.assigneeType)) {
    filter.assigneeType = params.assigneeType as TaskAssigneeType;
  }
  return filter;
}

/**
 * Test whether a card matches a subscription filter.
 * An empty filter matches everything.
 */
export function matchesFilter(card: TaskCard, filter: SseSubscriptionFilter): boolean {
  if (filter.status && card.status !== filter.status) return false;
  if (filter.agentId && card.agentId !== filter.agentId) return false;
  if (filter.priority && card.priority !== filter.priority) return false;
  if (filter.missionId && card.missionId !== filter.missionId) return false;
  if (filter.assigneeType && (card.assigneeType ?? 'agent') !== filter.assigneeType) return false;
  return true;
}

/**
 * Register an SSE client. Returns false if at capacity.
 * The caller should already have written the SSE headers.
 *
 * @deprecated Use addFilteredClient for new code — this overload exists for backward compat.
 */
export function addClient(res: ServerResponse): boolean {
  return addFilteredClient(res, {});
}

/**
 * Register an SSE client with an optional subscription filter.
 * Returns false if at capacity.
 * The caller should already have written the SSE headers.
 */
export function addFilteredClient(
  res: ServerResponse,
  filter: SseSubscriptionFilter,
): boolean {
  if (clients.length >= MAX_CLIENTS) return false;

  const heartbeat = setInterval(() => {
    try {
      if (!res.writable) {
        removeClient(res);
        return;
      }
      res.write(':heartbeat\n\n');
    } catch {
      removeClient(res);
    }
  }, HEARTBEAT_INTERVAL_MS);

  clients.push({ res, heartbeat, filter });
  return true;
}

/** Remove a client and clean up its heartbeat timer. */
export function removeClient(res: ServerResponse): void {
  const idx = clients.findIndex((c) => c.res === res);
  if (idx === -1) return;
  clearInterval(clients[idx].heartbeat);
  clients.splice(idx, 1);
}

/** Remove all clients — used for tests and graceful shutdown. */
export function removeAllClients(): void {
  for (const c of clients) {
    clearInterval(c.heartbeat);
  }
  clients = [];
}

/**
 * Broadcast a task board event to all connected SSE clients.
 * Per-client subscription filters are applied before sending — clients
 * only receive events whose card matches their filter criteria.
 * Non-writable clients are pruned automatically.
 *
 * For `task:deleted` events, the filter is always applied against the
 * card's last-known state so the client can remove it from its local view.
 */
export function broadcastTaskEvent(event: TaskBoardEvent): void {
  if (clients.length === 0) return;
  const message = `data: ${JSON.stringify(event)}\n\n`;
  const stale: ServerResponse[] = [];

  for (const c of clients) {
    try {
      if (!c.res.writable) {
        stale.push(c.res);
        continue;
      }
      // Apply per-client filter — skip if card doesn't match
      if (!matchesFilter(event.card, c.filter)) continue;
      c.res.write(message);
    } catch {
      stale.push(c.res);
    }
  }

  for (const res of stale) {
    removeClient(res);
  }
}

/**
 * Emit helper — convenience wrapper used by route handlers.
 */
export function emitTaskEvent(
  type: TaskBoardEventType,
  card: TaskCard,
): void {
  broadcastTaskEvent({ type, ts: Date.now(), card });
}

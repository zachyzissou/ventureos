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
 */

import type { ServerResponse } from 'node:http';
import type { TaskCard } from './types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type TaskBoardEventType = 'task:created' | 'task:updated' | 'task:deleted';

export interface TaskBoardEvent {
  type: TaskBoardEventType;
  ts: number;
  card: TaskCard;
  /** For deletes, card is the last-known state before removal. */
}

// ─── Event Bus ───────────────────────────────────────────────────────────────

/** Maximum simultaneous SSE connections for the task board stream. */
const MAX_CLIENTS = 50;

/** Heartbeat interval in ms — keeps connections alive through proxies. */
const HEARTBEAT_INTERVAL_MS = 30_000;

interface SseClient {
  res: ServerResponse;
  heartbeat: NodeJS.Timeout;
}

let clients: SseClient[] = [];

/** Number of currently connected SSE clients. */
export function clientCount(): number {
  return clients.length;
}

/**
 * Register an SSE client. Returns false if at capacity.
 * The caller should already have written the SSE headers.
 */
export function addClient(res: ServerResponse): boolean {
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

  clients.push({ res, heartbeat });
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
 * Non-writable clients are pruned automatically.
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

/**
 * Active Task Tracker (Issue #223)
 *
 * Maintains a human-readable markdown "save game" file at:
 *   <workspace>/memory/active-tasks.md
 *
 * Source of truth remains task-board.json. This file is a synchronized view
 * for crash recovery and operator visibility.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { TaskCard, TaskPriority, TaskStatus } from './types.js';

const ACTIVE_TASKS_FILENAME = 'active-tasks.md';
const MAX_COMPLETED_ITEMS = 100;
const DEFAULT_STALE_AFTER_MS = 30 * 60 * 1000;

type ActiveStatus = 'RUNNING' | 'QUEUED' | 'BLOCKED' | 'REVIEW';
type CompletedStatus = 'DONE' | 'FAILED';

export interface ActiveTaskEntry {
  taskId: string;
  title: string;
  status: ActiveStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  startedAt: string;
  updatedAt: string;
}

export interface CompletedTaskEntry {
  taskId: string;
  title: string;
  status: CompletedStatus;
  completedAt: string;
}

export interface ActiveTaskSnapshot {
  updatedAt: string;
  active: ActiveTaskEntry[];
  completed: CompletedTaskEntry[];
}

export interface StaleTaskEntry extends ActiveTaskEntry {
  staleMs: number;
}

function toIso(ts: number | null | undefined): string {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return new Date(0).toISOString();
  return new Date(ts).toISOString();
}

function statusToActive(status: TaskStatus): ActiveStatus | null {
  if (status === 'running') return 'RUNNING';
  if (status === 'queued') return 'QUEUED';
  if (status === 'blocked') return 'BLOCKED';
  if (status === 'review') return 'REVIEW';
  return null;
}

function statusToCompleted(status: TaskStatus): CompletedStatus | null {
  if (status === 'done') return 'DONE';
  if (status === 'failed') return 'FAILED';
  return null;
}

function latestUpdateAt(card: TaskCard): number {
  const historyTs = Array.isArray(card.statusHistory) && card.statusHistory.length > 0
    ? card.statusHistory[card.statusHistory.length - 1].at
    : 0;
  return Math.max(
    card.completedAt ?? 0,
    card.startedAt ?? 0,
    card.queuedAt ?? 0,
    card.createdAt ?? 0,
    historyTs ?? 0,
  );
}

function titleForMarkdown(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 200) || 'Untitled task';
}

export function activeTasksFilePath(dataDir: string): string {
  const workspaceDir = path.dirname(dataDir);
  return path.join(workspaceDir, 'memory', ACTIVE_TASKS_FILENAME);
}

export function buildActiveTaskSnapshot(tasks: TaskCard[], now = Date.now()): ActiveTaskSnapshot {
  const active: ActiveTaskEntry[] = [];
  const completed: CompletedTaskEntry[] = [];

  for (const card of tasks) {
    const activeStatus = statusToActive(card.status);
    if (activeStatus) {
      const startedAtTs = card.startedAt ?? card.queuedAt ?? card.createdAt;
      active.push({
        taskId: card.id,
        title: titleForMarkdown(card.title),
        status: activeStatus,
        priority: card.priority,
        assigneeId: card.assigneeId ?? card.agentId ?? null,
        startedAt: toIso(startedAtTs),
        updatedAt: toIso(latestUpdateAt(card)),
      });
      continue;
    }

    const completedStatus = statusToCompleted(card.status);
    if (completedStatus) {
      completed.push({
        taskId: card.id,
        title: titleForMarkdown(card.title),
        status: completedStatus,
        completedAt: toIso(card.completedAt ?? latestUpdateAt(card)),
      });
    }
  }

  active.sort((a, b) => {
    const aStart = Date.parse(a.startedAt);
    const bStart = Date.parse(b.startedAt);
    return aStart - bStart;
  });
  completed.sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));

  return {
    updatedAt: toIso(now),
    active,
    completed: completed.slice(0, MAX_COMPLETED_ITEMS),
  };
}

export function renderActiveTaskMarkdown(snapshot: ActiveTaskSnapshot): string {
  const out: string[] = [];
  out.push('# Active Tasks');
  out.push('');
  out.push(`_Last updated: ${snapshot.updatedAt}_`);
  out.push('');
  out.push('## Active Tasks');
  if (snapshot.active.length === 0) {
    out.push('- None');
  } else {
    for (const entry of snapshot.active) {
      out.push(
        `- [${entry.status}] ${entry.title} (taskId: ${entry.taskId}, priority: ${entry.priority}, assignee: ${entry.assigneeId ?? 'unassigned'}, started: ${entry.startedAt}, updated: ${entry.updatedAt})`,
      );
    }
  }
  out.push('');
  out.push('## Recently Completed');
  if (snapshot.completed.length === 0) {
    out.push('- None');
  } else {
    for (const entry of snapshot.completed) {
      out.push(
        `- [${entry.status}] ${entry.title} (taskId: ${entry.taskId}, completed: ${entry.completedAt})`,
      );
    }
  }
  out.push('');
  return out.join('\n');
}

export function writeActiveTasksFromCards(dataDir: string, tasks: TaskCard[]): void {
  const fp = activeTasksFilePath(dataDir);
  const dir = path.dirname(fp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const snapshot = buildActiveTaskSnapshot(tasks);
  fs.writeFileSync(fp, renderActiveTaskMarkdown(snapshot));
}

function parseActiveTaskLine(line: string): ActiveTaskEntry | null {
  const match = line.match(/^- \[(RUNNING|QUEUED|BLOCKED|REVIEW)\] (.+?) \(taskId: ([^,)\s]+), priority: (critical|high|medium|low), assignee: ([^,)]*), started: ([^,)]*), updated: ([^)]+)\)$/);
  if (!match) return null;
  const [, status, title, taskId, priority, assignee, startedAt, updatedAt] = match;
  return {
    taskId,
    title: title.trim(),
    status: status as ActiveStatus,
    priority: priority as TaskPriority,
    assigneeId: assignee === 'unassigned' ? null : assignee,
    startedAt,
    updatedAt,
  };
}

function parseCompletedLine(line: string): CompletedTaskEntry | null {
  const match = line.match(/^- \[(DONE|FAILED)\] (.+?) \(taskId: ([^,)\s]+), completed: ([^)]+)\)$/);
  if (!match) return null;
  const [, status, title, taskId, completedAt] = match;
  return {
    taskId,
    title: title.trim(),
    status: status as CompletedStatus,
    completedAt,
  };
}

export function readActiveTaskSnapshot(dataDir: string): ActiveTaskSnapshot {
  const fp = activeTasksFilePath(dataDir);
  if (!fs.existsSync(fp)) {
    return { updatedAt: new Date(0).toISOString(), active: [], completed: [] };
  }

  try {
    const text = fs.readFileSync(fp, 'utf8');
    const lines = text.split('\n');
    const active: ActiveTaskEntry[] = [];
    const completed: CompletedTaskEntry[] = [];
    let section: 'none' | 'active' | 'completed' = 'none';
    let updatedAt = new Date(0).toISOString();

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('_Last updated:') && line.endsWith('_')) {
        const ts = line.replace(/^_Last updated:\s*/, '').replace(/_$/, '').trim();
        if (Date.parse(ts) > 0) updatedAt = ts;
        continue;
      }
      if (line === '## Active Tasks') {
        section = 'active';
        continue;
      }
      if (line === '## Recently Completed') {
        section = 'completed';
        continue;
      }
      if (line === '- None') continue;

      if (section === 'active') {
        const parsed = parseActiveTaskLine(line);
        if (parsed) active.push(parsed);
      } else if (section === 'completed') {
        const parsed = parseCompletedLine(line);
        if (parsed) completed.push(parsed);
      }
    }

    return { updatedAt, active, completed };
  } catch {
    return { updatedAt: new Date(0).toISOString(), active: [], completed: [] };
  }
}

export function detectStaleTasks(
  snapshot: ActiveTaskSnapshot,
  opts: { staleAfterMs?: number; now?: number } = {},
): StaleTaskEntry[] {
  const staleAfterMs = opts.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const now = opts.now ?? Date.now();
  const stale: StaleTaskEntry[] = [];

  for (const task of snapshot.active) {
    const updatedMs = Date.parse(task.updatedAt);
    if (!Number.isFinite(updatedMs)) continue;
    const delta = now - updatedMs;
    if (delta > staleAfterMs) {
      stale.push({
        ...task,
        staleMs: delta,
      });
    }
  }

  stale.sort((a, b) => b.staleMs - a.staleMs);
  return stale;
}

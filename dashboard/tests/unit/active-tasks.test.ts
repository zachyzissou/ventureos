import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import type { TaskCard } from '../../server/types.js';
import {
  activeTasksFilePath,
  buildActiveTaskSnapshot,
  renderActiveTaskMarkdown,
  writeActiveTasksFromCards,
  readActiveTaskSnapshot,
  detectStaleTasks,
} from '../../server/active-tasks.js';

const testRoot = path.join('/tmp', `test-active-tasks-${process.pid}`);
const dataDir = path.join(testRoot, 'data');

function makeCard(overrides: Partial<TaskCard> = {}): TaskCard {
  return {
    id: `task-${Math.random().toString(36).slice(2, 9)}`,
    agentId: 'oracle',
    title: 'Test task',
    description: 'desc',
    priority: 'medium',
    status: 'backlog',
    createdAt: Date.now(),
    queuedAt: null,
    startedAt: null,
    completedAt: null,
    resultSummary: null,
    tokensUsed: null,
    error: null,
    costEstimate: null,
    runtimeMs: null,
    ...overrides,
  };
}

beforeEach(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
});

describe('active-task tracker', () => {
  it('builds active/completed snapshot from task-board cards', () => {
    const now = Date.now();
    const cards: TaskCard[] = [
      makeCard({
        id: 'queued-1',
        status: 'queued',
        priority: 'high',
        assigneeId: 'oracle',
        createdAt: now - 20000,
        queuedAt: now - 19000,
      }),
      makeCard({
        id: 'run-1',
        status: 'running',
        priority: 'critical',
        assigneeId: 'atlas',
        createdAt: now - 10000,
        startedAt: now - 9000,
      }),
      makeCard({
        id: 'done-1',
        status: 'done',
        completedAt: now - 1000,
      }),
    ];

    const snapshot = buildActiveTaskSnapshot(cards, now);
    expect(snapshot.active.length).toBe(2);
    expect(snapshot.completed.length).toBe(1);
    expect(snapshot.active.some((item) => item.taskId === 'run-1' && item.status === 'RUNNING')).toBe(true);
    expect(snapshot.completed[0].taskId).toBe('done-1');
  });

  it('writes and reads canonical markdown snapshot', () => {
    const cards: TaskCard[] = [
      makeCard({ id: 'run-1', status: 'running', startedAt: Date.now() - 5000, assigneeId: 'oracle' }),
      makeCard({ id: 'failed-1', status: 'failed', completedAt: Date.now() - 1000 }),
    ];

    writeActiveTasksFromCards(dataDir, cards);

    const fp = activeTasksFilePath(dataDir);
    expect(fs.existsSync(fp)).toBe(true);
    const text = fs.readFileSync(fp, 'utf8');
    expect(text).toContain('## Active Tasks');
    expect(text).toContain('## Recently Completed');

    const parsed = readActiveTaskSnapshot(dataDir);
    expect(parsed.active.length).toBe(1);
    expect(parsed.completed.length).toBe(1);
    expect(parsed.active[0].taskId).toBe('run-1');
    expect(parsed.completed[0].status).toBe('FAILED');
  });

  it('detects stale active tasks using threshold', () => {
    const now = Date.now();
    const markdown = renderActiveTaskMarkdown({
      updatedAt: new Date(now).toISOString(),
      active: [
        {
          taskId: 'stale-1',
          title: 'Old running',
          status: 'RUNNING',
          priority: 'medium',
          assigneeId: 'oracle',
          startedAt: new Date(now - 60 * 60 * 1000).toISOString(),
          updatedAt: new Date(now - 45 * 60 * 1000).toISOString(),
        },
      ],
      completed: [],
    });
    const fp = activeTasksFilePath(dataDir);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, markdown);

    const snapshot = readActiveTaskSnapshot(dataDir);
    const stale = detectStaleTasks(snapshot, { staleAfterMs: 30 * 60 * 1000, now });
    expect(stale.length).toBe(1);
    expect(stale[0].taskId).toBe('stale-1');
    expect(stale[0].staleMs).toBeGreaterThan(30 * 60 * 1000);
  });
});

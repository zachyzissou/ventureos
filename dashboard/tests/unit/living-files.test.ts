import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getLivingFileEngine,
  resetLivingFileEngine,
} from '../../server/living-files.js';

const testRoot = path.join('/tmp', `ventureos-living-files-${process.pid}`);
const dataDir = path.join(testRoot, 'data');
const workspaceDir = path.join(testRoot, 'workspace');

function fixedNow(): Date {
  return new Date('2026-02-21T20:00:00.000Z');
}

beforeEach(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(workspaceDir, { recursive: true });
  resetLivingFileEngine(dataDir, workspaceDir);
});

afterEach(() => {
  resetLivingFileEngine(dataDir, workspaceDir);
  fs.rmSync(testRoot, { recursive: true, force: true });
});

describe('living-files engine', () => {
  it('supports register, update, and unregister', () => {
    const engine = getLivingFileEngine(dataDir, workspaceDir, { now: fixedNow, checkIntervalMs: 0 });

    const created = engine.registerFile({
      filePath: 'README.md',
      ownerAgentId: 'archivist',
      expectedUpdateHours: 24,
    });
    expect(created.fileId).toContain('lf-');
    expect(engine.listFiles()).toHaveLength(1);

    const updated = engine.updateFile(created.fileId, {
      expectedUpdateHours: 12,
      intentionallyStatic: true,
      notes: 'Core static contract file',
    });
    expect(updated.expectedUpdateHours).toBe(12);
    expect(updated.intentionallyStatic).toBe(true);
    expect(updated.notes).toContain('static');

    const removed = engine.unregisterFile(created.fileId);
    expect(removed).toBe(true);
    expect(engine.listFiles()).toHaveLength(0);
  });

  it('detects stale files and auto-triggers owner task', () => {
    const filePath = path.join(workspaceDir, 'docs', 'API.md');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '# API\n');
    fs.utimesSync(filePath, new Date('2026-02-18T10:00:00.000Z'), new Date('2026-02-18T10:00:00.000Z'));

    const engine = getLivingFileEngine(dataDir, workspaceDir, { now: fixedNow, checkIntervalMs: 0 });
    const file = engine.registerFile({
      filePath: 'docs/API.md',
      ownerAgentId: 'archivist',
      expectedUpdateHours: 24,
    });

    const run1 = engine.runStalenessCheck({ source: 'test', autoTrigger: true });
    const snapshot = run1.snapshots.find((row) => row.entry.fileId === file.fileId);
    expect(snapshot?.status).toBe('stale');
    expect(run1.triggered).toHaveLength(1);
    expect(run1.triggered[0].ownerAgentId).toBe('archivist');

    const taskBoardPath = path.join(dataDir, 'task-board.json');
    expect(fs.existsSync(taskBoardPath)).toBe(true);
    const taskBoard = JSON.parse(fs.readFileSync(taskBoardPath, 'utf8')) as { tasks: Array<{ title: string; assigneeId: string }> };
    expect(taskBoard.tasks.some((task) => task.title.includes('docs/API.md') && task.assigneeId === 'archivist')).toBe(true);

    const run2 = engine.runStalenessCheck({ source: 'test', autoTrigger: true });
    expect(run2.triggered).toHaveLength(0);
    expect(engine.listTriggers({ status: 'queued' })).toHaveLength(1);
  });

  it('supports intentionally static override to suppress triggers', () => {
    const engine = getLivingFileEngine(dataDir, workspaceDir, { now: fixedNow, checkIntervalMs: 0 });
    engine.registerFile({
      filePath: 'docs/CONTRACT.md',
      ownerAgentId: 'archivist',
      expectedUpdateHours: 12,
      intentionallyStatic: true,
    });

    const result = engine.runStalenessCheck({ source: 'test', autoTrigger: true });
    expect(result.run.counts.static).toBe(1);
    expect(result.triggered).toHaveLength(0);
    expect(engine.listTriggers()).toHaveLength(0);
  });

  it('rejects file paths that escape workspace via sibling-prefix traversal', () => {
    const engine = getLivingFileEngine(dataDir, workspaceDir, { now: fixedNow, checkIntervalMs: 0 });
    const siblingWorkspace = path.join(testRoot, 'workspace2');
    fs.mkdirSync(siblingWorkspace, { recursive: true });
    fs.writeFileSync(path.join(siblingWorkspace, 'secret.txt'), 'sibling');

    expect(() =>
      engine.registerFile({
        filePath: '../workspace2/secret.txt',
        ownerAgentId: 'archivist',
        expectedUpdateHours: 24,
      }),
    ).toThrow('filePath must stay inside workspace');
  });

  it('rejects absolute file paths outside the workspace', () => {
    const engine = getLivingFileEngine(dataDir, workspaceDir, { now: fixedNow, checkIntervalMs: 0 });
    const absoluteOutside = path.join(path.parse(workspaceDir).root, 'ventureos-outside', 'secret.txt');

    expect(() =>
      engine.registerFile({
        filePath: absoluteOutside,
        ownerAgentId: 'archivist',
        expectedUpdateHours: 24,
      }),
    ).toThrow('filePath must stay inside workspace');

    expect(() =>
      engine.registerFile({
        filePath: 'C:/Windows/System32/config/SAM',
        ownerAgentId: 'archivist',
        expectedUpdateHours: 24,
      }),
    ).toThrow('filePath must stay inside workspace');
  });
});

/**
 * Queue Migration Tests — VentureOS Queue Integration (P1 #30)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  migrateQueueDocument,
  migrateQueueFile,
  type MigrationResult,
} from '../queue-migration';
import { QUEUE_SCHEMA_VERSION, type QueueDocument } from '../task-queue';

// ── Fixtures ─────────────────────────────────────────────────────────

function v1Doc(items: Record<string, unknown>[] = []): QueueDocument {
  return {
    version: 1,
    generated_at: '2026-02-01',
    items: items as any,
  };
}

function v2Doc(items: Record<string, unknown>[] = []): QueueDocument {
  return {
    version: 2,
    generated_at: '2026-02-15',
    items: items as any,
  };
}

const V1_TASK_WITH_MISSION = {
  id: 'task-1',
  createdAt: '2026-02-08T00:20:00Z',
  tier: 'P2',
  status: 'queued',
  title: 'Draft content calendar',
  businessUnit: 'stanton-times',
  missionType: 'content',
  role: 'Comms',
  attempts: 0,
  maxAttempts: 3,
};

const V1_TASK_WITHOUT_MISSION = {
  id: 'task-2',
  createdAt: '2026-02-05T10:00:00Z',
  tier: 'P1',
  status: 'queued',
  title: 'Fix critical bug',
};

// ── Tests ────────────────────────────────────────────────────────────

describe('Queue Migration', () => {
  describe('migrateQueueDocument', () => {
    it('migrates v1 → v2 with mission metadata', () => {
      const doc = v1Doc([V1_TASK_WITH_MISSION]);
      const { document, result } = migrateQueueDocument(doc);

      expect(result.persisted).toBe(true);
      expect(result.fromVersion).toBe(1);
      expect(result.toVersion).toBe(QUEUE_SCHEMA_VERSION);
      expect(result.tasksMigrated).toBe(1);
      expect(result.tasksWithContext).toBe(1);
      expect(result.warnings).toHaveLength(0);

      expect(document.version).toBe(2);
      expect(document.items[0].businessUnit).toBe('stanton-times');
      expect(document.items[0].missionType).toBe('content');
      expect(document.items[0].role).toBe('Comms');
      expect(document.items[0].missionContext).toEqual({
        businessUnit: 'stanton-times',
        missionType: 'content',
        role: 'Comms',
      });
    });

    it('migrates v1 → v2 without mission metadata', () => {
      const doc = v1Doc([V1_TASK_WITHOUT_MISSION]);
      const { document, result } = migrateQueueDocument(doc);

      expect(result.tasksMigrated).toBe(1);
      expect(result.tasksWithContext).toBe(0);

      const task = document.items[0];
      expect(task.businessUnit).toBeUndefined();
      expect(task.missionType).toBeUndefined();
      expect(task.role).toBeUndefined();
      expect(task.missionContext).toBeUndefined();
      // Defaults applied
      expect(task.attempts).toBe(0);
      expect(task.maxAttempts).toBe(3);
      expect(task.status).toBe('queued');
      expect(task.tier).toBe('P1');
    });

    it('handles mixed v1 tasks', () => {
      const doc = v1Doc([V1_TASK_WITH_MISSION, V1_TASK_WITHOUT_MISSION]);
      const { document, result } = migrateQueueDocument(doc);

      expect(result.tasksMigrated).toBe(2);
      expect(result.tasksWithContext).toBe(1);
      expect(document.items).toHaveLength(2);
    });

    it('handles empty queue', () => {
      const doc = v1Doc([]);
      const { document, result } = migrateQueueDocument(doc);

      expect(result.persisted).toBe(true);
      expect(result.tasksMigrated).toBe(0);
      expect(document.version).toBe(2);
      expect(document.items).toHaveLength(0);
    });

    it('no-ops when already at target version', () => {
      const doc = v2Doc([]);
      const { document, result } = migrateQueueDocument(doc);

      expect(result.persisted).toBe(false);
      expect(result.warnings).toContain('Document already at target version');
      expect(document).toBe(doc); // Same reference
    });

    it('does not mutate original document', () => {
      const doc = v1Doc([{ ...V1_TASK_WITH_MISSION }]);
      const original = JSON.stringify(doc);
      migrateQueueDocument(doc);
      expect(JSON.stringify(doc)).toBe(original);
    });

    it('dry run reports without persisting', () => {
      const doc = v1Doc([V1_TASK_WITH_MISSION]);
      const { result } = migrateQueueDocument(doc, { dryRun: true });

      expect(result.persisted).toBe(false);
      expect(result.tasksMigrated).toBe(1);
    });
  });

  describe('rollback v2 → v1', () => {
    const rollbackDoc = v2Doc([
      {
        id: 'task-1',
        createdAt: '2026-02-15',
        tier: 'P1',
        status: 'queued',
        title: 'Test',
        businessUnit: 'bloom',
        missionType: 'build',
        role: 'Producer',
        missionContext: { businessUnit: 'bloom', missionType: 'build', role: 'Producer' },
        attempts: 0,
        maxAttempts: 3,
      },
    ]);

    it('strips missionContext on rollback', () => {
      const { document, result } = migrateQueueDocument(rollbackDoc, { targetVersion: 1 });

      expect(result.persisted).toBe(true);
      expect(result.fromVersion).toBe(2);
      expect(result.toVersion).toBe(1);
      expect(document.version).toBe(1);
      expect(document.items[0].businessUnit).toBe('bloom'); // Preserved
      expect(document.items[0].missionType).toBe('build');  // Preserved
      expect((document.items[0] as any).missionContext).toBeUndefined(); // Stripped
    });

    it('marks rollback dry-run as not persisted', () => {
      const { result } = migrateQueueDocument(rollbackDoc, { targetVersion: 1, dryRun: true });
      expect(result.persisted).toBe(false);
    });
  });

  describe('migrateQueueFile', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'queue-migration-'));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('migrates a file on disk', async () => {
      const filePath = path.join(tmpDir, 'queue.json');
      await fs.writeFile(filePath, JSON.stringify(v1Doc([V1_TASK_WITH_MISSION])));

      const result = await migrateQueueFile(filePath);

      expect(result.persisted).toBe(true);
      expect(result.tasksMigrated).toBe(1);
      expect(result.backupPath).toBeDefined();

      // Verify migrated file
      const migrated: QueueDocument = JSON.parse(await fs.readFile(filePath, 'utf8'));
      expect(migrated.version).toBe(2);
      expect(migrated.items[0].missionContext).toBeDefined();

      // Verify backup exists
      const backup: QueueDocument = JSON.parse(await fs.readFile(result.backupPath!, 'utf8'));
      expect(backup.version).toBe(1);
    });

    it('dry run does not write', async () => {
      const filePath = path.join(tmpDir, 'queue.json');
      const original = JSON.stringify(v1Doc([V1_TASK_WITH_MISSION]));
      await fs.writeFile(filePath, original);

      await migrateQueueFile(filePath, { dryRun: true });

      const after = await fs.readFile(filePath, 'utf8');
      expect(after).toBe(original);
    });

    it('fails with schema validation error for malformed queue document', async () => {
      const filePath = path.join(tmpDir, 'queue-invalid.json');
      await fs.writeFile(
        filePath,
        JSON.stringify({ version: 1, generated_at: '2026-02-15', items: 'not-an-array' })
      );

      await expect(migrateQueueFile(filePath)).rejects.toThrow('schema validation failed');
    });

    it('skips backup when disabled', async () => {
      const filePath = path.join(tmpDir, 'queue.json');
      await fs.writeFile(filePath, JSON.stringify(v1Doc([])));

      const result = await migrateQueueFile(filePath, { createBackup: false });
      expect(result.backupPath).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('handles tasks with minimal fields', () => {
      const doc = v1Doc([{ id: 'bare', title: 'Bare minimum' }]);
      const { document } = migrateQueueDocument(doc);

      const task = document.items[0];
      expect(task.id).toBe('bare');
      expect(task.attempts).toBe(0);
      expect(task.maxAttempts).toBe(3);
      expect(task.status).toBe('queued');
      expect(task.tier).toBe('P2');
    });

    it('preserves existing missionContext in v1 task', () => {
      const doc = v1Doc([
        {
          ...V1_TASK_WITH_MISSION,
          missionContext: { businessUnit: 'stanton-times', missionType: 'content', role: 'Comms', tags: { custom: 'tag' } },
        },
      ]);

      const { document } = migrateQueueDocument(doc);
      expect(document.items[0].missionContext?.tags).toEqual({ custom: 'tag' });
    });

    it('returns error for unsupported migration path', () => {
      // Fake a v99 doc
      const doc = { version: 99, generated_at: '2026-02-15', items: [] } as QueueDocument;
      const { result } = migrateQueueDocument(doc, { targetVersion: 100 });

      expect(result.persisted).toBe(false);
      expect(result.warnings.some((w) => w.includes('No migration path'))).toBe(true);
    });
  });
});

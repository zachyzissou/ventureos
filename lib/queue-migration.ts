/**
 * Queue Schema Migration — VentureOS Queue Integration (P1 #30)
 *
 * Handles migration of queue documents between schema versions.
 * Currently supports: v1 → v2
 *
 * Features:
 * - Forward migration with validation
 * - Rollback support
 * - Backup creation before migration
 * - Dry-run mode
 */

import fs from 'node:fs/promises';
import Ajv from 'ajv';

import {
  type QueueDocument,
  type QueueTask,
  type MissionContext,
  QUEUE_SCHEMA_VERSION,
} from './task-queue';

// ============================================================================
// Types
// ============================================================================

export interface MigrationResult {
  /**
   * Whether migration changes were persisted to disk or intended for persistence.
   *
   * - In `migrateQueueFile`, `true` means migrated content was written to disk.
   * - In `migrateQueueDocument`, `true` means migration is non-dry-run and
   *   should be persisted by the caller.
   * - `false` in dry-run mode, or when no migration path exists.
   */
  persisted: boolean;
  /** Source version. */
  fromVersion: number;
  /** Target version. */
  toVersion: number;
  /** Number of tasks migrated. */
  tasksMigrated: number;
  /** Number of tasks that already had mission context. */
  tasksWithContext: number;
  /** Warnings generated during migration. */
  warnings: string[];
  /** Path to backup file (if created). */
  backupPath?: string;
}

export interface MigrationOptions {
  /** If true, don't write changes — just report what would happen. */
  dryRun?: boolean;
  /** If true, create a backup before migrating. */
  createBackup?: boolean;
  /** Target version. Default: QUEUE_SCHEMA_VERSION. */
  targetVersion?: number;
}

const ajv = new Ajv({ allErrors: true, strict: false });
const validateQueueDocument = ajv.compile({
  type: 'object',
  required: ['version', 'generated_at', 'items'],
  additionalProperties: true,
  properties: {
    version: { type: 'integer', minimum: 1 },
    generated_at: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
      },
    },
  },
});

// ============================================================================
// Migration Functions
// ============================================================================

/**
 * Migrate a queue document from its current version to the target version.
 *
 * This is a pure function — it returns a new document without mutating the input.
 */
export function migrateQueueDocument(
  doc: QueueDocument,
  options: MigrationOptions = {}
): { document: QueueDocument; result: MigrationResult } {
  const targetVersion = options.targetVersion ?? QUEUE_SCHEMA_VERSION;
  const fromVersion = doc.version ?? 1;

  if (fromVersion === targetVersion) {
    return {
      document: doc,
      result: {
        persisted: false,
        fromVersion,
        toVersion: targetVersion,
        tasksMigrated: 0,
        tasksWithContext: 0,
        warnings: ['Document already at target version'],
      },
    };
  }

  if (fromVersion > targetVersion) {
    // Rollback path
    return rollbackDocument(doc, targetVersion, options);
  }

  // Forward migration chain
  let current = deepClone(doc);
  const allWarnings: string[] = [];
  let totalMigrated = 0;
  let totalWithContext = 0;

  for (let v = fromVersion; v < targetVersion; v++) {
    const step = MIGRATIONS[v];
    if (!step) {
      return {
        document: doc,
        result: {
          persisted: false,
          fromVersion,
          toVersion: targetVersion,
          tasksMigrated: 0,
          tasksWithContext: 0,
          warnings: [`No migration path from v${v} to v${v + 1}`],
        },
      };
    }

    const { document, warnings, migrated, withContext } = step(current);
    current = document;
    allWarnings.push(...warnings);
    totalMigrated += migrated;
    totalWithContext += withContext;
  }

  return {
    document: current,
    result: {
      persisted: !options.dryRun,
      fromVersion,
      toVersion: targetVersion,
      tasksMigrated: totalMigrated,
      tasksWithContext: totalWithContext,
      warnings: allWarnings,
    },
  };
}

/**
 * Migrate a queue file on disk.
 */
export async function migrateQueueFile(
  filePath: string,
  options: MigrationOptions = {}
): Promise<MigrationResult> {
  const raw = await fs.readFile(filePath, 'utf8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    throw new Error(`Invalid queue JSON at ${filePath}: ${err.message}`, { cause: err });
  }

  if (!validateQueueDocument(parsed)) {
    const details = (validateQueueDocument.errors ?? [])
      .map((e) => `${e.instancePath || '/'} ${e.message ?? 'is invalid'}`)
      .join('; ');
    throw new Error(`Queue document schema validation failed at ${filePath}: ${details}`);
  }

  const doc = parsed as QueueDocument;
  const { document, result } = migrateQueueDocument(doc, options);

  if (result.persisted && !options.dryRun) {
    // Create backup if requested
    if (options.createBackup !== false) {
      const backupPath = `${filePath}.v${result.fromVersion}.backup`;
      await fs.writeFile(backupPath, raw, 'utf8');
      result.backupPath = backupPath;
    }

    // Write migrated document
    const tmp = `${filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(document, null, 2), 'utf8');
    await fs.rename(tmp, filePath);
  }

  return result;
}

// ============================================================================
// Migration Steps
// ============================================================================

interface MigrationStepResult {
  document: QueueDocument;
  warnings: string[];
  migrated: number;
  withContext: number;
}

type MigrationStep = (doc: QueueDocument) => MigrationStepResult;

/** v1 → v2: Add mission metadata fields. */
function migrateV1toV2(doc: QueueDocument): MigrationStepResult {
  const warnings: string[] = [];
  let migrated = 0;
  let withContext = 0;

  const items: QueueTask[] = (doc.items ?? []).map((item) => {
    const task = { ...item } as QueueTask;
    migrated++;

    // Build mission context from existing fields
    const businessUnit = task.businessUnit;
    const missionType = task.missionType;
    const role = task.role;

    if (businessUnit || missionType || role) {
      withContext++;
    }

    // Construct the missionContext field if any mission data exists
    let missionContext: MissionContext | undefined;
    if (businessUnit || missionType || role) {
      missionContext = {};
      if (businessUnit) missionContext.businessUnit = businessUnit;
      if (missionType) missionContext.missionType = missionType;
      if (role) missionContext.role = role;
    }

    // Ensure defaults
    const migrated_task: QueueTask = {
      ...task,
      businessUnit,
      missionType,
      role,
      missionContext: task.missionContext ?? missionContext,
      attempts: task.attempts ?? 0,
      maxAttempts: task.maxAttempts ?? 3,
      status: task.status ?? 'queued',
      tier: task.tier ?? 'P2',
    };

    return migrated_task;
  });

  return {
    document: {
      version: 2,
      generated_at: doc.generated_at,
      items,
    },
    warnings,
    migrated,
    withContext,
  };
}

/** Map of source version → migration function. */
const MIGRATIONS: Record<number, MigrationStep> = {
  1: migrateV1toV2,
};

// ============================================================================
// Rollback
// ============================================================================

/**
 * Roll back a document to a lower version.
 * Strips fields not present in the target schema.
 */
function rollbackDocument(
  doc: QueueDocument,
  targetVersion: number,
  options: MigrationOptions = {}
): { document: QueueDocument; result: MigrationResult } {
  const fromVersion = doc.version;
  const warnings: string[] = [];

  if (targetVersion === 1 && fromVersion === 2) {
    // v2 → v1: Strip mission metadata fields
    const items = (doc.items ?? []).map((task) => {
      const { missionContext: _mc, ...rest } = task;
      // Keep businessUnit/missionType/role as they existed in v1 template
      return rest;
    });

    warnings.push('Rolled back from v2 to v1: missionContext field stripped from all tasks');

    return {
      document: {
        version: 1,
        generated_at: doc.generated_at,
        items: items as QueueTask[],
      },
      result: {
        persisted: !options.dryRun,
        fromVersion,
        toVersion: targetVersion,
        tasksMigrated: items.length,
        tasksWithContext: 0,
        warnings,
      },
    };
  }

  return {
    document: doc,
    result: {
      persisted: false,
      fromVersion,
      toVersion: targetVersion,
      tasksMigrated: 0,
      tasksWithContext: 0,
      warnings: [`No rollback path from v${fromVersion} to v${targetVersion}`],
    },
  };
}

// ============================================================================
// Utilities
// ============================================================================

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

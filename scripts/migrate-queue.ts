#!/usr/bin/env ts-node
/**
 * Queue Schema Migration Script — VentureOS (P1 #30)
 *
 * Usage:
 *   npx ts-node scripts/migrate-queue.ts [path] [options]
 *
 * Options:
 *   --dry-run         Report changes without writing
 *   --no-backup       Skip creating backup file
 *   --rollback        Rollback to v1 (strips missionContext)
 *
 * Default path: ~/clawd/runtime/task-queue.json
 */

import path from 'node:path';
import os from 'node:os';
import { migrateQueueFile } from '../lib/queue-migration';

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const positional = args.filter((a) => !a.startsWith('--'));

  const filePath = positional[0] ?? path.resolve(os.homedir(), 'clawd/runtime/task-queue.json');
  const dryRun = flags.has('--dry-run');
  const createBackup = !flags.has('--no-backup');
  const rollback = flags.has('--rollback');
  const targetVersion = rollback ? 1 : undefined;

  console.log(`Queue Migration`);
  console.log(`  File: ${filePath}`);
  console.log(`  Dry run: ${dryRun}`);
  console.log(`  Backup: ${createBackup}`);
  if (targetVersion) console.log(`  Target version: ${targetVersion}`);
  console.log('');

  try {
    const result = await migrateQueueFile(filePath, { dryRun, createBackup, targetVersion });

    console.log(`Result:`);
    console.log(`  Persisted: ${result.persisted}`);
    console.log(`  From: v${result.fromVersion} → v${result.toVersion}`);
    console.log(`  Tasks migrated: ${result.tasksMigrated}`);
    console.log(`  Tasks with context: ${result.tasksWithContext}`);

    if (result.backupPath) {
      console.log(`  Backup: ${result.backupPath}`);
    }

    if (result.warnings.length) {
      console.log(`  Warnings:`);
      for (const w of result.warnings) {
        console.log(`    - ${w}`);
      }
    }

    // Dry-runs are informational and should not fail CI based on warnings.
    const success = dryRun ? true : (result.persisted || !result.warnings.length);
    process.exit(success ? 0 : 1);
  } catch (err: any) {
    console.error(`Migration failed: ${err.message}`);
    process.exit(1);
  }
}

main();

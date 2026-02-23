# Queue Integration — Mission Metadata (P1 #30)

## Overview

The task queue has been extended with mission metadata support for portfolio-aware routing. Tasks can now carry `businessUnit`, `missionType`, and `role` fields that are validated against the Business Unit Registry and used for intelligent priority routing.

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   TaskQueue     │────▶│   QueueRouter        │────▶│  BusinessUnit   │
│  (task-queue.ts)│     │  (queue-router.ts)   │     │  Registry       │
│                 │     │                      │     │  (business-     │
│ enqueue()       │     │ route()              │     │   unit-         │
│ updateStatus()  │     │ prioritize()         │     │   registry.ts)  │
│ getTasks()      │     │ pickNext()           │     │                 │
│ stats()         │     │ validateTask()       │     │ validate()      │
│ load()/export() │     │ groupByBusinessUnit()│     │ getPriority()   │
└─────────────────┘     └──────────────────────┘     └─────────────────┘
         │                                                    │
         ▼                                                    ▼
┌─────────────────┐                                  ~/clawd/runtime/
│ QueueMigration  │                                  business-units.json
│ (queue-         │
│  migration.ts)  │
│                 │
│ v1 → v2         │
│ rollback        │
│ backup          │
└─────────────────┘
```

## Schema

### Queue Document (v2)

```json
{
  "version": 2,
  "generated_at": "2026-02-15T12:00:00Z",
  "items": [
    {
      "id": "uuid",
      "createdAt": "2026-02-15T12:00:00Z",
      "tier": "P1",
      "status": "queued",
      "title": "Fix queue routing",
      "businessUnit": "ventureos",
      "missionType": "infra",
      "role": "Helmsman",
      "missionContext": {
        "businessUnit": "ventureos",
        "missionType": "infra",
        "role": "Helmsman",
        "tags": { "sprint": "w06" }
      },
      "attempts": 0,
      "maxAttempts": 3,
      "timeoutSeconds": 300
    }
  ]
}
```

### Mission Metadata Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `businessUnit` | string | No | Business unit ID (validated against registry) |
| `missionType` | enum | No | `build`, `ops`, `infra`, `content`, `research` |
| `role` | string | No | Agent role assigned to this task |
| `missionContext` | object | No | Full context with optional `tags` |

### Backward Compatibility

- All mission fields are optional
- v1 tasks (without mission metadata) work unchanged
- v1 documents are auto-normalized when loaded
- The queue exports v2 format regardless of input version

## Routing Logic

The `QueueRouter` computes a priority score for each task:

```
score = tierScore + businessUnitScore + missionTypeScore + ageBonus + approvalPenalty
```

### Score Components

| Component | Values | Description |
|-----------|--------|-------------|
| **Tier** | P0=1000, P1=750, P2=500, P3=250 | Primary priority |
| **Business Unit** | critical=400, high=300, medium=200, low=100 | Portfolio priority boost |
| **Mission Type** | infra=50, ops=40, build=30, content=20, research=10 | Type modifier |
| **Age Bonus** | 0–100 (1pt/min) | Fairness: older tasks rise |
| **Approval Penalty** | -900 | Tasks needing approval strongly deprioritized |

### Example

A P1 VentureOS infra task created 30 minutes ago:
```
750 (P1) + 400 (critical) + 50 (infra) + 30 (age) + 0 (no approval) = 1230
```

A P2 FotoPress build task needing approval:
```
500 (P2) + 100 (low) + 30 (build) + 0 (new) + (-900) (approval) = -270
```

> **Note:** Negative scores are intentional. The strong approval penalty (-900) ensures that tasks requiring approval are deprioritized below ready-to-run tasks, even across priority tiers. Tasks are sorted by score (highest first), so a ready P3 task (score ~250+) will be picked before an approval-required P2 task (score potentially negative).

## Usage

### Enqueue a Task

```typescript
import { TaskQueue } from './lib/task-queue';

const queue = new TaskQueue();

const task = queue.enqueue({
  title: 'Deploy new feature',
  tier: 'P1',
  businessUnit: 'ventureos',
  missionType: 'infra',
  role: 'Helmsman',
});
```

### Route Tasks

```typescript
import { QueueRouter } from './lib/queue-router';
import { BusinessUnitRegistry } from './lib/business-unit-registry';

const registry = new BusinessUnitRegistry();
await registry.load();

const router = new QueueRouter({ registry });

// Get next task to execute
const next = router.pickNext(queue.getTasks());

// Get all tasks sorted by priority
const prioritized = router.prioritize(queue.getTasks());

// Validate a task
const errors = router.validateTask(task);
```

### Filter Tasks

```typescript
// By business unit
const bloomTasks = queue.getTasks({ businessUnit: 'bloom' });

// By mission type
const infraTasks = queue.getTasks({ missionType: 'infra' });

// By role
const helmsmanTasks = queue.getTasks({ role: 'Helmsman' });

// Combined
const runningBloom = queue.getTasks({ businessUnit: 'bloom', status: 'running' });
```

### Stats

```typescript
const stats = queue.stats();
// {
//   bloom: { total: 3, queued: 1, running: 1, failed: 1 },
//   ventureos: { total: 2, queued: 2, running: 0, failed: 0 },
//   _unassigned: { total: 1, queued: 1, running: 0, failed: 0 }
// }
```

## Migration

### Migrate Existing Queue

```bash
# Dry run (preview)
npx ts-node scripts/migrate-queue.ts --dry-run

# Apply migration with backup
npx ts-node scripts/migrate-queue.ts

# Migrate a specific file
npx ts-node scripts/migrate-queue.ts /path/to/queue.json

# Rollback to v1
npx ts-node scripts/migrate-queue.ts --rollback
```

### Programmatic Migration

```typescript
import { migrateQueueDocument, migrateQueueFile } from './lib/queue-migration';

// In-memory
const { document, result } = migrateQueueDocument(v1Doc);

// File-based
const result = await migrateQueueFile('/path/to/queue.json', {
  dryRun: false,
  createBackup: true,
});
```

## Logging

All queue operations include mission tags in structured log metadata:

```
[queue] Task enqueued { taskId: 'abc', tier: 'P1', status: 'queued', businessUnit: 'ventureos', missionType: 'infra', role: 'Helmsman' }
[queue] Task running  { taskId: 'abc', tier: 'P1', status: 'running', businessUnit: 'ventureos', missionType: 'infra', role: 'Helmsman' }
[router] Routing warnings { taskId: 'xyz', businessUnit: 'unknown', warnings: ['Unknown business unit: unknown'] }
```

Set `QUEUE_DEBUG=1` for verbose debug logging.

## Files

| File | Description |
|------|-------------|
| `lib/task-queue.ts` | Queue schema, TaskQueue class |
| `lib/business-unit-registry.ts` | Registry loader and validator |
| `lib/queue-router.ts` | Portfolio-aware routing logic |
| `lib/queue-migration.ts` | v1→v2 migration + rollback |
| `scripts/migrate-queue.ts` | CLI migration script |
| `lib/__tests__/task-queue.test.ts` | Queue unit tests (24 tests) |
| `lib/__tests__/business-unit-registry.test.ts` | Registry tests (22 tests) |
| `lib/__tests__/queue-router.test.ts` | Router tests (21 tests) |
| `lib/__tests__/queue-migration.test.ts` | Migration tests (14 tests) |
| `lib/__tests__/queue-integration.test.ts` | Integration tests (10 tests) |

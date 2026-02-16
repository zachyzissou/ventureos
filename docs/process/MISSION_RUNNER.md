# Mission Runner (P1 #29)

This module provides an end-to-end **mission execution workflow** for VentureOS — coordinating squad work from brief → delivery, with persistence and quality gates.

## Phases

1. **Brief** — validate mission requirements
2. **Plan** — break into tasks and assign squad roles
3. **Execute** — dispatch tasks, track progress, tolerate failures
4. **Verify** — run quality/security/approval gates
5. **Deliver** — collect artifacts + generate reports
6. **Close** — archive mission, update metrics

## Code Map

- `lib/mission-runner.ts` — Orchestrator (high-level workflow)
- `lib/mission-state-machine.ts` — Persistent state machine + mission record types
- `lib/squad-coordinator.ts` — Task planning + dispatch to agents
- `lib/gate-checks.ts` — Gate framework + default gates
- `lib/artifact-collector.ts` — Artifact versioning + manifest generation

## Usage

```ts
import { MissionRunner } from '../../lib/mission-runner';
import type { SquadAgent } from '../../lib/squad-coordinator';

const agents: SquadAgent[] = [
  {
    id: 'synth',
    async runTask(task, ctx) {
      return {
        summary: `Completed: ${task.title}`,
        artifacts: [
          { name: `task-${task.taskId}.md`, content: `# Output\n\n${task.description}\n` },
        ],
      };
    },
  },
  // Add: oracle, sentinel, verifier, archivist, atlas
];

const runner = new MissionRunner({
  agents,
  continueOnFailure: true,
});

const result = await runner.runFromBrief({
  title: 'Hello Mission',
  description: 'Demonstrate end-to-end mission workflow.',
  requirements: ['Return at least one artifact.'],
  deliverables: ['status-report.md', 'completion-summary.md'],
});

console.log(result.mission.phase); // 'closed' | 'error'
console.log(result.delivered?.manifestPath);
```

## Persistence / Resume

By default, mission state is persisted as **one JSON file per mission** in:

- `~/clawd/ventureos/runtime/missions/state/<missionId>.json`

You can resume a mission by mission ID:

```ts
const resumed = await runner.resume(missionId);
```

If a mission is in `error`, you can roll back:

```ts
await runner.rollback(missionId, 'execute');
await runner.resume(missionId);
```

## Gate Checks

Default gates include:

- Quality: plan must be non-empty
- Quality: no failed tasks
- Security: tripwire scan for obvious secret markers in task artifacts
- Approval: optional human approval via `approve()` callback

To customize gates, pass `gates: GateDefinition[]` in the runner config.

## Outputs

The **Deliver** phase produces a versioned directory:

- `~/clawd/ventureos/runtime/missions/artifacts/<missionId>/v0001/`
  - `manifest.json`
  - `status-report.md`
  - `completion-summary.md`
  - `failure-analysis.md`
  - any task-produced artifacts

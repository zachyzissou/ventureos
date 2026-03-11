# Workflow Macros (P2 #32)

## Overview
`lib/workflow-macros.ts` implements VentureOS **1-command workflow acceleration**.

It provides:

1. Reusable workflow macro system (`WorkflowMacroSystem`)
2. Command composition engine (`CommandCompositionEngine`)
3. Shortcut command library (`ShortcutCommandLibrary`)
4. Batch processing framework (`BatchWorkflowProcessor`)
5. Real-time progress tracking (`WorkflowProgressTracker`)
6. Retry + rollback execution semantics
7. Multi-step workflow recorder (`WorkflowRecorder`)
8. Five prebuilt workflows (DSL)

---

## Prebuilt Workflows

The system ships with these workflows registered by default:

- `newco-sprint`
  - Research → Validate → Build MVP → Test
- `content-batch`
  - Plan + batch Write/Edit/Publish/Promote (5+ pieces)
- `deploy-check`
  - Build → Test → Security Scan → Deploy → Verify
- `weekly-review`
  - Metrics → Highlights → Blockers → Plan
- `incident-response`
  - Detect → Triage → Fix → Postmortem

---

## Core Concepts

### 1) Workflow DSL

Workflows are defined as typed TypeScript objects (DSL) for strict-mode safety.

```ts
const workflow: WorkflowDefinition = {
  version: 1,
  name: 'deploy-check',
  description: 'Build + test + security scan + deploy + verify',
  rollbackOnFailure: true,
  steps: [
    { id: 'build', commands: [{ command: 'deploy.build' }] },
    { id: 'deploy', onError: 'rollback', commands: [{ command: 'deploy.release' }] },
  ],
};
```

### 2) Command Composition Engine

A step can run one or many commands in:

- `sequential` mode (default)
- `parallel` mode

Each command supports:

- templated params (`{{item.title}}`, `{{inputs.foo}}`, `{{state.bar}}`)
- retry policy (`maxAttempts`, `backoffMs`, `maxBackoffMs`)
- idempotency keys
- rollback command override

### 3) Shortcut Command Library

Commands can be registered with shortcuts/aliases.

Examples included by default:

- `deploy.go` → `deploy.release`
- `content.create` → `content.write`
- `incident.mitigate` → `incident.fix`

### 4) Batch Processing

Batch steps run a command sequence over an input array.

```ts
{
  id: 'produce-content-batch',
  type: 'batch',
  itemsPath: 'contentPieces',
  concurrency: 2,
  continueOnItemFailure: true,
  commands: [
    { command: 'content.write', params: { title: '{{item.title}}' } },
    { command: 'content.publish', params: { title: '{{item.title}}' } },
  ],
}
```

### 5) Progress Tracking

`WorkflowProgressTracker` emits real-time events:

- `run-started`
- `step-started`
- `retry`
- `batch-item-completed`
- `step-completed` / `step-failed`
- `rollback-started` / `rollback-completed`
- `run-completed` / `run-failed`

### 6) Rollback + Retry

- Retry can be set at step or command level.
- Failed workflows can automatically rollback prior successful steps.
- Rollback executes in reverse order.
- Step-level rollback commands are supported.

### 7) Workflow Recorder

`WorkflowRecorder` can:

- record steps/commands into a reusable workflow definition
- generate a workflow definition from an execution result (`fromRun`)

---

## Usage

### Basic execution

```ts
import { WorkflowMacroSystem } from '../lib/workflow-macros';

const system = new WorkflowMacroSystem();

const result = await system.execute('newco-sprint', {
  inputs: { market: 'creator tools' },
  onProgress: (event) => {
    console.log(event.type, event.snapshot.percent);
  },
});

console.log(result.status, result.steps.length);
```

### Register custom workflow

```ts
system.registerWorkflow({
  version: 1,
  name: 'quick-check',
  description: 'Simple custom workflow',
  steps: [
    {
      id: 'check',
      commands: [{ command: 'review.collect-metrics' }],
    },
  ],
});
```

### Register custom command

```ts
system.commandLibrary.registerCommand({
  name: 'custom.validate',
  async handler(params, ctx) {
    return {
      output: { ok: true, params },
      stateUpdates: { validatedAt: ctx.now().toISOString() },
    };
  },
});
```

---

## Testing

Coverage for this feature is implemented in:

- `lib/__tests__/workflow-macros.test.ts`

Test coverage includes:

- prebuilt workflow registration
- workflow execution success paths
- batch processing
- retry semantics
- rollback semantics
- shortcut alias resolution
- dry-run behavior
- workflow recorder behavior
- conditional step execution

---

## Extensibility Notes

To add a new workflow:

1. Define `WorkflowDefinition` (new file or inline)
2. Register with `WorkflowMacroSystem.registerWorkflow`
3. Add any missing command handlers/shortcuts
4. Add tests covering happy path + failure/rollback

Design goals met:

- Strict TypeScript DSL
- Idempotent-by-default command execution
- Safe retries and reversible rollback paths
- Batch + parallel support where appropriate
- Real-time progress visibility for operators

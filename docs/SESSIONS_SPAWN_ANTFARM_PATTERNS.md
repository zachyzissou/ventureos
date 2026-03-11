# Antfarm Workflow Patterns → VentureOS `sessions_spawn` Infrastructure

## Summary
This repo already includes a durable spawn retry wrapper (`scripts/spawn-with-retry.mjs`).

This change set adds an **Antfarm-inspired workflow wrapper** that adapts (not copies) the core patterns:

1) **Fresh context per step**
2) **Explicit verification step** with a **dev ↔ verifier loop**
3) **Retry logic** for transient spawn failures (exponential backoff)

The goal is to make multi-agent work more deterministic and auditable by:
- forcing each step to run in a *new* session with a *new* context file,
- preventing a single agent from “marking its own homework,”
- and making transient gateway/dispatch failures non-fatal.

## What was added
### Script: `scripts/spawn-with-verification.mjs`
A one-command workflow runner that executes:

- optional **plan** step (`agent:planner`)
- **dev** step (`agent:dev`)
- **verify** step (`agent:verifier`)

…and repeats the **dev + verify** cycle until:
- verifier outputs `STATUS: approved`, or
- `--max-verify-cycles` is exhausted.

Each spawn call is protected with `--max-spawn-retries` and exponential backoff.

## Interface
```bash
node scripts/spawn-with-verification.mjs \
  --task "Implement feature X" \
  --spawn-cmd sessions_spawn \
  --max-verify-cycles 2 \
  --max-spawn-retries 3
```

Key options:
- `--task <text>` (required)
- `--run-dir <path>` (workspace-local output dir)
- `--log-file <path>` (workspace-local JSONL log)
- `--skip-plan`
- `--plan-target`, `--dev-target`, `--verify-target`
- `--backoff-seconds "2,4,8,16"` (override for testing)

### Spawn command contract
This script assumes the spawn command supports:
- first positional arg as the target (e.g. `agent:dev`)
- `--label <label>`
- `--context <path>`
- `--prompt <text>`

This matches the **OpenClaw sessions spawn** shape and the existing `sessions_spawn` conventions used by VentureOS.

## Pattern Mapping
### Pattern 1 — Fresh context per step
Implementation:
- Every workflow step writes a **new** markdown context file under `runDir/context/`.
- That context file is passed to the spawn command via `--context`.
- The next step receives prior outputs embedded in its context under a **Previous Outputs** section.

Artifacts:
- `runDir/context/plan.md`
- `runDir/context/dev-cycle-1.md`
- `runDir/context/verify-cycle-1.md`
- etc.

### Pattern 2 — Explicit verification step (don’t let dev mark its own homework)
Implementation:
- The workflow always spawns a dedicated verifier target (default `agent:verifier`).
- Verifier must output:
  - `STATUS: approved` to end the workflow successfully, OR
  - `STATUS: retry` + `ISSUES:` to request a dev rework.

### Pattern 3 — Retry logic (spawn reliability)
Implementation:
- Each spawn call goes through an internal retry loop with backoff.
- Records are appended to a JSONL log for auditability (`spawn_attempt`, `spawn_retry`, `spawn_ok`, `spawn_fail`).

## Isolation & Safety
To align with the repository’s workspace isolation policy:
- `--run-dir` and `--log-file` are restricted to **inside the workspace** or **/tmp/agent-<agentId>**.
- `--spawn-cmd` is denied if it is an explicit path outside workspace and not on the shared allowlist.

This mirrors the isolation checks in `scripts/spawn-with-retry.mjs`.

## Outputs
In `--run-dir`:
- `output/plan.md` (if plan enabled)
- `output/dev-cycle-<n>.md`
- `output/verify-cycle-<n>.md`
- `context/*.md` for each step

In `--log-file` (JSONL):
- workflow lifecycle events (`workflow_start`, `workflow_success`, `workflow_failed`)
- per-step spawn events (`spawn_attempt`, `spawn_retry`, `spawn_ok`, `spawn_fail`)
- verifier decision records (`verify_status`, `verify_retry`)

## Related
- `docs/SESSIONS_SPAWN_RETRY_WRAPPER.md`
- `scripts/spawn-with-retry.mjs`

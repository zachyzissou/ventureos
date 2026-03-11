# Workspace Isolation Implementation

## Context
Previous audit findings identified:
- **67 shared paths** across agent workflows
- **6 write-conflict paths** where multiple agents could race on the same files

This implementation hardens script/runtime behavior around per-agent workspaces.

## What changed

### 1) Stricter path isolation (default deny)
Updated scripts now enforce workspace-first path rules:
- `scripts/spawn-with-retry.mjs`
- `scripts/routing-healthcheck.sh`
- `scripts/task-queue.py`

Rules:
- Explicit path args are denied if they resolve outside the active workspace.
- Mutable runtime files (state/log outputs) must stay under workspace paths.

### 2) Minimal shared allowlist
A minimal shared-script allowlist is supported for unavoidable shared tooling:
- `discord-webhook-send.mjs` (primary)
- critical legacy wrappers only when needed (`retry.sh`, `with-timeout.sh`)

Controls:
- Built-in defaults in wrapper scripts
- Optional extension via `SHARED_SCRIPT_ALLOWLIST` (path-delimited)

### 3) Per-agent temp directories
Per-agent temp directories are now standardized and exported:
- `/tmp/agent-<agentId>/`

Applied in:
- `spawn-with-retry.mjs` child execution env (`TMPDIR`)
- `routing-healthcheck.sh`
- `monitor-openclaw.sh`
- `export-cron-logs.sh`
- `restore-backup.sh`
- `task-queue.py` worker subprocesses

### 4) Write-conflict reduction via agent-scoped runtime paths
Runtime state/log outputs were moved to agent-scoped locations:
- `monitor-openclaw.sh`:
  - `<workspace>/runtime/monitor/<agentId>/state.json`
- `routing-healthcheck.sh`:
  - `<workspace>/runtime/monitor/<agentId>/routing-healthcheck.json`
- `export-cron-logs.sh`:
  - `<workspace>/runtime/logs/task_runs/<agentId>/...`
- `archive-task-runs.sh`:
  - source/archive now under `<agentId>` subpaths
- `task-queue.py` defaults:
  - queue/config/task-runs under `<workspace>/runtime/task-queue/<agentId>/...`

## Environment contract

Set these per agent execution context:
- `AGENT_ID` (or `OPENCLAW_AGENT_ID`)
- `OPENCLAW_WORKSPACE` (or `AGENT_WORKSPACE` / `WORKSPACE_ROOT`)

Optional:
- `SHARED_SCRIPT_ALLOWLIST` for explicit additional shared scripts

## Verification (2-agent isolation)

### Test commands
```bash
bash scripts/tests/test-spawn-with-retry.sh
bash scripts/tests/test-routing-healthcheck-isolation.sh
bash scripts/tests/test-export-cron-logs.sh
```

### What the tests assert
- Agent A and Agent B write to separate workspace paths
- Cross-workspace path writes are denied (`PATH_ISOLATION_DENY`)
- Per-agent `TMPDIR` is propagated (`/tmp/agent-<agentId>`)
- Routing healthcheck state files are isolated per agent

## Notes
- `scripts/guarded-run.sh` was switched to repo-local `retry.sh`/`with-timeout.sh` to reduce reliance on shared external script paths.
- Backward compatibility is preserved through env overrides and explicit allowlist extension.

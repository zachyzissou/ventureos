# sessions_spawn Retry Wrapper

## Purpose
Provide a durable wrapper around `sessions_spawn` so transient spawn failures are not silent.

Implemented script: `scripts/spawn-with-retry.mjs`

## Behavior
- Runs `sessions_spawn` (or an override command via `--spawn-cmd`)
- Retries with exponential backoff
  - Backoff schedule: **2s, 4s, 8s, 16s**
  - Default retries: **3** (2s/4s/8s)
  - Optional `--max-retries 4` enables the 16s retry
- Appends structured JSONL records to log file
- Returns clear terminal status:
  - `SPAWN_SUCCESS attempt=<n> retries_used=<n-1>` + exit `0`
  - `SPAWN_FAILURE attempts=<n> exit_code=<code>` + non-zero exit

## Workspace Isolation (new)
- **Default deny** for explicit path args outside the active workspace.
  - `--log-file` must be inside workspace (or per-agent temp dir)
  - `--spawn-cmd` path must be inside workspace unless explicitly allowlisted
- **Minimal shared allowlist** is built in for:
  - `discord-webhook-send.mjs`
  - legacy critical wrappers (`retry.sh`, `with-timeout.sh`)
- **Per-agent temp dir** is always set for child processes:
  - `/tmp/agent-<agentId>/`

Environment controls:
- `AGENT_ID` / `OPENCLAW_AGENT_ID`
- `OPENCLAW_WORKSPACE` / `AGENT_WORKSPACE` / `WORKSPACE_ROOT`
- `SHARED_SCRIPT_ALLOWLIST` (optional, path-delimited)

## Usage

### Standard usage (workspace-local)
```bash
AGENT_ID=atlas OPENCLAW_WORKSPACE=~/.openclaw/workspace-atlas \
  node scripts/spawn-with-retry.mjs -- task:"Analyze roadmap" model:"openai-codex/gpt-5.3-codex" label:"oracle-roadmap"
```

### Explicit max retries (include 16s retry)
```bash
AGENT_ID=oracle OPENCLAW_WORKSPACE=~/.openclaw/workspace-oracle \
  node scripts/spawn-with-retry.mjs \
    --max-retries 4 \
    -- task:"Draft launch brief" model:"anthropic/claude-sonnet-4-20250514" label:"comms-launch"
```

### Custom log path
```bash
AGENT_ID=atlas OPENCLAW_WORKSPACE=~/.openclaw/workspace-atlas \
  node scripts/spawn-with-retry.mjs \
    --log-file ~/.openclaw/workspace-atlas/runtime/logs/sessions-spawn-retry.jsonl \
    -- task:"Build sprint review" label:"producer-sprint-review"
```

## Log format
Default log file:
- `<workspace>/runtime/logs/spawn-with-retry.log`

JSONL records include:
- `ts`, `event`, `attempt`, `maxRetries`, `retryNumber`
- `nextBackoffSeconds`, `exitCode`, `durationMs`
- `agentId`, `workspace`
- command and args
- captured stdout/stderr for failed attempts

## Where to integrate in agent workflows
1. **Mission Control dispatches**
   - Replace direct `sessions_spawn(...)` calls in automation scripts with shell calls to this wrapper.
2. **Guarded workflows that fan out subagents**
   - Insert this wrapper before mission fan-out stages (e.g., Oracle research, Verifier QA sub-sessions).
3. **Cron/automation runners**
   - Use wrapper output + exit code for alerting and escalation.

Suggested pattern:
```bash
scripts/guarded-run.sh 180 1 1 \
  node scripts/spawn-with-retry.mjs --max-retries 3 -- task:"..." label:"..."
```

## Test command
```bash
bash scripts/tests/test-spawn-with-retry.sh
```

This validates:
- invalid-agent failure path
- backoff timing for 2s/4s/8s retries
- transient failure recovering on retry
- cross-workspace path denial
- per-agent temp dir propagation

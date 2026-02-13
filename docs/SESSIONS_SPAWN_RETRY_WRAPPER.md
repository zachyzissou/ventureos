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

## Usage

### Standard usage (direct wrapper)
```bash
node /Users/zachgonser/clawd/scripts/spawn-with-retry.mjs -- task:"Analyze roadmap" model:"openai-codex/gpt-5.3-codex" label:"oracle-roadmap"
```

### Explicit max retries (include 16s retry)
```bash
node /Users/zachgonser/clawd/scripts/spawn-with-retry.mjs \
  --max-retries 4 \
  -- task:"Draft launch brief" model:"anthropic/claude-sonnet-4-20250514" label:"comms-launch"
```

### Custom log path
```bash
node /Users/zachgonser/clawd/scripts/spawn-with-retry.mjs \
  --log-file /Users/zachgonser/clawd/runtime/logs/sessions-spawn-retry.jsonl \
  -- task:"Build sprint review" label:"producer-sprint-review"
```

## Log format
Default log file:
- `/Users/zachgonser/clawd/runtime/logs/spawn-with-retry.log`

JSONL records include:
- `ts`, `event`, `attempt`, `maxRetries`, `retryNumber`
- `nextBackoffSeconds`, `exitCode`, `durationMs`
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
  node /Users/zachgonser/clawd/scripts/spawn-with-retry.mjs --max-retries 3 -- task:"..." label:"..."
```

## Test command
```bash
bash scripts/tests/test-spawn-with-retry.sh
```

This validates:
- invalid-agent failure path
- backoff timing for 2s/4s/8s retries
- transient failure recovering on retry

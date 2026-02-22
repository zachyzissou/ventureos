# Script Specs

## 1) backup-clawd.sh
**Purpose:** Nightly snapshot of OpenClaw config + memory + state.

**Inputs:**
- `~/.openclaw/openclaw.json`
- `~/.openclaw/cron/jobs.json`
- `~/clawd/memory/`
- `~/clawd/state.json`

**Outputs:**
- `~/backups/clawd/clawd-YYYY-MM-DD.tar.gz`
- checksum `.sha256`
- log entry in `~/clawd/runtime/logs/backups/YYYY-MM-DD.log`

**Success:** archive exists + checksum created.

**Failure modes:** missing files, tar failure, low disk space.

---

## 2) verify-backup.sh
**Purpose:** Validate latest backup integrity.

**Steps:**
1. Find newest backup
2. Verify checksum
3. Test extract (tar -tzf)

**Outputs:** stdout “BACKUP_OK” or error.

---

## 3) restore-backup.sh
**Purpose:** Restore from a backup archive (dry‑run by default).

**Steps:**
1. Locate latest or specified archive
2. Verify checksum
3. Extract to staging directory
4. Dry‑run rsync of target files
5. Apply restore only when `--confirm` is provided (no deletes)

**Outputs:**
- stdout dry‑run diff or `RESTORE_OK`
- no changes unless `--confirm`

---

## 4) monitor-openclaw.sh
**Purpose:** Detect gateway down, auth errors, network timeouts, stale gateway.lock.

**Checks:**
- `openclaw gateway status`
- stale `~/.openclaw/gateway.lock` when gateway is down (mtime > 10 min)
- last 200 lines of `~/.openclaw/logs/gateway.err.log`

**Notes:**
- Script sets an explicit PATH for cron/launchd contexts.
- Auth scan targets explicit auth/network error codes and uses a token word‑boundary pattern to avoid matching “tokens”.
- Explicitly matches “gateway timeout” for real network timeouts.

**Outputs:**
- “P0: gateway_down”
- “P1: stale_gateway_lock (<age>s)”
- “P1: auth_or_timeout_errors”
- state file: `<workspace>/runtime/monitor/<agentId>/state.json`

---

## 5) export-cron-logs.sh
**Purpose:** Aggregate cron run logs into daily JSONL for auditing.

**Inputs:**
- `~/.openclaw/cron/runs/*.jsonl`

**Outputs:**
- `<workspace>/runtime/logs/task_runs/<agentId>/YYYY-MM-DD.jsonl`
- `<workspace>/runtime/logs/task_runs/<agentId>/state.json` (last processed timestamps)

**Fields (canonical):**
- timestamp, job_id, action, status, duration, model, notes

**Notes:**
- Handles JSONL safely; per‑job last‑seen timestamp stored in `state.json`.
- Safe if no run files are present.

**Retention:**
- Keep daily JSONL logs for 30 days
- Archive monthly to `<workspace>/archives/YYYY-MM/task_runs/<agentId>/`

---

## 6) budget-check.sh
**Purpose:** Emit quota usage report using `subscription-quota-tracker.js`.

**Outputs:**
- stdout quota usage report
- Cron job will parse/alert at 50/80/90%

---

## 7) archive-task-runs.sh
**Purpose:** Move old `task_runs` JSONL to monthly archives.

**Inputs:**
- `<workspace>/runtime/logs/task_runs/<agentId>/*.jsonl`

**Outputs:**
- `<workspace>/archives/YYYY-MM/task_runs/<agentId>/`

**Retention:**
- Move files older than 30 days; keep `state.json` in place.

---

## 8) retry.sh
**Purpose:** Retry external commands with exponential backoff.

**Usage:**
```bash
scripts/retry.sh 3 2 <command> <args>
```

**Behavior:**
- Attempt 1 immediately
- Attempt 2 after 2× base
- Attempt 3 after 4× base

**Optional:**
- `RETRY_EXCLUDE_CODES="2 64 65"` → exit immediately on those codes

---

## 9) with-timeout.sh
**Purpose:** Enforce a hard timeout on commands.

**Usage:**
```bash
scripts/with-timeout.sh 30 <command> <args>
```

**Exit codes:**
- `124` on timeout
- Otherwise command exit code

---

## 10) guarded-run.sh
**Purpose:** Standard wrapper for retry + timeout.

**Usage:**
```bash
scripts/guarded-run.sh 60 3 2 <command> <args>
```

**Behavior:**
- Runs repo-local `with-timeout.sh` inside repo-local `retry.sh`
- Use for network/API commands in cron payloads
- No dependency on external shared wrapper paths

---

## 11) spawn-with-retry.mjs
**Purpose:** Wrap `sessions_spawn` with explicit retries and durable failure logs.

**Usage:**
```bash
node scripts/spawn-with-retry.mjs -- task:"Analyze X" model:"openai-codex/gpt-5.3-codex" label:"oracle-x"
```

**Behavior:**
- Calls `sessions_spawn` by default (override with `--spawn-cmd`)
- Retries with exponential backoff (2s, 4s, 8s, 16s)
- Default `--max-retries 3` (2s/4s/8s); `--max-retries 4` enables 16s retry
- Writes JSONL log records to `<workspace>/runtime/logs/spawn-with-retry.log`
- Enforces default-deny for explicit path args outside workspace
- Allows minimal shared script allowlist (`discord-webhook-send.mjs` + critical wrappers)
- Forces per-agent temp dir: `/tmp/agent-<agentId>/`
- Emits clear terminal status (`SPAWN_SUCCESS` / `SPAWN_FAILURE`) and exits with success/failure code

---

## 12) spawn-with-verification.mjs
**Purpose:** Run a plan → dev → verifier workflow with Antfarm-inspired patterns:
- fresh context per step
- explicit verification gate (dev cannot self-approve)
- dev↔verify retry loop
- per-spawn retry with exponential backoff

**Usage:**
```bash
node scripts/spawn-with-verification.mjs \
  --task "Implement feature X" \
  --spawn-cmd sessions_spawn \
  --max-verify-cycles 2 \
  --max-spawn-retries 3
```

**Behavior:**
- Generates step-specific context files under `runDir/context/` and passes them via `--context`
- Captures each step stdout into `runDir/output/*.md`
- Requires verifier output markers: `STATUS: approved` or `STATUS: retry`
- On `STATUS: retry`, carries `ISSUES:` forward into the next dev context and re-runs dev + verify
- Enforces workspace isolation for `--run-dir`, `--log-file`, and explicit `--spawn-cmd` paths

---

## 13) openclaw-local-smoke.sh
**Purpose:** Run a repeatable local OpenClaw integration smoke test and emit evidence artifacts.

**Usage:**
```bash
bash scripts/openclaw-local-smoke.sh \
  --dashboard-url http://127.0.0.1:8001 \
  --token-file dashboard/data/.api-token \
  --report-dir runtime/reports/openclaw-local-smoke
```

**Behavior:**
- Validates required integration surfaces:
  - `/api/health`
  - auth-protected `/api/config`, `/api/services`, `/api/scheduler-jobs`, `/api/agent-health`
  - `/api/live-telemetry` SSE handshake
- Optionally checks `/map/` and direct bridge scheduler endpoint.
- Supports profiles:
  - `quick`: required checks + SSE only
  - `full`: default full check set
  - `bridge`: full check set with bridge severity escalated to `critical-optional`
- Direct bridge auth precedence:
  - `--bridge-token-file`
  - `BRIDGE_TOKEN`
  - `BRIDGE_TOKEN_FILE`
  - default OpenClaw token file (`$OPENCLAW_DIR/bridge/bridge-token`)
- Built-in transient retry behavior:
  - Retries HTTP `429` responses (dashboard + bridge checks) using `Retry-After` when present.
  - Retry controls: `SMOKE_HTTP_RETRY_MAX` (default `2`), `SMOKE_HTTP_RETRY_BASE_SEC` (default `1`), `SMOKE_HTTP_RETRY_MAX_DELAY_SEC` (default `15`).
- Gateway status check requires a healthy runtime signal (`RPC probe: ok` or `Listening:`) to pass.
- Emits timestamped JSON + markdown + SVG reports to `runtime/reports/openclaw-local-smoke/`.
- JSON summary includes `verdict`, `readinessScore`, `confidence`; each check includes `group`, `severity`, `likelyCause`, and `nextCommand`.
- Exits with code `2` when any required check fails.

**Regression test:**
```bash
bash scripts/tests/test-openclaw-local-smoke.sh
```

---

## 14) refresh-local-integration-ready.sh
**Purpose:** Run local OpenClaw smoke and regenerate `docs/LOCAL_INTEGRATION_READY.md` from the newest artifact.

**Usage:**
```bash
bash scripts/refresh-local-integration-ready.sh \
  --dashboard-url http://127.0.0.1:8001 \
  --token-file dashboard/data/.api-token \
  --report-dir runtime/reports/openclaw-local-smoke
```

**Behavior:**
- Runs `scripts/openclaw-local-smoke.sh` (unless `--skip-smoke` is set).
- Enforces strict latest JSON/MD/SVG timestamp pairing.
- Validates required smoke JSON schema before rendering readiness markdown.
- Supports `--history-limit <n>` to control trend rows in the output.
- Supports `--prune-keep <n>` to retain only newest `n` timestamp groups after refresh.
- Rewrites readiness summary markdown with:
  - mission control card (`GO/HOLD/BLOCKED`, score, confidence)
  - top blockers and next commands
  - trend table from the latest N paired runs
  - latest artifact references (JSON/MD/SVG)
- Preserves smoke exit status when smoke is executed.

**Regression test:**
```bash
bash scripts/tests/test-refresh-local-integration-ready.sh
```

---

## 15) openclaw-local-ready-cron.sh
**Purpose:** Cron-safe wrapper around readiness refresh with deterministic retention defaults.

**Usage:**
```bash
bash scripts/openclaw-local-ready-cron.sh
```

**Behavior:**
- Invokes `scripts/refresh-local-integration-ready.sh`.
- Applies defaults optimized for unattended cadence:
  - `--history-limit 7`
  - `--prune-keep 14`
  - `--profile full`
- Allows env overrides:
  - `OPENCLAW_LOCAL_READY_HISTORY_LIMIT`
  - `OPENCLAW_LOCAL_READY_PRUNE_KEEP`
  - `OPENCLAW_LOCAL_READY_PROFILE` (`quick|full|bridge`)
- Validates env inputs and exits `2` on invalid values before running refresh.
- Forwards any additional CLI flags to the underlying refresh script (last flag wins).

**Regression test:**
```bash
bash scripts/tests/test-openclaw-local-ready-cron.sh
```

**Current next steps (operator rollout):**
1. `bash scripts/install-cron.sh --force`
2. `bash scripts/openclaw-local-ready-cron.sh`
3. Validate `docs/LOCAL_INTEGRATION_READY.md` timestamp and `runtime/reports/openclaw-local-smoke/` artifact rotation.

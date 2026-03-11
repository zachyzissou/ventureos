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
**Purpose:** Emit quota usage report using `subscription-quota-tracker.js`, with OpenClaw usage fallback when tracker is unavailable.

**Outputs:**
- stdout quota usage report
- Cron job will parse/alert at 50/80/90%

**Behavior:**
- Uses `SUBSCRIPTION_TRACKER_PATH` override when set.
- If tracker is missing, falls back to `openclaw channels list --json` and emits normalized JSON.
- Supports `OPENCLAW_BIN` override for non-default CLI path.

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
  --dashboard-url http://127.0.0.1:7000 \
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
  - Retry controls: `SMOKE_HTTP_RETRY_MAX` (default `2`), `SMOKE_HTTP_RETRY_BASE_SEC` (default `1`), `SMOKE_HTTP_RETRY_MAX_DELAY_SEC` (default `60`).
- Gateway status check requires a healthy runtime signal (`RPC probe: ok` or `Listening:`) to pass.
- Detects non-dashboard target collisions on `/api/health` (for example AirTunes on port `7000`) and emits explicit root-cause detail instead of generic auth failure noise.
- If `dashboard-health` fails, dependent dashboard API checks are marked `skipped` to keep blocker output actionable.
- When the target serves OpenClaw Control HTML instead of VentureOS JSON APIs, smoke switches to OpenClaw CLI-backed checks (`gateway health`, `cron list`, `gateway probe`) for required readiness surfaces.
- Emits timestamped JSON + markdown + SVG reports to `runtime/reports/openclaw-local-smoke/`.
- Uses canonical dashboard URL resolution policy:
  - `--dashboard-url`
  - `OPENCLAW_LOCAL_READY_DASHBOARD_URL`
  - `DASHBOARD_URL` (legacy)
  - auto-discovered `openclaw dashboard --no-open` URL (unless `OPENCLAW_LOCAL_READY_AUTO_DISCOVER=0|false|no|off`)
  - fallback `http://127.0.0.1:${DASHBOARD_PORT:-7000}`
- Token guardrails:
  - validates `.api-token` format
  - auto-repairs safe malformed states with explicit logging
  - falls back to tokenized OpenClaw dashboard URL when token file is missing/malformed and origins match
  - emits non-secret auth diagnostics (`tokenSource`, `tokenHealth`, `tokenRepairAction`)
- JSON summary includes `verdict`, `readinessScore`, `confidence`, `dashboardSurface`, and `requiredCheckStatusMap`; each check includes `group`, `severity`, `likelyCause`, and `nextCommand`.
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
  --dashboard-url http://127.0.0.1:7000 \
  --token-file dashboard/data/.api-token \
  --report-dir runtime/reports/openclaw-local-smoke
```

**Behavior:**
- Runs `scripts/openclaw-local-smoke.sh` (unless `--skip-smoke` is set).
- Applies canonical dashboard URL policy when `--dashboard-url` is not provided.
- Enforces strict latest JSON/MD/SVG timestamp pairing.
- Validates required smoke JSON schema before rendering readiness markdown.
- Supports `--history-limit <n>` to control trend rows in the output.
- Supports `--prune-keep <n>` to retain only newest `n` timestamp groups after refresh.
- Supports `--max-age-min <n>` stale guardrail checks against the latest paired artifact timestamp.
- Rewrites readiness summary markdown with:
  - mission control card (`GO/HOLD/BLOCKED`, score, confidence)
  - top blockers and next commands
  - trend table from the latest N paired runs
  - latest artifact references (JSON/MD/SVG + latest status summary paths)
- Emits rolling operator status artifacts:
  - `runtime/reports/openclaw-local-smoke/openclaw-local-ready-latest.json`
  - `runtime/reports/openclaw-local-smoke/openclaw-local-ready-latest.md`
- Preserves smoke exit status when smoke is executed.
- Returns non-zero (`3`) when stale guardrail is enabled and violated.

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
  - `--max-age-min 360`
  - `--profile full`
- Allows env overrides:
  - `OPENCLAW_LOCAL_READY_HISTORY_LIMIT`
  - `OPENCLAW_LOCAL_READY_PRUNE_KEEP`
  - `OPENCLAW_LOCAL_READY_MAX_AGE_MIN`
  - `OPENCLAW_LOCAL_READY_PROFILE` (`quick|full|bridge`)
  - `OPENCLAW_LOCAL_READY_DASHBOARD_URL` (must start with `http://` or `https://`)
  - `OPENCLAW_LOCAL_READY_AUTO_DISCOVER` (`0|false|no|off` disables OpenClaw URL auto-discovery)
- Validates env inputs and exits `2` on invalid values before running refresh.
- Forwards any additional CLI flags to the underlying refresh script (last flag wins).
- Managed cron installation now resolves and persists the local readiness dashboard URL at install time (`scripts/install-cron.sh`) rather than hardcoding port `7000`.

**Regression test:**
```bash
bash scripts/tests/test-openclaw-local-ready-cron.sh
```

---

## 15a) openclaw-local-ready-cadence.sh
**Purpose:** Generate an issue/PR-ready local readiness cadence evidence bundle from latest readiness artifacts.

**Usage:**
```bash
bash scripts/openclaw-local-ready-cadence.sh
```

**Behavior:**
- Runs status-only readiness refresh by default:
  - `refresh-local-integration-ready.sh --skip-smoke --max-age-min <threshold>`
- Emits timestamped cadence report artifacts:
  - `runtime/reports/openclaw-local-smoke/openclaw-local-ready-cadence-<timestamp>.json`
  - `runtime/reports/openclaw-local-smoke/openclaw-local-ready-cadence-<timestamp>.md`
  - rolling latest copies:
    - `openclaw-local-ready-cadence-latest.json`
    - `openclaw-local-ready-cadence-latest.md`
- Cadence artifacts include:
  - consolidated status (`ok|alert|stale`)
  - stale guardrail verdict and exit semantics
  - latest smoke/readiness artifact references (evidence bundle)
  - top blockers (up to 3) and deduplicated next-command guidance
- Exit behavior:
  - `0`: cadence status `ok`
  - `3`: stale guardrail violation
  - `4`: readiness status `alert` (non-stale)
  - `2`: invalid inputs or missing required status artifact
- Supports:
  - `--report-dir <path>`
  - `--max-age-min <n>`
  - `--skip-refresh` (read existing latest status without running refresh)

**Regression test:**
```bash
bash scripts/tests/test-openclaw-local-ready-cadence.sh
```

---

## 16) vb003-watchdog.sh
**Purpose:** Validate VB-003 telemetry freshness and recent cron health while 7-day evidence accumulates.

**Usage:**
```bash
bash scripts/vb003-watchdog.sh
```

**Behavior:**
- Reads latest synthesis artifact:
  - `runtime/reports/model-orchestration/vb003-telemetry-latest.json`
- Checks freshness (`VB003_WATCHDOG_MAX_TELEMETRY_AGE_MINUTES`, default `480`).
- Evaluates recent cron health window (`VB003_WATCHDOG_LOOKBACK_MINUTES`, default `360`) across:
  - `budget-check`
  - `routing-healthcheck`
  - `monitoring`
- Applies active alert gating on a short window (`VB003_WATCHDOG_ALERT_WINDOW_MINUTES`, default `90`):
  - flags when a job has all-fail behavior in the active window
  - flags when a job has high active-window failure rate (`>=2` failures and `>=50%` fail rate)
- Applies per-job start staleness thresholds to avoid false positives on lower-frequency jobs:
  - `budget-check`: stale if no start for >30h
  - `routing-healthcheck`: stale if no start for >90m
  - `monitoring`: stale if no start for >45m
- Emits timestamped + latest watchdog artifacts:
  - `runtime/reports/model-orchestration/vb003-watchdog-<timestamp>.json`
  - `runtime/reports/model-orchestration/vb003-watchdog-<timestamp>.md`
  - `runtime/reports/model-orchestration/vb003-watchdog-latest.json`
  - `runtime/reports/model-orchestration/vb003-watchdog-latest.md`
- Returns non-zero when freshness or recent-failure checks detect degraded state.

**Config env vars:**
- `VB003_WATCHDOG_REPORT_DIR`
- `VB003_TELEMETRY_LATEST_JSON`
- `VB003_CRON_RUN_DIR`
- `VB003_TARGET_HOURS` (default `168`)
- `VB003_WATCHDOG_LOOKBACK_MINUTES` (default `360`)
- `VB003_WATCHDOG_ALERT_WINDOW_MINUTES` (default `90`)
- `VB003_WATCHDOG_MAX_TELEMETRY_AGE_MINUTES` (default `480`)

---

## 17) vb003-telemetry-synthesis.sh
**Purpose:** Generate a rolling telemetry synthesis artifact for VB-003 model-orchestration verification.

**Usage:**
```bash
bash scripts/vb003-telemetry-synthesis.sh
```

**Behavior:**
- Reads run telemetry from `~/.openclaw/cron/runs/*.jsonl`.
- Applies a lookback window (default: `168h`, configurable via `VB003_LOOKBACK_HOURS`).
- Aggregates model/runtime metrics:
  - run counts and status counts
  - latency distribution (`p50`, `p95`)
  - token totals
  - model/provider mix
- Aggregates VentureOS cron metrics for:
  - `budget-check`
  - `routing-healthcheck`
  - `monitoring`
- Includes latest budget snapshot payload (if present) from `~/.openclaw/logs/cron-budget.log`.
- Writes timestamped artifacts plus latest pointers:
  - `runtime/reports/model-orchestration/vb003-telemetry-<timestamp>.json`
  - `runtime/reports/model-orchestration/vb003-telemetry-<timestamp>.md`
  - `runtime/reports/model-orchestration/vb003-telemetry-latest.json`
  - `runtime/reports/model-orchestration/vb003-telemetry-latest.md`
- Emits a verification state:
  - `no_data`
  - `window_insufficient`
  - `ready_for_closure_review`

**Cron integration:**
- Wired as `vb003-telemetry-synthesis` in `config/reliability.json`.
- Scheduled every 6 hours via `scripts/install-cron.sh`.

**Current next steps (operator rollout):**
1. `bash scripts/install-cron.sh --force`
2. `bash scripts/vb003-telemetry-synthesis.sh`
3. Validate `runtime/reports/model-orchestration/vb003-telemetry-latest.{json,md}`.
4. Validate `docs/LOCAL_INTEGRATION_READY.md` timestamp and `runtime/reports/openclaw-local-smoke/` artifact rotation.

---

## 18) install-bridge-launchagent.sh
**Purpose:** Install/manage a persistent macOS LaunchAgent for the host Bridge API.

**Usage:**
```bash
bash scripts/install-bridge-launchagent.sh
```

**Behavior:**
- Renders `~/Library/LaunchAgents/com.ventureos.bridge.plist` (default label).
- Starts bridge via `launchctl bootstrap` + `kickstart`.
- Sources bridge runtime config from `config/bridge.env`.
- Supports:
  - `--status` (launchctl + health visibility)
  - `--uninstall` (bootout + plist removal)
  - `--print-only` (render without launchctl calls)
  - path overrides for repo root/env/entry/plist/label.
- Requires compiled bridge entry at `dashboard/dist/dashboard/server/bridge.js`.

**Regression test:**
```bash
bash scripts/tests/test-install-bridge-launchagent.sh
```

---

## 19) ventureos-install.sh
**Purpose:** Unified OpenClaw-style installer + onboarding wrapper for local VentureOS setup.

**Usage:**
```bash
bash scripts/ventureos-install.sh
```

Non-interactive example:
```bash
bash scripts/ventureos-install.sh --non-interactive --profile bridge
```

Verification-focused example:
```bash
bash scripts/ventureos-install.sh --non-interactive --verify --preset full
```

Rollback example:
```bash
bash scripts/ventureos-install.sh --revert runtime/backups/ventureos-install/<restore-point-id>
```

**Behavior:**
- Coordinates existing install primitives in one flow:
  - dashboard installer (`dashboard/scripts/install-macos.sh` or `dashboard/scripts/install.sh`)
  - bridge LaunchAgent installer (`scripts/install-bridge-launchagent.sh`, macOS)
  - cron installer (`scripts/install-cron.sh`)
  - readiness refresh (`scripts/refresh-local-integration-ready.sh`)
- Reads current local state (OpenClaw directory, bridge env, dashboard health, cron marker) before apply and surfaces that in onboarding/plan output.
- Generates a deterministic integration adoption plan before apply, classifying targets as `adopt|merge|create|skip` (dashboard service, bridge auth/env, launchagent, cron surfaces, OpenClaw runtime config files, readiness artifact).
- Interactive TTY mode uses staged onboarding sections with guided recommendations (for example: adopt existing healthy dashboard, skip bridge when bridge env is missing) before executing changes.
- Interactive mode emits explicit phase banners (`[Phase x/6]`) and `RUN/PASS/FAIL` step lines with elapsed seconds so operators can follow live execution progress without losing auditability.
- Interactive mode requires explicit action-matrix confirmation after the `adopt|merge|create|skip` plan is rendered; declining exits cleanly with `VENTUREOS_INSTALL_RESULT=CANCELLED` before preflight/apply mutations.
- Captures a pre-install restore point by default under `runtime/backups/ventureos-install/<restore-point-id>/`:
  - user crontab snapshot
  - bridge env snapshot
  - OpenClaw config snapshots (`openclaw.json`, `cron/jobs.json`, Discord webhook map)
  - macOS bridge LaunchAgent plist snapshot (when applicable)
- Validates restore-point manifest integrity before apply (required backup payloads + crontab backup presence).
- Supports interactive onboarding prompts (default on TTY) and non-interactive mode (`--non-interactive`).
- Supports dry-run planning (`--dry-run`) to print execution plan without changes.
- Supports compatibility rehearsal mode (`--preflight-only`) to:
  - generate adoption plan + compatibility matrix
  - capture/validate restore-point safety artifacts
  - skip all installer apply steps while emitting deterministic next commands
- Supports post-install verification mode (`--verify`) across dashboard health, bridge status, cron marker, and readiness status summary artifact.
- Supports installation presets (`--preset full|bridge|minimal`) with explicit `--skip-*`/`--profile` overrides.
- Allows selective skips (`--skip-*`) and readiness profile selection (`--profile quick|full|bridge`).
- Supports restore-point operations:
  - `--list-restore-points`
  - `--revert <restore-point-dir-or-manifest>`
  - `--restore-base-dir <path>`
  - `--no-restore-point` (explicitly disables snapshot safety capture)
- Writes timestamped install reports to `runtime/reports/ventureos-install/`.
- Writes timestamped adoption evidence artifacts to `runtime/reports/ventureos-install/ventureos-install-adoption-<timestamp>.json` with before/after non-secret fingerprints + changed-target list + rollback command reference.
- Writes timestamped onboarding transcript artifacts to `runtime/reports/ventureos-install/ventureos-onboarding-<timestamp>.md` (decision summary, discovery snapshot, action matrix, rollback metadata).
- Install report includes:
  - per-step `Next Command` column
  - `Integration Adoption Plan` section
  - `Compatibility Rehearsal` section with pass/fail status per target
  - `Config Change Evidence` section
  - `Failed Steps` section for operator follow-up
- Successful installs emit `VENTUREOS_INSTALL_RESTORE_POINT=<path>` for deterministic rollback reference.

**Regression test:**
```bash
bash scripts/tests/test-ventureos-install.sh
```

---

## 19a) run-install-preflight-evidence.sh
**Purpose:** Run the required local-host installer `--preflight-only` flow and emit a deterministic evidence bundle for onboarding/install execution changes.

**Usage:**
```bash
bash scripts/run-install-preflight-evidence.sh
```

Forward installer args:
```bash
bash scripts/run-install-preflight-evidence.sh \
  -- --openclaw-dir "$HOME/.openclaw" \
  --bridge-env "$PWD/config/bridge.env"
```

**Behavior:**
- Executes:
  - `bash scripts/ventureos-install.sh --non-interactive --preflight-only --verify`
  - plus any forwarded installer args.
- Captures installer stdout/stderr log at:
  - `runtime/reports/ventureos-install/ventureos-install-preflight-<timestamp>.log`
- Records required evidence references in:
  - `ventureos-install-preflight-evidence-<timestamp>.json`
  - `ventureos-install-preflight-evidence-<timestamp>.md`
  - rolling latest aliases:
    - `ventureos-install-preflight-evidence-latest.json`
    - `ventureos-install-preflight-evidence-latest.md`
- Evidence bundle includes:
  - command invocation
  - install exit/result markers
  - installer report path
  - adoption evidence path
  - onboarding transcript path
  - readiness status JSON reference + existence flag
- Exits with the underlying installer exit code so CI/operator flows can gate on failures.

**Regression test:**
```bash
bash scripts/tests/test-run-install-preflight-evidence.sh
```

---

## 20) pr-queue-sweep.sh
**Purpose:** Classify open GitHub PR queue state and optionally merge approved+ready PRs.

**Usage:**
```bash
bash scripts/pr-queue-sweep.sh
```

Dry-run merge simulation:
```bash
bash scripts/pr-queue-sweep.sh --merge-approved --dry-run
```

Queue status report output:
```bash
bash scripts/pr-queue-sweep.sh --json-out runtime/reports/pr-queue/queue-latest.json
```

**Behavior:**
- Reads open PRs from `gh pr list` and classifies each as:
  - `draft`
  - `review-needed`
  - `approved-merge-ready`
  - `approved-blocked`
- Prints queue summary + per-PR rows.
- Emits machine-readable status marker:
  - `PR_QUEUE_STATUS=empty|quiet|review-needed|blocked|merge-ready`
- Optionally writes JSON report with `--json-out <path>`.
- Supports `--report-dir <path>` to store merge-evidence artifacts.
- Optional merge mode (`--merge-approved`) now:
  - captures readiness evidence for each merge candidate via:
    - `scripts/pr-merge-readiness.sh --json-out ...`
    - `scripts/required-check-contexts.sh --json-out ...`
  - skips candidates with non-ready evidence status
  - merges only candidates with both checks ready/aligned
  - emits `PR_QUEUE_MERGE_EXECUTION_STATUS=ready-executed|blocked|no-candidates`
- Supports deterministic fixture mode for tests via `PR_QUEUE_FIXTURE_JSON`.
  - Readiness/required-check scripts can be overridden for tests via:
    - `PR_QUEUE_READINESS_SCRIPT`
    - `PR_QUEUE_REQUIRED_CHECKS_SCRIPT`

**Regression test:**
```bash
bash scripts/tests/test-pr-queue-sweep.sh
```

---

## 20a) pr-merge-readiness.sh
**Purpose:** Evaluate merge readiness for a specific PR and emit exact blockers + next action.

**Usage:**
```bash
bash scripts/pr-merge-readiness.sh --pr 483
```

JSON report output:
```bash
bash scripts/pr-merge-readiness.sh --pr 483 --json-out runtime/reports/pr-merge-readiness/pr-483.json
```

**Behavior:**
- Reads a specific PR from `gh pr view`.
- Evaluates merge blockers from:
  - PR state / draft status
  - review decision (`APPROVED` vs approval required)
  - status checks (pending/failing)
  - GitHub merge state when all other signals appear clear
- Prints a human-readable summary:
  - merge status (`merge-ready|blocked`)
  - blocker list with `next` commands
  - recommended next action
- Emits machine-readable status marker:
  - `PR_MERGE_READINESS_STATUS=merge-ready|blocked`
- Exit behavior:
  - `0`: merge-ready
  - `3`: blocked
  - `2`: invalid inputs
- Supports deterministic fixture mode for tests via `PR_MERGE_READINESS_FIXTURE_JSON`.

**Regression test:**
```bash
bash scripts/tests/test-pr-merge-readiness.sh
```

---

## 20b) required-check-contexts.sh
**Purpose:** Audit required branch-protection check contexts against actual statuses/check-runs on a PR head commit.

**Usage:**
```bash
bash scripts/required-check-contexts.sh --pr 485
```

JSON report output:
```bash
bash scripts/required-check-contexts.sh --pr 485 --json-out runtime/reports/pr-required-checks/pr-485.json
```

**Behavior:**
- Reads required status contexts from branch protection on the PR base branch.
- Reads commit status contexts + check-run names from the PR head SHA.
- Produces per-context classification:
  - `pass`
  - `pending`
  - `fail`
  - `missing`
- Emits machine-readable status marker:
  - `REQUIRED_CHECK_CONTEXT_STATUS=aligned-ready|aligned-not-ready|missing-contexts`
- Exit behavior:
  - `0`: all required contexts present and successful
  - `3`: one or more required contexts are missing (alignment drift)
  - `4`: contexts aligned but at least one is pending/failing
  - `2`: invalid input
- Supports deterministic fixture mode for tests via:
  - `PR_HEAD_FIXTURE_JSON`
  - `REQUIRED_CHECKS_FIXTURE_JSON`
  - `COMMIT_STATUS_FIXTURE_JSON`
  - `CHECK_RUNS_FIXTURE_JSON`

**Regression test:**
```bash
bash scripts/tests/test-required-check-contexts.sh
```

---

## 21) roadmap-status-sync.py
**Purpose:** Detect status drift between `README.md` active work and roadmap anchor issue `#138`.

**Usage:**
```bash
python3 scripts/roadmap-status-sync.py
```

Fixture/test mode:
```bash
python3 scripts/roadmap-status-sync.py \
  --readme /tmp/README.md \
  --roadmap-body-file /tmp/issue-138.md \
  --issues-json /tmp/issues.json
```

**Behavior:**
- Enforces authoritative mapping rules:
  - `README.md` section `### Now (active)` issue IDs must match issue `#138` section `## Now (Active)` issue IDs.
  - Active `Now` issue IDs must all be `OPEN`.
  - `README.md` must reference issue `#138`.
- Prints a structured report including:
  - `readme_now_ids`
  - `roadmap_now_ids`
  - `only_in_readme_now`
  - `only_in_roadmap_now`
  - `now_not_open`
  - `missing_issue_rows`
- Exits non-zero when drift is detected (`ROADMAP_STATUS_SYNC_FAIL`).

**Regression test:**
```bash
bash scripts/tests/test-roadmap-status-sync.sh
```

---

## 22) docs-lint.py
**Purpose:** Lint core documentation links/placeholders while minimizing false positives in instructional prose.

**Usage:**
```bash
python3 scripts/docs-lint.py
```

**Behavior:**
- Scans:
  - `docs/*.md`
  - `docs/templates/*.md`
  - `README.md`
- Validates:
  - relative markdown links resolve to existing files
  - unresolved placeholders (`TODO`, `TBD`, `FIXME`, `???`) are flagged
  - JSON templates in `docs/templates/*.json` parse successfully
- False-positive tuning:
  - ignores placeholder tokens inside inline code spans
  - ignores placeholder tokens inside fenced code blocks (``` / ~~~)
  - ignores instructional inline literal mentions like `TODO:` in prose

**Regression test:**
```bash
python3 -m unittest scripts/tests/test_docs_lint.py
```

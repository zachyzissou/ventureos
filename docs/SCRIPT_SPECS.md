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

---

## 5) export-cron-logs.sh
**Purpose:** Aggregate cron run logs into daily JSONL for auditing.

**Inputs:**
- `~/.openclaw/cron/runs/*.jsonl`

**Outputs:**
- `~/clawd/runtime/logs/task_runs/YYYY-MM-DD.jsonl`
- `~/clawd/runtime/logs/task_runs/state.json` (last processed timestamps)

**Fields (canonical):**
- timestamp, job_id, action, status, duration, model, notes

**Notes:**
- Handles JSONL safely; per‑job last‑seen timestamp stored in `state.json`.
- Safe if no run files are present.

**Retention:**
- Keep daily JSONL logs for 30 days
- Archive monthly to `~/clawd/archives/YYYY-MM/task_runs/`

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
- `~/clawd/runtime/logs/task_runs/*.jsonl`

**Outputs:**
- `~/clawd/archives/YYYY-MM/task_runs/`

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
- Runs `with-timeout.sh` inside `retry.sh`
- Use for network/API commands in cron payloads

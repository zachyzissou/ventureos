# OpenClaw Upgrade – Implementation‑Ready Design (Defaults Locked)

**Status:** Design complete. **Partial implementation applied** (policy docs split, monitoring enhancements, restore workflow, backup coverage).

This doc is the *implementation‑ready* package: final decisions, file changes, scripts, cron job specs, runbooks, verification, and rollback. Once approved, we can execute the plan exactly as written.

---

## 0) Defaults Locked (Per “Use Defaults”)

**Time zone:** America/Chicago

### Proactive window
- **Active:** 08:00–23:00 CST
- **Quiet hours:** 23:00–08:00 CST (alerts only for P0)

### Budget policy
- **Alert thresholds:** 50% / 80% / 90%
- **Behavior at 90%:** default to cheap model unless strong model explicitly required
- **Caps (policy defaults):**
  - Anthropic: **10,000 points/month** (per `subscription-quota-tracker.js`)
  - OpenAI Codex: **50 msgs / 3h window** (soft cap; alert at 80%+)
  - Gemini: **100 queries/day** (soft cap; alert at 80%+)

### Backups
- **Destination:** `~/backups/clawd/`
- **Retention:** 30 days
- **Verification:** weekly checksum + test extract

### Updates
- **Window:** Sunday 03:00–04:00 CST
- **Policy:** reminder only; updates require explicit approval

### Alerts
- **Channel:** Discord DM (user)

---

## 1) File Changes (Design Targets)

### New policy docs (root of workspace)
- `GOALS_CONSTRAINTS.md`
- `GUARDRAILS.md`
- `PROACTIVE_MODE.md`
- `MODEL_STRATEGY.md`
- `BUDGET_POLICY.md`
- `OPS_RUNBOOK.md`

### New scripts (workspace/scripts)
- `scripts/backup-clawd.sh`
- `scripts/verify-backup.sh`
- `scripts/restore-backup.sh`
- `scripts/monitor-openclaw.sh`
- `scripts/export-cron-logs.sh`
- `scripts/budget-check.sh`

### New runtime dirs
- `runtime/logs/task_runs/`
- `runtime/logs/backups/`
- `runtime/monitor/state.json`

### Templates (repo only)
- `docs/templates/AGENTS.json`
- `docs/templates/HEARTBEAT.md`

### Modified files
- `AGENTS.md` (link to new policy docs)
- `HEARTBEAT.md` (reference monitoring + backups + budget checks)

---

## 2) Policy Docs – Ready‑to‑Apply Content

These policies are now separate files in this repo (authoritative source). During implementation, copy them to the workspace root (`~/clawd/`) and link from AGENTS.md + HEARTBEAT.md.

- [GOALS_CONSTRAINTS.md](GOALS_CONSTRAINTS.md)
- [GUARDRAILS.md](GUARDRAILS.md)
- [PROACTIVE_MODE.md](PROACTIVE_MODE.md)
- [MODEL_STRATEGY.md](MODEL_STRATEGY.md)
- [BUDGET_POLICY.md](BUDGET_POLICY.md)
- [OPS_RUNBOOK.md](OPS_RUNBOOK.md)

---

## 3) Scripts – Ready‑to‑Apply

### `scripts/backup-clawd.sh`
```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="$HOME/backups/clawd"
DATE=$(date +%Y-%m-%d)
ARCHIVE="$BACKUP_DIR/clawd-$DATE.tar.gz"
LOG_DIR="$HOME/clawd/runtime/logs/backups"
LOG_FILE="$LOG_DIR/$DATE.log"

mkdir -p "$BACKUP_DIR" "$LOG_DIR"

# Create archive
/usr/bin/tar -czf "$ARCHIVE" \
  "$HOME/.openclaw/openclaw.json" \
  "$HOME/.openclaw/cron/jobs.json" \
  "$HOME/clawd/memory" \
  "$HOME/clawd/state.json" \
  2>>"$LOG_FILE"

# Checksum
/usr/bin/shasum -a 256 "$ARCHIVE" > "$ARCHIVE.sha256"

# Retention (30 days)
find "$BACKUP_DIR" -name 'clawd-*.tar.gz' -mtime +30 -delete
find "$BACKUP_DIR" -name 'clawd-*.tar.gz.sha256' -mtime +30 -delete

echo "[$(date)] Backup complete: $ARCHIVE" >> "$LOG_FILE"
```

### `scripts/verify-backup.sh`
```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="$HOME/backups/clawd"
LATEST=$(ls -t "$BACKUP_DIR"/clawd-*.tar.gz 2>/dev/null | head -n 1)

if [[ -z "$LATEST" ]]; then
  echo "NO_BACKUP_FOUND"; exit 1
fi

# Verify checksum
/usr/bin/shasum -a 256 -c "$LATEST.sha256"

# Test extract
/usr/bin/tar -tzf "$LATEST" >/dev/null

echo "BACKUP_OK: $LATEST"
```

### `scripts/restore-backup.sh`
```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="$HOME/backups/clawd"
ARCHIVE=""
CONFIRM=false

usage() {
  cat <<'USAGE'
Usage: restore-backup.sh [--archive PATH] [--confirm]

Restores OpenClaw backup contents from a tar.gz created by backup-clawd.sh.
- Default is DRY RUN (no changes).
- Use --confirm to apply restore.

Options:
  --archive PATH   Use a specific backup archive (default: latest)
  --confirm        Apply restore (otherwise dry-run)
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --archive)
      ARCHIVE="$2"; shift 2 ;;
    --confirm)
      CONFIRM=true; shift ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown arg: $1"; usage; exit 1 ;;
  esac
done

if [[ -z "$ARCHIVE" ]]; then
  ARCHIVE=$(ls -t "$BACKUP_DIR"/clawd-*.tar.gz 2>/dev/null | head -n 1 || true)
fi

if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "NO_BACKUP_FOUND"; exit 1
fi

if [[ ! -f "$ARCHIVE.sha256" ]]; then
  echo "CHECKSUM_MISSING: $ARCHIVE.sha256"; exit 1
fi

/usr/bin/shasum -a 256 -c "$ARCHIVE.sha256"

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

/usr/bin/tar -xzf "$ARCHIVE" -C "$STAGE"

# Locate extracted home directory
if [[ -d "$STAGE$HOME" ]]; then
  SRC="$STAGE$HOME"
elif [[ -d "$STAGE/Users/$(whoami)" ]]; then
  SRC="$STAGE/Users/$(whoami)"
else
  echo "STAGING_PATH_NOT_FOUND"; exit 1
fi

echo "Staged backup at: $SRC"

# Dry-run by default
if [[ "$CONFIRM" != "true" ]]; then
  echo "DRY_RUN_ONLY (no changes). Re-run with --confirm to apply."
  rsync -av --dry-run "$SRC/.openclaw/openclaw.json" "$HOME/.openclaw/openclaw.json"
  rsync -av --dry-run "$SRC/.openclaw/cron/jobs.json" "$HOME/.openclaw/cron/jobs.json"
  rsync -av --dry-run "$SRC/clawd/memory/" "$HOME/clawd/memory/"
  rsync -av --dry-run "$SRC/clawd/state.json" "$HOME/clawd/state.json"
  exit 0
fi

mkdir -p "$HOME/.openclaw/cron" "$HOME/clawd"

rsync -av "$SRC/.openclaw/openclaw.json" "$HOME/.openclaw/openclaw.json"
rsync -av "$SRC/.openclaw/cron/jobs.json" "$HOME/.openclaw/cron/jobs.json"
rsync -av "$SRC/clawd/memory/" "$HOME/clawd/memory/"
rsync -av "$SRC/clawd/state.json" "$HOME/clawd/state.json"

echo "RESTORE_OK: $ARCHIVE"
```

### `scripts/monitor-openclaw.sh`
```bash
#!/usr/bin/env bash
set -euo pipefail

STATE="$HOME/clawd/runtime/monitor/state.json"
LOG_ERR="$HOME/.openclaw/logs/gateway.err.log"
LOCK="$HOME/.openclaw/gateway.lock"

mkdir -p "$(dirname "$STATE")"
[[ -f "$STATE" ]] || echo '{"last_check":0}' > "$STATE"

NOW=$(date +%s)
ISSUES=()
GATEWAY_OK=true

# Gateway status
if ! openclaw gateway status >/dev/null 2>&1; then
  GATEWAY_OK=false
  ISSUES+=("P0: gateway_down")
fi

# Stale gateway.lock (only meaningful if gateway is down)
if [[ "$GATEWAY_OK" == "false" && -f "$LOCK" ]]; then
  MTIME=""
  if MTIME=$(stat -f %m "$LOCK" 2>/dev/null); then
    :
  elif MTIME=$(stat -c %Y "$LOCK" 2>/dev/null); then
    :
  else
    MTIME=""
  fi
  if [[ -n "$MTIME" ]]; then
    AGE=$((NOW - MTIME))
    if (( AGE > 600 )); then
      ISSUES+=("P1: stale_gateway_lock (${AGE}s)")
    fi
  fi
fi

# Auth/timeout scan (last 200 lines)
if [[ -f "$LOG_ERR" ]]; then
  if tail -n 200 "$LOG_ERR" | egrep -i 'auth|unauth|401|token|timeout|ETIMEDOUT|ECONNRESET' >/dev/null; then
    ISSUES+=("P1: auth_or_timeout_errors")
  fi
fi

jq ".last_check=$NOW" "$STATE" > "$STATE.tmp" && mv "$STATE.tmp" "$STATE"

if [[ ${#ISSUES[@]} -eq 0 ]]; then
  echo "HEARTBEAT_OK"
else
  printf '%s\n' "${ISSUES[@]}"
fi
```

### `scripts/export-cron-logs.sh`
```bash
#!/usr/bin/env bash
set -euo pipefail

STATE="$HOME/clawd/runtime/logs/task_runs/state.json"
OUT_DIR="$HOME/clawd/runtime/logs/task_runs"
DATE=$(date +%Y-%m-%d)
OUT_FILE="$OUT_DIR/$DATE.jsonl"

mkdir -p "$OUT_DIR"
[[ -f "$STATE" ]] || echo '{}' > "$STATE"

for file in "$HOME/.openclaw/cron/runs"/*.jsonl; do
  JOB=$(basename "$file" .jsonl)
  LAST=$(jq -r --arg j "$JOB" '.[$j] // 0' "$STATE")
  jq -c --argjson last "$LAST" 'select(.ts > $last) | {timestamp:.ts, job_id:.jobId, status:.status, summary:.summary, duration_ms:.durationMs}' "$file" >> "$OUT_FILE" || true
  # update last ts
  NEW_LAST=$(jq -r 'last(.ts) // 0' "$file")
  jq --arg j "$JOB" --argjson v "$NEW_LAST" '.[$j]=$v' "$STATE" > "$STATE.tmp" && mv "$STATE.tmp" "$STATE"
  
done
```

### `scripts/budget-check.sh`
```bash
#!/usr/bin/env bash
set -euo pipefail

node "$HOME/clawd/subscription-quota-tracker.js" report
# (Parsing + alerting will be handled by the cron job agent wrapper)
```

---

## 4) Cron Job Specs (OpenClaw)

> These are **definitions only**. They should be added via `cron add` after approval.

### Nightly Backup
- **Schedule:** `0 2 * * *`
- **Payload:** run `scripts/backup-clawd.sh`

### Weekly Backup Verify
- **Schedule:** `30 2 * * 0`
- **Payload:** run `scripts/verify-backup.sh` and alert if fail

### Monitoring (Crash/Auth/Timeout)
- **Schedule:** `*/15 * * * *`
- **Payload:** run `scripts/monitor-openclaw.sh` and alert on P0/P1

### Budget Check
- **Schedule:** `0 9 * * *`
- **Payload:** run `scripts/budget-check.sh`; alert at 50/80/90%

### Export Cron Logs
- **Schedule:** `*/30 * * * *`
- **Payload:** run `scripts/export-cron-logs.sh`

### Update Window Reminder
- **Schedule:** `0 3 * * 0`
- **Payload:** systemEvent reminder: “Update window open; reply ‘run update’ to proceed.”

---

## 5) Task Queue (Recurring Jobs by Tier)

**Urgent:**
- Monitoring (crash/auth/timeout)
- Backup verify

**Normal:**
- Morning Briefing
- Bloom CI Watch
- Fact Extraction
- Budget checks

**Low:**
- Unity Tool Scout
- Weekly Digest
- Weekly Memory Synthesis

**Queue Store:** `runtime/task-queue.json` (metadata only)

---

## 6) Verification Checklist

- [ ] Backups created and checksum verified
- [ ] Monitoring detects simulated auth error
- [ ] Budget alerts trigger at thresholds
- [ ] Cron log export populates daily jsonl
- [ ] Update reminder posted at window

---

## 7) Rollback Plan

- Remove added cron jobs via `cron remove`
- Delete scripts from `~/clawd/scripts/`
- Restore from latest backup archive if needed
- Revert `AGENTS.md` / `HEARTBEAT.md`

---

## 8) Next Step (Awaiting Approval)
Once you approve, I will:
1. Create the policy docs + scripts
2. Add cron jobs
3. Update AGENTS/HEARTBEAT references
4. Run first backup + verification

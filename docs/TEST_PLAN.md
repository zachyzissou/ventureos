# Test Plan

## Pre‑flight
- Confirm `bird` and `gh` auth status (if used by jobs)
- Confirm `openclaw gateway status` is healthy
- Confirm backup destination exists and has free space

## Script Tests
1. **Backup** – run `scripts/backup-clawd.sh` manually
   - Expect archive + checksum + log entry
2. **Verify** – run `scripts/verify-backup.sh`
   - Expect “BACKUP_OK”
3. **Restore (dry‑run)** – run `scripts/restore-backup.sh`
   - Expect dry‑run output, no changes
4. **Monitor** – run `scripts/monitor-openclaw.sh`
   - Expect no errors on healthy system
5. **Cron Export** – run `scripts/export-cron-logs.sh`
   - Expect JSONL created in `runtime/logs/task_runs/`
6. **Budget Check** – run `scripts/budget-check.sh`
   - Expect report output
7. **Archive Task Runs** – run `scripts/archive-task-runs.sh`
   - Expect older JSONL moved to `archives/YYYY-MM/task_runs/`

## Cron Tests
- Force run backup job via `cron run` to validate wiring
- Force run monitor job to validate alerts

## Alert Tests
- Simulate auth error by writing a test string to gateway.err.log (optional)
- Simulate stale lock: create `~/.openclaw/gateway.lock` with old mtime and stop gateway; expect P1 stale_gateway_lock
- Verify Discord alert in SlurpNet alerts channel

## Rollback Test
- Remove cron jobs
- Delete scripts
- Restore previous state from latest backup

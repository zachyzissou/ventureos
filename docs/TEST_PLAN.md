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
3. **Monitor** – run `scripts/monitor-openclaw.sh`
   - Expect no errors on healthy system
4. **Cron Export** – run `scripts/export-cron-logs.sh`
   - Expect JSONL created in `runtime/logs/task_runs/`
5. **Budget Check** – run `scripts/budget-check.sh`
   - Expect report output

## Cron Tests
- Force run backup job via `cron run` to validate wiring
- Force run monitor job to validate alerts

## Alert Tests
- Simulate auth error by writing a test string to gateway.err.log (optional)
- Verify Discord DM alert

## Rollback Test
- Remove cron jobs
- Delete scripts
- Restore previous state from latest backup

# Test Results – 2026-02-07

Generated: 2026-02-07 18:24:54Z

## Backup
Command: /Users/zachgonser/clawd/scripts/backup-clawd.sh

```

```
Exit: 0

## Verify Backup
Command: /Users/zachgonser/clawd/scripts/verify-backup.sh

```
/Users/zachgonser/backups/clawd/clawd-2026-02-07.tar.gz: OK
BACKUP_OK: /Users/zachgonser/backups/clawd/clawd-2026-02-07.tar.gz
```
Exit: 0

## Restore (dry-run)
Command: /Users/zachgonser/clawd/scripts/restore-backup.sh

```
/Users/zachgonser/backups/clawd/clawd-2026-02-07.tar.gz: OK
Staged backup at: /var/folders/26/w1hj_mdj527bbhy5tyx8ks400000gn/T/tmp.mu65A2pMpg/Users/zachgonser
DRY_RUN_ONLY (no changes). Re-run with --confirm to apply.
Transfer starting: 1 files
openclaw.json

sent 98 bytes  received 26 bytes  1240000 bytes/sec
total size is 8111  speedup is 65.41
Transfer starting: 1 files
jobs.json

sent 94 bytes  received 26 bytes  1200000 bytes/sec
total size is 36826  speedup is 306.88
Transfer starting: 264 files

sent 14530 bytes  received 20 bytes  13227272 bytes/sec
total size is 107958329  speedup is 7419.82
Transfer starting: 1 files
state.json

sent 95 bytes  received 26 bytes  1210000 bytes/sec
total size is 719  speedup is 5.94
```
Exit: 0

## Monitor
Command: /Users/zachgonser/clawd/scripts/monitor-openclaw.sh

```
HEARTBEAT_OK
```
Exit: 0

## Export Cron Logs
Command: /Users/zachgonser/clawd/scripts/export-cron-logs.sh

```

```
Exit: 0

## Budget Check
Command: /Users/zachgonser/clawd/scripts/budget-check.sh

```
HEARTBEAT_OK
```
Exit: 0

## Archive Task Runs
Command: /Users/zachgonser/clawd/scripts/archive-task-runs.sh

```
ARCHIVE_OK: /Users/zachgonser/clawd/archives/2026-02/task_runs
```
Exit: 0


---

## Deployment Verification (scripts sync + schema) — 2026-02-07 15:09 CST

### Export Cron Logs (schema check)
Command: /Users/zachgonser/clawd/scripts/export-cron-logs.sh

File: /Users/zachgonser/clawd/runtime/logs/task_runs/2026-02-07.jsonl

Sample line:
```
{"timestamp": 1770497660448, "job_id": "0b64b476-5e47-4d0a-ad4c-5b873623de91", "action": "finished", "status": "ok", "duration": 7594, "model": null, "notes": "HEARTBEAT_OK"}
```
Exit: 0

### Backup + Verify
Command: /Users/zachgonser/clawd/scripts/backup-clawd.sh
Command: /Users/zachgonser/clawd/scripts/verify-backup.sh

```
BACKUP_OK: /Users/zachgonser/backups/clawd/clawd-2026-02-07.tar.gz
```
Exit: 0

### Cron List
Command: openclaw cron list

```
Error: gateway timeout after 30000ms
Gateway target: ws://127.0.0.1:18789
```
Exit: 1

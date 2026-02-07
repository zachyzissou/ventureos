# Cron Specs

> All jobs are **deterministic** (no wake‑only execution) for reliability.

## 1) Nightly Backup
- **Schedule:** `0 2 * * *`
- **Session:** isolated
- **Payload:** run `scripts/backup-clawd.sh`
- **Alert:** only on failure

## 2) Weekly Backup Verify
- **Schedule:** `30 2 * * 0`
- **Session:** isolated
- **Payload:** run `scripts/verify-backup.sh`
- **Alert:** on failure

## 3) Monitoring (Crash/Auth/Timeout)
- **Schedule:** `*/15 * * * *`
- **Session:** isolated
- **Payload:** run `scripts/monitor-openclaw.sh`
- **Alert:** P0 immediate, P1 within 1 hour

## 4) Budget Check
- **Schedule:** `0 9 * * *`
- **Session:** isolated
- **Payload:** run `scripts/budget-check.sh`
- **Alert thresholds:** 50/80/90%

## 5) Export Cron Logs
- **Schedule:** `*/30 * * * *`
- **Session:** isolated
- **Payload:** run `scripts/export-cron-logs.sh`

## 6) Update Window Reminder
- **Schedule:** `0 3 * * 0`
- **Session:** main (systemEvent)
- **Payload:** “Update window open; reply ‘run update’ to proceed.”

## 7) Archive Task Run Logs
- **Schedule:** `0 3 1 * *` (monthly)
- **Session:** isolated
- **Payload:** run `scripts/archive-task-runs.sh`

## 8) Fact Extraction (Entity Store)
- **Schedule:** `*/30 * * * *`
- **Session:** isolated
- **Payload:** agentTurn “Fact Extraction (Three‑Layer Memory)”
- **Output:** HEARTBEAT_OK when no new facts

## 9) Weekly Memory Synthesis
- **Schedule:** `0 9 * * 0`
- **Session:** isolated
- **Payload:** agentTurn “Weekly Memory Synthesis (Three‑Layer)”

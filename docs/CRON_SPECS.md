# Cron Specs

> All jobs are **deterministic** (no wake-only execution) for reliability.

## 1) Nightly Backup
- **Schedule:** `0 2 * * *`
- **Session:** isolated
- **Payload:** run `scripts/backup-clawd.sh`
- **Alert:** only on failure

> **Standard guard:** For network/API calls in cron payloads use:
> `scripts/guarded-run.sh <timeout> 3 2 <command> <args>`

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
- **Payload:** "Update window open; reply 'run update' to proceed."

## 7) Archive Task Run Logs
- **Schedule:** `0 3 1 * *` (monthly)
- **Session:** isolated
- **Payload:** run `scripts/archive-task-runs.sh`

## 8) Fact Extraction (Entity Store)
- **Schedule:** `*/30 * * * *`
- **Session:** isolated
- **Payload:** agentTurn "Fact Extraction (Three-Layer Memory)"
- **Output:** HEARTBEAT_OK when no new facts

## 9) Weekly Memory Synthesis
- **Schedule:** `0 9 * * 0`
- **Session:** isolated
- **Payload:** agentTurn "Weekly Memory Synthesis (Three‑Layer)"

## 10) Workspace Health Check (P0 #34)
- **Schedule:** `0 3 * * *`
- **Session:** isolated
- **Agent:** atlas
- **Payload:** run `scripts/check-workspace-health.sh --alert --quarantine`
- **Alert:** if any workspace > 500MB or DB files > 10MB found
- **Added:** 2026-02-15

## 11) Phantom Session Detector (P0 #34)
- **Schedule:** `*/30 * * * *`
- **Session:** isolated
- **Agent:** atlas
- **Payload:** run `scripts/detect-phantom-sessions.sh --alert`
- **Alert:** if phantom sessions or unhealthy workspaces detected
- **Added:** 2026-02-15

## 12) OpenClaw Local Readiness Refresh
- **Schedule:** `15 */4 * * *`
- **Session:** isolated
- **Agent:** nexus
- **Payload:** run `scripts/openclaw-local-ready-cron.sh`
- **Dashboard URL in managed cron:** resolved at install time via `openclaw_local_resolve_dashboard_url` (honors `OPENCLAW_LOCAL_READY_DASHBOARD_URL`, then `DASHBOARD_URL`, then auto-discovered `openclaw dashboard --no-open` URL, then `DASHBOARD_PORT`; disable discovery with `OPENCLAW_LOCAL_READY_AUTO_DISCOVER=0`)
- **Output:** refreshed `docs/LOCAL_INTEGRATION_READY.md` and paired JSON/MD/SVG artifacts
- **Status artifact:** `runtime/reports/openclaw-local-smoke/openclaw-local-ready-latest.json`
- **Retention:** defaults to keep newest 14 artifact sets (configurable via env)
- **Stale guardrail:** defaults to `--max-age-min 360`; job fails when latest paired report is older
- **Added:** 2026-02-22

## 13) VB-003 Telemetry Synthesis
- **Schedule:** `30 */6 * * *`
- **Session:** isolated
- **Agent:** main
- **Payload:** run `scripts/vb003-telemetry-synthesis.sh`
- **Outputs:**
  - `runtime/reports/model-orchestration/vb003-telemetry-<timestamp>.json`
  - `runtime/reports/model-orchestration/vb003-telemetry-<timestamp>.md`
  - `runtime/reports/model-orchestration/vb003-telemetry-latest.json`
  - `runtime/reports/model-orchestration/vb003-telemetry-latest.md`
- **Goal:** maintain a rolling 7-day evidence trail for VB-003 closure decisions.
- **Added:** 2026-02-22

## 14) VB-003 Watchdog
- **Schedule:** `45 */3 * * *`
- **Session:** isolated
- **Agent:** main
- **Payload:** run `scripts/vb003-watchdog.sh`
- **Outputs:**
  - `runtime/reports/model-orchestration/vb003-watchdog-<timestamp>.json`
  - `runtime/reports/model-orchestration/vb003-watchdog-<timestamp>.md`
  - `runtime/reports/model-orchestration/vb003-watchdog-latest.json`
  - `runtime/reports/model-orchestration/vb003-watchdog-latest.md`
- **Goal:** detect telemetry staleness or short-window job regressions while VB-003 7-day evidence accrues.
- **Added:** 2026-02-22

## Current Next Steps (February 23, 2026)
1. Roll this schedule onto the host with `bash scripts/install-cron.sh --force`.
2. Validate first run via `runtime/logs/cron-runs/vb003-telemetry-synthesis.jsonl`.
3. Validate latest synthesis artifacts under `runtime/reports/model-orchestration/`.
4. Validate watchdog run via `runtime/logs/cron-runs/vb003-watchdog.jsonl` and latest watchdog artifacts.
5. Confirm `docs/LOCAL_INTEGRATION_READY.md` and Mission Control readiness card continue moving on cadence.

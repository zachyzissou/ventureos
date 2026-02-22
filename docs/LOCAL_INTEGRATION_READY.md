# Local Integration Ready Checklist

Date: 2026-02-22 (UTC)
Owner: automated refresh via `scripts/refresh-local-integration-ready.sh`

## Mission Control Card
- Verdict: `GO`
- Readiness score: `100`
- Confidence: `high`
- Profile: `full`
- Required failures: `0`
- Required skipped: `0`
- Warnings: `0`

## Latest Evidence Artifacts
- JSON: `runtime/reports/openclaw-local-smoke/openclaw-local-smoke-20260222T212745Z.json`
- Markdown: `runtime/reports/openclaw-local-smoke/openclaw-local-smoke-20260222T212745Z.md`
- Status strip SVG: `runtime/reports/openclaw-local-smoke/openclaw-local-smoke-20260222T212745Z.svg`

## Top 3 Blockers
- No blockers in latest run.

## Trend (Last 7 Runs)
| Timestamp | Verdict | Score | Required Failures | Warnings | Bridge |
|---|---|---:|---:|---:|---|
| `20260222T205446Z` | `GO` | 100 | 0 | 0 | `pass` |
| `20260222T205623Z` | `BLOCKED` | 63 | 3 | 1 | `fail` |
| `20260222T205731Z` | `HOLD` | 92 | 0 | 1 | `fail` |
| `20260222T205733Z` | `GO` | 100 | 0 | 0 | `pass` |
| `20260222T211046Z` | `GO` | 93 | 0 | 1 | `fail` |
| `20260222T211244Z` | `GO` | 93 | 0 | 1 | `fail` |
| `20260222T212745Z` | `GO` | 100 | 0 | 0 | `pass` |

## Required Checks
- [x] `openclaw-cli` — `pass` group=`core` severity=`critical` (openclaw CLI found)
- [x] `openclaw-gateway-status` — `pass` group=`core` severity=`critical` (Service: LaunchAgent (not loaded))
- [x] `dashboard-token` — `pass` group=`core` severity=`critical` (dashboard token loaded from token file)
- [x] `dashboard-health` — `pass` group=`apis` severity=`critical` (health endpoint reachable)
- [x] `dashboard-config-auth` — `pass` group=`apis` severity=`critical` (authenticated config access ok)
- [x] `dashboard-services` — `pass` group=`apis` severity=`critical` (services endpoint returned required service rows)
- [x] `dashboard-scheduler-jobs` — `pass` group=`apis` severity=`critical` (scheduler jobs endpoint reachable)
- [x] `dashboard-agent-health` — `pass` group=`apis` severity=`critical` (agent health endpoint reachable)
- [x] `dashboard-live-telemetry-sse` — `pass` group=`realtime` severity=`critical` (SSE handshake ok)

## Optional Checks
- [x] `dashboard-map-route` — `pass` group=`apis` severity=`info` (map route reachable)
- [x] `bridge-scheduler-jobs` — `pass` group=`bridge` severity=`warn` (bridge scheduler endpoint reachable)

## Bridge Token Setup Note
- Direct bridge checks support `--bridge-token-file`, `BRIDGE_TOKEN`, `BRIDGE_TOKEN_FILE`, or default `OPENCLAW_DIR/bridge/bridge-token`.
- Latest bridge check: `pass: bridge scheduler endpoint reachable`

## Current Next Steps
1. Install or refresh managed cron entries: `bash scripts/install-cron.sh --force`
2. Run one manual cadence cycle and verify artifact generation: `bash scripts/openclaw-local-ready-cron.sh`
3. Keep cadence running and monitor trend score/confidence for regressions.
4. Confirm Mission Control shows the latest readiness payload from `/api/openclaw-local-readiness`.

## Refresh Command
```bash
bash scripts/refresh-local-integration-ready.sh
```

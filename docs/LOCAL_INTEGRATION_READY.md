# Local Integration Ready Checklist

Date: 2026-02-24 (UTC)
Owner: automated refresh via `scripts/refresh-local-integration-ready.sh`

## Mission Control Card
- Verdict: `BLOCKED`
- Readiness score: `30`
- Confidence: `low`
- Profile: `quick`
- Dashboard URL: `http://127.0.0.1:7000`
- Token source: `token-file`
- Token health: `ok`
- Token repair action: `none`
- Required failures: `1`
- Required skipped: `5`
- Warnings: `0`

## Latest Evidence Artifacts
- JSON: `runtime/reports/openclaw-local-smoke/openclaw-local-smoke-20260224T193634Z.json`
- Markdown: `runtime/reports/openclaw-local-smoke/openclaw-local-smoke-20260224T193634Z.md`
- Status strip SVG: `runtime/reports/openclaw-local-smoke/openclaw-local-smoke-20260224T193634Z.svg`
- Status summary JSON: `runtime/reports/openclaw-local-smoke/openclaw-local-ready-latest.json`
- Status summary Markdown: `runtime/reports/openclaw-local-smoke/openclaw-local-ready-latest.md`

## Top 3 Blockers
- `dashboard-health` owner=`Dashboard Ops`; cause: Dashboard URL points to a different local service (port collision or stale URL).; next: `export OPENCLAW_LOCAL_READY_DASHBOARD_URL=http://127.0.0.1:<dashboard-port> && bash scripts/openclaw-local-smoke.sh --profile quick`

## Required Check Status Map
- `dashboard-agent-health`: `skipped`
- `dashboard-config-auth`: `skipped`
- `dashboard-health`: `fail`
- `dashboard-live-telemetry-sse`: `skipped`
- `dashboard-scheduler-jobs`: `skipped`
- `dashboard-services`: `skipped`
- `dashboard-token`: `pass`
- `openclaw-cli`: `pass`
- `openclaw-gateway-status`: `pass`

## Trend (Last 7 Runs)
| Timestamp | Verdict | Score | Required Failures | Warnings | Bridge |
|---|---|---:|---:|---:|---|
| `20260223T221510Z` | `BLOCKED` | 30 | 6 | 2 | `fail` |
| `20260224T021511Z` | `BLOCKED` | 30 | 6 | 2 | `fail` |
| `20260224T061509Z` | `BLOCKED` | 30 | 6 | 2 | `fail` |
| `20260224T101509Z` | `BLOCKED` | 30 | 6 | 2 | `fail` |
| `20260224T141509Z` | `BLOCKED` | 30 | 6 | 2 | `fail` |
| `20260224T181509Z` | `BLOCKED` | 30 | 6 | 2 | `fail` |
| `20260224T193634Z` | `BLOCKED` | 30 | 1 | 0 | `skipped` |

## Required Checks
- [x] `openclaw-cli` — `pass` group=`core` severity=`critical` (openclaw CLI found)
- [x] `openclaw-gateway-status` — `pass` group=`core` severity=`critical` (Service: LaunchAgent (loaded))
- [x] `dashboard-token` — `pass` group=`core` severity=`critical` (dashboard token loaded from token file)
- [ ] `dashboard-health` — `fail` group=`apis` severity=`critical` (non-dashboard target detected (server: AirTunes/935.7.1, status: 403)); cause: Dashboard URL points to a different local service (port collision or stale URL).; next: `export OPENCLAW_LOCAL_READY_DASHBOARD_URL=http://127.0.0.1:<dashboard-port> && bash scripts/openclaw-local-smoke.sh --profile quick`
- [-] `dashboard-config-auth` — `skipped` group=`apis` severity=`critical` (skipped due to dashboard-health failure)
- [-] `dashboard-services` — `skipped` group=`apis` severity=`critical` (skipped due to dashboard-health failure)
- [-] `dashboard-scheduler-jobs` — `skipped` group=`apis` severity=`critical` (skipped due to dashboard-health failure)
- [-] `dashboard-agent-health` — `skipped` group=`apis` severity=`critical` (skipped due to dashboard-health failure)
- [-] `dashboard-live-telemetry-sse` — `skipped` group=`realtime` severity=`critical` (skipped due to dashboard-health failure)

## Optional Checks
- [-] `dashboard-map-route` — `skipped` group=`apis` severity=`info` (skipped due to dashboard-health failure)
- [-] `bridge-scheduler-jobs` — `skipped` group=`bridge` severity=`warn` (skipped by profile/flag)

## Bridge Token Setup Note
- Direct bridge checks support `--bridge-token-file`, `BRIDGE_TOKEN`, `BRIDGE_TOKEN_FILE`, or default `OPENCLAW_DIR/bridge/bridge-token`.
- Latest bridge check: `skipped: skipped by profile/flag`

## Current Next Steps
1. Install or refresh managed cron entries: `bash scripts/install-cron.sh --force`
2. Run one manual cadence cycle and verify artifact generation: `bash scripts/openclaw-local-ready-cron.sh`
3. Resolve required check failures before relying on automated readiness cadence.
4. Confirm Mission Control shows the latest readiness payload from `/api/openclaw-local-readiness`.

## Refresh Command
```bash
bash scripts/refresh-local-integration-ready.sh
```

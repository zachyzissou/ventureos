# Local Integration Ready Checklist

Date: 2026-02-24 (UTC)
Owner: automated refresh via `scripts/refresh-local-integration-ready.sh`

## Mission Control Card
- Verdict: `GO`
- Readiness score: `90`
- Confidence: `high`
- Profile: `quick`
- Dashboard URL: `http://127.0.0.1:18789/`
- Token source: `token-file`
- Token health: `ok`
- Token repair action: `none`
- Required failures: `0`
- Required skipped: `0`
- Warnings: `0`

## Latest Evidence Artifacts
- JSON: `runtime/reports/openclaw-local-smoke/openclaw-local-smoke-20260224T201555Z.json`
- Markdown: `runtime/reports/openclaw-local-smoke/openclaw-local-smoke-20260224T201555Z.md`
- Status strip SVG: `runtime/reports/openclaw-local-smoke/openclaw-local-smoke-20260224T201555Z.svg`
- Status summary JSON: `runtime/reports/openclaw-local-smoke/openclaw-local-ready-latest.json`
- Status summary Markdown: `runtime/reports/openclaw-local-smoke/openclaw-local-ready-latest.md`

## Top 3 Blockers
- No blockers in latest run.

## Required Check Status Map
- `dashboard-agent-health`: `pass`
- `dashboard-config-auth`: `pass`
- `dashboard-health`: `pass`
- `dashboard-live-telemetry-sse`: `pass`
- `dashboard-scheduler-jobs`: `pass`
- `dashboard-services`: `pass`
- `dashboard-token`: `pass`
- `openclaw-cli`: `pass`
- `openclaw-gateway-status`: `pass`

## Trend (Last 7 Runs)
| Timestamp | Verdict | Score | Required Failures | Warnings | Bridge |
|---|---|---:|---:|---:|---|
| `20260224T061509Z` | `BLOCKED` | 30 | 6 | 2 | `fail` |
| `20260224T101509Z` | `BLOCKED` | 30 | 6 | 2 | `fail` |
| `20260224T141509Z` | `BLOCKED` | 30 | 6 | 2 | `fail` |
| `20260224T181509Z` | `BLOCKED` | 30 | 6 | 2 | `fail` |
| `20260224T193634Z` | `BLOCKED` | 30 | 1 | 0 | `skipped` |
| `20260224T194228Z` | `BLOCKED` | 30 | 1 | 0 | `skipped` |
| `20260224T201555Z` | `GO` | 90 | 0 | 0 | `skipped` |

## Required Checks
- [x] `openclaw-cli` — `pass` group=`core` severity=`critical` (openclaw CLI found)
- [x] `openclaw-gateway-status` — `pass` group=`core` severity=`critical` (Service: LaunchAgent (loaded))
- [x] `dashboard-token` — `pass` group=`core` severity=`critical` (dashboard token loaded from token file)
- [x] `dashboard-health` — `pass` group=`apis` severity=`critical` (openclaw control surface detected; gateway health ok via CLI)
- [x] `dashboard-config-auth` — `pass` group=`apis` severity=`critical` (openclaw dashboard URL/token discovery ok)
- [x] `dashboard-services` — `pass` group=`apis` severity=`critical` (openclaw gateway channels summary reachable via CLI)
- [x] `dashboard-scheduler-jobs` — `pass` group=`apis` severity=`critical` (openclaw cron jobs list reachable via CLI)
- [x] `dashboard-agent-health` — `pass` group=`apis` severity=`critical` (openclaw agent summary reachable via CLI)
- [x] `dashboard-live-telemetry-sse` — `pass` group=`realtime` severity=`critical` (openclaw gateway probe connect target ok)

## Optional Checks
- [-] `dashboard-map-route` — `skipped` group=`apis` severity=`info` (skipped by profile/flag)
- [-] `bridge-scheduler-jobs` — `skipped` group=`bridge` severity=`warn` (skipped by profile/flag)

## Bridge Token Setup Note
- Direct bridge checks support `--bridge-token-file`, `BRIDGE_TOKEN`, `BRIDGE_TOKEN_FILE`, or default `OPENCLAW_DIR/bridge/bridge-token`.
- Latest bridge check: `skipped: skipped by profile/flag`

## Current Next Steps
1. Install or refresh managed cron entries: `bash scripts/install-cron.sh --force`
2. Run one manual cadence cycle and verify artifact generation: `bash scripts/openclaw-local-ready-cron.sh`
3. Keep cadence running and monitor trend score/confidence for regressions.
4. Confirm Mission Control shows the latest readiness payload from `/api/openclaw-local-readiness`.

## Refresh Command
```bash
bash scripts/refresh-local-integration-ready.sh
```

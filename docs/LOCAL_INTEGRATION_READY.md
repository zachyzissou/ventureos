# Local Integration Ready Checklist

Date: 2026-02-22 (UTC)
Owner: automated refresh via `scripts/refresh-local-integration-ready.sh`

## Mission Control Card
- Verdict: `GO`
- Readiness score: `93`
- Confidence: `medium`
- Profile: `full`
- Required failures: `0`
- Required skipped: `0`
- Warnings: `1`

## Latest Evidence Artifacts
- JSON: `runtime/reports/openclaw-local-smoke/openclaw-local-smoke-20260222T054949Z.json`
- Markdown: `runtime/reports/openclaw-local-smoke/openclaw-local-smoke-20260222T054949Z.md`
- Status strip SVG: `runtime/reports/openclaw-local-smoke/openclaw-local-smoke-20260222T054949Z.svg`

## Top 3 Blockers
- `bridge-scheduler-jobs` owner=`Bridge Ops`; cause: Bridge token/source is not configured or bridge API is unreachable.; next: `export BRIDGE_TOKEN_FILE=~/.openclaw/bridge/bridge-token && bash scripts/openclaw-local-smoke.sh --profile bridge`

## Trend (Last 7 Runs)
| Timestamp | Verdict | Score | Required Failures | Warnings | Bridge |
|---|---|---:|---:|---:|---|
| `20260222T051821Z` | `UNKNOWN` | n/a | 6 | 2 | `fail` |
| `20260222T051907Z` | `UNKNOWN` | n/a | 6 | 1 | `skipped` |
| `20260222T051943Z` | `UNKNOWN` | n/a | 0 | 1 | `fail` |
| `20260222T052026Z` | `UNKNOWN` | n/a | 0 | 1 | `fail` |
| `20260222T053133Z` | `UNKNOWN` | n/a | 0 | 1 | `fail` |
| `20260222T053305Z` | `UNKNOWN` | n/a | 0 | 1 | `fail` |
| `20260222T054949Z` | `GO` | 93 | 0 | 1 | `fail` |

## Required Checks
- [x] `openclaw-cli` — `pass` group=`core` severity=`critical` (openclaw CLI found)
- [x] `openclaw-gateway-status` — `pass` group=`core` severity=`critical` (Service: LaunchAgent (loaded))
- [x] `dashboard-token` — `pass` group=`core` severity=`critical` (dashboard token loaded from token file)
- [x] `dashboard-health` — `pass` group=`apis` severity=`critical` (health endpoint reachable)
- [x] `dashboard-config-auth` — `pass` group=`apis` severity=`critical` (authenticated config access ok)
- [x] `dashboard-services` — `pass` group=`apis` severity=`critical` (services endpoint returned required service rows)
- [x] `dashboard-scheduler-jobs` — `pass` group=`apis` severity=`critical` (scheduler jobs endpoint reachable)
- [x] `dashboard-agent-health` — `pass` group=`apis` severity=`critical` (agent health endpoint reachable)
- [x] `dashboard-live-telemetry-sse` — `pass` group=`realtime` severity=`critical` (SSE handshake ok)

## Optional Checks
- [x] `dashboard-map-route` — `pass` group=`apis` severity=`info` (map route reachable)
- [ ] `bridge-scheduler-jobs` — `fail` group=`bridge` severity=`warn` (Missing BRIDGE_TOKEN (set env, BRIDGE_TOKEN_FILE, or default OpenClaw bridge token file)); cause: Bridge token/source is not configured or bridge API is unreachable.; next: `export BRIDGE_TOKEN_FILE=~/.openclaw/bridge/bridge-token && bash scripts/openclaw-local-smoke.sh --profile bridge`

## Bridge Token Setup Note
- Direct bridge checks support `--bridge-token-file`, `BRIDGE_TOKEN`, `BRIDGE_TOKEN_FILE`, or default `OPENCLAW_DIR/bridge/bridge-token`.
- Latest bridge check: `fail: Missing BRIDGE_TOKEN (set env, BRIDGE_TOKEN_FILE, or default OpenClaw bridge token file)`

## Refresh Command
```bash
bash scripts/refresh-local-integration-ready.sh
```

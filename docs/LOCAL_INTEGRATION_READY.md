# Local Integration Ready Checklist

Date: 2026-02-23 (UTC)
Owner: automated refresh via `scripts/refresh-local-integration-ready.sh`

## Mission Control Card
- Verdict: `BLOCKED`
- Readiness score: `30`
- Confidence: `low`
- Profile: `full`
- Dashboard URL: `http://127.0.0.1:7000`
- Token source: `token-file`
- Token health: `ok`
- Token repair action: `none`
- Required failures: `6`
- Required skipped: `0`
- Warnings: `2`

## Latest Evidence Artifacts
- JSON: `runtime/reports/openclaw-local-smoke/openclaw-local-smoke-20260223T221510Z.json`
- Markdown: `runtime/reports/openclaw-local-smoke/openclaw-local-smoke-20260223T221510Z.md`
- Status strip SVG: `runtime/reports/openclaw-local-smoke/openclaw-local-smoke-20260223T221510Z.svg`
- Status summary JSON: `runtime/reports/openclaw-local-smoke/openclaw-local-ready-latest.json`
- Status summary Markdown: `runtime/reports/openclaw-local-smoke/openclaw-local-ready-latest.md`

## Top 3 Blockers
- `dashboard-agent-health` owner=`Dashboard Ops`; cause: Agent health endpoint is unavailable or response format changed.; next: `curl -sS -H 'Authorization: Bearer <token>' http://127.0.0.1:7000/api/agent-health`
- `dashboard-config-auth` owner=`Dashboard Ops`; cause: Dashboard auth token is invalid or auth middleware blocked access.; next: `curl -sS -H 'Authorization: Bearer <token>' http://127.0.0.1:7000/api/config`
- `dashboard-health` owner=`Dashboard Ops`; cause: Dashboard process is not healthy or not reachable.; next: `curl -sS http://127.0.0.1:7000/api/health`

## Required Check Status Map
- `dashboard-agent-health`: `fail`
- `dashboard-config-auth`: `fail`
- `dashboard-health`: `fail`
- `dashboard-live-telemetry-sse`: `fail`
- `dashboard-scheduler-jobs`: `fail`
- `dashboard-services`: `fail`
- `dashboard-token`: `pass`
- `openclaw-cli`: `pass`
- `openclaw-gateway-status`: `pass`

## Trend (Last 7 Runs)
| Timestamp | Verdict | Score | Required Failures | Warnings | Bridge |
|---|---|---:|---:|---:|---|
| `20260223T064406Z` | `GO` | 100 | 0 | 0 | `pass` |
| `20260223T065224Z` | `GO` | 100 | 0 | 0 | `pass` |
| `20260223T070058Z` | `GO` | 100 | 0 | 0 | `pass` |
| `20260223T101512Z` | `GO` | 100 | 0 | 0 | `pass` |
| `20260223T141510Z` | `GO` | 100 | 0 | 0 | `pass` |
| `20260223T181511Z` | `GO` | 100 | 0 | 0 | `pass` |
| `20260223T221510Z` | `BLOCKED` | 30 | 6 | 2 | `fail` |

## Required Checks
- [x] `openclaw-cli` — `pass` group=`core` severity=`critical` (openclaw CLI found)
- [x] `openclaw-gateway-status` — `pass` group=`core` severity=`critical` (Service: LaunchAgent (loaded))
- [x] `dashboard-token` — `pass` group=`core` severity=`critical` (dashboard token loaded from token file)
- [ ] `dashboard-health` — `fail` group=`apis` severity=`critical` (expected 200, got 403); cause: Dashboard process is not healthy or not reachable.; next: `curl -sS http://127.0.0.1:7000/api/health`
- [ ] `dashboard-config-auth` — `fail` group=`apis` severity=`critical` (expected 200, got 403); cause: Dashboard auth token is invalid or auth middleware blocked access.; next: `curl -sS -H 'Authorization: Bearer <token>' http://127.0.0.1:7000/api/config`
- [ ] `dashboard-services` — `fail` group=`apis` severity=`critical` (expected 200, got 403); cause: Service aggregation is incomplete or API contract changed.; next: `curl -sS -H 'Authorization: Bearer <token>' http://127.0.0.1:7000/api/services`
- [ ] `dashboard-scheduler-jobs` — `fail` group=`apis` severity=`critical` (expected 200, got 403); cause: Scheduler jobs API is unavailable or returning invalid payload.; next: `curl -sS -H 'Authorization: Bearer <token>' http://127.0.0.1:7000/api/scheduler-jobs`
- [ ] `dashboard-agent-health` — `fail` group=`apis` severity=`critical` (expected 200, got 403); cause: Agent health endpoint is unavailable or response format changed.; next: `curl -sS -H 'Authorization: Bearer <token>' http://127.0.0.1:7000/api/agent-health`
- [ ] `dashboard-live-telemetry-sse` — `fail` group=`realtime` severity=`critical` (missing SSE 200/text-event-stream headers); cause: SSE channel is blocked or headers are incorrect.; next: `curl -N -H 'Authorization: Bearer <token>' http://127.0.0.1:7000/api/live-telemetry`

## Optional Checks
- [ ] `dashboard-map-route` — `fail` group=`apis` severity=`info` (expected 200, got 403); cause: Map route assets or auth path is misconfigured.; next: `curl -I -H 'Authorization: Bearer <token>' http://127.0.0.1:7000/map/`
- [ ] `bridge-scheduler-jobs` — `fail` group=`bridge` severity=`warn` (bridge request failed); cause: Bridge token/source is not configured or bridge API is unreachable.; next: `export BRIDGE_TOKEN_FILE=~/.openclaw/bridge/bridge-token && bash scripts/openclaw-local-smoke.sh --profile bridge`

## Bridge Token Setup Note
- Direct bridge checks support `--bridge-token-file`, `BRIDGE_TOKEN`, `BRIDGE_TOKEN_FILE`, or default `OPENCLAW_DIR/bridge/bridge-token`.
- Latest bridge check: `fail: bridge request failed`

## Current Next Steps
1. Install or refresh managed cron entries: `bash scripts/install-cron.sh --force`
2. Run one manual cadence cycle and verify artifact generation: `bash scripts/openclaw-local-ready-cron.sh`
3. Resolve required check failures before relying on automated readiness cadence.
4. If bridge coverage is expected, configure bridge token and rerun bridge profile: `export BRIDGE_TOKEN_FILE=~/.openclaw/bridge/bridge-token && bash scripts/openclaw-local-smoke.sh --profile bridge`
5. Confirm Mission Control shows the latest readiness payload from `/api/openclaw-local-readiness`.

## Refresh Command
```bash
bash scripts/refresh-local-integration-ready.sh
```

## Run Exit Note
- The smoke command exited non-zero (`2`). This document still reflects the latest generated report.

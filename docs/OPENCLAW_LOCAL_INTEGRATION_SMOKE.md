# OpenClaw Local Integration Smoke Harness

Use `scripts/openclaw-local-smoke.sh` to validate local dashboard + control-plane readiness before enabling a full local OpenClaw integration workflow.

## What It Checks
- Required:
  - OpenClaw CLI is available (`openclaw`) and gateway status command succeeds (`openclaw gateway status`), unless skipped.
  - Dashboard auth token is available (`DASHBOARD_TOKEN` or `dashboard/data/.api-token`).
  - Dashboard endpoints respond correctly:
    - `GET /api/health`
    - `GET /api/config` (auth)
    - `GET /api/services` (auth)
    - `GET /api/scheduler-jobs` (auth)
    - `GET /api/agent-health` (auth)
    - `GET /api/live-telemetry` SSE handshake (auth)
- Optional/warning-only:
  - `GET /map/` route check
  - Direct bridge check: `GET /api/bridge/scheduler-jobs`

The script exits non-zero (`2`) when any required check fails.

## Usage
```bash
bash scripts/openclaw-local-smoke.sh
```

Common options:
```bash
bash scripts/openclaw-local-smoke.sh \
  --dashboard-url http://127.0.0.1:8001 \
  --token-file dashboard/data/.api-token \
  --report-dir runtime/reports/openclaw-local-smoke \
  --skip-bridge
```

## Environment Overrides
- `DASHBOARD_TOKEN`: inline dashboard token (skips reading token file)
- `DASHBOARD_TOKEN_FILE`: default token file path
- `SMOKE_REPORT_DIR`: output directory for smoke reports
- `SMOKE_HTTP_TIMEOUT_SEC`: per-request timeout
- `BRIDGE_URL`: optional direct bridge URL (`http://127.0.0.1:18790` default)
- `BRIDGE_TOKEN`: auth token for direct bridge check

## Evidence Artifacts
Each run writes timestamped artifacts under:
- `runtime/reports/openclaw-local-smoke/openclaw-local-smoke-<UTC timestamp>.json`
- `runtime/reports/openclaw-local-smoke/openclaw-local-smoke-<UTC timestamp>.md`

The JSON report includes machine-readable check results and a summary status (`pass` or `fail`).

## Regression Test
Run the mock-server regression test:
```bash
bash scripts/tests/test-openclaw-local-smoke.sh
```

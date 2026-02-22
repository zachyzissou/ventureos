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

Single command to run smoke and refresh the readiness summary doc:
```bash
bash scripts/refresh-local-integration-ready.sh
```

Cron-safe wrapper for unattended cadence:
```bash
bash scripts/openclaw-local-ready-cron.sh
```

Bridge-mode prerequisite (when `DASHBOARD_DATA_MODE=bridge`):
```bash
REPO_ROOT="/absolute/path/to/ventureos"
launchctl remove com.ventureos.bridge 2>/dev/null || true
launchctl submit -l com.ventureos.bridge -- /bin/zsh -lc "cd \"$REPO_ROOT\" && set -a && source config/bridge.env && set +a && exec node dashboard/dist/dashboard/server/bridge.js >> runtime/logs/bridge.log 2>&1"
curl -sS http://127.0.0.1:18790/health | jq .
```

Common options:
```bash
bash scripts/openclaw-local-smoke.sh \
  --dashboard-url http://127.0.0.1:8001 \
  --token-file dashboard/data/.api-token \
  --report-dir runtime/reports/openclaw-local-smoke \
  --profile bridge \
  --bridge-url http://127.0.0.1:18790 \
  --bridge-token-file ~/.openclaw/bridge/bridge-token
```

Profiles:
- `--profile quick`: required checks + SSE only (map and bridge checks skipped)
- `--profile full`: default behavior (bridge check is warning-only optional)
- `--profile bridge`: full behavior and bridge check escalated to `critical-optional` (can produce `HOLD` verdict)

## Environment Overrides
- `DASHBOARD_TOKEN`: inline dashboard token (skips reading token file)
- `DASHBOARD_TOKEN_FILE`: default token file path
- `SMOKE_REPORT_DIR`: output directory for smoke reports
- `SMOKE_HTTP_TIMEOUT_SEC`: per-request timeout
- `SMOKE_HTTP_RETRY_MAX`: retry count for transient HTTP failures (default: `2`)
- `SMOKE_HTTP_RETRY_BASE_SEC`: base retry delay in seconds (default: `1`)
- `SMOKE_HTTP_RETRY_MAX_DELAY_SEC`: maximum retry delay in seconds (default: `15`)
- `BRIDGE_URL`: optional direct bridge URL (`http://127.0.0.1:18790` default)
- `BRIDGE_TOKEN`: auth token for direct bridge check
- `BRIDGE_TOKEN_FILE`: optional token file for direct bridge check
  - Token resolution precedence in smoke harness:
    - `--bridge-token-file`
    - `BRIDGE_TOKEN`
    - `BRIDGE_TOKEN_FILE`
    - `OPENCLAW_DIR/bridge/bridge-token` (fallback)

## Evidence Artifacts
Each run writes timestamped artifacts under:
- `runtime/reports/openclaw-local-smoke/openclaw-local-smoke-<UTC timestamp>.json`
- `runtime/reports/openclaw-local-smoke/openclaw-local-smoke-<UTC timestamp>.md`
- `runtime/reports/openclaw-local-smoke/openclaw-local-smoke-<UTC timestamp>.svg`

The JSON report includes machine-readable check metadata and readiness summary fields:
- `summary.verdict`: `go|hold|blocked`
- `summary.readinessScore`: `0..100`
- `summary.confidence`: `high|medium|low`
- Per-check metadata: `group`, `severity`, `likelyCause`, `nextCommand`
- If a check fails with HTTP `429`, smoke classifies it as rate-limit pressure and emits a `sleep 60 && bash scripts/openclaw-local-smoke.sh --profile <profile>` next-command hint.

`scripts/refresh-local-integration-ready.sh` now enforces strict latest JSON/MD/SVG timestamp pairing and schema validation before regenerating `docs/LOCAL_INTEGRATION_READY.md`.
Use `--prune-keep <n>` if you want refresh to keep only the newest `n` timestamp groups of smoke artifacts after regeneration.

`scripts/openclaw-local-ready-cron.sh` defaults:
- `--history-limit 7`
- `--prune-keep 14`
- `--profile full`

Optional env overrides for cron wrapper:
- `OPENCLAW_LOCAL_READY_HISTORY_LIMIT`
- `OPENCLAW_LOCAL_READY_PRUNE_KEEP`
- `OPENCLAW_LOCAL_READY_PROFILE` (`quick|full|bridge`)

## Current Next Steps (February 22, 2026)
1. Install or refresh managed cron entries:
```bash
bash scripts/install-cron.sh --force
```
2. Run one manual cadence cycle and confirm doc/artifact refresh:
```bash
bash scripts/openclaw-local-ready-cron.sh
```
3. Verify Mission Control shows the latest readiness payload from `/api/openclaw-local-readiness`.
4. If bridge direct-check coverage is expected, configure `BRIDGE_TOKEN_FILE` and rerun bridge profile smoke:
```bash
bash scripts/openclaw-local-smoke.sh --profile bridge
```
5. Track active rollout work in issues `#431` (ops rollout) and `#432` (bridge readiness parity).

## Regression Test
Run the mock-server regression test:
```bash
bash scripts/tests/test-openclaw-local-smoke.sh
```

Run the readiness-refresh regression test:
```bash
bash scripts/tests/test-refresh-local-integration-ready.sh
```

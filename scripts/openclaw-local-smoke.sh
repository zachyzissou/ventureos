#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DASHBOARD_URL="${DASHBOARD_URL:-http://127.0.0.1:8001}"
TOKEN_FILE="${DASHBOARD_TOKEN_FILE:-$REPO_ROOT/dashboard/data/.api-token}"
REPORT_DIR="${SMOKE_REPORT_DIR:-$REPO_ROOT/runtime/reports/openclaw-local-smoke}"
HTTP_TIMEOUT_SEC="${SMOKE_HTTP_TIMEOUT_SEC:-5}"
SKIP_OPENCLAW_CLI=0
SKIP_MAP=0
SKIP_BRIDGE=0

usage() {
  cat <<EOF
openclaw-local-smoke.sh

Usage:
  bash scripts/openclaw-local-smoke.sh [options]

Options:
  --dashboard-url <url>   Dashboard base URL (default: $DASHBOARD_URL)
  --token-file <path>     Dashboard API token path (default: $TOKEN_FILE)
  --report-dir <path>     Report directory (default: $REPORT_DIR)
  --timeout-sec <n>       HTTP timeout seconds (default: $HTTP_TIMEOUT_SEC)
  --skip-openclaw-cli     Skip OpenClaw CLI + gateway checks
  --skip-map              Skip Tactical Map route check
  --skip-bridge           Skip optional direct bridge check
  -h, --help              Show help

Env overrides:
  DASHBOARD_TOKEN         Inline API token (if set, token file check is optional)
  BRIDGE_URL              Direct bridge URL for optional check (default: http://127.0.0.1:18790)
  BRIDGE_TOKEN            Direct bridge token for optional check
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dashboard-url)
      DASHBOARD_URL="$2"
      shift 2
      ;;
    --token-file)
      TOKEN_FILE="$2"
      shift 2
      ;;
    --report-dir)
      REPORT_DIR="$2"
      shift 2
      ;;
    --timeout-sec)
      HTTP_TIMEOUT_SEC="$2"
      shift 2
      ;;
    --skip-openclaw-cli)
      SKIP_OPENCLAW_CLI=1
      shift
      ;;
    --skip-map)
      SKIP_MAP=1
      shift
      ;;
    --skip-bridge)
      SKIP_BRIDGE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! [[ "$HTTP_TIMEOUT_SEC" =~ ^[0-9]+$ ]] || [[ "$HTTP_TIMEOUT_SEC" -lt 1 ]]; then
  echo "Invalid --timeout-sec: $HTTP_TIMEOUT_SEC" >&2
  exit 2
fi

now_ms() {
  python3 - <<'PY'
import time
print(int(time.time() * 1000))
PY
}

sanitize_detail() {
  local d="$1"
  d="${d//$'\n'/ }"
  d="${d//$'\r'/ }"
  d="${d//$'\t'/ }"
  echo "$d"
}

TMP_DIR="$(mktemp -d)"
RESULTS_TSV="$TMP_DIR/results.tsv"
trap 'rm -rf "$TMP_DIR"' EXIT

required_failures=0
warnings=0

record_result() {
  local id="$1"
  local required="$2"
  local status="$3"
  local duration_ms="$4"
  local description="$5"
  local detail="$6"

  detail="$(sanitize_detail "$detail")"
  description="$(sanitize_detail "$description")"
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$id" "$required" "$status" "$duration_ms" "$description" "$detail" >> "$RESULTS_TSV"

  if [[ "$status" == "fail" ]]; then
    if [[ "$required" == "true" ]]; then
      required_failures=$((required_failures + 1))
    else
      warnings=$((warnings + 1))
    fi
  fi
}

CHECK_DETAIL=""

run_check() {
  local id="$1"
  local required="$2"
  local description="$3"
  local fn="$4"
  local started ended duration status
  started="$(now_ms)"
  CHECK_DETAIL=""
  if "$fn"; then
    status="pass"
  else
    status="fail"
    if [[ -z "$CHECK_DETAIL" ]]; then
      CHECK_DETAIL="check failed"
    fi
  fi
  ended="$(now_ms)"
  duration=$((ended - started))
  record_result "$id" "$required" "$status" "$duration" "$description" "$CHECK_DETAIL"
}

run_skipped() {
  local id="$1"
  local required="$2"
  local description="$3"
  local detail="$4"
  record_result "$id" "$required" "skipped" "0" "$description" "$detail"
}

DASHBOARD_TOKEN="${DASHBOARD_TOKEN:-}"

check_openclaw_cli() {
  if ! command -v openclaw >/dev/null 2>&1; then
    CHECK_DETAIL="openclaw CLI not found in PATH"
    return 1
  fi
  CHECK_DETAIL="openclaw=$(command -v openclaw)"
  return 0
}

check_openclaw_gateway_status() {
  if ! command -v openclaw >/dev/null 2>&1; then
    CHECK_DETAIL="openclaw CLI not available"
    return 1
  fi
  local output
  if output="$(openclaw gateway status 2>&1)"; then
    CHECK_DETAIL="$(echo "$output" | head -n 1)"
    return 0
  fi
  CHECK_DETAIL="$(echo "$output" | head -n 1)"
  return 1
}

check_dashboard_token() {
  if [[ -n "$DASHBOARD_TOKEN" ]]; then
    CHECK_DETAIL="using DASHBOARD_TOKEN env override"
    return 0
  fi
  if [[ ! -f "$TOKEN_FILE" ]]; then
    CHECK_DETAIL="missing token file: $TOKEN_FILE"
    return 1
  fi
  DASHBOARD_TOKEN="$(tr -d ' \r\n' < "$TOKEN_FILE")"
  if [[ -z "$DASHBOARD_TOKEN" ]]; then
    CHECK_DETAIL="empty token in: $TOKEN_FILE"
    return 1
  fi
  CHECK_DETAIL="token loaded from $TOKEN_FILE"
  return 0
}

HTTP_STATUS=""
HTTP_BODY_FILE=""
HTTP_HEADER_FILE=""

http_get() {
  local path="$1"
  local use_auth="$2"
  local url="${DASHBOARD_URL}${path}"
  local body_file header_file err_file

  body_file="$(mktemp "$TMP_DIR/body.XXXXXX")"
  header_file="$(mktemp "$TMP_DIR/header.XXXXXX")"
  err_file="$(mktemp "$TMP_DIR/err.XXXXXX")"

  local -a cmd=(curl -sS -m "$HTTP_TIMEOUT_SEC" -D "$header_file" -o "$body_file" -w "%{http_code}")
  if [[ "$use_auth" == "1" ]]; then
    cmd+=(-H "Authorization: Bearer ${DASHBOARD_TOKEN}")
  fi
  cmd+=("$url")

  local status
  if ! status="$("${cmd[@]}" 2>"$err_file")"; then
    CHECK_DETAIL="curl failed for ${path}: $(cat "$err_file")"
    return 1
  fi
  HTTP_STATUS="$status"
  HTTP_BODY_FILE="$body_file"
  HTTP_HEADER_FILE="$header_file"
  return 0
}

check_dashboard_health() {
  if ! http_get "/api/health" "0"; then
    return 1
  fi
  if [[ "$HTTP_STATUS" != "200" ]]; then
    CHECK_DETAIL="expected 200, got $HTTP_STATUS"
    return 1
  fi
  if ! python3 - "$HTTP_BODY_FILE" <<'PY'
import json, sys
body = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
assert body.get('ok') is True
PY
  then
    CHECK_DETAIL="invalid /api/health payload"
    return 1
  fi
  CHECK_DETAIL="health endpoint reachable"
  return 0
}

check_dashboard_config_auth() {
  if ! http_get "/api/config" "1"; then
    return 1
  fi
  if [[ "$HTTP_STATUS" != "200" ]]; then
    CHECK_DETAIL="expected 200, got $HTTP_STATUS"
    return 1
  fi
  if ! python3 - "$HTTP_BODY_FILE" <<'PY'
import json, sys
body = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
assert isinstance(body, dict)
assert 'name' in body or 'services' in body
PY
  then
    CHECK_DETAIL="invalid /api/config payload"
    return 1
  fi
  CHECK_DETAIL="authenticated config access ok"
  return 0
}

check_dashboard_services() {
  if ! http_get "/api/services" "1"; then
    return 1
  fi
  if [[ "$HTTP_STATUS" != "200" ]]; then
    CHECK_DETAIL="expected 200, got $HTTP_STATUS"
    return 1
  fi
  if ! python3 - "$HTTP_BODY_FILE" <<'PY'
import json, sys
rows = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
assert isinstance(rows, list)
names = {row.get('name') for row in rows if isinstance(row, dict)}
for need in ('openclaw', 'agent-dashboard', 'tailscaled'):
    assert need in names
PY
  then
    CHECK_DETAIL="invalid /api/services payload"
    return 1
  fi
  CHECK_DETAIL="services endpoint returned required service rows"
  return 0
}

check_dashboard_scheduler_jobs() {
  if ! http_get "/api/scheduler-jobs" "1"; then
    return 1
  fi
  if [[ "$HTTP_STATUS" != "200" ]]; then
    CHECK_DETAIL="expected 200, got $HTTP_STATUS"
    return 1
  fi
  if ! python3 - "$HTTP_BODY_FILE" <<'PY'
import json, sys
rows = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
assert isinstance(rows, list)
PY
  then
    CHECK_DETAIL="invalid /api/scheduler-jobs payload"
    return 1
  fi
  CHECK_DETAIL="scheduler jobs endpoint reachable"
  return 0
}

check_dashboard_agent_health() {
  if ! http_get "/api/agent-health" "1"; then
    return 1
  fi
  if [[ "$HTTP_STATUS" != "200" ]]; then
    CHECK_DETAIL="expected 200, got $HTTP_STATUS"
    return 1
  fi
  if ! python3 - "$HTTP_BODY_FILE" <<'PY'
import json, sys
body = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
assert isinstance(body, dict)
PY
  then
    CHECK_DETAIL="invalid /api/agent-health payload"
    return 1
  fi
  CHECK_DETAIL="agent health endpoint reachable"
  return 0
}

check_tactical_map_route() {
  if ! http_get "/map/" "1"; then
    return 1
  fi
  if [[ "$HTTP_STATUS" != "200" ]]; then
    CHECK_DETAIL="expected 200, got $HTTP_STATUS"
    return 1
  fi
  CHECK_DETAIL="map route reachable"
  return 0
}

check_live_telemetry_handshake() {
  local url="${DASHBOARD_URL}/api/live-telemetry"
  local header_file body_file err_file
  header_file="$(mktemp "$TMP_DIR/sse-header.XXXXXX")"
  body_file="$(mktemp "$TMP_DIR/sse-body.XXXXXX")"
  err_file="$(mktemp "$TMP_DIR/sse-err.XXXXXX")"

  local rc=0
  if ! curl -sS -N -m "$HTTP_TIMEOUT_SEC" \
    -H "Authorization: Bearer ${DASHBOARD_TOKEN}" \
    -D "$header_file" \
    -o "$body_file" \
    "$url" 2>"$err_file"; then
    rc=$?
  fi

  # rc=28 is expected when max-time hits on streaming endpoints.
  if [[ "$rc" -ne 0 && "$rc" -ne 28 ]]; then
    CHECK_DETAIL="SSE curl failed: $(cat "$err_file")"
    return 1
  fi

  if ! python3 - "$header_file" <<'PY'
import sys
text = open(sys.argv[1], 'r', encoding='utf-8', errors='ignore').read().lower()
assert ' 200 ' in text or text.startswith('http/1.1 200') or text.startswith('http/1.0 200')
assert 'content-type: text/event-stream' in text
PY
  then
    CHECK_DETAIL="missing SSE 200/text-event-stream headers"
    return 1
  fi

  CHECK_DETAIL="SSE handshake ok"
  return 0
}

check_bridge_scheduler_jobs() {
  local bridge_url="${BRIDGE_URL:-http://127.0.0.1:18790}"
  local bridge_token="${BRIDGE_TOKEN:-}"
  if [[ -z "$bridge_token" ]]; then
    CHECK_DETAIL="BRIDGE_TOKEN not set"
    return 1
  fi

  local body_file err_file status
  body_file="$(mktemp "$TMP_DIR/bridge-body.XXXXXX")"
  err_file="$(mktemp "$TMP_DIR/bridge-err.XXXXXX")"
  if ! status="$(curl -sS -m "$HTTP_TIMEOUT_SEC" -o "$body_file" -w "%{http_code}" \
    -H "Authorization: Bearer ${bridge_token}" \
    "${bridge_url}/api/bridge/scheduler-jobs" 2>"$err_file")"; then
    CHECK_DETAIL="curl failed: $(cat "$err_file")"
    return 1
  fi
  if [[ "$status" != "200" ]]; then
    CHECK_DETAIL="expected 200, got $status"
    return 1
  fi
  if ! python3 - "$body_file" <<'PY'
import json, sys
payload = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
assert isinstance(payload, list)
PY
  then
    CHECK_DETAIL="invalid bridge scheduler payload"
    return 1
  fi
  CHECK_DETAIL="bridge scheduler endpoint reachable"
  return 0
}

if [[ "$SKIP_OPENCLAW_CLI" == "1" ]]; then
  run_skipped "openclaw-cli" "true" "OpenClaw CLI available" "skipped via --skip-openclaw-cli"
  run_skipped "openclaw-gateway-status" "true" "OpenClaw gateway status command succeeds" "skipped via --skip-openclaw-cli"
else
  run_check "openclaw-cli" "true" "OpenClaw CLI available" check_openclaw_cli
  run_check "openclaw-gateway-status" "true" "OpenClaw gateway status command succeeds" check_openclaw_gateway_status
fi

run_check "dashboard-token" "true" "Dashboard token is available" check_dashboard_token
if [[ "$required_failures" -eq 0 ]]; then
  run_check "dashboard-health" "true" "Dashboard /api/health responds with ok=true" check_dashboard_health
  run_check "dashboard-config-auth" "true" "Dashboard /api/config is reachable with auth" check_dashboard_config_auth
  run_check "dashboard-services" "true" "Dashboard /api/services returns required service rows" check_dashboard_services
  run_check "dashboard-scheduler-jobs" "true" "Dashboard /api/scheduler-jobs is reachable" check_dashboard_scheduler_jobs
  run_check "dashboard-agent-health" "true" "Dashboard /api/agent-health is reachable" check_dashboard_agent_health
  if [[ "$SKIP_MAP" == "1" ]]; then
    run_skipped "dashboard-map-route" "false" "Dashboard /map route is reachable" "skipped via --skip-map"
  else
    run_check "dashboard-map-route" "false" "Dashboard /map route is reachable" check_tactical_map_route
  fi
  run_check "dashboard-live-telemetry-sse" "true" "Dashboard /api/live-telemetry SSE handshake succeeds" check_live_telemetry_handshake
else
  run_skipped "dashboard-health" "true" "Dashboard /api/health responds with ok=true" "skipped due to prior required failure"
  run_skipped "dashboard-config-auth" "true" "Dashboard /api/config is reachable with auth" "skipped due to prior required failure"
  run_skipped "dashboard-services" "true" "Dashboard /api/services returns required service rows" "skipped due to prior required failure"
  run_skipped "dashboard-scheduler-jobs" "true" "Dashboard /api/scheduler-jobs is reachable" "skipped due to prior required failure"
  run_skipped "dashboard-agent-health" "true" "Dashboard /api/agent-health is reachable" "skipped due to prior required failure"
  run_skipped "dashboard-map-route" "false" "Dashboard /map route is reachable" "skipped due to prior required failure"
  run_skipped "dashboard-live-telemetry-sse" "true" "Dashboard /api/live-telemetry SSE handshake succeeds" "skipped due to prior required failure"
fi

if [[ "$SKIP_BRIDGE" == "1" ]]; then
  run_skipped "bridge-scheduler-jobs" "false" "Direct bridge /api/bridge/scheduler-jobs check" "skipped via --skip-bridge"
else
  run_check "bridge-scheduler-jobs" "false" "Direct bridge /api/bridge/scheduler-jobs check" check_bridge_scheduler_jobs
fi

timestamp_utc="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$REPORT_DIR"
REPORT_JSON="$REPORT_DIR/openclaw-local-smoke-${timestamp_utc}.json"
REPORT_MD="$REPORT_DIR/openclaw-local-smoke-${timestamp_utc}.md"

python3 - "$RESULTS_TSV" "$REPORT_JSON" "$REPORT_MD" "$timestamp_utc" "$DASHBOARD_URL" "$required_failures" "$warnings" <<'PY'
import csv
import json
import pathlib
import sys

tsv_path = pathlib.Path(sys.argv[1])
json_path = pathlib.Path(sys.argv[2])
md_path = pathlib.Path(sys.argv[3])
generated_at = sys.argv[4]
dashboard_url = sys.argv[5]
required_failures = int(sys.argv[6])
warnings = int(sys.argv[7])

checks = []
with tsv_path.open('r', encoding='utf-8') as fh:
    reader = csv.reader(fh, delimiter='\t')
    for row in reader:
        if len(row) != 6:
            continue
        checks.append(
            {
                "id": row[0],
                "required": row[1] == "true",
                "status": row[2],
                "durationMs": int(row[3]),
                "description": row[4],
                "detail": row[5],
            }
        )

pass_count = sum(1 for c in checks if c["status"] == "pass")
fail_count = sum(1 for c in checks if c["status"] == "fail")
skipped_count = sum(1 for c in checks if c["status"] == "skipped")

report = {
    "generatedAt": generated_at,
    "dashboardUrl": dashboard_url,
    "summary": {
        "requiredFailures": required_failures,
        "warnings": warnings,
        "totalChecks": len(checks),
        "passCount": pass_count,
        "failCount": fail_count,
        "skippedCount": skipped_count,
        "status": "fail" if required_failures > 0 else "pass",
    },
    "checks": checks,
}

json_path.write_text(json.dumps(report, indent=2) + "\n", encoding='utf-8')

lines = [
    "# OpenClaw Local Smoke Report",
    "",
    f"- Generated: `{generated_at}`",
    f"- Dashboard URL: `{dashboard_url}`",
    f"- Status: `{report['summary']['status']}`",
    f"- Required failures: `{required_failures}`",
    f"- Warnings: `{warnings}`",
    "",
    "| Check | Required | Status | Duration (ms) | Detail |",
    "|---|---:|---|---:|---|",
]
for c in checks:
    req = "yes" if c["required"] else "no"
    lines.append(
        f"| `{c['id']}` | {req} | `{c['status']}` | {c['durationMs']} | {c['detail']} |"
    )

md_path.write_text("\n".join(lines) + "\n", encoding='utf-8')
PY

echo "OpenClaw local smoke report written:"
echo "  - $REPORT_JSON"
echo "  - $REPORT_MD"

if [[ "$required_failures" -gt 0 ]]; then
  echo "SMOKE_RESULT=FAIL required_failures=$required_failures warnings=$warnings"
  exit 2
fi

echo "SMOKE_RESULT=PASS required_failures=0 warnings=$warnings"
exit 0

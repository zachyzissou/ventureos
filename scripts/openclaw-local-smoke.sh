#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DASHBOARD_URL="${DASHBOARD_URL:-http://127.0.0.1:8001}"
TOKEN_FILE="${DASHBOARD_TOKEN_FILE:-$REPO_ROOT/dashboard/data/.api-token}"
REPORT_DIR="${SMOKE_REPORT_DIR:-$REPO_ROOT/runtime/reports/openclaw-local-smoke}"
HTTP_TIMEOUT_SEC="${SMOKE_HTTP_TIMEOUT_SEC:-5}"
HTTP_RETRY_MAX="${SMOKE_HTTP_RETRY_MAX:-2}"
HTTP_RETRY_BASE_SEC="${SMOKE_HTTP_RETRY_BASE_SEC:-1}"
HTTP_RETRY_MAX_DELAY_SEC="${SMOKE_HTTP_RETRY_MAX_DELAY_SEC:-15}"
PROFILE="full"
SKIP_OPENCLAW_CLI=0
SKIP_MAP=0
SKIP_BRIDGE=0
CLI_SKIP_MAP=0
CLI_SKIP_BRIDGE=0
BRIDGE_URL_CLI=""
CLI_BRIDGE_TOKEN_FILE=""
BRIDGE_CHECK_SEVERITY="warn"

usage() {
  cat <<EOF_USAGE
openclaw-local-smoke.sh

Usage:
  bash scripts/openclaw-local-smoke.sh [options]

Options:
  --dashboard-url <url>      Dashboard base URL (default: $DASHBOARD_URL)
  --token-file <path>        Dashboard API token path (default: $TOKEN_FILE)
  --report-dir <path>        Report directory (default: $REPORT_DIR)
  --timeout-sec <n>          HTTP timeout seconds (default: $HTTP_TIMEOUT_SEC)
  --profile <quick|full|bridge>
                             quick  = required checks + SSE only (map/bridge skipped)
                             full   = full default check set (bridge optional warn)
                             bridge = full set with bridge check severity=critical-optional
  --bridge-url <url>         Direct bridge URL (overrides BRIDGE_URL env)
  --bridge-token-file <path> Direct bridge token file (overrides BRIDGE_TOKEN_FILE env)
  --skip-openclaw-cli        Skip OpenClaw CLI + gateway checks
  --skip-map                 Skip Tactical Map route check
  --skip-bridge              Skip direct bridge check
  -h, --help                 Show help

Env overrides:
  DASHBOARD_TOKEN         Inline dashboard token (if set, token file check is optional)
  BRIDGE_URL              Direct bridge URL for optional check (default: http://127.0.0.1:18790)
  BRIDGE_TOKEN            Direct bridge token override
  BRIDGE_TOKEN_FILE       Optional bridge token file (fallback: \$OPENCLAW_DIR/bridge/bridge-token)
  SMOKE_HTTP_RETRY_MAX    Retry attempts for transient HTTP failures (default: 2)
  SMOKE_HTTP_RETRY_BASE_SEC
                          Base delay in seconds for retry backoff (default: 1)
  SMOKE_HTTP_RETRY_MAX_DELAY_SEC
                          Maximum retry delay in seconds (default: 15)
EOF_USAGE
}

apply_profile() {
  local profile="$1"
  case "$profile" in
    quick)
      PROFILE="quick"
      SKIP_MAP=1
      SKIP_BRIDGE=1
      BRIDGE_CHECK_SEVERITY="warn"
      ;;
    full)
      PROFILE="full"
      SKIP_MAP=0
      SKIP_BRIDGE=0
      BRIDGE_CHECK_SEVERITY="warn"
      ;;
    bridge)
      PROFILE="bridge"
      SKIP_MAP=0
      SKIP_BRIDGE=0
      BRIDGE_CHECK_SEVERITY="critical-optional"
      ;;
    *)
      echo "Invalid --profile: $profile" >&2
      exit 2
      ;;
  esac
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
    --profile)
      PROFILE="$2"
      shift 2
      ;;
    --bridge-url)
      BRIDGE_URL_CLI="$2"
      shift 2
      ;;
    --bridge-token-file)
      CLI_BRIDGE_TOKEN_FILE="$2"
      shift 2
      ;;
    --skip-openclaw-cli)
      SKIP_OPENCLAW_CLI=1
      shift
      ;;
    --skip-map)
      CLI_SKIP_MAP=1
      shift
      ;;
    --skip-bridge)
      CLI_SKIP_BRIDGE=1
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

apply_profile "$PROFILE"
if [[ "$CLI_SKIP_MAP" -eq 1 ]]; then
  SKIP_MAP=1
fi
if [[ "$CLI_SKIP_BRIDGE" -eq 1 ]]; then
  SKIP_BRIDGE=1
fi

if ! [[ "$HTTP_TIMEOUT_SEC" =~ ^[0-9]+$ ]] || [[ "$HTTP_TIMEOUT_SEC" -lt 1 ]]; then
  echo "Invalid --timeout-sec: $HTTP_TIMEOUT_SEC" >&2
  exit 2
fi
if ! [[ "$HTTP_RETRY_MAX" =~ ^[0-9]+$ ]]; then
  echo "Invalid SMOKE_HTTP_RETRY_MAX: $HTTP_RETRY_MAX" >&2
  exit 2
fi
if ! [[ "$HTTP_RETRY_BASE_SEC" =~ ^[0-9]+$ ]] || [[ "$HTTP_RETRY_BASE_SEC" -lt 1 ]]; then
  echo "Invalid SMOKE_HTTP_RETRY_BASE_SEC: $HTTP_RETRY_BASE_SEC" >&2
  exit 2
fi
if ! [[ "$HTTP_RETRY_MAX_DELAY_SEC" =~ ^[0-9]+$ ]] || [[ "$HTTP_RETRY_MAX_DELAY_SEC" -lt 1 ]]; then
  echo "Invalid SMOKE_HTTP_RETRY_MAX_DELAY_SEC: $HTTP_RETRY_MAX_DELAY_SEC" >&2
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
SUMMARY_TSV="$TMP_DIR/summary.tsv"
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
BRIDGE_TOKEN="${BRIDGE_TOKEN:-}"
BRIDGE_TOKEN_FILE="${BRIDGE_TOKEN_FILE:-}"

check_openclaw_cli() {
  if ! command -v openclaw >/dev/null 2>&1; then
    CHECK_DETAIL="openclaw CLI not found"
    return 1
  fi
  CHECK_DETAIL="openclaw CLI found"
  return 0
}

check_openclaw_gateway_status() {
  if ! command -v openclaw >/dev/null 2>&1; then
    CHECK_DETAIL="openclaw CLI not available"
    return 1
  fi
  local output
  if ! output="$(openclaw gateway status 2>&1)"; then
    CHECK_DETAIL="$(echo "$output" | head -n 1 | sed 's/[[:space:]]\+/ /g')"
    return 1
  fi

  local normalized
  normalized="$(echo "$output" | tr '[:upper:]' '[:lower:]')"
  if [[ "$normalized" == *"rpc probe: ok"* ]] || [[ "$normalized" == *"listening:"* ]]; then
    CHECK_DETAIL="$(echo "$output" | head -n 1 | sed 's/[[:space:]]\+/ /g')"
    return 0
  fi

  CHECK_DETAIL="gateway status returned without healthy runtime signal"
  return 1
}

check_dashboard_token() {
  if [[ -n "$DASHBOARD_TOKEN" ]]; then
    CHECK_DETAIL="using DASHBOARD_TOKEN env override"
    return 0
  fi
  if [[ ! -f "$TOKEN_FILE" ]]; then
    CHECK_DETAIL="dashboard token file not found"
    return 1
  fi
  DASHBOARD_TOKEN="$(tr -d ' \r\n' < "$TOKEN_FILE")"
  if [[ -z "$DASHBOARD_TOKEN" ]]; then
    CHECK_DETAIL="dashboard token file is empty"
    return 1
  fi
  CHECK_DETAIL="dashboard token loaded from token file"
  return 0
}

HTTP_STATUS=""
HTTP_BODY_FILE=""
HTTP_HEADER_FILE=""

extract_retry_after_seconds() {
  local header_file="$1"
  python3 - "$header_file" <<'PY'
import pathlib
import sys

value = 0
for raw in pathlib.Path(sys.argv[1]).read_text(encoding='utf-8', errors='ignore').splitlines():
    line = raw.strip()
    if not line.lower().startswith('retry-after:'):
        continue
    token = line.split(':', 1)[1].strip()
    if token.isdigit():
        parsed = int(token)
        if parsed > value:
            value = parsed
print(value)
PY
}

extract_http_status_from_headers() {
  local header_file="$1"
  python3 - "$header_file" <<'PY'
import pathlib
import re
import sys

status = '000'
pattern = re.compile(r'^HTTP/\d(?:\.\d)?\s+(\d{3})\b', re.IGNORECASE)
for raw in pathlib.Path(sys.argv[1]).read_text(encoding='utf-8', errors='ignore').splitlines():
    match = pattern.match(raw.strip())
    if match:
        status = match.group(1)
print(status)
PY
}

compute_retry_delay_sec() {
  local attempt_index="$1"
  local header_file="$2"
  local delay retry_after
  retry_after="$(extract_retry_after_seconds "$header_file")"
  if [[ "$retry_after" =~ ^[0-9]+$ ]] && [[ "$retry_after" -gt 0 ]]; then
    delay="$retry_after"
  else
    delay=$((HTTP_RETRY_BASE_SEC * (attempt_index + 1)))
  fi
  if [[ "$delay" -gt "$HTTP_RETRY_MAX_DELAY_SEC" ]]; then
    delay="$HTTP_RETRY_MAX_DELAY_SEC"
  fi
  if [[ "$delay" -lt 1 ]]; then
    delay=1
  fi
  echo "$delay"
}

http_get() {
  local path="$1"
  local use_auth="$2"
  local url="${DASHBOARD_URL}${path}"
  local body_file header_file err_file attempt status delay_sec

  attempt=0
  while true; do
    body_file="$(mktemp "$TMP_DIR/body.XXXXXX")"
    header_file="$(mktemp "$TMP_DIR/header.XXXXXX")"
    err_file="$(mktemp "$TMP_DIR/err.XXXXXX")"

    local -a cmd=(curl -sS -m "$HTTP_TIMEOUT_SEC" -D "$header_file" -o "$body_file" -w "%{http_code}")
    if [[ "$use_auth" == "1" ]]; then
      cmd+=(-H "Authorization: Bearer ${DASHBOARD_TOKEN}")
    fi
    cmd+=("$url")

    if ! status="$("${cmd[@]}" 2>"$err_file")"; then
      if [[ "$attempt" -lt "$HTTP_RETRY_MAX" ]]; then
        sleep "$HTTP_RETRY_BASE_SEC"
        attempt=$((attempt + 1))
        continue
      fi
      CHECK_DETAIL="curl failed for ${path}"
      return 1
    fi

    if [[ "$status" == "429" ]] && [[ "$attempt" -lt "$HTTP_RETRY_MAX" ]]; then
      delay_sec="$(compute_retry_delay_sec "$attempt" "$header_file")"
      sleep "$delay_sec"
      attempt=$((attempt + 1))
      continue
    fi

    HTTP_STATUS="$status"
    HTTP_BODY_FILE="$body_file"
    HTTP_HEADER_FILE="$header_file"
    return 0
  done
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
  local header_file body_file err_file status delay_sec
  local rc=0
  local attempt=0

  while true; do
    header_file="$(mktemp "$TMP_DIR/sse-header.XXXXXX")"
    body_file="$(mktemp "$TMP_DIR/sse-body.XXXXXX")"
    err_file="$(mktemp "$TMP_DIR/sse-err.XXXXXX")"

    if curl -sS -N -m "$HTTP_TIMEOUT_SEC" \
      -H "Authorization: Bearer ${DASHBOARD_TOKEN}" \
      -D "$header_file" \
      -o "$body_file" \
      "$url" 2>"$err_file"; then
      rc=0
    else
      rc=$?
    fi

    status="$(extract_http_status_from_headers "$header_file")"
    if [[ "$status" == "429" ]] && [[ "$attempt" -lt "$HTTP_RETRY_MAX" ]]; then
      delay_sec="$(compute_retry_delay_sec "$attempt" "$header_file")"
      sleep "$delay_sec"
      attempt=$((attempt + 1))
      continue
    fi
    break
  done

  if [[ "$rc" -ne 0 && "$rc" -ne 28 ]]; then
    CHECK_DETAIL="SSE curl failed"
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

resolve_bridge_token() {
  local bridge_openclaw_dir="${OPENCLAW_DIR:-$HOME/.openclaw}"
  local default_token_file="${bridge_openclaw_dir}/bridge/bridge-token"
  local resolved_json
  if ! resolved_json="$(node - "$REPO_ROOT" "$CLI_BRIDGE_TOKEN_FILE" "$BRIDGE_TOKEN" "$BRIDGE_TOKEN_FILE" "$default_token_file" <<'NODE'
const path = require('node:path');

const [repoRoot, cliTokenFile, envToken, envTokenFile, defaultTokenFile] = process.argv.slice(2);

try {
  const { resolveBridgeToken } = require(path.join(repoRoot, 'lib', 'bridge-token-resolver.js'));
  const result = resolveBridgeToken({
    cliTokenFile: cliTokenFile || undefined,
    explicitToken: envToken || undefined,
    envTokenFile: envTokenFile || undefined,
    defaultTokenFile: defaultTokenFile || undefined,
  });
  process.stdout.write(JSON.stringify(result));
} catch (_err) {
  process.stdout.write(JSON.stringify({
    ok: false,
    source: 'default-token-file',
    errorCode: 'MISSING_BRIDGE_TOKEN',
    errorMessage: 'bridge token resolver unavailable',
  }));
}
NODE
)"; then
    CHECK_DETAIL="bridge token resolver unavailable"
    return 1
  fi

  local parsed
  parsed="$(python3 - "$resolved_json" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
if payload.get('ok'):
    token = str(payload.get('token', ''))
    source = str(payload.get('source', 'unknown'))
    print('ok\t{}\t{}'.format(source, token))
else:
    message = str(payload.get('errorMessage', 'missing bridge token'))
    print('err\t{}'.format(message))
PY
)"

  if [[ "$parsed" == ok$'\t'* ]]; then
    local source token
    source="${parsed#ok$'\t'}"
    token="${source#*$'\t'}"
    source="${source%%$'\t'*}"
    BRIDGE_TOKEN="$token"
    case "$source" in
      cli-token-file)
        CHECK_DETAIL="using --bridge-token-file"
        ;;
      env-token)
        CHECK_DETAIL="using BRIDGE_TOKEN env override"
        ;;
      env-token-file)
        CHECK_DETAIL="using BRIDGE_TOKEN_FILE"
        ;;
      default-token-file)
        CHECK_DETAIL="using default OpenClaw bridge token file"
        ;;
      *)
        CHECK_DETAIL="bridge token resolved"
        ;;
    esac
    return 0
  fi

  CHECK_DETAIL="${parsed#err$'\t'}"
  return 1
}

check_bridge_scheduler_jobs() {
  local bridge_url
  if [[ -n "$BRIDGE_URL_CLI" ]]; then
    bridge_url="$BRIDGE_URL_CLI"
  else
    bridge_url="${BRIDGE_URL:-http://127.0.0.1:18790}"
  fi

  if ! resolve_bridge_token; then
    return 1
  fi

  local body_file header_file err_file status delay_sec
  local attempt=0
  while true; do
    body_file="$(mktemp "$TMP_DIR/bridge-body.XXXXXX")"
    header_file="$(mktemp "$TMP_DIR/bridge-header.XXXXXX")"
    err_file="$(mktemp "$TMP_DIR/bridge-err.XXXXXX")"
    if ! status="$(curl -sS -m "$HTTP_TIMEOUT_SEC" -D "$header_file" -o "$body_file" -w "%{http_code}" \
      -H "Authorization: Bearer ${BRIDGE_TOKEN}" \
      "${bridge_url}/api/bridge/scheduler-jobs" 2>"$err_file")"; then
      if [[ "$attempt" -lt "$HTTP_RETRY_MAX" ]]; then
        sleep "$HTTP_RETRY_BASE_SEC"
        attempt=$((attempt + 1))
        continue
      fi
      CHECK_DETAIL="bridge request failed"
      return 1
    fi
    if [[ "$status" == "429" ]] && [[ "$attempt" -lt "$HTTP_RETRY_MAX" ]]; then
      delay_sec="$(compute_retry_delay_sec "$attempt" "$header_file")"
      sleep "$delay_sec"
      attempt=$((attempt + 1))
      continue
    fi
    break
  done
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
    run_skipped "dashboard-map-route" "false" "Dashboard /map route is reachable" "skipped by profile/flag"
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
  run_skipped "bridge-scheduler-jobs" "false" "Direct bridge /api/bridge/scheduler-jobs check" "skipped by profile/flag"
else
  run_check "bridge-scheduler-jobs" "false" "Direct bridge /api/bridge/scheduler-jobs check" check_bridge_scheduler_jobs
fi

timestamp_utc="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$REPORT_DIR"
REPORT_JSON="$REPORT_DIR/openclaw-local-smoke-${timestamp_utc}.json"
REPORT_MD="$REPORT_DIR/openclaw-local-smoke-${timestamp_utc}.md"
REPORT_SVG="$REPORT_DIR/openclaw-local-smoke-${timestamp_utc}.svg"

python3 - "$RESULTS_TSV" "$REPORT_JSON" "$REPORT_MD" "$REPORT_SVG" "$SUMMARY_TSV" "$timestamp_utc" "$DASHBOARD_URL" "$required_failures" "$warnings" "$PROFILE" "$BRIDGE_CHECK_SEVERITY" <<'PY'
import csv
import json
import pathlib
import sys


tsv_path = pathlib.Path(sys.argv[1])
json_path = pathlib.Path(sys.argv[2])
md_path = pathlib.Path(sys.argv[3])
svg_path = pathlib.Path(sys.argv[4])
summary_path = pathlib.Path(sys.argv[5])
generated_at = sys.argv[6]
dashboard_url = sys.argv[7]
required_failures = int(sys.argv[8])
warnings = int(sys.argv[9])
profile = sys.argv[10]
bridge_severity = sys.argv[11]

check_meta = {
    'openclaw-cli': {
        'group': 'core',
        'severity': 'critical',
        'likelyCause': 'OpenClaw CLI is not installed or not on PATH.',
        'nextCommand': 'command -v openclaw',
        'owner': 'Platform Ops',
    },
    'openclaw-gateway-status': {
        'group': 'core',
        'severity': 'critical',
        'likelyCause': 'OpenClaw gateway service is down or unhealthy.',
        'nextCommand': 'openclaw gateway status',
        'owner': 'Platform Ops',
    },
    'dashboard-token': {
        'group': 'core',
        'severity': 'critical',
        'likelyCause': 'Dashboard API token is missing or empty.',
        'nextCommand': 'ls -l dashboard/data/.api-token',
        'owner': 'Platform Ops',
    },
    'dashboard-health': {
        'group': 'apis',
        'severity': 'critical',
        'likelyCause': 'Dashboard process is not healthy or not reachable.',
        'nextCommand': f"curl -sS {dashboard_url}/api/health",
        'owner': 'Dashboard Ops',
    },
    'dashboard-config-auth': {
        'group': 'apis',
        'severity': 'critical',
        'likelyCause': 'Dashboard auth token is invalid or auth middleware blocked access.',
        'nextCommand': f"curl -sS -H 'Authorization: Bearer <token>' {dashboard_url}/api/config",
        'owner': 'Dashboard Ops',
    },
    'dashboard-services': {
        'group': 'apis',
        'severity': 'critical',
        'likelyCause': 'Service aggregation is incomplete or API contract changed.',
        'nextCommand': f"curl -sS -H 'Authorization: Bearer <token>' {dashboard_url}/api/services",
        'owner': 'Dashboard Ops',
    },
    'dashboard-scheduler-jobs': {
        'group': 'apis',
        'severity': 'critical',
        'likelyCause': 'Scheduler jobs API is unavailable or returning invalid payload.',
        'nextCommand': f"curl -sS -H 'Authorization: Bearer <token>' {dashboard_url}/api/scheduler-jobs",
        'owner': 'Dashboard Ops',
    },
    'dashboard-agent-health': {
        'group': 'apis',
        'severity': 'critical',
        'likelyCause': 'Agent health endpoint is unavailable or response format changed.',
        'nextCommand': f"curl -sS -H 'Authorization: Bearer <token>' {dashboard_url}/api/agent-health",
        'owner': 'Dashboard Ops',
    },
    'dashboard-map-route': {
        'group': 'apis',
        'severity': 'info',
        'likelyCause': 'Map route assets or auth path is misconfigured.',
        'nextCommand': f"curl -I -H 'Authorization: Bearer <token>' {dashboard_url}/map/",
        'owner': 'Dashboard Ops',
    },
    'dashboard-live-telemetry-sse': {
        'group': 'realtime',
        'severity': 'critical',
        'likelyCause': 'SSE channel is blocked or headers are incorrect.',
        'nextCommand': f"curl -N -H 'Authorization: Bearer <token>' {dashboard_url}/api/live-telemetry",
        'owner': 'Telemetry Ops',
    },
    'bridge-scheduler-jobs': {
        'group': 'bridge',
        'severity': bridge_severity,
        'likelyCause': 'Bridge token/source is not configured or bridge API is unreachable.',
        'nextCommand': "export BRIDGE_TOKEN_FILE=~/.openclaw/bridge/bridge-token && bash scripts/openclaw-local-smoke.sh --profile bridge",
        'owner': 'Bridge Ops',
    },
}

checks = []
with tsv_path.open('r', encoding='utf-8') as fh:
    reader = csv.reader(fh, delimiter='\t')
    for row in reader:
        if len(row) != 6:
            continue
        check_id = row[0]
        meta = check_meta.get(check_id, {
            'group': 'core',
            'severity': 'info',
            'likelyCause': 'Unknown check failure cause.',
            'nextCommand': 'Inspect logs and rerun smoke.',
            'owner': 'Platform Ops',
        })
        checks.append(
            {
                'id': check_id,
                'required': row[1] == 'true',
                'status': row[2],
                'durationMs': int(row[3]),
                'description': row[4],
                'detail': row[5],
                'group': meta['group'],
                'severity': meta['severity'],
                'likelyCause': meta['likelyCause'],
                'nextCommand': meta['nextCommand'],
                'owner': meta['owner'],
            }
        )

for check in checks:
    detail = str(check.get('detail', '')).lower()
    if check.get('status') != 'fail':
        continue
    if 'got 429' not in detail:
        continue
    check['likelyCause'] = 'API rate limit window was exhausted by concurrent local requests.'
    check['nextCommand'] = f"sleep 60 && bash scripts/openclaw-local-smoke.sh --profile {profile}"

pass_count = sum(1 for c in checks if c['status'] == 'pass')
fail_count = sum(1 for c in checks if c['status'] == 'fail')
skipped_count = sum(1 for c in checks if c['status'] == 'skipped')
required_checks = [c for c in checks if c['required']]
optional_checks = [c for c in checks if not c['required']]
required_pass = sum(1 for c in required_checks if c['status'] == 'pass')
required_skipped = sum(1 for c in required_checks if c['status'] == 'skipped')
required_ratio = (required_pass / len(required_checks)) if required_checks else 1.0

optional_weights = {
    'info': 1,
    'warn': 2,
    'critical-optional': 4,
}
optional_total_weight = sum(optional_weights.get(c['severity'], 1) for c in optional_checks)
optional_pass_weight = sum(
    optional_weights.get(c['severity'], 1)
    for c in optional_checks
    if c['status'] == 'pass'
)
optional_ratio = (optional_pass_weight / optional_total_weight) if optional_total_weight else 1.0

readiness_score = int(round((required_ratio * 90.0) + (optional_ratio * 10.0)))
has_critical_optional_failure = any(
    c['status'] == 'fail' and c['severity'] == 'critical-optional' for c in optional_checks
)
if required_failures > 0:
    verdict = 'blocked'
elif has_critical_optional_failure:
    verdict = 'hold'
else:
    verdict = 'go'

if required_failures > 0:
    confidence = 'low'
elif required_skipped > 0 or warnings > 0:
    confidence = 'medium'
else:
    confidence = 'high'

status = 'fail' if required_failures > 0 else 'pass'

report = {
    'generatedAt': generated_at,
    'dashboardUrl': dashboard_url,
    'summary': {
        'profile': profile,
        'requiredFailures': required_failures,
        'requiredSkipped': required_skipped,
        'warnings': warnings,
        'totalChecks': len(checks),
        'passCount': pass_count,
        'failCount': fail_count,
        'skippedCount': skipped_count,
        'status': status,
        'verdict': verdict,
        'readinessScore': readiness_score,
        'confidence': confidence,
    },
    'checks': checks,
}

json_path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')

lines = [
    '# OpenClaw Local Smoke Report',
    '',
    f'- Generated: `{generated_at}`',
    f'- Profile: `{profile}`',
    f'- Dashboard URL: `{dashboard_url}`',
    f'- Status: `{status}`',
    f'- Verdict: `{verdict}`',
    f'- Readiness score: `{readiness_score}`',
    f'- Confidence: `{confidence}`',
    f'- Required failures: `{required_failures}`',
    f'- Warnings: `{warnings}`',
    '',
    '| Check | Group | Severity | Required | Status | Duration (ms) | Detail |',
    '|---|---|---|---:|---|---:|---|',
]
for c in checks:
    req = 'yes' if c['required'] else 'no'
    lines.append(
        f"| `{c['id']}` | `{c['group']}` | `{c['severity']}` | {req} | `{c['status']}` | {c['durationMs']} | {c['detail']} |"
    )
md_path.write_text('\n'.join(lines) + '\n', encoding='utf-8')

bar_colors = {
    'pass': '#10b981',
    'fail': '#ef4444',
    'skipped': '#94a3b8',
}
bar_width = 20
bar_gap = 4
left_pad = 18
count = max(1, len(checks))
svg_width = left_pad * 2 + (count * bar_width) + ((count - 1) * bar_gap)
svg_height = 84
status_color = {'go': '#10b981', 'hold': '#f59e0b', 'blocked': '#ef4444'}.get(verdict, '#64748b')

svg_lines = [
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{svg_width}" height="{svg_height}" viewBox="0 0 {svg_width} {svg_height}" role="img" aria-label="OpenClaw smoke status strip">',
    '  <rect width="100%" height="100%" fill="#0f172a"/>',
    f'  <text x="16" y="18" fill="#e2e8f0" font-size="11" font-family="monospace">OpenClaw readiness {verdict.upper()} · score {readiness_score}</text>',
    f'  <text x="16" y="34" fill="{status_color}" font-size="11" font-family="monospace">confidence {confidence}</text>',
]
for idx, check in enumerate(checks):
    x = left_pad + idx * (bar_width + bar_gap)
    color = bar_colors.get(check['status'], '#64748b')
    svg_lines.append(f'  <rect x="{x}" y="46" width="{bar_width}" height="20" rx="3" fill="{color}">')
    svg_lines.append(f'    <title>{check["id"]}: {check["status"]}</title>')
    svg_lines.append('  </rect>')
svg_lines.append('</svg>')
svg_path.write_text('\n'.join(svg_lines) + '\n', encoding='utf-8')

summary_path.write_text(
    '\t'.join([
        status,
        verdict,
        str(readiness_score),
        confidence,
        str(required_failures),
        str(warnings),
    ]) + '\n',
    encoding='utf-8',
)
PY

render_mission_control_summary() {
  local color_enabled="0"
  if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
    color_enabled="1"
  fi

  python3 - "$REPORT_JSON" "$color_enabled" <<'PY'
import json
import sys

report_path = sys.argv[1]
color_enabled = sys.argv[2] == '1'
report = json.loads(open(report_path, 'r', encoding='utf-8').read())
summary = report.get('summary', {})
checks = report.get('checks', [])

palette = {
    'reset': '\033[0m',
    'bold': '\033[1m',
    'green': '\033[32m',
    'yellow': '\033[33m',
    'red': '\033[31m',
    'cyan': '\033[36m',
}

def c(text: str, name: str) -> str:
    if not color_enabled:
        return text
    return f"{palette.get(name, '')}{text}{palette['reset']}"

verdict = str(summary.get('verdict', 'unknown')).upper()
score = summary.get('readinessScore', 'n/a')
confidence = str(summary.get('confidence', 'n/a')).upper()
profile = str(summary.get('profile', 'n/a'))

if verdict == 'GO':
    verdict_text = c(verdict, 'green')
elif verdict == 'HOLD':
    verdict_text = c(verdict, 'yellow')
else:
    verdict_text = c(verdict, 'red')

print(c('OpenClaw Mission Control', 'bold'))
print(f"  Verdict: {verdict_text} | Score: {score} | Confidence: {confidence} | Profile: {profile}")
print(
    f"  Required failures: {summary.get('requiredFailures', 0)} | "
    f"Warnings: {summary.get('warnings', 0)} | "
    f"Checks: {summary.get('totalChecks', 0)}"
)

sections = [('core', 'Core'), ('apis', 'APIs'), ('realtime', 'Realtime'), ('bridge', 'Bridge')]
for group_id, label in sections:
    group_checks = [c for c in checks if c.get('group') == group_id]
    if not group_checks:
        continue
    pass_count = sum(1 for c in group_checks if c.get('status') == 'pass')
    fail_count = sum(1 for c in group_checks if c.get('status') == 'fail')
    skipped_count = sum(1 for c in group_checks if c.get('status') == 'skipped')
    if fail_count > 0:
        badge = c('FAIL', 'red')
    elif skipped_count > 0:
        badge = c('MIXED', 'yellow')
    else:
        badge = c('OK', 'green')
    print(f"  {label:<8} {badge}  pass={pass_count} fail={fail_count} skipped={skipped_count}")

failed = [c for c in checks if c.get('status') == 'fail']
if failed:
    severity_rank = {'critical': 100, 'critical-optional': 80, 'warn': 40, 'info': 20}
    failed.sort(
        key=lambda c: (
            0 if c.get('required') else 1,
            -severity_rank.get(str(c.get('severity', 'info')), 0),
            str(c.get('id', '')),
        )
    )
    print(c('  Top Blockers:', 'cyan'))
    for blocker in failed[:3]:
        print(
            f"    - {blocker.get('id')} ({blocker.get('owner', 'Ops')}): "
            f"{blocker.get('likelyCause', 'unknown cause')}"
        )
        print(f"      next: {blocker.get('nextCommand', 'n/a')}")
PY
}

render_mission_control_summary

echo "OpenClaw local smoke report written:"
echo "  - $REPORT_JSON"
echo "  - $REPORT_MD"
echo "  - $REPORT_SVG"

read -r smoke_status smoke_verdict smoke_score smoke_confidence smoke_required smoke_warnings < "$SUMMARY_TSV"

if [[ "$required_failures" -gt 0 ]]; then
  echo "SMOKE_RESULT=FAIL required_failures=$smoke_required warnings=$smoke_warnings verdict=$smoke_verdict score=$smoke_score confidence=$smoke_confidence"
  exit 2
fi

echo "SMOKE_RESULT=PASS required_failures=0 warnings=$smoke_warnings verdict=$smoke_verdict score=$smoke_score confidence=$smoke_confidence"
exit 0

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

HOOK_STATUS_SCRIPT="${POST_MERGE_HOOK_HEALTH_STATUS_SCRIPT:-$REPO_ROOT/scripts/install-post-merge-hook.sh}"
CADENCE_JSON="${POST_MERGE_HOOK_HEALTH_CADENCE_JSON:-$REPO_ROOT/runtime/reports/post-merge-cadence/post-merge-cadence-latest.json}"
HOOK_LOG_DIR="${POST_MERGE_HOOK_HEALTH_LOG_DIR:-$REPO_ROOT/runtime/logs/git-hooks}"
MAX_AGE_MIN="${POST_MERGE_HOOK_HEALTH_MAX_AGE_MIN:-1440}"

usage() {
  cat <<'EOF_USAGE'
post-merge-hook-health.sh

Usage:
  bash scripts/post-merge-hook-health.sh [options]

Options:
  --status-script <path>  Hook status script (default: scripts/install-post-merge-hook.sh)
  --cadence-json <path>   Cadence summary JSON path
  --log-dir <path>        Hook logs directory
  --max-age-min <n>       Freshness threshold in minutes (default: 1440)
  -h, --help              Show help

Markers:
  POST_MERGE_HOOK_HEALTH_STATUS=PASS|FAIL
  POST_MERGE_HOOK_HEALTH_REASON=<reason>
  POST_MERGE_HOOK_STATUS=<managed|missing|unmanaged|unknown>
  POST_MERGE_HOOK_CADENCE_JSON=<path>
  POST_MERGE_HOOK_CADENCE_AGE_SEC=<n|-1>
  POST_MERGE_HOOK_LOG=<path|n/a>
  POST_MERGE_HOOK_LOG_AGE_SEC=<n|-1>
EOF_USAGE
}

need_value() {
  if [[ $# -lt 2 ]]; then
    echo "Missing value for $1" >&2
    exit 2
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --status-script)
      need_value "$@"
      HOOK_STATUS_SCRIPT="$2"
      shift 2
      ;;
    --cadence-json)
      need_value "$@"
      CADENCE_JSON="$2"
      shift 2
      ;;
    --log-dir)
      need_value "$@"
      HOOK_LOG_DIR="$2"
      shift 2
      ;;
    --max-age-min)
      need_value "$@"
      MAX_AGE_MIN="$2"
      shift 2
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

if ! [[ "$MAX_AGE_MIN" =~ ^[0-9]+$ ]]; then
  echo "Invalid --max-age-min: $MAX_AGE_MIN" >&2
  exit 2
fi
if [[ ! -f "$HOOK_STATUS_SCRIPT" ]]; then
  echo "Missing status script: $HOOK_STATUS_SCRIPT" >&2
  exit 2
fi

status_output="$(bash "$HOOK_STATUS_SCRIPT" --status 2>&1 || true)"
hook_status="$(printf '%s\n' "$status_output" | awk -F= '/^POST_MERGE_HOOK_STATUS=/{print $2}' | tail -n 1)"
hook_path="$(printf '%s\n' "$status_output" | awk -F= '/^POST_MERGE_HOOK_PATH=/{print $2}' | tail -n 1)"
status_log_dir="$(printf '%s\n' "$status_output" | awk -F= '/^POST_MERGE_HOOK_LOG_DIR=/{print $2}' | tail -n 1)"

if [[ -n "$status_log_dir" ]]; then
  HOOK_LOG_DIR="$status_log_dir"
fi
if [[ -z "$hook_status" ]]; then
  hook_status="unknown"
fi

latest_log="$(ls -1t "$HOOK_LOG_DIR"/post-merge-cadence-*.log 2>/dev/null | head -n 1 || true)"

metrics_json="$(python3 - "$CADENCE_JSON" "$latest_log" "$MAX_AGE_MIN" <<'PY'
from __future__ import annotations

import json
import pathlib
import sys
from datetime import datetime, timezone

cadence_path = pathlib.Path(sys.argv[1]).expanduser()
log_path_text = sys.argv[2]
max_age_min = int(sys.argv[3])
now = datetime.now(timezone.utc)
max_age_sec = max_age_min * 60

def parse_iso(raw: str) -> datetime | None:
    raw = raw.strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

cadence_exists = cadence_path.exists()
cadence_age_sec = -1
cadence_fresh = False
if cadence_exists:
    try:
        payload = json.loads(cadence_path.read_text(encoding="utf-8"))
        generated = str(payload.get("generatedAtUtc", "")).strip()
    except Exception:
        generated = ""
    parsed = parse_iso(generated) if generated else None
    if parsed is not None:
        cadence_age_sec = max(0, int((now - parsed).total_seconds()))
        cadence_fresh = cadence_age_sec <= max_age_sec

log_exists = False
log_age_sec = -1
log_fresh = False
if log_path_text:
    log_path = pathlib.Path(log_path_text).expanduser()
    if log_path.exists():
        log_exists = True
        mtime = datetime.fromtimestamp(log_path.stat().st_mtime, tz=timezone.utc)
        log_age_sec = max(0, int((now - mtime).total_seconds()))
        log_fresh = log_age_sec <= max_age_sec

print(json.dumps({
    "cadenceExists": cadence_exists,
    "cadenceAgeSec": cadence_age_sec,
    "cadenceFresh": cadence_fresh,
    "logExists": log_exists,
    "logAgeSec": log_age_sec,
    "logFresh": log_fresh,
}))
PY
)"

cadence_exists="$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['cadenceExists'])" "$metrics_json")"
cadence_age_sec="$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['cadenceAgeSec'])" "$metrics_json")"
cadence_fresh="$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['cadenceFresh'])" "$metrics_json")"
log_exists="$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['logExists'])" "$metrics_json")"
log_age_sec="$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['logAgeSec'])" "$metrics_json")"
log_fresh="$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['logFresh'])" "$metrics_json")"

health_reason="ok"
health_rc=0
if [[ "$hook_status" != "managed" ]]; then
  health_reason="hook-not-managed"
  health_rc=3
elif [[ "$cadence_exists" != "True" ]]; then
  health_reason="cadence-missing"
  health_rc=4
elif [[ "$cadence_fresh" != "True" ]]; then
  health_reason="cadence-stale"
  health_rc=5
elif [[ "$log_exists" != "True" ]]; then
  health_reason="hook-log-missing"
  health_rc=6
elif [[ "$log_fresh" != "True" ]]; then
  health_reason="hook-log-stale"
  health_rc=7
fi

echo "Post-Merge Hook Health"
echo "  hook_status:      $hook_status"
echo "  hook_path:        ${hook_path:-n/a}"
echo "  cadence_json:     $CADENCE_JSON"
echo "  cadence_age_sec:  $cadence_age_sec"
echo "  hook_log:         ${latest_log:-n/a}"
echo "  hook_log_age_sec: $log_age_sec"
echo "  max_age_min:      $MAX_AGE_MIN"
echo "  reason:           $health_reason"

if [[ "$health_rc" -eq 0 ]]; then
  echo "POST_MERGE_HOOK_HEALTH_STATUS=PASS"
else
  echo "POST_MERGE_HOOK_HEALTH_STATUS=FAIL"
fi
echo "POST_MERGE_HOOK_HEALTH_REASON=$health_reason"
echo "POST_MERGE_HOOK_STATUS=$hook_status"
echo "POST_MERGE_HOOK_PATH=${hook_path:-n/a}"
echo "POST_MERGE_HOOK_CADENCE_JSON=$CADENCE_JSON"
echo "POST_MERGE_HOOK_CADENCE_AGE_SEC=$cadence_age_sec"
echo "POST_MERGE_HOOK_LOG=${latest_log:-n/a}"
echo "POST_MERGE_HOOK_LOG_AGE_SEC=$log_age_sec"

exit "$health_rc"

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PREFLIGHT_TRIGGER_SCRIPT="${POST_MERGE_CADENCE_PREFLIGHT_TRIGGER_SCRIPT:-$REPO_ROOT/scripts/post-merge-preflight-trigger.sh}"
QUEUE_TRIGGER_SCRIPT="${POST_MERGE_CADENCE_QUEUE_TRIGGER_SCRIPT:-$REPO_ROOT/scripts/post-merge-queue-snapshot.sh}"

REPORT_DIR="${POST_MERGE_CADENCE_REPORT_DIR:-$REPO_ROOT/runtime/reports/post-merge-cadence}"
QUEUE_JSON="${POST_MERGE_CADENCE_QUEUE_JSON:-$REPO_ROOT/runtime/reports/pr-queue/queue-latest.json}"
BASE_REF="${POST_MERGE_CADENCE_BASE_REF:-HEAD~1}"
HEAD_REF="${POST_MERGE_CADENCE_HEAD_REF:-HEAD}"
CHANGED_PATHS_FILE="${POST_MERGE_CADENCE_CHANGED_PATHS_FILE:-}"
STOP_ON_FAILURE=0

usage() {
  cat <<'EOF_USAGE'
post-merge-cadence.sh

Usage:
  bash scripts/post-merge-cadence.sh [options]

Options:
  --report-dir <path>           Cadence summary report directory
  --queue-json <path>           Queue snapshot output path
  --base-ref <ref>              Base ref for preflight trigger diff check
  --head-ref <ref>              Head ref for preflight trigger diff check
  --changed-paths-file <path>   Optional fixture path list for preflight trigger
  --stop-on-failure             Skip queue trigger if preflight trigger fails
  -h, --help                    Show help

Markers:
  POST_MERGE_CADENCE_STATUS=PASS|FAIL
  POST_MERGE_CADENCE_JSON=<path>
  POST_MERGE_CADENCE_MD=<path>
  POST_MERGE_CADENCE_EXIT_CODE=<rc>
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
    --report-dir)
      need_value "$@"
      REPORT_DIR="$2"
      shift 2
      ;;
    --queue-json)
      need_value "$@"
      QUEUE_JSON="$2"
      shift 2
      ;;
    --base-ref)
      need_value "$@"
      BASE_REF="$2"
      shift 2
      ;;
    --head-ref)
      need_value "$@"
      HEAD_REF="$2"
      shift 2
      ;;
    --changed-paths-file)
      need_value "$@"
      CHANGED_PATHS_FILE="$2"
      shift 2
      ;;
    --stop-on-failure)
      STOP_ON_FAILURE=1
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

for required_script in "$PREFLIGHT_TRIGGER_SCRIPT" "$QUEUE_TRIGGER_SCRIPT"; do
  if [[ ! -f "$required_script" ]]; then
    echo "Required script not found: $required_script" >&2
    exit 2
  fi
done

mkdir -p "$REPORT_DIR"
mkdir -p "$(dirname "$QUEUE_JSON")"

timestamp_utc="$(date -u +%Y%m%dT%H%M%SZ)"
cadence_json="$REPORT_DIR/post-merge-cadence-${timestamp_utc}.json"
cadence_md="$REPORT_DIR/post-merge-cadence-${timestamp_utc}.md"
latest_json="$REPORT_DIR/post-merge-cadence-latest.json"
latest_md="$REPORT_DIR/post-merge-cadence-latest.md"
log_preflight="$REPORT_DIR/post-merge-cadence-${timestamp_utc}-preflight.log"
log_queue="$REPORT_DIR/post-merge-cadence-${timestamp_utc}-queue.log"

run_logged() {
  local log_path="$1"
  shift
  set +e
  "$@" > >(tee "$log_path") 2>&1
  local rc=$?
  set -e
  return "$rc"
}

status_preflight="pending"
status_queue="pending"
rc_preflight=0
rc_queue=0

preflight_cmd=(bash "$PREFLIGHT_TRIGGER_SCRIPT" --base-ref "$BASE_REF" --head-ref "$HEAD_REF")
if [[ -n "$CHANGED_PATHS_FILE" ]]; then
  preflight_cmd+=(--changed-paths-file "$CHANGED_PATHS_FILE")
fi

if run_logged "$log_preflight" "${preflight_cmd[@]}"; then
  status_preflight="pass"
  rc_preflight=0
else
  rc_preflight=$?
  status_preflight="fail"
fi

queue_cmd=(bash "$QUEUE_TRIGGER_SCRIPT" --queue-json "$QUEUE_JSON")
if [[ "$status_preflight" == "fail" && "$STOP_ON_FAILURE" -eq 1 ]]; then
  status_queue="skipped"
  rc_queue=0
  echo "SKIP queue-trigger :: preflight-trigger failed and --stop-on-failure set" | tee "$log_queue" >/dev/null
else
  if run_logged "$log_queue" "${queue_cmd[@]}"; then
    status_queue="pass"
    rc_queue=0
  else
    rc_queue=$?
    status_queue="fail"
  fi
fi

cadence_exit=0
if [[ "$status_preflight" == "fail" ]]; then
  cadence_exit="$rc_preflight"
elif [[ "$status_queue" == "fail" ]]; then
  cadence_exit="$rc_queue"
fi
if [[ "$cadence_exit" -eq 0 ]]; then
  cadence_status="pass"
else
  cadence_status="fail"
fi

preflight_marker="$(grep -E '^POST_MERGE_PREFLIGHT_STATUS=' "$log_preflight" | tail -n 1 | cut -d= -f2- || true)"
queue_marker="$(grep -E '^POST_MERGE_QUEUE_SWEEP_STATUS=' "$log_queue" | tail -n 1 | cut -d= -f2- || true)"
preflight_evidence_json="$(grep -E '^POST_MERGE_PREFLIGHT_EVIDENCE_JSON=' "$log_preflight" | tail -n 1 | cut -d= -f2- || true)"

python3 - "$cadence_json" "$cadence_md" "$REPO_ROOT" "$timestamp_utc" "$cadence_status" "$cadence_exit" "$PREFLIGHT_TRIGGER_SCRIPT" "$status_preflight" "$rc_preflight" "$log_preflight" "$preflight_marker" "$preflight_evidence_json" "$QUEUE_TRIGGER_SCRIPT" "$status_queue" "$rc_queue" "$log_queue" "$queue_marker" "$QUEUE_JSON" <<'PY'
from __future__ import annotations

import json
import pathlib
import sys
from datetime import datetime, timezone


def rel(path_text: str, repo_root: pathlib.Path) -> str:
    if not path_text:
        return "n/a"
    p = pathlib.Path(path_text).expanduser()
    if not p.is_absolute():
        return str(path_text)
    try:
        return str(p.resolve().relative_to(repo_root))
    except Exception:
        return str(p)


out_json = pathlib.Path(sys.argv[1])
out_md = pathlib.Path(sys.argv[2])
repo_root = pathlib.Path(sys.argv[3]).resolve()
timestamp_utc = sys.argv[4]
cadence_status = sys.argv[5]
cadence_exit = int(sys.argv[6])

preflight = {
    "id": "post-merge-preflight-trigger",
    "script": rel(sys.argv[7], repo_root),
    "status": sys.argv[8],
    "exitCode": int(sys.argv[9]),
    "log": rel(sys.argv[10], repo_root),
    "triggerStatus": (sys.argv[11] or "unknown").lower(),
    "evidenceJson": rel(sys.argv[12], repo_root),
}

queue = {
    "id": "post-merge-queue-snapshot",
    "script": rel(sys.argv[13], repo_root),
    "status": sys.argv[14],
    "exitCode": int(sys.argv[15]),
    "log": rel(sys.argv[16], repo_root),
    "queueStatus": (sys.argv[17] or "unknown").lower(),
    "queueJson": rel(sys.argv[18], repo_root),
}

payload = {
    "schemaVersion": 1,
    "generatedAtUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "timestampUtc": timestamp_utc,
    "status": cadence_status,
    "exitCode": cadence_exit,
    "steps": [preflight, queue],
}

out_json.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

lines = [
    "# Post-Merge Cadence Summary",
    "",
    f"- Generated: `{payload['generatedAtUtc']}`",
    f"- Status: `{cadence_status.upper()}`",
    f"- Exit code: `{cadence_exit}`",
    "",
    "| Step | Status | Exit Code | Marker | Log |",
    "|---|---|---|---|---|",
    f"| `post-merge-preflight-trigger` | `{preflight['status']}` | `{preflight['exitCode']}` | `{preflight['triggerStatus']}` | `{preflight['log']}` |",
    f"| `post-merge-queue-snapshot` | `{queue['status']}` | `{queue['exitCode']}` | `{queue['queueStatus']}` | `{queue['log']}` |",
]
out_md.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY

cp "$cadence_json" "$latest_json"
cp "$cadence_md" "$latest_md"

echo "POST_MERGE_CADENCE_STATUS=$( [[ "$cadence_status" == "pass" ]] && echo PASS || echo FAIL )"
echo "POST_MERGE_CADENCE_JSON=$cadence_json"
echo "POST_MERGE_CADENCE_MD=$cadence_md"
echo "POST_MERGE_CADENCE_EXIT_CODE=$cadence_exit"

exit "$cadence_exit"

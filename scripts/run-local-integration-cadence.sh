#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PREFLIGHT_SCRIPT="${VENTUREOS_CADENCE_PREFLIGHT_SCRIPT:-$REPO_ROOT/scripts/run-install-preflight-evidence.sh}"
QUEUE_SCRIPT="${VENTUREOS_CADENCE_QUEUE_SCRIPT:-$REPO_ROOT/scripts/pr-queue-sweep.sh}"
CHECKLIST_SCRIPT="${VENTUREOS_CADENCE_CHECKLIST_SCRIPT:-$REPO_ROOT/scripts/refresh-local-integration-checklist.sh}"
VALIDATE_SCRIPT="${VENTUREOS_CADENCE_VALIDATE_SCRIPT:-$REPO_ROOT/scripts/validate-evidence.sh}"

REPORT_DIR="${VENTUREOS_CADENCE_REPORT_DIR:-$REPO_ROOT/runtime/reports/local-integration-cadence}"
PREFLIGHT_REPORT_DIR="${VENTUREOS_INSTALL_REPORT_DIR:-$REPO_ROOT/runtime/reports/ventureos-install}"
PREFLIGHT_JSON="${VENTUREOS_PREFLIGHT_EVIDENCE_JSON:-$PREFLIGHT_REPORT_DIR/ventureos-install-preflight-evidence-latest.json}"
QUEUE_JSON="${VENTUREOS_QUEUE_EVIDENCE_JSON:-$REPO_ROOT/runtime/reports/pr-queue/queue-latest.json}"
CHECKLIST_PATH="${VENTUREOS_LOCAL_CHECKLIST_PATH:-$REPO_ROOT/docs/LOCAL_INTEGRATION_CHECKLIST.md}"
EVIDENCE_REPORT_DIR="${VENTUREOS_EVIDENCE_REPORT_DIR:-$REPO_ROOT/runtime/reports/evidence}"

forward_preflight_args=()

usage() {
  cat <<'EOF_USAGE'
run-local-integration-cadence.sh

Usage:
  bash scripts/run-local-integration-cadence.sh [options] [-- <extra preflight args>]

Options:
  --report-dir <path>           Cadence summary report directory
  --preflight-report-dir <path> Preflight evidence report directory
  --preflight-json <path>       Preflight evidence JSON path passed to checklist refresh
  --queue-json <path>           Queue sweep JSON output path
  --checklist-path <path>       Local integration checklist path
  --evidence-report-dir <path>  Evidence validation report output directory
  -h, --help                    Show help

Any args after `--` are forwarded to scripts/run-install-preflight-evidence.sh.
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
    --preflight-report-dir)
      need_value "$@"
      PREFLIGHT_REPORT_DIR="$2"
      shift 2
      ;;
    --preflight-json)
      need_value "$@"
      PREFLIGHT_JSON="$2"
      shift 2
      ;;
    --queue-json)
      need_value "$@"
      QUEUE_JSON="$2"
      shift 2
      ;;
    --checklist-path)
      need_value "$@"
      CHECKLIST_PATH="$2"
      shift 2
      ;;
    --evidence-report-dir)
      need_value "$@"
      EVIDENCE_REPORT_DIR="$2"
      shift 2
      ;;
    --)
      shift
      while [[ $# -gt 0 ]]; do
        forward_preflight_args+=("$1")
        shift
      done
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

for required_script in "$PREFLIGHT_SCRIPT" "$QUEUE_SCRIPT" "$CHECKLIST_SCRIPT" "$VALIDATE_SCRIPT"; do
  if [[ ! -f "$required_script" ]]; then
    echo "Required script not found: $required_script" >&2
    exit 1
  fi
done

mkdir -p "$REPORT_DIR"
mkdir -p "$(dirname "$QUEUE_JSON")"

timestamp_utc="$(date -u +%Y%m%dT%H%M%SZ)"
cadence_json="$REPORT_DIR/local-integration-cadence-${timestamp_utc}.json"
cadence_md="$REPORT_DIR/local-integration-cadence-${timestamp_utc}.md"
cadence_latest_json="$REPORT_DIR/local-integration-cadence-latest.json"
cadence_latest_md="$REPORT_DIR/local-integration-cadence-latest.md"

log_preflight="$REPORT_DIR/local-integration-cadence-${timestamp_utc}-preflight.log"
log_queue="$REPORT_DIR/local-integration-cadence-${timestamp_utc}-queue.log"
log_checklist="$REPORT_DIR/local-integration-cadence-${timestamp_utc}-checklist.log"
log_validate="$REPORT_DIR/local-integration-cadence-${timestamp_utc}-validate.log"

status_preflight="pending"
status_queue="pending"
status_checklist="pending"
status_validate="pending"
rc_preflight=0
rc_queue=0
rc_checklist=0
rc_validate=0

run_logged() {
  local log_path="$1"
  shift
  set +e
  "$@" > >(tee "$log_path") 2>&1
  local rc=$?
  set -e
  return "$rc"
}

preflight_cmd=(bash "$PREFLIGHT_SCRIPT" --report-dir "$PREFLIGHT_REPORT_DIR")
if [[ ${#forward_preflight_args[@]} -gt 0 ]]; then
  preflight_cmd+=(-- "${forward_preflight_args[@]}")
fi

if run_logged "$log_preflight" "${preflight_cmd[@]}"; then
  status_preflight="pass"
  rc_preflight=0
else
  rc_preflight=$?
  status_preflight="fail"
fi

queue_cmd=(bash "$QUEUE_SCRIPT" --json-out "$QUEUE_JSON")
if [[ "$status_preflight" == "pass" ]]; then
  if run_logged "$log_queue" "${queue_cmd[@]}"; then
    status_queue="pass"
    rc_queue=0
  else
    rc_queue=$?
    status_queue="fail"
  fi
else
  status_queue="skipped"
  rc_queue=0
  echo "SKIP queue-sweep :: preflight step failed" | tee "$log_queue" >/dev/null
fi

checklist_cmd=(bash "$CHECKLIST_SCRIPT" --checklist-path "$CHECKLIST_PATH" --preflight-json "$PREFLIGHT_JSON" --queue-json "$QUEUE_JSON")
if [[ "$status_preflight" == "pass" && "$status_queue" == "pass" ]]; then
  if run_logged "$log_checklist" "${checklist_cmd[@]}"; then
    status_checklist="pass"
    rc_checklist=0
  else
    rc_checklist=$?
    status_checklist="fail"
  fi
else
  status_checklist="skipped"
  rc_checklist=0
  echo "SKIP checklist-refresh :: upstream step failed" | tee "$log_checklist" >/dev/null
fi

validate_cmd=(bash "$VALIDATE_SCRIPT" --cadence daily --target latest --report-dir "$EVIDENCE_REPORT_DIR")
if [[ "$status_preflight" == "pass" && "$status_queue" == "pass" && "$status_checklist" == "pass" ]]; then
  if run_logged "$log_validate" "${validate_cmd[@]}"; then
    status_validate="pass"
    rc_validate=0
  else
    rc_validate=$?
    status_validate="fail"
  fi
else
  status_validate="skipped"
  rc_validate=0
  echo "SKIP evidence-validate :: upstream step failed" | tee "$log_validate" >/dev/null
fi

cadence_status="pass"
cadence_exit=0
if [[ "$status_preflight" == "fail" || "$status_queue" == "fail" || "$status_checklist" == "fail" || "$status_validate" == "fail" ]]; then
  cadence_status="fail"
  cadence_exit=1
fi

preflight_evidence_json="$(grep -E '^VENTUREOS_PREFLIGHT_EVIDENCE_JSON=' "$log_preflight" | tail -n 1 | cut -d= -f2- || true)"
preflight_evidence_md="$(grep -E '^VENTUREOS_PREFLIGHT_EVIDENCE_MD=' "$log_preflight" | tail -n 1 | cut -d= -f2- || true)"
queue_status_marker="$(grep -E '^PR_QUEUE_STATUS=' "$log_queue" | tail -n 1 | cut -d= -f2- || true)"
validate_json="$(grep -E '^EVIDENCE_VALIDATE_JSON=' "$log_validate" | tail -n 1 | cut -d= -f2- || true)"
validate_md="$(grep -E '^EVIDENCE_VALIDATE_MD=' "$log_validate" | tail -n 1 | cut -d= -f2- || true)"
validate_target="$(grep -E '^EVIDENCE_VALIDATE_TARGET=' "$log_validate" | tail -n 1 | cut -d= -f2- || true)"

python3 - "$cadence_json" "$cadence_md" "$REPO_ROOT" "$timestamp_utc" "$cadence_status" "$PREFLIGHT_SCRIPT" "$QUEUE_SCRIPT" "$CHECKLIST_SCRIPT" "$VALIDATE_SCRIPT" "$status_preflight" "$rc_preflight" "$log_preflight" "$preflight_evidence_json" "$preflight_evidence_md" "$status_queue" "$rc_queue" "$log_queue" "$QUEUE_JSON" "$queue_status_marker" "$status_checklist" "$rc_checklist" "$log_checklist" "$CHECKLIST_PATH" "$status_validate" "$rc_validate" "$log_validate" "$validate_json" "$validate_md" "$validate_target" <<'PY'
from __future__ import annotations

import json
import pathlib
import sys
from datetime import datetime, timezone

def rel(path_text: str, repo_root: pathlib.Path) -> str:
    p = pathlib.Path(path_text).expanduser()
    if not str(path_text):
        return "n/a"
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
status = sys.argv[5]

preflight = {
    "id": "preflight-evidence",
    "script": rel(sys.argv[6], repo_root),
    "status": sys.argv[10],
    "exitCode": int(sys.argv[11]),
    "log": rel(sys.argv[12], repo_root),
    "artifacts": {
        "preflightEvidenceJson": rel(sys.argv[13], repo_root),
        "preflightEvidenceMd": rel(sys.argv[14], repo_root),
    },
}
queue = {
    "id": "queue-sweep",
    "script": rel(sys.argv[7], repo_root),
    "status": sys.argv[15],
    "exitCode": int(sys.argv[16]),
    "log": rel(sys.argv[17], repo_root),
    "artifacts": {
        "queueJson": rel(sys.argv[18], repo_root),
    },
    "queueStatus": sys.argv[19] or "unknown",
}
checklist = {
    "id": "checklist-refresh",
    "script": rel(sys.argv[8], repo_root),
    "status": sys.argv[20],
    "exitCode": int(sys.argv[21]),
    "log": rel(sys.argv[22], repo_root),
    "artifacts": {
        "checklistPath": rel(sys.argv[23], repo_root),
    },
}
validate = {
    "id": "evidence-validate",
    "script": rel(sys.argv[9], repo_root),
    "status": sys.argv[24],
    "exitCode": int(sys.argv[25]),
    "log": rel(sys.argv[26], repo_root),
    "artifacts": {
        "validationJson": rel(sys.argv[27], repo_root),
        "validationMd": rel(sys.argv[28], repo_root),
        "validationTarget": sys.argv[29] or "unknown",
    },
}

payload = {
    "schemaVersion": 1,
    "generatedAtUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "timestampUtc": timestamp_utc,
    "status": status,
    "steps": [preflight, queue, checklist, validate],
}
out_json.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

lines = [
    "# Local Integration Cadence Summary",
    "",
    f"- Generated: `{payload['generatedAtUtc']}`",
    f"- Status: `{status.upper()}`",
    "",
    "| Step | Status | Exit Code | Log |",
    "|---|---|---|---|",
]
for row in payload["steps"]:
    lines.append(f"| `{row['id']}` | `{row['status']}` | `{row['exitCode']}` | `{row['log']}` |")

lines.extend([
    "",
    "## Artifacts",
    f"- Preflight evidence JSON: `{preflight['artifacts']['preflightEvidenceJson']}`",
    f"- Preflight evidence Markdown: `{preflight['artifacts']['preflightEvidenceMd']}`",
    f"- Queue JSON: `{queue['artifacts']['queueJson']}`",
    f"- Queue status marker: `{queue['queueStatus']}`",
    f"- Checklist path: `{checklist['artifacts']['checklistPath']}`",
    f"- Evidence validation JSON: `{validate['artifacts']['validationJson']}`",
    f"- Evidence validation Markdown: `{validate['artifacts']['validationMd']}`",
    f"- Evidence validation target: `{validate['artifacts']['validationTarget']}`",
])
out_md.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY

cp "$cadence_json" "$cadence_latest_json"
cp "$cadence_md" "$cadence_latest_md"

echo "Local integration cadence summary generated:"
echo "  - $cadence_json"
echo "  - $cadence_md"
echo "  - $cadence_latest_json"
echo "  - $cadence_latest_md"
echo "LOCAL_INTEGRATION_CADENCE_STATUS=$(printf '%s' "$cadence_status" | tr '[:lower:]' '[:upper:]')"
echo "LOCAL_INTEGRATION_CADENCE_JSON=$cadence_json"
echo "LOCAL_INTEGRATION_CADENCE_MD=$cadence_md"

exit "$cadence_exit"

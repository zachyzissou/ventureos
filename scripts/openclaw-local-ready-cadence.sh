#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/openclaw-local-defaults.sh"

REFRESH_SCRIPT="${OPENCLAW_LOCAL_READY_REFRESH_SCRIPT:-$REPO_ROOT/scripts/refresh-local-integration-ready.sh}"
REPORT_DIR="${OPENCLAW_LOCAL_READY_REPORT_DIR:-${SMOKE_REPORT_DIR:-$REPO_ROOT/runtime/reports/openclaw-local-smoke}}"
MAX_AGE_MIN="${OPENCLAW_LOCAL_READY_MAX_AGE_MIN:-360}"
RUN_REFRESH=1
EXTRA_REFRESH_ARGS=()

usage() {
  cat <<'EOF_USAGE'
openclaw-local-ready-cadence.sh

Usage:
  bash scripts/openclaw-local-ready-cadence.sh [options]

Options:
  --report-dir <path>        Report directory (default: runtime/reports/openclaw-local-smoke)
  --max-age-min <n>          Stale guardrail threshold (default: 360)
  --skip-refresh             Skip refresh invocation and read existing status artifact
  --help                     Show help

Notes:
  - By default, this command runs readiness refresh in status-only mode:
      refresh-local-integration-ready.sh --skip-smoke --max-age-min <n>
  - Generates cadence evidence artifacts:
      openclaw-local-ready-cadence-<timestamp>.json|md
      openclaw-local-ready-cadence-latest.json|md
  - Exit behavior:
      0  => cadence report generated and readiness status OK
      3  => stale guardrail violated
      4  => readiness status is ALERT (non-stale)
      2  => invalid inputs / missing required artifacts
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
    --max-age-min)
      need_value "$@"
      MAX_AGE_MIN="$2"
      shift 2
      ;;
    --skip-refresh)
      RUN_REFRESH=0
      shift
      ;;
    -h|--help|--usage)
      usage
      exit 0
      ;;
    *)
      EXTRA_REFRESH_ARGS+=("$1")
      shift
      ;;
  esac
done

if ! [[ "$MAX_AGE_MIN" =~ ^[0-9]+$ ]]; then
  echo "Invalid --max-age-min: $MAX_AGE_MIN" >&2
  exit 2
fi
if [[ "$RUN_REFRESH" == "1" && ! -f "$REFRESH_SCRIPT" ]]; then
  echo "Missing refresh script: $REFRESH_SCRIPT" >&2
  exit 2
fi

mkdir -p "$REPORT_DIR"

status_json="$REPORT_DIR/openclaw-local-ready-latest.json"
status_md="$REPORT_DIR/openclaw-local-ready-latest.md"
refresh_rc=0
refresh_output=""

if [[ "$RUN_REFRESH" == "1" ]]; then
  refresh_cmd=(
    bash "$REFRESH_SCRIPT"
    --skip-smoke
    --max-age-min "$MAX_AGE_MIN"
    --report-dir "$REPORT_DIR"
  )
  if [[ "${#EXTRA_REFRESH_ARGS[@]}" -gt 0 ]]; then
    refresh_cmd+=("${EXTRA_REFRESH_ARGS[@]}")
  fi

  set +e
  refresh_output="$("${refresh_cmd[@]}" 2>&1)"
  refresh_rc=$?
  set -e
  echo "$refresh_output"

  parsed_status_json="$(printf '%s\n' "$refresh_output" | awk -F= '/^REFRESH_STATUS_JSON=/{print $2}' | tail -n 1)"
  parsed_status_md="$(printf '%s\n' "$refresh_output" | awk -F= '/^REFRESH_STATUS_MD=/{print $2}' | tail -n 1)"
  if [[ -n "$parsed_status_json" ]]; then
    status_json="$parsed_status_json"
  fi
  if [[ -n "$parsed_status_md" ]]; then
    status_md="$parsed_status_md"
  fi
fi

if [[ ! -f "$status_json" ]]; then
  echo "Missing readiness status artifact: $status_json" >&2
  exit 2
fi

timestamp_utc="$(date -u +%Y%m%dT%H%M%SZ)"
cadence_json="$REPORT_DIR/openclaw-local-ready-cadence-${timestamp_utc}.json"
cadence_md="$REPORT_DIR/openclaw-local-ready-cadence-${timestamp_utc}.md"
cadence_latest_json="$REPORT_DIR/openclaw-local-ready-cadence-latest.json"
cadence_latest_md="$REPORT_DIR/openclaw-local-ready-cadence-latest.md"

cadence_output="$(python3 - "$status_json" "$status_md" "$cadence_json" "$cadence_md" "$cadence_latest_json" "$cadence_latest_md" "$refresh_rc" "$MAX_AGE_MIN" "$REPORT_DIR" "$REPO_ROOT" <<'PY'
from __future__ import annotations

import json
import pathlib
import shutil
import sys
from datetime import datetime, timezone

status_json = pathlib.Path(sys.argv[1]).resolve()
status_md = pathlib.Path(sys.argv[2]).resolve()
cadence_json = pathlib.Path(sys.argv[3]).resolve()
cadence_md = pathlib.Path(sys.argv[4]).resolve()
cadence_latest_json = pathlib.Path(sys.argv[5]).resolve()
cadence_latest_md = pathlib.Path(sys.argv[6]).resolve()
refresh_rc = int(sys.argv[7])
max_age_min = int(sys.argv[8])
report_dir = pathlib.Path(sys.argv[9]).resolve()
repo_root = pathlib.Path(sys.argv[10]).resolve()

payload = json.loads(status_json.read_text(encoding="utf-8"))
if not isinstance(payload, dict):
    raise SystemExit("Invalid readiness status payload: expected object")

summary = payload.get("summary")
guardrails = payload.get("guardrails")
if not isinstance(summary, dict):
    raise SystemExit("Invalid readiness status payload: missing summary object")
if not isinstance(guardrails, dict):
    raise SystemExit("Invalid readiness status payload: missing guardrails object")

top_blockers = payload.get("topBlockers", [])
if not isinstance(top_blockers, list):
    top_blockers = []

required_map = summary.get("requiredCheckStatusMap", {})
if not isinstance(required_map, dict):
    required_map = {}

stale = bool(guardrails.get("stale", False))
guardrail_rc = int(guardrails.get("guardrailRc", 0) or 0)
status = str(payload.get("status", "unknown")).lower()
if stale:
    cadence_status = "stale"
elif status == "ok":
    cadence_status = "ok"
else:
    cadence_status = "alert"

if refresh_rc != 0:
    final_rc = refresh_rc
elif cadence_status == "stale":
    final_rc = 3
elif cadence_status == "alert":
    final_rc = 4
else:
    final_rc = 0

def rel(path_value: str | pathlib.Path | None) -> str:
    if not path_value:
        return "n/a"
    path = pathlib.Path(path_value).resolve()
    try:
        return str(path.relative_to(repo_root))
    except ValueError:
        return str(path)

artifacts = payload.get("artifacts", {})
if not isinstance(artifacts, dict):
    artifacts = {}

next_commands: list[str] = []
for blocker in top_blockers:
    if not isinstance(blocker, dict):
        continue
    cmd = blocker.get("nextCommand")
    if isinstance(cmd, str) and cmd and cmd not in next_commands:
        next_commands.append(cmd)

if not next_commands:
    if cadence_status == "ok":
        next_commands.append("bash scripts/openclaw-local-ready-cadence.sh")
    else:
        next_commands.append("bash scripts/refresh-local-integration-ready.sh --max-age-min 360")

generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
cadence_payload = {
    "generatedAt": generated_at,
    "status": cadence_status,
    "exitCode": final_rc,
    "refreshExitCode": refresh_rc,
    "latestTimestamp": payload.get("latestTimestamp"),
    "latestAgeSeconds": payload.get("latestAgeSeconds"),
    "guardrails": {
        "maxAgeMin": max_age_min,
        "stale": stale,
        "guardrailRc": guardrail_rc,
    },
    "summary": {
        "verdict": summary.get("verdict"),
        "confidence": summary.get("confidence"),
        "readinessScore": summary.get("readinessScore"),
        "requiredFailures": summary.get("requiredFailures"),
        "warnings": summary.get("warnings"),
        "profile": summary.get("profile"),
        "dashboardUrl": summary.get("dashboardUrl"),
        "requiredCheckStatusMap": required_map,
    },
    "auth": payload.get("auth", {}),
    "topBlockers": top_blockers[:3],
    "nextCommands": next_commands,
    "evidenceBundle": {
        "readinessStatusJson": rel(status_json),
        "readinessStatusMarkdown": rel(status_md) if status_md.exists() else "n/a",
        "latestSmokeJson": str(artifacts.get("json", "n/a")),
        "latestSmokeMarkdown": str(artifacts.get("markdown", "n/a")),
        "latestSmokeSvg": str(artifacts.get("svg", "n/a")),
        "readinessDoc": str(artifacts.get("readinessDoc", "n/a")),
        "cadenceJson": rel(cadence_json),
        "cadenceMarkdown": rel(cadence_md),
    },
}

cadence_json.write_text(json.dumps(cadence_payload, indent=2) + "\n", encoding="utf-8")
shutil.copy2(cadence_json, cadence_latest_json)

lines = [
    "# Local Readiness Cadence Report",
    "",
    f"- Generated: `{generated_at}`",
    f"- Status: `{cadence_status.upper()}`",
    f"- Exit code: `{final_rc}`",
    f"- Refresh exit code: `{refresh_rc}`",
    f"- Latest timestamp: `{payload.get('latestTimestamp', 'n/a')}`",
    f"- Latest age seconds: `{payload.get('latestAgeSeconds', 'n/a')}`",
    f"- Stale guardrail: `{'STALE' if stale else 'fresh'}` (maxAgeMin={max_age_min})",
    "",
    "## Readiness Summary",
    f"- Verdict: `{str(summary.get('verdict', 'unknown')).upper()}`",
    f"- Readiness score: `{summary.get('readinessScore', 'n/a')}`",
    f"- Confidence: `{summary.get('confidence', 'n/a')}`",
    f"- Required failures: `{summary.get('requiredFailures', 'n/a')}`",
    f"- Warnings: `{summary.get('warnings', 'n/a')}`",
    f"- Dashboard URL: `{summary.get('dashboardUrl', 'n/a')}`",
    "",
    "## Evidence Bundle",
    f"- Readiness status JSON: `{cadence_payload['evidenceBundle']['readinessStatusJson']}`",
    f"- Readiness status Markdown: `{cadence_payload['evidenceBundle']['readinessStatusMarkdown']}`",
    f"- Latest smoke JSON: `{cadence_payload['evidenceBundle']['latestSmokeJson']}`",
    f"- Latest smoke Markdown: `{cadence_payload['evidenceBundle']['latestSmokeMarkdown']}`",
    f"- Latest smoke SVG: `{cadence_payload['evidenceBundle']['latestSmokeSvg']}`",
    f"- Readiness doc: `{cadence_payload['evidenceBundle']['readinessDoc']}`",
    f"- Cadence JSON: `{cadence_payload['evidenceBundle']['cadenceJson']}`",
    f"- Cadence Markdown: `{cadence_payload['evidenceBundle']['cadenceMarkdown']}`",
]

lines.extend(["", "## Top Blockers"])
if top_blockers:
    for blocker in top_blockers[:3]:
        if not isinstance(blocker, dict):
            continue
        lines.append(
            f"- `{blocker.get('id', 'unknown')}` "
            f"severity=`{blocker.get('severity', 'n/a')}` "
            f"cause: {blocker.get('likelyCause', 'n/a')} "
            f"next: `{blocker.get('nextCommand', 'n/a')}`"
        )
else:
    lines.append("- none")

lines.extend(["", "## Next Commands"])
for cmd in next_commands:
    lines.append(f"- `{cmd}`")

cadence_md.write_text("\n".join(lines) + "\n", encoding="utf-8")
shutil.copy2(cadence_md, cadence_latest_md)

print(f"CADENCE_STATUS={cadence_status}")
print(f"CADENCE_EXIT_CODE={final_rc}")
print(f"CADENCE_REPORT_JSON={cadence_json}")
print(f"CADENCE_REPORT_MD={cadence_md}")
print(f"CADENCE_REPORT_LATEST_JSON={cadence_latest_json}")
print(f"CADENCE_REPORT_LATEST_MD={cadence_latest_md}")
print(f"CADENCE_TOP_BLOCKERS={len(top_blockers[:3])}")
PY
)"

echo "$cadence_output"

cadence_status="$(printf '%s\n' "$cadence_output" | awk -F= '/^CADENCE_STATUS=/{print $2}' | tail -n 1)"
cadence_exit_code="$(printf '%s\n' "$cadence_output" | awk -F= '/^CADENCE_EXIT_CODE=/{print $2}' | tail -n 1)"
if ! [[ "$cadence_exit_code" =~ ^[0-9]+$ ]]; then
  echo "Invalid cadence exit code from cadence report generator: $cadence_exit_code" >&2
  exit 2
fi

echo "Local readiness cadence report generated:"
echo "  - $(printf '%s\n' "$cadence_output" | awk -F= '/^CADENCE_REPORT_JSON=/{print $2}' | tail -n 1)"
echo "  - $(printf '%s\n' "$cadence_output" | awk -F= '/^CADENCE_REPORT_MD=/{print $2}' | tail -n 1)"
echo "CADENCE_RESULT=$(printf '%s' "$cadence_status" | tr '[:lower:]' '[:upper:]')"

exit "$cadence_exit_code"

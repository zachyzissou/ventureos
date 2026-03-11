#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

INSTALL_SCRIPT="${VENTUREOS_PREFLIGHT_INSTALL_SCRIPT:-$REPO_ROOT/scripts/ventureos-install.sh}"
REPORT_DIR="${VENTUREOS_INSTALL_REPORT_DIR:-$REPO_ROOT/runtime/reports/ventureos-install}"
READINESS_STATUS_JSON="${VENTUREOS_PREFLIGHT_READINESS_STATUS_JSON:-${SMOKE_REPORT_DIR:-$REPO_ROOT/runtime/reports/openclaw-local-smoke}/openclaw-local-ready-latest.json}"

usage() {
  cat <<'EOF_USAGE'
run-install-preflight-evidence.sh

Usage:
  bash scripts/run-install-preflight-evidence.sh [options] [-- <extra installer args>]

Purpose:
  Run the required local-host installer preflight flow and emit a deterministic
  evidence bundle for issue/PR audit trails.

Default installer command:
  bash scripts/ventureos-install.sh --non-interactive --preflight-only --verify

Options:
  --report-dir <path>             Evidence/report output directory
  --readiness-status-json <path>  Path to readiness status JSON reference
  -h, --help                      Show help

Any unknown options are forwarded to ventureos-install.sh.
EOF_USAGE
}

need_value() {
  if [[ $# -lt 2 ]]; then
    echo "Missing value for $1" >&2
    exit 2
  fi
}

forward_args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --report-dir)
      need_value "$1" "$2"
      REPORT_DIR="$2"
      shift 2
      ;;
    --readiness-status-json)
      need_value "$1" "$2"
      READINESS_STATUS_JSON="$2"
      shift 2
      ;;
    --)
      shift
      while [[ $# -gt 0 ]]; do
        forward_args+=("$1")
        shift
      done
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      forward_args+=("$1")
      shift
      ;;
  esac
done

mkdir -p "$REPORT_DIR"
timestamp_utc="$(date -u +%Y%m%dT%H%M%SZ)"
run_log="$REPORT_DIR/ventureos-install-preflight-${timestamp_utc}.log"
evidence_json="$REPORT_DIR/ventureos-install-preflight-evidence-${timestamp_utc}.json"
evidence_md="$REPORT_DIR/ventureos-install-preflight-evidence-${timestamp_utc}.md"
latest_json="$REPORT_DIR/ventureos-install-preflight-evidence-latest.json"
latest_md="$REPORT_DIR/ventureos-install-preflight-evidence-latest.md"

install_cmd=(bash "$INSTALL_SCRIPT" --non-interactive --preflight-only --verify)
if [[ ${#forward_args[@]} -gt 0 ]]; then
  install_cmd+=("${forward_args[@]}")
fi
install_cmd_text="$(printf '%q ' "${install_cmd[@]}")"
install_cmd_text="${install_cmd_text% }"

set +e
(
  cd "$REPO_ROOT"
  VENTUREOS_INSTALL_REPORT_DIR="$REPORT_DIR" "${install_cmd[@]}"
) > >(tee "$run_log") 2>&1
install_rc=$?
set -e

install_result="unknown"
if grep -Eq '^VENTUREOS_INSTALL_RESULT=' "$run_log"; then
  install_result="$(grep -E '^VENTUREOS_INSTALL_RESULT=' "$run_log" | tail -n 1 | cut -d= -f2-)"
fi

restore_point=""
if grep -Eq '^VENTUREOS_INSTALL_RESTORE_POINT=' "$run_log"; then
  restore_point="$(grep -E '^VENTUREOS_INSTALL_RESTORE_POINT=' "$run_log" | tail -n 1 | cut -d= -f2-)"
fi

latest_install_report="$(ls -1t "$REPORT_DIR"/ventureos-install-[0-9]*.md 2>/dev/null | head -n 1 || true)"
latest_adoption_json="$(ls -1t "$REPORT_DIR"/ventureos-install-adoption-[0-9]*.json 2>/dev/null | head -n 1 || true)"
latest_onboarding_md="$(ls -1t "$REPORT_DIR"/ventureos-onboarding-[0-9]*.md 2>/dev/null | head -n 1 || true)"

python3 - "$REPO_ROOT" "$timestamp_utc" "$run_log" "$evidence_json" "$evidence_md" "$install_rc" "$install_result" "$restore_point" "$latest_install_report" "$latest_adoption_json" "$latest_onboarding_md" "$READINESS_STATUS_JSON" "$install_cmd_text" <<'PY'
from __future__ import annotations

import json
import pathlib
import sys
from datetime import datetime, timezone

repo_root = pathlib.Path(sys.argv[1]).resolve()
timestamp_utc = sys.argv[2]
run_log = pathlib.Path(sys.argv[3]).resolve()
evidence_json = pathlib.Path(sys.argv[4]).resolve()
evidence_md = pathlib.Path(sys.argv[5]).resolve()
install_rc = int(sys.argv[6])
install_result = sys.argv[7] or "unknown"
restore_point = sys.argv[8]
install_report = pathlib.Path(sys.argv[9]).resolve() if sys.argv[9] else None
adoption_json = pathlib.Path(sys.argv[10]).resolve() if sys.argv[10] else None
onboarding_md = pathlib.Path(sys.argv[11]).resolve() if sys.argv[11] else None
readiness_status = pathlib.Path(sys.argv[12]).expanduser().resolve()
install_cmd_text = sys.argv[13]


def rel(path: pathlib.Path | None) -> str:
    if path is None:
        return "n/a"
    try:
        return str(path.relative_to(repo_root))
    except ValueError:
        return str(path)

status = "pass" if install_rc == 0 else "fail"
readiness_exists = readiness_status.exists()

payload = {
    "schemaVersion": 1,
    "generatedAtUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "timestampUtc": timestamp_utc,
    "status": status,
    "installExitCode": install_rc,
    "installResult": install_result,
    "triggerPolicy": {
        "requiredWhen": [
            "Any merged change touches onboarding/install execution surfaces",
            "Any merged change modifies ventureos-install preflight/apply safety behavior",
        ],
        "issueAnchor": "#503",
    },
    "command": {
        "invocation": install_cmd_text,
        "nextRunExample": "bash scripts/run-install-preflight-evidence.sh -- --openclaw-dir $HOME/.openclaw --bridge-env $PWD/config/bridge.env",
    },
    "artifacts": {
        "runLog": rel(run_log),
        "installReport": rel(install_report),
        "adoptionEvidenceJson": rel(adoption_json),
        "onboardingTranscript": rel(onboarding_md),
        "readinessStatusJson": rel(readiness_status),
        "readinessStatusExists": readiness_exists,
    },
    "restorePoint": restore_point or "",
    "checklist": {
        "installerReportPresent": install_report is not None and install_report.exists(),
        "adoptionEvidencePresent": adoption_json is not None and adoption_json.exists(),
        "readinessStatusReferenced": bool(rel(readiness_status)),
    },
}

evidence_json.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

lines = [
    "# Installer Preflight Evidence Bundle",
    "",
    f"- Generated: `{payload['generatedAtUtc']}`",
    f"- Status: `{status}`",
    f"- Install exit code: `{install_rc}`",
    f"- Install result marker: `{install_result}`",
    f"- Policy anchor: `{payload['triggerPolicy']['issueAnchor']}`",
    "",
    "## Command",
    f"- Invocation: `{install_cmd_text}`",
    "",
    "## Required Evidence",
    f"- Run log: `{payload['artifacts']['runLog']}`",
    f"- Installer report: `{payload['artifacts']['installReport']}`",
    f"- Adoption evidence JSON: `{payload['artifacts']['adoptionEvidenceJson']}`",
    f"- Onboarding transcript: `{payload['artifacts']['onboardingTranscript']}`",
    f"- Readiness status JSON: `{payload['artifacts']['readinessStatusJson']}`",
    f"- Readiness status exists: `{'yes' if readiness_exists else 'no'}`",
    f"- Restore point: `{restore_point or 'n/a'}`",
    "",
    "## Trigger Conditions",
    "- Run this after merged changes that touch onboarding/install execution surfaces.",
    "- Run this after merged changes that modify `ventureos-install.sh` preflight or rollback semantics.",
    "",
    "## Checklist",
    f"- Installer report present: `{'yes' if payload['checklist']['installerReportPresent'] else 'no'}`",
    f"- Adoption evidence present: `{'yes' if payload['checklist']['adoptionEvidencePresent'] else 'no'}`",
    f"- Readiness status referenced: `{'yes' if payload['checklist']['readinessStatusReferenced'] else 'no'}`",
]

evidence_md.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY

cp "$evidence_json" "$latest_json"
cp "$evidence_md" "$latest_md"

echo "Preflight evidence bundle generated:"
echo "  - run log: $run_log"
echo "  - evidence json: $evidence_json"
echo "  - evidence md: $evidence_md"
echo "  - latest json: $latest_json"
echo "  - latest md: $latest_md"
echo "VENTUREOS_PREFLIGHT_EVIDENCE_STATUS=$( [[ "$install_rc" -eq 0 ]] && echo PASS || echo FAIL )"
echo "VENTUREOS_PREFLIGHT_EVIDENCE_JSON=$evidence_json"
echo "VENTUREOS_PREFLIGHT_EVIDENCE_MD=$evidence_md"

exit "$install_rc"

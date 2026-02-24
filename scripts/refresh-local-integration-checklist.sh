#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CHECKLIST_PATH="${VENTUREOS_LOCAL_CHECKLIST_PATH:-$REPO_ROOT/docs/LOCAL_INTEGRATION_CHECKLIST.md}"
PREFLIGHT_JSON="${VENTUREOS_PREFLIGHT_EVIDENCE_JSON:-$REPO_ROOT/runtime/reports/ventureos-install/ventureos-install-preflight-evidence-latest.json}"
QUEUE_JSON="${VENTUREOS_QUEUE_EVIDENCE_JSON:-$REPO_ROOT/runtime/reports/pr-queue/queue-latest.json}"
DRY_RUN=0

usage() {
  cat <<'EOF_USAGE'
refresh-local-integration-checklist.sh

Usage:
  bash scripts/refresh-local-integration-checklist.sh [options]

Options:
  --checklist-path <path>  Checklist markdown path (default: docs/LOCAL_INTEGRATION_CHECKLIST.md)
  --preflight-json <path>  Preflight evidence JSON (default: runtime/reports/ventureos-install/ventureos-install-preflight-evidence-latest.json)
  --queue-json <path>      Queue evidence JSON (default: runtime/reports/pr-queue/queue-latest.json)
  --dry-run                Print refreshed checklist to stdout without writing file
  -h, --help               Show help
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
    --checklist-path)
      need_value "$@"
      CHECKLIST_PATH="$2"
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
    --dry-run)
      DRY_RUN=1
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

if [[ ! -f "$CHECKLIST_PATH" ]]; then
  echo "Checklist file not found: $CHECKLIST_PATH" >&2
  exit 1
fi
if [[ ! -f "$PREFLIGHT_JSON" ]]; then
  echo "Preflight evidence JSON not found: $PREFLIGHT_JSON" >&2
  exit 1
fi
if [[ ! -f "$QUEUE_JSON" ]]; then
  echo "Queue evidence JSON not found: $QUEUE_JSON" >&2
  exit 1
fi

TMP_OUTPUT="$(mktemp)"
trap 'rm -f "$TMP_OUTPUT"' EXIT

python3 - "$REPO_ROOT" "$CHECKLIST_PATH" "$PREFLIGHT_JSON" "$QUEUE_JSON" "$TMP_OUTPUT" <<'PY'
from __future__ import annotations

import json
import pathlib
import re
import sys
from datetime import datetime, timezone

repo_root = pathlib.Path(sys.argv[1]).resolve()
checklist_path = pathlib.Path(sys.argv[2]).resolve()
preflight_path = pathlib.Path(sys.argv[3]).resolve()
queue_path = pathlib.Path(sys.argv[4]).resolve()
output_path = pathlib.Path(sys.argv[5]).resolve()

text = checklist_path.read_text(encoding="utf-8")
preflight = json.loads(preflight_path.read_text(encoding="utf-8"))
queue = json.loads(queue_path.read_text(encoding="utf-8"))

for key in ("generatedAtUtc", "installResult", "status", "artifacts", "command"):
    if key not in preflight:
        raise SystemExit(f"preflight evidence missing key: {key}")
if "summary" not in queue:
    raise SystemExit("queue evidence missing key: summary")

summary = queue.get("summary", {})
queue_status = str(summary.get("queueStatus", "unknown"))
queue_action = str(summary.get("recommendedAction", "n/a"))
queue_total = int(summary.get("totalOpen", 0))
queue_draft = int(summary.get("draft", 0))
queue_review_needed = int(summary.get("reviewNeeded", 0))
queue_approved_ready = int(summary.get("approvedMergeReady", 0))
queue_approved_blocked = int(summary.get("approvedBlocked", 0))

def rel(path_str: str) -> str:
    p = pathlib.Path(path_str).expanduser()
    if not p.is_absolute():
        return path_str
    try:
        return str(p.resolve().relative_to(repo_root))
    except Exception:
        return str(p)

generated = str(preflight.get("generatedAtUtc", ""))
generated_date = generated[:10] if len(generated) >= 10 else datetime.now(timezone.utc).strftime("%Y-%m-%d")

artifacts = preflight.get("artifacts", {})
preflight_status = str(preflight.get("status", "unknown")).upper()
install_result = str(preflight.get("installResult", "unknown"))
command_payload = preflight.get("command", {}) if isinstance(preflight.get("command"), dict) else {}
invocation = str(command_payload.get("nextRunExample") or command_payload.get("invocation") or "n/a")
restore_point = str(preflight.get("restorePoint", "") or "")
restore_point_ref = "n/a"
if restore_point:
    restore_path = pathlib.Path(restore_point).expanduser()
    manifest_candidate = restore_path / "restore-point.json"
    if manifest_candidate.exists():
        restore_point_ref = rel(str(manifest_candidate))
    else:
        restore_point_ref = rel(str(restore_path))

preflight_block = "\n".join(
    [
        "## Latest Preflight Evidence Result (Issue #520)",
        "",
        f"- Date (UTC): `{generated_date}`",
        f"- Generated: `{generated}`",
        f"- Install result marker: `{install_result}`",
        f"- Preflight evidence status: `{preflight_status}`",
        "- Command:",
        f"  - `{invocation}`",
        "",
        "Evidence artifacts:",
        f"- `{rel(str(preflight_path))}`",
        "- `runtime/reports/ventureos-install/ventureos-install-preflight-evidence-latest.md`",
        f"- `{artifacts.get('runLog', 'n/a')}`",
        f"- `{artifacts.get('installReport', 'n/a')}`",
        f"- `{artifacts.get('adoptionEvidenceJson', 'n/a')}`",
        f"- `{artifacts.get('onboardingTranscript', 'n/a')}`",
        f"- `{artifacts.get('readinessStatusJson', 'n/a')}`",
        f"- Restore point: `{restore_point_ref}`",
        "",
    ]
)

queue_block = "\n".join(
    [
        "## Latest Queue Cadence Result (Issue #522)",
        "",
        f"- Date (UTC): `{datetime.now(timezone.utc).strftime('%Y-%m-%d')}`",
        f"- Queue status: `{queue_status}`",
        f"- Recommended action: `{queue_action}`",
        "- Queue summary counts:",
        f"  - total_open=`{queue_total}` draft=`{queue_draft}` review_needed=`{queue_review_needed}` approved_merge_ready=`{queue_approved_ready}` approved_blocked=`{queue_approved_blocked}`",
        "- Command:",
        "  - `bash scripts/pr-queue-sweep.sh --json-out runtime/reports/pr-queue/queue-latest.json`",
        "- Artifact:",
        f"  - `{rel(str(queue_path))}`",
        "",
    ]
)

text, last_verified_replacements = re.subn(
    r"^Last verified: .*$",
    f"Last verified: {datetime.now(timezone.utc).strftime('%Y-%m-%d')}",
    text,
    count=1,
    flags=re.M,
)
if last_verified_replacements != 1:
    raise SystemExit("unable to update 'Last verified' line in checklist")

text, preflight_replacements = re.subn(
    r"## Latest Preflight Evidence Result \(Issue #520\)\n.*?\n## PR Queue Execution Cadence \(Issue #504\)\n",
    preflight_block + "\n## PR Queue Execution Cadence (Issue #504)\n",
    text,
    flags=re.S,
)
if preflight_replacements != 1:
    raise SystemExit("unable to replace 'Latest Preflight Evidence Result' section")

text, queue_replacements = re.subn(
    r"## Latest Queue Cadence Result \(Issue #522\)\n.*?\n## Latest Installer Drill Result\n",
    queue_block + "\n## Latest Installer Drill Result\n",
    text,
    flags=re.S,
)
if queue_replacements != 1:
    raise SystemExit("unable to replace 'Latest Queue Cadence Result' section")

output_path.write_text(text, encoding="utf-8")
PY

if [[ "$DRY_RUN" == "1" ]]; then
  cat "$TMP_OUTPUT"
  echo "LOCAL_INTEGRATION_CHECKLIST_REFRESH_RESULT=DRY_RUN"
  exit 0
fi

cp "$TMP_OUTPUT" "$CHECKLIST_PATH"
echo "Refreshed local integration checklist:"
echo "  - $CHECKLIST_PATH"
echo "  - preflight evidence: $PREFLIGHT_JSON"
echo "  - queue evidence: $QUEUE_JSON"
echo "LOCAL_INTEGRATION_CHECKLIST_REFRESH_RESULT=PASS"

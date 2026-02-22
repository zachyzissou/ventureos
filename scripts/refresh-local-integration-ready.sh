#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SMOKE_SCRIPT="$REPO_ROOT/scripts/openclaw-local-smoke.sh"
REPORT_DIR="${SMOKE_REPORT_DIR:-$REPO_ROOT/runtime/reports/openclaw-local-smoke}"
OUTPUT_DOC="$REPO_ROOT/docs/LOCAL_INTEGRATION_READY.md"
HISTORY_LIMIT=7
RUN_SMOKE=1
SMOKE_ARGS=()

usage() {
  cat <<EOF_USAGE
refresh-local-integration-ready.sh

Usage:
  bash scripts/refresh-local-integration-ready.sh [options]

Options:
  --output-doc <path>          Output markdown path (default: docs/LOCAL_INTEGRATION_READY.md)
  --report-dir <path>          Smoke report directory (default: runtime/reports/openclaw-local-smoke)
  --history-limit <n>          Number of historical runs in trend table (default: 7)
  --skip-smoke                 Do not run smoke; refresh doc from existing artifacts

  Forwarded smoke options:
  --dashboard-url <url>
  --token-file <path>
  --timeout-sec <n>
  --profile <quick|full|bridge>
  --bridge-url <url>
  --bridge-token-file <path>
  --skip-openclaw-cli
  --skip-map
  --skip-bridge

  -h, --help                   Show help
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
    --output-doc)
      need_value "$@"
      OUTPUT_DOC="$2"
      shift 2
      ;;
    --report-dir)
      need_value "$@"
      REPORT_DIR="$2"
      shift 2
      ;;
    --history-limit)
      need_value "$@"
      HISTORY_LIMIT="$2"
      shift 2
      ;;
    --skip-smoke)
      RUN_SMOKE=0
      shift
      ;;
    --dashboard-url|--token-file|--timeout-sec|--profile|--bridge-url|--bridge-token-file)
      need_value "$@"
      SMOKE_ARGS+=("$1" "$2")
      shift 2
      ;;
    --skip-openclaw-cli|--skip-map|--skip-bridge)
      SMOKE_ARGS+=("$1")
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

if ! [[ "$HISTORY_LIMIT" =~ ^[0-9]+$ ]] || [[ "$HISTORY_LIMIT" -lt 1 ]]; then
  echo "Invalid --history-limit: $HISTORY_LIMIT" >&2
  exit 2
fi

if [[ "${#SMOKE_ARGS[@]}" -gt 0 ]]; then
  SMOKE_ARGS=(--report-dir "$REPORT_DIR" "${SMOKE_ARGS[@]}")
else
  SMOKE_ARGS=(--report-dir "$REPORT_DIR")
fi

smoke_rc=0
if [[ "$RUN_SMOKE" == "1" ]]; then
  set +e
  bash "$SMOKE_SCRIPT" "${SMOKE_ARGS[@]}"
  smoke_rc=$?
  set -e
fi

python3 - "$REPORT_DIR" "$OUTPUT_DOC" "$REPO_ROOT" "$smoke_rc" "$HISTORY_LIMIT" <<'PY'
from __future__ import annotations

import json
import pathlib
import re
import sys
from datetime import datetime, timezone

report_dir = pathlib.Path(sys.argv[1]).resolve()
output_path = pathlib.Path(sys.argv[2]).resolve()
repo_root = pathlib.Path(sys.argv[3]).resolve()
smoke_rc = int(sys.argv[4])
history_limit = int(sys.argv[5])

if not report_dir.exists() or not report_dir.is_dir():
    raise SystemExit(f"No report directory found: {report_dir}")

pattern = re.compile(r"^openclaw-local-smoke-(\d{8}T\d{6}Z)\.(json|md|svg)$")
json_by_ts: dict[str, pathlib.Path] = {}
md_by_ts: dict[str, pathlib.Path] = {}
svg_by_ts: dict[str, pathlib.Path] = {}

for path in report_dir.iterdir():
    if not path.is_file():
        continue
    match = pattern.match(path.name)
    if not match:
        continue
    ts, ext = match.group(1), match.group(2)
    if ext == "json":
        json_by_ts[ts] = path.resolve()
    elif ext == "md":
        md_by_ts[ts] = path.resolve()
    elif ext == "svg":
        svg_by_ts[ts] = path.resolve()

if not json_by_ts or not md_by_ts:
    raise SystemExit(f"No smoke artifacts found in {report_dir}")
if not svg_by_ts:
    raise SystemExit(
        f"No smoke SVG artifacts found in {report_dir}. "
        "Run smoke again to generate a complete evidence set."
    )

latest_json_ts = max(json_by_ts.keys())
latest_md_ts = max(md_by_ts.keys())
latest_svg_ts = max(svg_by_ts.keys())
if latest_json_ts != latest_md_ts or latest_json_ts != latest_svg_ts:
    raise SystemExit(
        "Latest smoke artifacts are mismatched "
        f"(latest json={latest_json_ts}, latest md={latest_md_ts}, latest svg={latest_svg_ts}). "
        "Run smoke again to produce a paired set."
    )

paired_timestamps = sorted(set(json_by_ts.keys()) & set(md_by_ts.keys()))
if not paired_timestamps:
    raise SystemExit("No paired smoke JSON/MD artifacts found")

latest_ts = paired_timestamps[-1]
latest_json = json_by_ts[latest_ts]
latest_md = md_by_ts[latest_ts]
latest_svg = svg_by_ts[latest_ts]

payload = json.loads(latest_json.read_text(encoding="utf-8"))

summary = payload.get("summary")
checks = payload.get("checks")
if not isinstance(summary, dict):
    raise SystemExit("Invalid smoke report schema: summary must be an object")
if not isinstance(checks, list):
    raise SystemExit("Invalid smoke report schema: checks must be an array")

required_summary_fields = {
    "profile": str,
    "requiredFailures": int,
    "requiredSkipped": int,
    "warnings": int,
    "totalChecks": int,
    "passCount": int,
    "failCount": int,
    "skippedCount": int,
    "status": str,
    "verdict": str,
    "readinessScore": int,
    "confidence": str,
}
for field, expected in required_summary_fields.items():
    if field not in summary:
        raise SystemExit(f"Invalid smoke report schema: summary.{field} is missing")
    if not isinstance(summary[field], expected):
        raise SystemExit(f"Invalid smoke report schema: summary.{field} has wrong type")

if summary["status"] not in {"pass", "fail"}:
    raise SystemExit("Invalid smoke report schema: summary.status must be pass|fail")
if summary["verdict"] not in {"go", "hold", "blocked"}:
    raise SystemExit("Invalid smoke report schema: summary.verdict must be go|hold|blocked")
if summary["confidence"] not in {"high", "medium", "low"}:
    raise SystemExit("Invalid smoke report schema: summary.confidence must be high|medium|low")
if not 0 <= summary["readinessScore"] <= 100:
    raise SystemExit("Invalid smoke report schema: summary.readinessScore must be 0..100")

severity_values = {"critical", "warn", "info", "critical-optional"}
for idx, check in enumerate(checks):
    if not isinstance(check, dict):
        raise SystemExit(f"Invalid smoke report schema: checks[{idx}] must be an object")
    for field in (
        "id",
        "required",
        "status",
        "durationMs",
        "description",
        "detail",
        "group",
        "severity",
        "likelyCause",
        "nextCommand",
        "owner",
    ):
        if field not in check:
            raise SystemExit(f"Invalid smoke report schema: checks[{idx}].{field} is missing")
    if check["status"] not in {"pass", "fail", "skipped"}:
        raise SystemExit(f"Invalid smoke report schema: checks[{idx}].status is invalid")
    if check["severity"] not in severity_values:
        raise SystemExit(f"Invalid smoke report schema: checks[{idx}].severity is invalid")

history_timestamps = paired_timestamps[-history_limit:]

history_rows = []
for ts in history_timestamps:
    row_payload = json.loads(json_by_ts[ts].read_text(encoding="utf-8"))
    row_summary = row_payload.get("summary", {})
    bridge_row = next((c for c in row_payload.get("checks", []) if c.get("id") == "bridge-scheduler-jobs"), None)
    history_rows.append(
        {
            "ts": ts,
            "verdict": str(row_summary.get("verdict", "unknown")),
            "score": row_summary.get("readinessScore", "n/a"),
            "requiredFailures": row_summary.get("requiredFailures", "n/a"),
            "warnings": row_summary.get("warnings", "n/a"),
            "bridge": bridge_row.get("status", "n/a") if isinstance(bridge_row, dict) else "n/a",
        }
    )

severity_rank = {"critical": 100, "critical-optional": 80, "warn": 40, "info": 20}
failed_checks = [c for c in checks if c.get("status") == "fail"]
failed_checks.sort(
    key=lambda c: (
        0 if c.get("required") else 1,
        -severity_rank.get(str(c.get("severity", "info")), 0),
        str(c.get("id", "")),
    )
)

def rel(path: pathlib.Path) -> str:
    try:
        return str(path.relative_to(repo_root))
    except Exception:
        return str(path)

now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d")
verdict = str(summary["verdict"]).upper()

status_strip_rel = rel(latest_svg)

out = [
    "# Local Integration Ready Checklist",
    "",
    f"Date: {now_utc} (UTC)",
    "Owner: automated refresh via `scripts/refresh-local-integration-ready.sh`",
    "",
    "## Mission Control Card",
    f"- Verdict: `{verdict}`",
    f"- Readiness score: `{summary['readinessScore']}`",
    f"- Confidence: `{summary['confidence']}`",
    f"- Profile: `{summary['profile']}`",
    f"- Required failures: `{summary['requiredFailures']}`",
    f"- Required skipped: `{summary['requiredSkipped']}`",
    f"- Warnings: `{summary['warnings']}`",
    "",
    "## Latest Evidence Artifacts",
    f"- JSON: `{rel(latest_json)}`",
    f"- Markdown: `{rel(latest_md)}`",
    f"- Status strip SVG: `{status_strip_rel}`",
]

if latest_svg:
    try:
        svg_ref = latest_svg.relative_to(output_path.parent)
        out.append(f"- Status strip preview: ![]({svg_ref.as_posix()})")
    except Exception:
        pass

out.extend([
    "",
    "## Top 3 Blockers",
])

if failed_checks:
    for blocker in failed_checks[:3]:
        out.append(
            "- "
            f"`{blocker.get('id', 'unknown')}` "
            f"owner=`{blocker.get('owner', 'Ops')}`; "
            f"cause: {blocker.get('likelyCause', 'unknown cause')}; "
            f"next: `{blocker.get('nextCommand', 'n/a')}`"
        )
else:
    out.append("- No blockers in latest run.")

out.extend([
    "",
    f"## Trend (Last {len(history_rows)} Runs)",
    "| Timestamp | Verdict | Score | Required Failures | Warnings | Bridge |",
    "|---|---|---:|---:|---:|---|",
])
for row in history_rows:
    out.append(
        f"| `{row['ts']}` | `{str(row['verdict']).upper()}` | {row['score']} | {row['requiredFailures']} | {row['warnings']} | `{row['bridge']}` |"
    )

required_checks = [c for c in checks if c.get("required") is True]
optional_checks = [c for c in checks if c.get("required") is not True]


def format_check_line(check: dict) -> str:
    status = str(check.get("status", "unknown"))
    prefix = "[x]" if status == "pass" else "[ ]" if status == "fail" else "[-]"
    detail = str(check.get("detail", "")).strip() or "n/a"
    line = (
        f"- {prefix} `{check.get('id', 'unknown')}` — `{status}` "
        f"group=`{check.get('group', 'n/a')}` severity=`{check.get('severity', 'n/a')}` "
        f"({detail})"
    )
    if status == "fail":
        line += (
            f"; cause: {check.get('likelyCause', 'unknown cause')}"
            f"; next: `{check.get('nextCommand', 'n/a')}`"
        )
    return line

out.extend([
    "",
    "## Required Checks",
])
if required_checks:
    out.extend(format_check_line(c) for c in required_checks)
else:
    out.append("- (none found)")

out.extend([
    "",
    "## Optional Checks",
])
if optional_checks:
    out.extend(format_check_line(c) for c in optional_checks)
else:
    out.append("- (none found)")

bridge_check = next((c for c in checks if c.get("id") == "bridge-scheduler-jobs"), None)
bridge_note = "n/a"
if bridge_check:
    bridge_note = f"{bridge_check.get('status', 'unknown')}: {bridge_check.get('detail', 'n/a')}"

out.extend([
    "",
    "## Bridge Token Setup Note",
    "- Direct bridge checks support `--bridge-token-file`, `BRIDGE_TOKEN`, `BRIDGE_TOKEN_FILE`, or default `OPENCLAW_DIR/bridge/bridge-token`.",
    f"- Latest bridge check: `{bridge_note}`",
    "",
    "## Refresh Command",
    "```bash",
    "bash scripts/refresh-local-integration-ready.sh",
    "```",
])

if smoke_rc != 0:
    out.extend([
        "",
        "## Run Exit Note",
        f"- The smoke command exited non-zero (`{smoke_rc}`). This document still reflects the latest generated report.",
    ])

output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text("\n".join(out) + "\n", encoding="utf-8")
print(f"REFRESH_SOURCE_JSON={latest_json}")
print(f"REFRESH_SOURCE_MD={latest_md}")
if latest_svg:
    print(f"REFRESH_SOURCE_SVG={latest_svg}")
PY

echo "Local integration readiness refreshed:"
echo "  - $OUTPUT_DOC"

if [[ "$RUN_SMOKE" == "1" ]]; then
  exit "$smoke_rc"
fi
exit 0

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/validate-evidence.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

DATE="2026-03-16"
prepare_bundle() {
  local daily_dir="$1"
  local mode="$2"
  mkdir -p "$daily_dir"
  cp "$ROOT/runtime/logs/daily/agent-health.json" "$daily_dir/$DATE-agent-health.json"
  cp "$ROOT/runtime/logs/daily/spend.json" "$daily_dir/$DATE-spend.json"
  cp "$ROOT/runtime/logs/daily/kpi-snapshot.json" "$daily_dir/$DATE-kpi-snapshot.json"
  cp "$ROOT/runtime/logs/daily/handoff-ledger.json" "$daily_dir/$DATE-handoff-ledger.json"
  cp "$ROOT/runtime/logs/daily/decision-log.md" "$daily_dir/$DATE-decision-log.md"
  cp "$ROOT/runtime/logs/daily/day1-go-no-go.md" "$daily_dir/$DATE-go-no-go.md"
  python3 - "$daily_dir" "$DATE" "$mode" <<'PY'
import json
import pathlib
import sys

daily_dir = pathlib.Path(sys.argv[1])
date = sys.argv[2]
mode = sys.argv[3]
captured = f"{date}T08:00:00Z"
for name in ("agent-health.json", "spend.json", "kpi-snapshot.json", "handoff-ledger.json"):
    path = daily_dir / f"{date}-{name}"
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["date"] = date
    payload["captured_at"] = captured
    if name == "handoff-ledger.json":
        handoffs = payload["handoffs"]
        for handoff in handoffs:
            if mode == "all-on-time":
                handoff["compliance_status"] = "on_time"
                handoff["sla_status"] = "on_time"
                handoff.pop("breach_level", None)
                handoff.pop("breach_owner", None)
                handoff.pop("breach_action", None)
                handoff.pop("exception_approved_by", None)
                handoff.pop("exception_expires_at", None)
                if handoff["handoff_id"] == "h-003":
                    handoff["sla_target_minutes"] = 240
                    handoff["latency_minutes"] = 190
            elif mode == "late-missing-breach-fields" and handoff["handoff_id"] == "h-003":
                handoff["compliance_status"] = "late"
                handoff["sla_status"] = "late"
                handoff["sla_target_minutes"] = 60
                handoff["latency_minutes"] = 190
                handoff.pop("breach_level", None)
                handoff.pop("breach_owner", None)
                handoff.pop("breach_action", None)
                handoff.pop("exception_approved_by", None)
                handoff.pop("exception_expires_at", None)
            elif mode == "exception-approved" and handoff["handoff_id"] == "h-003":
                handoff["compliance_status"] = "exception"
                handoff["sla_status"] = "exception"
                handoff["breach_level"] = "level_3"
                handoff["breach_owner"] = "executive_office:director"
                handoff["breach_action"] = "Defer downstream closeout until the approved exception window expires."
                handoff["exception_approved_by"] = "executive_office:director"
                handoff["exception_expires_at"] = "2026-03-17T12:00:00Z"

        compliance_values = [handoff.get("compliance_status", handoff.get("sla_status")) for handoff in handoffs]
        payload["summary"] = {
            "total_handoffs": len(handoffs),
            "on_time_handoffs": sum(1 for value in compliance_values if value == "on_time"),
            "late_handoffs": sum(1 for value in compliance_values if value == "late"),
            "exception_handoffs": sum(1 for value in compliance_values if value == "exception"),
            "on_time_rate": round(sum(1 for value in compliance_values if value == "on_time") / len(handoffs), 4),
            "level_1_breaches": sum(1 for handoff in handoffs if handoff.get("breach_level") == "level_1"),
            "level_2_breaches": sum(1 for handoff in handoffs if handoff.get("breach_level") == "level_2"),
            "level_3_breaches": sum(1 for handoff in handoffs if handoff.get("breach_level") == "level_3"),
        }
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY
}

run_case() {
  local mode="$1"
  local expected_status="$2"
  local out_file="$TMP_DIR/$mode.out"
  local daily_dir="$TMP_DIR/$mode/runtime/logs/daily"
  local report_dir="$TMP_DIR/$mode/runtime/reports/evidence"
  prepare_bundle "$daily_dir" "$mode"

  set +e
  VENTUREOS_ROOT="$ROOT" \
  VENTUREOS_EVIDENCE_DAILY_DIR="$daily_dir" \
  bash "$SCRIPT" --cadence daily --target "$DATE" --report-dir "$report_dir" > "$out_file" 2>&1
  local rc=$?
  set -e

  if [[ "$expected_status" == "PASS" && "$rc" -ne 0 ]]; then
    cat "$out_file" >&2
    exit 1
  fi
  if [[ "$expected_status" == "FAIL" && "$rc" -eq 0 ]]; then
    cat "$out_file" >&2
    exit 1
  fi

  grep -q "^EVIDENCE_VALIDATE_STATUS=$expected_status" "$out_file"
  local json_path
  json_path="$(grep -E '^EVIDENCE_VALIDATE_JSON=' "$out_file" | tail -n 1 | cut -d= -f2-)"
  [[ -f "$json_path" ]]
  python3 - "$json_path" "$expected_status" "$mode" <<'PY'
import json
import pathlib
import sys

payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
expected = sys.argv[2].lower()
mode = sys.argv[3]
assert payload['status'] == expected, payload
assert payload['cadence'] == 'daily', payload
assert len(payload['artifacts']) == 6, payload
if mode == 'late-missing-breach-fields':
    assert any('missing breach_owner' in failure for failure in payload['failures']), payload
    assert any('missing breach_action' in failure for failure in payload['failures']), payload
if mode == 'exception-approved':
    assert payload['status'] == 'pass', payload
print(f"CASE_OK:{mode}")
PY
}

run_case "all-on-time" "PASS"
run_case "late-missing-breach-fields" "FAIL"
run_case "exception-approved" "PASS"

echo "VALIDATE_EVIDENCE_TEST_OK"

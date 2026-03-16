#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/phase0-readiness.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

DATE="2026-03-16"
ISO_WEEK="2026-W12"

prepare_case_root() {
  local case_root="$1"
  local mode="$2"

  mkdir -p \
    "$case_root/docs" \
    "$case_root/runtime/logs/daily" \
    "$case_root/runtime/logs/weekly" \
    "$case_root/runtime/logs/monthly" \
    "$case_root/runtime/logs/git-hooks" \
    "$case_root/runtime/reports/openclaw-local-smoke" \
    "$case_root/runtime/reports/post-merge-cadence" \
    "$case_root/schemas/evidence"

  cp "$ROOT/schemas/evidence/"*.json "$case_root/schemas/evidence/"
  cp "$ROOT/runtime/logs/daily/agent-health.json" "$case_root/runtime/logs/daily/$DATE-agent-health.json"
  cp "$ROOT/runtime/logs/daily/spend.json" "$case_root/runtime/logs/daily/$DATE-spend.json"
  cp "$ROOT/runtime/logs/daily/kpi-snapshot.json" "$case_root/runtime/logs/daily/$DATE-kpi-snapshot.json"
  cp "$ROOT/runtime/logs/daily/handoff-ledger.json" "$case_root/runtime/logs/daily/$DATE-handoff-ledger.json"
  cp "$ROOT/runtime/logs/daily/decision-log.md" "$case_root/runtime/logs/daily/$DATE-decision-log.md"
  cp "$ROOT/runtime/logs/daily/day1-go-no-go.md" "$case_root/runtime/logs/daily/$DATE-go-no-go.md"

  python3 - "$case_root/runtime/logs/daily" "$mode" <<'PY'
import json
import pathlib
import sys

daily_dir = pathlib.Path(sys.argv[1])
mode = sys.argv[2]
date = "2026-03-16"
captured = "2026-03-16T08:00:00Z"

for path in daily_dir.glob(f"{date}-*.json"):
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["date"] = date
    payload["captured_at"] = captured
    if path.name.endswith("handoff-ledger.json"):
        handoffs = payload["handoffs"]
        for handoff in handoffs:
            if mode == "pass":
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
            elif mode == "handoff-sla-fail" and handoff["handoff_id"] == "h-003":
                handoff["compliance_status"] = "late"
                handoff["sla_status"] = "late"
                handoff["sla_target_minutes"] = 60
                handoff["latency_minutes"] = 190
                handoff["breach_level"] = "level_1"
                handoff["breach_owner"] = "finance:director"
                handoff["breach_action"] = "Escalate manual reconciliation coverage and republish before closeout."

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

  cat > "$case_root/runtime/logs/weekly/$ISO_WEEK-kpi-rollup.json" <<'JSON'
{"schemaVersion":1,"generatedAtUtc":"2026-03-16T08:00:00Z","isoWeek":"2026-W12","daysCovered":1,"completeDays":1,"incompleteDays":0,"dailyCoverage":[{"date":"2026-03-16","artifacts":["agent_health","spend_snapshot","kpi_snapshot","handoff_ledger","decision_log","go_no_go"],"complete":true}]}
JSON
  cat > "$case_root/runtime/logs/weekly/$ISO_WEEK-ops-review.md" <<'MD'
# Weekly Ops Review — 2026-W12

## Coverage
- Days covered: `1`

## Highlights
- 2026-03-16: complete evidence set

## Actions
- Continue cadence.
MD
  cat > "$case_root/runtime/logs/weekly/$ISO_WEEK-risk-register.md" <<'MD'
# Weekly Risk Register — 2026-W12

## Open Risks
- No material evidence coverage gaps detected this week.

## Mitigations
- Maintain daily evidence cadence and freshness checks.
MD
  cat > "$case_root/docs/VentureOS_Department_Architecture_v1.md" <<'MD'
# VentureOS Department Architecture v1
MD
  cat > "$case_root/docs/LOCAL_INTEGRATION_CHECKLIST.md" <<'MD'
# Local Integration Checklist
MD
  cat > "$case_root/runtime/reports/openclaw-local-smoke/openclaw-local-ready-latest.json" <<'JSON'
{"status":"ok","generatedAt":"2026-03-16T08:00:00Z"}
JSON
  cat > "$case_root/runtime/reports/post-merge-cadence/post-merge-cadence-latest.json" <<'JSON'
{"generatedAtUtc":"2026-03-16T08:00:00Z"}
JSON
  echo 'hook ok' > "$case_root/runtime/logs/git-hooks/post-merge-cadence-20260316T080000Z.log"
}

run_case() {
  local mode="$1"
  local expected_status="$2"
  local case_root="$TMP_DIR/$mode"
  local out_file="$case_root/out.txt"
  prepare_case_root "$case_root" "$mode"

  set +e
  TZ=UTC \
  VENTUREOS_ROOT="$case_root" \
  bash "$SCRIPT" --no-local-integration-mode --no-hook-mode > "$out_file" 2>&1
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

  grep -q "^PHASE0_READINESS_STATUS=$expected_status" "$out_file"
  local json_path
  json_path="$(grep -E '^PHASE0_READINESS_JSON=' "$out_file" | tail -n 1 | cut -d= -f2-)"
  [[ -f "$json_path" ]]
  python3 - "$json_path" "$mode" "$expected_status" <<'PY'
import json
import pathlib
import sys

payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
mode = sys.argv[2]
expected = sys.argv[3].lower()
assert payload['status'] == expected, payload
if mode == 'pass':
    assert payload['status'] == 'pass', payload
    assert not payload['failingGates'], payload
if mode == 'handoff-sla-fail':
    assert payload['status'] == 'fail', payload
    assert 'handoff-sla' in payload['failingGates'], payload
print(f"READINESS_CASE_OK:{mode}")
PY
}

run_case "pass" "PASS"
run_case "handoff-sla-fail" "FAIL"

echo "PHASE0_READINESS_TEST_OK"

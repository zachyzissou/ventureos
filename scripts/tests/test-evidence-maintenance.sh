#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DAILY_SCRIPT="$ROOT/scripts/run-evidence-daily.sh"
RETENTION_SCRIPT="$ROOT/scripts/evidence-retention.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

DATE="$(python3 - <<'PY'
from datetime import datetime, timezone
print(datetime.now(timezone.utc).strftime('%Y-%m-%d'))
PY
)"

CASE_ROOT="$TMP_DIR/case"
mkdir -p \
  "$CASE_ROOT/runtime/logs/daily" \
  "$CASE_ROOT/runtime/logs/weekly" \
  "$CASE_ROOT/runtime/logs/monthly" \
  "$CASE_ROOT/runtime/logs/incidents" \
  "$CASE_ROOT/runtime/reports/evidence" \
  "$CASE_ROOT/runtime/reports/phase0-readiness" \
  "$CASE_ROOT/schemas/evidence"

cp "$ROOT/schemas/evidence/"*.json "$CASE_ROOT/schemas/evidence/"
cp "$ROOT/runtime/logs/daily/agent-health.json" "$CASE_ROOT/runtime/logs/daily/$DATE-agent-health.json"
cp "$ROOT/runtime/logs/daily/spend.json" "$CASE_ROOT/runtime/logs/daily/$DATE-spend.json"
cp "$ROOT/runtime/logs/daily/kpi-snapshot.json" "$CASE_ROOT/runtime/logs/daily/$DATE-kpi-snapshot.json"
cp "$ROOT/runtime/logs/daily/handoff-ledger.json" "$CASE_ROOT/runtime/logs/daily/$DATE-handoff-ledger.json"
cp "$ROOT/runtime/logs/daily/decision-log.md" "$CASE_ROOT/runtime/logs/daily/$DATE-decision-log.md"
cp "$ROOT/runtime/logs/daily/day1-go-no-go.md" "$CASE_ROOT/runtime/logs/daily/$DATE-go-no-go.md"

python3 - "$CASE_ROOT/runtime/logs/daily" "$DATE" <<'PY'
import json
import pathlib
import sys
from datetime import datetime, timezone

daily_dir = pathlib.Path(sys.argv[1])
date = sys.argv[2]
captured = datetime.now(timezone.utc).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")

for path in daily_dir.glob(f"{date}-*.json"):
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["date"] = date
    payload["captured_at"] = captured
    if path.name.endswith("handoff-ledger.json"):
        for handoff in payload["handoffs"]:
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
        payload["summary"] = {
            "total_handoffs": len(payload["handoffs"]),
            "on_time_handoffs": len(payload["handoffs"]),
            "late_handoffs": 0,
            "exception_handoffs": 0,
            "on_time_rate": 1.0,
            "level_1_breaches": 0,
            "level_2_breaches": 0,
            "level_3_breaches": 0,
        }
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY

DAILY_OUT="$TMP_DIR/daily.out"
VENTUREOS_ROOT="$CASE_ROOT" \
VENTUREOS_EVIDENCE_DAILY_DIR="$CASE_ROOT/runtime/logs/daily" \
VENTUREOS_EVIDENCE_WEEKLY_DIR="$CASE_ROOT/runtime/logs/weekly" \
VENTUREOS_EVIDENCE_MONTHLY_DIR="$CASE_ROOT/runtime/logs/monthly" \
bash "$DAILY_SCRIPT" --date "$DATE" --report-dir "$CASE_ROOT/runtime/reports/evidence" > "$DAILY_OUT" 2>&1

grep -q '^EVIDENCE_DAILY_STATUS=PASS' "$DAILY_OUT"
INDEX_JSON="$(grep -E '^EVIDENCE_INDEX_JSON=' "$DAILY_OUT" | tail -n 1 | cut -d= -f2-)"
RETENTION_JSON="$(grep -E '^EVIDENCE_RETENTION_JSON=' "$DAILY_OUT" | tail -n 1 | cut -d= -f2-)"
WEEKLY_ROLLUP="$(grep -E '^EVIDENCE_DAILY_WEEKLY_ROLLUP=' "$DAILY_OUT" | tail -n 1 | cut -d= -f2-)"
MONTHLY_ROLLUP="$(grep -E '^EVIDENCE_DAILY_MONTHLY_ROLLUP=' "$DAILY_OUT" | tail -n 1 | cut -d= -f2-)"
[[ -f "$INDEX_JSON" ]]
[[ -f "$RETENTION_JSON" ]]
[[ -f "$WEEKLY_ROLLUP" ]]
[[ -f "$MONTHLY_ROLLUP" ]]

python3 - "$INDEX_JSON" "$DATE" <<'PY'
import json
import pathlib
import sys

payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
date = sys.argv[2]
assert payload["daily"]["currentTarget"] == date, payload
assert payload["daily"]["currentTargetComplete"] is True, payload
assert payload["weekly"]["totalTargets"] >= 1, payload
assert payload["monthly"]["totalTargets"] >= 1, payload
PY

OLD_DAILY="$CASE_ROOT/runtime/logs/daily/2026-01-01-agent-health.json"
printf '{}\n' > "$OLD_DAILY"

RETENTION_OUT="$TMP_DIR/retention.out"
VENTUREOS_ROOT="$CASE_ROOT" \
VENTUREOS_EVIDENCE_DAILY_DIR="$CASE_ROOT/runtime/logs/daily" \
VENTUREOS_EVIDENCE_WEEKLY_DIR="$CASE_ROOT/runtime/logs/weekly" \
VENTUREOS_EVIDENCE_MONTHLY_DIR="$CASE_ROOT/runtime/logs/monthly" \
bash "$RETENTION_SCRIPT" \
  --report-dir "$CASE_ROOT/runtime/reports/evidence" \
  --readiness-report-dir "$CASE_ROOT/runtime/reports/phase0-readiness" \
  --daily-retention-days 30 \
  --weekly-retention-days 30 \
  --monthly-retention-days 30 \
  --evidence-report-retention-days 30 \
  --readiness-report-retention-days 30 \
  --apply > "$RETENTION_OUT" 2>&1

grep -q '^EVIDENCE_RETENTION_MODE=APPLY' "$RETENTION_OUT"
grep -q '^EVIDENCE_RETENTION_PRUNED=' "$RETENTION_OUT"
[[ ! -f "$OLD_DAILY" ]]

echo "EVIDENCE_MAINTENANCE_TEST_OK"

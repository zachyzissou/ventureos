#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/validate-evidence.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

DAILY_DIR="$TMP_DIR/runtime/logs/daily"
REPORT_DIR="$TMP_DIR/runtime/reports/evidence"
mkdir -p "$DAILY_DIR"

DATE="2026-03-16"
cp "$ROOT/runtime/logs/daily/agent-health.json" "$DAILY_DIR/$DATE-agent-health.json"
cp "$ROOT/runtime/logs/daily/spend.json" "$DAILY_DIR/$DATE-spend.json"
cp "$ROOT/runtime/logs/daily/kpi-snapshot.json" "$DAILY_DIR/$DATE-kpi-snapshot.json"
cp "$ROOT/runtime/logs/daily/handoff-ledger.json" "$DAILY_DIR/$DATE-handoff-ledger.json"
cp "$ROOT/runtime/logs/daily/decision-log.md" "$DAILY_DIR/$DATE-decision-log.md"
cp "$ROOT/runtime/logs/daily/day1-go-no-go.md" "$DAILY_DIR/$DATE-go-no-go.md"
python3 - "$DAILY_DIR" "$DATE" <<'PY'
import json
import pathlib
import sys

daily_dir = pathlib.Path(sys.argv[1])
date = sys.argv[2]
captured = f"{date}T08:00:00Z"
for name in ("agent-health.json", "spend.json", "kpi-snapshot.json", "handoff-ledger.json"):
    path = daily_dir / f"{date}-{name}"
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["date"] = date
    payload["captured_at"] = captured
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY

OUT="$TMP_DIR/out.txt"
VENTUREOS_ROOT="$ROOT" \
VENTUREOS_EVIDENCE_DAILY_DIR="$DAILY_DIR" \
bash "$SCRIPT" --cadence daily --target "$DATE" --report-dir "$REPORT_DIR" > "$OUT" 2>&1

grep -q '^EVIDENCE_VALIDATE_STATUS=PASS' "$OUT"
JSON_PATH="$(grep -E '^EVIDENCE_VALIDATE_JSON=' "$OUT" | tail -n 1 | cut -d= -f2-)"
[[ -f "$JSON_PATH" ]]
python3 - "$JSON_PATH" <<'PY'
import json
import pathlib
import sys
payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
assert payload['status'] == 'pass', payload
assert payload['cadence'] == 'daily', payload
assert len(payload['artifacts']) == 6, payload
print('VALIDATE_EVIDENCE_OK')
PY

echo "VALIDATE_EVIDENCE_TEST_OK"

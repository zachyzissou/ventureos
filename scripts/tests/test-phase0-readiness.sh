#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/phase0-readiness.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$TMP_DIR/docs" "$TMP_DIR/runtime/logs/daily" "$TMP_DIR/runtime/logs/weekly" "$TMP_DIR/runtime/logs/monthly" "$TMP_DIR/runtime/logs/git-hooks" "$TMP_DIR/runtime/reports/openclaw-local-smoke" "$TMP_DIR/runtime/reports/post-merge-cadence" "$TMP_DIR/schemas/evidence"
cp "$ROOT/schemas/evidence/"*.json "$TMP_DIR/schemas/evidence/"
cp "$ROOT/runtime/logs/daily/agent-health.json" "$TMP_DIR/runtime/logs/daily/2026-03-12-agent-health.json"
cp "$ROOT/runtime/logs/daily/spend.json" "$TMP_DIR/runtime/logs/daily/2026-03-12-spend.json"
cp "$ROOT/runtime/logs/daily/kpi-snapshot.json" "$TMP_DIR/runtime/logs/daily/2026-03-12-kpi-snapshot.json"
cp "$ROOT/runtime/logs/daily/handoff-ledger.json" "$TMP_DIR/runtime/logs/daily/2026-03-12-handoff-ledger.json"
cp "$ROOT/runtime/logs/daily/decision-log.md" "$TMP_DIR/runtime/logs/daily/2026-03-12-decision-log.md"
cp "$ROOT/runtime/logs/daily/day1-go-no-go.md" "$TMP_DIR/runtime/logs/daily/2026-03-12-go-no-go.md"
python3 - "$TMP_DIR/runtime/logs/daily" <<'PY'
import json
import pathlib
import sys

daily_dir = pathlib.Path(sys.argv[1])
for path in daily_dir.glob('2026-03-12-*.json'):
    payload = json.loads(path.read_text(encoding='utf-8'))
    payload['date'] = '2026-03-16'
    payload['captured_at'] = '2026-03-16T08:00:00Z'
    path.write_text(json.dumps(payload, indent=2) + '\n', encoding='utf-8')
PY
cat > "$TMP_DIR/runtime/logs/weekly/2026-W11-kpi-rollup.json" <<'JSON'
{"schemaVersion":1,"generatedAtUtc":"2026-03-16T08:00:00Z","isoWeek":"2026-W11","daysCovered":1,"completeDays":1,"incompleteDays":0,"dailyCoverage":[{"date":"2026-03-12","artifacts":["agent_health"],"complete":true}]}
JSON
cat > "$TMP_DIR/runtime/logs/weekly/2026-W11-ops-review.md" <<'MD'
# Weekly Ops Review — 2026-W11

## Coverage
- Days covered: `1`

## Highlights
- 2026-03-12: complete evidence set

## Actions
- Continue cadence.
MD
cat > "$TMP_DIR/runtime/logs/weekly/2026-W11-risk-register.md" <<'MD'
# Weekly Risk Register — 2026-W11

## Open Risks
- No material evidence coverage gaps detected this week.

## Mitigations
- Maintain daily evidence cadence and freshness checks.
MD
cat > "$TMP_DIR/docs/VentureOS_Department_Architecture_v1.md" <<'MD'
# VentureOS Department Architecture v1
MD
cat > "$TMP_DIR/docs/LOCAL_INTEGRATION_CHECKLIST.md" <<'MD'
# Local Integration Checklist
MD
cat > "$TMP_DIR/runtime/reports/openclaw-local-smoke/openclaw-local-ready-latest.json" <<'JSON'
{"status":"ok","generatedAt":"2026-03-16T08:00:00Z"}
JSON
cat > "$TMP_DIR/runtime/reports/post-merge-cadence/post-merge-cadence-latest.json" <<'JSON'
{"generatedAtUtc":"2026-03-16T08:00:00Z"}
JSON
echo 'hook ok' > "$TMP_DIR/runtime/logs/git-hooks/post-merge-cadence-20260316T080000Z.log"

OUT="$TMP_DIR/out.txt"
set +e
TZ=UTC \
VENTUREOS_ROOT="$TMP_DIR" \
bash "$SCRIPT" --no-local-integration-mode --no-hook-mode > "$OUT" 2>&1
RC=$?
set -e

if [[ "$RC" -ne 0 ]]; then
  cat "$OUT" >&2
  exit 1
fi

grep -q '^PHASE0_READINESS_STATUS=PASS' "$OUT"
JSON_PATH="$(grep -E '^PHASE0_READINESS_JSON=' "$OUT" | tail -n 1 | cut -d= -f2-)"
[[ -f "$JSON_PATH" ]]
python3 - "$JSON_PATH" <<'PY'
import json
import pathlib
import sys
payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
assert payload['status'] == 'pass', payload
print('PHASE0_READINESS_OK')
PY

echo "PHASE0_READINESS_TEST_OK"

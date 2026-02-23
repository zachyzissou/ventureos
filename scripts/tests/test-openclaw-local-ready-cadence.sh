#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CADENCE_SCRIPT="$ROOT/scripts/openclaw-local-ready-cadence.sh"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

STUB_REFRESH="$TMP_DIR/refresh-stub.sh"
cat > "$STUB_REFRESH" <<'EOF_STUB'
#!/usr/bin/env bash
set -euo pipefail

report_dir=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --report-dir)
      report_dir="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [[ -z "$report_dir" ]]; then
  echo "report_dir is required" >&2
  exit 2
fi
if [[ -z "${STATUS_FIXTURE_FILE:-}" ]]; then
  echo "STATUS_FIXTURE_FILE is required" >&2
  exit 2
fi

mkdir -p "$report_dir"
cp "$STATUS_FIXTURE_FILE" "$report_dir/openclaw-local-ready-latest.json"
cat > "$report_dir/openclaw-local-ready-latest.md" <<'MD'
# Local Readiness Status Summary
MD

echo "REFRESH_STATUS_JSON=$report_dir/openclaw-local-ready-latest.json"
echo "REFRESH_STATUS_MD=$report_dir/openclaw-local-ready-latest.md"
echo "REFRESH_GUARDRAIL_RC=${REFRESH_GUARDRAIL_RC:-0}"
exit "${REFRESH_RC:-0}"
EOF_STUB
chmod +x "$STUB_REFRESH"

PASS_STATUS_JSON="$TMP_DIR/status-pass.json"
cat > "$PASS_STATUS_JSON" <<'JSON'
{
  "generatedAt": "2026-02-23T12:00:00Z",
  "latestTimestamp": "20260223T120000Z",
  "latestAgeSeconds": 60,
  "status": "ok",
  "summary": {
    "verdict": "go",
    "status": "pass",
    "readinessScore": 100,
    "confidence": "high",
    "requiredFailures": 0,
    "warnings": 0,
    "profile": "full",
    "dashboardUrl": "http://127.0.0.1:7000",
    "requiredCheckStatusMap": {
      "openclaw-cli": "pass"
    }
  },
  "auth": {
    "tokenSource": "token-file",
    "tokenHealth": "ok",
    "tokenRepairAction": "none"
  },
  "guardrails": {
    "maxAgeMin": 360,
    "stale": false,
    "guardrailRc": 0
  },
  "artifacts": {
    "json": "runtime/reports/openclaw-local-smoke/openclaw-local-smoke-20260223T120000Z.json",
    "markdown": "runtime/reports/openclaw-local-smoke/openclaw-local-smoke-20260223T120000Z.md",
    "svg": "runtime/reports/openclaw-local-smoke/openclaw-local-smoke-20260223T120000Z.svg",
    "readinessDoc": "docs/LOCAL_INTEGRATION_READY.md"
  },
  "topBlockers": []
}
JSON

STALE_STATUS_JSON="$TMP_DIR/status-stale.json"
cat > "$STALE_STATUS_JSON" <<'JSON'
{
  "generatedAt": "2026-02-23T12:00:00Z",
  "latestTimestamp": "20260223T000000Z",
  "latestAgeSeconds": 86400,
  "status": "alert",
  "summary": {
    "verdict": "hold",
    "status": "fail",
    "readinessScore": 73,
    "confidence": "medium",
    "requiredFailures": 1,
    "warnings": 0,
    "profile": "bridge",
    "dashboardUrl": "http://127.0.0.1:7000",
    "requiredCheckStatusMap": {
      "openclaw-cli": "pass",
      "dashboard-health": "fail"
    }
  },
  "auth": {
    "tokenSource": "token-file",
    "tokenHealth": "ok",
    "tokenRepairAction": "none"
  },
  "guardrails": {
    "maxAgeMin": 360,
    "stale": true,
    "guardrailRc": 3
  },
  "artifacts": {
    "json": "runtime/reports/openclaw-local-smoke/openclaw-local-smoke-20260223T000000Z.json",
    "markdown": "runtime/reports/openclaw-local-smoke/openclaw-local-smoke-20260223T000000Z.md",
    "svg": "runtime/reports/openclaw-local-smoke/openclaw-local-smoke-20260223T000000Z.svg",
    "readinessDoc": "docs/LOCAL_INTEGRATION_READY.md"
  },
  "topBlockers": [
    {
      "id": "dashboard-health",
      "severity": "critical",
      "owner": "dashboard",
      "likelyCause": "Dashboard health endpoint failed",
      "nextCommand": "curl -sS http://127.0.0.1:7000/api/health"
    }
  ]
}
JSON

PASS_DIR="$TMP_DIR/reports-pass"
OPENCLAW_LOCAL_READY_REFRESH_SCRIPT="$STUB_REFRESH" \
STATUS_FIXTURE_FILE="$PASS_STATUS_JSON" \
REFRESH_RC=0 \
bash "$CADENCE_SCRIPT" --report-dir "$PASS_DIR" >/tmp/openclaw-local-ready-cadence-pass.out

if ! grep -q "CADENCE_RESULT=OK" /tmp/openclaw-local-ready-cadence-pass.out; then
  echo "expected pass run to emit CADENCE_RESULT=OK" >&2
  cat /tmp/openclaw-local-ready-cadence-pass.out >&2
  exit 1
fi
if [[ ! -f "$PASS_DIR/openclaw-local-ready-cadence-latest.json" ]]; then
  echo "missing cadence latest json in pass run" >&2
  exit 1
fi
if [[ ! -f "$PASS_DIR/openclaw-local-ready-cadence-latest.md" ]]; then
  echo "missing cadence latest markdown in pass run" >&2
  exit 1
fi

python3 - "$PASS_DIR/openclaw-local-ready-cadence-latest.json" <<'PY'
import json
import pathlib
import sys

payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
assert payload.get("status") == "ok", payload
assert payload.get("exitCode") == 0, payload
assert payload.get("guardrails", {}).get("stale") is False, payload
assert payload.get("topBlockers") == [], payload
assert "bash scripts/openclaw-local-ready-cadence.sh" in payload.get("nextCommands", []), payload
print("OPENCLAW_LOCAL_READY_CADENCE_PASS_OK")
PY

STALE_DIR="$TMP_DIR/reports-stale"
set +e
OPENCLAW_LOCAL_READY_REFRESH_SCRIPT="$STUB_REFRESH" \
STATUS_FIXTURE_FILE="$STALE_STATUS_JSON" \
REFRESH_RC=3 \
bash "$CADENCE_SCRIPT" --report-dir "$STALE_DIR" >/tmp/openclaw-local-ready-cadence-stale.out 2>&1
stale_rc=$?
set -e

if [[ "$stale_rc" -ne 3 ]]; then
  echo "expected stale run to exit 3, got $stale_rc" >&2
  cat /tmp/openclaw-local-ready-cadence-stale.out >&2
  exit 1
fi
if ! grep -q "CADENCE_RESULT=STALE" /tmp/openclaw-local-ready-cadence-stale.out; then
  echo "expected stale run to emit CADENCE_RESULT=STALE" >&2
  cat /tmp/openclaw-local-ready-cadence-stale.out >&2
  exit 1
fi
if ! grep -q "CADENCE_EXIT_CODE=3" /tmp/openclaw-local-ready-cadence-stale.out; then
  echo "expected stale run to emit CADENCE_EXIT_CODE=3" >&2
  cat /tmp/openclaw-local-ready-cadence-stale.out >&2
  exit 1
fi

python3 - "$STALE_DIR/openclaw-local-ready-cadence-latest.json" <<'PY'
import json
import pathlib
import sys

payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
assert payload.get("status") == "stale", payload
assert payload.get("exitCode") == 3, payload
assert payload.get("guardrails", {}).get("stale") is True, payload
blockers = payload.get("topBlockers", [])
assert len(blockers) == 1, payload
assert blockers[0].get("id") == "dashboard-health", payload
assert "curl -sS http://127.0.0.1:7000/api/health" in payload.get("nextCommands", []), payload
print("OPENCLAW_LOCAL_READY_CADENCE_STALE_OK")
PY

if ! grep -q "dashboard-health" "$STALE_DIR/openclaw-local-ready-cadence-latest.md"; then
  echo "expected stale markdown report to include blocker id" >&2
  exit 1
fi
if ! grep -q "curl -sS http://127.0.0.1:7000/api/health" "$STALE_DIR/openclaw-local-ready-cadence-latest.md"; then
  echo "expected stale markdown report to include next command" >&2
  exit 1
fi

echo "OPENCLAW_LOCAL_READY_CADENCE_REPORT_CONTENT_OK"

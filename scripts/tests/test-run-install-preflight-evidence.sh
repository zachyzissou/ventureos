#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/run-install-preflight-evidence.sh"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

REPORT_DIR="$TMP_DIR/reports"
SMOKE_DIR="$TMP_DIR/smoke"
CALL_LOG="$TMP_DIR/calls.log"
FAKE_INSTALL="$TMP_DIR/fake-ventureos-install.sh"
mkdir -p "$REPORT_DIR" "$SMOKE_DIR"

cat > "$FAKE_INSTALL" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

echo "$*" >> "$CALL_LOG"

has_flag() {
  local needle="$1"
  shift
  for arg in "$@"; do
    if [[ "$arg" == "$needle" ]]; then
      return 0
    fi
  done
  return 1
}

if ! has_flag --non-interactive "$@"; then
  echo "missing required --non-interactive" >&2
  exit 11
fi
if ! has_flag --preflight-only "$@"; then
  echo "missing required --preflight-only" >&2
  exit 11
fi
if ! has_flag --verify "$@"; then
  echo "missing required --verify" >&2
  exit 11
fi

report_dir="${VENTUREOS_INSTALL_REPORT_DIR:?}"
ts="${FAKE_INSTALL_TS:-20990101T010101Z}"
mkdir -p "$report_dir"

cat > "$report_dir/ventureos-install-${ts}.md" <<'MD'
# fake install report
MD
cat > "$report_dir/ventureos-install-adoption-${ts}.json" <<'JSON'
{"status":"planned"}
JSON
cat > "$report_dir/ventureos-onboarding-${ts}.md" <<'MD'
# fake onboarding transcript
MD

echo "VENTUREOS_INSTALL_RESULT=PREFLIGHT"
echo "VENTUREOS_INSTALL_RESTORE_POINT=/tmp/restore-${ts}"
exit "${FAKE_INSTALL_RC:-0}"
SH
chmod +x "$FAKE_INSTALL"

export CALL_LOG

# Pass case
cat > "$SMOKE_DIR/openclaw-local-ready-latest.json" <<'JSON'
{"status":"pass","summary":{}}
JSON

PASS_OUT="$TMP_DIR/pass.out"
VENTUREOS_PREFLIGHT_INSTALL_SCRIPT="$FAKE_INSTALL" \
VENTUREOS_INSTALL_REPORT_DIR="$REPORT_DIR" \
SMOKE_REPORT_DIR="$SMOKE_DIR" \
FAKE_INSTALL_TS="20990101T010101Z" \
bash "$SCRIPT" -- --openclaw-dir "$TMP_DIR/.openclaw" > "$PASS_OUT" 2>&1

grep -q "VENTUREOS_PREFLIGHT_EVIDENCE_STATUS=PASS" "$PASS_OUT"
grep -q -- '--preflight-only' "$CALL_LOG"
grep -q -- '--verify' "$CALL_LOG"
grep -q -- '--openclaw-dir' "$CALL_LOG"

PASS_JSON="$(grep -E '^VENTUREOS_PREFLIGHT_EVIDENCE_JSON=' "$PASS_OUT" | tail -n 1 | cut -d= -f2-)"
[[ -f "$PASS_JSON" ]]
[[ -f "$REPORT_DIR/ventureos-install-preflight-evidence-latest.json" ]]
[[ -f "$REPORT_DIR/ventureos-install-preflight-evidence-latest.md" ]]

python3 - "$PASS_JSON" <<'PY'
import json
import pathlib
import sys

payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
assert payload["status"] == "pass", payload
assert payload["installExitCode"] == 0, payload
assert payload["installResult"] == "PREFLIGHT", payload
assert payload["artifacts"]["installReport"].endswith("ventureos-install-20990101T010101Z.md"), payload
assert payload["artifacts"]["adoptionEvidenceJson"].endswith("ventureos-install-adoption-20990101T010101Z.json"), payload
assert payload["artifacts"]["readinessStatusExists"] is True, payload
assert "--preflight-only" in payload["command"]["invocation"], payload
assert "--verify" in payload["command"]["invocation"], payload
print("RUN_INSTALL_PREFLIGHT_EVIDENCE_PASS_OK")
PY

# Fail case still emits evidence bundle.
FAIL_OUT="$TMP_DIR/fail.out"
set +e
VENTUREOS_PREFLIGHT_INSTALL_SCRIPT="$FAKE_INSTALL" \
VENTUREOS_INSTALL_REPORT_DIR="$REPORT_DIR" \
SMOKE_REPORT_DIR="$SMOKE_DIR" \
FAKE_INSTALL_TS="20990101T020202Z" \
FAKE_INSTALL_RC=1 \
bash "$SCRIPT" > "$FAIL_OUT" 2>&1
FAIL_RC=$?
set -e

if [[ "$FAIL_RC" -eq 0 ]]; then
  echo "Expected fail case to return non-zero" >&2
  cat "$FAIL_OUT" >&2
  exit 1
fi

grep -q "VENTUREOS_PREFLIGHT_EVIDENCE_STATUS=FAIL" "$FAIL_OUT"
FAIL_JSON="$(grep -E '^VENTUREOS_PREFLIGHT_EVIDENCE_JSON=' "$FAIL_OUT" | tail -n 1 | cut -d= -f2-)"
[[ -f "$FAIL_JSON" ]]

python3 - "$FAIL_JSON" <<'PY'
import json
import pathlib
import sys

payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
assert payload["status"] == "fail", payload
assert payload["installExitCode"] == 1, payload
assert payload["installResult"] == "PREFLIGHT", payload
print("RUN_INSTALL_PREFLIGHT_EVIDENCE_FAIL_OK")
PY

echo "RUN_INSTALL_PREFLIGHT_EVIDENCE_TEST_OK"

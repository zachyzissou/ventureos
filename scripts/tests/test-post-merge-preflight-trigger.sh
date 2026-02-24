#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/post-merge-preflight-trigger.sh"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

FAKE_PREFLIGHT="$TMP_DIR/fake-preflight.sh"
CALL_LOG="$TMP_DIR/preflight-calls.log"
touch "$CALL_LOG"

cat > "$FAKE_PREFLIGHT" <<'EOF_FAKE'
#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$CALL_LOG"
echo "VENTUREOS_PREFLIGHT_EVIDENCE_JSON=$FAKE_PREFLIGHT_EVIDENCE_JSON"
exit "${FAKE_PREFLIGHT_RC:-0}"
EOF_FAKE
chmod +x "$FAKE_PREFLIGHT"

SKIP_CHANGED="$TMP_DIR/changed-skip.txt"
REQUIRED_CHANGED="$TMP_DIR/changed-required.txt"
echo "docs/README.md" > "$SKIP_CHANGED"
echo "scripts/ventureos-install.sh" > "$REQUIRED_CHANGED"

SKIP_OUT="$TMP_DIR/skip.out"
CALL_LOG="$CALL_LOG" \
FAKE_PREFLIGHT_EVIDENCE_JSON="$TMP_DIR/fake-evidence-skip.json" \
bash "$SCRIPT" \
  --preflight-script "$FAKE_PREFLIGHT" \
  --changed-paths-file "$SKIP_CHANGED" > "$SKIP_OUT" 2>&1

grep -q "^POST_MERGE_PREFLIGHT_STATUS=SKIPPED" "$SKIP_OUT"
grep -q "^POST_MERGE_PREFLIGHT_MATCH_COUNT=0" "$SKIP_OUT"
if [[ -s "$CALL_LOG" ]]; then
  echo "preflight script should not run in skipped scenario" >&2
  exit 1
fi

PASS_OUT="$TMP_DIR/pass.out"
CALL_LOG="$CALL_LOG" \
FAKE_PREFLIGHT_EVIDENCE_JSON="$TMP_DIR/fake-evidence-pass.json" \
bash "$SCRIPT" \
  --preflight-script "$FAKE_PREFLIGHT" \
  --changed-paths-file "$REQUIRED_CHANGED" \
  -- --openclaw-dir "$TMP_DIR/.openclaw" --bridge-env "$TMP_DIR/bridge.env" > "$PASS_OUT" 2>&1

grep -q "^POST_MERGE_PREFLIGHT_STATUS=REQUIRED" "$PASS_OUT"
grep -q "^POST_MERGE_PREFLIGHT_MATCH_COUNT=1" "$PASS_OUT"
grep -q "^POST_MERGE_PREFLIGHT_MATCHED_PATHS=scripts/ventureos-install.sh" "$PASS_OUT"
grep -q "^POST_MERGE_PREFLIGHT_EVIDENCE_JSON=$TMP_DIR/fake-evidence-pass.json" "$PASS_OUT"
grep -q "^POST_MERGE_PREFLIGHT_EXIT_CODE=0" "$PASS_OUT"
grep -q "^-- --openclaw-dir $TMP_DIR/.openclaw --bridge-env $TMP_DIR/bridge.env$" "$CALL_LOG"

FAIL_OUT="$TMP_DIR/fail.out"
set +e
CALL_LOG="$CALL_LOG" \
FAKE_PREFLIGHT_EVIDENCE_JSON="$TMP_DIR/fake-evidence-fail.json" \
FAKE_PREFLIGHT_RC=9 \
bash "$SCRIPT" \
  --preflight-script "$FAKE_PREFLIGHT" \
  --changed-paths-file "$REQUIRED_CHANGED" > "$FAIL_OUT" 2>&1
FAIL_RC=$?
set -e

if [[ "$FAIL_RC" -ne 9 ]]; then
  echo "expected required path failure to propagate rc=9, got $FAIL_RC" >&2
  exit 1
fi
grep -q "^POST_MERGE_PREFLIGHT_STATUS=REQUIRED" "$FAIL_OUT"
grep -q "^POST_MERGE_PREFLIGHT_EXIT_CODE=9" "$FAIL_OUT"

echo "POST_MERGE_PREFLIGHT_TRIGGER_TEST_OK"

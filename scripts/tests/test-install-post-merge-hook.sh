#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/install-post-merge-hook.sh"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

REPO="$TMP_DIR/repo"
mkdir -p "$REPO"
git -C "$REPO" init >/dev/null

mkdir -p "$REPO/scripts"
cat > "$REPO/scripts/post-merge-cadence.sh" <<'EOF_RUNNER'
#!/usr/bin/env bash
set -euo pipefail
echo "runner-called:$*" >&2
exit "${FAKE_RUNNER_RC:-9}"
EOF_RUNNER
chmod +x "$REPO/scripts/post-merge-cadence.sh"

INSTALL_OUT="$TMP_DIR/install.out"
bash "$SCRIPT" \
  --repo-root "$REPO" \
  --runner-script scripts/post-merge-cadence.sh \
  --log-dir runtime/logs/post-merge-hooks > "$INSTALL_OUT" 2>&1

grep -q "^POST_MERGE_HOOK_INSTALL=PASS" "$INSTALL_OUT"
HOOK_PATH="$(grep -E '^POST_MERGE_HOOK_PATH=' "$INSTALL_OUT" | tail -n 1 | cut -d= -f2-)"
[[ -f "$HOOK_PATH" ]]
grep -q "VentureOS Managed Post-Merge Hook" "$HOOK_PATH"

STATUS_OUT="$TMP_DIR/status.out"
bash "$SCRIPT" --repo-root "$REPO" --status > "$STATUS_OUT" 2>&1
grep -q "^POST_MERGE_HOOK_STATUS=managed" "$STATUS_OUT"

set +e
FAKE_RUNNER_RC=9 bash "$HOOK_PATH" >/tmp/ventureos-hook-run.out 2>&1
HOOK_RC=$?
set -e
if [[ "$HOOK_RC" -ne 0 ]]; then
  echo "managed post-merge hook must be non-blocking (expected 0, got $HOOK_RC)" >&2
  exit 1
fi

LOG_DIR="$REPO/runtime/logs/post-merge-hooks"
LATEST_LOG="$(ls -1t "$LOG_DIR"/post-merge-cadence-*.log | head -n 1)"
[[ -f "$LATEST_LOG" ]]
grep -q "non-blocking" "$LATEST_LOG"

UNMANAGED_HOOK="$REPO/.git/hooks/post-merge"
BACKUP_META="$UNMANAGED_HOOK.ventureos-backup"
echo "#!/usr/bin/env bash" > "$UNMANAGED_HOOK"
echo "echo unmanaged" >> "$UNMANAGED_HOOK"
chmod +x "$UNMANAGED_HOOK"

set +e
bash "$SCRIPT" --repo-root "$REPO" >/tmp/install-post-merge-hook-unmanaged.out 2>&1
UNMANAGED_RC=$?
set -e
if [[ "$UNMANAGED_RC" -ne 1 ]]; then
  echo "expected unmanaged hook install to fail with rc=1, got $UNMANAGED_RC" >&2
  exit 1
fi

FORCE_OUT="$TMP_DIR/force.out"
bash "$SCRIPT" --repo-root "$REPO" --force > "$FORCE_OUT" 2>&1
grep -q "^POST_MERGE_HOOK_INSTALL=PASS" "$FORCE_OUT"
BACKUP_PATH="$(grep -E '^POST_MERGE_HOOK_BACKUP=' "$FORCE_OUT" | tail -n 1 | cut -d= -f2-)"
[[ -f "$BACKUP_PATH" ]]
grep -q "unmanaged" "$BACKUP_PATH"
[[ -f "$BACKUP_META" ]]

UNINSTALL_OUT="$TMP_DIR/uninstall.out"
bash "$SCRIPT" --repo-root "$REPO" --uninstall > "$UNINSTALL_OUT" 2>&1
grep -q "^POST_MERGE_HOOK_UNINSTALL=PASS" "$UNINSTALL_OUT"
grep -q "^POST_MERGE_HOOK_RESTORED_BACKUP=$BACKUP_PATH" "$UNINSTALL_OUT"
[[ -f "$UNMANAGED_HOOK" ]]
grep -q "unmanaged" "$UNMANAGED_HOOK"
[[ ! -f "$BACKUP_META" ]]

DRY_RUN_OUT="$TMP_DIR/dry-run.out"
bash "$SCRIPT" --repo-root "$REPO" --dry-run --force > "$DRY_RUN_OUT" 2>&1
grep -q "^POST_MERGE_HOOK_INSTALL=DRY_RUN" "$DRY_RUN_OUT"
grep -q "unmanaged" "$UNMANAGED_HOOK"

echo "INSTALL_POST_MERGE_HOOK_TEST_OK"

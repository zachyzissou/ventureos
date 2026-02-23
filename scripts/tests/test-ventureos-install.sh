#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/ventureos-install.sh"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

CALL_LOG="$TMP_DIR/calls.log"
touch "$CALL_LOG"

OUT_DIR="$TMP_DIR/out"
REPORT_BASE="$TMP_DIR/reports"
SMOKE_DIR="$TMP_DIR/smoke"
BIN_DIR="$TMP_DIR/bin"
mkdir -p "$OUT_DIR" "$REPORT_BASE" "$SMOKE_DIR" "$BIN_DIR"

FAKE_DASHBOARD_MACOS="$TMP_DIR/install-macos.sh"
FAKE_DASHBOARD_LINUX="$TMP_DIR/install-linux.sh"
FAKE_BRIDGE="$TMP_DIR/install-bridge.sh"
FAKE_CRON="$TMP_DIR/install-cron.sh"
FAKE_READY="$TMP_DIR/refresh-ready.sh"
FAKE_CURL="$BIN_DIR/curl"
FAKE_CRONTAB="$BIN_DIR/crontab"
CRONTAB_STATE="$TMP_DIR/crontab.state"
RESTORE_BASE="$TMP_DIR/restore-points"
OPENCLAW_FIXTURE_DIR="$TMP_DIR/openclaw"

cat > "$CRONTAB_STATE" <<'EOF_CRON'
# pre-install user cron
0 1 * * * echo original
EOF_CRON
mkdir -p "$OPENCLAW_FIXTURE_DIR/cron" "$OPENCLAW_FIXTURE_DIR/credentials/discord"
cat > "$OPENCLAW_FIXTURE_DIR/openclaw.json" <<'EOF_OC_JSON'
{"name":"fixture-openclaw"}
EOF_OC_JSON
cat > "$OPENCLAW_FIXTURE_DIR/cron/jobs.json" <<'EOF_OC_JOBS'
{"jobs":["original"]}
EOF_OC_JOBS
cat > "$OPENCLAW_FIXTURE_DIR/credentials/discord/webhooks.json" <<'EOF_OC_WEBHOOKS'
{"alerts":"https://example.invalid/webhook"}
EOF_OC_WEBHOOKS

cat > "$FAKE_DASHBOARD_MACOS" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
echo "dashboard-macos|$*" >> "$CALL_LOG"
exit 0
SH

cat > "$FAKE_DASHBOARD_LINUX" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
echo "dashboard-linux|$*" >> "$CALL_LOG"
exit 0
SH

cat > "$FAKE_BRIDGE" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
echo "bridge|$*" >> "$CALL_LOG"
exit 0
SH

cat > "$FAKE_CRON" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
echo "cron|$*" >> "$CALL_LOG"
cat > "$CRONTAB_STATE" <<'EOF_CRON_INSTALLED'
# === VentureOS Managed Cron ===
*/30 * * * * /tmp/fake cron
# === END VentureOS Managed Cron ===
EOF_CRON_INSTALLED
exit 0
SH

cat > "$FAKE_READY" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
echo "ready|$*|BRIDGE_TOKEN=${BRIDGE_TOKEN:-}" >> "$CALL_LOG"
report_dir="${SMOKE_REPORT_DIR:-}"
if [[ -n "$report_dir" ]]; then
  mkdir -p "$report_dir"
  cat > "$report_dir/openclaw-local-ready-latest.json" <<'JSON'
{"status":"pass","summary":"readiness ok"}
JSON
fi
exit 0
SH

cat > "$FAKE_CURL" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
echo "curl|$*" >> "$CALL_LOG"
exit 0
SH

cat > "$FAKE_CRONTAB" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
echo "crontab|$*" >> "$CALL_LOG"
if [[ "${1:-}" == "-l" ]]; then
  if [[ -f "$CRONTAB_STATE" ]]; then
    cat "$CRONTAB_STATE"
    exit 0
  fi
  exit 1
fi
if [[ "${1:-}" == "-r" ]]; then
  rm -f "$CRONTAB_STATE"
  exit 0
fi
if [[ $# -eq 1 && -f "$1" ]]; then
  cat "$1" > "$CRONTAB_STATE"
  exit 0
fi
cat > "$CRONTAB_STATE"
exit 0
SH

chmod +x "$FAKE_DASHBOARD_MACOS" "$FAKE_DASHBOARD_LINUX" "$FAKE_BRIDGE" "$FAKE_CRON" "$FAKE_READY" "$FAKE_CURL" "$FAKE_CRONTAB"

BRIDGE_ENV="$TMP_DIR/bridge.env"
cat > "$BRIDGE_ENV" <<'EOF_ENV'
BRIDGE_TOKEN=test-bridge-token
BRIDGE_PORT=18790
EOF_ENV

run_install() {
  local run_name="$1"
  shift
  local out_file="$OUT_DIR/${run_name}.out"
  local report_dir="$REPORT_BASE/${run_name}"
  mkdir -p "$report_dir"
  VENTUREOS_INSTALL_REPORT_DIR="$report_dir" \
  SMOKE_REPORT_DIR="$SMOKE_DIR" \
  PATH="$BIN_DIR:$PATH" \
  bash "$SCRIPT" "$@" >"$out_file" 2>&1
}

run_install_expect_fail() {
  local run_name="$1"
  shift
  local out_file="$OUT_DIR/${run_name}.out"
  local report_dir="$REPORT_BASE/${run_name}"
  mkdir -p "$report_dir"
  set +e
  VENTUREOS_INSTALL_REPORT_DIR="$report_dir" \
  SMOKE_REPORT_DIR="$SMOKE_DIR" \
  PATH="$BIN_DIR:$PATH" \
  bash "$SCRIPT" "$@" >"$out_file" 2>&1
  local rc=$?
  set -e
  if [[ "$rc" -eq 0 ]]; then
    echo "Expected run '$run_name' to fail but it passed" >&2
    exit 1
  fi
}

latest_report() {
  local run_name="$1"
  ls -1 "$REPORT_BASE/${run_name}"/ventureos-install-*.md | tail -n 1
}

export CALL_LOG
export VENTUREOS_INSTALL_DASHBOARD_MACOS_SCRIPT="$FAKE_DASHBOARD_MACOS"
export VENTUREOS_INSTALL_DASHBOARD_LINUX_SCRIPT="$FAKE_DASHBOARD_LINUX"
export VENTUREOS_INSTALL_BRIDGE_SCRIPT="$FAKE_BRIDGE"
export VENTUREOS_INSTALL_CRON_SCRIPT="$FAKE_CRON"
export VENTUREOS_INSTALL_READINESS_SCRIPT="$FAKE_READY"
export VENTUREOS_INSTALL_OS="Darwin"
export CRONTAB_STATE
export VENTUREOS_INSTALL_RESTORE_BASE_DIR="$RESTORE_BASE"

# Dry-run should plan actions without executing scripts.
: > "$CALL_LOG"
run_install dry_run \
  --non-interactive \
  --dry-run \
  --preset minimal \
  --verify \
  --dashboard-port 8123 \
  --bridge-env "$BRIDGE_ENV" \
  --bridge-token-file "$TMP_DIR/bridge-token"

if grep -E -q '^(dashboard-macos|dashboard-linux|bridge\||cron\||ready\|)' "$CALL_LOG"; then
  echo "Expected dry-run mode to avoid executing installer primitives" >&2
  exit 1
fi

grep -q "VENTUREOS_INSTALL_RESULT=PLANNED" "$OUT_DIR/dry_run.out"
dry_run_report="$(latest_report dry_run)"
grep -q '| Step | Status | Detail | Next Command |' "$dry_run_report"
grep -q -- '- Preset: `minimal`' "$dry_run_report"
grep -q -- '- Post-install verify: `enabled`' "$dry_run_report"
grep -q '`bridge-launchagent` | `skipped`' "$dry_run_report"
echo "VENTUREOS_INSTALL_DRY_RUN_OK"

# Executing mode with verification should run all install + verify primitives.
: > "$CALL_LOG"
run_install verify_success \
  --non-interactive \
  --verify \
  --dashboard-port 8124 \
  --profile bridge \
  --openclaw-dir "$OPENCLAW_FIXTURE_DIR" \
  --bridge-env "$BRIDGE_ENV" \
  --bridge-token-file "$TMP_DIR/bridge-token"

grep -q "dashboard-macos|" "$CALL_LOG"
grep -q "bridge|--bridge-env $BRIDGE_ENV" "$CALL_LOG"
grep -q "bridge|--bridge-env $BRIDGE_ENV --status" "$CALL_LOG"
grep -q "cron|--force" "$CALL_LOG"
grep -q "ready|--profile bridge --dashboard-url http://127.0.0.1:8124 --bridge-token-file $TMP_DIR/bridge-token|BRIDGE_TOKEN=test-bridge-token" "$CALL_LOG"
grep -q "curl|-sSf --max-time 3 http://127.0.0.1:8124/api/health" "$CALL_LOG"
grep -q "crontab|-l" "$CALL_LOG"
grep -q "VENTUREOS_INSTALL_RESULT=PASS" "$OUT_DIR/verify_success.out"
grep -q "VENTUREOS_INSTALL_RESTORE_POINT=" "$OUT_DIR/verify_success.out"
verify_report="$(latest_report verify_success)"
grep -q -- '- Status: `pass`' "$verify_report"
grep -q -- '- Post-install verify: `enabled`' "$verify_report"
grep -q '`restore-point` | `pass`' "$verify_report"
grep -q '| Step | Status | Detail | Next Command |' "$verify_report"
echo "VENTUREOS_INSTALL_VERIFY_OK"

# Minimal preset should skip bridge + cron by default while still running dashboard/readiness.
: > "$CALL_LOG"
run_install minimal_preset \
  --non-interactive \
  --preset minimal \
  --dashboard-port 8125 \
  --openclaw-dir "$OPENCLAW_FIXTURE_DIR" \
  --bridge-env "$BRIDGE_ENV"

grep -q "dashboard-macos|" "$CALL_LOG"
if grep -q 'bridge|' "$CALL_LOG"; then
  echo "Minimal preset should not run bridge installer" >&2
  exit 1
fi
if grep -q 'cron|' "$CALL_LOG"; then
  echo "Minimal preset should not run cron installer" >&2
  exit 1
fi
grep -q "ready|--profile quick --dashboard-url http://127.0.0.1:8125|BRIDGE_TOKEN=test-bridge-token" "$CALL_LOG"
grep -q "VENTUREOS_INSTALL_RESULT=PASS" "$OUT_DIR/minimal_preset.out"
minimal_report="$(latest_report minimal_preset)"
grep -q -- '- Preset: `minimal`' "$minimal_report"
echo "VENTUREOS_INSTALL_PRESET_OK"

# Missing bridge env should fail with actionable failed-step report content.
: > "$CALL_LOG"
run_install_expect_fail missing_bridge_env \
  --non-interactive \
  --verify \
  --dashboard-port 8126 \
  --openclaw-dir "$OPENCLAW_FIXTURE_DIR" \
  --bridge-env "$TMP_DIR/missing-bridge.env" \
  --skip-readiness

grep -q "VENTUREOS_INSTALL_RESULT=FAIL" "$OUT_DIR/missing_bridge_env.out"
fail_report="$(latest_report missing_bridge_env)"
grep -q '## Failed Steps' "$fail_report"
grep -q "Create bridge env file or pass --skip-bridge-launchagent" "$fail_report"
grep -q '| Step | Status | Detail | Next Command |' "$fail_report"
echo "VENTUREOS_INSTALL_FAILURE_REPORT_OK"

# Revert should restore pre-install cron + bridge env + OpenClaw configs from a restore point.
restore_point="$(grep -E '^VENTUREOS_INSTALL_RESTORE_POINT=' "$OUT_DIR/verify_success.out" | tail -n 1 | cut -d= -f2-)"
if [[ -z "$restore_point" || ! -d "$restore_point" ]]; then
  echo "Expected restore point directory from verify_success run" >&2
  exit 1
fi

echo "BRIDGE_TOKEN=mutated-token" > "$BRIDGE_ENV"
echo '{"name":"mutated"}' > "$OPENCLAW_FIXTURE_DIR/openclaw.json"
cat > "$CRONTAB_STATE" <<'EOF_CRON_MUT'
# mutated cron
*/5 * * * * echo mutated
EOF_CRON_MUT

set +e
PATH="$BIN_DIR:$PATH" bash "$SCRIPT" --non-interactive --revert "$restore_point" > "$OUT_DIR/revert.out" 2>&1
revert_rc=$?
set -e
if [[ "$revert_rc" -ne 0 ]]; then
  echo "Expected revert to succeed" >&2
  cat "$OUT_DIR/revert.out" >&2
  exit 1
fi

grep -q "VENTUREOS_INSTALL_RESULT=REVERTED" "$OUT_DIR/revert.out"
grep -q "REVERT_SUMMARY" "$OUT_DIR/revert.out"
grep -q "BRIDGE_TOKEN=test-bridge-token" "$BRIDGE_ENV"
grep -q '"name":"fixture-openclaw"' "$OPENCLAW_FIXTURE_DIR/openclaw.json"
grep -q "echo original" "$CRONTAB_STATE"
echo "VENTUREOS_INSTALL_REVERT_OK"

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
original_args="$*"
bridge_env_path=""
status_mode=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --bridge-env)
      bridge_env_path="${2:-}"
      shift 2
      ;;
    --status)
      status_mode=1
      shift
      ;;
    *)
      shift
      ;;
    esac
done

echo "bridge|$original_args" >> "$CALL_LOG"
if [[ "$status_mode" == "1" ]]; then
  exit "${FAKE_BRIDGE_STATUS_RC:-0}"
fi
if [[ -n "$bridge_env_path" && ! -f "$bridge_env_path" ]]; then
  exit 2
fi
exit 0
SH

cat > "$FAKE_CRON" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
echo "cron|$*" >> "$CALL_LOG"
existing="$(cat "$CRONTAB_STATE" 2>/dev/null || true)"
filtered="$(printf '%s\n' "$existing" | sed '/# === VentureOS Managed Cron/,/# === END VentureOS Managed Cron/d')"
{
  if [[ -n "$filtered" ]]; then
    printf '%s\n' "$filtered"
  fi
  cat <<'EOF_CRON_INSTALLED'
# === VentureOS Managed Cron ===
*/30 * * * * /tmp/fake cron
# === END VentureOS Managed Cron ===
EOF_CRON_INSTALLED
} > "$CRONTAB_STATE"
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

run_install_interactive() {
  local run_name="$1"
  local input_payload="$2"
  shift 2
  local out_file="$OUT_DIR/${run_name}.out"
  local report_dir="$REPORT_BASE/${run_name}"
  mkdir -p "$report_dir"
  set +e
  printf '%s' "$input_payload" | \
    VENTUREOS_INSTALL_REPORT_DIR="$report_dir" \
    VENTUREOS_INSTALL_ASSUME_TTY=1 \
    SMOKE_REPORT_DIR="$SMOKE_DIR" \
    PATH="$BIN_DIR:$PATH" \
    bash "$SCRIPT" "$@" >"$out_file" 2>&1
  local rc=$?
  set -e
  if [[ "$rc" -ne 0 ]]; then
    echo "Expected interactive run '$run_name' to pass but it failed" >&2
    cat "$out_file" >&2
    exit 1
  fi
}

latest_report() {
  local run_name="$1"
  ls -1 "$REPORT_BASE/${run_name}"/ventureos-install-[0-9]*.md | tail -n 1
}

latest_adoption_evidence() {
  local run_name="$1"
  ls -1 "$REPORT_BASE/${run_name}"/ventureos-install-adoption-*.json | tail -n 1
}

latest_onboarding_transcript() {
  local run_name="$1"
  ls -1 "$REPORT_BASE/${run_name}"/ventureos-onboarding-*.md | tail -n 1
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
export FAKE_BRIDGE_STATUS_RC=0

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

if grep -E -q '^(dashboard-macos|dashboard-linux|cron\||ready\|)' "$CALL_LOG"; then
  echo "Expected dry-run mode to avoid executing installer primitives" >&2
  exit 1
fi
if grep -E '^bridge\|' "$CALL_LOG" >/dev/null 2>&1; then
  if grep -E '^bridge\|' "$CALL_LOG" | grep -vq -- '--status'; then
    echo "Expected dry-run mode to avoid bridge install execution (status checks are allowed)" >&2
    exit 1
  fi
fi

grep -q "VENTUREOS_INSTALL_RESULT=PLANNED" "$OUT_DIR/dry_run.out"
dry_run_report="$(latest_report dry_run)"
grep -q '| Step | Status | Detail | Next Command |' "$dry_run_report"
grep -q -- '- Preset: `minimal`' "$dry_run_report"
grep -q -- '- Post-install verify: `enabled`' "$dry_run_report"
grep -q '`bridge-launchagent` | `skipped`' "$dry_run_report"
grep -q '`adoption-plan` | `planned`' "$dry_run_report"
grep -q '## Integration Adoption Plan' "$dry_run_report"
dry_run_adoption_json="$(latest_adoption_evidence dry_run)"
python3 - "$dry_run_adoption_json" <<'PY'
import json
from pathlib import Path
import sys

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
assert payload.get("status") == "planned", payload
assert payload.get("mode") == "dry-run", payload
assert payload.get("changedTargets") == [], payload
print("VENTUREOS_INSTALL_DRY_RUN_ADOPTION_EVIDENCE_OK")
PY
echo "VENTUREOS_INSTALL_DRY_RUN_OK"

# Preflight-only should run compatibility + rollback rehearsal without apply steps.
: > "$CALL_LOG"
run_install preflight_only \
  --non-interactive \
  --preflight-only \
  --verify \
  --dashboard-port 8131 \
  --openclaw-dir "$OPENCLAW_FIXTURE_DIR" \
  --bridge-env "$BRIDGE_ENV"

if grep -E -q '^(dashboard-macos|dashboard-linux|cron\||ready\|)' "$CALL_LOG"; then
  echo "Expected preflight-only mode to avoid executing installer primitives" >&2
  exit 1
fi
if grep -E '^bridge\|' "$CALL_LOG" >/dev/null 2>&1; then
  if grep -E '^bridge\|' "$CALL_LOG" | grep -vq -- '--status'; then
    echo "Expected preflight-only mode to avoid bridge install execution (status checks are allowed)" >&2
    exit 1
  fi
fi

grep -q "VENTUREOS_INSTALL_RESULT=PREFLIGHT" "$OUT_DIR/preflight_only.out"
grep -q "VENTUREOS_INSTALL_RESTORE_POINT=" "$OUT_DIR/preflight_only.out"
preflight_report="$(latest_report preflight_only)"
grep -q -- '- Mode: `preflight`' "$preflight_report"
grep -q '## Compatibility Rehearsal' "$preflight_report"
grep -q '`compatibility-check` | `pass`' "$preflight_report"
grep -q '`dashboard-install` | `planned`' "$preflight_report"
preflight_adoption_json="$(latest_adoption_evidence preflight_only)"
python3 - "$preflight_adoption_json" <<'PY'
import json
from pathlib import Path
import sys

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
assert payload.get("status") == "planned", payload
assert payload.get("mode") == "preflight", payload
rollback = payload.get("rollbackCommand")
assert isinstance(rollback, str) and "--revert" in rollback, payload
print("VENTUREOS_INSTALL_PREFLIGHT_ADOPTION_EVIDENCE_OK")
PY
echo "VENTUREOS_INSTALL_PREFLIGHT_ONLY_OK"

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
grep -q "echo original" "$CRONTAB_STATE"
grep -q "VentureOS Managed Cron" "$CRONTAB_STATE"
grep -q "VENTUREOS_INSTALL_RESULT=PASS" "$OUT_DIR/verify_success.out"
grep -q "VENTUREOS_INSTALL_RESTORE_POINT=" "$OUT_DIR/verify_success.out"
verify_report="$(latest_report verify_success)"
grep -q -- '- Status: `pass`' "$verify_report"
grep -q -- '- Post-install verify: `enabled`' "$verify_report"
grep -q '`restore-point` | `pass`' "$verify_report"
grep -q '`adoption-plan` | `pass`' "$verify_report"
grep -q '`adoption-fingerprint-before` | `pass`' "$verify_report"
grep -q '`adoption-fingerprint-after` | `pass`' "$verify_report"
grep -q '`adoption-evidence` | `pass`' "$verify_report"
grep -q '## Integration Adoption Plan' "$verify_report"
grep -q '## Config Change Evidence' "$verify_report"
grep -q '`ventureos-managed-cron-block` | `create`' "$verify_report"
grep -q '| Step | Status | Detail | Next Command |' "$verify_report"
verify_adoption_json="$(latest_adoption_evidence verify_success)"
python3 - "$verify_adoption_json" <<'PY'
import json
from pathlib import Path
import sys

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
assert payload.get("status") == "pass", payload
assert payload.get("mode") == "execute", payload
rollback = payload.get("rollbackCommand")
assert isinstance(rollback, str) and "--revert" in rollback, payload
changed = payload.get("changedTargets", [])
assert isinstance(changed, list), payload
ids = {row.get("id") for row in changed if isinstance(row, dict)}
assert "user-crontab" in ids, ids
assert "ventureos-managed-cron-block" in ids, ids
print("VENTUREOS_INSTALL_ADOPTION_EVIDENCE_OK")
PY
verify_onboarding="$(latest_onboarding_transcript verify_success)"
grep -q -- '- Final status: `pass`' "$verify_onboarding"
grep -q -- '- Mode: `non-interactive`' "$verify_onboarding"
grep -q -- '- Approval: `auto-non-interactive`' "$verify_onboarding"
grep -q -- '- Restore point validated: `yes`' "$verify_onboarding"
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
if grep -E '^bridge\|' "$CALL_LOG" >/dev/null 2>&1; then
  if grep -E '^bridge\|' "$CALL_LOG" | grep -vq -- '--status'; then
    echo "Minimal preset should not run bridge installer" >&2
    exit 1
  fi
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

# Interactive onboarding apply path should require action-matrix confirmation and then execute.
: > "$CALL_LOG"
interactive_apply_input=$'y\n\n\n\nn\ny\ny\ny\ny\ny\ny\n'
run_install_interactive interactive_apply \
  "$interactive_apply_input" \
  --dashboard-port 8128 \
  --openclaw-dir "$OPENCLAW_FIXTURE_DIR" \
  --bridge-env "$BRIDGE_ENV" \
  --bridge-token-file "$TMP_DIR/bridge-token"

grep -q "VENTUREOS_INSTALL_RESULT=PASS" "$OUT_DIR/interactive_apply.out"
grep -q "\\[Phase 2/6\\] Preference selection" "$OUT_DIR/interactive_apply.out"
grep -q "\\[Phase 5/6\\] Installer execution" "$OUT_DIR/interactive_apply.out"
grep -q "RUN   dashboard-install :: dashboard/scripts/install-macos.sh" "$OUT_DIR/interactive_apply.out"
grep -q "dashboard-macos|" "$CALL_LOG"
grep -q "cron|--force" "$CALL_LOG"
grep -q "ready|--profile full --dashboard-url http://127.0.0.1:8128 --bridge-token-file $TMP_DIR/bridge-token|BRIDGE_TOKEN=test-bridge-token" "$CALL_LOG"
interactive_apply_report="$(latest_report interactive_apply)"
grep -q '`restore-point-validate` | `pass`' "$interactive_apply_report"
grep -q '`onboarding-transcript` | `pass`' "$interactive_apply_report"
interactive_apply_transcript="$(latest_onboarding_transcript interactive_apply)"
grep -q -- '- Final status: `pass`' "$interactive_apply_transcript"
grep -q -- '- Mode: `interactive`' "$interactive_apply_transcript"
grep -q -- '- Approval: `approved`' "$interactive_apply_transcript"
grep -q '## Action Matrix Summary' "$interactive_apply_transcript"
echo "VENTUREOS_INSTALL_INTERACTIVE_APPLY_OK"

# Interactive onboarding abort path should stop before apply and emit cancel transcript.
: > "$CALL_LOG"
interactive_abort_input=$'y\n\n\n\nn\ny\ny\ny\ny\ny\nn\n'
run_install_interactive interactive_abort \
  "$interactive_abort_input" \
  --dashboard-port 8129 \
  --openclaw-dir "$OPENCLAW_FIXTURE_DIR" \
  --bridge-env "$BRIDGE_ENV" \
  --bridge-token-file "$TMP_DIR/bridge-token"

grep -q "VENTUREOS_INSTALL_RESULT=CANCELLED" "$OUT_DIR/interactive_abort.out"
grep -q "\\[Phase 3/6\\] Plan + compatibility review" "$OUT_DIR/interactive_abort.out"
if grep -E -q '^(dashboard-macos|dashboard-linux|cron\||ready\|)' "$CALL_LOG"; then
  echo "Interactive cancel should not execute installer primitives" >&2
  exit 1
fi
if grep -E '^bridge\|' "$CALL_LOG" >/dev/null 2>&1; then
  if grep -E '^bridge\|' "$CALL_LOG" | grep -vq -- '--status'; then
    echo "Interactive cancel should not run bridge install execution (status checks are allowed)" >&2
    exit 1
  fi
fi
interactive_abort_transcript="$(latest_onboarding_transcript interactive_abort)"
grep -q -- '- Final status: `cancelled`' "$interactive_abort_transcript"
grep -q -- '- Approval: `declined`' "$interactive_abort_transcript"
grep -q -- 'operator declined action matrix confirmation' "$interactive_abort_transcript"
echo "VENTUREOS_INSTALL_INTERACTIVE_ABORT_OK"

# Missing bridge env should adopt existing healthy launchagent state (non-destructive mode).
: > "$CALL_LOG"
run_install missing_bridge_env_adopt \
  --non-interactive \
  --verify \
  --dashboard-port 8126 \
  --openclaw-dir "$OPENCLAW_FIXTURE_DIR" \
  --bridge-env "$TMP_DIR/missing-bridge.env" \
  --skip-readiness

grep -q "VENTUREOS_INSTALL_RESULT=PASS" "$OUT_DIR/missing_bridge_env_adopt.out"
adopt_report="$(latest_report missing_bridge_env_adopt)"
grep -q "bridge env missing; adopted existing healthy launchagent" "$adopt_report"
grep -q '`bridge-launchagent` | `pass`' "$adopt_report"
echo "VENTUREOS_INSTALL_MISSING_BRIDGE_ENV_ADOPT_OK"

# Missing bridge env should still fail when existing launchagent status is unhealthy.
export FAKE_BRIDGE_STATUS_RC=1
: > "$CALL_LOG"
run_install_expect_fail missing_bridge_env_unhealthy \
  --non-interactive \
  --verify \
  --dashboard-port 8127 \
  --openclaw-dir "$OPENCLAW_FIXTURE_DIR" \
  --bridge-env "$TMP_DIR/missing-bridge.env" \
  --skip-readiness
export FAKE_BRIDGE_STATUS_RC=0

grep -q "VENTUREOS_INSTALL_RESULT=FAIL" "$OUT_DIR/missing_bridge_env_unhealthy.out"
fail_report="$(latest_report missing_bridge_env_unhealthy)"
grep -q '## Failed Steps' "$fail_report"
grep -q "missing bridge env file and no healthy launchagent to adopt" "$fail_report"
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

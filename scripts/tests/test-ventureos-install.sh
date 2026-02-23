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

FAKE_DASHBOARD_MACOS="$TMP_DIR/install-macos.sh"
FAKE_DASHBOARD_LINUX="$TMP_DIR/install-linux.sh"
FAKE_BRIDGE="$TMP_DIR/install-bridge.sh"
FAKE_CRON="$TMP_DIR/install-cron.sh"
FAKE_READY="$TMP_DIR/refresh-ready.sh"

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
exit 0
SH

cat > "$FAKE_READY" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
echo "ready|$*|BRIDGE_TOKEN=${BRIDGE_TOKEN:-}" >> "$CALL_LOG"
exit 0
SH

chmod +x "$FAKE_DASHBOARD_MACOS" "$FAKE_DASHBOARD_LINUX" "$FAKE_BRIDGE" "$FAKE_CRON" "$FAKE_READY"

BRIDGE_ENV="$TMP_DIR/bridge.env"
cat > "$BRIDGE_ENV" <<'EOF_ENV'
BRIDGE_TOKEN=test-bridge-token
BRIDGE_PORT=18790
EOF_ENV

export CALL_LOG
export VENTUREOS_INSTALL_DASHBOARD_MACOS_SCRIPT="$FAKE_DASHBOARD_MACOS"
export VENTUREOS_INSTALL_DASHBOARD_LINUX_SCRIPT="$FAKE_DASHBOARD_LINUX"
export VENTUREOS_INSTALL_BRIDGE_SCRIPT="$FAKE_BRIDGE"
export VENTUREOS_INSTALL_CRON_SCRIPT="$FAKE_CRON"
export VENTUREOS_INSTALL_READINESS_SCRIPT="$FAKE_READY"
export VENTUREOS_INSTALL_REPORT_DIR="$TMP_DIR/reports"
export VENTUREOS_INSTALL_OS="Darwin"

# Dry-run should plan actions without executing scripts.
bash "$SCRIPT" \
  --non-interactive \
  --dry-run \
  --dashboard-port 8123 \
  --profile bridge \
  --bridge-env "$BRIDGE_ENV" \
  --bridge-token-file "$TMP_DIR/bridge-token" \
  >/tmp/test-ventureos-install-dry-run.out

if [[ -s "$CALL_LOG" ]]; then
  echo "Expected dry-run mode to avoid executing installer primitives" >&2
  exit 1
fi

grep -q "VENTUREOS_INSTALL_RESULT=PLANNED" /tmp/test-ventureos-install-dry-run.out
echo "VENTUREOS_INSTALL_DRY_RUN_OK"

# Executing mode should run each primitive once with expected args.
bash "$SCRIPT" \
  --non-interactive \
  --dashboard-port 8124 \
  --profile bridge \
  --bridge-env "$BRIDGE_ENV" \
  --bridge-token-file "$TMP_DIR/bridge-token" \
  >/tmp/test-ventureos-install-run.out

grep -q "dashboard-macos|" "$CALL_LOG"
grep -q "bridge|--bridge-env $BRIDGE_ENV" "$CALL_LOG"
grep -q "cron|--force" "$CALL_LOG"
grep -q "ready|--profile bridge --dashboard-url http://127.0.0.1:8124 --bridge-token-file $TMP_DIR/bridge-token|BRIDGE_TOKEN=test-bridge-token" "$CALL_LOG"
grep -q "VENTUREOS_INSTALL_RESULT=PASS" /tmp/test-ventureos-install-run.out
echo "VENTUREOS_INSTALL_EXECUTE_OK"

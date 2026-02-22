#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/install-bridge-launchagent.sh"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

REPO_FAKE="$TMP_DIR/repo"
mkdir -p "$REPO_FAKE/config" "$REPO_FAKE/dashboard/dist/dashboard/server" "$REPO_FAKE/runtime/logs"
cat > "$REPO_FAKE/config/bridge.env" <<'EOF_ENV'
BRIDGE_PORT=18790
BRIDGE_TOKEN=test-token
EOF_ENV
cat > "$REPO_FAKE/dashboard/dist/dashboard/server/bridge.js" <<'EOF_JS'
console.log('bridge')
EOF_JS

PLIST_PATH="$TMP_DIR/com.ventureos.bridge.test.plist"

bash "$SCRIPT" \
  --repo-root "$REPO_FAKE" \
  --bridge-env "$REPO_FAKE/config/bridge.env" \
  --bridge-entry "$REPO_FAKE/dashboard/dist/dashboard/server/bridge.js" \
  --plist-path "$PLIST_PATH" \
  --label "com.ventureos.bridge.test" \
  --print-only >/tmp/install-bridge-launchagent-test.out

if [[ ! -f "$PLIST_PATH" ]]; then
  echo "Expected plist file to be rendered: $PLIST_PATH" >&2
  exit 1
fi

grep -q "<string>com.ventureos.bridge.test</string>" "$PLIST_PATH"
grep -q "bridge.env" "$PLIST_PATH"
grep -q "bridge.js" "$PLIST_PATH"
grep -q "<key>RunAtLoad</key>" "$PLIST_PATH"
grep -q "<key>KeepAlive</key>" "$PLIST_PATH"
echo "INSTALL_BRIDGE_LAUNCHAGENT_RENDER_OK"

set +e
bash "$SCRIPT" \
  --repo-root "$REPO_FAKE" \
  --bridge-env "$REPO_FAKE/config/missing.env" \
  --bridge-entry "$REPO_FAKE/dashboard/dist/dashboard/server/bridge.js" \
  --plist-path "$PLIST_PATH" \
  --print-only >/tmp/install-bridge-launchagent-test-missing.out 2>&1
MISSING_RC=$?
set -e

if [[ "$MISSING_RC" -eq 0 ]]; then
  echo "Expected missing bridge env scenario to fail" >&2
  exit 1
fi

echo "INSTALL_BRIDGE_LAUNCHAGENT_MISSING_ENV_FAILS_OK"

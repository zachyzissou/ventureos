#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

LABEL="com.ventureos.bridge"
BRIDGE_ENV_PATH="$REPO_ROOT/config/bridge.env"
BRIDGE_ENTRY_PATH="$REPO_ROOT/dashboard/dist/dashboard/server/bridge.js"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"
PRINT_ONLY=false
ACTION="install"

usage() {
  cat <<'EOF'
install-bridge-launchagent.sh

Usage:
  bash scripts/install-bridge-launchagent.sh [options]

Options:
  --label <id>          LaunchAgent label (default: com.ventureos.bridge)
  --repo-root <path>    Repository root (default: script-detected repo root)
  --bridge-env <path>   Bridge env file (default: <repo>/config/bridge.env)
  --bridge-entry <path> Bridge server entry (default: <repo>/dashboard/dist/dashboard/server/bridge.js)
  --plist-path <path>   LaunchAgent plist path (default: ~/Library/LaunchAgents/<label>.plist)
  --print-only          Render plist/update actions without launchctl calls
  --status              Print launch agent + health status
  --uninstall           Bootout and remove LaunchAgent plist
  -h, --help            Show this help
EOF
}

need_value() {
  if [[ $# -lt 2 ]]; then
    echo "Missing value for $1" >&2
    exit 2
  fi
}

shell_quote() {
  local value="$1"
  printf "'%s'" "$(printf '%s' "$value" | sed "s/'/'\\\\''/g")"
}

xml_escape() {
  local value="$1"
  value="${value//&/&amp;}"
  value="${value//</&lt;}"
  value="${value//>/&gt;}"
  printf '%s' "$value"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --label)
      need_value "$@"
      LABEL="$2"
      shift 2
      ;;
    --repo-root)
      need_value "$@"
      REPO_ROOT="$2"
      shift 2
      ;;
    --bridge-env)
      need_value "$@"
      BRIDGE_ENV_PATH="$2"
      shift 2
      ;;
    --bridge-entry)
      need_value "$@"
      BRIDGE_ENTRY_PATH="$2"
      shift 2
      ;;
    --plist-path)
      need_value "$@"
      PLIST_PATH="$2"
      shift 2
      ;;
    --print-only)
      PRINT_ONLY=true
      shift
      ;;
    --status)
      ACTION="status"
      shift
      ;;
    --uninstall)
      ACTION="uninstall"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$PLIST_PATH" == *"/"* ]]; then
  :
else
  echo "Invalid --plist-path: $PLIST_PATH" >&2
  exit 2
fi

DOMAIN="gui/${UID}"
PLIST_DIR="$(dirname "$PLIST_PATH")"
LOG_DIR="$REPO_ROOT/runtime/logs"

bridge_cmd=$(
  printf "cd %s && mkdir -p %s && set -a && source %s && set +a && exec node %s >> %s 2>&1" \
    "$(shell_quote "$REPO_ROOT")" \
    "$(shell_quote "$LOG_DIR")" \
    "$(shell_quote "$BRIDGE_ENV_PATH")" \
    "$(shell_quote "$BRIDGE_ENTRY_PATH")" \
    "$(shell_quote "$LOG_DIR/bridge.log")"
)

render_plist() {
  cat <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$(xml_escape "$LABEL")</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>$(xml_escape "$bridge_cmd")</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>$(xml_escape "$REPO_ROOT")</string>
  <key>StandardOutPath</key>
  <string>$(xml_escape "$LOG_DIR/bridge.launchd.out.log")</string>
  <key>StandardErrorPath</key>
  <string>$(xml_escape "$LOG_DIR/bridge.launchd.err.log")</string>
</dict>
</plist>
EOF
}

if [[ "$ACTION" == "status" ]]; then
  echo "Label: $LABEL"
  echo "Domain: $DOMAIN"
  echo "Plist: $PLIST_PATH"
  if [[ -f "$PLIST_PATH" ]]; then
    echo "Plist status: present"
  else
    echo "Plist status: missing"
  fi
  if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1 || launchctl list "$LABEL" >/dev/null 2>&1; then
    echo "launchctl: loaded"
  else
    echo "launchctl: not loaded"
  fi
  if curl -sf "http://127.0.0.1:${BRIDGE_PORT:-18790}/health" >/dev/null 2>&1; then
    echo "bridge health: ok"
  else
    echo "bridge health: unavailable"
  fi
  exit 0
fi

if [[ "$ACTION" == "uninstall" ]]; then
  if [[ "$PRINT_ONLY" == "true" ]]; then
    echo "Would bootout $DOMAIN/$LABEL and remove $PLIST_PATH"
    exit 0
  fi
  launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
  rm -f "$PLIST_PATH"
  echo "Removed bridge LaunchAgent: $LABEL"
  exit 0
fi

if [[ ! -f "$BRIDGE_ENV_PATH" ]]; then
  echo "Missing bridge env file: $BRIDGE_ENV_PATH" >&2
  exit 2
fi
if [[ ! -f "$BRIDGE_ENTRY_PATH" ]]; then
  echo "Missing bridge entry file: $BRIDGE_ENTRY_PATH" >&2
  echo "Run: npm run compile --workspace=dashboard" >&2
  exit 2
fi

mkdir -p "$PLIST_DIR" "$LOG_DIR"
render_plist >"$PLIST_PATH"

if [[ "$PRINT_ONLY" == "true" ]]; then
  echo "Rendered LaunchAgent plist: $PLIST_PATH"
  exit 0
fi

launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
if ! launchctl bootstrap "$DOMAIN" "$PLIST_PATH" >/dev/null 2>&1; then
  launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
  launchctl load -w "$PLIST_PATH"
fi
launchctl enable "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
launchctl kickstart -k "$DOMAIN/$LABEL" >/dev/null 2>&1 || launchctl start "$LABEL" >/dev/null 2>&1 || true

echo "Installed and started bridge LaunchAgent:"
echo "  Label: $LABEL"
echo "  Plist: $PLIST_PATH"
echo "  Status: launchctl print $DOMAIN/$LABEL"

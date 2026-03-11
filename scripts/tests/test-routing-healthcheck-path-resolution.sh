#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/routing-healthcheck.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

HOME_DIR="$TMP_DIR/home"
WS="$TMP_DIR/workspace-atlas"
mkdir -p "$HOME_DIR/.openclaw/credentials/discord" "$WS/config"

cat > "$HOME_DIR/.openclaw/credentials/discord/webhooks.json" <<'JSON'
{
  "alerts": "https://example.invalid/alerts",
  "role-1": "https://example.invalid/role1"
}
JSON

cat > "$WS/config/alert-routing.json" <<'JSON'
{
  "alertsChannelId": "alerts",
  "roleChannels": {
    "mission-control": "role-1"
  },
  "webhookMapPath": "~/.openclaw/credentials/discord/webhooks.json",
  "suppressSeconds": 3600
}
JSON

HOME="$HOME_DIR" AGENT_ID=atlas OPENCLAW_WORKSPACE="$WS" "$SCRIPT" > "$TMP_DIR/out.txt"

python3 - <<PY
import json
from pathlib import Path

out = Path("$TMP_DIR/out.txt").read_text()
assert "HEARTBEAT_OK" in out, out

state = Path("$WS/runtime/monitor/atlas/routing-healthcheck.json")
assert state.exists(), state
payload = json.loads(state.read_text())
assert payload.get("lastStatus") == "ok", payload
assert payload.get("agentId") == "atlas", payload
print("ROUTING_HEALTHCHECK_PATH_RESOLUTION_OK")
PY

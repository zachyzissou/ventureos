#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/routing-healthcheck.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

setup_workspace() {
  local ws="$1"
  mkdir -p "$ws/config" "$ws/scripts"

  cat > "$ws/config/alert-routing.json" <<'JSON'
{
  "alertsChannelId": "alerts",
  "roleChannels": {
    "mission-control": "role-1"
  },
  "webhookMapPath": "WEBHOOK_MAP_PATH",
  "suppressSeconds": 3600
}
JSON

  local map_path="$ws/webhooks.json"
  cat > "$map_path" <<'JSON'
{
  "alerts": "https://example.invalid/alerts",
  "role-1": "https://example.invalid/role1"
}
JSON

  python3 - <<PY
import json
from pathlib import Path
cfg = Path("$ws/config/alert-routing.json")
data = json.loads(cfg.read_text())
data["webhookMapPath"] = str(Path("$map_path").resolve())
cfg.write_text(json.dumps(data, indent=2) + "\n")
PY

  cat > "$ws/scripts/discord-webhook-send.mjs" <<'EOF'
#!/usr/bin/env node
process.exit(0);
EOF
  chmod +x "$ws/scripts/discord-webhook-send.mjs"
}

WS_A="$TMP_DIR/workspace-atlas"
WS_B="$TMP_DIR/workspace-oracle"
setup_workspace "$WS_A"
setup_workspace "$WS_B"

AGENT_ID=atlas OPENCLAW_WORKSPACE="$WS_A" "$SCRIPT" >/dev/null
AGENT_ID=oracle OPENCLAW_WORKSPACE="$WS_B" "$SCRIPT" >/dev/null

python3 - <<PY
import json
from pathlib import Path

a = Path("$WS_A/runtime/monitor/atlas/routing-healthcheck.json")
b = Path("$WS_B/runtime/monitor/oracle/routing-healthcheck.json")

assert a.exists(), a
assert b.exists(), b

aj = json.loads(a.read_text())
bj = json.loads(b.read_text())

assert aj.get("agentId") == "atlas", aj
assert bj.get("agentId") == "oracle", bj
assert aj.get("workspace") != bj.get("workspace"), (aj, bj)
print("ROUTING_HEALTHCHECK_ISOLATION_OK")
PY

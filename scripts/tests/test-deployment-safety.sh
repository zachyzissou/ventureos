#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LINT="$ROOT/scripts/lint-dangerous-config.sh"

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

hybrid="$TMP_DIR/.env.hybrid"
bridge="$TMP_DIR/bridge.env"

write_good() {
  cat > "$hybrid" <<'EOF'
POSTGRES_PASSWORD=test-pass
DASHBOARD_API_TOKEN=test-dashboard-token
BRIDGE_URL=http://host.docker.internal:18790
BRIDGE_TOKEN=test-bridge-token
DASHBOARD_ALLOW_LAN_BYPASS=false
DASHBOARD_ENABLE_ACTIONS=false
EOF

  cat > "$bridge" <<'EOF'
BRIDGE_TOKEN=test-bridge-token
BRIDGE_ALLOW_CIDRS=127.0.0.1/32,192.168.65.0/24
EOF
}

expect_pass() {
  local label="$1"
  if HYBRID_ENV_FILE="$hybrid" BRIDGE_ENV_FILE="$bridge" "$LINT" >/dev/null; then
    echo "PASS: $label"
  else
    echo "FAIL: expected pass ($label)" >&2
    exit 1
  fi
}

expect_fail() {
  local label="$1"
  if HYBRID_ENV_FILE="$hybrid" BRIDGE_ENV_FILE="$bridge" "$LINT" >/dev/null 2>&1; then
    echo "FAIL: expected fail ($label)" >&2
    exit 1
  else
    echo "PASS: $label"
  fi
}

write_good
expect_pass "baseline safe config"

write_good
cat > "$hybrid" <<'EOF'
POSTGRES_PASSWORD=change-me
DASHBOARD_API_TOKEN=test-dashboard-token
BRIDGE_URL=http://host.docker.internal:18790
BRIDGE_TOKEN=test-bridge-token
DASHBOARD_ALLOW_LAN_BYPASS=false
DASHBOARD_ENABLE_ACTIONS=false
EOF
expect_fail "placeholder marker blocked"

write_good
cat >> "$hybrid" <<'EOF'
DASHBOARD_ALLOW_LAN_BYPASS=true
EOF
expect_fail "lan bypass blocked"

write_good
cat >> "$hybrid" <<'EOF'
DASHBOARD_ENABLE_ACTIONS=true
EOF
expect_fail "dashboard actions blocked"

write_good
cat >> "$bridge" <<'EOF'
BRIDGE_ALLOW_CIDRS=0.0.0.0/0
EOF
expect_fail "world-open CIDR blocked"

write_good
cat > "$bridge" <<'EOF'
BRIDGE_TOKEN=test-bridge-token
EOF
expect_fail "missing bridge cidrs blocked"

write_good
cat > "$bridge" <<'EOF'
BRIDGE_TOKEN=token-a
BRIDGE_TOKEN_FILE=/tmp/bridge-token
BRIDGE_ALLOW_CIDRS=127.0.0.1/32
EOF
expect_fail "dual bridge token source blocked"

write_good
cat > "$bridge" <<'EOF'
BRIDGE_TOKEN=different-token
BRIDGE_ALLOW_CIDRS=127.0.0.1/32
EOF
expect_fail "bridge token mismatch blocked"

write_good
cat >> "$hybrid" <<'EOF'
DASHBOARD_API_TOKENS=token1,token2
EOF
expect_fail "multi-token variables blocked"

write_good
cat >> "$hybrid" <<'EOF'
DASHBOARD_TRUST_PROXY=true
EOF
expect_pass "trust proxy warning allowed"

write_good
cat > "$hybrid" <<'EOF'
POSTGRES_PASSWORD=test-pass
DASHBOARD_API_TOKEN=test-dashboard-token
BRIDGE_URL=http://[::1]:18790
BRIDGE_TOKEN=test-bridge-token
DASHBOARD_ALLOW_LAN_BYPASS=false
DASHBOARD_ENABLE_ACTIONS=false
EOF
expect_pass "ipv6 localhost bridge url allowed"

echo "All deployment safety lint tests passed"

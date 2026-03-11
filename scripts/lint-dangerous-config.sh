#!/usr/bin/env bash
# Validate hybrid deployment config for high-risk combinations.
# Milestone M5 (#288): Deployment Safety (single-token-first)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

HYBRID_ENV_FILE="${HYBRID_ENV_FILE:-$REPO_ROOT/.env.hybrid}"
BRIDGE_ENV_FILE="${BRIDGE_ENV_FILE:-$REPO_ROOT/config/bridge.env}"

errors=0
warnings=0

fail() {
  echo "ERROR: $*" >&2
  errors=$((errors + 1))
}

warn() {
  echo "WARN: $*" >&2
  warnings=$((warnings + 1))
}

info() {
  echo "OK: $*"
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

read_env_var() {
  local file="$1"
  local key="$2"
  if [[ ! -f "$file" ]]; then
    printf ''
    return 0
  fi
  awk -F= -v k="$key" '
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    $1 == k {
      $1 = ""
      sub(/^=/, "", $0)
      print
    }
  ' "$file" | tail -n 1
}

is_true() {
  local value
  value="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  [[ "$value" == "1" || "$value" == "true" || "$value" == "yes" || "$value" == "on" ]]
}

require_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    fail "missing required file: $file"
    return 1
  fi
  info "found $(basename "$file")"
  return 0
}

check_placeholders() {
  local file="$1"
  if grep -Eiq '(change-me|changeme|todo|fixme)' "$file"; then
    fail "placeholder secret marker found in $file"
  else
    info "no placeholder markers in $(basename "$file")"
  fi
}

require_file "$HYBRID_ENV_FILE" || true
require_file "$BRIDGE_ENV_FILE" || true

if (( errors > 0 )); then
  echo "CONFIG_LINT_FAILED ($errors error(s), $warnings warning(s))" >&2
  exit 1
fi

check_placeholders "$HYBRID_ENV_FILE"
check_placeholders "$BRIDGE_ENV_FILE"

hybrid_bridge_token="$(trim "$(read_env_var "$HYBRID_ENV_FILE" "BRIDGE_TOKEN")")"
hybrid_dash_token="$(trim "$(read_env_var "$HYBRID_ENV_FILE" "DASHBOARD_API_TOKEN")")"
hybrid_bridge_url="$(trim "$(read_env_var "$HYBRID_ENV_FILE" "BRIDGE_URL")")"
allow_lan_bypass="$(trim "$(read_env_var "$HYBRID_ENV_FILE" "DASHBOARD_ALLOW_LAN_BYPASS")")"
enable_actions="$(trim "$(read_env_var "$HYBRID_ENV_FILE" "DASHBOARD_ENABLE_ACTIONS")")"
trust_proxy="$(trim "$(read_env_var "$HYBRID_ENV_FILE" "DASHBOARD_TRUST_PROXY")")"

bridge_token="$(trim "$(read_env_var "$BRIDGE_ENV_FILE" "BRIDGE_TOKEN")")"
bridge_token_file="$(trim "$(read_env_var "$BRIDGE_ENV_FILE" "BRIDGE_TOKEN_FILE")")"
bridge_allow_cidrs="$(trim "$(read_env_var "$BRIDGE_ENV_FILE" "BRIDGE_ALLOW_CIDRS")")"

if [[ -z "$hybrid_dash_token" ]]; then
  fail "DASHBOARD_API_TOKEN must be set in $(basename "$HYBRID_ENV_FILE")"
else
  info "DASHBOARD_API_TOKEN is set"
fi

if [[ -z "$hybrid_bridge_token" ]]; then
  fail "BRIDGE_TOKEN must be set in $(basename "$HYBRID_ENV_FILE")"
else
  info "BRIDGE_TOKEN is set in $(basename "$HYBRID_ENV_FILE")"
fi

if [[ -n "$bridge_token" && -n "$bridge_token_file" ]]; then
  fail "set either BRIDGE_TOKEN or BRIDGE_TOKEN_FILE in $(basename "$BRIDGE_ENV_FILE"), not both"
elif [[ -z "$bridge_token" && -z "$bridge_token_file" ]]; then
  fail "set BRIDGE_TOKEN or BRIDGE_TOKEN_FILE in $(basename "$BRIDGE_ENV_FILE")"
else
  info "bridge auth source is singular (single-token-first)"
fi

if [[ -n "$bridge_token" && -n "$hybrid_bridge_token" && "$bridge_token" != "$hybrid_bridge_token" ]]; then
  fail "BRIDGE_TOKEN mismatch between $(basename "$HYBRID_ENV_FILE") and $(basename "$BRIDGE_ENV_FILE")"
fi

if grep -Eq '^[[:space:]]*(DASHBOARD_API_TOKENS|BRIDGE_TOKENS|.*_TOKEN_[0-9]+)=' "$HYBRID_ENV_FILE"; then
  fail "multi-token variables detected in $(basename "$HYBRID_ENV_FILE") (single-token-first violation)"
else
  info "no multi-token vars detected in $(basename "$HYBRID_ENV_FILE")"
fi

if is_true "$allow_lan_bypass"; then
  fail "DASHBOARD_ALLOW_LAN_BYPASS=true is dangerous for hybrid deployment"
fi

if is_true "$enable_actions"; then
  fail "DASHBOARD_ENABLE_ACTIONS=true is dangerous for production control plane"
fi

if is_true "$trust_proxy"; then
  warn "DASHBOARD_TRUST_PROXY=true requires explicit trusted reverse proxy boundaries"
fi

if [[ -z "$bridge_allow_cidrs" ]]; then
  fail "BRIDGE_ALLOW_CIDRS must be set with at least one CIDR"
elif [[ "$bridge_allow_cidrs" == *"0.0.0.0/0"* || "$bridge_allow_cidrs" == *"::/0"* ]]; then
  fail "BRIDGE_ALLOW_CIDRS must not include world-open CIDRs (0.0.0.0/0 or ::/0)"
else
  info "bridge CIDR allowlist is not world-open"
fi

if [[ -n "$hybrid_bridge_url" ]]; then
  if [[ "$hybrid_bridge_url" =~ ^https?://(host\.docker\.internal|localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?(/.*)?$ ]]; then
    info "BRIDGE_URL is local-safe ($hybrid_bridge_url)"
  else
    warn "BRIDGE_URL points to non-local host ($hybrid_bridge_url); verify this is intentional"
  fi
fi

if (( errors > 0 )); then
  echo "CONFIG_LINT_FAILED ($errors error(s), $warnings warning(s))" >&2
  exit 1
fi

echo "CONFIG_LINT_OK ($warnings warning(s))"

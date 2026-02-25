#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CADENCE_SCRIPT="${VENTUREOS_LOCAL_INTEGRATION_CADENCE_SCRIPT:-$REPO_ROOT/scripts/run-local-integration-cadence.sh}"
OPENCLAW_DIR_PATH="${VENTUREOS_LOCAL_INTEGRATION_CADENCE_OPENCLAW_DIR:-${OPENCLAW_DIR:-$HOME/.openclaw}}"
BRIDGE_ENV_PATH="${VENTUREOS_LOCAL_INTEGRATION_CADENCE_BRIDGE_ENV:-$REPO_ROOT/config/bridge.env}"
REQUIRE_BRIDGE_ENV="${VENTUREOS_LOCAL_INTEGRATION_CADENCE_REQUIRE_BRIDGE_ENV:-0}"

usage() {
  cat <<'EOF_USAGE'
local-integration-cadence-cron.sh

Usage:
  bash scripts/local-integration-cadence-cron.sh [extra installer/preflight args]

Behavior:
  - Invokes scripts/run-local-integration-cadence.sh
  - Always forwards --openclaw-dir
  - Forwards --bridge-env when bridge env file exists

Env:
  VENTUREOS_LOCAL_INTEGRATION_CADENCE_SCRIPT
  VENTUREOS_LOCAL_INTEGRATION_CADENCE_OPENCLAW_DIR
  VENTUREOS_LOCAL_INTEGRATION_CADENCE_BRIDGE_ENV
  VENTUREOS_LOCAL_INTEGRATION_CADENCE_REQUIRE_BRIDGE_ENV (0|1|true|false)
EOF_USAGE
}

is_truthy() {
  local value
  value="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  case "$value" in
    1|true|yes|on) return 0 ;;
    0|false|no|off|"") return 1 ;;
    *)
      echo "Invalid truthy value: $1" >&2
      exit 2
      ;;
  esac
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || "${1:-}" == "--usage" ]]; then
  usage
  exit 0
fi

if [[ ! -f "$CADENCE_SCRIPT" ]]; then
  echo "Missing cadence script: $CADENCE_SCRIPT" >&2
  exit 2
fi

forward_args=(--openclaw-dir "$OPENCLAW_DIR_PATH")

if [[ -f "$BRIDGE_ENV_PATH" ]]; then
  forward_args+=(--bridge-env "$BRIDGE_ENV_PATH")
else
  if is_truthy "$REQUIRE_BRIDGE_ENV"; then
    echo "Bridge env required but not found: $BRIDGE_ENV_PATH" >&2
    exit 2
  fi
  echo "Skipping --bridge-env; file not found: $BRIDGE_ENV_PATH" >&2
fi

cmd=(bash "$CADENCE_SCRIPT" -- "${forward_args[@]}")
if [[ $# -gt 0 ]]; then
  cmd+=("$@")
fi

"${cmd[@]}"

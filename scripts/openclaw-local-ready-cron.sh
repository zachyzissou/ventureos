#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/openclaw-local-defaults.sh"
REFRESH_SCRIPT="${OPENCLAW_LOCAL_READY_REFRESH_SCRIPT:-$REPO_ROOT/scripts/refresh-local-integration-ready.sh}"

HISTORY_LIMIT="${OPENCLAW_LOCAL_READY_HISTORY_LIMIT:-7}"
PRUNE_KEEP="${OPENCLAW_LOCAL_READY_PRUNE_KEEP:-14}"
PROFILE="${OPENCLAW_LOCAL_READY_PROFILE:-full}"
MAX_AGE_MIN="${OPENCLAW_LOCAL_READY_MAX_AGE_MIN:-360}"
DASHBOARD_URL="$(openclaw_local_resolve_dashboard_url "" "${OPENCLAW_LOCAL_READY_DASHBOARD_URL:-}" "${DASHBOARD_URL:-}" "${DASHBOARD_PORT:-7000}")"

if ! [[ "$HISTORY_LIMIT" =~ ^[0-9]+$ ]] || [[ "$HISTORY_LIMIT" -lt 1 ]]; then
  echo "Invalid OPENCLAW_LOCAL_READY_HISTORY_LIMIT: $HISTORY_LIMIT" >&2
  exit 2
fi
if ! [[ "$PRUNE_KEEP" =~ ^[0-9]+$ ]]; then
  echo "Invalid OPENCLAW_LOCAL_READY_PRUNE_KEEP: $PRUNE_KEEP" >&2
  exit 2
fi
if ! [[ "$MAX_AGE_MIN" =~ ^[0-9]+$ ]]; then
  echo "Invalid OPENCLAW_LOCAL_READY_MAX_AGE_MIN: $MAX_AGE_MIN" >&2
  exit 2
fi
if [[ "$PROFILE" != "quick" && "$PROFILE" != "full" && "$PROFILE" != "bridge" ]]; then
  echo "Invalid OPENCLAW_LOCAL_READY_PROFILE: $PROFILE" >&2
  exit 2
fi
if ! openclaw_local_validate_dashboard_url "$DASHBOARD_URL"; then
  echo "Invalid OPENCLAW_LOCAL_READY_DASHBOARD_URL: $DASHBOARD_URL" >&2
  exit 2
fi
if [[ ! -f "$REFRESH_SCRIPT" ]]; then
  echo "Missing refresh script: $REFRESH_SCRIPT" >&2
  exit 2
fi

cmd=(
  bash "$REFRESH_SCRIPT"
  --history-limit "$HISTORY_LIMIT" \
  --prune-keep "$PRUNE_KEEP" \
  --max-age-min "$MAX_AGE_MIN" \
  --profile "$PROFILE" \
  --dashboard-url "$DASHBOARD_URL"
)

cmd+=("$@")
"${cmd[@]}"

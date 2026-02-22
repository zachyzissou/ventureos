#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REFRESH_SCRIPT="${OPENCLAW_LOCAL_READY_REFRESH_SCRIPT:-$REPO_ROOT/scripts/refresh-local-integration-ready.sh}"

HISTORY_LIMIT="${OPENCLAW_LOCAL_READY_HISTORY_LIMIT:-7}"
PRUNE_KEEP="${OPENCLAW_LOCAL_READY_PRUNE_KEEP:-14}"
PROFILE="${OPENCLAW_LOCAL_READY_PROFILE:-full}"

if ! [[ "$HISTORY_LIMIT" =~ ^[0-9]+$ ]] || [[ "$HISTORY_LIMIT" -lt 1 ]]; then
  echo "Invalid OPENCLAW_LOCAL_READY_HISTORY_LIMIT: $HISTORY_LIMIT" >&2
  exit 2
fi
if ! [[ "$PRUNE_KEEP" =~ ^[0-9]+$ ]]; then
  echo "Invalid OPENCLAW_LOCAL_READY_PRUNE_KEEP: $PRUNE_KEEP" >&2
  exit 2
fi
if [[ "$PROFILE" != "quick" && "$PROFILE" != "full" && "$PROFILE" != "bridge" ]]; then
  echo "Invalid OPENCLAW_LOCAL_READY_PROFILE: $PROFILE" >&2
  exit 2
fi
if [[ ! -f "$REFRESH_SCRIPT" ]]; then
  echo "Missing refresh script: $REFRESH_SCRIPT" >&2
  exit 2
fi

bash "$REFRESH_SCRIPT" \
  --history-limit "$HISTORY_LIMIT" \
  --prune-keep "$PRUNE_KEEP" \
  --profile "$PROFILE" \
  "$@"

#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

TRACKER_PATH="${SUBSCRIPTION_TRACKER_PATH:-$HOME/clawd/subscription-quota-tracker.js}"
OPENCLAW_BIN="${OPENCLAW_BIN:-openclaw}"

if [[ -f "$TRACKER_PATH" ]]; then
  node "$TRACKER_PATH" report
  exit 0
fi

echo "WARN: subscription tracker missing at $TRACKER_PATH; using OpenClaw usage fallback" >&2

if ! command -v "$OPENCLAW_BIN" >/dev/null 2>&1; then
  echo "ERROR: OpenClaw CLI not found ($OPENCLAW_BIN); cannot collect usage fallback" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required for fallback usage shaping" >&2
  exit 1
fi

USAGE_JSON="$("$OPENCLAW_BIN" channels list --json 2>/dev/null || true)"
if [[ -z "$USAGE_JSON" ]]; then
  echo "ERROR: unable to fetch usage snapshot from openclaw channels list --json" >&2
  exit 1
fi

echo "$USAGE_JSON" | jq -c '
{
  source: "openclaw.channels.list",
  capturedAt: (.usage.updatedAt // null),
  providers: ((.usage.providers // []) | map({
    provider,
    displayName,
    plan,
    windows
  }))
}'

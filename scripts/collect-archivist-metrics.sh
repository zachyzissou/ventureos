#!/usr/bin/env bash
set -euo pipefail

# Agent-specific Warp Technology input collector (best-effort proxies).
# Writes JSON to: $OUT (default: ~/clawd/runtime/rpg-metrics/_collected/warp-<agent>.json)

AGENT_ID="archivist"
OUT="${OUT:-$HOME/clawd/runtime/rpg-metrics/_collected/warp-${AGENT_ID}.json}"

command -v python3 >/dev/null 2>&1 || { echo "python3 not found" >&2; exit 1; }

mkdir -p "$(dirname "$OUT")"
python3 /Users/zachgonser/clawd/scripts/_collect-warp-metrics.py "$AGENT_ID" > "$OUT"
echo "$OUT"

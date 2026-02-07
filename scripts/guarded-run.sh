#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 4 ]]; then
  echo "Usage: guarded-run.sh <timeout_seconds> <max_attempts> <base_sleep_seconds> <command...>" >&2
  exit 1
fi

TIMEOUT="$1"; shift
MAX_ATTEMPTS="$1"; shift
BASE_SLEEP="$1"; shift

# Standard wrapper: retry + timeout
/Users/zachgonser/clawd/projects/openclaw-upgrade/scripts/retry.sh "$MAX_ATTEMPTS" "$BASE_SLEEP" \
  /Users/zachgonser/clawd/projects/openclaw-upgrade/scripts/with-timeout.sh "$TIMEOUT" "$@"

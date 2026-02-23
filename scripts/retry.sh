#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: retry.sh <max_attempts> <base_sleep_seconds> <command...>" >&2
  exit 1
}

[[ $# -lt 3 ]] && usage

MAX="$1"; shift
BASE="$1"; shift

attempt=1
while true; do
  "$@" && exit 0
  rc=$?

  # Optional: do-not-retry exit codes (space-delimited)
  if [[ -n "${RETRY_EXCLUDE_CODES:-}" ]]; then
    for code in $RETRY_EXCLUDE_CODES; do
      if [[ "$rc" == "$code" ]]; then
        exit $rc
      fi
    done
  fi

  if (( attempt >= MAX )); then
    exit $rc
  fi
  backoff=$(( BASE * (1 << (attempt - 1)) ))
  sleep "$backoff"
  attempt=$((attempt + 1))
done

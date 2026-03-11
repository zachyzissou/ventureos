#!/usr/bin/env bash
set -euo pipefail

# sqlite-with-retries.sh
# Wrapper around sqlite3 that retries on lock contention (SQLITE_BUSY / "database is locked").
#
# Usage:
#   ./sqlite-with-retries.sh /path/to/db.sqlite "SQL..."
#   echo "SQL..." | ./sqlite-with-retries.sh /path/to/db.sqlite
#
# Env:
#   SQLITE_MAX_RETRIES (default 3)
#   SQLITE_BASE_DELAY_MS (default 200)

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

DB="${1:-}"
shift || true

if [[ -z "$DB" ]]; then
  echo "Usage: $0 <db> [sql]" >&2
  exit 2
fi
if [[ ! -f "$DB" ]]; then
  echo "DB not found: $DB" >&2
  exit 2
fi

MAX_RETRIES="${SQLITE_MAX_RETRIES:-3}"
BASE_DELAY_MS="${SQLITE_BASE_DELAY_MS:-200}"

# Build SQL payload
if [[ $# -gt 0 ]]; then
  USER_SQL="$1"
else
  USER_SQL=$(cat)
fi

# Always set connection-level pragmas here (silent .timeout + FK enforcement).
SQLITE3_CMD=(sqlite3 "$DB" -cmd ".timeout 5000" -cmd "PRAGMA foreign_keys=ON;")

attempt=0
while true; do
  attempt=$((attempt + 1))

  # Capture stderr to inspect lock errors
  set +e
  OUT=$("${SQLITE3_CMD[@]}" 2>&1 <<<"$USER_SQL")
  CODE=$?
  set -e

  if [[ $CODE -eq 0 ]]; then
    printf '%s' "$OUT"
    exit 0
  fi

  # Match common lock messages
  if echo "$OUT" | grep -Eqi "database is locked|SQLITE_BUSY|database table is locked"; then
    if (( attempt > MAX_RETRIES )); then
      echo "$OUT" >&2
      exit $CODE
    fi

    delay_ms=$((BASE_DELAY_MS * (2 ** (attempt - 1))))
    sleep_sec=$(python3 - <<PY
import os
print(${delay_ms} / 1000.0)
PY
)
    sleep "$sleep_sec"
    continue
  fi

  echo "$OUT" >&2
  exit $CODE
done

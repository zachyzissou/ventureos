#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: with-timeout.sh <seconds> <command...>" >&2
  exit 1
fi

TIMEOUT="$1"; shift

python3 - <<'PY' "$TIMEOUT" "$@"
import subprocess, sys

timeout = int(sys.argv[1])
cmd = sys.argv[2:]
try:
    res = subprocess.run(cmd, timeout=timeout)
    sys.exit(res.returncode)
except subprocess.TimeoutExpired:
    print(f"TIMEOUT after {timeout}s", file=sys.stderr)
    sys.exit(124)
PY

#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
export VENTUREOS_ROOT="${VENTUREOS_ROOT:-$REPO_ROOT}"
exec node -r ts-node/register "$REPO_ROOT/scripts/evidence-cli.ts" readiness "$@"

#!/usr/bin/env bash
# Shared agent/workspace helpers for VentureOS scripts.
# shellcheck shell=bash

set -euo pipefail

agent_env_script_dir() {
  cd "$(dirname "${BASH_SOURCE[0]}")" && pwd
}

agent_env_repo_root() {
  cd "$(agent_env_script_dir)/../.." && pwd
}

agent_env_agent_id() {
  local id="${OPENCLAW_AGENT_ID:-${AGENT_ID:-main}}"
  # Keep IDs filesystem-safe.
  id="${id//[^a-zA-Z0-9._-]/-}"
  printf '%s\n' "$id"
}

agent_env_workspace_root() {
  local root="${OPENCLAW_WORKSPACE:-${AGENT_WORKSPACE:-${WORKSPACE_ROOT:-}}}"
  if [[ -z "$root" ]]; then
    root="$(agent_env_repo_root)"
  fi
  python3 - "$root" <<'PY'
from pathlib import Path
import sys
print(Path(sys.argv[1]).expanduser().resolve())
PY
}

agent_env_tmp_dir() {
  local d
  d="/tmp/agent-$(agent_env_agent_id)"
  mkdir -p "$d"
  chmod 700 "$d" 2>/dev/null || true
  printf '%s\n' "$d"
}

agent_env_resolve_path() {
  local raw="$1"
  python3 - "$raw" <<'PY'
from pathlib import Path
import sys
print(Path(sys.argv[1]).expanduser().resolve())
PY
}

agent_env_is_within() {
  local target="$1"
  local base="$2"
  python3 - "$target" "$base" <<'PY'
from pathlib import Path
import sys

target = Path(sys.argv[1]).resolve()
base = Path(sys.argv[2]).resolve()

try:
    target.relative_to(base)
    print("true")
except Exception:
    print("false")
PY
}

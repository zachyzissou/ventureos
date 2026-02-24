#!/usr/bin/env bash
# Shared defaults for local OpenClaw integration scripts.
# shellcheck shell=bash

openclaw_local_default_dashboard_port() {
  local port="${OPENCLAW_LOCAL_READY_DASHBOARD_PORT:-${DASHBOARD_PORT:-7000}}"
  printf '%s\n' "$port"
}

openclaw_local_discover_dashboard_url() {
  local autodiscover="${OPENCLAW_LOCAL_READY_AUTO_DISCOVER:-1}"
  local autodiscover_lc
  local output url

  autodiscover_lc="$(printf '%s' "$autodiscover" | tr '[:upper:]' '[:lower:]')"
  case "$autodiscover_lc" in
    0|false|no|off)
      return 1
      ;;
  esac

  if ! command -v openclaw >/dev/null 2>&1; then
    return 1
  fi

  if ! output="$(openclaw dashboard --no-open 2>/dev/null)"; then
    return 1
  fi
  url="$(echo "$output" | awk -F'Dashboard URL: ' '/Dashboard URL: /{print $2; exit}')"
  if [[ -z "$url" ]]; then
    return 1
  fi

  python3 - "$url" <<'PY'
import sys
from urllib.parse import urlparse

raw = sys.argv[1].strip()
parsed = urlparse(raw)
if not parsed.scheme or not parsed.netloc:
    raise SystemExit(1)
path = parsed.path or '/'
if not path.endswith('/'):
    path += '/'
print(f"{parsed.scheme}://{parsed.netloc}{path}")
PY
}

openclaw_local_resolve_dashboard_url() {
  local cli_override="${1:-}"
  local canonical_env_url="${2:-${OPENCLAW_LOCAL_READY_DASHBOARD_URL:-}}"
  local legacy_env_url="${3:-${DASHBOARD_URL:-}}"
  local dashboard_port="${4:-}"
  local discovered_url=""

  if [[ -z "$dashboard_port" ]]; then
    dashboard_port="$(openclaw_local_default_dashboard_port)"
  fi

  if [[ -n "$cli_override" ]]; then
    printf '%s\n' "$cli_override"
    return 0
  fi
  if [[ -n "$canonical_env_url" ]]; then
    printf '%s\n' "$canonical_env_url"
    return 0
  fi
  if [[ -n "$legacy_env_url" ]]; then
    printf '%s\n' "$legacy_env_url"
    return 0
  fi
  if discovered_url="$(openclaw_local_discover_dashboard_url)"; then
    printf '%s\n' "$discovered_url"
    return 0
  fi

  printf 'http://127.0.0.1:%s\n' "$dashboard_port"
}

openclaw_local_validate_dashboard_url() {
  local url="$1"
  [[ "$url" =~ ^https?:// ]]
}

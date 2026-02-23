#!/usr/bin/env bash
# Shared defaults for local OpenClaw integration scripts.
# shellcheck shell=bash

openclaw_local_default_dashboard_port() {
  local port="${OPENCLAW_LOCAL_READY_DASHBOARD_PORT:-${DASHBOARD_PORT:-7000}}"
  printf '%s\n' "$port"
}

openclaw_local_resolve_dashboard_url() {
  local cli_override="${1:-}"
  local canonical_env_url="${2:-${OPENCLAW_LOCAL_READY_DASHBOARD_URL:-}}"
  local legacy_env_url="${3:-${DASHBOARD_URL:-}}"
  local dashboard_port="${4:-}"

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

  printf 'http://127.0.0.1:%s\n' "$dashboard_port"
}

openclaw_local_validate_dashboard_url() {
  local url="$1"
  [[ "$url" =~ ^https?:// ]]
}

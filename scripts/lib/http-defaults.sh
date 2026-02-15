#!/usr/bin/env bash
# http-defaults.sh — Standardized HTTP timeout defaults for all VentureOS scripts.
#
# Source this file in any script that uses `curl` or similar HTTP clients.
# Provides curl flags that enforce the TIMEOUT_POLICY.md defaults.
#
# Usage:
#   source "$(dirname "$0")/lib/http-defaults.sh"
#   curl ${CURL_TIMEOUT_FLAGS} https://example.com
#
# Override per-script:
#   HTTP_CONNECT_TIMEOUT=5  # seconds
#   HTTP_READ_TIMEOUT=30    # seconds (max-time is total)
#   HTTP_TOTAL_TIMEOUT=60   # seconds
#   source "$(dirname "$0")/lib/http-defaults.sh"
#
# See: docs/TIMEOUT_POLICY.md for policy details.

# shellcheck shell=bash

# ============================================================================
# Default timeouts (from TIMEOUT_POLICY.md)
# ============================================================================

# Standard API defaults
: "${HTTP_CONNECT_TIMEOUT:=3}"
: "${HTTP_READ_TIMEOUT:=12}"
: "${HTTP_TOTAL_TIMEOUT:=20}"

# Low-latency API (message send, webhook, ack)
: "${HTTP_WEBHOOK_CONNECT_TIMEOUT:=2}"
: "${HTTP_WEBHOOK_TOTAL_TIMEOUT:=10}"

# CLI network commands (gh, curl, bird-auth)
: "${HTTP_CLI_CONNECT_TIMEOUT:=5}"
: "${HTTP_CLI_TOTAL_TIMEOUT:=60}"

# Large transfers
: "${HTTP_LARGE_CONNECT_TIMEOUT:=10}"
: "${HTTP_LARGE_TOTAL_TIMEOUT:=90}"

# ============================================================================
# Curl flag sets (ready to use)
# ============================================================================

# Standard API calls
CURL_TIMEOUT_FLAGS="--connect-timeout ${HTTP_CONNECT_TIMEOUT} --max-time ${HTTP_TOTAL_TIMEOUT}"

# Webhook / low-latency calls
CURL_WEBHOOK_FLAGS="--connect-timeout ${HTTP_WEBHOOK_CONNECT_TIMEOUT} --max-time ${HTTP_WEBHOOK_TOTAL_TIMEOUT}"

# CLI / longer operations
CURL_CLI_FLAGS="--connect-timeout ${HTTP_CLI_CONNECT_TIMEOUT} --max-time ${HTTP_CLI_TOTAL_TIMEOUT}"

# Large file transfers
CURL_LARGE_FLAGS="--connect-timeout ${HTTP_LARGE_CONNECT_TIMEOUT} --max-time ${HTTP_LARGE_TOTAL_TIMEOUT}"

# ============================================================================
# Retry-safe curl wrapper
# ============================================================================

# curl_with_timeout [profile] <curl_args...>
# Uses the provided profile name (webhook|low-latency|cli|large|standard) or
# defaults to standard when the first arg isn't a known profile.
#
# Examples:
#   curl_with_timeout webhook -H "Content-Type: application/json" -d '{}' "$URL"
#   curl_with_timeout https://example.com
curl_with_timeout() {
  local profile="standard"

  case "${1-}" in
    webhook|low-latency|cli|large|standard)
      profile="$1"
      shift
      ;;
    *)
      # First arg is not a profile (likely a URL or curl flag). Keep args intact.
      ;;
  esac

  local flags
  case "$profile" in
    webhook|low-latency)
      flags="$CURL_WEBHOOK_FLAGS"
      ;;
    cli)
      flags="$CURL_CLI_FLAGS"
      ;;
    large)
      flags="$CURL_LARGE_FLAGS"
      ;;
    standard|*)
      flags="$CURL_TIMEOUT_FLAGS"
      ;;
  esac

  # shellcheck disable=SC2086
  curl -sS $flags "$@"
}

export CURL_TIMEOUT_FLAGS CURL_WEBHOOK_FLAGS CURL_CLI_FLAGS CURL_LARGE_FLAGS
export HTTP_CONNECT_TIMEOUT HTTP_READ_TIMEOUT HTTP_TOTAL_TIMEOUT
export HTTP_WEBHOOK_CONNECT_TIMEOUT HTTP_WEBHOOK_TOTAL_TIMEOUT
export HTTP_CLI_CONNECT_TIMEOUT HTTP_CLI_TOTAL_TIMEOUT
export HTTP_LARGE_CONNECT_TIMEOUT HTTP_LARGE_TOTAL_TIMEOUT

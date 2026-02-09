#!/usr/bin/env bash
set -euo pipefail

CONFIG_DEFAULT="/Users/zachgonser/.openclaw/credentials/homeassistant.json"
CONFIG="${HA_CONFIG:-$CONFIG_DEFAULT}"

base_url="${HA_URL:-}"
token="${HA_TOKEN:-}"

if [[ -z "$base_url" || -z "$token" ]]; then
  if [[ -f "$CONFIG" ]]; then
    base_url=$(jq -r '.baseUrl' "$CONFIG")
    token=$(jq -r '.token' "$CONFIG")
  fi
fi

if [[ -z "$base_url" || -z "$token" || "$base_url" == "null" || "$token" == "null" ]]; then
  echo "Missing Home Assistant credentials. Set HA_URL/HA_TOKEN or create $CONFIG" >&2
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "Usage: ha.sh states | state <entity_id> | service <domain> <service> [json]" >&2
  exit 1
fi

cmd="$1"; shift || true

request() {
  local method="$1"; shift
  local path="$1"; shift
  local data="${1:-}"
  if [[ "$method" == "GET" ]]; then
    curl -sS -H "Authorization: Bearer $token" -H "Content-Type: application/json" "$base_url$path"
  else
    curl -sS -X "$method" -H "Authorization: Bearer $token" -H "Content-Type: application/json" "$base_url$path" -d "$data"
  fi
}

case "$cmd" in
  states)
    request GET "/api/states"
    ;;
  state)
    [[ $# -ge 1 ]] || { echo "Usage: ha.sh state <entity_id>" >&2; exit 1; }
    request GET "/api/states/$1"
    ;;
  service)
    [[ $# -ge 2 ]] || { echo "Usage: ha.sh service <domain> <service> [json]" >&2; exit 1; }
    domain="$1"; service="$2"; shift 2
    data="${1:-{}}"
    request POST "/api/services/$domain/$service" "$data"
    ;;
  *)
    echo "Unknown command: $cmd" >&2
    exit 1
    ;;
esac

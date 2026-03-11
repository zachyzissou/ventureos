#!/usr/bin/env bash
# Hybrid routing + binding preflight
# Milestone M5 (#288): Deployment Safety

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --help|-h)
      cat <<'EOF'
Usage: ./scripts/preflight-routing.sh [--dry-run]

Checks:
  1) Dangerous hybrid config lint (single-token-first + risky combos)
  2) Deployment preflight checks (delegates to scripts/deploy.sh preflight)
  3) Routing healthcheck (non-dry-run only)
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

echo "== VentureOS Routing Preflight =="
echo "repo: $REPO_ROOT"
echo "mode: $([ "$DRY_RUN" = true ] && echo dry-run || echo full)"
echo ""

"$SCRIPT_DIR/lint-dangerous-config.sh"
echo ""

if "$DRY_RUN"; then
  "$SCRIPT_DIR/deploy.sh" preflight --dry-run
  echo ""
  echo "SKIP: routing-healthcheck (dry-run mode)"
  echo "ROUTING_PREFLIGHT_OK (dry-run)"
  exit 0
fi

"$SCRIPT_DIR/deploy.sh" preflight
echo ""

if "$SCRIPT_DIR/routing-healthcheck.sh"; then
  echo "routing-healthcheck: OK"
else
  echo "routing-healthcheck: FAILED" >&2
  exit 1
fi

echo "ROUTING_PREFLIGHT_OK"

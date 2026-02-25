#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

QUEUE_SCRIPT="${POST_MERGE_QUEUE_SCRIPT:-$REPO_ROOT/scripts/pr-queue-sweep.sh}"
QUEUE_JSON="${POST_MERGE_QUEUE_JSON:-$REPO_ROOT/runtime/reports/pr-queue/queue-latest.json}"

forward_queue_args=()

usage() {
  cat <<'EOF_USAGE'
post-merge-queue-snapshot.sh

Usage:
  bash scripts/post-merge-queue-snapshot.sh [options] [-- <extra queue args>]

Options:
  --queue-json <path>      Queue snapshot output path
  --queue-script <path>    Override queue sweep script path
  -h, --help               Show help

Markers:
  POST_MERGE_QUEUE_STATUS=PASS|FAIL
  POST_MERGE_QUEUE_JSON=<path>
  POST_MERGE_QUEUE_SWEEP_STATUS=<empty|quiet|review-needed|blocked|merge-ready|unknown>
EOF_USAGE
}

need_value() {
  if [[ $# -lt 2 ]]; then
    echo "Missing value for $1" >&2
    exit 2
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --queue-json)
      need_value "$@"
      QUEUE_JSON="$2"
      shift 2
      ;;
    --queue-script)
      need_value "$@"
      QUEUE_SCRIPT="$2"
      shift 2
      ;;
    --)
      shift
      while [[ $# -gt 0 ]]; do
        forward_queue_args+=("$1")
        shift
      done
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ ! -f "$QUEUE_SCRIPT" ]]; then
  echo "Missing queue script: $QUEUE_SCRIPT" >&2
  exit 2
fi

mkdir -p "$(dirname "$QUEUE_JSON")"
TMP_LOG="$(mktemp)"
trap 'rm -f "$TMP_LOG"' EXIT

queue_cmd=(bash "$QUEUE_SCRIPT" --json-out "$QUEUE_JSON")
if [[ ${#forward_queue_args[@]} -gt 0 ]]; then
  queue_cmd+=("${forward_queue_args[@]}")
fi

set +e
"${queue_cmd[@]}" > >(tee "$TMP_LOG") 2>&1
queue_rc=$?
set -e

queue_status_marker="$(grep -E '^PR_QUEUE_STATUS=' "$TMP_LOG" | tail -n 1 | cut -d= -f2- || true)"

if [[ "$queue_rc" -eq 0 ]]; then
  echo "POST_MERGE_QUEUE_STATUS=PASS"
else
  echo "POST_MERGE_QUEUE_STATUS=FAIL"
fi
echo "POST_MERGE_QUEUE_JSON=$QUEUE_JSON"
echo "POST_MERGE_QUEUE_SWEEP_STATUS=${queue_status_marker:-unknown}"
echo "POST_MERGE_QUEUE_EXIT_CODE=$queue_rc"

exit "$queue_rc"

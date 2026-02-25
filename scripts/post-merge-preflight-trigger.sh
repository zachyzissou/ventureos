#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BASE_REF="${POST_MERGE_PREFLIGHT_BASE_REF:-HEAD~1}"
HEAD_REF="${POST_MERGE_PREFLIGHT_HEAD_REF:-HEAD}"
MATCH_REGEX="${POST_MERGE_PREFLIGHT_MATCH_REGEX:-^(scripts/(ventureos-install\\.sh|run-install-preflight-evidence\\.sh|install-bridge-launchagent\\.sh|install-cron\\.sh|run-local-integration-cadence\\.sh|local-integration-cadence-cron\\.sh|refresh-local-integration-checklist\\.sh)|config/bridge\\.env\\.example)$}"
CHANGED_PATHS_FILE="${POST_MERGE_PREFLIGHT_CHANGED_PATHS_FILE:-}"
PREFLIGHT_SCRIPT="${POST_MERGE_PREFLIGHT_SCRIPT:-$REPO_ROOT/scripts/run-install-preflight-evidence.sh}"

forward_preflight_args=()

usage() {
  cat <<'EOF_USAGE'
post-merge-preflight-trigger.sh

Usage:
  bash scripts/post-merge-preflight-trigger.sh [options] [-- <extra preflight args>]

Options:
  --base-ref <ref>             Base ref for git diff (default: HEAD~1)
  --head-ref <ref>             Head ref for git diff (default: HEAD)
  --match-regex <regex>        ERE used to match onboarding/install execution surfaces
  --changed-paths-file <path>  Optional newline-delimited changed path fixture
  --preflight-script <path>    Override preflight evidence script
  -h, --help                   Show help

Markers:
  POST_MERGE_PREFLIGHT_STATUS=SKIPPED|REQUIRED
  POST_MERGE_PREFLIGHT_REASON=<reason>
  POST_MERGE_PREFLIGHT_MATCH_COUNT=<n>
  POST_MERGE_PREFLIGHT_MATCHED_PATHS=<comma-delimited>
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
    --base-ref)
      need_value "$@"
      BASE_REF="$2"
      shift 2
      ;;
    --head-ref)
      need_value "$@"
      HEAD_REF="$2"
      shift 2
      ;;
    --match-regex)
      need_value "$@"
      MATCH_REGEX="$2"
      shift 2
      ;;
    --changed-paths-file)
      need_value "$@"
      CHANGED_PATHS_FILE="$2"
      shift 2
      ;;
    --preflight-script)
      need_value "$@"
      PREFLIGHT_SCRIPT="$2"
      shift 2
      ;;
    --)
      shift
      while [[ $# -gt 0 ]]; do
        forward_preflight_args+=("$1")
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

if [[ ! -f "$PREFLIGHT_SCRIPT" ]]; then
  echo "Missing preflight script: $PREFLIGHT_SCRIPT" >&2
  exit 2
fi

declare -a changed_paths=()
if [[ -n "$CHANGED_PATHS_FILE" ]]; then
  if [[ ! -f "$CHANGED_PATHS_FILE" ]]; then
    echo "Missing --changed-paths-file: $CHANGED_PATHS_FILE" >&2
    exit 2
  fi
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    changed_paths+=("$line")
  done < "$CHANGED_PATHS_FILE"
else
  if ! git -C "$REPO_ROOT" rev-parse --verify --quiet "$BASE_REF" >/dev/null; then
    echo "Unable to resolve --base-ref: $BASE_REF" >&2
    exit 2
  fi
  if ! git -C "$REPO_ROOT" rev-parse --verify --quiet "$HEAD_REF" >/dev/null; then
    echo "Unable to resolve --head-ref: $HEAD_REF" >&2
    exit 2
  fi
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    changed_paths+=("$line")
  done < <(git -C "$REPO_ROOT" diff --name-only --diff-filter=ACMR "$BASE_REF..$HEAD_REF")
fi

declare -a matched_paths=()
if [[ "${#changed_paths[@]}" -gt 0 ]]; then
  for path in "${changed_paths[@]}"; do
    if [[ "$path" =~ $MATCH_REGEX ]]; then
      matched_paths+=("$path")
    fi
  done
fi

changed_count="${#changed_paths[@]}"
match_count="${#matched_paths[@]}"
joined_matches=""
if [[ "$match_count" -gt 0 ]]; then
  joined_matches="$(printf '%s,' "${matched_paths[@]}")"
  joined_matches="${joined_matches%,}"
fi

if [[ "$match_count" -eq 0 ]]; then
  echo "POST_MERGE_PREFLIGHT_STATUS=SKIPPED"
  echo "POST_MERGE_PREFLIGHT_REASON=no-matching-paths"
  echo "POST_MERGE_PREFLIGHT_BASE_REF=$BASE_REF"
  echo "POST_MERGE_PREFLIGHT_HEAD_REF=$HEAD_REF"
  echo "POST_MERGE_PREFLIGHT_CHANGED_COUNT=$changed_count"
  echo "POST_MERGE_PREFLIGHT_MATCH_COUNT=0"
  echo "POST_MERGE_PREFLIGHT_MATCHED_PATHS="
  exit 0
fi

echo "POST_MERGE_PREFLIGHT_STATUS=REQUIRED"
echo "POST_MERGE_PREFLIGHT_REASON=matching-paths-detected"
echo "POST_MERGE_PREFLIGHT_BASE_REF=$BASE_REF"
echo "POST_MERGE_PREFLIGHT_HEAD_REF=$HEAD_REF"
echo "POST_MERGE_PREFLIGHT_CHANGED_COUNT=$changed_count"
echo "POST_MERGE_PREFLIGHT_MATCH_COUNT=$match_count"
echo "POST_MERGE_PREFLIGHT_MATCHED_PATHS=$joined_matches"

TMP_LOG="$(mktemp)"
trap 'rm -f "$TMP_LOG"' EXIT

preflight_cmd=(bash "$PREFLIGHT_SCRIPT")
if [[ ${#forward_preflight_args[@]} -gt 0 ]]; then
  preflight_cmd+=(-- "${forward_preflight_args[@]}")
fi

set +e
"${preflight_cmd[@]}" > >(tee "$TMP_LOG") 2>&1
preflight_rc=$?
set -e

preflight_json="$(grep -E '^VENTUREOS_PREFLIGHT_EVIDENCE_JSON=' "$TMP_LOG" | tail -n 1 | cut -d= -f2- || true)"
if [[ -n "$preflight_json" ]]; then
  echo "POST_MERGE_PREFLIGHT_EVIDENCE_JSON=$preflight_json"
fi
echo "POST_MERGE_PREFLIGHT_EXIT_CODE=$preflight_rc"

exit "$preflight_rc"

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

REPO_ROOT=""
HOOK_PATH=""
RUNNER_SCRIPT="$DEFAULT_REPO_ROOT/scripts/post-merge-cadence.sh"
LOG_DIR="$DEFAULT_REPO_ROOT/runtime/logs/git-hooks"
BACKUP_META_PATH=""

STATUS_ONLY=0
UNINSTALL=0
FORCE=0
DRY_RUN=0

HOOK_MARKER_START="# === VentureOS Managed Post-Merge Hook ==="
HOOK_MARKER_END="# === END VentureOS Managed Post-Merge Hook ==="

usage() {
  cat <<'EOF_USAGE'
install-post-merge-hook.sh

Usage:
  bash scripts/install-post-merge-hook.sh [options]

Options:
  --status                Print hook status and exit
  --uninstall             Remove managed VentureOS post-merge hook
  --force                 Replace existing unmanaged post-merge hook (backs it up)
  --dry-run               Print planned actions without writing files
  --repo-root <path>      Repository root to operate on (default: current git root)
  --hook-path <path>      Explicit post-merge hook path override
  --runner-script <path>  Cadence runner script path (default: scripts/post-merge-cadence.sh)
  --log-dir <path>        Hook log directory (default: runtime/logs/git-hooks)
  -h, --help              Show help

Notes:
  - Install is opt-in and local to the current clone only.
  - Hook is non-blocking: it never fails git merge/pull operations.
  - Use --uninstall to disable/remove the managed hook.
EOF_USAGE
}

need_value() {
  if [[ $# -lt 2 ]]; then
    echo "Missing value for $1" >&2
    exit 2
  fi
}

resolve_path() {
  local root="$1"
  local value="$2"
  if [[ "$value" = /* ]]; then
    printf '%s\n' "$value"
  else
    printf '%s\n' "$root/$value"
  fi
}

resolve_repo_root() {
  if [[ -n "$REPO_ROOT" ]]; then
    printf '%s\n' "$(cd "$REPO_ROOT" && pwd)"
    return 0
  fi
  if git_root="$(git rev-parse --show-toplevel 2>/dev/null)"; then
    printf '%s\n' "$git_root"
    return 0
  fi
  echo "Unable to resolve repository root. Run from a git repo or pass --repo-root." >&2
  exit 2
}

resolve_hook_path() {
  local root="$1"
  local resolved=""
  if [[ -n "$HOOK_PATH" ]]; then
    printf '%s\n' "$(resolve_path "$root" "$HOOK_PATH")"
    return 0
  fi
  resolved="$(git -C "$root" rev-parse --git-path hooks/post-merge)"
  printf '%s\n' "$(resolve_path "$root" "$resolved")"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --status)
      STATUS_ONLY=1
      shift
      ;;
    --uninstall|--disable)
      UNINSTALL=1
      shift
      ;;
    --force)
      FORCE=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --repo-root)
      need_value "$@"
      REPO_ROOT="$2"
      shift 2
      ;;
    --hook-path)
      need_value "$@"
      HOOK_PATH="$2"
      shift 2
      ;;
    --runner-script)
      need_value "$@"
      RUNNER_SCRIPT="$2"
      shift 2
      ;;
    --log-dir)
      need_value "$@"
      LOG_DIR="$2"
      shift 2
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

REPO_ROOT="$(resolve_repo_root)"
HOOK_PATH="$(resolve_hook_path "$REPO_ROOT")"
RUNNER_SCRIPT="$(resolve_path "$REPO_ROOT" "$RUNNER_SCRIPT")"
LOG_DIR="$(resolve_path "$REPO_ROOT" "$LOG_DIR")"
BACKUP_META_PATH="$HOOK_PATH.ventureos-backup"

is_managed=0
if [[ -f "$HOOK_PATH" ]] && grep -qF "$HOOK_MARKER_START" "$HOOK_PATH"; then
  is_managed=1
fi

if [[ "$STATUS_ONLY" -eq 1 ]]; then
  mode="missing"
  if [[ -f "$HOOK_PATH" ]]; then
    if [[ "$is_managed" -eq 1 ]]; then
      mode="managed"
    else
      mode="unmanaged"
    fi
  fi
  echo "POST_MERGE_HOOK_STATUS=$mode"
  echo "POST_MERGE_HOOK_PATH=$HOOK_PATH"
  echo "POST_MERGE_HOOK_RUNNER=$RUNNER_SCRIPT"
  echo "POST_MERGE_HOOK_LOG_DIR=$LOG_DIR"
  if [[ -f "$BACKUP_META_PATH" ]]; then
    echo "POST_MERGE_HOOK_BACKUP_META=$BACKUP_META_PATH"
  fi
  exit 0
fi

if [[ "$UNINSTALL" -eq 1 ]]; then
  if [[ "$is_managed" -eq 0 ]]; then
    echo "Managed VentureOS post-merge hook not installed; nothing to uninstall."
    echo "POST_MERGE_HOOK_UNINSTALL=NOOP"
    echo "POST_MERGE_HOOK_PATH=$HOOK_PATH"
    exit 0
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "DRY RUN: would remove managed hook at $HOOK_PATH"
    restore_backup=""
    if [[ -f "$BACKUP_META_PATH" ]]; then
      restore_backup="$(cat "$BACKUP_META_PATH" 2>/dev/null || true)"
    fi
    if [[ -n "$restore_backup" ]]; then
      echo "DRY RUN: would restore prior unmanaged hook from $restore_backup"
    fi
    echo "POST_MERGE_HOOK_UNINSTALL=DRY_RUN"
    echo "POST_MERGE_HOOK_PATH=$HOOK_PATH"
    exit 0
  fi
  restored_backup=""
  if [[ -f "$BACKUP_META_PATH" ]]; then
    restore_candidate="$(cat "$BACKUP_META_PATH" 2>/dev/null || true)"
    if [[ -n "$restore_candidate" && -f "$restore_candidate" ]]; then
      cp "$restore_candidate" "$HOOK_PATH"
      chmod +x "$HOOK_PATH"
      restored_backup="$restore_candidate"
    else
      rm -f "$HOOK_PATH"
    fi
    rm -f "$BACKUP_META_PATH"
  else
    rm -f "$HOOK_PATH"
  fi
  echo "Removed managed VentureOS post-merge hook."
  echo "POST_MERGE_HOOK_UNINSTALL=PASS"
  echo "POST_MERGE_HOOK_PATH=$HOOK_PATH"
  if [[ -n "$restored_backup" ]]; then
    echo "POST_MERGE_HOOK_RESTORED_BACKUP=$restored_backup"
  fi
  exit 0
fi

if [[ "$DRY_RUN" -eq 0 && ! -f "$RUNNER_SCRIPT" ]]; then
  echo "Runner script not found: $RUNNER_SCRIPT" >&2
  exit 2
fi

backup_path=""
if [[ -f "$HOOK_PATH" && "$is_managed" -eq 0 ]]; then
  if [[ "$FORCE" -eq 0 ]]; then
    echo "Existing unmanaged hook found at $HOOK_PATH (use --force to replace)." >&2
    exit 1
  fi
  backup_path="$HOOK_PATH.pre-ventureos.$(date -u +%Y%m%dT%H%M%SZ).bak"
fi

hook_body="$(cat <<EOF_HOOK
#!/usr/bin/env bash
$HOOK_MARKER_START
# Generated by scripts/install-post-merge-hook.sh
# This hook is intentionally non-blocking.

set -u

REPO_ROOT="$REPO_ROOT"
RUNNER_SCRIPT="$RUNNER_SCRIPT"
LOG_DIR="$LOG_DIR"
TIMESTAMP="\$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="\$LOG_DIR/post-merge-cadence-\$TIMESTAMP.log"

mkdir -p "\$LOG_DIR"

if [[ ! -f "\$RUNNER_SCRIPT" ]]; then
  echo "[ventureos:post-merge] missing runner: \$RUNNER_SCRIPT" >>"\$LOG_FILE"
  exit 0
fi

(
  cd "\$REPO_ROOT" || exit 0
  bash "\$RUNNER_SCRIPT" --base-ref HEAD~1 --head-ref HEAD
) >>"\$LOG_FILE" 2>&1
rc=\$?
if [[ "\$rc" -ne 0 ]]; then
  echo "[ventureos:post-merge] cadence runner exited \$rc (non-blocking)" >>"\$LOG_FILE"
fi

exit 0
$HOOK_MARKER_END
EOF_HOOK
)"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "DRY RUN: would install managed hook at $HOOK_PATH"
  if [[ -n "$backup_path" ]]; then
    echo "DRY RUN: would backup existing unmanaged hook to $backup_path"
  fi
  echo "POST_MERGE_HOOK_INSTALL=DRY_RUN"
  echo "POST_MERGE_HOOK_PATH=$HOOK_PATH"
  if [[ -n "$backup_path" ]]; then
    echo "POST_MERGE_HOOK_BACKUP=$backup_path"
  fi
  exit 0
fi

mkdir -p "$(dirname "$HOOK_PATH")"
if [[ -n "$backup_path" ]]; then
  cp "$HOOK_PATH" "$backup_path"
  printf '%s\n' "$backup_path" > "$BACKUP_META_PATH"
fi
printf '%s\n' "$hook_body" > "$HOOK_PATH"
chmod +x "$HOOK_PATH"

echo "Installed managed VentureOS post-merge hook."
echo "POST_MERGE_HOOK_INSTALL=PASS"
echo "POST_MERGE_HOOK_PATH=$HOOK_PATH"
echo "POST_MERGE_HOOK_RUNNER=$RUNNER_SCRIPT"
echo "POST_MERGE_HOOK_LOG_DIR=$LOG_DIR"
if [[ -n "$backup_path" ]]; then
  echo "POST_MERGE_HOOK_BACKUP=$backup_path"
fi

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/openclaw-local-defaults.sh"

OS_NAME="${VENTUREOS_INSTALL_OS:-$(uname)}"
NON_INTERACTIVE=0
YES=0
DRY_RUN=0
PREFLIGHT_ONLY=0
VERIFY_POST_INSTALL=0
VERIFY_TIMEOUT_SEC="${VENTUREOS_INSTALL_VERIFY_TIMEOUT_SEC:-3}"
REVERT_FROM=""
LIST_RESTORE_POINTS=0
CAPTURE_RESTORE_POINT=1
EXPLICIT_RESTORE_POINT=""

SKIP_DASHBOARD_INSTALL=0
SKIP_BRIDGE_LAUNCHAGENT=0
SKIP_CRON_INSTALL=0
SKIP_READINESS=0
FORCE_CRON_INSTALL=1
INSTALL_PRESET="${VENTUREOS_INSTALL_PRESET:-full}"

EXPLICIT_SKIP_DASHBOARD=""
EXPLICIT_SKIP_BRIDGE=""
EXPLICIT_SKIP_CRON=""
EXPLICIT_SKIP_READINESS=""
EXPLICIT_PROFILE=""
EXPLICIT_FORCE_CRON=""
EXPLICIT_VERIFY=""
EXPLICIT_PRESET=""

DASHBOARD_PORT="${DASHBOARD_PORT:-7000}"
DASHBOARD_URL_OVERRIDE=""
PROFILE="${OPENCLAW_LOCAL_READY_PROFILE:-full}"
OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
BRIDGE_ENV="${BRIDGE_ENV:-$REPO_ROOT/config/bridge.env}"
BRIDGE_TOKEN_FILE="${BRIDGE_TOKEN_FILE:-}"

DASHBOARD_INSTALL_MACOS_SCRIPT="${VENTUREOS_INSTALL_DASHBOARD_MACOS_SCRIPT:-$REPO_ROOT/dashboard/scripts/install-macos.sh}"
DASHBOARD_INSTALL_LINUX_SCRIPT="${VENTUREOS_INSTALL_DASHBOARD_LINUX_SCRIPT:-$REPO_ROOT/dashboard/scripts/install.sh}"
BRIDGE_INSTALL_SCRIPT="${VENTUREOS_INSTALL_BRIDGE_SCRIPT:-$REPO_ROOT/scripts/install-bridge-launchagent.sh}"
CRON_INSTALL_SCRIPT="${VENTUREOS_INSTALL_CRON_SCRIPT:-$REPO_ROOT/scripts/install-cron.sh}"
READINESS_REFRESH_SCRIPT="${VENTUREOS_INSTALL_READINESS_SCRIPT:-$REPO_ROOT/scripts/refresh-local-integration-ready.sh}"
READINESS_STATUS_JSON="${SMOKE_REPORT_DIR:-$REPO_ROOT/runtime/reports/openclaw-local-smoke}/openclaw-local-ready-latest.json"
RESTORE_BASE_DIR="${VENTUREOS_INSTALL_RESTORE_BASE_DIR:-$REPO_ROOT/runtime/backups/ventureos-install}"
RESTORE_POINT_ID=""
RESTORE_POINT_DIR=""
RESTORE_MANIFEST_PATH=""
NO_ANIMATION="${VENTUREOS_INSTALL_NO_ANIMATION:-0}"
UI_ENABLED=0
ASSUME_TTY="${VENTUREOS_INSTALL_ASSUME_TTY:-0}"

DISCOVER_DASHBOARD_STATE="unknown"
DISCOVER_OPENCLAW_STATE="unknown"
DISCOVER_BRIDGE_ENV_STATE="unknown"
DISCOVER_BRIDGE_LAUNCHAGENT_STATE="unknown"
DISCOVER_CRON_STATE="unknown"
DISCOVER_VENTURE_CRON_STATE="unknown"
dashboard_url=""
report_file=""
adoption_evidence_file=""
ONBOARDING_MODE="non-interactive"
ONBOARDING_APPROVAL="auto-non-interactive"
ONBOARDING_ABORT_REASON=""
ONBOARDING_TRANSCRIPT_FILE=""
RESTORE_POINT_VALIDATED=0

REPORT_DIR="${VENTUREOS_INSTALL_REPORT_DIR:-$REPO_ROOT/runtime/reports/ventureos-install}"
SUMMARY_TSV="$(mktemp)"
RESTORE_INDEX_TSV="$(mktemp)"
ADOPTION_PLAN_TSV="$(mktemp)"
FINGERPRINT_BEFORE_JSON="$(mktemp)"
FINGERPRINT_AFTER_JSON="$(mktemp)"
COMPATIBILITY_TSV="$(mktemp)"
trap 'rm -f "$SUMMARY_TSV" "$RESTORE_INDEX_TSV" "$ADOPTION_PLAN_TSV" "$FINGERPRINT_BEFORE_JSON" "$FINGERPRINT_AFTER_JSON" "$COMPATIBILITY_TSV"' EXIT
INSTALL_FAILED=0

usage() {
  cat <<'EOF_USAGE'
ventureos-install.sh

Usage:
  bash scripts/ventureos-install.sh [options]

Default behavior:
  - Installs dashboard service (platform-specific installer)
  - Installs bridge LaunchAgent on macOS
  - Installs managed cron entries
  - Runs local readiness refresh smoke
  - Generates deterministic integration adoption/merge plan + change evidence artifact
  - Writes an install report artifact

Options:
  --non-interactive         Disable prompts and use flags/defaults
  --yes                     Auto-accept interactive prompts
  --dry-run                 Print planned actions without executing installers
  --preflight-only          Run compatibility + rollback rehearsal without applying installer steps
  --verify                  Run post-install verification checks and fail on verification errors
  --verify-timeout-sec <n>  Timeout (seconds) for verification checks (default: 3)
  --restore-base-dir <path> Override restore-point base dir (default: runtime/backups/ventureos-install)
  --no-restore-point        Skip pre-install restore-point capture (not recommended)
  --list-restore-points     List available restore points and exit
  --revert <dir-or-manifest>
                            Revert configs from a prior restore point and exit
  --preset <name>           Install preset: full|bridge|minimal (default: full)
  --dashboard-port <port>   Dashboard port (default: 7000)
  --dashboard-url <url>     Override readiness dashboard URL (default: canonical local URL policy)
  --profile <name>          Readiness profile: quick|full|bridge (default: full)
  --bridge-env <path>       Bridge env file path (default: config/bridge.env)
  --bridge-token-file <p>   Bridge token file path forwarded to readiness refresh
  --openclaw-dir <path>     OPENCLAW_DIR value forwarded to installers
  --skip-dashboard-install  Skip dashboard installer step
  --skip-bridge-launchagent Skip bridge LaunchAgent installer step
  --skip-cron               Skip cron installer step
  --skip-readiness          Skip readiness refresh step
  --no-force-cron           Do not pass --force to install-cron.sh
  -h, --help                Show help

Env overrides:
  VENTUREOS_INSTALL_ASSUME_TTY=1
                            Treat stdin as interactive for automation/testing.
EOF_USAGE
}

need_value() {
  if [[ $# -lt 2 ]]; then
    echo "Missing value for $1" >&2
    exit 2
  fi
}

stdin_is_tty() {
  if [[ -t 0 ]]; then
    return 0
  fi
  [[ "$ASSUME_TTY" == "1" ]]
}

ui_init() {
  if [[ "$NON_INTERACTIVE" == "0" && stdin_is_tty && -t 1 && "${TERM:-}" != "dumb" ]]; then
    UI_ENABLED=1
  else
    UI_ENABLED=0
  fi
}

ui_sleep() {
  local seconds="${1:-0.06}"
  if [[ "$UI_ENABLED" == "1" && "$NO_ANIMATION" != "1" ]]; then
    sleep "$seconds"
  fi
}

ui_section() {
  local title="$1"
  if [[ "$UI_ENABLED" == "1" ]]; then
    printf '\n\033[1;36m[%s]\033[0m\n' "$title"
  else
    printf '\n[%s]\n' "$title"
  fi
}

ui_phase() {
  local index="$1"
  local total="$2"
  local title="$3"
  if [[ "$ONBOARDING_MODE" != "interactive" ]]; then
    return 0
  fi
  if [[ "$UI_ENABLED" == "1" ]]; then
    printf '\n\033[1;35m[Phase %s/%s]\033[0m %s\n' "$index" "$total" "$title"
  else
    printf '\n[Phase %s/%s] %s\n' "$index" "$total" "$title"
  fi
  ui_sleep 0.05
}

ui_step() {
  local marker="$1"
  local label="$2"
  if [[ "$UI_ENABLED" == "1" ]]; then
    printf '\033[1;34m%s\033[0m %s\n' "$marker" "$label"
  else
    printf '%s %s\n' "$marker" "$label"
  fi
  ui_sleep 0.04
}

ui_state_line() {
  local key="$1"
  local value="$2"
  local detail="${3:-}"
  local rendered="$value"
  if [[ "$UI_ENABLED" == "1" ]]; then
    case "$value" in
      healthy|present|installed)
        rendered="$(printf '\033[32m%s\033[0m' "$value")"
        ;;
      missing|unreachable|unavailable|not-installed)
        rendered="$(printf '\033[33m%s\033[0m' "$value")"
        ;;
      *)
        rendered="$(printf '\033[36m%s\033[0m' "$value")"
        ;;
    esac
  fi

  if [[ -n "$detail" ]]; then
    echo "  $key: $rendered ($detail)"
  else
    echo "  $key: $rendered"
  fi
  ui_sleep 0.03
}

record_step() {
  local step="$1"
  local status="$2"
  local detail="$3"
  local next_command="${4:-n/a}"
  detail="${detail//$'\n'/ }"
  detail="${detail//$'\r'/ }"
  detail="${detail//$'\t'/ }"
  next_command="${next_command//$'\n'/ }"
  next_command="${next_command//$'\r'/ }"
  next_command="${next_command//$'\t'/ }"
  printf '%s\t%s\t%s\t%s\n' "$step" "$status" "$detail" "$next_command" >> "$SUMMARY_TSV"
}

run_step() {
  local step="$1"
  local detail="$2"
  shift 2
  local next_command=""
  local started_epoch=0
  local finished_epoch=0
  local elapsed_sec=0
  local detail_with_duration="$detail"
  if [[ "${1:-}" == "--next-command" ]]; then
    if [[ $# -lt 3 ]]; then
      echo "run_step missing command after --next-command" >&2
      exit 2
    fi
    next_command="$2"
    shift 2
  fi
  local command_text="$*"
  if [[ -z "$next_command" ]]; then
    next_command="$command_text"
  fi

  if [[ "$UI_ENABLED" == "1" ]]; then
    ui_step "→" "$step :: $detail"
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[dry-run] $step :: $detail"
    echo "          cmd: $command_text"
    record_step "$step" "planned" "$detail" "$next_command"
    return 0
  fi

  if [[ "$ONBOARDING_MODE" == "interactive" ]]; then
    echo "RUN   $step :: $detail"
  fi
  started_epoch="$(date +%s)"

  if "$@"; then
    finished_epoch="$(date +%s)"
    elapsed_sec=$((finished_epoch - started_epoch))
    detail_with_duration="$detail (duration=${elapsed_sec}s)"
    echo "PASS  $step :: $detail_with_duration"
    record_step "$step" "pass" "$detail_with_duration" "$next_command"
    return 0
  fi

  finished_epoch="$(date +%s)"
  elapsed_sec=$((finished_epoch - started_epoch))
  detail_with_duration="$detail (duration=${elapsed_sec}s)"
  echo "FAIL  $step :: $detail_with_duration" >&2
  record_step "$step" "fail" "$detail_with_duration" "$next_command"
  return 1
}

apply_install_preset() {
  case "$INSTALL_PRESET" in
    full)
      SKIP_DASHBOARD_INSTALL=0
      SKIP_BRIDGE_LAUNCHAGENT=0
      SKIP_CRON_INSTALL=0
      SKIP_READINESS=0
      PROFILE="${EXPLICIT_PROFILE:-full}"
      ;;
    bridge)
      SKIP_DASHBOARD_INSTALL=0
      SKIP_BRIDGE_LAUNCHAGENT=0
      SKIP_CRON_INSTALL=0
      SKIP_READINESS=0
      PROFILE="${EXPLICIT_PROFILE:-bridge}"
      ;;
    minimal)
      SKIP_DASHBOARD_INSTALL=0
      SKIP_BRIDGE_LAUNCHAGENT=1
      SKIP_CRON_INSTALL=1
      SKIP_READINESS=0
      PROFILE="${EXPLICIT_PROFILE:-quick}"
      ;;
    *)
      echo "Invalid --preset: $INSTALL_PRESET (expected full|bridge|minimal)" >&2
      exit 2
      ;;
  esac
}

verify_dashboard_health() {
  curl -sSf --max-time "$VERIFY_TIMEOUT_SEC" "${1%/}/api/health" >/dev/null
}

verify_cron_marker() {
  crontab -l 2>/dev/null | grep -Fq "VentureOS Managed Cron"
}

verify_readiness_status_artifact() {
  python3 - "$READINESS_STATUS_JSON" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
if not path.exists():
    raise SystemExit(1)
payload = json.loads(path.read_text(encoding="utf-8"))
if not isinstance(payload, dict):
    raise SystemExit(1)
if "status" not in payload or "summary" not in payload:
    raise SystemExit(1)
PY
}

list_restore_points() {
  mkdir -p "$RESTORE_BASE_DIR"
  local points
  points="$(find "$RESTORE_BASE_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -r || true)"
  if [[ -z "$points" ]]; then
    echo "No restore points found at: $RESTORE_BASE_DIR"
    return 0
  fi
  echo "Restore points:"
  while IFS= read -r point; do
    [[ -z "$point" ]] && continue
    local manifest="$point/restore-point.json"
    if [[ -f "$manifest" ]]; then
      echo "  - $point"
    else
      echo "  - $point (missing restore-point.json)"
    fi
  done <<< "$points"
}

snapshot_file_record() {
  local snapshot_id="$1"
  local target_path="$2"
  local restore_files_dir="$3"
  local backup_path="$restore_files_dir/${snapshot_id}.before"

  if [[ -e "$target_path" && ! -d "$target_path" ]]; then
    cp -p "$target_path" "$backup_path"
    printf '%s\t%s\ttrue\t%s\n' "$snapshot_id" "$target_path" "$backup_path" >> "$RESTORE_INDEX_TSV"
  else
    printf '%s\t%s\tfalse\t\n' "$snapshot_id" "$target_path" >> "$RESTORE_INDEX_TSV"
  fi
}

create_restore_point() {
  mkdir -p "$RESTORE_BASE_DIR"
  : > "$RESTORE_INDEX_TSV"

  RESTORE_POINT_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
  RESTORE_POINT_DIR="$RESTORE_BASE_DIR/$RESTORE_POINT_ID"
  RESTORE_MANIFEST_PATH="$RESTORE_POINT_DIR/restore-point.json"
  local restore_files_dir="$RESTORE_POINT_DIR/files"
  local crontab_backup="$RESTORE_POINT_DIR/crontab.before"
  local crontab_state="missing_command"

  mkdir -p "$restore_files_dir"

  if command -v crontab >/dev/null 2>&1; then
    if crontab -l > "$crontab_backup" 2>/dev/null; then
      crontab_state="present"
    else
      : > "$crontab_backup"
      crontab_state="empty"
    fi
  else
    : > "$crontab_backup"
  fi

  snapshot_file_record "bridge_env" "$BRIDGE_ENV" "$restore_files_dir"
  snapshot_file_record "openclaw_openclaw_json" "$OPENCLAW_DIR/openclaw.json" "$restore_files_dir"
  snapshot_file_record "openclaw_cron_jobs_json" "$OPENCLAW_DIR/cron/jobs.json" "$restore_files_dir"
  snapshot_file_record "openclaw_discord_webhooks_json" "$OPENCLAW_DIR/credentials/discord/webhooks.json" "$restore_files_dir"

  if [[ "$OS_NAME" == "Darwin" ]]; then
    snapshot_file_record "bridge_launchagent_plist" "$HOME/Library/LaunchAgents/com.ventureos.bridge.plist" "$restore_files_dir"
  fi

  python3 - "$RESTORE_INDEX_TSV" "$RESTORE_MANIFEST_PATH" "$RESTORE_POINT_ID" "$REPO_ROOT" "$OS_NAME" "$crontab_state" "$crontab_backup" "$SCRIPT_DIR/ventureos-install.sh" "$RESTORE_POINT_DIR" <<'PY'
import csv
import json
import pathlib
import sys

index_path = pathlib.Path(sys.argv[1])
manifest_path = pathlib.Path(sys.argv[2])
restore_id = sys.argv[3]
repo_root = sys.argv[4]
os_name = sys.argv[5]
crontab_state = sys.argv[6]
crontab_backup = sys.argv[7]
script_path = sys.argv[8]
restore_dir = sys.argv[9]

snapshots = []
with index_path.open("r", encoding="utf-8") as fh:
    reader = csv.reader(fh, delimiter="\t")
    for row in reader:
        if len(row) < 3:
            continue
        snap = {
            "id": row[0],
            "path": row[1],
            "existed_before": row[2].lower() == "true",
            "backup_path": row[3] if len(row) > 3 and row[3] else None,
        }
        snapshots.append(snap)

payload = {
    "schema_version": 1,
    "restore_point_id": restore_id,
    "created_at_utc": __import__("datetime").datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    "repo_root": repo_root,
    "os_name": os_name,
    "crontab": {
        "state": crontab_state,
        "backup_path": crontab_backup,
    },
    "snapshots": snapshots,
    "revert_command": f"bash {script_path} --revert {restore_dir}",
}

manifest_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY
}

validate_restore_point_integrity() {
  local manifest_path="$1"
  python3 - "$manifest_path" <<'PY'
import json
import pathlib
import sys

manifest_path = pathlib.Path(sys.argv[1])
if not manifest_path.exists():
    raise SystemExit(1)

payload = json.loads(manifest_path.read_text(encoding="utf-8"))
snapshots = payload.get("snapshots")
if not isinstance(snapshots, list):
    raise SystemExit(1)

for snap in snapshots:
    if not isinstance(snap, dict):
        raise SystemExit(1)
    existed_before = bool(snap.get("existed_before"))
    backup_path = snap.get("backup_path")
    if existed_before:
        if not backup_path:
            raise SystemExit(1)
        if not pathlib.Path(backup_path).exists():
            raise SystemExit(1)

crontab = payload.get("crontab")
if not isinstance(crontab, dict):
    raise SystemExit(1)
backup = crontab.get("backup_path")
if not backup or not pathlib.Path(str(backup)).exists():
    raise SystemExit(1)
PY
}

resolve_revert_manifest_path() {
  local input_path="$1"
  if [[ -d "$input_path" ]]; then
    echo "$input_path/restore-point.json"
    return 0
  fi
  echo "$input_path"
}

revert_restore_point() {
  local input_path="$1"
  local manifest_path
  manifest_path="$(resolve_revert_manifest_path "$input_path")"

  if [[ ! -f "$manifest_path" ]]; then
    echo "Restore manifest not found: $manifest_path" >&2
    return 2
  fi

  if [[ "$NON_INTERACTIVE" == "0" && stdin_is_tty && "$YES" != "1" ]]; then
    if [[ "$(prompt_yes_no "Revert configs from restore point '$manifest_path'?" "n")" != "y" ]]; then
      echo "Revert cancelled."
      return 0
    fi
  fi

  python3 - "$manifest_path" <<'PY'
import json
import os
import pathlib
import shutil
import subprocess
import sys

manifest = pathlib.Path(sys.argv[1])
payload = json.loads(manifest.read_text(encoding="utf-8"))

errors = 0
restored = 0
removed = 0
skipped = 0

for snap in payload.get("snapshots", []):
    sid = snap.get("id", "unknown")
    target = snap.get("path")
    existed_before = bool(snap.get("existed_before"))
    backup = snap.get("backup_path")

    if not target:
      print(f"SKIP  {sid} :: missing target path in manifest")
      skipped += 1
      continue

    target_path = pathlib.Path(target)
    if existed_before:
      if not backup or not pathlib.Path(backup).exists():
        print(f"FAIL  {sid} :: missing backup payload ({backup})")
        errors += 1
        continue
      target_path.parent.mkdir(parents=True, exist_ok=True)
      shutil.copy2(backup, target_path)
      print(f"PASS  {sid} :: restored {target}")
      restored += 1
    else:
      if target_path.exists() or target_path.is_symlink():
        if target_path.is_dir():
          print(f"SKIP  {sid} :: target is directory; not removing ({target})")
          skipped += 1
        else:
          target_path.unlink()
          print(f"PASS  {sid} :: removed {target} (did not exist pre-install)")
          removed += 1
      else:
        print(f"SKIP  {sid} :: already absent")
        skipped += 1

crontab = payload.get("crontab", {})
crontab_state = crontab.get("state", "unknown")
crontab_backup = crontab.get("backup_path")
if shutil.which("crontab") is None:
  print("SKIP  crontab :: crontab command unavailable")
  skipped += 1
else:
  if crontab_state == "present":
    if crontab_backup and pathlib.Path(crontab_backup).exists():
      rc = subprocess.run(["crontab", crontab_backup], capture_output=True, text=True)
      if rc.returncode == 0:
        print("PASS  crontab :: restored prior crontab")
        restored += 1
      else:
        print(f"FAIL  crontab :: restore failed ({rc.stderr.strip() or rc.stdout.strip()})")
        errors += 1
    else:
      print("FAIL  crontab :: backup missing for state=present")
      errors += 1
  elif crontab_state == "empty":
    rc = subprocess.run(["crontab", "-r"], capture_output=True, text=True)
    if rc.returncode == 0:
      print("PASS  crontab :: removed crontab (pre-install state was empty)")
      removed += 1
    else:
      msg = (rc.stderr or rc.stdout or "").strip().lower()
      if "no crontab" in msg:
        print("SKIP  crontab :: already empty")
        skipped += 1
      else:
        print(f"FAIL  crontab :: unable to clear crontab ({msg})")
        errors += 1
  else:
    print(f"SKIP  crontab :: unsupported prior state '{crontab_state}'")
    skipped += 1

print(f"REVERT_SUMMARY restored={restored} removed={removed} skipped={skipped} errors={errors}")
sys.exit(1 if errors else 0)
PY
}

discover_existing_state() {
  local dashboard_url="$1"
  local print_mode="${2:-print}"

  DISCOVER_DASHBOARD_STATE="unreachable"
  DISCOVER_OPENCLAW_STATE="missing"
  DISCOVER_BRIDGE_ENV_STATE="missing"
  DISCOVER_BRIDGE_LAUNCHAGENT_STATE="unavailable"
  DISCOVER_CRON_STATE="empty"
  DISCOVER_VENTURE_CRON_STATE="not-installed"

  if verify_dashboard_health "$dashboard_url"; then
    DISCOVER_DASHBOARD_STATE="healthy"
  fi

  if [[ -d "$OPENCLAW_DIR" ]]; then
    DISCOVER_OPENCLAW_STATE="present"
  fi

  if [[ -f "$BRIDGE_ENV" ]]; then
    DISCOVER_BRIDGE_ENV_STATE="present"
  fi

  if [[ "$OS_NAME" == "Darwin" && -f "$BRIDGE_INSTALL_SCRIPT" ]]; then
    if bash "$BRIDGE_INSTALL_SCRIPT" --bridge-env "$BRIDGE_ENV" --status >/dev/null 2>&1; then
      DISCOVER_BRIDGE_LAUNCHAGENT_STATE="healthy"
    else
      DISCOVER_BRIDGE_LAUNCHAGENT_STATE="unhealthy"
    fi
  fi

  if command -v crontab >/dev/null 2>&1; then
    local existing_cron
    existing_cron="$(crontab -l 2>/dev/null || true)"
    if [[ -n "$existing_cron" ]]; then
      DISCOVER_CRON_STATE="present"
      if printf '%s\n' "$existing_cron" | grep -Fq "VentureOS Managed Cron"; then
        DISCOVER_VENTURE_CRON_STATE="installed"
      fi
    fi
  else
    DISCOVER_CRON_STATE="unavailable"
  fi

  if [[ "$print_mode" == "quiet" ]]; then
    return 0
  fi

  ui_section "Discovery"
  ui_state_line "openclaw dir" "$DISCOVER_OPENCLAW_STATE" "$OPENCLAW_DIR"
  ui_state_line "bridge env" "$DISCOVER_BRIDGE_ENV_STATE" "$BRIDGE_ENV"
  if [[ "$OS_NAME" == "Darwin" ]]; then
    ui_state_line "bridge launchagent" "$DISCOVER_BRIDGE_LAUNCHAGENT_STATE"
  fi
  ui_state_line "dashboard health" "$DISCOVER_DASHBOARD_STATE" "$dashboard_url"
  ui_state_line "user crontab" "$DISCOVER_CRON_STATE"
  ui_state_line "ventureos managed cron block" "$DISCOVER_VENTURE_CRON_STATE"
}

prompt_yes_no() {
  local prompt="$1"
  local default_value="$2"
  local answer

  if [[ "$YES" == "1" ]]; then
    echo "$default_value"
    return 0
  fi

  while true; do
    if [[ "$default_value" == "y" ]]; then
      read -r -p "$prompt [Y/n]: " answer || answer=""
      answer="${answer:-y}"
    else
      read -r -p "$prompt [y/N]: " answer || answer=""
      answer="${answer:-n}"
    fi
    case "$answer" in
      y|Y|yes|YES) echo "y"; return 0 ;;
      n|N|no|NO) echo "n"; return 0 ;;
      *) echo "Please answer y or n." ;;
    esac
  done
}

prompt_value() {
  local prompt="$1"
  local default_value="$2"
  local answer
  if [[ "$YES" == "1" ]]; then
    echo "$default_value"
    return 0
  fi
  read -r -p "$prompt [$default_value]: " answer || answer=""
  echo "${answer:-$default_value}"
}

write_onboarding_transcript() {
  local final_status="$1"
  local notes="${2:-}"
  local rollback_command="n/a"
  local report_ref="n/a"
  local adoption_ref="n/a"

  mkdir -p "$REPORT_DIR"
  if [[ -z "$ONBOARDING_TRANSCRIPT_FILE" ]]; then
    local transcript_ts
    transcript_ts="$(date -u +%Y%m%dT%H%M%SZ)"
    ONBOARDING_TRANSCRIPT_FILE="$REPORT_DIR/ventureos-onboarding-${transcript_ts}.md"
  fi
  if [[ -n "$RESTORE_POINT_DIR" ]]; then
    rollback_command="bash scripts/ventureos-install.sh --revert $RESTORE_POINT_DIR"
  fi
  if [[ -n "$report_file" ]]; then
    report_ref="$report_file"
  fi
  if [[ -n "$adoption_evidence_file" ]]; then
    adoption_ref="$adoption_evidence_file"
  fi

  python3 - "$ONBOARDING_TRANSCRIPT_FILE" "$final_status" "$ONBOARDING_MODE" "$ONBOARDING_APPROVAL" "$ONBOARDING_ABORT_REASON" "$notes" "$OS_NAME" "$INSTALL_PRESET" "$DASHBOARD_PORT" "$dashboard_url" "$PROFILE" "$SKIP_DASHBOARD_INSTALL" "$SKIP_BRIDGE_LAUNCHAGENT" "$SKIP_CRON_INSTALL" "$SKIP_READINESS" "$VERIFY_POST_INSTALL" "$CAPTURE_RESTORE_POINT" "$DRY_RUN" "$RESTORE_POINT_DIR" "$RESTORE_POINT_VALIDATED" "$rollback_command" "$DISCOVER_OPENCLAW_STATE" "$DISCOVER_BRIDGE_ENV_STATE" "$DISCOVER_BRIDGE_LAUNCHAGENT_STATE" "$DISCOVER_DASHBOARD_STATE" "$DISCOVER_CRON_STATE" "$DISCOVER_VENTURE_CRON_STATE" "$ADOPTION_PLAN_TSV" "$report_ref" "$adoption_ref" <<'PY'
import csv
import pathlib
import sys
from datetime import datetime, timezone

path = pathlib.Path(sys.argv[1])
final_status = sys.argv[2]
mode = sys.argv[3]
approval = sys.argv[4]
abort_reason = sys.argv[5]
notes = sys.argv[6]
os_name = sys.argv[7]
preset = sys.argv[8]
dashboard_port = sys.argv[9]
dashboard_url = sys.argv[10] or "n/a"
profile = sys.argv[11]
skip_dashboard = sys.argv[12] == "1"
skip_bridge = sys.argv[13] == "1"
skip_cron = sys.argv[14] == "1"
skip_readiness = sys.argv[15] == "1"
verify_enabled = sys.argv[16] == "1"
restore_capture = sys.argv[17] == "1"
dry_run = sys.argv[18] == "1"
restore_point_dir = sys.argv[19] or "n/a"
restore_validated = sys.argv[20] == "1"
rollback_command = sys.argv[21]
discover_openclaw = sys.argv[22]
discover_bridge_env = sys.argv[23]
discover_bridge_launchagent = sys.argv[24]
discover_dashboard = sys.argv[25]
discover_cron = sys.argv[26]
discover_venture_cron = sys.argv[27]
adoption_plan_tsv = pathlib.Path(sys.argv[28])
report_ref = sys.argv[29]
adoption_ref = sys.argv[30]

plan_rows = []
if adoption_plan_tsv.exists():
    with adoption_plan_tsv.open("r", encoding="utf-8") as fh:
        reader = csv.reader(fh, delimiter="\t")
        for row in reader:
            if len(row) != 5:
                continue
            plan_rows.append({
                "target": row[0],
                "decision": row[1],
                "subject": row[3],
                "reason": row[4],
            })

decision_counts = {}
for row in plan_rows:
    decision = row["decision"]
    decision_counts[decision] = decision_counts.get(decision, 0) + 1

lines = [
    "# VentureOS Onboarding Transcript",
    "",
    f"- Generated: `{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}`",
    f"- Final status: `{final_status}`",
    f"- Mode: `{mode}`",
    f"- Approval: `{approval}`",
    f"- Abort reason: `{abort_reason or 'n/a'}`",
    f"- Notes: `{notes or 'n/a'}`",
    "",
    "## Selected Configuration",
    f"- Platform: `{os_name}`",
    f"- Preset: `{preset}`",
    f"- Dashboard URL: `{dashboard_url}`",
    f"- Dashboard port: `{dashboard_port}`",
    f"- Readiness profile: `{profile}`",
    f"- Dashboard install: `{'skip' if skip_dashboard else 'run'}`",
    f"- Bridge launchagent: `{'skip' if skip_bridge else 'run'}`",
    f"- Cron install: `{'skip' if skip_cron else 'run'}`",
    f"- Readiness refresh: `{'skip' if skip_readiness else 'run'}`",
    f"- Post-install verify: `{'enabled' if verify_enabled else 'disabled'}`",
    f"- Mode: `{'dry-run' if dry_run else 'execute'}`",
    f"- Restore point capture: `{'enabled' if restore_capture else 'disabled'}`",
    f"- Restore point validated: `{'yes' if restore_validated else 'no'}`",
    f"- Restore point directory: `{restore_point_dir}`",
    f"- Rollback command: `{rollback_command}`",
    f"- Installer report: `{report_ref or 'n/a'}`",
    f"- Adoption evidence: `{adoption_ref or 'n/a'}`",
    "",
    "## Discovery Snapshot",
    f"- OpenClaw dir: `{discover_openclaw}`",
    f"- Bridge env: `{discover_bridge_env}`",
    f"- Bridge launchagent: `{discover_bridge_launchagent}`",
    f"- Dashboard health: `{discover_dashboard}`",
    f"- User crontab: `{discover_cron}`",
    f"- VentureOS managed cron block: `{discover_venture_cron}`",
    "",
    "## Action Matrix Summary",
]

if decision_counts:
    ordered = ", ".join(f"{k}={decision_counts[k]}" for k in sorted(decision_counts))
    lines.append(f"- Decisions: `{ordered}`")
else:
    lines.append("- Decisions: `n/a`")

lines.extend([
    "",
    "| Target | Decision | Subject | Reason |",
    "|---|---|---|---|",
])
if plan_rows:
    for row in plan_rows:
        lines.append(f"| `{row['target']}` | `{row['decision']}` | `{row['subject']}` | {row['reason']} |")
else:
    lines.append("| `(none)` | `n/a` | `n/a` | action matrix unavailable |")

path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
}

validate_profile() {
  if [[ "$PROFILE" != "quick" && "$PROFILE" != "full" && "$PROFILE" != "bridge" ]]; then
    echo "Invalid --profile: $PROFILE (expected quick|full|bridge)" >&2
    exit 2
  fi
}

validate_dashboard_port() {
  if ! [[ "$DASHBOARD_PORT" =~ ^[0-9]+$ ]] || [[ "$DASHBOARD_PORT" -lt 1 || "$DASHBOARD_PORT" -gt 65535 ]]; then
    echo "Invalid --dashboard-port: $DASHBOARD_PORT" >&2
    exit 2
  fi
}

validate_verify_timeout() {
  if ! [[ "$VERIFY_TIMEOUT_SEC" =~ ^[0-9]+$ ]] || [[ "$VERIFY_TIMEOUT_SEC" -lt 1 ]]; then
    echo "Invalid --verify-timeout-sec: $VERIFY_TIMEOUT_SEC" >&2
    exit 2
  fi
}

apply_explicit_overrides() {
  if [[ -n "$EXPLICIT_SKIP_DASHBOARD" ]]; then
    SKIP_DASHBOARD_INSTALL="$EXPLICIT_SKIP_DASHBOARD"
  fi
  if [[ -n "$EXPLICIT_SKIP_BRIDGE" ]]; then
    SKIP_BRIDGE_LAUNCHAGENT="$EXPLICIT_SKIP_BRIDGE"
  fi
  if [[ -n "$EXPLICIT_SKIP_CRON" ]]; then
    SKIP_CRON_INSTALL="$EXPLICIT_SKIP_CRON"
  fi
  if [[ -n "$EXPLICIT_SKIP_READINESS" ]]; then
    SKIP_READINESS="$EXPLICIT_SKIP_READINESS"
  fi
  if [[ -n "$EXPLICIT_PROFILE" ]]; then
    PROFILE="$EXPLICIT_PROFILE"
  fi
  if [[ -n "$EXPLICIT_FORCE_CRON" ]]; then
    FORCE_CRON_INSTALL="$EXPLICIT_FORCE_CRON"
  fi
  if [[ -n "$EXPLICIT_VERIFY" ]]; then
    VERIFY_POST_INSTALL="$EXPLICIT_VERIFY"
  fi
}

prompt_run_toggle() {
  local prompt="$1"
  local default_skip="$2"
  local default_answer="y"
  if [[ "$default_skip" == "1" ]]; then
    default_answer="n"
  fi
  if [[ "$(prompt_yes_no "$prompt" "$default_answer")" == "n" ]]; then
    echo "1"
  else
    echo "0"
  fi
}

resolve_dashboard_url() {
  openclaw_local_resolve_dashboard_url \
    "$DASHBOARD_URL_OVERRIDE" \
    "${OPENCLAW_LOCAL_READY_DASHBOARD_URL:-}" \
    "${DASHBOARD_URL:-}" \
    "$DASHBOARD_PORT"
}

record_adoption_target() {
  local target="$1"
  local decision="$2"
  local exists_before="$3"
  local subject="$4"
  local reason="$5"
  printf '%s\t%s\t%s\t%s\t%s\n' "$target" "$decision" "$exists_before" "$subject" "$reason" >> "$ADOPTION_PLAN_TSV"
}

generate_integration_adoption_plan() {
  local dashboard_url="$1"
  : > "$ADOPTION_PLAN_TSV"

  local dashboard_exists="false"
  [[ "$DISCOVER_DASHBOARD_STATE" == "healthy" ]] && dashboard_exists="true"
  if [[ "$SKIP_DASHBOARD_INSTALL" == "1" ]]; then
    if [[ "$dashboard_exists" == "true" ]]; then
      record_adoption_target "dashboard-service" "adopt" "$dashboard_exists" "$dashboard_url" "existing dashboard is healthy; installer will not replace it"
    else
      record_adoption_target "dashboard-service" "skip" "$dashboard_exists" "$dashboard_url" "dashboard install explicitly skipped"
    fi
  else
    if [[ "$dashboard_exists" == "true" ]]; then
      record_adoption_target "dashboard-service" "merge" "$dashboard_exists" "$dashboard_url" "refresh dashboard install in place"
    else
      record_adoption_target "dashboard-service" "create" "$dashboard_exists" "$dashboard_url" "provision dashboard service for local readiness"
    fi
  fi

  local bridge_env_exists="false"
  [[ -f "$BRIDGE_ENV" ]] && bridge_env_exists="true"
  if [[ "$bridge_env_exists" == "true" ]]; then
    if [[ "$SKIP_BRIDGE_LAUNCHAGENT" == "1" ]]; then
      record_adoption_target "bridge-env-auth-source" "adopt" "$bridge_env_exists" "$BRIDGE_ENV" "existing bridge auth source preserved"
    elif [[ "$OS_NAME" == "Darwin" ]]; then
      record_adoption_target "bridge-env-auth-source" "merge" "$bridge_env_exists" "$BRIDGE_ENV" "bridge launchagent install reuses existing bridge env"
    else
      record_adoption_target "bridge-env-auth-source" "adopt" "$bridge_env_exists" "$BRIDGE_ENV" "platform does not run bridge launchagent installer"
    fi
  else
    if [[ "$SKIP_BRIDGE_LAUNCHAGENT" == "0" && "$OS_NAME" == "Darwin" && "$DISCOVER_BRIDGE_LAUNCHAGENT_STATE" == "healthy" ]]; then
      record_adoption_target "bridge-env-auth-source" "adopt" "$bridge_env_exists" "$BRIDGE_ENV" "bridge env missing but existing launchagent is healthy; installer adopts existing bridge state"
    elif [[ "$SKIP_BRIDGE_LAUNCHAGENT" == "0" && "$OS_NAME" == "Darwin" ]]; then
      record_adoption_target "bridge-env-auth-source" "skip" "$bridge_env_exists" "$BRIDGE_ENV" "bridge env missing; manual creation required before launchagent install"
    else
      record_adoption_target "bridge-env-auth-source" "skip" "$bridge_env_exists" "$BRIDGE_ENV" "bridge integration skipped by plan/platform"
    fi
  fi

  if [[ "$OS_NAME" == "Darwin" ]]; then
    local launchagent_plist="$HOME/Library/LaunchAgents/com.ventureos.bridge.plist"
    local launchagent_exists="false"
    [[ -f "$launchagent_plist" ]] && launchagent_exists="true"
    if [[ "$SKIP_BRIDGE_LAUNCHAGENT" == "1" ]]; then
      if [[ "$launchagent_exists" == "true" ]]; then
        record_adoption_target "bridge-launchagent-plist" "adopt" "$launchagent_exists" "$launchagent_plist" "existing launchagent preserved"
      else
        record_adoption_target "bridge-launchagent-plist" "skip" "$launchagent_exists" "$launchagent_plist" "bridge launchagent step skipped"
      fi
    elif [[ "$bridge_env_exists" == "false" && "$DISCOVER_BRIDGE_LAUNCHAGENT_STATE" == "healthy" ]]; then
      record_adoption_target "bridge-launchagent-plist" "adopt" "$launchagent_exists" "$launchagent_plist" "bridge env missing; adopt existing healthy launchagent state"
    else
      if [[ "$launchagent_exists" == "true" ]]; then
        record_adoption_target "bridge-launchagent-plist" "merge" "$launchagent_exists" "$launchagent_plist" "refresh launchagent without destructive overwrite"
      else
        record_adoption_target "bridge-launchagent-plist" "create" "$launchagent_exists" "$launchagent_plist" "create launchagent for persistent bridge start"
      fi
    fi
  fi

  local managed_cron_exists="false"
  [[ "$DISCOVER_VENTURE_CRON_STATE" == "installed" ]] && managed_cron_exists="true"
  if [[ "$DISCOVER_CRON_STATE" == "unavailable" ]]; then
    record_adoption_target "user-crontab" "skip" "false" "crontab -l" "crontab command unavailable on host"
    record_adoption_target "ventureos-managed-cron-block" "skip" "$managed_cron_exists" "crontab -l" "cannot manage cron block without crontab command"
  else
    local user_cron_exists="false"
    [[ "$DISCOVER_CRON_STATE" == "present" ]] && user_cron_exists="true"
    if [[ "$SKIP_CRON_INSTALL" == "1" ]]; then
      if [[ "$user_cron_exists" == "true" ]]; then
        record_adoption_target "user-crontab" "adopt" "$user_cron_exists" "crontab -l" "existing user cron entries preserved"
      else
        record_adoption_target "user-crontab" "skip" "$user_cron_exists" "crontab -l" "cron integration skipped"
      fi
      if [[ "$managed_cron_exists" == "true" ]]; then
        record_adoption_target "ventureos-managed-cron-block" "adopt" "$managed_cron_exists" "crontab -l" "existing VentureOS managed block retained"
      else
        record_adoption_target "ventureos-managed-cron-block" "skip" "$managed_cron_exists" "crontab -l" "managed block not installed and cron step skipped"
      fi
    else
      if [[ "$user_cron_exists" == "true" ]]; then
        record_adoption_target "user-crontab" "merge" "$user_cron_exists" "crontab -l" "managed block insertion/update preserves unrelated user entries"
      else
        record_adoption_target "user-crontab" "create" "$user_cron_exists" "crontab -l" "initialize crontab with VentureOS managed block"
      fi
      if [[ "$managed_cron_exists" == "true" ]]; then
        record_adoption_target "ventureos-managed-cron-block" "merge" "$managed_cron_exists" "crontab -l" "refresh existing managed cron block"
      else
        record_adoption_target "ventureos-managed-cron-block" "create" "$managed_cron_exists" "crontab -l" "install managed cron block"
      fi
    fi
  fi

  local path_target path_subject path_exists
  for path_target in \
    "openclaw-config-openclaw-json:$OPENCLAW_DIR/openclaw.json" \
    "openclaw-config-cron-jobs-json:$OPENCLAW_DIR/cron/jobs.json" \
    "openclaw-config-discord-webhooks-json:$OPENCLAW_DIR/credentials/discord/webhooks.json"; do
    path_subject="${path_target#*:}"
    path_target="${path_target%%:*}"
    path_exists="false"
    [[ -f "$path_subject" ]] && path_exists="true"
    if [[ "$path_exists" == "true" ]]; then
      record_adoption_target "$path_target" "adopt" "$path_exists" "$path_subject" "existing OpenClaw runtime config retained (additive integration only)"
    else
      record_adoption_target "$path_target" "skip" "$path_exists" "$path_subject" "file absent; installer avoids destructive bootstrap writes"
    fi
  done

  local readiness_exists="false"
  [[ -f "$READINESS_STATUS_JSON" ]] && readiness_exists="true"
  if [[ "$SKIP_READINESS" == "1" ]]; then
    if [[ "$readiness_exists" == "true" ]]; then
      record_adoption_target "readiness-status-artifact" "adopt" "$readiness_exists" "$READINESS_STATUS_JSON" "latest readiness snapshot retained"
    else
      record_adoption_target "readiness-status-artifact" "skip" "$readiness_exists" "$READINESS_STATUS_JSON" "readiness refresh skipped"
    fi
  else
    if [[ "$readiness_exists" == "true" ]]; then
      record_adoption_target "readiness-status-artifact" "merge" "$readiness_exists" "$READINESS_STATUS_JSON" "refresh readiness snapshot with latest smoke evidence"
    else
      record_adoption_target "readiness-status-artifact" "create" "$readiness_exists" "$READINESS_STATUS_JSON" "create first readiness snapshot"
    fi
  fi
}

render_integration_adoption_plan() {
  echo "Integration adoption decisions:"
  while IFS=$'\t' read -r target decision exists_before subject reason; do
    [[ -z "${target:-}" ]] && continue
    echo "  - $target => $decision (exists_before=$exists_before) :: $subject :: $reason"
  done < "$ADOPTION_PLAN_TSV"
}

generate_compatibility_matrix() {
  local output_tsv="$1"
  python3 - "$ADOPTION_PLAN_TSV" "$output_tsv" <<'PY'
from __future__ import annotations

import csv
import os
import pathlib
import shutil
import sys

plan_path = pathlib.Path(sys.argv[1])
out_path = pathlib.Path(sys.argv[2])

rows = []
with plan_path.open("r", encoding="utf-8") as fh:
    reader = csv.reader(fh, delimiter="\t")
    for row in reader:
        if len(row) != 5:
            continue
        rows.append(row)

with out_path.open("w", encoding="utf-8", newline="") as fh:
    writer = csv.writer(fh, delimiter="\t", lineterminator="\n")
    for target, _decision, _exists_before, subject, _reason in rows:
        status = "pass"
        detail = ""
        next_cmd = "n/a"

        if target in {"user-crontab", "ventureos-managed-cron-block"}:
            next_cmd = "command -v crontab >/dev/null"
            if shutil.which("crontab") is None:
                status = "fail"
                detail = "crontab command unavailable on host"
            else:
                detail = "crontab command available"
        elif subject.startswith("http://") or subject.startswith("https://"):
            detail = "endpoint target recorded for install/adoption"
            next_cmd = f"curl -sSf --max-time 3 {subject.rstrip('/')}/api/health"
        else:
            path = pathlib.Path(subject).expanduser()
            if path.exists():
                writable = os.access(path, os.W_OK)
                status = "pass" if writable else "fail"
                detail = "target exists and is writable" if writable else "target exists but is not writable"
                next_cmd = f"test -w '{path}'"
            else:
                parent = path.parent if str(path.parent) else pathlib.Path(".")
                writable = parent.exists() and os.access(parent, os.W_OK)
                status = "pass" if writable else "fail"
                detail = "target missing but parent is writable" if writable else "target missing and parent is not writable"
                next_cmd = f"mkdir -p '{parent}' && test -w '{parent}'"

        writer.writerow([target, status, detail, next_cmd])
PY
}

collect_install_target_fingerprints() {
  local output_json="$1"
  python3 - "$output_json" "$BRIDGE_ENV" "$OPENCLAW_DIR/openclaw.json" "$OPENCLAW_DIR/cron/jobs.json" "$OPENCLAW_DIR/credentials/discord/webhooks.json" "$READINESS_STATUS_JSON" <<'PY'
from __future__ import annotations

import hashlib
import json
import pathlib
import shutil
import subprocess
import sys

output_path = pathlib.Path(sys.argv[1])
bridge_env = pathlib.Path(sys.argv[2])
openclaw_json = pathlib.Path(sys.argv[3])
openclaw_jobs = pathlib.Path(sys.argv[4])
openclaw_webhooks = pathlib.Path(sys.argv[5])
readiness_json = pathlib.Path(sys.argv[6])

targets = [
    ("bridge-env-auth-source", bridge_env),
    ("openclaw-config-openclaw-json", openclaw_json),
    ("openclaw-config-cron-jobs-json", openclaw_jobs),
    ("openclaw-config-discord-webhooks-json", openclaw_webhooks),
    ("readiness-status-artifact", readiness_json),
]

def fingerprint_path(target_id: str, path: pathlib.Path) -> dict:
    entry = {
        "id": target_id,
        "subject": str(path),
        "exists": False,
        "kind": "missing",
        "size": 0,
        "sha256": None,
        "lineCount": 0,
        "mode": None,
    }
    if not path.exists():
        return entry
    if not path.is_file():
        entry["exists"] = True
        entry["kind"] = "non-file"
        return entry

    raw = path.read_bytes()
    entry["exists"] = True
    entry["kind"] = "file"
    entry["size"] = len(raw)
    entry["sha256"] = hashlib.sha256(raw).hexdigest()
    entry["mode"] = oct(path.stat().st_mode & 0o777)
    try:
        text = raw.decode("utf-8", errors="ignore")
    except Exception:
        text = ""
    entry["lineCount"] = len(text.splitlines()) if text else 0
    return entry

entries = [fingerprint_path(target_id, path) for target_id, path in targets]

crontab_entry = {
    "id": "user-crontab",
    "subject": "crontab -l",
    "exists": False,
    "kind": "unavailable",
    "size": 0,
    "sha256": None,
    "lineCount": 0,
    "managedCronPresent": False,
}
managed_block_entry = {
    "id": "ventureos-managed-cron-block",
    "subject": "crontab -l",
    "exists": False,
    "kind": "derived",
    "size": 0,
    "sha256": None,
    "lineCount": 0,
    "managedCronPresent": False,
}

if shutil.which("crontab") is not None:
    proc = subprocess.run(["crontab", "-l"], capture_output=True, text=True)
    if proc.returncode == 0:
        text = proc.stdout or ""
        encoded = text.encode("utf-8")
        managed = "VentureOS Managed Cron" in text
        crontab_entry.update({
            "exists": bool(text.strip()),
            "kind": "crontab",
            "size": len(encoded),
            "sha256": hashlib.sha256(encoded).hexdigest(),
            "lineCount": len(text.splitlines()),
            "managedCronPresent": managed,
        })
        managed_block_entry.update({
            "exists": managed,
            "size": len(encoded),
            "sha256": hashlib.sha256(encoded).hexdigest(),
            "lineCount": len(text.splitlines()),
            "managedCronPresent": managed,
        })
    else:
        crontab_entry["kind"] = "empty"
        managed_block_entry["kind"] = "empty"

entries.append(crontab_entry)
entries.append(managed_block_entry)

output_path.write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")
PY
}

generate_install_adoption_evidence() {
  local output_json="$1"
  local status="$2"
  local mode="$3"
  local rollback_command="$4"
  python3 - "$output_json" "$ADOPTION_PLAN_TSV" "$FINGERPRINT_BEFORE_JSON" "$FINGERPRINT_AFTER_JSON" "$status" "$mode" "$rollback_command" <<'PY'
from __future__ import annotations

import csv
import json
import pathlib
import sys
from datetime import datetime, timezone

output_path = pathlib.Path(sys.argv[1])
plan_path = pathlib.Path(sys.argv[2])
before_path = pathlib.Path(sys.argv[3])
after_path = pathlib.Path(sys.argv[4])
status = sys.argv[5]
mode = sys.argv[6]
rollback_command = sys.argv[7]

plans = []
with plan_path.open("r", encoding="utf-8") as fh:
    reader = csv.reader(fh, delimiter="\t")
    for row in reader:
        if len(row) != 5:
            continue
        plans.append({
            "target": row[0],
            "decision": row[1],
            "existsBefore": row[2] == "true",
            "subject": row[3],
            "reason": row[4],
        })

before_items = json.loads(before_path.read_text(encoding="utf-8"))
after_items = json.loads(after_path.read_text(encoding="utf-8"))
before = {str(item.get("id", "")): item for item in before_items if isinstance(item, dict)}
after = {str(item.get("id", "")): item for item in after_items if isinstance(item, dict)}

def signature(item: dict | None) -> tuple:
    if not isinstance(item, dict):
        return ("missing",)
    return (
        item.get("exists"),
        item.get("kind"),
        item.get("size"),
        item.get("sha256"),
        item.get("lineCount"),
        item.get("managedCronPresent"),
    )

changed_targets = []
for target_id in sorted(set(before.keys()) | set(after.keys())):
    b = before.get(target_id)
    a = after.get(target_id)
    if signature(b) == signature(a):
        continue
    changed_targets.append({
        "id": target_id,
        "before": {
            "exists": (b or {}).get("exists"),
            "kind": (b or {}).get("kind"),
            "size": (b or {}).get("size"),
            "lineCount": (b or {}).get("lineCount"),
            "managedCronPresent": (b or {}).get("managedCronPresent"),
        },
        "after": {
            "exists": (a or {}).get("exists"),
            "kind": (a or {}).get("kind"),
            "size": (a or {}).get("size"),
            "lineCount": (a or {}).get("lineCount"),
            "managedCronPresent": (a or {}).get("managedCronPresent"),
        },
    })

payload = {
    "generatedAtUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "status": status,
    "mode": mode,
    "rollbackCommand": rollback_command if rollback_command else None,
    "plan": plans,
    "fingerprints": {
        "before": before_items,
        "after": after_items,
    },
    "changedTargets": changed_targets,
}

output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --non-interactive)
      NON_INTERACTIVE=1
      shift
      ;;
    --yes)
      YES=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --preflight-only)
      PREFLIGHT_ONLY=1
      shift
      ;;
    --verify)
      VERIFY_POST_INSTALL=1
      EXPLICIT_VERIFY=1
      shift
      ;;
    --verify-timeout-sec)
      need_value "$@"
      VERIFY_TIMEOUT_SEC="$2"
      shift 2
      ;;
    --restore-base-dir)
      need_value "$@"
      RESTORE_BASE_DIR="$2"
      shift 2
      ;;
    --no-restore-point)
      CAPTURE_RESTORE_POINT=0
      EXPLICIT_RESTORE_POINT=0
      shift
      ;;
    --list-restore-points)
      LIST_RESTORE_POINTS=1
      shift
      ;;
    --revert)
      need_value "$@"
      REVERT_FROM="$2"
      shift 2
      ;;
    --preset)
      need_value "$@"
      INSTALL_PRESET="$2"
      EXPLICIT_PRESET="$2"
      shift 2
      ;;
    --dashboard-port)
      need_value "$@"
      DASHBOARD_PORT="$2"
      shift 2
      ;;
    --dashboard-url)
      need_value "$@"
      DASHBOARD_URL_OVERRIDE="$2"
      shift 2
      ;;
    --profile)
      need_value "$@"
      PROFILE="$2"
      EXPLICIT_PROFILE="$2"
      shift 2
      ;;
    --bridge-env)
      need_value "$@"
      BRIDGE_ENV="$2"
      shift 2
      ;;
    --bridge-token-file)
      need_value "$@"
      BRIDGE_TOKEN_FILE="$2"
      shift 2
      ;;
    --openclaw-dir)
      need_value "$@"
      OPENCLAW_DIR="$2"
      shift 2
      ;;
    --skip-dashboard-install)
      EXPLICIT_SKIP_DASHBOARD=1
      shift
      ;;
    --skip-bridge-launchagent)
      EXPLICIT_SKIP_BRIDGE=1
      shift
      ;;
    --skip-cron)
      EXPLICIT_SKIP_CRON=1
      shift
      ;;
    --skip-readiness)
      EXPLICIT_SKIP_READINESS=1
      shift
      ;;
    --no-force-cron)
      EXPLICIT_FORCE_CRON=0
      shift
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

ui_init

if [[ "$LIST_RESTORE_POINTS" == "1" && -n "$REVERT_FROM" ]]; then
  echo "Cannot combine --list-restore-points and --revert" >&2
  exit 2
fi

if [[ "$DRY_RUN" == "1" && "$PREFLIGHT_ONLY" == "1" ]]; then
  echo "Cannot combine --dry-run and --preflight-only" >&2
  exit 2
fi

if [[ "$LIST_RESTORE_POINTS" == "1" ]]; then
  list_restore_points
  exit 0
fi

if [[ -n "$REVERT_FROM" ]]; then
  if revert_restore_point "$REVERT_FROM"; then
    echo "VENTUREOS_INSTALL_RESULT=REVERTED"
    exit 0
  fi
  echo "VENTUREOS_INSTALL_RESULT=REVERT_FAILED"
  exit 1
fi

validate_dashboard_port
validate_verify_timeout

apply_install_preset
apply_explicit_overrides

validate_profile

if [[ "$OS_NAME" != "Darwin" && "$OS_NAME" != "Linux" ]]; then
  echo "Unsupported platform: $OS_NAME (expected Darwin or Linux)" >&2
  exit 2
fi

if [[ "$NON_INTERACTIVE" == "0" && stdin_is_tty ]]; then
  ONBOARDING_MODE="interactive"
  ONBOARDING_APPROVAL="pending"
  discovery_dashboard_url="$(resolve_dashboard_url)"
  if ! openclaw_local_validate_dashboard_url "$discovery_dashboard_url"; then
    echo "Invalid dashboard URL: $discovery_dashboard_url" >&2
    exit 2
  fi
  ui_phase "1" "6" "Discovery + recommendations"
  ui_section "VentureOS Onboarding"
  echo "Repo: $REPO_ROOT"
  echo "Platform: $OS_NAME"
  discover_existing_state "$discovery_dashboard_url"

  ui_section "Recommendations"
  if [[ "$DISCOVER_DASHBOARD_STATE" == "healthy" ]]; then
    ui_step "•" "Dashboard is already healthy; adopting existing service is recommended."
  else
    ui_step "•" "Dashboard health is not confirmed; running dashboard install is recommended."
  fi
  if [[ "$DISCOVER_BRIDGE_ENV_STATE" != "present" ]]; then
    ui_step "•" "Bridge env is missing; skip bridge install or provide --bridge-env first."
  fi
  if [[ "$DISCOVER_VENTURE_CRON_STATE" == "installed" ]]; then
    ui_step "•" "Managed VentureOS cron block already exists; refresh is recommended."
  fi
  if [[ "$DISCOVER_OPENCLAW_STATE" != "present" ]]; then
    ui_step "•" "OpenClaw directory missing; install can continue but readiness may fail."
  fi

  if [[ "$(prompt_yes_no "Continue with onboarding plan?" "y")" != "y" ]]; then
    ONBOARDING_APPROVAL="declined"
    ONBOARDING_ABORT_REASON="operator cancelled before applying onboarding preferences"
    dashboard_url="$discovery_dashboard_url"
    write_onboarding_transcript "cancelled" "cancelled before onboarding selections"
    echo "Onboarding transcript:"
    echo "  - $ONBOARDING_TRANSCRIPT_FILE"
    echo "Install cancelled."
    echo "VENTUREOS_INSTALL_RESULT=CANCELLED"
    exit 0
  fi

  ui_phase "2" "6" "Preference selection"
  if [[ -z "$EXPLICIT_PRESET" ]]; then
    ui_step "1/7" "Choose install preset"
    INSTALL_PRESET="$(prompt_value "Install preset (full|bridge|minimal)" "$INSTALL_PRESET")"
  fi
  apply_install_preset
  apply_explicit_overrides

  ui_step "2/7" "Confirm runtime endpoints"
  DASHBOARD_PORT="$(prompt_value "Dashboard port" "$DASHBOARD_PORT")"
  if [[ -z "$EXPLICIT_PROFILE" ]]; then
    PROFILE="$(prompt_value "Readiness profile (quick|full|bridge)" "$PROFILE")"
  fi
  validate_dashboard_port
  validate_profile

  ui_step "3/7" "Dashboard integration strategy"
  if [[ -z "$EXPLICIT_SKIP_DASHBOARD" ]]; then
    if [[ "$DISCOVER_DASHBOARD_STATE" == "healthy" ]]; then
      if [[ "$(prompt_yes_no "Existing dashboard looks healthy. Adopt it and skip dashboard reinstall?" "y")" == "y" ]]; then
        SKIP_DASHBOARD_INSTALL=1
      else
        SKIP_DASHBOARD_INSTALL=0
      fi
    else
      SKIP_DASHBOARD_INSTALL="$(prompt_run_toggle "Run dashboard installer?" "$SKIP_DASHBOARD_INSTALL")"
    fi
  fi

  ui_step "4/7" "Bridge integration"
  if [[ "$OS_NAME" == "Darwin" && -z "$EXPLICIT_SKIP_BRIDGE" ]]; then
    if [[ "$DISCOVER_BRIDGE_ENV_STATE" != "present" ]]; then
      if [[ "$(prompt_yes_no "Bridge env file is missing. Skip bridge LaunchAgent install for now?" "y")" == "y" ]]; then
        SKIP_BRIDGE_LAUNCHAGENT=1
      else
        SKIP_BRIDGE_LAUNCHAGENT=0
      fi
    else
      SKIP_BRIDGE_LAUNCHAGENT="$(prompt_run_toggle "Install/refresh bridge LaunchAgent?" "$SKIP_BRIDGE_LAUNCHAGENT")"
    fi
  fi

  ui_step "5/7" "Cron integration"
  if [[ -z "$EXPLICIT_SKIP_CRON" ]]; then
    if [[ "$DISCOVER_VENTURE_CRON_STATE" == "installed" ]]; then
      if [[ "$(prompt_yes_no "Managed VentureOS cron block exists. Refresh it now?" "y")" == "y" ]]; then
        SKIP_CRON_INSTALL=0
      else
        SKIP_CRON_INSTALL=1
      fi
    else
      SKIP_CRON_INSTALL="$(prompt_run_toggle "Install/refresh managed cron entries?" "$SKIP_CRON_INSTALL")"
    fi
  fi

  ui_step "6/7" "Readiness and verification"
  if [[ -z "$EXPLICIT_SKIP_READINESS" ]]; then
    SKIP_READINESS="$(prompt_run_toggle "Run readiness refresh smoke now?" "$SKIP_READINESS")"
  fi
  if [[ -z "$EXPLICIT_VERIFY" ]]; then
    verify_default="n"
    if [[ "$VERIFY_POST_INSTALL" == "1" ]]; then
      verify_default="y"
    fi
    if [[ "$(prompt_yes_no "Run post-install verification checks?" "$verify_default")" == "y" ]]; then
      VERIFY_POST_INSTALL=1
    else
      VERIFY_POST_INSTALL=0
    fi
  fi

  ui_step "7/7" "Safety controls"
  if [[ -z "$EXPLICIT_RESTORE_POINT" ]]; then
    if [[ "$(prompt_yes_no "Capture a restore point before making changes?" "y")" == "y" ]]; then
      CAPTURE_RESTORE_POINT=1
    else
      CAPTURE_RESTORE_POINT=0
    fi
  fi
fi

dashboard_url="$(resolve_dashboard_url)"
if ! openclaw_local_validate_dashboard_url "$dashboard_url"; then
  echo "Invalid dashboard URL: $dashboard_url" >&2
  exit 2
fi

ui_phase "3" "6" "Plan + compatibility review"
ui_section "Execution Plan"
echo "Install plan:"
echo "  preset: $INSTALL_PRESET"
echo "  dashboard port: $DASHBOARD_PORT"
echo "  readiness profile: $PROFILE"
echo "  dashboard install: $([[ "$SKIP_DASHBOARD_INSTALL" == "1" ]] && echo skip || echo run)"
echo "  bridge LaunchAgent: $([[ "$SKIP_BRIDGE_LAUNCHAGENT" == "1" ]] && echo skip || echo run)"
echo "  cron install: $([[ "$SKIP_CRON_INSTALL" == "1" ]] && echo skip || echo run)"
echo "  readiness refresh: $([[ "$SKIP_READINESS" == "1" ]] && echo skip || echo run)"
echo "  post-install verify: $([[ "$VERIFY_POST_INSTALL" == "1" ]] && echo run || echo skip)"
echo "  bridge env: $BRIDGE_ENV"
echo "  restore point: $([[ "$CAPTURE_RESTORE_POINT" == "1" ]] && echo enabled || echo disabled)"
echo "  restore base dir: $RESTORE_BASE_DIR"
if [[ "$DRY_RUN" == "1" ]]; then
  echo "  mode: dry-run"
elif [[ "$PREFLIGHT_ONLY" == "1" ]]; then
  echo "  mode: preflight-only"
fi
discover_existing_state "$dashboard_url"

ui_section "Integration Adoption Plan"
generate_integration_adoption_plan "$dashboard_url"
render_integration_adoption_plan
adoption_target_count="$(wc -l < "$ADOPTION_PLAN_TSV" | tr -d ' ')"
if [[ "$DRY_RUN" == "1" || "$PREFLIGHT_ONLY" == "1" ]]; then
  record_step "adoption-plan" "planned" "generated adoption/merge plan for $adoption_target_count targets" "Inspect installer report adoption plan section"
else
  record_step "adoption-plan" "pass" "generated adoption/merge plan for $adoption_target_count targets" "Inspect installer report adoption plan section"
fi

generate_compatibility_matrix "$COMPATIBILITY_TSV"
compatibility_fail_count="$(awk -F '\t' '$2 == "fail" {count++} END {print count + 0}' "$COMPATIBILITY_TSV")"
compatibility_target_count="$(wc -l < "$COMPATIBILITY_TSV" | tr -d ' ')"
if [[ "$compatibility_fail_count" -gt 0 ]]; then
  echo "Compatibility check failures detected: $compatibility_fail_count/$compatibility_target_count"
  while IFS=$'\t' read -r target status detail next_cmd; do
    [[ -z "${target:-}" ]] && continue
    if [[ "$status" == "fail" ]]; then
      echo "  - $target :: $detail :: next: $next_cmd"
    fi
  done < "$COMPATIBILITY_TSV"
  record_step "compatibility-check" "fail" "compatibility rehearsal failed for $compatibility_fail_count of $compatibility_target_count targets" "Inspect installer report compatibility matrix section"
  INSTALL_FAILED=1
else
  record_step "compatibility-check" "pass" "compatibility rehearsal passed for $compatibility_target_count targets" "Inspect installer report compatibility matrix section"
fi

if [[ "$ONBOARDING_MODE" == "interactive" ]]; then
  ui_section "Action Matrix Confirmation"
  if [[ "$(prompt_yes_no "Apply this action matrix now?" "y")" != "y" ]]; then
    ONBOARDING_APPROVAL="declined"
    ONBOARDING_ABORT_REASON="operator declined action matrix confirmation"
    write_onboarding_transcript "cancelled" "cancelled after reviewing action matrix"
    echo "Onboarding transcript:"
    echo "  - $ONBOARDING_TRANSCRIPT_FILE"
    echo "Install cancelled before applying changes."
    echo "VENTUREOS_INSTALL_RESULT=CANCELLED"
    exit 0
  fi
  ONBOARDING_APPROVAL="approved"
fi

if collect_install_target_fingerprints "$FINGERPRINT_BEFORE_JSON"; then
  record_step "adoption-fingerprint-before" "pass" "captured pre-apply fingerprints for integration targets" "Inspect installer adoption evidence json artifact"
else
  record_step "adoption-fingerprint-before" "fail" "unable to capture pre-apply fingerprints" "Ensure local filesystem and crontab are accessible, then rerun installer"
  INSTALL_FAILED=1
fi

ui_phase "4" "6" "Rollback safety checkpoint"
ui_section "Preflight Safety"
if [[ "$CAPTURE_RESTORE_POINT" == "1" ]]; then
  if [[ "$DRY_RUN" == "1" ]]; then
    record_step "restore-point" "planned" "would snapshot user config before install" "bash scripts/ventureos-install.sh --list-restore-points"
    record_step "restore-point-validate" "planned" "would validate restore-point manifest integrity" "python3 -m json.tool runtime/backups/ventureos-install/<id>/restore-point.json"
  else
    if create_restore_point; then
      echo "PASS  restore-point :: $RESTORE_POINT_DIR"
      record_step "restore-point" "pass" "restore point created at $RESTORE_POINT_DIR" "bash scripts/ventureos-install.sh --revert $RESTORE_POINT_DIR"
      if validate_restore_point_integrity "$RESTORE_MANIFEST_PATH"; then
        echo "PASS  restore-point-validate :: $RESTORE_MANIFEST_PATH"
        RESTORE_POINT_VALIDATED=1
        record_step "restore-point-validate" "pass" "restore point manifest integrity validated" "python3 -m json.tool $RESTORE_MANIFEST_PATH >/dev/null"
      else
        echo "FAIL  restore-point-validate :: restore point manifest integrity validation failed" >&2
        record_step "restore-point-validate" "fail" "restore point manifest integrity validation failed" "Remove bad restore point and rerun installer"
        INSTALL_FAILED=1
      fi
    else
      echo "FAIL  restore-point :: unable to capture pre-install snapshot" >&2
      record_step "restore-point" "fail" "unable to capture pre-install snapshot" "Re-run with --no-restore-point only if you accept no rollback safety"
      record_step "restore-point-validate" "skipped" "restore point creation failed; validation skipped" "Fix restore point creation failure and rerun"
      INSTALL_FAILED=1
    fi
  fi
else
  echo "WARN  restore-point :: disabled by --no-restore-point"
  record_step "restore-point" "skipped" "restore point capture disabled by flag" "Re-run without --no-restore-point"
  record_step "restore-point-validate" "skipped" "restore point capture disabled by flag" "Re-run without --no-restore-point"
fi
echo ""

if [[ "$INSTALL_FAILED" != "0" ]]; then
  echo "Aborting install due to failed safety checks."
  echo "VENTUREOS_INSTALL_RESULT=FAIL"
  exit 1
fi

ui_phase "5" "6" "Installer execution"
if [[ "$PREFLIGHT_ONLY" == "1" ]]; then
  echo "PREFLIGHT  installer-steps :: preflight-only mode; apply steps skipped"
  record_step "dashboard-install" "planned" "preflight-only mode; dashboard installer not executed" "Re-run without --preflight-only to apply"
  record_step "bridge-launchagent" "planned" "preflight-only mode; bridge installer not executed" "Re-run without --preflight-only to apply"
  record_step "cron-install" "planned" "preflight-only mode; cron installer not executed" "Re-run without --preflight-only to apply"
  record_step "readiness-refresh" "planned" "preflight-only mode; readiness refresh not executed" "Re-run without --preflight-only to apply"
  record_step "verify-dashboard-health" "planned" "preflight-only mode; verification deferred to apply run" "Re-run without --preflight-only and with --verify"
  record_step "verify-bridge-launchagent" "planned" "preflight-only mode; verification deferred to apply run" "Re-run without --preflight-only and with --verify"
  record_step "verify-cron-marker" "planned" "preflight-only mode; verification deferred to apply run" "Re-run without --preflight-only and with --verify"
  record_step "verify-readiness-status-artifact" "planned" "preflight-only mode; verification deferred to apply run" "Re-run without --preflight-only and with --verify"
else
if [[ "$SKIP_DASHBOARD_INSTALL" == "0" ]]; then
  if [[ "$OS_NAME" == "Darwin" ]]; then
    if ! run_step "dashboard-install" "dashboard/scripts/install-macos.sh" \
      env DASHBOARD_PORT="$DASHBOARD_PORT" OPENCLAW_DIR="$OPENCLAW_DIR" bash "$DASHBOARD_INSTALL_MACOS_SCRIPT"; then
      INSTALL_FAILED=1
    fi
  else
    if [[ "$DRY_RUN" == "1" ]]; then
      if ! run_step "dashboard-install" "dashboard/scripts/install.sh (linux)" \
        env DASHBOARD_PORT="$DASHBOARD_PORT" OPENCLAW_DIR="$OPENCLAW_DIR" bash "$DASHBOARD_INSTALL_LINUX_SCRIPT"; then
        INSTALL_FAILED=1
      fi
    elif [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
      if ! run_step "dashboard-install" "dashboard/scripts/install.sh (linux root)" \
        env DASHBOARD_PORT="$DASHBOARD_PORT" OPENCLAW_DIR="$OPENCLAW_DIR" bash "$DASHBOARD_INSTALL_LINUX_SCRIPT"; then
        INSTALL_FAILED=1
      fi
    elif command -v sudo >/dev/null 2>&1; then
      if ! run_step "dashboard-install" "dashboard/scripts/install.sh (linux via sudo)" \
        sudo env DASHBOARD_PORT="$DASHBOARD_PORT" OPENCLAW_DIR="$OPENCLAW_DIR" bash "$DASHBOARD_INSTALL_LINUX_SCRIPT"; then
        INSTALL_FAILED=1
      fi
    else
      echo "FAIL  dashboard-install :: sudo is required on Linux for systemd install" >&2
      record_step "dashboard-install" "fail" "sudo required on Linux for dashboard installer" "Install sudo or run as root and re-run ventureos-install.sh"
      INSTALL_FAILED=1
    fi
  fi
else
  echo "SKIP  dashboard-install"
  record_step "dashboard-install" "skipped" "skipped by flag" "Re-run without --skip-dashboard-install"
fi

if [[ "$SKIP_BRIDGE_LAUNCHAGENT" == "0" ]]; then
  if [[ "$OS_NAME" != "Darwin" ]]; then
    echo "SKIP  bridge-launchagent :: not supported on $OS_NAME"
    record_step "bridge-launchagent" "skipped" "bridge LaunchAgent installer is macOS-only" "Use macOS for LaunchAgent install"
  elif [[ ! -f "$BRIDGE_ENV" ]]; then
    if bash "$BRIDGE_INSTALL_SCRIPT" --bridge-env "$BRIDGE_ENV" --status >/dev/null 2>&1; then
      echo "PASS  bridge-launchagent :: bridge env missing; adopted existing healthy launchagent"
      record_step "bridge-launchagent" "pass" "bridge env missing; adopted existing healthy launchagent" "Create bridge env only when launchagent reconfiguration is required"
    else
      echo "FAIL  bridge-launchagent :: missing bridge env file and no healthy launchagent to adopt: $BRIDGE_ENV" >&2
      record_step "bridge-launchagent" "fail" "missing bridge env file and no healthy launchagent to adopt" "Create bridge env file or pass --skip-bridge-launchagent"
      INSTALL_FAILED=1
    fi
  else
    if ! run_step "bridge-launchagent" "scripts/install-bridge-launchagent.sh" \
      bash "$BRIDGE_INSTALL_SCRIPT" --bridge-env "$BRIDGE_ENV"; then
      INSTALL_FAILED=1
    fi
  fi
else
  echo "SKIP  bridge-launchagent"
  record_step "bridge-launchagent" "skipped" "skipped by flag" "Re-run without --skip-bridge-launchagent"
fi

if [[ "$SKIP_CRON_INSTALL" == "0" ]]; then
  if [[ "$FORCE_CRON_INSTALL" == "1" ]]; then
    if ! run_step "cron-install" "scripts/install-cron.sh --force" \
      bash "$CRON_INSTALL_SCRIPT" --force; then
      INSTALL_FAILED=1
    fi
  else
    if ! run_step "cron-install" "scripts/install-cron.sh" \
      bash "$CRON_INSTALL_SCRIPT"; then
      INSTALL_FAILED=1
    fi
  fi
else
  echo "SKIP  cron-install"
  record_step "cron-install" "skipped" "skipped by flag" "Re-run without --skip-cron"
fi

if [[ "$SKIP_READINESS" == "0" ]]; then
  readiness_cmd=(bash "$READINESS_REFRESH_SCRIPT" --profile "$PROFILE" --dashboard-url "$dashboard_url")
  if [[ -n "$BRIDGE_TOKEN_FILE" ]]; then
    readiness_cmd+=(--bridge-token-file "$BRIDGE_TOKEN_FILE")
  fi

  if [[ -f "$BRIDGE_ENV" ]]; then
    if [[ "$DRY_RUN" == "1" ]]; then
      if ! run_step "readiness-refresh" "refresh-local-integration-ready.sh (with bridge env)" "${readiness_cmd[@]}"; then
        INSTALL_FAILED=1
      fi
    else
      if (
        set -a
        source "$BRIDGE_ENV"
        set +a
        "${readiness_cmd[@]}"
      ); then
        echo "PASS  readiness-refresh :: scripts/refresh-local-integration-ready.sh"
        record_step "readiness-refresh" "pass" "readiness refresh succeeded" "${readiness_cmd[*]}"
      else
        echo "FAIL  readiness-refresh :: scripts/refresh-local-integration-ready.sh" >&2
        record_step "readiness-refresh" "fail" "readiness refresh failed" "${readiness_cmd[*]}"
        INSTALL_FAILED=1
      fi
    fi
  else
    if ! run_step "readiness-refresh" "refresh-local-integration-ready.sh" "${readiness_cmd[@]}"; then
      INSTALL_FAILED=1
    fi
  fi
else
  echo "SKIP  readiness-refresh"
  record_step "readiness-refresh" "skipped" "skipped by flag" "Re-run without --skip-readiness"
fi

if [[ "$VERIFY_POST_INSTALL" == "1" ]]; then
  if [[ "$SKIP_DASHBOARD_INSTALL" == "0" ]]; then
    if ! run_step "verify-dashboard-health" "GET /api/health returns 200" \
      --next-command "curl -sSf --max-time $VERIFY_TIMEOUT_SEC ${dashboard_url%/}/api/health" \
      verify_dashboard_health "$dashboard_url"; then
      INSTALL_FAILED=1
    fi
  else
    record_step "verify-dashboard-health" "skipped" "dashboard install skipped; health verify skipped" "Run dashboard install, then re-run with --verify"
  fi

  if [[ "$SKIP_BRIDGE_LAUNCHAGENT" == "0" && "$OS_NAME" == "Darwin" ]]; then
    if ! run_step "verify-bridge-launchagent" "bridge launchagent status check" \
      --next-command "bash scripts/install-bridge-launchagent.sh --bridge-env $BRIDGE_ENV --status" \
      bash "$BRIDGE_INSTALL_SCRIPT" --bridge-env "$BRIDGE_ENV" --status; then
      INSTALL_FAILED=1
    fi
  else
    record_step "verify-bridge-launchagent" "skipped" "bridge verify skipped by platform/flags" "Ensure bridge install is enabled on macOS, then re-run with --verify"
  fi

  if [[ "$SKIP_CRON_INSTALL" == "0" ]]; then
    if ! run_step "verify-cron-marker" "crontab contains VentureOS managed marker" \
      --next-command "crontab -l | grep -F 'VentureOS Managed Cron'" \
      verify_cron_marker; then
      INSTALL_FAILED=1
    fi
  else
    record_step "verify-cron-marker" "skipped" "cron install skipped; cron verify skipped" "Run cron install, then re-run with --verify"
  fi

  if [[ "$SKIP_READINESS" == "0" ]]; then
    if ! run_step "verify-readiness-status-artifact" "latest readiness status summary json is present" \
      --next-command "python3 -m json.tool $READINESS_STATUS_JSON >/dev/null" \
      verify_readiness_status_artifact; then
      INSTALL_FAILED=1
    fi
  else
    record_step "verify-readiness-status-artifact" "skipped" "readiness refresh skipped; status artifact verify skipped" "Run readiness refresh, then re-run with --verify"
  fi
else
  record_step "verify-dashboard-health" "skipped" "post-install verify disabled" "Re-run with --verify"
  record_step "verify-bridge-launchagent" "skipped" "post-install verify disabled" "Re-run with --verify"
  record_step "verify-cron-marker" "skipped" "post-install verify disabled" "Re-run with --verify"
  record_step "verify-readiness-status-artifact" "skipped" "post-install verify disabled" "Re-run with --verify"
fi
fi

ui_phase "6" "6" "Evidence + summary artifacts"
mkdir -p "$REPORT_DIR"
timestamp_utc="$(date -u +%Y%m%dT%H%M%SZ)"
report_file="$REPORT_DIR/ventureos-install-${timestamp_utc}.md"
adoption_evidence_file="$REPORT_DIR/ventureos-install-adoption-${timestamp_utc}.json"

if collect_install_target_fingerprints "$FINGERPRINT_AFTER_JSON"; then
  record_step "adoption-fingerprint-after" "pass" "captured post-apply fingerprints for integration targets" "Inspect installer adoption evidence json artifact"
else
  record_step "adoption-fingerprint-after" "fail" "unable to capture post-apply fingerprints" "Ensure local filesystem and crontab are accessible, then rerun installer"
  INSTALL_FAILED=1
fi

adoption_status="pass"
if [[ "$INSTALL_FAILED" != "0" ]]; then
  adoption_status="fail"
elif [[ "$DRY_RUN" == "1" || "$PREFLIGHT_ONLY" == "1" ]]; then
  adoption_status="planned"
fi
adoption_mode="execute"
if [[ "$DRY_RUN" == "1" ]]; then
  adoption_mode="dry-run"
elif [[ "$PREFLIGHT_ONLY" == "1" ]]; then
  adoption_mode="preflight"
fi
rollback_command=""
if [[ -n "$RESTORE_POINT_DIR" ]]; then
  rollback_command="bash scripts/ventureos-install.sh --revert $RESTORE_POINT_DIR"
fi

if generate_install_adoption_evidence "$adoption_evidence_file" "$adoption_status" "$adoption_mode" "$rollback_command"; then
  record_step "adoption-evidence" "pass" "wrote adoption evidence artifact to $adoption_evidence_file" "cat $adoption_evidence_file"
else
  record_step "adoption-evidence" "fail" "unable to write adoption evidence artifact" "Check filesystem permissions for $REPORT_DIR and rerun installer"
  INSTALL_FAILED=1
fi

onboarding_status="pass"
if [[ "$INSTALL_FAILED" != "0" ]]; then
  onboarding_status="fail"
elif [[ "$DRY_RUN" == "1" || "$PREFLIGHT_ONLY" == "1" ]]; then
  onboarding_status="planned"
fi
if write_onboarding_transcript "$onboarding_status" "installer execution completed"; then
  record_step "onboarding-transcript" "pass" "wrote onboarding transcript artifact to $ONBOARDING_TRANSCRIPT_FILE" "cat $ONBOARDING_TRANSCRIPT_FILE"
else
  record_step "onboarding-transcript" "fail" "unable to write onboarding transcript artifact" "Check filesystem permissions for $REPORT_DIR and rerun installer"
  INSTALL_FAILED=1
fi

python3 - "$SUMMARY_TSV" "$report_file" "$timestamp_utc" "$OS_NAME" "$DASHBOARD_PORT" "$PROFILE" "$dashboard_url" "$DRY_RUN" "$PREFLIGHT_ONLY" "$INSTALL_PRESET" "$VERIFY_POST_INSTALL" "$ADOPTION_PLAN_TSV" "$COMPATIBILITY_TSV" "$adoption_evidence_file" "$ONBOARDING_TRANSCRIPT_FILE" <<'PY'
import csv
import json
import pathlib
import sys

summary_tsv = pathlib.Path(sys.argv[1])
report_path = pathlib.Path(sys.argv[2])
generated_at = sys.argv[3]
os_name = sys.argv[4]
dashboard_port = sys.argv[5]
profile = sys.argv[6]
dashboard_url = sys.argv[7]
dry_run = sys.argv[8] == "1"
preflight_only = sys.argv[9] == "1"
preset = sys.argv[10]
verify_enabled = sys.argv[11] == "1"
adoption_plan_path = pathlib.Path(sys.argv[12])
compatibility_path = pathlib.Path(sys.argv[13])
adoption_evidence_path = pathlib.Path(sys.argv[14])
onboarding_transcript_path = pathlib.Path(sys.argv[15])

rows = []
with summary_tsv.open("r", encoding="utf-8") as fh:
    reader = csv.reader(fh, delimiter="\t")
    for row in reader:
        if len(row) != 4:
            continue
        rows.append({"step": row[0], "status": row[1], "detail": row[2], "next": row[3]})

adoption_plan_rows = []
with adoption_plan_path.open("r", encoding="utf-8") as fh:
    reader = csv.reader(fh, delimiter="\t")
    for row in reader:
        if len(row) != 5:
            continue
        adoption_plan_rows.append({
            "target": row[0],
            "decision": row[1],
            "exists_before": row[2],
            "subject": row[3],
            "reason": row[4],
        })

adoption_evidence = {}
if adoption_evidence_path.exists():
    try:
        adoption_evidence = json.loads(adoption_evidence_path.read_text(encoding="utf-8"))
    except Exception:
        adoption_evidence = {}

pass_count = sum(1 for r in rows if r["status"] == "pass")
fail_count = sum(1 for r in rows if r["status"] == "fail")
skip_count = sum(1 for r in rows if r["status"] == "skipped")
planned_count = sum(1 for r in rows if r["status"] == "planned")

status = "pass"
if fail_count > 0:
    status = "fail"
elif dry_run or preflight_only:
    status = "planned"

lines = [
    "# VentureOS Installer Report",
    "",
    f"- Generated: `{generated_at}`",
    f"- Platform: `{os_name}`",
    f"- Preset: `{preset}`",
    f"- Dashboard port: `{dashboard_port}`",
    f"- Dashboard URL: `{dashboard_url}`",
    f"- Readiness profile: `{profile}`",
    f"- Post-install verify: `{'enabled' if verify_enabled else 'disabled'}`",
    f"- Mode: `{'dry-run' if dry_run else 'preflight' if preflight_only else 'execute'}`",
    f"- Status: `{status}`",
    f"- Pass: `{pass_count}`",
    f"- Fail: `{fail_count}`",
    f"- Skipped: `{skip_count}`",
    f"- Planned: `{planned_count}`",
    "",
    "| Step | Status | Detail | Next Command |",
    "|---|---|---|---|",
]

for row in rows:
    lines.append(f"| `{row['step']}` | `{row['status']}` | {row['detail']} | `{row['next']}` |")

lines.extend([
    "",
    "## Integration Adoption Plan",
    "| Target | Decision | Exists Before | Subject | Reason |",
    "|---|---|---|---|---|",
])
if adoption_plan_rows:
    for row in adoption_plan_rows:
        lines.append(
            f"| `{row['target']}` | `{row['decision']}` | `{row['exists_before']}` | `{row['subject']}` | {row['reason']} |"
        )
else:
    lines.append("| `(none)` | `skip` | `false` | `n/a` | no adoption targets were generated |")

compatibility_rows = []
if compatibility_path.exists():
    with compatibility_path.open("r", encoding="utf-8") as fh:
        reader = csv.reader(fh, delimiter="\t")
        for row in reader:
            if len(row) != 4:
                continue
            compatibility_rows.append({
                "target": row[0],
                "status": row[1],
                "detail": row[2],
                "next": row[3],
            })

lines.extend([
    "",
    "## Compatibility Rehearsal",
    "| Target | Status | Detail | Next Command |",
    "|---|---|---|---|",
])
if compatibility_rows:
    for row in compatibility_rows:
        lines.append(f"| `{row['target']}` | `{row['status']}` | {row['detail']} | `{row['next']}` |")
else:
    lines.append("| `(none)` | `skip` | no compatibility data generated | `n/a` |")

changed_targets = adoption_evidence.get("changedTargets", []) if isinstance(adoption_evidence, dict) else []
rollback_command = adoption_evidence.get("rollbackCommand", "n/a") if isinstance(adoption_evidence, dict) else "n/a"
if not rollback_command:
    rollback_command = "n/a"
lines.extend([
    "",
    "## Config Change Evidence",
    f"- Evidence JSON: `{adoption_evidence_path}`",
    f"- Onboarding transcript: `{onboarding_transcript_path}`",
    f"- Changed targets: `{len(changed_targets) if isinstance(changed_targets, list) else 0}`",
    f"- Rollback command: `{rollback_command}`",
])
if isinstance(changed_targets, list) and changed_targets:
    lines.append("")
    lines.append("| Changed Target | Before Exists | After Exists | Before Kind | After Kind |")
    lines.append("|---|---|---|---|---|")
    for changed in changed_targets:
        if not isinstance(changed, dict):
            continue
        before = changed.get("before", {}) if isinstance(changed.get("before"), dict) else {}
        after = changed.get("after", {}) if isinstance(changed.get("after"), dict) else {}
        lines.append(
            f"| `{changed.get('id', 'unknown')}` | `{before.get('exists', 'n/a')}` | `{after.get('exists', 'n/a')}` | "
            f"`{before.get('kind', 'n/a')}` | `{after.get('kind', 'n/a')}` |"
        )

failed_rows = [row for row in rows if row["status"] == "fail"]
if failed_rows:
    lines.extend([
        "",
        "## Failed Steps",
    ])
    for row in failed_rows:
        lines.append(
            f"- `{row['step']}`: {row['detail']} -> next: `{row['next']}`"
        )

report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY

echo ""
echo "Install report written:"
echo "  - $report_file"
echo "Adoption evidence:"
echo "  - $adoption_evidence_file"
if [[ -n "$ONBOARDING_TRANSCRIPT_FILE" ]]; then
  echo "Onboarding transcript:"
  echo "  - $ONBOARDING_TRANSCRIPT_FILE"
fi
if [[ -n "$RESTORE_POINT_DIR" ]]; then
  echo "Restore point:"
  echo "  - $RESTORE_POINT_DIR"
  echo "Revert command:"
  echo "  - bash scripts/ventureos-install.sh --revert $RESTORE_POINT_DIR"
fi

if [[ "$DRY_RUN" == "1" ]]; then
  echo "VENTUREOS_INSTALL_RESULT=PLANNED"
  exit 0
fi

if [[ "$INSTALL_FAILED" != "0" ]]; then
  echo "VENTUREOS_INSTALL_RESULT=FAIL"
  exit 1
fi

if [[ "$PREFLIGHT_ONLY" == "1" ]]; then
  if [[ -n "$RESTORE_POINT_DIR" ]]; then
    echo "VENTUREOS_INSTALL_RESTORE_POINT=$RESTORE_POINT_DIR"
  fi
  echo "VENTUREOS_INSTALL_RESULT=PREFLIGHT"
  exit 0
fi

if [[ -n "$RESTORE_POINT_DIR" ]]; then
  echo "VENTUREOS_INSTALL_RESTORE_POINT=$RESTORE_POINT_DIR"
fi
echo "VENTUREOS_INSTALL_RESULT=PASS"
exit 0

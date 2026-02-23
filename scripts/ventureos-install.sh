#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/openclaw-local-defaults.sh"

OS_NAME="${VENTUREOS_INSTALL_OS:-$(uname)}"
NON_INTERACTIVE=0
YES=0
DRY_RUN=0
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

DISCOVER_DASHBOARD_STATE="unknown"
DISCOVER_OPENCLAW_STATE="unknown"
DISCOVER_BRIDGE_ENV_STATE="unknown"
DISCOVER_CRON_STATE="unknown"
DISCOVER_VENTURE_CRON_STATE="unknown"

REPORT_DIR="${VENTUREOS_INSTALL_REPORT_DIR:-$REPO_ROOT/runtime/reports/ventureos-install}"
SUMMARY_TSV="$(mktemp)"
RESTORE_INDEX_TSV="$(mktemp)"
ADOPTION_PLAN_TSV="$(mktemp)"
FINGERPRINT_BEFORE_JSON="$(mktemp)"
FINGERPRINT_AFTER_JSON="$(mktemp)"
trap 'rm -f "$SUMMARY_TSV" "$RESTORE_INDEX_TSV" "$ADOPTION_PLAN_TSV" "$FINGERPRINT_BEFORE_JSON" "$FINGERPRINT_AFTER_JSON"' EXIT
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
EOF_USAGE
}

need_value() {
  if [[ $# -lt 2 ]]; then
    echo "Missing value for $1" >&2
    exit 2
  fi
}

ui_init() {
  if [[ "$NON_INTERACTIVE" == "0" && -t 1 && "${TERM:-}" != "dumb" ]]; then
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

  if "$@"; then
    echo "PASS  $step :: $detail"
    record_step "$step" "pass" "$detail" "$next_command"
    return 0
  fi

  echo "FAIL  $step :: $detail" >&2
  record_step "$step" "fail" "$detail" "$next_command"
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

  if [[ "$NON_INTERACTIVE" == "0" && -t 0 && "$YES" != "1" ]]; then
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
    if [[ "$SKIP_BRIDGE_LAUNCHAGENT" == "0" && "$OS_NAME" == "Darwin" ]]; then
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

if [[ "$NON_INTERACTIVE" == "0" && -t 0 ]]; then
  discovery_dashboard_url="$(resolve_dashboard_url)"
  if ! openclaw_local_validate_dashboard_url "$discovery_dashboard_url"; then
    echo "Invalid dashboard URL: $discovery_dashboard_url" >&2
    exit 2
  fi
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
    echo "Install cancelled."
    exit 0
  fi

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
fi
discover_existing_state "$dashboard_url"

ui_section "Integration Adoption Plan"
generate_integration_adoption_plan "$dashboard_url"
render_integration_adoption_plan
adoption_target_count="$(wc -l < "$ADOPTION_PLAN_TSV" | tr -d ' ')"
if [[ "$DRY_RUN" == "1" ]]; then
  record_step "adoption-plan" "planned" "generated adoption/merge plan for $adoption_target_count targets" "Inspect installer report adoption plan section"
else
  record_step "adoption-plan" "pass" "generated adoption/merge plan for $adoption_target_count targets" "Inspect installer report adoption plan section"
fi

if collect_install_target_fingerprints "$FINGERPRINT_BEFORE_JSON"; then
  record_step "adoption-fingerprint-before" "pass" "captured pre-apply fingerprints for integration targets" "Inspect installer adoption evidence json artifact"
else
  record_step "adoption-fingerprint-before" "fail" "unable to capture pre-apply fingerprints" "Ensure local filesystem and crontab are accessible, then rerun installer"
  INSTALL_FAILED=1
fi

ui_section "Preflight Safety"
if [[ "$CAPTURE_RESTORE_POINT" == "1" ]]; then
  if [[ "$DRY_RUN" == "1" ]]; then
    record_step "restore-point" "planned" "would snapshot user config before install" "bash scripts/ventureos-install.sh --list-restore-points"
  else
    if create_restore_point; then
      echo "PASS  restore-point :: $RESTORE_POINT_DIR"
      record_step "restore-point" "pass" "restore point created at $RESTORE_POINT_DIR" "bash scripts/ventureos-install.sh --revert $RESTORE_POINT_DIR"
    else
      echo "FAIL  restore-point :: unable to capture pre-install snapshot" >&2
      record_step "restore-point" "fail" "unable to capture pre-install snapshot" "Re-run with --no-restore-point only if you accept no rollback safety"
      INSTALL_FAILED=1
    fi
  fi
else
  echo "WARN  restore-point :: disabled by --no-restore-point"
  record_step "restore-point" "skipped" "restore point capture disabled by flag" "Re-run without --no-restore-point"
fi
echo ""

if [[ "$INSTALL_FAILED" != "0" ]]; then
  echo "Aborting install due to failed safety checks."
  echo "VENTUREOS_INSTALL_RESULT=FAIL"
  exit 1
fi

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
    echo "FAIL  bridge-launchagent :: missing bridge env file: $BRIDGE_ENV" >&2
    record_step "bridge-launchagent" "fail" "missing bridge env file" "Create bridge env file or pass --skip-bridge-launchagent"
    INSTALL_FAILED=1
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
elif [[ "$DRY_RUN" == "1" ]]; then
  adoption_status="planned"
fi
adoption_mode="execute"
if [[ "$DRY_RUN" == "1" ]]; then
  adoption_mode="dry-run"
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

python3 - "$SUMMARY_TSV" "$report_file" "$timestamp_utc" "$OS_NAME" "$DASHBOARD_PORT" "$PROFILE" "$dashboard_url" "$DRY_RUN" "$INSTALL_PRESET" "$VERIFY_POST_INSTALL" "$ADOPTION_PLAN_TSV" "$adoption_evidence_file" <<'PY'
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
preset = sys.argv[9]
verify_enabled = sys.argv[10] == "1"
adoption_plan_path = pathlib.Path(sys.argv[11])
adoption_evidence_path = pathlib.Path(sys.argv[12])

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
elif dry_run:
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
    f"- Mode: `{'dry-run' if dry_run else 'execute'}`",
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

changed_targets = adoption_evidence.get("changedTargets", []) if isinstance(adoption_evidence, dict) else []
rollback_command = adoption_evidence.get("rollbackCommand", "n/a") if isinstance(adoption_evidence, dict) else "n/a"
if not rollback_command:
    rollback_command = "n/a"
lines.extend([
    "",
    "## Config Change Evidence",
    f"- Evidence JSON: `{adoption_evidence_path}`",
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

if [[ -n "$RESTORE_POINT_DIR" ]]; then
  echo "VENTUREOS_INSTALL_RESTORE_POINT=$RESTORE_POINT_DIR"
fi
echo "VENTUREOS_INSTALL_RESULT=PASS"
exit 0

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

OS_NAME="${VENTUREOS_INSTALL_OS:-$(uname)}"
NON_INTERACTIVE=0
YES=0
DRY_RUN=0
VERIFY_POST_INSTALL=0
VERIFY_TIMEOUT_SEC="${VENTUREOS_INSTALL_VERIFY_TIMEOUT_SEC:-3}"

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

REPORT_DIR="${VENTUREOS_INSTALL_REPORT_DIR:-$REPO_ROOT/runtime/reports/ventureos-install}"
SUMMARY_TSV="$(mktemp)"
trap 'rm -f "$SUMMARY_TSV"' EXIT
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
  - Writes an install report artifact

Options:
  --non-interactive         Disable prompts and use flags/defaults
  --yes                     Auto-accept interactive prompts
  --dry-run                 Print planned actions without executing installers
  --verify                  Run post-install verification checks and fail on verification errors
  --verify-timeout-sec <n>  Timeout (seconds) for verification checks (default: 3)
  --preset <name>           Install preset: full|bridge|minimal (default: full)
  --dashboard-port <port>   Dashboard port (default: 7000)
  --dashboard-url <url>     Override readiness dashboard URL (default: http://127.0.0.1:<dashboard-port>)
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
  if [[ -n "$DASHBOARD_URL_OVERRIDE" ]]; then
    echo "$DASHBOARD_URL_OVERRIDE"
  else
    echo "http://127.0.0.1:${DASHBOARD_PORT}"
  fi
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
  echo "VentureOS Installer Onboarding"
  echo "Repo: $REPO_ROOT"
  echo "Platform: $OS_NAME"
  echo ""

  if [[ -z "$EXPLICIT_PRESET" ]]; then
    INSTALL_PRESET="$(prompt_value "Install preset (full|bridge|minimal)" "$INSTALL_PRESET")"
  fi
  apply_install_preset
  apply_explicit_overrides
  DASHBOARD_PORT="$(prompt_value "Dashboard port" "$DASHBOARD_PORT")"
  if [[ -z "$EXPLICIT_PROFILE" ]]; then
    PROFILE="$(prompt_value "Readiness profile (quick|full|bridge)" "$PROFILE")"
  fi
  validate_dashboard_port
  validate_profile

  if [[ -z "$EXPLICIT_SKIP_DASHBOARD" ]]; then
    SKIP_DASHBOARD_INSTALL="$(prompt_run_toggle "Run dashboard installer?" "$SKIP_DASHBOARD_INSTALL")"
  fi
  if [[ "$OS_NAME" == "Darwin" && -z "$EXPLICIT_SKIP_BRIDGE" ]]; then
    SKIP_BRIDGE_LAUNCHAGENT="$(prompt_run_toggle "Install/refresh bridge LaunchAgent?" "$SKIP_BRIDGE_LAUNCHAGENT")"
  fi
  if [[ -z "$EXPLICIT_SKIP_CRON" ]]; then
    SKIP_CRON_INSTALL="$(prompt_run_toggle "Install/refresh managed cron entries?" "$SKIP_CRON_INSTALL")"
  fi
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
  echo ""
fi

dashboard_url="$(resolve_dashboard_url)"

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
if [[ "$DRY_RUN" == "1" ]]; then
  echo "  mode: dry-run"
fi
echo ""

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

python3 - "$SUMMARY_TSV" "$report_file" "$timestamp_utc" "$OS_NAME" "$DASHBOARD_PORT" "$PROFILE" "$dashboard_url" "$DRY_RUN" "$INSTALL_PRESET" "$VERIFY_POST_INSTALL" <<'PY'
import csv
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

rows = []
with summary_tsv.open("r", encoding="utf-8") as fh:
    reader = csv.reader(fh, delimiter="\t")
    for row in reader:
        if len(row) != 4:
            continue
        rows.append({"step": row[0], "status": row[1], "detail": row[2], "next": row[3]})

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

if [[ "$DRY_RUN" == "1" ]]; then
  echo "VENTUREOS_INSTALL_RESULT=PLANNED"
  exit 0
fi

if [[ "$INSTALL_FAILED" != "0" ]]; then
  echo "VENTUREOS_INSTALL_RESULT=FAIL"
  exit 1
fi

echo "VENTUREOS_INSTALL_RESULT=PASS"
exit 0

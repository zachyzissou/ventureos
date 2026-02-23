#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

OS_NAME="${VENTUREOS_INSTALL_OS:-$(uname)}"
NON_INTERACTIVE=0
YES=0
DRY_RUN=0

SKIP_DASHBOARD_INSTALL=0
SKIP_BRIDGE_LAUNCHAGENT=0
SKIP_CRON_INSTALL=0
SKIP_READINESS=0
FORCE_CRON_INSTALL=1

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

REPORT_DIR="${VENTUREOS_INSTALL_REPORT_DIR:-$REPO_ROOT/runtime/reports/ventureos-install}"
SUMMARY_TSV="$(mktemp)"
trap 'rm -f "$SUMMARY_TSV"' EXIT

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
  detail="${detail//$'\n'/ }"
  detail="${detail//$'\r'/ }"
  detail="${detail//$'\t'/ }"
  printf '%s\t%s\t%s\n' "$step" "$status" "$detail" >> "$SUMMARY_TSV"
}

run_step() {
  local step="$1"
  local detail="$2"
  shift 2
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[dry-run] $step :: $detail"
    echo "          cmd: $*"
    record_step "$step" "planned" "$detail"
    return 0
  fi

  if "$@"; then
    echo "PASS  $step :: $detail"
    record_step "$step" "pass" "$detail"
    return 0
  fi

  echo "FAIL  $step :: $detail" >&2
  record_step "$step" "fail" "$detail"
  return 1
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
      SKIP_DASHBOARD_INSTALL=1
      shift
      ;;
    --skip-bridge-launchagent)
      SKIP_BRIDGE_LAUNCHAGENT=1
      shift
      ;;
    --skip-cron)
      SKIP_CRON_INSTALL=1
      shift
      ;;
    --skip-readiness)
      SKIP_READINESS=1
      shift
      ;;
    --no-force-cron)
      FORCE_CRON_INSTALL=0
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

if ! [[ "$DASHBOARD_PORT" =~ ^[0-9]+$ ]] || [[ "$DASHBOARD_PORT" -lt 1 || "$DASHBOARD_PORT" -gt 65535 ]]; then
  echo "Invalid --dashboard-port: $DASHBOARD_PORT" >&2
  exit 2
fi

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

  DASHBOARD_PORT="$(prompt_value "Dashboard port" "$DASHBOARD_PORT")"
  PROFILE="$(prompt_value "Readiness profile (quick|full|bridge)" "$PROFILE")"
  validate_profile

  if [[ "$(prompt_yes_no "Run dashboard installer?" "y")" == "n" ]]; then
    SKIP_DASHBOARD_INSTALL=1
  fi
  if [[ "$OS_NAME" == "Darwin" ]]; then
    if [[ "$(prompt_yes_no "Install/refresh bridge LaunchAgent?" "y")" == "n" ]]; then
      SKIP_BRIDGE_LAUNCHAGENT=1
    fi
  fi
  if [[ "$(prompt_yes_no "Install/refresh managed cron entries?" "y")" == "n" ]]; then
    SKIP_CRON_INSTALL=1
  fi
  if [[ "$(prompt_yes_no "Run readiness refresh smoke now?" "y")" == "n" ]]; then
    SKIP_READINESS=1
  fi
  echo ""
fi

dashboard_url="$(resolve_dashboard_url)"

echo "Install plan:"
echo "  dashboard port: $DASHBOARD_PORT"
echo "  readiness profile: $PROFILE"
echo "  dashboard install: $([[ "$SKIP_DASHBOARD_INSTALL" == "1" ]] && echo skip || echo run)"
echo "  bridge LaunchAgent: $([[ "$SKIP_BRIDGE_LAUNCHAGENT" == "1" ]] && echo skip || echo run)"
echo "  cron install: $([[ "$SKIP_CRON_INSTALL" == "1" ]] && echo skip || echo run)"
echo "  readiness refresh: $([[ "$SKIP_READINESS" == "1" ]] && echo skip || echo run)"
echo "  bridge env: $BRIDGE_ENV"
if [[ "$DRY_RUN" == "1" ]]; then
  echo "  mode: dry-run"
fi
echo ""

if [[ "$SKIP_DASHBOARD_INSTALL" == "0" ]]; then
  if [[ "$OS_NAME" == "Darwin" ]]; then
    run_step "dashboard-install" "dashboard/scripts/install-macos.sh" \
      env DASHBOARD_PORT="$DASHBOARD_PORT" OPENCLAW_DIR="$OPENCLAW_DIR" bash "$DASHBOARD_INSTALL_MACOS_SCRIPT"
  else
    if [[ "$DRY_RUN" == "1" ]]; then
      run_step "dashboard-install" "dashboard/scripts/install.sh (linux)" \
        env DASHBOARD_PORT="$DASHBOARD_PORT" OPENCLAW_DIR="$OPENCLAW_DIR" bash "$DASHBOARD_INSTALL_LINUX_SCRIPT"
    elif [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
      run_step "dashboard-install" "dashboard/scripts/install.sh (linux root)" \
        env DASHBOARD_PORT="$DASHBOARD_PORT" OPENCLAW_DIR="$OPENCLAW_DIR" bash "$DASHBOARD_INSTALL_LINUX_SCRIPT"
    elif command -v sudo >/dev/null 2>&1; then
      run_step "dashboard-install" "dashboard/scripts/install.sh (linux via sudo)" \
        sudo env DASHBOARD_PORT="$DASHBOARD_PORT" OPENCLAW_DIR="$OPENCLAW_DIR" bash "$DASHBOARD_INSTALL_LINUX_SCRIPT"
    else
      echo "FAIL  dashboard-install :: sudo is required on Linux for systemd install" >&2
      record_step "dashboard-install" "fail" "sudo required on Linux for dashboard installer"
      exit 1
    fi
  fi
else
  echo "SKIP  dashboard-install"
  record_step "dashboard-install" "skipped" "skipped by flag"
fi

if [[ "$SKIP_BRIDGE_LAUNCHAGENT" == "0" ]]; then
  if [[ "$OS_NAME" != "Darwin" ]]; then
    echo "SKIP  bridge-launchagent :: not supported on $OS_NAME"
    record_step "bridge-launchagent" "skipped" "bridge LaunchAgent installer is macOS-only"
  elif [[ ! -f "$BRIDGE_ENV" ]]; then
    echo "FAIL  bridge-launchagent :: missing bridge env file: $BRIDGE_ENV" >&2
    record_step "bridge-launchagent" "fail" "missing bridge env file"
    exit 1
  else
    run_step "bridge-launchagent" "scripts/install-bridge-launchagent.sh" \
      bash "$BRIDGE_INSTALL_SCRIPT" --bridge-env "$BRIDGE_ENV"
  fi
else
  echo "SKIP  bridge-launchagent"
  record_step "bridge-launchagent" "skipped" "skipped by flag"
fi

if [[ "$SKIP_CRON_INSTALL" == "0" ]]; then
  if [[ "$FORCE_CRON_INSTALL" == "1" ]]; then
    run_step "cron-install" "scripts/install-cron.sh --force" \
      bash "$CRON_INSTALL_SCRIPT" --force
  else
    run_step "cron-install" "scripts/install-cron.sh" \
      bash "$CRON_INSTALL_SCRIPT"
  fi
else
  echo "SKIP  cron-install"
  record_step "cron-install" "skipped" "skipped by flag"
fi

if [[ "$SKIP_READINESS" == "0" ]]; then
  readiness_cmd=(bash "$READINESS_REFRESH_SCRIPT" --profile "$PROFILE" --dashboard-url "$dashboard_url")
  if [[ -n "$BRIDGE_TOKEN_FILE" ]]; then
    readiness_cmd+=(--bridge-token-file "$BRIDGE_TOKEN_FILE")
  fi

  if [[ -f "$BRIDGE_ENV" ]]; then
    if [[ "$DRY_RUN" == "1" ]]; then
      run_step "readiness-refresh" "refresh-local-integration-ready.sh (with bridge env)" "${readiness_cmd[@]}"
    else
      if (
        set -a
        source "$BRIDGE_ENV"
        set +a
        "${readiness_cmd[@]}"
      ); then
        echo "PASS  readiness-refresh :: scripts/refresh-local-integration-ready.sh"
        record_step "readiness-refresh" "pass" "readiness refresh succeeded"
      else
        echo "FAIL  readiness-refresh :: scripts/refresh-local-integration-ready.sh" >&2
        record_step "readiness-refresh" "fail" "readiness refresh failed"
        exit 1
      fi
    fi
  else
    run_step "readiness-refresh" "refresh-local-integration-ready.sh" "${readiness_cmd[@]}"
  fi
else
  echo "SKIP  readiness-refresh"
  record_step "readiness-refresh" "skipped" "skipped by flag"
fi

mkdir -p "$REPORT_DIR"
timestamp_utc="$(date -u +%Y%m%dT%H%M%SZ)"
report_file="$REPORT_DIR/ventureos-install-${timestamp_utc}.md"

python3 - "$SUMMARY_TSV" "$report_file" "$timestamp_utc" "$OS_NAME" "$DASHBOARD_PORT" "$PROFILE" "$dashboard_url" "$DRY_RUN" <<'PY'
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

rows = []
with summary_tsv.open("r", encoding="utf-8") as fh:
    reader = csv.reader(fh, delimiter="\t")
    for row in reader:
        if len(row) != 3:
            continue
        rows.append({"step": row[0], "status": row[1], "detail": row[2]})

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
    f"- Dashboard port: `{dashboard_port}`",
    f"- Dashboard URL: `{dashboard_url}`",
    f"- Readiness profile: `{profile}`",
    f"- Mode: `{'dry-run' if dry_run else 'execute'}`",
    f"- Status: `{status}`",
    f"- Pass: `{pass_count}`",
    f"- Fail: `{fail_count}`",
    f"- Skipped: `{skip_count}`",
    f"- Planned: `{planned_count}`",
    "",
    "| Step | Status | Detail |",
    "|---|---|---|",
]

for row in rows:
    lines.append(f"| `{row['step']}` | `{row['status']}` | {row['detail']} |")

report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY

echo ""
echo "Install report written:"
echo "  - $report_file"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "VENTUREOS_INSTALL_RESULT=PLANNED"
  exit 0
fi

echo "VENTUREOS_INSTALL_RESULT=PASS"
exit 0

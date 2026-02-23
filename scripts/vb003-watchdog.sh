#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/agent-env.sh
source "$SCRIPT_DIR/lib/agent-env.sh"

AGENT_ID="$(agent_env_agent_id)"
WORKSPACE_ROOT="$(agent_env_workspace_root)"
TMPDIR="$(agent_env_tmp_dir)"
export TMPDIR

OUT_DIR="${VB003_WATCHDOG_REPORT_DIR:-$WORKSPACE_ROOT/runtime/reports/model-orchestration}"
LATEST_TELEMETRY="${VB003_TELEMETRY_LATEST_JSON:-$OUT_DIR/vb003-telemetry-latest.json}"
CRON_RUN_DIR="${VB003_CRON_RUN_DIR:-$WORKSPACE_ROOT/runtime/logs/cron-runs}"
TARGET_HOURS="${VB003_TARGET_HOURS:-168}"
LOOKBACK_MINUTES="${VB003_WATCHDOG_LOOKBACK_MINUTES:-360}"
ALERT_WINDOW_MINUTES="${VB003_WATCHDOG_ALERT_WINDOW_MINUTES:-90}"
MAX_TELEMETRY_AGE_MINUTES="${VB003_WATCHDOG_MAX_TELEMETRY_AGE_MINUTES:-480}"

if ! [[ "$TARGET_HOURS" =~ ^[0-9]+$ ]] || [[ "$TARGET_HOURS" -lt 1 ]]; then
  echo "Invalid VB003_TARGET_HOURS: $TARGET_HOURS" >&2
  exit 2
fi
if ! [[ "$LOOKBACK_MINUTES" =~ ^[0-9]+$ ]] || [[ "$LOOKBACK_MINUTES" -lt 1 ]]; then
  echo "Invalid VB003_WATCHDOG_LOOKBACK_MINUTES: $LOOKBACK_MINUTES" >&2
  exit 2
fi
if ! [[ "$ALERT_WINDOW_MINUTES" =~ ^[0-9]+$ ]] || [[ "$ALERT_WINDOW_MINUTES" -lt 1 ]]; then
  echo "Invalid VB003_WATCHDOG_ALERT_WINDOW_MINUTES: $ALERT_WINDOW_MINUTES" >&2
  exit 2
fi
if ! [[ "$MAX_TELEMETRY_AGE_MINUTES" =~ ^[0-9]+$ ]] || [[ "$MAX_TELEMETRY_AGE_MINUTES" -lt 1 ]]; then
  echo "Invalid VB003_WATCHDOG_MAX_TELEMETRY_AGE_MINUTES: $MAX_TELEMETRY_AGE_MINUTES" >&2
  exit 2
fi

mkdir -p "$OUT_DIR"

python3 - <<'PY' \
  "$OUT_DIR" \
  "$LATEST_TELEMETRY" \
  "$CRON_RUN_DIR" \
  "$TARGET_HOURS" \
  "$LOOKBACK_MINUTES" \
  "$ALERT_WINDOW_MINUTES" \
  "$MAX_TELEMETRY_AGE_MINUTES" \
  "$AGENT_ID" \
  "$WORKSPACE_ROOT"
import json
import os
import shutil
import sys
from datetime import datetime, timedelta, timezone

out_dir = os.path.abspath(sys.argv[1])
latest_telemetry = os.path.abspath(sys.argv[2])
cron_run_dir = os.path.abspath(sys.argv[3])
target_hours = int(sys.argv[4])
lookback_minutes = int(sys.argv[5])
alert_window_minutes = int(sys.argv[6])
max_age_minutes = int(sys.argv[7])
agent_id = sys.argv[8]
workspace_root = os.path.abspath(sys.argv[9])

now = datetime.now(timezone.utc)
cutoff = now - timedelta(minutes=lookback_minutes)
alert_cutoff = now - timedelta(minutes=alert_window_minutes)


def parse_iso_z(ts):
    if not ts:
        return None
    try:
        return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def load_json_line(line):
    try:
        return json.loads(line)
    except json.JSONDecodeError:
        patched = (
            line.replace(":True", ":true")
            .replace(":False", ":false")
            .replace(": None", ": null")
        )
        try:
            return json.loads(patched)
        except json.JSONDecodeError:
            return None


telemetry_present = os.path.exists(latest_telemetry)
telemetry = {}
issues = []
closure_ready = False
coverage_hours = 0.0
coverage_remaining_hours = float(target_hours)
verification_state = "missing"
telemetry_generated_at = None
telemetry_age_minutes = None
window_start_utc = None
window_end_utc = None
closure_eta_utc = None

if telemetry_present:
    try:
        with open(latest_telemetry, "r", encoding="utf-8") as fh:
            telemetry = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        issues.append(f"telemetry_unreadable:{exc.__class__.__name__}")
        telemetry = {}
else:
    issues.append("telemetry_missing")

if telemetry:
    generated_at = telemetry.get("generated_at_utc")
    telemetry_generated_at = generated_at if isinstance(generated_at, str) else None
    generated_dt = parse_iso_z(telemetry_generated_at)
    if generated_dt is None:
        issues.append("telemetry_generated_at_invalid")
    else:
        telemetry_age_minutes = round((now - generated_dt).total_seconds() / 60.0, 2)
        if telemetry_age_minutes > max_age_minutes:
            issues.append(f"telemetry_stale:{telemetry_age_minutes}m")

    window = telemetry.get("window") or {}
    coverage_hours = float(window.get("coverage_hours_observed") or 0.0)
    coverage_remaining_hours = round(max(0.0, target_hours - coverage_hours), 3)
    verification_state = str(telemetry.get("verification_state") or "unknown")
    window_start_utc = window.get("start_utc")
    window_end_utc = window.get("end_utc")
    if isinstance(window_start_utc, str):
        start_dt = parse_iso_z(window_start_utc)
        if start_dt is not None:
            closure_eta_utc = (start_dt + timedelta(hours=target_hours)).strftime("%Y-%m-%dT%H:%M:%SZ")

job_window = {}
alert_window = {}
staleness_threshold_minutes = {
    "budget-check": 1800,        # 30h (daily schedule + buffer)
    "routing-healthcheck": 90,   # every 30m + buffer
    "monitoring": 45,            # every 15m + buffer
}
for job in ("budget-check", "routing-healthcheck", "monitoring"):
    path = os.path.join(cron_run_dir, f"{job}.jsonl")
    stats = {"starts": 0, "success": 0, "failure": 0}
    alert_stats = {"starts": 0, "success": 0, "failure": 0}
    latest_start_dt = None
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                for raw in fh:
                    raw = raw.strip()
                    if not raw:
                        continue
                    rec = load_json_line(raw)
                    if rec is None:
                        continue
                    ts = parse_iso_z(rec.get("ts"))
                    if ts is None or ts < cutoff:
                        continue
                    event = rec.get("event")
                    if event == "start":
                        stats["starts"] += 1
                        if latest_start_dt is None or ts > latest_start_dt:
                            latest_start_dt = ts
                    elif event == "success":
                        stats["success"] += 1
                    elif event in ("failure", "timeout"):
                        stats["failure"] += 1
                    if ts >= alert_cutoff:
                        if event == "start":
                            alert_stats["starts"] += 1
                            if latest_start_dt is None or ts > latest_start_dt:
                                latest_start_dt = ts
                        elif event == "success":
                            alert_stats["success"] += 1
                        elif event in ("failure", "timeout"):
                            alert_stats["failure"] += 1
        except OSError:
            issues.append(f"log_unreadable:{job}")
    else:
        issues.append(f"log_missing:{job}")
    if alert_stats["starts"] > 0:
        fail_rate = alert_stats["failure"] / max(1, alert_stats["starts"])
        if alert_stats["success"] == 0 and alert_stats["failure"] > 0:
            issues.append(f"active_window_all_fail:{job}:{alert_stats['failure']}")
        elif alert_stats["failure"] >= 2 and fail_rate >= 0.5:
            issues.append(f"active_window_high_fail_rate:{job}:{alert_stats['failure']}/{alert_stats['starts']}")

    if latest_start_dt is None:
        issues.append(f"no_recent_start:{job}")
    else:
        age_minutes = (now - latest_start_dt).total_seconds() / 60.0
        threshold = staleness_threshold_minutes.get(job, lookback_minutes)
        if age_minutes > threshold:
            issues.append(f"run_stale:{job}:{round(age_minutes,1)}m>{threshold}m")
    job_window[job] = stats
    alert_window[job] = {
        **alert_stats,
        "latest_start_utc": latest_start_dt.strftime("%Y-%m-%dT%H:%M:%SZ") if latest_start_dt else None,
    }

if coverage_hours >= target_hours and verification_state == "ready_for_closure_review":
    closure_ready = True

status = "healthy" if not issues else "degraded"
exit_code = 0 if not issues else 1

report = {
    "generated_at_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
    "status": status,
    "closure_ready": closure_ready,
    "issues": issues,
    "telemetry": {
        "latest_path": latest_telemetry,
        "present": telemetry_present,
        "generated_at_utc": telemetry_generated_at,
        "age_minutes": telemetry_age_minutes,
        "verification_state": verification_state,
        "coverage_hours_observed": round(coverage_hours, 3),
        "coverage_hours_target": target_hours,
        "coverage_hours_remaining": coverage_remaining_hours,
        "window_start_utc": window_start_utc,
        "window_end_utc": window_end_utc,
        "closure_eta_utc": closure_eta_utc,
    },
    "job_window": {
        "lookback_minutes": lookback_minutes,
        "cutoff_utc": cutoff.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "jobs": job_window,
    },
    "alert_window": {
        "lookback_minutes": alert_window_minutes,
        "cutoff_utc": alert_cutoff.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "jobs": alert_window,
    },
    "agent_id": agent_id,
    "workspace_root": workspace_root,
}

stamp = now.strftime("%Y%m%d-%H%M%SZ")
json_path = os.path.join(out_dir, f"vb003-watchdog-{stamp}.json")
md_path = os.path.join(out_dir, f"vb003-watchdog-{stamp}.md")
latest_json = os.path.join(out_dir, "vb003-watchdog-latest.json")
latest_md = os.path.join(out_dir, "vb003-watchdog-latest.md")

with open(json_path, "w", encoding="utf-8") as fh:
    json.dump(report, fh, indent=2)
    fh.write("\n")

jobs_md = []
for name in ("budget-check", "routing-healthcheck", "monitoring"):
    m = job_window.get(name, {})
    jobs_md.append(
        f"- {name}: starts={m.get('starts', 0)}, success={m.get('success', 0)}, failure={m.get('failure', 0)}"
    )
alert_jobs_md = []
for name in ("budget-check", "routing-healthcheck", "monitoring"):
    m = alert_window.get(name, {})
    alert_jobs_md.append(
        f"- {name}: starts={m.get('starts', 0)}, success={m.get('success', 0)}, failure={m.get('failure', 0)}"
    )

issues_md = "\n".join(f"- {item}" for item in issues) if issues else "- none"

md = f"""# VB-003 Watchdog ({report['generated_at_utc']})

## Status
- status: {status}
- closure_ready: {str(closure_ready)}

## Telemetry Freshness
- latest_report_present: {str(telemetry_present)}
- telemetry_generated_at_utc: {telemetry_generated_at}
- telemetry_age_minutes: {telemetry_age_minutes}
- verification_state: {verification_state}
- coverage_hours: {round(coverage_hours, 3)} / {target_hours}
- coverage_remaining_hours: {coverage_remaining_hours}
- closure_eta_utc: {closure_eta_utc}

## Job Health (last {lookback_minutes} minutes)
{os.linesep.join(jobs_md)}

## Active Alert Window (last {alert_window_minutes} minutes)
{os.linesep.join(alert_jobs_md)}

## Issues
{issues_md}
"""

with open(md_path, "w", encoding="utf-8") as fh:
    fh.write(md)

shutil.copyfile(json_path, latest_json)
shutil.copyfile(md_path, latest_md)

print(f"VB003_WATCHDOG status={status} issues={len(issues)} closure_ready={closure_ready}")
sys.exit(exit_code)
PY

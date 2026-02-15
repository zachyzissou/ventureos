#!/usr/bin/env bash
# cron-reliability-report.sh — Cron SLA Reliability Report
#
# Queries all cron jobs, analyzes run history, calculates SLA metrics,
# and generates a JSON report + human-readable summary.
#
# Usage:
#   ./cron-reliability-report.sh                     # Full report (stdout)
#   ./cron-reliability-report.sh --json              # JSON only
#   ./cron-reliability-report.sh --alert             # Post alerts to Discord if SLA breached
#   ./cron-reliability-report.sh --json --alert      # Both
#
# SLA Thresholds:
#   >= 95% success = healthy
#   90-95% success = warning
#   < 90% success  = critical
#
# Data sources:
#   - ~/.openclaw/cron/jobs.json (job definitions + schedules)
#   - ~/.openclaw/cron/runs/*.jsonl (run history per job)

set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# --- Configuration ---
JOBS_FILE="$HOME/.openclaw/cron/jobs.json"
RUNS_DIR="$HOME/.openclaw/cron/runs"
REPORT_DIR="$HOME/clawd/runtime/reports/cron-sla"
WEBHOOK_SCRIPT="$HOME/clawd/scripts/discord-webhook-send.mjs"
MISSION_CONTROL_CHANNEL="1470210601879076914"

SLA_WARNING=95   # percent
SLA_CRITICAL=90  # percent

# --- Parse args ---
JSON_ONLY=false
ALERT_MODE=false
for arg in "$@"; do
  case "$arg" in
    --json) JSON_ONLY=true ;;
    --alert) ALERT_MODE=true ;;
    --help|-h)
      echo "Usage: $0 [--json] [--alert]"
      echo "  --json   Output JSON only"
      echo "  --alert  Post to Discord if any job is below SLA"
      exit 0
      ;;
  esac
done

mkdir -p "$REPORT_DIR"

# --- Validate dependencies ---
if [[ ! -f "$JOBS_FILE" ]]; then
  echo "ERROR: jobs.json not found at $JOBS_FILE" >&2
  exit 1
fi
if [[ ! -d "$RUNS_DIR" ]]; then
  echo "ERROR: runs directory not found at $RUNS_DIR" >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq not found" >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 not found" >&2
  exit 1
fi

# --- Main analysis (Python for complex date/schedule math) ---
REPORT_JSON=$(python3 - "$JOBS_FILE" "$RUNS_DIR" "$SLA_WARNING" "$SLA_CRITICAL" <<'PYEOF'
import json, sys, os, glob
from datetime import datetime, timezone, timedelta
import re

jobs_file = sys.argv[1]
runs_dir = sys.argv[2]
sla_warning = int(sys.argv[3])
sla_critical = int(sys.argv[4])

now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
now_dt = datetime.now(timezone.utc)

# Time windows
windows = {
    "24h": now_ms - (24 * 3600 * 1000),
    "7d":  now_ms - (7 * 24 * 3600 * 1000),
    "30d": now_ms - (30 * 24 * 3600 * 1000),
}

# Load jobs
with open(jobs_file) as f:
    data = json.load(f)
jobs = data.get("jobs", [])

def parse_cron_interval_ms(expr):
    """Estimate interval from cron expression (simplified)."""
    parts = expr.strip().split()
    if len(parts) != 5:
        return None

    minute, hour, dom, month, dow = parts

    # */N minute patterns
    if minute.startswith("*/") and hour == "*" and dom == "*" and month == "*" and dow == "*":
        n = int(minute[2:])
        return n * 60 * 1000

    # Specific minute, */N hour
    if hour.startswith("*/") and dom == "*" and month == "*" and dow == "*":
        n = int(hour[2:])
        return n * 3600 * 1000

    # Specific minute + hour, daily
    if minute.isdigit() and hour.isdigit() and dom == "*" and month == "*" and dow == "*":
        return 24 * 3600 * 1000

    # Weekly (dow specified, not *)
    if minute.isdigit() and hour.isdigit() and dom == "*" and month == "*" and dow != "*":
        # Count number of days in dow
        if "," in dow:
            num_days = len(dow.split(","))
        elif dow.isdigit():
            num_days = 1
        else:
            num_days = 1
        return (7 * 24 * 3600 * 1000) // num_days

    # Specific minute, every hour
    if minute.isdigit() and hour == "*" and dom == "*" and month == "*" and dow == "*":
        return 3600 * 1000

    # Monthly
    if dom.isdigit() and month == "*":
        return 30 * 24 * 3600 * 1000

    return None

def expected_runs_in_window(interval_ms, window_start_ms, now_ms, created_at_ms=None):
    """Calculate expected number of runs in a time window."""
    if not interval_ms or interval_ms <= 0:
        return 0
    # Cap window start to job creation time (don't penalize new jobs)
    effective_start = max(window_start_ms, created_at_ms or 0)
    if effective_start >= now_ms:
        return 0
    window_ms = now_ms - effective_start
    # If the interval is longer than the window, expect at most 1 run
    if interval_ms > window_ms:
        return 0  # Don't expect a run in a window shorter than the interval
    return max(1, int(window_ms / interval_ms))

results = []

for job in jobs:
    if not job.get("enabled", True):
        continue

    job_id = job["id"]
    job_name = job.get("name", job_id)
    agent_id = job.get("agentId", "?")
    schedule = job.get("schedule", {})

    # Determine interval
    interval_ms = None
    schedule_desc = "unknown"
    if schedule.get("kind") == "cron":
        expr = schedule.get("expr", "")
        interval_ms = parse_cron_interval_ms(expr)
        schedule_desc = f"cron: {expr}"
        if schedule.get("tz"):
            schedule_desc += f" ({schedule['tz']})"
    elif schedule.get("kind") == "every":
        interval_ms = schedule.get("everyMs")
        if interval_ms:
            schedule_desc = f"every {interval_ms // 1000}s"

    # Load run history
    runs_file = os.path.join(runs_dir, f"{job_id}.jsonl")
    runs = []
    if os.path.exists(runs_file):
        with open(runs_file) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    if entry.get("action") == "finished":
                        runs.append(entry)
                except json.JSONDecodeError:
                    continue

    # Analyze per window
    created_at_ms = job.get("createdAtMs", 0)

    job_report = {
        "id": job_id,
        "name": job_name,
        "agent": agent_id,
        "schedule": schedule_desc,
        "interval_ms": interval_ms,
        "enabled": True,
        "windows": {},
        "sla_status": "healthy",
        "last_run_ms": None,
        "last_status": None,
        "consecutive_errors": job.get("state", {}).get("consecutiveErrors", 0),
    }

    # Last run info
    state = job.get("state", {})
    job_report["last_run_ms"] = state.get("lastRunAtMs")
    job_report["last_status"] = state.get("lastStatus")

    worst_sla = "healthy"

    for window_name, window_start in windows.items():
        window_runs = [r for r in runs if r.get("ts", 0) >= window_start]
        total_actual = len(window_runs)
        ok_runs = len([r for r in window_runs if r.get("status") == "ok"])
        error_runs = len([r for r in window_runs if r.get("status") == "error"])
        other_runs = total_actual - ok_runs - error_runs

        expected = expected_runs_in_window(interval_ms, window_start, now_ms, created_at_ms) if interval_ms else None

        # Duration stats
        durations = [r.get("durationMs", 0) for r in window_runs if r.get("durationMs")]
        avg_duration_ms = int(sum(durations) / len(durations)) if durations else None
        max_duration_ms = max(durations) if durations else None
        min_duration_ms = min(durations) if durations else None

        # Success rate
        success_rate = round((ok_runs / total_actual) * 100, 1) if total_actual > 0 else None

        # Missed runs (expected - actual, clamped to 0)
        missed_runs = max(0, expected - total_actual) if expected is not None and total_actual is not None else None

        # Coverage rate (actual / expected)
        coverage_rate = round((total_actual / expected) * 100, 1) if expected and expected > 0 else None

        # SLA status for this window
        window_sla = "healthy"
        if success_rate is not None:
            if success_rate < sla_critical:
                window_sla = "critical"
            elif success_rate < sla_warning:
                window_sla = "warning"

        # Also flag if missed >10% of expected runs
        if coverage_rate is not None and coverage_rate < sla_critical:
            if window_sla != "critical":
                window_sla = max(window_sla, "warning", key=lambda x: ["healthy","warning","critical"].index(x))

        # Track worst SLA
        sla_order = {"healthy": 0, "warning": 1, "critical": 2}
        if sla_order.get(window_sla, 0) > sla_order.get(worst_sla, 0):
            worst_sla = window_sla

        job_report["windows"][window_name] = {
            "actual_runs": total_actual,
            "expected_runs": expected,
            "ok_runs": ok_runs,
            "error_runs": error_runs,
            "missed_runs": missed_runs,
            "success_rate_pct": success_rate,
            "coverage_rate_pct": coverage_rate,
            "avg_duration_ms": avg_duration_ms,
            "max_duration_ms": max_duration_ms,
            "min_duration_ms": min_duration_ms,
            "sla_status": window_sla,
        }

    job_report["sla_status"] = worst_sla
    results.append(job_report)

# Overall summary
total_jobs = len(results)
healthy_jobs = len([r for r in results if r["sla_status"] == "healthy"])
warning_jobs = len([r for r in results if r["sla_status"] == "warning"])
critical_jobs = len([r for r in results if r["sla_status"] == "critical"])

# Fleet-wide 24h success rate
total_ok_24h = sum(r["windows"].get("24h", {}).get("ok_runs", 0) for r in results)
total_actual_24h = sum(r["windows"].get("24h", {}).get("actual_runs", 0) for r in results)
fleet_success_24h = round((total_ok_24h / total_actual_24h) * 100, 1) if total_actual_24h > 0 else None

report = {
    "generated_at": now_dt.isoformat(),
    "generated_at_ms": now_ms,
    "sla_thresholds": {
        "warning_pct": sla_warning,
        "critical_pct": sla_critical,
    },
    "summary": {
        "total_jobs": total_jobs,
        "healthy": healthy_jobs,
        "warning": warning_jobs,
        "critical": critical_jobs,
        "fleet_success_rate_24h_pct": fleet_success_24h,
    },
    "jobs": sorted(results, key=lambda r: {"critical": 0, "warning": 1, "healthy": 2}.get(r["sla_status"], 3)),
}

print(json.dumps(report))
PYEOF
)

if [[ $? -ne 0 ]]; then
  echo "ERROR: Failed to generate report" >&2
  exit 1
fi

# Save report to file
REPORT_FILE="$REPORT_DIR/sla-report-$(date +%Y-%m-%d).json"
echo "$REPORT_JSON" | jq '.' > "$REPORT_FILE"

# --- JSON-only mode ---
if [[ "$JSON_ONLY" == "true" && "$ALERT_MODE" == "false" ]]; then
  echo "$REPORT_JSON" | jq '.'
  exit 0
fi

# --- Human-readable summary ---
generate_summary() {
  REPORT_JSON_ESCAPED="$REPORT_JSON" python3 <<'PYEOF'
import json, os

report = json.loads(os.environ["REPORT_JSON_ESCAPED"])
summary = report["summary"]
jobs = report["jobs"]
thresholds = report["sla_thresholds"]
generated = report["generated_at"]

def fmt_duration(ms):
    if ms is None:
        return "n/a"
    if ms < 1000:
        return f"{ms}ms"
    s = ms / 1000
    if s < 60:
        return f"{s:.1f}s"
    m = s / 60
    return f"{m:.1f}m"

def status_icon(status):
    if status == "critical":
        return "🔴"
    elif status == "warning":
        return "🟡"
    return "🟢"

print(f"📊 Cron SLA Reliability Report")
print(f"Generated: {generated}")
print(f"Thresholds: Warning <{thresholds['warning_pct']}% | Critical <{thresholds['critical_pct']}%")
print()
print(f"Fleet Overview (24h)")
print(f"  Total jobs: {summary['total_jobs']}")
fleet_rate = summary.get('fleet_success_rate_24h_pct')
if fleet_rate is not None:
    print(f"  Fleet success rate: {fleet_rate}%")
print(f"  🟢 Healthy: {summary['healthy']}  🟡 Warning: {summary['warning']}  🔴 Critical: {summary['critical']}")
print()

# Show problem jobs first
problem_jobs = [j for j in jobs if j["sla_status"] != "healthy"]
if problem_jobs:
    print("⚠️  Jobs Below SLA Threshold:")
    print("-" * 70)
    for j in problem_jobs:
        icon = status_icon(j["sla_status"])
        w24 = j["windows"].get("24h", {})
        w7d = j["windows"].get("7d", {})
        print(f"  {icon} {j['name']} ({j['agent']})")
        print(f"     Status: {j['sla_status'].upper()}")
        if w24.get("success_rate_pct") is not None:
            print(f"     24h: {w24['success_rate_pct']}% success ({w24['ok_runs']}/{w24['actual_runs']} ok, {w24.get('error_runs',0)} errors, ~{w24.get('missed_runs','?')} missed)")
        if w7d.get("success_rate_pct") is not None:
            print(f"     7d:  {w7d['success_rate_pct']}% success ({w7d['ok_runs']}/{w7d['actual_runs']} ok, {w7d.get('error_runs',0)} errors)")
        print(f"     Avg duration: {fmt_duration(w24.get('avg_duration_ms'))}")
        if j.get("consecutive_errors", 0) > 0:
            print(f"     ⚠️  Consecutive errors: {j['consecutive_errors']}")
        print()
else:
    print("✅ All jobs meeting SLA targets")
    print()

# Compact table of all jobs
print("All Jobs (24h window):")
print(f"  {'Name':<42} {'Agent':<10} {'Rate':>6} {'OK':>4} {'Err':>4} {'Miss':>5} {'Avg':>8} {'Status':<8}")
print("  " + "-" * 90)
for j in jobs:
    w = j["windows"].get("24h", {})
    rate = f"{w.get('success_rate_pct', '?')}%" if w.get("success_rate_pct") is not None else "n/a"
    ok = str(w.get("ok_runs", 0))
    err = str(w.get("error_runs", 0))
    miss = str(w.get("missed_runs", "?"))
    avg = fmt_duration(w.get("avg_duration_ms"))
    icon = status_icon(j["sla_status"])
    name = j["name"][:40]
    print(f"  {icon} {name:<40} {j['agent']:<10} {rate:>6} {ok:>4} {err:>4} {miss:>5} {avg:>8} {j['sla_status']:<8}")

print()
from datetime import date
print(f"Report saved: ~/clawd/runtime/reports/cron-sla/sla-report-{date.today().isoformat()}.json")
PYEOF
}

if [[ "$JSON_ONLY" == "false" ]]; then
  generate_summary
fi

# --- Alert mode: post to Discord if any job is below SLA ---
if [[ "$ALERT_MODE" == "true" ]]; then
  ALERT_NEEDED=$(echo "$REPORT_JSON" | jq -r '(.summary.warning // 0) + (.summary.critical // 0)')

  if [[ "$ALERT_NEEDED" -gt 0 ]]; then
    # Build alert message
    ALERT_MSG=$(REPORT_DATA="$REPORT_JSON" python3 <<'PYEOF'
import json, os

report = json.loads(os.environ["REPORT_DATA"])
summary = report["summary"]
jobs = report["jobs"]

lines = []
lines.append("📊 **Cron SLA Report — Action Required**")
lines.append("")

fleet_rate = summary.get("fleet_success_rate_24h_pct")
if fleet_rate is not None:
    lines.append(f"Fleet success rate (24h): **{fleet_rate}%**")

lines.append(f"🟢 {summary['healthy']} healthy | 🟡 {summary['warning']} warning | 🔴 {summary['critical']} critical")
lines.append("")

problem_jobs = [j for j in jobs if j["sla_status"] != "healthy"]
for j in problem_jobs:
    icon = "🔴" if j["sla_status"] == "critical" else "🟡"
    w24 = j["windows"].get("24h", {})
    rate = w24.get("success_rate_pct", "?")
    err = w24.get("error_runs", 0)
    miss = w24.get("missed_runs", "?")
    lines.append(f"{icon} **{j['name']}** ({j['agent']})")
    lines.append(f"   24h: {rate}% success, {err} errors, ~{miss} missed")
    if j.get("consecutive_errors", 0) > 0:
        lines.append(f"   ⚠️ {j['consecutive_errors']} consecutive errors")
    lines.append("")

lines.append("Run `~/clawd/scripts/cron-reliability-report.sh` for full details.")

# Truncate if too long for Discord (2000 char limit)
msg = "\n".join(lines)
if len(msg) > 1900:
    msg = msg[:1900] + "\n... (truncated)"

print(msg)
PYEOF
)

    # Post via webhook
    if [[ -n "$ALERT_MSG" && -f "$WEBHOOK_SCRIPT" ]]; then
      TMPFILE=$(mktemp /tmp/cron-sla-alert-XXXXXX.txt)
      echo "$ALERT_MSG" > "$TMPFILE"
      node "$WEBHOOK_SCRIPT" --channel "$MISSION_CONTROL_CHANNEL" --text-file "$TMPFILE" 2>/dev/null || {
        echo "WARNING: Failed to send Discord alert" >&2
      }
      rm -f "$TMPFILE"
      echo ""
      echo "📣 Alert posted to #nexus-mission-control"
    fi
  else
    echo ""
    echo "✅ All jobs meeting SLA — no alert needed"
  fi
fi

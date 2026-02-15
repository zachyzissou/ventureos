#!/usr/bin/env bash
# variance-alert.sh — Real-Time Task Variance Alerts (Early Warning)
#
# Monitors active isolated sessions for estimation variance.
# Alerts when tasks exceed their estimated completion time.
#
# Usage:
#   ./variance-alert.sh                # Check + alert (for cron)
#   ./variance-alert.sh --json         # JSON status only (dashboard)
#   ./variance-alert.sh --dry-run      # Check but don't alert
#   ./variance-alert.sh --dashboard    # JSON dashboard endpoint output
#
# Alert Thresholds:
#   150% of estimate = warning
#   200% of estimate = critical
#
# Data sources:
#   - openclaw sessions --active 360 --json (recently active sessions)
#   - Session labels / task descriptions for "ETA: X hours" patterns
#   - Cron job definitions for session-to-task mapping

set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# --- Configuration ---
STATE_DIR="$HOME/clawd/runtime/variance"
STATE_FILE="$STATE_DIR/variance-state.json"
ALERT_LOG="$STATE_DIR/alert-history.jsonl"
WEBHOOK_SCRIPT="$HOME/clawd/scripts/discord-webhook-send.mjs"
MISSION_CONTROL_CHANNEL="1470210601879076914"

WARNING_THRESHOLD=150   # percent of estimate
CRITICAL_THRESHOLD=200  # percent of estimate
COOLDOWN_MINUTES=60     # Don't re-alert for same session within this window

# --- Parse args ---
JSON_ONLY=false
DRY_RUN=false
DASHBOARD=false
for arg in "$@"; do
  case "$arg" in
    --json) JSON_ONLY=true ;;
    --dry-run) DRY_RUN=true ;;
    --dashboard) DASHBOARD=true; JSON_ONLY=true ;;
    --help|-h)
      echo "Usage: $0 [--json] [--dry-run] [--dashboard]"
      exit 0
      ;;
  esac
done

mkdir -p "$STATE_DIR"

# Initialize state file if missing
if [[ ! -f "$STATE_FILE" ]]; then
  echo '{"alerted_sessions":{}}' > "$STATE_FILE"
fi

# --- Gather active sessions ---
# Get sessions active in last 6 hours (covers long-running tasks)
SESSIONS_RAW=$(openclaw sessions --active 360 --json 2>/dev/null | python3 -c "
import sys
lines = sys.stdin.read()
# Find the first { and extract from there
idx = lines.find('{')
if idx >= 0:
    print(lines[idx:])
else:
    print('{}')
") || {
  echo '{"error":"Failed to query sessions"}' >&2
  exit 1
}

# Also get cron job definitions for mapping
JOBS_FILE="$HOME/.openclaw/cron/jobs.json"

# --- Analyze variance ---
VARIANCE_JSON=$(SESSIONS_JSON="$SESSIONS_RAW" python3 - "$STATE_FILE" "$ALERT_LOG" "$WARNING_THRESHOLD" "$CRITICAL_THRESHOLD" "$COOLDOWN_MINUTES" "$JOBS_FILE" <<'PYEOF'
import json, sys, os, re, time
from datetime import datetime, timezone, timedelta

state_file = sys.argv[1]
alert_log = sys.argv[2]
warning_pct = int(sys.argv[3])
critical_pct = int(sys.argv[4])
cooldown_min = int(sys.argv[5])
jobs_file = sys.argv[6]

now_ms = int(time.time() * 1000)
now_dt = datetime.now(timezone.utc)

# Load state (previously alerted sessions)
try:
    with open(state_file) as f:
        state = json.load(f)
except Exception:
    state = {"alerted_sessions": {}}

alerted = state.get("alerted_sessions", {})

# Load sessions from environment variable
sessions_text = os.environ.get("SESSIONS_JSON", "{}")
try:
    sessions_data = json.loads(sessions_text)
    sessions = sessions_data.get("sessions", [])
except Exception:
    sessions = []

# Load job definitions for label/estimate mapping
jobs = []
try:
    with open(jobs_file) as f:
        data = json.load(f)
    jobs = data.get("jobs", [])
except Exception:
    pass

job_map = {j["id"]: j for j in jobs}

def parse_estimate_hours(text):
    """Extract ETA/estimate from text like 'ETA: 2 hours', '(3-4 hours)', 'est. 30m'."""
    if not text:
        return None

    patterns = [
        # "ETA: X hours" or "ETA: X-Y hours"
        r'ETA:\s*(\d+(?:\.\d+)?)\s*(?:-\s*\d+(?:\.\d+)?\s*)?h(?:ours?|r)?',
        # "(X-Y hours)" — use the larger number
        r'\((\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*h(?:ours?|r)?\)',
        # "(X hours)"
        r'\((\d+(?:\.\d+)?)\s*h(?:ours?|r)?\)',
        # "est. Xh" or "estimate: Xh"
        r'est(?:imate)?[.:]\s*(\d+(?:\.\d+)?)\s*h',
        # "X-Y hours" in parentheses or after colon
        r'(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*hours?',
        # "Xm" or "X min"
        r'ETA:\s*(\d+)\s*m(?:in)?',
        r'est(?:imate)?[.:]\s*(\d+)\s*m(?:in)?',
    ]

    text_lower = text.lower()
    for pattern in patterns:
        m = re.search(pattern, text_lower)
        if m:
            groups = m.groups()
            if len(groups) == 2 and groups[1]:
                # Range: use the upper bound
                return float(groups[1])
            val = float(groups[0])
            # If matched minute pattern, convert
            if 'm' in pattern.split('(')[0][-5:] or ('min' in text_lower[m.start():m.end()]):
                return val / 60
            return val

    return None

def extract_estimate_from_session(session):
    """Try to extract an ETA estimate from session metadata."""
    # Check session label
    label = session.get("label", "") or ""
    est = parse_estimate_hours(label)
    if est:
        return est, "label"

    # Check if it's a cron session — map to job payload
    key = session.get("key", "")
    cron_match = re.search(r':cron:([a-f0-9-]+)', key)
    if cron_match:
        job_id = cron_match.group(1)
        job = job_map.get(job_id)
        if job:
            payload = job.get("payload", {})
            msg = payload.get("message", "")
            est = parse_estimate_hours(msg)
            if est:
                return est, "cron_payload"
            # For cron jobs, use schedule interval as a soft estimate
            sched = job.get("schedule", {})
            if sched.get("kind") == "cron":
                # Don't use interval as estimate for frequent jobs
                pass
            elif sched.get("everyMs"):
                return sched["everyMs"] / 3600000, "schedule_interval"

    # Check session key for subagent patterns with task info
    if ":subagent:" in key:
        # Subagents often have labels set by the spawner
        pass

    return None, None

def get_session_age_hours(session):
    """Calculate how long the session has been running."""
    age_ms = session.get("ageMs")
    if age_ms:
        return age_ms / 3600000
    updated = session.get("updatedAt")
    if updated:
        return (now_ms - updated) / 3600000
    return None

results = []
alerts = []

for session in sessions:
    key = session.get("key", "")
    session_id = session.get("sessionId", "")
    kind = session.get("kind", "")
    label = session.get("label", "")
    agent_match = re.search(r'agent:(\w+)', key)
    agent = agent_match.group(1) if agent_match else "unknown"

    # Only monitor isolated/cron/subagent sessions (not DMs or group chats)
    is_monitored = (
        "cron:" in key or
        "subagent:" in key or
        kind in ("isolated",)
    )

    # Skip stale sessions (not updated in last 30 min = likely finished)
    updated_at = session.get("updatedAt", 0)
    minutes_since_update = (now_ms - updated_at) / 60000
    if minutes_since_update > 30:
        continue

    estimate_hours, estimate_source = extract_estimate_from_session(session)
    age_hours = get_session_age_hours(session)

    if age_hours is None:
        continue

    # Calculate variance
    variance_pct = None
    variance_status = "ok"
    if estimate_hours and estimate_hours > 0:
        variance_pct = round((age_hours / estimate_hours) * 100, 1)
        if variance_pct >= critical_pct:
            variance_status = "critical"
        elif variance_pct >= warning_pct:
            variance_status = "warning"

    entry = {
        "session_id": session_id,
        "session_key": key,
        "agent": agent,
        "label": label or None,
        "kind": kind,
        "age_hours": round(age_hours, 2),
        "estimate_hours": estimate_hours,
        "estimate_source": estimate_source,
        "variance_pct": variance_pct,
        "variance_status": variance_status,
        "updated_at_ms": updated_at,
        "is_monitored": is_monitored,
    }
    results.append(entry)

    # Check if alert needed
    if variance_status in ("warning", "critical") and is_monitored:
        # Cooldown check
        last_alert_ms = alerted.get(session_id, {}).get("last_alert_ms", 0)
        cooldown_ms = cooldown_min * 60 * 1000
        if now_ms - last_alert_ms > cooldown_ms:
            alerts.append(entry)
            alerted[session_id] = {
                "last_alert_ms": now_ms,
                "level": variance_status,
                "variance_pct": variance_pct,
            }

# Clean up old entries from alerted state (>24h old)
cutoff = now_ms - (24 * 3600 * 1000)
alerted = {k: v for k, v in alerted.items() if v.get("last_alert_ms", 0) > cutoff}

# Save state
state["alerted_sessions"] = alerted
with open(state_file, "w") as f:
    json.dump(state, f)

# Log alerts
if alerts:
    with open(alert_log, "a") as f:
        for a in alerts:
            entry = {
                "ts": now_ms,
                "session_id": a["session_id"],
                "agent": a["agent"],
                "label": a["label"],
                "variance_pct": a["variance_pct"],
                "level": a["variance_status"],
            }
            f.write(json.dumps(entry) + "\n")

# Summary
monitored = [r for r in results if r["is_monitored"]]
with_estimates = [r for r in monitored if r["estimate_hours"] is not None]
warnings = [r for r in monitored if r["variance_status"] == "warning"]
criticals = [r for r in monitored if r["variance_status"] == "critical"]

output = {
    "generated_at": now_dt.isoformat(),
    "generated_at_ms": now_ms,
    "thresholds": {
        "warning_pct": warning_pct,
        "critical_pct": critical_pct,
        "cooldown_minutes": cooldown_min,
    },
    "summary": {
        "total_active_sessions": len(sessions),
        "monitored_sessions": len(monitored),
        "with_estimates": len(with_estimates),
        "ok": len([r for r in monitored if r["variance_status"] == "ok"]),
        "warnings": len(warnings),
        "criticals": len(criticals),
        "alerts_fired": len(alerts),
    },
    "alerts": alerts,
    "sessions": sorted(results, key=lambda r: {"critical": 0, "warning": 1, "ok": 2}.get(r["variance_status"], 3)),
}

print(json.dumps(output))
PYEOF
)

if [[ $? -ne 0 ]]; then
  echo "ERROR: Failed to analyze variance" >&2
  exit 1
fi

# --- Dashboard mode ---
if [[ "$DASHBOARD" == "true" ]]; then
  echo "$VARIANCE_JSON" | jq '.'
  exit 0
fi

# --- JSON-only mode ---
if [[ "$JSON_ONLY" == "true" ]]; then
  echo "$VARIANCE_JSON" | jq '.'
  exit 0
fi

# --- Human-readable output ---
VARIANCE_DATA="$VARIANCE_JSON" python3 <<'PYEOF'
import json, os

data = json.loads(os.environ["VARIANCE_DATA"])
summary = data["summary"]
sessions = data["sessions"]
alerts = data["alerts"]

def fmt_hours(h):
    if h is None:
        return "n/a"
    if h < 1:
        return f"{h*60:.0f}m"
    return f"{h:.1f}h"

def status_icon(s):
    return {"critical": "🔴", "warning": "🟡", "ok": "🟢"}.get(s, "⚪")

print("⏱️  Variance Alert Check")
print(f"   Active: {summary['total_active_sessions']} sessions | Monitored: {summary['monitored_sessions']} | With estimates: {summary['with_estimates']}")
print(f"   🟢 {summary['ok']} ok | 🟡 {summary['warnings']} warning | 🔴 {summary['criticals']} critical")
print()

# Show alerts
if alerts:
    print("🚨 ALERTS FIRED:")
    for a in alerts:
        icon = status_icon(a["variance_status"])
        label = a.get("label") or a["session_key"][:50]
        print(f"  {icon} {a['variance_status'].upper()}: {label}")
        print(f"     Agent: {a['agent']} | Age: {fmt_hours(a['age_hours'])} | Estimate: {fmt_hours(a.get('estimate_hours'))} | Variance: {a.get('variance_pct', '?')}%")
    print()

# Show all monitored sessions
monitored = [s for s in sessions if s["is_monitored"]]
if monitored:
    print("Monitored Sessions:")
    for s in monitored:
        icon = status_icon(s["variance_status"])
        label = s.get("label") or s["session_key"][:50]
        var = f"{s['variance_pct']}%" if s.get("variance_pct") is not None else "no estimate"
        print(f"  {icon} {label[:50]}")
        print(f"     Agent: {s['agent']} | Age: {fmt_hours(s['age_hours'])} | Est: {fmt_hours(s.get('estimate_hours'))} | Var: {var}")
else:
    print("No monitored sessions currently active.")

if not alerts:
    print()
    print("✅ No variance alerts needed")
PYEOF

# --- Send Discord alerts ---
if [[ "$DRY_RUN" == "true" ]]; then
  exit 0
fi

ALERTS_COUNT=$(echo "$VARIANCE_JSON" | jq '.summary.alerts_fired')
if [[ "$ALERTS_COUNT" -gt 0 ]]; then
  ALERT_MSG=$(VARIANCE_DATA="$VARIANCE_JSON" python3 <<'PYEOF'
import json, os

data = json.loads(os.environ["VARIANCE_DATA"])
alerts = data["alerts"]

if not alerts:
    sys.exit(0)

lines = []
lines.append("⏱️ **Variance Alert — Tasks Over Estimate**")
lines.append("")

for a in alerts:
    icon = "🔴" if a["variance_status"] == "critical" else "🟡"
    label = a.get("label") or a["session_key"][:50]
    est_h = a.get("estimate_hours")
    age_h = a.get("age_hours", 0)

    est_str = f"{est_h:.1f}h" if est_h and est_h >= 1 else f"{int(est_h*60)}m" if est_h else "?"
    age_str = f"{age_h:.1f}h" if age_h >= 1 else f"{int(age_h*60)}m"

    lines.append(f"{icon} **{a['variance_status'].upper()}**: {label}")
    lines.append(f"   Agent: `{a['agent']}` | Running: {age_str} | Estimate: {est_str} | **{a.get('variance_pct', '?')}%** of estimate")
    lines.append("")

lines.append("Check: `~/clawd/scripts/variance-alert.sh --dashboard`")

msg = "\n".join(lines)
if len(msg) > 1900:
    msg = msg[:1900] + "\n... (truncated)"
print(msg)
PYEOF
)

  if [[ -n "$ALERT_MSG" && -f "$WEBHOOK_SCRIPT" ]]; then
    TMPFILE=$(mktemp /tmp/variance-alert-XXXXXX.txt)
    echo "$ALERT_MSG" > "$TMPFILE"
    node "$WEBHOOK_SCRIPT" --channel "$MISSION_CONTROL_CHANNEL" --text-file "$TMPFILE" 2>/dev/null || {
      echo "WARNING: Failed to send Discord alert" >&2
    }
    rm -f "$TMPFILE"
    echo ""
    echo "📣 Alert posted to #nexus-mission-control"
  fi
fi

#!/usr/bin/env python3
"""
track-approval-requests.sh (Python implementation)
Analyze agent sessions for approval-seeking patterns.

Tracks:
  - Approval requests per agent per week
  - Zone distribution (Green/Yellow/Red)
  - False escalations (asks that should have been Green/Yellow)

Usage:
  ./track-approval-requests.sh              # Full report
  ./track-approval-requests.sh --json       # JSON output for dashboards
  ./track-approval-requests.sh --baseline   # Store current counts as baseline
"""

import json
import os
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

AGENTS_DIR = Path.home() / ".openclaw" / "agents"
OUTPUT_DIR = Path.home() / "clawd" / "shared-context" / "kpis"
BASELINE_FILE = OUTPUT_DIR / "approval-baseline.json"
HISTORY_FILE = OUTPUT_DIR / "approval-history.json"
TODAY = datetime.now().strftime("%Y-%m-%d")

# Parse args
json_mode = "--json" in sys.argv
baseline_mode = "--baseline" in sys.argv

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Approval-seeking patterns (case-insensitive)
APPROVAL_PATTERNS = [
    r"should I\b",
    r"shall I\b",
    r"do you want me to",
    r"would you like me to",
    r"can I go ahead",
    r"permission to\b",
    r"before I proceed",
    r"is it okay",
    r"is it ok if",
    r"\bmay I\b",
    r"want me to\b",
    r"let me know if",
    r"awaiting.*approval",
    r"waiting for.*confirmation",
    r"need.*permission",
    r"approve.*before",
    r"confirm.*before",
]

# Green zone patterns (actions that should never need approval)
GREEN_PATTERNS = [
    r"read.*file",
    r"search.*web",
    r"web_search",
    r"web_fetch",
    r"\bcalculate\b",
    r"\banalyze\b",
    r"\bsummariz",
    r"check.*status",
    r"health.*check",
    r"list.*files",
    r"HEARTBEAT_OK",
    r"run.*test",
    r"git.*status",
    r"\bdiagnostic\b",
]

# Red zone patterns (actions that genuinely need approval)
RED_PATTERNS = [
    r"delete.*production",
    r"deploy.*prod",
    r"merge.*main",
    r"\btweet\b",
    r"post.*twitter",
    r"send.*email",
    r"\bpublish\b",
    r"spend.*money",
    r"\bpurchase\b",
    r"\bpayment\b",
    r"rm\s+-rf",
    r"modify.*credentials",
    r"change.*password",
    r"disable.*security",
]

AGENT_IDS = ["oracle", "atlas", "sentinel", "echo", "nexus", "verifier", "archivist", "synth"]


def extract_text(msg_data):
    """Extract text from a message JSON object."""
    try:
        msg = msg_data.get("message", {})
        parts = msg.get("content", [])
        if isinstance(parts, str):
            return parts[:2000]
        texts = []
        for p in parts:
            if isinstance(p, dict) and p.get("type") == "text":
                texts.append(p.get("text", ""))
        return " ".join(texts)[:2000]
    except Exception:
        return ""


def matches_any(text, patterns):
    """Check if text matches any of the given regex patterns."""
    for pat in patterns:
        if re.search(pat, text, re.IGNORECASE):
            return True
    return False


def analyze_agent(agent_id):
    """Analyze an agent's sessions for approval-seeking patterns."""
    results = {"total": 0, "green_false": 0, "yellow_false": 0, "red_legit": 0}
    session_dir = AGENTS_DIR / agent_id / "sessions"

    if not session_dir.exists():
        return results

    for jsonl_file in session_dir.glob("*.jsonl"):
        try:
            with open(jsonl_file, "r", encoding="utf-8", errors="replace") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    # Only assistant messages
                    msg = data.get("message", {})
                    if msg.get("role") != "assistant":
                        continue

                    text = extract_text(data)
                    if not text:
                        continue

                    # Check for approval-seeking patterns
                    if not matches_any(text, APPROVAL_PATTERNS):
                        continue

                    results["total"] += 1

                    # Classify
                    is_red = matches_any(text, RED_PATTERNS)
                    is_green = matches_any(text, GREEN_PATTERNS)

                    if is_red:
                        results["red_legit"] += 1
                    elif is_green:
                        results["green_false"] += 1
                    else:
                        results["yellow_false"] += 1

        except Exception as e:
            # Skip problematic files silently
            continue

    return results


def main():
    # Analyze all agents
    agent_results = {}
    for agent_id in AGENT_IDS:
        agent_results[agent_id] = analyze_agent(agent_id)

    # Aggregate
    grand = {"total": 0, "green_false": 0, "yellow_false": 0, "red_legit": 0}
    for r in agent_results.values():
        for k in grand:
            grand[k] += r[k]

    # Percentages
    total = grand["total"] or 1  # avoid div/0
    green_pct = grand["green_false"] * 100 // total
    yellow_pct = grand["yellow_false"] * 100 // total
    red_pct = grand["red_legit"] * 100 // total
    false_esc_pct = (grand["green_false"] + grand["yellow_false"]) * 100 // total

    if grand["total"] == 0:
        green_pct = yellow_pct = red_pct = false_esc_pct = 0

    # Baseline mode
    if baseline_mode:
        baseline = {
            "date": TODAY,
            "total_requests": grand["total"],
            "green_false_escalations": grand["green_false"],
            "yellow_false_escalations": grand["yellow_false"],
            "red_legitimate": grand["red_legit"],
            "false_escalation_pct": false_esc_pct,
        }
        with open(BASELINE_FILE, "w") as f:
            json.dump(baseline, f, indent=2)
        print(f"Baseline saved to {BASELINE_FILE}")
        print(f"  Total approval requests: {grand['total']}")
        print(f"  False escalation rate: {false_esc_pct}%")
        return

    # JSON mode
    if json_mode:
        output = {
            "date": TODAY,
            "summary": {
                "total_approval_requests": grand["total"],
                "green_false_escalations": grand["green_false"],
                "yellow_false_escalations": grand["yellow_false"],
                "red_legitimate": grand["red_legit"],
                "false_escalation_pct": false_esc_pct,
                "zone_distribution": {
                    "green_pct": green_pct,
                    "yellow_pct": yellow_pct,
                    "red_pct": red_pct,
                },
            },
            "by_agent": agent_results,
        }
        print(json.dumps(output, indent=2))
        # Save to history
        save_history(grand, false_esc_pct)
        return

    # Human-readable report
    print("═══════════════════════════════════════════════════")
    print(f"  APPROVAL REQUEST TRACKING — {TODAY}")
    print("═══════════════════════════════════════════════════")
    print()
    print("SUMMARY")
    print(f"  Total approval requests found:     {grand['total']}")
    print(f"  🟢 False escalations (Green zone): {grand['green_false']} ({green_pct}%)")
    print(f"  🟡 False escalations (Yellow zone): {grand['yellow_false']} ({yellow_pct}%)")
    print(f"  🔴 Legitimate asks (Red zone):     {grand['red_legit']} ({red_pct}%)")
    print(f"  📊 False escalation rate:          {false_esc_pct}%")
    print()

    # Baseline comparison
    if BASELINE_FILE.exists():
        try:
            with open(BASELINE_FILE) as f:
                baseline = json.load(f)
            bl_total = baseline.get("total_requests", 0)
            if bl_total > 0 and grand["total"] > 0:
                change = (grand["total"] - bl_total) * 100 // bl_total
                print("BASELINE COMPARISON")
                print(f"  Baseline ({baseline.get('date', '?')}): {bl_total} requests")
                print(f"  Current:  {grand['total']} requests")
                if change < 0:
                    print(f"  Change:   {change}% ✅ (improving)")
                elif change > 0:
                    print(f"  Change:   +{change}% ⚠️ (worsening)")
                else:
                    print(f"  Change:   0% (no change)")
                print()
        except Exception:
            pass

    print("PER-AGENT BREAKDOWN")
    print(f"  {'Agent':<11} {'Total':>5}  {'Green↓':>6}  {'Yellow↓':>7}  {'Red✓':>4}")
    print(f"  {'─' * 11} {'─' * 5}  {'─' * 6}  {'─' * 7}  {'─' * 4}")
    for agent_id in AGENT_IDS:
        r = agent_results[agent_id]
        print(
            f"  {agent_id:<11} {r['total']:>5}  {r['green_false']:>6}  {r['yellow_false']:>7}  {r['red_legit']:>4}"
        )
    print()

    # Recommendations
    print("RECOMMENDATIONS")
    if grand["green_false"] > 0:
        print(f"  ⚠️  {grand['green_false']} approval requests were for Green zone actions.")
        print("     These agents should be acting immediately without asking.")
        print("     Review: ~/clawd/shared-context/pre-approval-framework.md")
    if grand["yellow_false"] > 0:
        print(f"  ℹ️  {grand['yellow_false']} requests were for Yellow zone actions.")
        print("     These should proceed and inform after, not block.")
    if false_esc_pct > 50:
        print(f"  🔴 FALSE ESCALATION RATE IS {false_esc_pct}% — Framework needs reinforcement")
    elif false_esc_pct > 20:
        print(f"  🟡 False escalation rate is {false_esc_pct}% — Room for improvement")
    elif grand["total"] > 0:
        print(f"  🟢 False escalation rate is {false_esc_pct}% — Good!")
    else:
        print("  ℹ️  No approval requests found in current sessions.")
        print("     This could mean sessions were recently reset, or agents are acting autonomously.")
    print()

    save_history(grand, false_esc_pct)
    print(f"History saved to {HISTORY_FILE}")


def save_history(grand, false_esc_pct):
    """Append today's data to the history file."""
    entry = {
        "date": TODAY,
        "total": grand["total"],
        "green_false": grand["green_false"],
        "yellow_false": grand["yellow_false"],
        "red_legit": grand["red_legit"],
        "false_escalation_pct": false_esc_pct,
    }

    history = []
    if HISTORY_FILE.exists():
        try:
            with open(HISTORY_FILE) as f:
                history = json.load(f)
        except Exception:
            history = []

    # Replace today's entry if exists
    history = [h for h in history if h.get("date") != TODAY]
    history.append(entry)
    # Keep last 90 days
    history = sorted(history, key=lambda x: x.get("date", ""))[-90:]

    with open(HISTORY_FILE, "w") as f:
        json.dump(history, f, indent=2)


if __name__ == "__main__":
    main()

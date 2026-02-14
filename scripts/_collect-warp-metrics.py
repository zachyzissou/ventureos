#!/usr/bin/env python3
"""Best-effort Warp Technology input collector.

This is Phase 2 Track 1 plumbing: it produces non-bootstrap warp inputs derived from
available production telemetry (cron run logs + workspace memory).

As dedicated sources come online (escalations, approvals, CI/deploy logs, etc.),
replace these proxies with true signals.
"""

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

AGENTS = ["oracle","atlas","sentinel","verifier","archivist","synth","echo","nexus"]

HOME = Path.home()
COLLECTED_DIR = Path(os.environ.get("COLLECTED_DIR", HOME / "clawd" / "runtime" / "rpg-metrics" / "_collected"))
SESSION_PATH = Path(os.environ.get("SESSION_METRICS", COLLECTED_DIR / "session-metrics.json"))
MEMORY_PATH = Path(os.environ.get("MEMORY_METRICS", COLLECTED_DIR / "memory-metrics.json"))

LOOKBACK_DAYS = int(os.environ.get("LOOKBACK_DAYS", "30"))

PAT_REPEAT = re.compile(r"\b(repeat|duplicate|already|again)\b", re.I)
PAT_BUG = re.compile(r"\b(bug|regression|break|broken|fails?)\b", re.I)


def load_agents(path: Path):
    if not path.exists():
        return {}
    try:
        return (json.loads(path.read_text(encoding="utf-8")) or {}).get("agents", {}) or {}
    except Exception:
        return {}


def clamp(x, lo, hi):
    return lo if x < lo else hi if x > hi else x


def int0(x):
    try:
        return int(x)
    except Exception:
        return 0


def f0(x):
    try:
        return float(x)
    except Exception:
        return 0.0


def count_pattern_in_workspace_memory(agent_id: str, pat: re.Pattern) -> int:
    mem_dir = HOME / ".openclaw" / f"workspace-{agent_id}" / "memory"
    if not mem_dir.exists():
        return 0
    cnt = 0
    for p in mem_dir.rglob("*.md"):
        try:
            txt = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        cnt += len(pat.findall(txt))
    return cnt


def compute_for_agent(aid: str, session: dict, memory: dict) -> dict:
    s = session.get(aid, {}) or {}
    m = memory.get(aid, {}) or {}

    acceptance = clamp(f0(s.get("acceptance_rate")), 0.0, 1.0)
    success = clamp(f0(s.get("success_rate")), 0.0, 1.0)
    tasks = int0(s.get("tasks_completed"))

    unique_domains = int0(m.get("unique_domains"))
    canonical_edits = int0(m.get("canonical_edits"))

    runs_failish = int0(((s.get("_debug") or {}).get("runs_failish")))

    # Shared helper proxies
    repeat_mentions = count_pattern_in_workspace_memory(aid, PAT_REPEAT)
    bug_mentions = count_pattern_in_workspace_memory(aid, PAT_BUG)

    if aid in ("oracle", "archivist"):
        prevented = clamp(repeat_mentions, 0, 25)
        severity_weight = clamp(3 + canonical_edits, 1, 10)
        return {
            "prevented_repeat_questions": int(prevented),
            "severity_weight": float(severity_weight),
            "_proxies": {"repeat_mentions": int(repeat_mentions), "severity_weight_from": "3+canonical_edits"},
        }

    if aid == "synth":
        explicit_approval = round(acceptance * 100.0, 2)
        reuse = clamp(unique_domains * 10 + canonical_edits * 5, 0, 100)
        verifier_pass = round(clamp(success, 0.0, 1.0) * 100.0, 2)
        return {
            "explicit_approval": explicit_approval,
            "reuse_count_30d": float(reuse),
            "verifier_pass": verifier_pass,
            "_proxies": {"reuse_from": "unique_domains*10 + canonical_edits*5"},
        }

    if aid == "verifier":
        bugs = clamp(bug_mentions, 0, 25)
        severity = clamp(3 + min(5, canonical_edits), 1, 10)
        return {
            "bugs_caught_pre_release_outside_expected": int(bugs),
            "severity": float(severity),
            "unique_risk_areas_covered": int(clamp(unique_domains, 0, 25)),
            "_proxies": {"bug_mentions": int(bug_mentions)},
        }

    if aid == "atlas":
        return {
            "change_success_rate": round(success, 4),
            "slo_compliance": round(acceptance, 4),
            "_proxies": {"change_success_rate": "success_rate", "slo_compliance": "acceptance_rate"},
        }

    if aid == "sentinel":
        total_escalations = max(0, runs_failish)
        validated = int(round(total_escalations * acceptance))
        return {
            "total_escalations": int(total_escalations),
            "validated_real_issues": int(validated),
            "_proxies": {"validated_real_issues": "total_escalations*acceptance_rate"},
        }

    if aid == "echo":
        return {
            "orchestration_score": round(acceptance * 100.0, 2),
            "_proxies": {"orchestration_score": "acceptance_rate*100"},
        }

    if aid == "nexus":
        return {
            "routing_efficiency": round(acceptance, 4),
            "_proxies": {"routing_efficiency": "acceptance_rate"},
        }

    return {}


def main():
    # Usage:
    #   _collect-warp-metrics.py [agent_id]
    agent_filter = sys.argv[1] if len(sys.argv) > 1 else None
    session = load_agents(SESSION_PATH)
    memory = load_agents(MEMORY_PATH)

    agents = [agent_filter] if agent_filter else AGENTS
    out = {}
    for aid in agents:
        if aid not in AGENTS:
            continue
        out[aid] = {"warp_tech_inputs": compute_for_agent(aid, session, memory)}

    payload = {
        "collected_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "lookback_days": LOOKBACK_DAYS,
        "agents": out,
    }
    sys.stdout.write(json.dumps(payload, indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()

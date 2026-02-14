#!/usr/bin/env bash
set -euo pipefail

# Aggregate all per-source metrics and write per-agent JSON files to ~/clawd/runtime/rpg-metrics/<agent>.json
#
# Pipeline:
#   collect-memory-metrics.sh
#   collect-session-metrics.sh
#   collect-<agent>-metrics.sh (warp proxies)
#   merge + validate + write per-agent metrics
#
# Env:
#   LOOKBACK_DAYS_SESSION  default: 7
#   LOOKBACK_DAYS_MEMORY   default: 30
#   METRICS_DIR            default: ~/clawd/runtime/rpg-metrics

METRICS_DIR="${METRICS_DIR:-$HOME/clawd/runtime/rpg-metrics}"
LOOKBACK_DAYS_SESSION="${LOOKBACK_DAYS_SESSION:-7}"
LOOKBACK_DAYS_MEMORY="${LOOKBACK_DAYS_MEMORY:-30}"

command -v python3 >/dev/null 2>&1 || { echo "python3 not found" >&2; exit 1; }

mkdir -p "$METRICS_DIR/_collected"

# 1) Collect core sources
LOOKBACK_DAYS="$LOOKBACK_DAYS_MEMORY" OUT="$METRICS_DIR/_collected/memory-metrics.json" \
  "$HOME/clawd/scripts/collect-memory-metrics.sh" >/dev/null

LOOKBACK_DAYS="$LOOKBACK_DAYS_SESSION" OUT="$METRICS_DIR/_collected/session-metrics.json" \
  "$HOME/clawd/scripts/collect-session-metrics.sh" >/dev/null

# 2) Collect agent-specific warp inputs
for a in oracle atlas sentinel verifier archivist synth echo nexus; do
  OUT="$METRICS_DIR/_collected/warp-$a.json" "$HOME/clawd/scripts/collect-$a-metrics.sh" >/dev/null
done

# 3) Merge + validate
python3 - "$METRICS_DIR" <<'PY'
import json, os, sys
from datetime import datetime
from pathlib import Path

METRICS_DIR = Path(sys.argv[1]).expanduser()
COLLECTED = METRICS_DIR / "_collected"

AGENTS = ["oracle","atlas","sentinel","verifier","archivist","synth","echo","nexus"]


def load_agents(path: Path):
    if not path.exists():
        return {}
    try:
        return (json.loads(path.read_text(encoding="utf-8")) or {}).get("agents", {}) or {}
    except Exception:
        return {}


def clamp(x, lo, hi):
    return lo if x < lo else hi if x > hi else x


def f0(x):
    try:
        return float(x)
    except Exception:
        return 0.0


def i0(x):
    try:
        return int(x)
    except Exception:
        return 0


session = load_agents(COLLECTED / "session-metrics.json")
memory = load_agents(COLLECTED / "memory-metrics.json")

warp = {}
for aid in AGENTS:
    warp.update(load_agents(COLLECTED / f"warp-{aid}.json"))

now = datetime.now().astimezone().isoformat(timespec="seconds")

written = []
for aid in AGENTS:
    s = session.get(aid, {}) or {}
    m = memory.get(aid, {}) or {}
    w = (warp.get(aid, {}) or {}).get("warp_tech_inputs", {}) or {}

    # Required core metrics (best-effort; clamp rates into 0..1)
    memory_count = i0(m.get("memory_count"))
    unique_domains = i0(m.get("unique_domains"))
    canonical_edits = i0(m.get("canonical_edits"))

    p95_latency_s = f0(s.get("p95_latency_s"))
    mttr_minutes = f0(s.get("mttr_minutes"))

    acceptance_rate = clamp(f0(s.get("acceptance_rate")), 0.0, 1.0)
    success_rate = clamp(f0(s.get("success_rate")), 0.0, 1.0)
    approval_accuracy = clamp(f0(s.get("approval_accuracy")), 0.0, 1.0)

    tasks_completed = i0(s.get("tasks_completed"))

    out = {
        "agent_id": aid,
        "collected_at": now,

        "memory_count": memory_count,
        "unique_domains": unique_domains,
        "canonical_edits": canonical_edits,

        "p95_latency_s": round(p95_latency_s, 3),
        "mttr_minutes": round(mttr_minutes, 3),

        "acceptance_rate": round(acceptance_rate, 4),
        "success_rate": round(success_rate, 4),
        "approval_accuracy": round(approval_accuracy, 4),

        "tasks_completed": tasks_completed,

        "warp_tech_inputs": w,

        # Back-compat keys consumed by Phase 1 scripts
        "domains": unique_domains,
        "edits": canonical_edits,
        "warp": w,

        "_sources": {
            "session": str(COLLECTED / "session-metrics.json"),
            "memory": str(COLLECTED / "memory-metrics.json"),
            "warp": str(COLLECTED / f"warp-{aid}.json"),
        }
    }

    # Minimal validation (ensure required keys exist and types are sane)
    required_ints = ["memory_count","unique_domains","canonical_edits","tasks_completed"]
    required_floats = ["p95_latency_s","mttr_minutes","acceptance_rate","success_rate","approval_accuracy"]

    for k in required_ints:
        if not isinstance(out.get(k), int):
            out[k] = i0(out.get(k))
    for k in required_floats:
        if not isinstance(out.get(k), (int, float)):
            out[k] = f0(out.get(k))

    # Rates clamp
    for k in ("acceptance_rate","success_rate","approval_accuracy"):
        out[k] = round(clamp(float(out[k]), 0.0, 1.0), 4)

    # Non-negative
    for k in ("memory_count","unique_domains","canonical_edits","tasks_completed"):
        out[k] = max(0, int(out[k]))
    for k in ("p95_latency_s","mttr_minutes"):
        out[k] = max(0.0, float(out[k]))

    dest = METRICS_DIR / f"{aid}.json"
    dest.write_text(json.dumps(out, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    written.append(str(dest))

print("\n".join(written))
PY
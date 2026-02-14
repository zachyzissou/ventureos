#!/usr/bin/env bash
set -euo pipefail

# VentureOS RPG — Psionic Attribute Calculation (Khala v2.0)
#
# Writes one daily snapshot per agent into `psionic_stats` (idempotent via UPSERT)
# and updates `psionic_ranks` (XP + rank).
#
# Usage:
#   ./calculate-psionic-stats.sh [db_path]
#
# Inputs (in priority order):
#   1) Per-agent metrics JSON:  ~/clawd/runtime/rpg-metrics/<agent_id>.json
#   2) Optional per-agent memory dir count: ~/clawd/memory/agents/<agent_id>/*
#   3) Built-in mock defaults (safe bootstrap until real metrics exist)
#
# Env overrides:
#   OVERLAYS_DIR   default: ~/clawd/agents/tactical-overlays
#   METRICS_DIR    default: ~/clawd/runtime/rpg-metrics
#   SNAPSHOT_DATE  default: today (YYYY-MM-DD)

umask 022

DB_PATH="${1:-$HOME/clawd/agents/ventureos-rpg.db}"
OVERLAYS_DIR="${OVERLAYS_DIR:-$HOME/clawd/agents/tactical-overlays}"
METRICS_DIR="${METRICS_DIR:-$HOME/clawd/runtime/rpg-metrics}"
SNAPSHOT_DATE="${SNAPSHOT_DATE:-$(date +%F)}"

log() { printf "[%s] %s\n" "$(date +%F' '%T)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

command -v python3 >/dev/null 2>&1 || die "python3 not found"

[[ -d "$OVERLAYS_DIR" ]] || die "OVERLAYS_DIR not found: $OVERLAYS_DIR"
[[ -f "$DB_PATH" ]] || die "DB not found: $DB_PATH (run scripts/init-rpg-database.sh first)"

mkdir -p "$METRICS_DIR" || true

log "Calculating psionic stats for snapshot_date=$SNAPSHOT_DATE"
log "DB_PATH=$DB_PATH"
log "OVERLAYS_DIR=$OVERLAYS_DIR"
log "METRICS_DIR=$METRICS_DIR"

python3 - "$DB_PATH" "$OVERLAYS_DIR" "$METRICS_DIR" "$SNAPSHOT_DATE" <<'PY'
import glob
import json
import math
import os
import sqlite3
import sys
from datetime import datetime

DB_PATH, OVERLAYS_DIR, METRICS_DIR, SNAPSHOT_DATE = sys.argv[1:5]

def clamp(x, lo=0.0, hi=100.0):
    return lo if x < lo else hi if x > hi else x

def safe_log2(n: float) -> float:
    return math.log2(max(1.0, float(n)))

def as_float(d, k, default=0.0):
    try:
        v = d.get(k, default)
        if v is None:
            return float(default)
        return float(v)
    except Exception:
        return float(default)

def as_int(d, k, default=0):
    try:
        v = d.get(k, default)
        if v is None:
            return int(default)
        return int(v)
    except Exception:
        return int(default)

# --- Agent list from tactical overlays ---
agent_ids = []
for p in sorted(glob.glob(os.path.join(OVERLAYS_DIR, "*.json"))):
    with open(p, "r", encoding="utf-8") as f:
        data = json.load(f)
    aid = data.get("agent_id")
    if aid:
        agent_ids.append(aid)
agent_ids = sorted(set(agent_ids))
if not agent_ids:
    raise SystemExit(f"No agents found in overlays dir: {OVERLAYS_DIR}")

# --- Built-in bootstrap defaults (used only when real metrics are missing) ---
# Notes:
# - Units are currently treated as 0–100 penalty values for latency/MTTR, matching the Phase 1 formula.
# - Values are clamped to satisfy DB CHECK constraints.
DEFAULTS = {
    "oracle": {
        "memory_count": 28, "domains": 9, "edits": 4,
        "p95_latency_s": 18, "mttr_minutes": 22,
        "acceptance_rate": 0.86, "success_rate": 0.93, "approval_accuracy": 0.90,
        "tasks_completed": 14,
        "warp": {"prevented_repeat_questions": 10, "severity_weight": 6},
    },
    "atlas": {
        "memory_count": 20, "domains": 6, "edits": 2,
        "p95_latency_s": 12, "mttr_minutes": 18,
        "acceptance_rate": 0.80, "success_rate": 0.90, "approval_accuracy": 0.88,
        "tasks_completed": 22,
        "warp": {"change_success_rate": 0.92, "slo_compliance": 0.87},
    },
    "sentinel": {
        "memory_count": 16, "domains": 4, "edits": 1,
        "p95_latency_s": 20, "mttr_minutes": 25,
        "acceptance_rate": 0.82, "success_rate": 0.95, "approval_accuracy": 0.92,
        "tasks_completed": 10,
        "warp": {"total_escalations": 12, "validated_real_issues": 9},
    },
    "verifier": {
        "memory_count": 18, "domains": 5, "edits": 2,
        "p95_latency_s": 15, "mttr_minutes": 20,
        "acceptance_rate": 0.78, "success_rate": 0.91, "approval_accuracy": 0.96,
        "tasks_completed": 11,
        "warp": {"bugs_caught_pre_release_outside_expected": 6, "severity": 6, "unique_risk_areas_covered": 12},
    },
    "archivist": {
        "memory_count": 26, "domains": 8, "edits": 3,
        "p95_latency_s": 22, "mttr_minutes": 30,
        "acceptance_rate": 0.84, "success_rate": 0.92, "approval_accuracy": 0.89,
        "tasks_completed": 13,
        "warp": {"prevented_repeat_questions": 8, "severity_weight": 7},
    },
    "synth": {
        "memory_count": 22, "domains": 7, "edits": 4,
        "p95_latency_s": 14, "mttr_minutes": 19,
        "acceptance_rate": 0.76, "success_rate": 0.88, "approval_accuracy": 0.86,
        "tasks_completed": 19,
        "warp": {"explicit_approval": 70, "reuse_count_30d": 40, "verifier_pass": 90},
    },
    "echo": {
        "memory_count": 14, "domains": 5, "edits": 1,
        "p95_latency_s": 16, "mttr_minutes": 24,
        "acceptance_rate": 0.83, "success_rate": 0.90, "approval_accuracy": 0.87,
        "tasks_completed": 15,
        "warp": {"orchestration_score": 78},
    },
    "nexus": {
        "memory_count": 12, "domains": 5, "edits": 1,
        "p95_latency_s": 10, "mttr_minutes": 15,
        "acceptance_rate": 0.85, "success_rate": 0.94, "approval_accuracy": 0.90,
        "tasks_completed": 25,
        "warp": {"routing_efficiency": 0.88},
    },
}

HOME = os.path.expanduser("~")

def load_metrics(agent_id: str):
    sources = {"defaults": True, "metrics_file": None, "memory_dir": None}
    m = dict(DEFAULTS.get(agent_id, {}))
    m.setdefault("warp", {})

    memory_count_from_metrics = False

    # Per-agent metrics JSON override
    metrics_path = os.path.join(METRICS_DIR, f"{agent_id}.json")
    if os.path.exists(metrics_path):
        try:
            with open(metrics_path, "r", encoding="utf-8") as f:
                j = json.load(f) or {}
            sources["metrics_file"] = metrics_path
            sources["defaults"] = False
            memory_count_from_metrics = ("memory_count" in j)

            # shallow merge
            for k, v in j.items():
                # Back-compat: Phase 1 used `warp`; Phase 2 schema uses `warp_tech_inputs`.
                if k in ("warp", "warp_tech_inputs") and isinstance(v, dict):
                    m.setdefault("warp", {})
                    m["warp"].update(v)
                else:
                    m[k] = v
        except Exception as e:
            # keep going with defaults
            m.setdefault("_warnings", []).append(f"Failed to parse metrics file {metrics_path}: {e}")

    # Optional agent memory count from filesystem (bootstrap-friendly)
    # Priority: use this ONLY if metrics file did not explicitly provide memory_count.
    mem_dir = os.path.join(HOME, "clawd", "memory", "agents", agent_id)
    if os.path.isdir(mem_dir) and not memory_count_from_metrics:
        try:
            cnt = 0
            for root, _, files in os.walk(mem_dir):
                for fn in files:
                    if fn.startswith('.'):
                        continue
                    cnt += 1
            m["memory_count"] = cnt
            sources["memory_dir"] = mem_dir
        except Exception:
            pass

    m["_sources"] = sources
    return m

def compute_wis(m):
    memory_count = as_int(m, "memory_count", 0)
    domains = as_int(m, "domains", as_int(m, "unique_domains", 0))
    edits = as_int(m, "edits", as_int(m, "canonical_edits", 0))
    wis = (safe_log2(memory_count) * 15.0) + (domains * 2.0) + min(edits * 2.5, 15.0)
    return int(round(clamp(wis)))

def compute_energy(m):
    p95_latency = as_float(m, "p95_latency_s", as_float(m, "latency", 25))
    mttr = as_float(m, "mttr_minutes", as_float(m, "mttr", 25))
    acceptance = as_float(m, "acceptance_rate", 0.0)

    # Phase 1 formula expects (100 - latency) and (100 - MTTR) and then a quality gate.
    latency_score = clamp(100.0 - p95_latency)
    mttr_score = clamp(100.0 - mttr)

    energy_raw = (0.7 * latency_score) + (0.3 * mttr_score)
    quality_multiplier = 0.0 if acceptance < 0.7 else 1.0
    return int(round(clamp(energy_raw * quality_multiplier)))

def compute_shields(m):
    success = as_float(m, "success_rate", 0.0)
    appr = as_float(m, "approval_accuracy", 0.0)
    shields = (success * 80.0) + (appr * 20.0)
    return int(round(clamp(shields)))

def compute_psi_reach(m):
    tasks = as_int(m, "tasks_completed", 0)
    rch = safe_log2(tasks + 1) * 20.0
    return int(round(clamp(rch)))

def compute_warp(agent_id: str, m):
    warp = dict(m.get("warp") or {})

    # Default: quality gate for Warp too (optional). We do NOT zero it here; keep as-is until Phase 2.

    if agent_id in ("oracle", "archivist"):
        prevented = as_float(warp, "prevented_repeat_questions", 0.0)
        sev = as_float(warp, "severity_weight", 1.0)
        val = prevented * sev
        warp_out = {
            "formula": "prevented_repeat_questions_x_severity_weight",
            "prevented_repeat_questions": prevented,
            "severity_weight": sev,
        }
    elif agent_id == "synth":
        explicit_approval = as_float(warp, "explicit_approval", 0.0)
        reuse_30d = as_float(warp, "reuse_count_30d", 0.0)
        verifier_pass = as_float(warp, "verifier_pass", 0.0)
        val = (0.60 * explicit_approval) + (0.25 * reuse_30d) + (0.15 * verifier_pass)
        warp_out = {
            "formula": "0.60*explicit_approval + 0.25*reuse_count_30d + 0.15*verifier_pass",
            "explicit_approval": explicit_approval,
            "reuse_count_30d": reuse_30d,
            "verifier_pass": verifier_pass,
        }
    elif agent_id == "verifier":
        bugs = as_float(warp, "bugs_caught_pre_release_outside_expected", 0.0)
        sev = as_float(warp, "severity", 1.0)
        risk = as_float(warp, "unique_risk_areas_covered", 0.0)
        val = (bugs * sev) + risk
        warp_out = {
            "formula": "(bugs_caught_pre_release_outside_expected*severity) + unique_risk_areas_covered",
            "bugs_caught_pre_release_outside_expected": bugs,
            "severity": sev,
            "unique_risk_areas_covered": risk,
        }
    elif agent_id == "atlas":
        csr = as_float(warp, "change_success_rate", 0.0)
        slo = as_float(warp, "slo_compliance", 0.0)
        val = (csr * 60.0) + (slo * 40.0)
        warp_out = {
            "formula": "(change_success_rate*60) + (slo_compliance*40)",
            "change_success_rate": csr,
            "slo_compliance": slo,
        }
    elif agent_id == "sentinel":
        total = as_float(warp, "total_escalations", 0.0)
        real = as_float(warp, "validated_real_issues", 0.0)
        signal_ratio = (real / total) if total else as_float(warp, "signal_ratio", 0.0)
        val = signal_ratio * 100.0
        warp_out = {
            "formula": "signal_ratio*100 (placeholder until sentinel CRE is formally specified)",
            "total_escalations": total,
            "validated_real_issues": real,
            "signal_ratio": signal_ratio,
        }
    elif agent_id == "echo":
        orch = as_float(warp, "orchestration_score", 0.0)
        val = orch
        warp_out = {
            "formula": "orchestration_score (placeholder until echo CRE is formally specified)",
            "orchestration_score": orch,
        }
    elif agent_id == "nexus":
        eff = as_float(warp, "routing_efficiency", 0.0)
        # routing_efficiency may be 0..1; promote to 0..100 if so
        val = (eff * 100.0) if eff <= 1.0 else eff
        warp_out = {
            "formula": "routing_efficiency*100 (placeholder until nexus CRE is formally specified)",
            "routing_efficiency": eff,
        }
    else:
        val = 0.0
        warp_out = {"formula": "unassigned", "note": "No Warp Tech formula defined for this agent_id"}

    return int(round(clamp(val))), warp_out

# --- DB work ---
con = sqlite3.connect(DB_PATH)
con.execute("PRAGMA foreign_keys = ON;")
cur = con.cursor()

# Quick schema sanity
required_tables = {"psionic_stats", "psionic_ranks", "missions"}
rows = cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
existing = {r[0] for r in rows}
missing = sorted(required_tables - existing)
if missing:
    raise SystemExit(f"Missing required tables in DB {DB_PATH}: {missing} (run init-rpg-database.sh)")

summary = []

for agent_id in agent_ids:
    m = load_metrics(agent_id)

    # Normalize field names to match DB raw input columns
    memory_count = as_int(m, "memory_count", 0)
    unique_domains = as_int(m, "domains", as_int(m, "unique_domains", 0))
    canonical_edits = as_int(m, "edits", as_int(m, "canonical_edits", 0))
    p95_latency_s = as_float(m, "p95_latency_s", as_float(m, "latency", 25.0))
    mttr_minutes = as_float(m, "mttr_minutes", as_float(m, "mttr", 25.0))
    acceptance_rate = as_float(m, "acceptance_rate", 0.0)
    success_rate = as_float(m, "success_rate", 0.0)
    approval_accuracy = as_float(m, "approval_accuracy", 0.0)
    tasks_completed = as_int(m, "tasks_completed", 0)

    wis = compute_wis(m)
    spd = compute_energy(m)
    tru = compute_shields(m)
    rch = compute_psi_reach(m)
    cre, warp_inputs = compute_warp(agent_id, m)

    # Persist warp tech inputs (auditability requirement)
    warp_blob = {
        "agent_id": agent_id,
        "snapshot_date": SNAPSHOT_DATE,
        "warp_inputs": warp_inputs,
        "sources": m.get("_sources", {}),
    }
    warp_tech_inputs = json.dumps(warp_blob, ensure_ascii=False, sort_keys=True)

    # UPSERT into psionic_stats
    cur.execute(
        """
        INSERT INTO psionic_stats (
          agent_id, snapshot_date,
          psionic_mastery, energy, shields, warp_technology, psi_reach,
          memory_count, unique_domains, canonical_edits,
          p95_latency_s, mttr_minutes, acceptance_rate,
          success_rate, approval_accuracy, tasks_completed,
          warp_tech_inputs
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(agent_id, snapshot_date) DO UPDATE SET
          psionic_mastery=excluded.psionic_mastery,
          energy=excluded.energy,
          shields=excluded.shields,
          warp_technology=excluded.warp_technology,
          psi_reach=excluded.psi_reach,
          memory_count=excluded.memory_count,
          unique_domains=excluded.unique_domains,
          canonical_edits=excluded.canonical_edits,
          p95_latency_s=excluded.p95_latency_s,
          mttr_minutes=excluded.mttr_minutes,
          acceptance_rate=excluded.acceptance_rate,
          success_rate=excluded.success_rate,
          approval_accuracy=excluded.approval_accuracy,
          tasks_completed=excluded.tasks_completed,
          warp_tech_inputs=excluded.warp_tech_inputs,
          calculated_at=CURRENT_TIMESTAMP
        """,
        (
            agent_id, SNAPSHOT_DATE,
            wis, spd, tru, cre, rch,
            memory_count, unique_domains, canonical_edits,
            p95_latency_s, mttr_minutes, acceptance_rate,
            success_rate, approval_accuracy, tasks_completed,
            warp_tech_inputs,
        ),
    )

    # Rank/XP update
    missions_completed = cur.execute(
        "SELECT COUNT(*) FROM missions WHERE agent_id=? AND status='completed'",
        (agent_id,),
    ).fetchone()[0]

    xp_from_memory = int(max(0, memory_count))
    xp_from_missions = int(max(0, missions_completed) * 3)
    xp = xp_from_memory + xp_from_missions

    rank = min(15, int(math.floor(safe_log2(memory_count + missions_completed * 3 + 1))) + 1)
    next_rank_at = None if rank >= 15 else int(2 ** (rank - 1))

    cur.execute(
        """
        INSERT INTO psionic_ranks (
          agent_id, rank, xp, xp_from_memory, xp_from_missions, next_rank_at,
          updated_at, rank_achieved_at
        ) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(agent_id) DO UPDATE SET
          rank=excluded.rank,
          xp=excluded.xp,
          xp_from_memory=excluded.xp_from_memory,
          xp_from_missions=excluded.xp_from_missions,
          next_rank_at=excluded.next_rank_at,
          updated_at=CURRENT_TIMESTAMP,
          rank_achieved_at=CASE
            WHEN excluded.rank > psionic_ranks.rank THEN CURRENT_TIMESTAMP
            ELSE psionic_ranks.rank_achieved_at
          END
        """,
        (agent_id, rank, xp, xp_from_memory, xp_from_missions, next_rank_at),
    )

    summary.append((agent_id, wis, spd, tru, cre, rch, rank, xp, missions_completed))

con.commit()

# Print a compact summary for logs
print("\n".join(
    f"{a}: WIS={wis:3d} SPD={spd:3d} TRU={tru:3d} CRE={cre:3d} RCH={rch:3d} | rank={rank:2d} xp={xp:4d} missions={mc}"
    for (a, wis, spd, tru, cre, rch, rank, xp, mc) in summary
))
PY

log "✅ psionic_stats + psionic_ranks updated for snapshot_date=$SNAPSHOT_DATE"

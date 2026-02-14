#!/usr/bin/env bash
set -euo pipefail

# VentureOS RPG — Psionic Rank Update
#
# Recomputes and UPSERTs `psionic_ranks` for all agents based on:
#   rank = min(15, floor(log2(memory_count + missions*3 + 1)) + 1)
#
# Sources for memory_count (priority order):
#   1) Latest `psionic_stats.memory_count` for that agent
#   2) Per-agent metrics JSON: ~/clawd/runtime/rpg-metrics/<agent_id>.json
#   3) Optional per-agent memory dir count: ~/clawd/memory/agents/<agent_id>/*
#   4) Built-in bootstrap defaults (0)
#
# Missions count is derived from DB:
#   SELECT COUNT(*) FROM missions WHERE status='completed'
#
# Usage:
#   ./update-psionic-ranks.sh [db_path]

umask 022

DB_PATH="${1:-$HOME/clawd/agents/ventureos-rpg.db}"
OVERLAYS_DIR="${OVERLAYS_DIR:-$HOME/clawd/agents/tactical-overlays}"
METRICS_DIR="${METRICS_DIR:-$HOME/clawd/runtime/rpg-metrics}"

log() { printf "[%s] %s\n" "$(date +%F' '%T)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

command -v python3 >/dev/null 2>&1 || die "python3 not found"
[[ -d "$OVERLAYS_DIR" ]] || die "OVERLAYS_DIR not found: $OVERLAYS_DIR"
[[ -f "$DB_PATH" ]] || die "DB not found: $DB_PATH"
mkdir -p "$METRICS_DIR" || true

log "Updating psionic ranks"
log "DB_PATH=$DB_PATH"

python3 - "$DB_PATH" "$OVERLAYS_DIR" "$METRICS_DIR" <<'PY'
import glob
import json
import math
import os
import sqlite3
import sys

DB_PATH, OVERLAYS_DIR, METRICS_DIR = sys.argv[1:4]
HOME = os.path.expanduser('~')

def safe_log2(n: float) -> float:
    return math.log2(max(1.0, float(n)))

def as_int(d, k, default=0):
    try:
        v = d.get(k, default)
        if v is None:
            return int(default)
        return int(v)
    except Exception:
        return int(default)

# Agents from overlays
agent_ids = []
for p in sorted(glob.glob(os.path.join(OVERLAYS_DIR, '*.json'))):
    with open(p, 'r', encoding='utf-8') as f:
        data = json.load(f)
    if data.get('agent_id'):
        agent_ids.append(data['agent_id'])
agent_ids = sorted(set(agent_ids))
if not agent_ids:
    raise SystemExit(f"No agents found in overlays dir: {OVERLAYS_DIR}")

con = sqlite3.connect(DB_PATH)
con.execute("PRAGMA foreign_keys=ON;")
cur = con.cursor()

summary=[]

for agent_id in agent_ids:
    # 1) latest psionic_stats.memory_count
    row = cur.execute(
        "SELECT memory_count FROM psionic_stats WHERE agent_id=? ORDER BY snapshot_date DESC LIMIT 1",
        (agent_id,),
    ).fetchone()
    memory_count = int(row[0]) if row and row[0] is not None else None

    # 2) metrics file
    if memory_count is None:
        metrics_path = os.path.join(METRICS_DIR, f"{agent_id}.json")
        if os.path.exists(metrics_path):
            try:
                with open(metrics_path, 'r', encoding='utf-8') as f:
                    j = json.load(f) or {}
                memory_count = as_int(j, 'memory_count', None)
            except Exception:
                pass

    # 3) memory dir count
    if memory_count is None:
        mem_dir = os.path.join(HOME, 'clawd', 'memory', 'agents', agent_id)
        if os.path.isdir(mem_dir):
            cnt = 0
            for root, _, files in os.walk(mem_dir):
                for fn in files:
                    if fn.startswith('.'):
                        continue
                    cnt += 1
            memory_count = cnt

    # 4) default
    if memory_count is None:
        memory_count = 0

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

    summary.append((agent_id, rank, xp, memory_count, missions_completed))

con.commit()

print("\n".join(
    f"{a}: rank={r:2d} xp={xp:4d} (memory={mc}, missions={ms})"
    for (a, r, xp, mc, ms) in summary
))
PY

log "✅ psionic_ranks updated"

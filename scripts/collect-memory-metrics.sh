#!/usr/bin/env bash
set -euo pipefail

# Collect per-agent memory metrics.
#
# Sources (best-effort, in priority order):
# - ~/.openclaw/memory/<agent>.sqlite (if present, non-empty)
# - ~/.openclaw/workspace-<agent>/memory/** (filesystem)
# - ~/.openclaw/workspace-<agent>/shared-context/** (canonical edits proxy via mtimes)
#
# Output:
# - Writes JSON to: $OUT (default: ~/clawd/runtime/rpg-metrics/_collected/memory-metrics.json)
#
# Env:
#   LOOKBACK_DAYS  default: 30
#   OUT            override output path

LOOKBACK_DAYS="${LOOKBACK_DAYS:-30}"
OUT="${OUT:-$HOME/clawd/runtime/rpg-metrics/_collected/memory-metrics.json}"

command -v python3 >/dev/null 2>&1 || { echo "python3 not found" >&2; exit 1; }

mkdir -p "$(dirname "$OUT")"

python3 - "$LOOKBACK_DAYS" "$OUT" <<'PY'
import json, os, sys, sqlite3
from datetime import datetime, timedelta
from pathlib import Path

LOOKBACK_DAYS = int(sys.argv[1])
OUT = Path(sys.argv[2])

HOME = Path.home()
OPENCLAW = HOME / ".openclaw"

AGENTS = ["oracle","atlas","sentinel","verifier","archivist","synth","echo","nexus"]

EXCLUDE_FILES = {"heartbeat-state.json", "upgrade-queue.json"}


def memory_from_sqlite(agent_id: str):
    db = OPENCLAW / "memory" / f"{agent_id}.sqlite"
    if not db.exists():
        return None
    try:
        con = sqlite3.connect(str(db))
        cur = con.cursor()
        cur.execute("SELECT COUNT(*) FROM files WHERE path LIKE 'memory/%'")
        cnt = int(cur.fetchone()[0])
        if cnt <= 0:
            return None
        cur.execute("SELECT path FROM files WHERE path LIKE 'memory/%'")
        paths = [r[0] for r in cur.fetchall()]
        con.close()

        domains = set()
        for p in paths:
            rel = p[len("memory/"):] if p.startswith("memory/") else p
            if "/" in rel:
                domains.add(rel.split("/",1)[0])
            else:
                domains.add("daily")

        return {
            "memory_count": cnt,
            "unique_domains": len(domains),
            "_debug": {"sqlite": str(db), "mode": "sqlite", "domains": sorted(domains)[:50]},
        }
    except Exception:
        return None


def memory_from_fs(agent_id: str):
    mem_dir = OPENCLAW / f"workspace-{agent_id}" / "memory"
    if not mem_dir.exists():
        return {"memory_count": 0, "unique_domains": 0, "_debug": {"mode": "missing"}}

    domains = set()
    count = 0
    for p in mem_dir.rglob("*"):
        if not p.is_file():
            continue
        if p.name.startswith("."):
            continue
        if p.name in EXCLUDE_FILES:
            continue
        count += 1
        rel = p.relative_to(mem_dir).as_posix()
        if "/" in rel:
            domains.add(rel.split("/",1)[0])
        else:
            domains.add("daily")

    return {
        "memory_count": int(count),
        "unique_domains": int(len(domains)),
        "_debug": {"memory_dir": str(mem_dir), "mode": "filesystem", "domains": sorted(domains)[:50]},
    }


def canonical_edits_proxy(agent_id: str):
    # Proxy: count of shared-context files in the agent workspace touched recently.
    # This is NOT perfect attribution; it measures agent-workspace canonical doc activity.
    sc_dir = OPENCLAW / f"workspace-{agent_id}" / "shared-context"
    if not sc_dir.exists():
        return {"canonical_edits": 0, "_debug": {"shared_context_dir": str(sc_dir), "mode": "missing"}}

    cutoff = datetime.now().astimezone() - timedelta(days=LOOKBACK_DAYS)
    touched = []
    for p in sc_dir.rglob("*"):
        if not p.is_file():
            continue
        if p.name.startswith("."):
            continue
        # focus on RPG canonical docs
        if not (p.name.startswith("rpg-") and p.suffix.lower() == ".md"):
            continue
        try:
            mtime = datetime.fromtimestamp(p.stat().st_mtime).astimezone()
        except Exception:
            continue
        if mtime >= cutoff:
            touched.append(p)

    return {
        "canonical_edits": int(len(touched)),
        "_debug": {
            "shared_context_dir": str(sc_dir),
            "mode": "mtime_proxy",
            "cutoff": cutoff.isoformat(timespec="seconds"),
            "touched_files": [str(p) for p in sorted(touched)[:50]],
        },
    }


out = {}
for aid in AGENTS:
    base = memory_from_sqlite(aid) or memory_from_fs(aid)
    canon = canonical_edits_proxy(aid)

    out[aid] = {
        "memory_count": int(base.get("memory_count", 0)),
        "unique_domains": int(base.get("unique_domains", 0)),
        "canonical_edits": int(canon.get("canonical_edits", 0)),
        "_debug": {"memory": base.get("_debug", {}), "canonical": canon.get("_debug", {})},
    }

payload = {
    "collected_at": datetime.now().astimezone().isoformat(timespec="seconds"),
    "lookback_days": LOOKBACK_DAYS,
    "agents": out,
}

OUT.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(str(OUT))
PY
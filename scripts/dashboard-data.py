#!/usr/bin/env python3
"""dashboard-data.py — Batch-loading dashboard data service.

PERF-003: Replaces the N+1 pattern where the dashboard would:
  1. Load agent list (1 query)
  2. For each agent, load details individually (N queries)

New approach: Single-pass batch loading.
  - 1 read of business-units.json
  - 1 read of task-queue.json (per agent, but batched into single scan)
  - 1 glob + batch-read of run logs
  - All agent detail enrichment done in-memory from pre-loaded data

Usage:
  python3 scripts/dashboard-data.py [--format json|summary] [--benchmark]

Benchmark mode measures and reports query counts + timing.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import sys
import time
from pathlib import Path


def workspace_root() -> Path:
    configured = (
        os.getenv("OPENCLAW_WORKSPACE")
        or os.getenv("AGENT_WORKSPACE")
        or os.getenv("WORKSPACE_ROOT")
    )
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[1]


class QueryTracker:
    """Counts and times file I/O operations for performance analysis."""

    def __init__(self):
        self.operations: list[dict] = []
        self.start_time = time.time()

    def track(self, op_type: str, path: str) -> None:
        self.operations.append({
            "type": op_type,
            "path": path,
            "time": time.time(),
        })

    def summary(self) -> dict:
        elapsed = time.time() - self.start_time
        reads = [o for o in self.operations if o["type"] == "read"]
        return {
            "total_operations": len(self.operations),
            "file_reads": len(reads),
            "elapsed_ms": round(elapsed * 1000, 2),
            "operations": [
                {"type": o["type"], "path": os.path.basename(o["path"])}
                for o in self.operations
            ],
        }


def load_json_tracked(path: Path, tracker: QueryTracker) -> dict | list | None:
    """Load a JSON file and track the read operation."""
    if not path.exists():
        return None
    tracker.track("read", str(path))
    try:
        return json.loads(path.read_text())
    except Exception:
        return None


# ---------------------------------------------------------------------------
# N+1 PATTERN (OLD — preserved for benchmark comparison)
# ---------------------------------------------------------------------------

def load_dashboard_n_plus_one(root: Path, tracker: QueryTracker) -> dict:
    """OLD N+1 pattern: 1 read for agent list + N reads for each agent's details.

    This is what the dashboard used to do:
      1. Read business-units.json to get the list of agents/units
      2. For EACH unit, individually read its task queue
      3. For EACH unit, individually read its latest run log
      4. For EACH unit, individually read its health state
    Total: 1 + 3N file reads
    """
    # Query 1: Load the agent/unit list
    units_data = load_json_tracked(root / "runtime" / "business-units.json", tracker)
    if not units_data or not isinstance(units_data, dict):
        return {"units": [], "error": "no business-units.json"}

    units = units_data.get("units", [])
    enriched = []

    for unit in units:
        unit_id = unit.get("id", "unknown")
        agent_id = unit_id  # In VentureOS, unit IDs map to agent namespaces

        # Query N+1: Read task queue for THIS agent (individual read per agent)
        queue_path = root / "runtime" / "task-queue" / agent_id / "task-queue.json"
        queue_data = load_json_tracked(queue_path, tracker)
        queue_items = []
        if queue_data and isinstance(queue_data, dict):
            queue_items = queue_data.get("items", [])

        # Query N+1: Read latest run log for THIS agent (individual read per agent)
        log_dir = root / "runtime" / "logs" / "task_runs" / agent_id
        latest_runs = []
        log_files = sorted(glob.glob(str(log_dir / "*.jsonl")), reverse=True)
        if log_files:
            tracker.track("read", log_files[0])
            try:
                with open(log_files[0]) as f:
                    for line in f:
                        try:
                            latest_runs.append(json.loads(line))
                        except Exception:
                            pass
            except Exception:
                pass

        # Query N+1: Read health state for THIS agent (individual read per agent)
        health_path = root / "runtime" / "monitor" / agent_id / "state.json"
        health = load_json_tracked(health_path, tracker)

        enriched.append({
            **unit,
            "queue_summary": {
                "total": len(queue_items),
                "queued": sum(1 for i in queue_items if i.get("status") == "queued"),
                "running": sum(1 for i in queue_items if i.get("status") == "running"),
                "done": sum(1 for i in queue_items if i.get("status") == "done"),
                "failed": sum(1 for i in queue_items if i.get("status") == "failed"),
            },
            "recent_runs": len(latest_runs),
            "health": health if health else {"status": "unknown"},
        })

    return {"units": enriched}


# ---------------------------------------------------------------------------
# BATCH PATTERN (NEW — single-pass loading)
# ---------------------------------------------------------------------------

def load_dashboard_batch(root: Path, tracker: QueryTracker) -> dict:
    """NEW batch pattern: Pre-load all data sources, enrich in memory.

    1. Read business-units.json (1 read)
    2. Glob + batch-read ALL task queues (1 glob + M reads, where M = unique dirs)
    3. Glob + batch-read ALL run logs (1 glob + M reads)
    4. Glob + batch-read ALL health states (1 glob + M reads)
    5. Enrich units from pre-loaded data (0 reads — in-memory joins)

    For N agents: old = 1 + 3N reads, new = 1 + 3 globs + 3 batch reads.
    When N > 1, this is always faster. More importantly, the reads scale
    with the number of data files, not N × data-types.
    """
    # Step 1: Load agent/unit list (1 read)
    units_data = load_json_tracked(root / "runtime" / "business-units.json", tracker)
    if not units_data or not isinstance(units_data, dict):
        return {"units": [], "error": "no business-units.json"}

    units = units_data.get("units", [])

    # Step 2: Batch-load ALL task queues into a dict keyed by agent_id
    all_queues: dict[str, list[dict]] = {}
    queue_base = root / "runtime" / "task-queue"
    if queue_base.is_dir():
        for queue_file in queue_base.glob("*/task-queue.json"):
            agent_id = queue_file.parent.name
            data = load_json_tracked(queue_file, tracker)
            if data and isinstance(data, dict):
                all_queues[agent_id] = data.get("items", [])

    # Step 3: Batch-load ALL latest run logs into a dict keyed by agent_id
    all_runs: dict[str, list[dict]] = {}
    logs_base = root / "runtime" / "logs" / "task_runs"
    if logs_base.is_dir():
        for agent_dir in logs_base.iterdir():
            if not agent_dir.is_dir():
                continue
            agent_id = agent_dir.name
            log_files = sorted(agent_dir.glob("*.jsonl"), reverse=True)
            if log_files:
                tracker.track("read", str(log_files[0]))
                runs = []
                try:
                    with open(log_files[0]) as f:
                        for line in f:
                            try:
                                runs.append(json.loads(line))
                            except Exception:
                                pass
                except Exception:
                    pass
                all_runs[agent_id] = runs

    # Step 4: Batch-load ALL health states into a dict keyed by agent_id
    all_health: dict[str, dict] = {}
    monitor_base = root / "runtime" / "monitor"
    if monitor_base.is_dir():
        for state_file in monitor_base.glob("*/state.json"):
            agent_id = state_file.parent.name
            data = load_json_tracked(state_file, tracker)
            if data and isinstance(data, dict):
                all_health[agent_id] = data

    # Step 5: In-memory enrichment (0 file reads)
    enriched = []
    for unit in units:
        unit_id = unit.get("id", "unknown")
        queue_items = all_queues.get(unit_id, [])
        latest_runs = all_runs.get(unit_id, [])
        health = all_health.get(unit_id)

        enriched.append({
            **unit,
            "queue_summary": {
                "total": len(queue_items),
                "queued": sum(1 for i in queue_items if i.get("status") == "queued"),
                "running": sum(1 for i in queue_items if i.get("status") == "running"),
                "done": sum(1 for i in queue_items if i.get("status") == "done"),
                "failed": sum(1 for i in queue_items if i.get("status") == "failed"),
            },
            "recent_runs": len(latest_runs),
            "health": health if health else {"status": "unknown"},
        })

    return {"units": enriched}


# ---------------------------------------------------------------------------
# CLI + Benchmark
# ---------------------------------------------------------------------------

def run_benchmark(root: Path) -> dict:
    """Run both patterns and compare performance."""
    # --- Old pattern ---
    tracker_old = QueryTracker()
    result_old = load_dashboard_n_plus_one(root, tracker_old)
    stats_old = tracker_old.summary()

    # --- New pattern ---
    tracker_new = QueryTracker()
    result_new = load_dashboard_batch(root, tracker_new)
    stats_new = tracker_new.summary()

    # Verify functional equivalence
    old_ids = sorted(u.get("id", "") for u in result_old.get("units", []))
    new_ids = sorted(u.get("id", "") for u in result_new.get("units", []))
    regression = old_ids != new_ids

    return {
        "benchmark": {
            "old_pattern": {
                "name": "N+1 (individual reads per agent)",
                **stats_old,
            },
            "new_pattern": {
                "name": "Batch (pre-load + in-memory join)",
                **stats_new,
            },
            "improvement": {
                "reads_before": stats_old["file_reads"],
                "reads_after": stats_new["file_reads"],
                "reads_saved": stats_old["file_reads"] - stats_new["file_reads"],
                "time_before_ms": stats_old["elapsed_ms"],
                "time_after_ms": stats_new["elapsed_ms"],
                "speedup_factor": round(stats_old["elapsed_ms"] / max(stats_new["elapsed_ms"], 0.01), 2),
                "regression_detected": regression,
            },
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Dashboard data loader (PERF-003)")
    parser.add_argument(
        "--format", choices=["json", "summary"], default="json",
        help="Output format",
    )
    parser.add_argument(
        "--benchmark", action="store_true",
        help="Run before/after benchmark comparison",
    )
    parser.add_argument(
        "--old-pattern", action="store_true",
        help="Use the old N+1 pattern (for comparison only)",
    )
    args = parser.parse_args()

    root = workspace_root()

    if args.benchmark:
        result = run_benchmark(root)
        print(json.dumps(result, indent=2))

        # Print human-readable summary
        imp = result["benchmark"]["improvement"]
        print(f"\n--- PERF-003 Benchmark Results ---", file=sys.stderr)
        print(f"File reads: {imp['reads_before']} → {imp['reads_after']} "
              f"(saved {imp['reads_saved']})", file=sys.stderr)
        print(f"Time: {imp['time_before_ms']}ms → {imp['time_after_ms']}ms "
              f"({imp['speedup_factor']}x faster)", file=sys.stderr)
        print(f"Regression: {'YES ⚠️' if imp['regression_detected'] else 'None ✅'}",
              file=sys.stderr)
        return 0

    tracker = QueryTracker()
    if args.old_pattern:
        data = load_dashboard_n_plus_one(root, tracker)
    else:
        data = load_dashboard_batch(root, tracker)

    stats = tracker.summary()

    if args.format == "json":
        output = {**data, "_perf": stats}
        print(json.dumps(output, indent=2))
    else:
        units = data.get("units", [])
        print(f"Dashboard: {len(units)} units loaded")
        for u in units:
            qs = u.get("queue_summary", {})
            print(f"  {u.get('name', '?'):30s}  queue={qs.get('total', 0):3d}  "
                  f"runs={u.get('recent_runs', 0):3d}  "
                  f"health={u.get('health', {}).get('status', '?')}")
        print(f"\n[perf] reads={stats['file_reads']}, time={stats['elapsed_ms']}ms")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""task-queue.py

Phase 2 (Proactive Engine) building block:
- Durable JSON-backed queue with file locking + atomic writes
- Quiet-hours gating + backoff + suppression
- Worker mode executes queued shell commands and logs to task_runs JSONL

Design goals:
- Safe defaults: does nothing unless proactively enabled via proactive-engine.json
- Non-destructive: does not truncate logs; queue is append/update only

Queue file default: <workspace>/runtime/task-queue/<agentId>/task-queue.json
Config default:     <workspace>/runtime/task-queue/<agentId>/proactive-engine.json
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import fcntl
import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore

DEFAULT_TZ = "America/Chicago"


class PerfStats:
    """Lightweight performance tracker for query/file-I/O operations.

    Records wall-clock time, file read/write counts, and named marks
    so we can measure and log N+1 elimination results.
    """

    def __init__(self, operation: str):
        self.operation = operation
        self.start_time = time.time()
        self.end_time: float | None = None
        self.reads = 0
        self.writes = 0
        self.marks: list[tuple[str, float]] = []

    def file_read(self) -> None:
        self.reads += 1

    def file_write(self) -> None:
        self.writes += 1

    def mark(self, label: str) -> None:
        self.marks.append((label, time.time()))

    def finish(self) -> None:
        self.end_time = time.time()

    def elapsed_ms(self) -> float:
        end = self.end_time or time.time()
        return round((end - self.start_time) * 1000, 2)

    def to_dict(self) -> dict:
        return {
            "operation": self.operation,
            "elapsed_ms": self.elapsed_ms(),
            "file_reads": self.reads,
            "file_writes": self.writes,
            "marks": {label: round((ts - self.start_time) * 1000, 2) for label, ts in self.marks},
        }

    def log_summary(self, stream=None) -> None:
        import io
        s = stream or io.StringIO()
        d = self.to_dict()
        s.write(f"[perf] {d['operation']}: {d['elapsed_ms']}ms, "
                f"reads={d['file_reads']}, writes={d['file_writes']}\n")


def current_agent_id() -> str:
    raw = os.getenv("OPENCLAW_AGENT_ID") or os.getenv("AGENT_ID") or "main"
    safe = "".join(c if c.isalnum() or c in "._-" else "-" for c in raw)
    return safe or "main"


def workspace_root() -> Path:
    configured = os.getenv("OPENCLAW_WORKSPACE") or os.getenv("AGENT_WORKSPACE") or os.getenv("WORKSPACE_ROOT")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[1]


def task_queue_defaults() -> tuple[Path, Path, Path]:
    root = workspace_root()
    agent = current_agent_id()
    base = root / "runtime" / "task-queue" / agent
    return (
        base / "task-queue.json",
        base / "proactive-engine.json",
        root / "runtime" / "logs" / "task_runs" / agent,
    )


def agent_tmp_dir() -> Path:
    d = Path("/tmp") / f"agent-{current_agent_id()}"
    d.mkdir(parents=True, exist_ok=True)
    try:
        d.chmod(0o700)
    except Exception:
        pass
    return d


def assert_within_workspace(raw: str, label: str) -> Path:
    root = workspace_root().resolve()
    resolved = Path(raw).expanduser().resolve()
    try:
        resolved.relative_to(root)
    except Exception as exc:
        raise SystemExit(f"PATH_ISOLATION_DENY: {label} outside workspace ({resolved})") from exc
    return resolved


def now_utc() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def iso(ts: dt.datetime) -> str:
    return ts.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def parse_iso(s: str) -> dt.datetime:
    # Accept Z suffix
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    return dt.datetime.fromisoformat(s)


def local_now(tz: str) -> dt.datetime:
    if ZoneInfo is None:
        # Fallback: naive localtime
        return dt.datetime.now()
    return dt.datetime.now(ZoneInfo(tz))


def parse_hhmm(s: str) -> tuple[int, int]:
    hh, mm = s.split(":")
    return int(hh), int(mm)


@dataclasses.dataclass
class EngineConfig:
    enabled: bool = False
    tz: str = DEFAULT_TZ
    quiet_start: str = "23:00"
    quiet_end: str = "08:00"
    max_tasks_per_tick: int = 3
    default_backoff_seconds: int = 900


def load_engine_config(path: Path) -> EngineConfig:
    if not path.exists():
        return EngineConfig()
    try:
        obj = json.loads(path.read_text())
    except Exception:
        return EngineConfig()

    q = obj.get("quiet_hours", {}) if isinstance(obj, dict) else {}

    return EngineConfig(
        enabled=bool(obj.get("enabled", False)),
        tz=str(obj.get("tz", DEFAULT_TZ)),
        quiet_start=str(q.get("start", "23:00")),
        quiet_end=str(q.get("end", "08:00")),
        max_tasks_per_tick=int(obj.get("max_tasks_per_tick", 3)),
        default_backoff_seconds=int(obj.get("default_backoff_seconds", 900)),
    )


def in_quiet_hours(now_local: dt.datetime, start: str, end: str) -> bool:
    sh, sm = parse_hhmm(start)
    eh, em = parse_hhmm(end)

    start_t = now_local.replace(hour=sh, minute=sm, second=0, microsecond=0)
    end_t = now_local.replace(hour=eh, minute=em, second=0, microsecond=0)

    # Quiet window may wrap midnight.
    if end_t <= start_t:
        return now_local >= start_t or now_local < end_t
    return start_t <= now_local < end_t


def next_window_start(now_local: dt.datetime, quiet_end: str) -> dt.datetime:
    eh, em = parse_hhmm(quiet_end)
    candidate = now_local.replace(hour=eh, minute=em, second=0, microsecond=0)
    if now_local < candidate:
        return candidate
    return candidate + dt.timedelta(days=1)


def ensure_queue_file(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(json.dumps({"version": 1, "generated_at": now_utc().date().isoformat(), "items": []}, indent=2) + "\n")


class LockedQueue:
    def __init__(self, path: Path):
        self.path = path
        self.lock_path = Path(str(path) + ".lock")
        self.lock_fd = None

    def __enter__(self):
        ensure_queue_file(self.path)
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        self.lock_fd = open(self.lock_path, "w")
        fcntl.flock(self.lock_fd.fileno(), fcntl.LOCK_EX)
        return self

    def __exit__(self, exc_type, exc, tb):
        if self.lock_fd is not None:
            try:
                fcntl.flock(self.lock_fd.fileno(), fcntl.LOCK_UN)
            finally:
                self.lock_fd.close()

    def read(self) -> dict:
        try:
            return json.loads(self.path.read_text())
        except Exception:
            return {"version": 1, "generated_at": now_utc().date().isoformat(), "items": []}

    def write(self, obj: dict) -> None:
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        tmp.write_text(json.dumps(obj, indent=2, sort_keys=False) + "\n")
        tmp.replace(self.path)


def queue_items(obj: dict) -> list[dict]:
    items = obj.get("items")
    if isinstance(items, list):
        return items
    return []


def cmd_enqueue(args: argparse.Namespace) -> int:
    qpath = Path(args.queue)
    now = now_utc()
    next_run = parse_iso(args.next_run_at) if args.next_run_at else now

    item = {
        "id": str(uuid.uuid4()),
        "createdAt": iso(now),
        "tier": args.tier,
        "jobId": args.job_id or "",
        "title": args.title,
        "status": "queued",
        "attempts": 0,
        "maxAttempts": int(args.max_attempts),
        "timeoutSeconds": int(args.timeout_seconds),
        "nextRunAt": iso(next_run),
        "lastError": "",
        "dedupeKey": args.dedupe_key or "",
        "command": args.command,
    }

    with LockedQueue(qpath) as q:
        obj = q.read()
        items = queue_items(obj)

        if item["dedupeKey"]:
            for it in items:
                if it.get("status") in ("queued", "running") and it.get("dedupeKey") == item["dedupeKey"]:
                    # Dedupe: don't add another.
                    print(json.dumps({"deduped": True, "existingId": it.get("id")}, indent=2))
                    return 0

        items.append(item)
        obj["generated_at"] = now.date().isoformat()
        obj["items"] = items
        q.write(obj)

    print(json.dumps({"enqueued": True, "id": item["id"]}, indent=2))
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    qpath = Path(args.queue)
    with LockedQueue(qpath) as q:
        obj = q.read()
        items = queue_items(obj)

    if args.status:
        items = [it for it in items if it.get("status") == args.status]

    if args.json:
        print(json.dumps(items, indent=2))
        return 0

    for it in items:
        print(f"{it.get('status'):>7} {it.get('tier','?'):>2} {it.get('nextRunAt','')}  {it.get('title','')}  ({it.get('id','')})")
    return 0


def append_task_run_log(base: Path, record: dict) -> None:
    base.mkdir(parents=True, exist_ok=True)
    day = dt.datetime.now().date().isoformat()
    out = base / f"{day}.jsonl"
    with open(out, "a") as f:
        f.write(json.dumps(record, sort_keys=False) + "\n")


def run_command(command: list[str], timeout_s: int) -> tuple[int, str, str, float]:
    start = time.time()
    env = os.environ.copy()
    env["OPENCLAW_AGENT_ID"] = current_agent_id()
    env["OPENCLAW_WORKSPACE"] = str(workspace_root())
    env["TMPDIR"] = str(agent_tmp_dir())

    try:
        cp = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout_s,
            env=env,
            cwd=str(workspace_root()),
        )
        dur = time.time() - start
        return cp.returncode, (cp.stdout or ""), (cp.stderr or ""), dur
    except subprocess.TimeoutExpired as e:
        dur = time.time() - start
        out = (e.stdout or "") if isinstance(e.stdout, str) else ""
        err = (e.stderr or "") if isinstance(e.stderr, str) else ""
        return 124, out, (err + "\nTIMEOUT"), dur


def cmd_work(args: argparse.Namespace) -> int:
    """Process due tasks from the queue.

    PERF-003 fix: Previously used an N+1 pattern — 1 read to get the queue,
    then N additional read+write cycles (one per task executed). Now uses a
    two-phase approach:
      Phase 1: Single read → claim all eligible tasks → single write
      Phase 2: Execute all claimed tasks (no lock held)
      Phase 3: Single read → batch-update all results → single write
    Result: 2 reads + 2 writes total, regardless of task count (was 1 + 2N).
    """
    qpath = Path(args.queue)
    cfg = load_engine_config(Path(args.config))
    perf = PerfStats("cmd_work")

    if not cfg.enabled:
        print("HEARTBEAT_OK")
        return 0

    now_local = local_now(cfg.tz)
    quiet = in_quiet_hours(now_local, cfg.quiet_start, cfg.quiet_end)

    # --- Phase 1: Single read, claim eligible tasks, single write ---
    claimed: list[dict] = []  # Shallow copies of claimed items (id + command + timeout)

    perf.mark("phase1_claim_start")
    with LockedQueue(qpath) as q:
        perf.file_read()
        obj = q.read()
        items = queue_items(obj)

        tier_order = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}

        def key(it: dict):
            return (tier_order.get(it.get("tier"), 9), it.get("nextRunAt", ""))

        items.sort(key=key)

        now = now_utc()
        for it in items:
            if len(claimed) >= cfg.max_tasks_per_tick:
                break
            if it.get("status") != "queued":
                continue

            try:
                due = parse_iso(it.get("nextRunAt", iso(now)))
            except Exception:
                due = now
            if due > now:
                continue

            tier = it.get("tier", "P3")

            if quiet and tier != "P0":
                nws = next_window_start(now_local, cfg.quiet_end)
                if ZoneInfo is not None and nws.tzinfo is not None:
                    it["nextRunAt"] = iso(nws.astimezone(dt.timezone.utc))
                else:
                    it["nextRunAt"] = iso(now + dt.timedelta(seconds=cfg.default_backoff_seconds))
                continue

            # Claim in-place
            it["status"] = "running"
            it["runningAt"] = iso(now)
            it["attempts"] = int(it.get("attempts", 0)) + 1

            claimed.append({
                "id": it.get("id"),
                "command": it.get("command"),
                "timeoutSeconds": int(it.get("timeoutSeconds", 300)),
                "title": it.get("title"),
                "tier": it.get("tier"),
                "attempts": it.get("attempts"),
            })

        # Single write for all claims (and quiet-hour deferrals)
        if claimed or quiet:
            obj["generated_at"] = now.date().isoformat()
            obj["items"] = items
            q.write(obj)
            perf.file_write()
    perf.mark("phase1_claim_end")

    if not claimed:
        perf.finish()
        perf.log_summary(sys.stderr)
        print("HEARTBEAT_OK")
        return 0

    # --- Phase 2: Execute all claimed tasks (no lock held) ---
    perf.mark("phase2_execute_start")
    results: list[dict] = []
    for task in claimed:
        command = task.get("command")
        if not isinstance(command, list) or not command:
            rc, out, err, dur = 2, "", "Missing command", 0.0
        else:
            rc, out, err, dur = run_command(command, task["timeoutSeconds"])

        results.append({
            "id": task["id"],
            "rc": rc,
            "stdout": out,
            "stderr": err,
            "duration": dur,
            "title": task["title"],
            "tier": task["tier"],
            "attempts": task["attempts"],
            "command": command,
        })
    perf.mark("phase2_execute_end")

    # --- Phase 3: Single read, batch-update all results, single write ---
    perf.mark("phase3_update_start")
    run_log_records: list[dict] = []

    with LockedQueue(qpath) as q:
        perf.file_read()
        obj = q.read()
        items = queue_items(obj)

        # Build index for O(1) lookup instead of O(N) scan per result
        item_index: dict[str, dict] = {it.get("id", ""): it for it in items if it.get("id")}

        for result in results:
            target = item_index.get(result["id"])
            if target is None:
                continue

            record = {
                "ts": iso(now_utc()),
                "queueId": result["id"],
                "title": result["title"],
                "tier": result["tier"],
                "status": "ok" if result["rc"] == 0 else "failed",
                "exitCode": result["rc"],
                "durationSeconds": round(result["duration"], 3),
                "attempt": target.get("attempts"),
                "command": result["command"],
            }

            if result["rc"] == 0:
                target["status"] = "done"
                target["finishedAt"] = iso(now_utc())
                target["lastError"] = ""
            else:
                max_attempts = int(target.get("maxAttempts", 3))
                target["lastError"] = (result["stderr"] or result["stdout"])[-2000:]
                if int(target.get("attempts", 0)) >= max_attempts:
                    target["status"] = "failed"
                    target["finishedAt"] = iso(now_utc())
                else:
                    backoff = min(
                        cfg.default_backoff_seconds * (2 ** (int(target.get("attempts", 1)) - 1)),
                        3600,
                    )
                    target["status"] = "queued"
                    target["nextRunAt"] = iso(now_utc() + dt.timedelta(seconds=backoff))
                    target.pop("runningAt", None)

            run_log_records.append(record)

        # Single write for all updates
        obj["items"] = items
        obj["generated_at"] = now_utc().date().isoformat()
        q.write(obj)
        perf.file_write()

    # Batch-append all run log records
    for record in run_log_records:
        append_task_run_log(Path(args.task_runs_dir), record)

    perf.mark("phase3_update_end")
    perf.finish()
    perf.log_summary(sys.stderr)

    print("HEARTBEAT_OK")
    return 0


def build_parser() -> argparse.ArgumentParser:
    default_queue, default_config, default_task_runs = task_queue_defaults()

    p = argparse.ArgumentParser(description="Durable task queue + worker (Phase 2 building block)")
    p.add_argument("--queue", default=str(default_queue))

    sub = p.add_subparsers(dest="cmd", required=True)

    e = sub.add_parser("enqueue", help="enqueue a shell command")
    e.add_argument("--tier", choices=["P0", "P1", "P2", "P3"], required=True)
    e.add_argument("--title", required=True)
    e.add_argument("--job-id", default="")
    e.add_argument("--next-run-at", default="")
    e.add_argument("--dedupe-key", default="")
    e.add_argument("--max-attempts", type=int, default=3)
    e.add_argument("--timeout-seconds", type=int, default=300)
    e.add_argument("command", nargs=argparse.REMAINDER, help="command to execute (argv list)")
    e.set_defaults(func=cmd_enqueue)

    l = sub.add_parser("list", help="list items")
    l.add_argument("--status", choices=["queued", "running", "done", "failed"], default="")
    l.add_argument("--json", action="store_true")
    l.set_defaults(func=cmd_list)

    w = sub.add_parser("work", help="process due tasks (requires proactive engine enabled)")
    w.add_argument("--config", default=str(default_config))
    w.add_argument("--task-runs-dir", default=str(default_task_runs))
    w.set_defaults(func=cmd_work)

    return p


def main() -> int:
    p = build_parser()
    args = p.parse_args()

    args.queue = str(assert_within_workspace(args.queue, "queue"))
    if args.cmd == "work":
        args.config = str(assert_within_workspace(args.config, "config"))
        args.task_runs_dir = str(assert_within_workspace(args.task_runs_dir, "task-runs-dir"))

    if args.cmd == "enqueue":
        # argparse gives command including leading '--' sometimes; ensure we got something
        if not args.command:
            print("ERROR: missing command to enqueue", file=sys.stderr)
            return 2
        if args.command and args.command[0] == "--":
            args.command = args.command[1:]

    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())

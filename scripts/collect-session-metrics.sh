#!/usr/bin/env bash
set -euo pipefail

# Collect per-agent session metrics.
#
# Sources (best-effort):
# 1) OpenClaw agent session logs:
#    ~/.openclaw/agents/<agent_id>/sessions/*.jsonl
#    - p95 response latency (user -> next assistant)
#    - tasks_completed (assistant turns)
#    - success_rate (assistant turns without obvious stop/error)
#    - acceptance_rate (proxy: assistant turns without obvious failure language)
#
# 2) OpenClaw cron task run logs (for MTTR proxy + additional telemetry):
#    ~/.openclaw/cron/jobs.json (job_id -> agentId)
#    ~/clawd/runtime/logs/task_runs/YYYY-MM-DD.jsonl
#
# Output:
# - Writes JSON to: $OUT (default: ~/clawd/runtime/rpg-metrics/_collected/session-metrics.json)
#
# Env:
#   LOOKBACK_DAYS  default: 7
#   OUT            override output path

LOOKBACK_DAYS="${LOOKBACK_DAYS:-7}"
OUT="${OUT:-$HOME/clawd/runtime/rpg-metrics/_collected/session-metrics.json}"

command -v python3 >/dev/null 2>&1 || { echo "python3 not found" >&2; exit 1; }

mkdir -p "$(dirname "$OUT")"

python3 - "$LOOKBACK_DAYS" "$OUT" <<'PY'
import json, os, re, sys, glob, sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

LOOKBACK_DAYS = int(sys.argv[1])
OUT = Path(sys.argv[2])

HOME = Path.home()
OPENCLAW = HOME / ".openclaw"

AGENTS = ["oracle","atlas","sentinel","verifier","archivist","synth","echo","nexus"]

JOBS_JSON = OPENCLAW / "cron" / "jobs.json"
TASK_RUNS_DIR = HOME / "clawd" / "runtime" / "logs" / "task_runs"
AGENT_SESSIONS_DIR = OPENCLAW / "agents"

FAIL_WORDS_RE = re.compile(r"\b(failed|error|exception|traceback|timed\s*out|timeout|econnrefused|refused\s+the\s+connection|not\s+found|could\s+not|can't|cannot)\b", re.I)


def pctl(xs, p):
    if not xs:
        return None
    xs = sorted(xs)
    if len(xs) == 1:
        return float(xs[0])
    k = (len(xs) - 1) * (p / 100.0)
    f = int(k)
    c = min(f + 1, len(xs) - 1)
    if f == c:
        return float(xs[f])
    d0 = xs[f] * (c - k)
    d1 = xs[c] * (k - f)
    return float(d0 + d1)


def parse_jsonl(path: Path):
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except Exception:
                continue


def parse_ts_iso(ts: str):
    # timestamps look like: 2026-02-14T07:08:43.214Z
    if not ts:
        return None
    try:
        if ts.endswith("Z"):
            ts = ts[:-1] + "+00:00"
        return datetime.fromisoformat(ts)
    except Exception:
        return None


def as_text_from_message(msg_obj: dict) -> str:
    # Session event contains: {message:{role, content:[{type,text|thinking}, ...]}}
    try:
        parts = []
        for c in (msg_obj.get("content") or []):
            if not isinstance(c, dict):
                continue
            if c.get("type") in ("text","thinking"):
                t = c.get("text") if c.get("type") == "text" else c.get("thinking")
                if t:
                    parts.append(str(t))
        return "\n".join(parts)
    except Exception:
        return ""


def session_metrics():
    cutoff = datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)
    out = {aid: {"_latencies_s": [], "_assistant": 0, "_assistant_success": 0, "_assistant_clean": 0, "_session_files": 0} for aid in AGENTS}

    for aid in AGENTS:
        sdir = AGENT_SESSIONS_DIR / aid / "sessions"
        if not sdir.exists():
            continue
        # include non-deleted jsonl only
        paths = sorted([p for p in sdir.glob("*.jsonl") if ".deleted." not in p.name])
        for p in paths:
            out[aid]["_session_files"] += 1
            last_user_ts = None
            for rec in parse_jsonl(p):
                if rec.get("type") != "message":
                    continue
                ts = parse_ts_iso(rec.get("timestamp"))
                if not ts or ts < cutoff:
                    continue

                msg = rec.get("message") or {}
                role = msg.get("role")
                if role == "user":
                    last_user_ts = ts
                    continue

                if role == "assistant":
                    out[aid]["_assistant"] += 1

                    # success proxy
                    stop_reason = str(rec.get("stopReason") or "").lower()
                    ok = stop_reason not in ("error","tool_error","content_filter")
                    if ok:
                        out[aid]["_assistant_success"] += 1

                    # acceptance/clean proxy: no obvious failure language
                    text = as_text_from_message(msg)
                    clean = ok and (not FAIL_WORDS_RE.search(text))
                    if clean:
                        out[aid]["_assistant_clean"] += 1

                    # latency: user -> next assistant
                    if last_user_ts is not None:
                        dt = (ts - last_user_ts).total_seconds()
                        if dt >= 0:
                            out[aid]["_latencies_s"].append(dt)
                        last_user_ts = None

    return out


def cron_mttr_proxy():
    # MTTR proxy from clawd task_runs, mapped through jobs.json.
    if not JOBS_JSON.exists() or not TASK_RUNS_DIR.exists():
        return {}

    jobs = json.loads(JOBS_JSON.read_text(encoding="utf-8"))
    job_to_agent = {str(j.get("id")): str(j.get("agentId")) for j in jobs.get("jobs", []) if j.get("id") and j.get("agentId")}

    end = datetime.now()
    start = end - timedelta(days=LOOKBACK_DAYS)

    paths = []
    for p in sorted(TASK_RUNS_DIR.glob("*.jsonl")):
        try:
            d = datetime.strptime(p.name.replace(".jsonl", ""), "%Y-%m-%d")
        except Exception:
            continue
        if d.date() >= start.date() and d.date() <= end.date():
            paths.append(p)

    def is_ok_status(rec):
        return str(rec.get("status") or "").lower() == "ok"

    def is_clean_run(rec):
        if not is_ok_status(rec):
            return False
        notes = rec.get("notes")
        if not notes:
            return True
        s = str(notes)
        if FAIL_WORDS_RE.search(s):
            return False
        return True

    def ts_ms(rec):
        v = rec.get("timestamp")
        try:
            return int(v)
        except Exception:
            return None

    per_job_runs = {}
    for p in paths:
        for rec in parse_jsonl(p):
            if rec.get("action") != "finished":
                continue
            jid = rec.get("job_id")
            if not jid:
                continue
            jid = str(jid)
            aid = job_to_agent.get(jid)
            if not aid:
                continue
            t = ts_ms(rec)
            if t is None:
                continue
            clean = is_clean_run(rec)
            per_job_runs.setdefault(jid, []).append((t, aid, clean))

    recovery_by_agent_minutes = {}
    for jid, runs in per_job_runs.items():
        runs.sort(key=lambda x: x[0])
        last_bad_ts = None
        last_bad_agent = None
        for t, aid, clean in runs:
            if not clean:
                last_bad_ts = t
                last_bad_agent = aid
                continue
            if clean and last_bad_ts is not None:
                dt_min = max(0.0, (t - last_bad_ts) / 1000.0 / 60.0)
                recovery_by_agent_minutes.setdefault(last_bad_agent, []).append(dt_min)
                last_bad_ts = None
                last_bad_agent = None

    mttr = {}
    for aid, samples in recovery_by_agent_minutes.items():
        mttr[aid] = {
            "mttr_minutes": round(float(pctl(samples, 95) or 0.0), 3),
            "_mttr_samples": int(len(samples))
        }
    return mttr


sess = session_metrics()
mttr = cron_mttr_proxy()

out = {}
for aid in AGENTS:
    a = sess.get(aid, {})
    lat_p95 = pctl(a.get("_latencies_s") or [], 95)

    assistant = int(a.get("_assistant", 0))
    ok = int(a.get("_assistant_success", 0))
    clean = int(a.get("_assistant_clean", 0))

    success_rate = (ok / assistant) if assistant else 0.0
    acceptance_rate = (clean / ok) if ok else 0.0

    # For cron-heavy agents, tasks_completed here counts assistant turns (includes cron agent turns).
    base = {
        "p95_latency_s": round(float(lat_p95), 3) if lat_p95 is not None else None,
        "acceptance_rate": round(float(acceptance_rate), 4),
        "success_rate": round(float(success_rate), 4),
        # until we have a real approval log
        "approval_accuracy": round(float(acceptance_rate), 4),
        "tasks_completed": assistant,
        "mttr_minutes": 0.0,
        "_debug": {
            "lookback_days": LOOKBACK_DAYS,
            "session_files": int(a.get("_session_files", 0)),
            "assistant_turns": assistant,
            "assistant_turns_ok": ok,
            "assistant_turns_clean": clean,
            "latency_samples": int(len(a.get("_latencies_s") or [])),
        }
    }

    if aid in mttr:
        base["mttr_minutes"] = mttr[aid]["mttr_minutes"]
        base["_debug"]["mttr_samples"] = mttr[aid].get("_mttr_samples", 0)

    out[aid] = base

payload = {
    "collected_at": datetime.now().astimezone().isoformat(timespec="seconds"),
    "lookback_days": LOOKBACK_DAYS,
    "sources": {
        "agent_sessions_dir": str(AGENT_SESSIONS_DIR),
        "jobs_json": str(JOBS_JSON),
        "task_runs_dir": str(TASK_RUNS_DIR),
    },
    "agents": out,
}

OUT.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(str(OUT))
PY
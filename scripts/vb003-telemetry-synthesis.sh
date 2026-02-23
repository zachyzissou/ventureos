#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/agent-env.sh
source "$SCRIPT_DIR/lib/agent-env.sh"

AGENT_ID="$(agent_env_agent_id)"
WORKSPACE_ROOT="$(agent_env_workspace_root)"
TMPDIR="$(agent_env_tmp_dir)"
export TMPDIR

LOOKBACK_HOURS="${VB003_LOOKBACK_HOURS:-168}"
if ! [[ "$LOOKBACK_HOURS" =~ ^[0-9]+$ ]] || [[ "$LOOKBACK_HOURS" -lt 1 ]]; then
  echo "Invalid VB003_LOOKBACK_HOURS: $LOOKBACK_HOURS" >&2
  exit 2
fi

OUT_DIR="${VB003_REPORT_DIR:-$WORKSPACE_ROOT/runtime/reports/model-orchestration}"
RUNS_GLOB="${VB003_RUNS_GLOB:-$HOME/.openclaw/cron/runs/*.jsonl}"
CRON_RUN_DIR="${VB003_CRON_RUN_DIR:-$WORKSPACE_ROOT/runtime/logs/cron-runs}"
BUDGET_LOG="${VB003_BUDGET_LOG:-$HOME/.openclaw/logs/cron-budget.log}"

mkdir -p "$OUT_DIR"

python3 - <<'PY' "$OUT_DIR" "$LOOKBACK_HOURS" "$RUNS_GLOB" "$CRON_RUN_DIR" "$BUDGET_LOG" "$AGENT_ID" "$WORKSPACE_ROOT"
import glob
import json
import os
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone

out_dir = os.path.abspath(sys.argv[1])
lookback_hours = int(sys.argv[2])
runs_glob = sys.argv[3]
cron_run_dir = os.path.abspath(sys.argv[4])
budget_log_path = os.path.abspath(sys.argv[5])
agent_id = sys.argv[6]
workspace_root = os.path.abspath(sys.argv[7])

now = datetime.now(timezone.utc)
window_start = now.timestamp() - (lookback_hours * 3600)
window_start_ms = int(window_start * 1000)


def percentile(values, pct):
    if not values:
        return None
    values = sorted(values)
    idx = int((len(values) * pct) // 100)
    if idx >= len(values):
        idx = len(values) - 1
    return values[idx]


def parse_iso_z(ts):
    if not ts:
        return None
    try:
        return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def load_json_line(line):
    try:
        return json.loads(line)
    except json.JSONDecodeError:
        # Older cron-runner lines used Python-style booleans.
        patched = (
            line.replace(":True", ":true")
            .replace(":False", ":false")
            .replace(": None", ": null")
        )
        try:
            return json.loads(patched)
        except json.JSONDecodeError:
            return None


runs = []
durations = []
status_counts = Counter()
model_counts = Counter()
provider_counts = Counter()
usage_totals = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}

for path in glob.glob(runs_glob):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                rec = load_json_line(line)
                if rec is None:
                    continue
                if rec.get("action") != "finished":
                    continue
                run_ms = rec.get("runAtMs") or rec.get("ts")
                if not isinstance(run_ms, (int, float)) or run_ms < window_start_ms:
                    continue
                runs.append(rec)
                status_counts[str(rec.get("status", "unknown"))] += 1
                dur = rec.get("durationMs")
                if isinstance(dur, (int, float)):
                    durations.append(int(dur))
                model_counts[str(rec.get("model") or "unknown")] += 1
                provider_counts[str(rec.get("provider") or "unknown")] += 1
                usage = rec.get("usage") or {}
                for k in ("input_tokens", "output_tokens", "total_tokens"):
                    v = usage.get(k, 0)
                    if isinstance(v, (int, float)):
                        usage_totals[k] += int(v)
    except OSError:
        continue

run_times = []
for rec in runs:
    ms = rec.get("runAtMs") or rec.get("ts")
    if isinstance(ms, (int, float)):
        run_times.append(int(ms))

earliest_ms = min(run_times) if run_times else None
latest_ms = max(run_times) if run_times else None
coverage_hours = 0.0
if earliest_ms is not None and latest_ms is not None and latest_ms >= earliest_ms:
    coverage_hours = (latest_ms - earliest_ms) / 3_600_000

job_metrics = {}
for job in ("budget-check", "routing-healthcheck", "monitoring"):
    path = os.path.join(cron_run_dir, f"{job}.jsonl")
    metrics = {
        "starts": 0,
        "success": 0,
        "failure": 0,
        "first_utc": None,
        "last_utc": None,
    }
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    rec = load_json_line(line)
                    if rec is None:
                        continue
                    ts = parse_iso_z(rec.get("ts"))
                    if ts is None or ts.timestamp() < window_start:
                        continue
                    if metrics["first_utc"] is None:
                        metrics["first_utc"] = rec.get("ts")
                    metrics["last_utc"] = rec.get("ts")
                    event = rec.get("event")
                    if event == "start":
                        metrics["starts"] += 1
                    elif event == "success":
                        metrics["success"] += 1
                    elif event == "failure":
                        metrics["failure"] += 1
        except OSError:
            pass
    job_metrics[job] = metrics

latest_budget_snapshot = None
if os.path.exists(budget_log_path):
    try:
        with open(budget_log_path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                if "{" not in line:
                    continue
                payload = line[line.find("{") :]
                obj = load_json_line(payload)
                if obj is None:
                    continue
                if isinstance(obj, dict) and "providers" in obj:
                    latest_budget_snapshot = obj
    except OSError:
        pass

if latest_budget_snapshot is None:
    try:
        proc = subprocess.run(
            ["openclaw", "channels", "list", "--json"],
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            payload = load_json_line(proc.stdout)
            if isinstance(payload, dict):
                usage = payload.get("usage")
                if isinstance(usage, dict):
                    latest_budget_snapshot = {
                        "source": "openclaw.channels.list",
                        "capturedAt": usage.get("updatedAt"),
                        "providers": usage.get("providers", []),
                    }
    except OSError:
        pass

coverage_met = coverage_hours >= lookback_hours
if not runs:
    verification_state = "no_data"
elif not coverage_met:
    verification_state = "window_insufficient"
else:
    verification_state = "ready_for_closure_review"

report = {
    "generated_at_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
    "window": {
        "lookback_hours_target": lookback_hours,
        "coverage_hours_observed": round(coverage_hours, 3),
        "coverage_met": coverage_met,
        "start_utc": (
            datetime.fromtimestamp(earliest_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            if earliest_ms is not None
            else None
        ),
        "end_utc": (
            datetime.fromtimestamp(latest_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            if latest_ms is not None
            else None
        ),
    },
    "model_runtime": {
        "runs_total": len(runs),
        "status_counts": dict(status_counts),
        "duration_ms_p50": percentile(durations, 50),
        "duration_ms_p95": percentile(durations, 95),
        "usage_totals": usage_totals,
        "model_counts": dict(model_counts),
        "provider_counts": dict(provider_counts),
    },
    "job_runtime": job_metrics,
    "budget_snapshot_latest": latest_budget_snapshot,
    "verification_state": verification_state,
    "agent_id": agent_id,
    "workspace_root": workspace_root,
}

stamp = now.strftime("%Y%m%d-%H%M%SZ")
json_path = os.path.join(out_dir, f"vb003-telemetry-{stamp}.json")
md_path = os.path.join(out_dir, f"vb003-telemetry-{stamp}.md")
latest_json = os.path.join(out_dir, "vb003-telemetry-latest.json")
latest_md = os.path.join(out_dir, "vb003-telemetry-latest.md")

with open(json_path, "w", encoding="utf-8") as fh:
    json.dump(report, fh, indent=2)
    fh.write("\n")

budget_brief = "none"
if latest_budget_snapshot:
    providers = latest_budget_snapshot.get("providers") or []
    chunks = []
    for p in providers:
        name = p.get("displayName") or p.get("provider") or "provider"
        windows = p.get("windows") or []
        win = ", ".join(
            f"{w.get('label')}={w.get('usedPercent')}%" for w in windows if w.get("label") and w.get("usedPercent") is not None
        )
        chunks.append(f"{name} ({win})" if win else name)
    budget_brief = "; ".join(chunks) if chunks else "present"

status_counts_md = report["model_runtime"]["status_counts"]
ok_count = status_counts_md.get("ok", 0)
error_count = status_counts_md.get("error", 0)

md = f"""# VB-003 Telemetry Synthesis ({report['generated_at_utc']})

## Window
- Target: {lookback_hours}h
- Observed coverage: {report['window']['coverage_hours_observed']}h
- Start: {report['window']['start_utc']}
- End: {report['window']['end_utc']}
- Coverage met: {report['window']['coverage_met']}

## Model Runtime
- Runs: {report['model_runtime']['runs_total']} (ok={ok_count}, error={error_count})
- Duration: p50={report['model_runtime']['duration_ms_p50']}ms, p95={report['model_runtime']['duration_ms_p95']}ms
- Usage totals: input={usage_totals['input_tokens']}, output={usage_totals['output_tokens']}, total={usage_totals['total_tokens']}

## Job Runtime (window-scoped)
- budget-check: starts={job_metrics['budget-check']['starts']}, success={job_metrics['budget-check']['success']}, failure={job_metrics['budget-check']['failure']}
- routing-healthcheck: starts={job_metrics['routing-healthcheck']['starts']}, success={job_metrics['routing-healthcheck']['success']}, failure={job_metrics['routing-healthcheck']['failure']}
- monitoring: starts={job_metrics['monitoring']['starts']}, success={job_metrics['monitoring']['success']}, failure={job_metrics['monitoring']['failure']}

## Budget Snapshot
- Latest: {budget_brief}

## Verification State
- {verification_state}
"""

with open(md_path, "w", encoding="utf-8") as fh:
    fh.write(md)

for src, dst in ((json_path, latest_json), (md_path, latest_md)):
    with open(src, "r", encoding="utf-8") as rf, open(dst, "w", encoding="utf-8") as wf:
        wf.write(rf.read())

print(f"VB003_REPORT_JSON={json_path}")
print(f"VB003_REPORT_MD={md_path}")
print(f"VB003_REPORT_LATEST_JSON={latest_json}")
print(f"VB003_REPORT_LATEST_MD={latest_md}")
print(f"VB003_VERIFICATION_STATE={verification_state}")
PY

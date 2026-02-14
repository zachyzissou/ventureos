#!/usr/bin/env python3
"""Weekly Metrics Digest

Parses daily KPI snapshots under ~/clawd/shared-context/kpis/ and emits a concise
weekly summary (<=1500 chars) with regression flags.

Designed to be schema-tolerant: supports JSON/JSONL and simple text/markdown
snapshots (regex extraction).

Expected (preferred) JSON keys (any casing):
- timestamp / generated_at / date
- success_rate (0-100)
- p95_latency_ms (or p95_latency_s)
- cost_per_task_usd
- quota_percent
- backup_age_hours
- failures_by_type (obj) or top_failure_types (list)
- ok / status

Exit codes:
- 0: digest printed
- 2: no usable snapshots
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import json
import os
import re
import statistics
from collections import Counter
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore

TZ_NAME_DEFAULT = "America/Chicago"
MAX_CHARS_DEFAULT = 1500


@dataclasses.dataclass(frozen=True)
class Snapshot:
    ts: dt.datetime
    source: str
    success_rate: Optional[float] = None  # percent 0-100
    p95_latency_ms: Optional[float] = None
    cost_per_task_usd: Optional[float] = None
    quota_percent: Optional[float] = None
    backup_age_hours: Optional[float] = None
    ok: Optional[bool] = None
    failures_by_type: Dict[str, int] = dataclasses.field(default_factory=dict)

    @property
    def day(self) -> dt.date:
        return self.ts.date()


def _coerce_float(x: Any) -> Optional[float]:
    if x is None:
        return None
    if isinstance(x, (int, float)):
        return float(x)
    if isinstance(x, str):
        s = x.strip()
        if not s:
            return None
        s = s.replace(",", "")
        # strip trailing units
        s = re.sub(r"[%$]", "", s)
        m = re.match(r"^-?\d+(?:\.\d+)?$", s)
        if m:
            return float(s)
        m2 = re.match(r"^-?\d+(?:\.\d+)?", s)
        if m2:
            return float(m2.group(0))
    return None


def _coerce_int(x: Any) -> Optional[int]:
    f = _coerce_float(x)
    if f is None:
        return None
    try:
        return int(round(f))
    except Exception:
        return None


def _parse_timestamp(obj: Any, *, fallback_mtime: Optional[float], tz: dt.tzinfo) -> Optional[dt.datetime]:
    # Common JSON timestamp shapes.
    candidates = []
    if isinstance(obj, dict):
        for k in ["timestamp", "ts", "time", "generated_at", "generatedAt", "created_at", "createdAt", "date"]:
            if k in obj and obj[k]:
                candidates.append(obj[k])
    for c in candidates:
        if isinstance(c, (int, float)):
            # heuristics: seconds vs ms
            v = float(c)
            if v > 1e12:
                v /= 1000.0
            try:
                return dt.datetime.fromtimestamp(v, tz=tz)
            except Exception:
                pass
        if isinstance(c, str):
            s = c.strip()
            # accept YYYY-MM-DD
            if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
                try:
                    d = dt.date.fromisoformat(s)
                    return dt.datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=tz)
                except Exception:
                    pass
            # try ISO
            try:
                z = s.replace("Z", "+00:00")
                t = dt.datetime.fromisoformat(z)
                if t.tzinfo is None:
                    t = t.replace(tzinfo=tz)
                else:
                    t = t.astimezone(tz)
                return t
            except Exception:
                pass
            # e.g. "2026-02-13 01:40 CST" -> ignore tz abbrev, assume local tz
            m = re.match(r"^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?", s)
            if m:
                try:
                    d = dt.date.fromisoformat(m.group(1))
                    hh, mm = map(int, m.group(2).split(":"))
                    return dt.datetime(d.year, d.month, d.day, hh, mm, 0, tzinfo=tz)
                except Exception:
                    pass

    if fallback_mtime is not None:
        try:
            return dt.datetime.fromtimestamp(float(fallback_mtime), tz=tz)
        except Exception:
            return None
    return None


def _extract_failures_by_type(obj: Any) -> Dict[str, int]:
    out: Dict[str, int] = {}
    if isinstance(obj, dict):
        for k in ["failures_by_type", "failure_types", "top_failures", "top_failure_types"]:
            if k not in obj or obj[k] is None:
                continue
            v = obj[k]
            if isinstance(v, dict):
                for kk, vv in v.items():
                    n = _coerce_int(vv)
                    if n is not None and n > 0:
                        out[str(kk)] = n
            elif isinstance(v, list):
                # list of {type,count}
                for item in v:
                    if isinstance(item, dict):
                        t = item.get("type") or item.get("name") or item.get("failure")
                        c = item.get("count") or item.get("n") or item.get("value")
                        if t:
                            n = _coerce_int(c)
                            if n is not None and n > 0:
                                out[str(t)] = out.get(str(t), 0) + n
    return out


def _parse_json_records(text: str) -> List[Any]:
    text = text.strip()
    if not text:
        return []

    # Try full JSON first
    try:
        v = json.loads(text)
        if isinstance(v, list):
            return v
        return [v]
    except Exception:
        pass

    # JSONL/NDJSON
    records: List[Any] = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            records.append(json.loads(line))
        except Exception:
            # not JSONL
            return []
    return records


RE_SUCCESS = re.compile(r"(?i)(success[_ -]?rate)\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)\s*%?")
RE_P95 = re.compile(r"(?i)(p95(?:[_ -]?latency)?)\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)\s*(ms|s|sec|secs|seconds)?")
RE_COST = re.compile(r"(?i)(cost(?:[_ -]?per[_ -]?task)?)\s*[:=]\s*\$?([0-9]+(?:\.[0-9]+)?)")
RE_QUOTA = re.compile(r"(?i)(quota(?:[_ -]?(?:usage|percent|pct))?)\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)\s*%")
RE_BACKUP_AGE = re.compile(r"(?i)(backup(?:[_ -]?age)?)\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)\s*(h|hr|hrs|hour|hours|d|day|days)?")
RE_LAST_UPDATED = re.compile(r"(?i)last updated\s*[:=]\s*(.+)$")
RE_FAILURE_BULLET = re.compile(r"^\s*[-*]\s*([^:]{2,80})\s*:\s*(\d+)\s*$")


def _parse_text_snapshot(text: str, *, filename: str, mtime: Optional[float], tz: dt.tzinfo) -> Optional[Snapshot]:
    success = None
    p95_ms = None
    cost = None
    quota = None
    backup_age_h = None

    # Timestamp from a "Last updated:" line if present
    ts: Optional[dt.datetime] = None
    for line in text.splitlines()[:50]:
        m = RE_LAST_UPDATED.search(line)
        if m:
            ts = _parse_timestamp({"date": m.group(1).strip()}, fallback_mtime=mtime, tz=tz)
            break

    if ts is None:
        # From filename YYYY-MM-DD
        m = re.search(r"(\d{4}-\d{2}-\d{2})", filename)
        if m:
            ts = _parse_timestamp({"date": m.group(1)}, fallback_mtime=mtime, tz=tz)

    if ts is None:
        ts = _parse_timestamp({}, fallback_mtime=mtime, tz=tz)

    if ts is None:
        return None

    m = RE_SUCCESS.search(text)
    if m:
        success = _coerce_float(m.group(2))

    m = RE_P95.search(text)
    if m:
        v = _coerce_float(m.group(2))
        unit = (m.group(3) or "ms").lower()
        if v is not None:
            p95_ms = v * 1000.0 if unit.startswith("s") else v

    m = RE_COST.search(text)
    if m:
        cost = _coerce_float(m.group(2))

    m = RE_QUOTA.search(text)
    if m:
        quota = _coerce_float(m.group(2))

    m = RE_BACKUP_AGE.search(text)
    if m:
        v = _coerce_float(m.group(2))
        unit = (m.group(3) or "h").lower()
        if v is not None:
            if unit.startswith("d"):
                backup_age_h = v * 24.0
            else:
                backup_age_h = v

    failures: Dict[str, int] = {}
    # parse bullet list of failures (best-effort)
    for line in text.splitlines():
        mm = RE_FAILURE_BULLET.match(line)
        if not mm:
            continue
        label = mm.group(1).strip()
        count = int(mm.group(2))
        if count > 0 and not re.search(r"(?i)sentinel|verifier|archivist|oracle|atlas|synth|echo|nexus", label):
            failures[label] = failures.get(label, 0) + count

    if all(v is None for v in [success, p95_ms, cost, quota, backup_age_h]) and not failures:
        return None

    return Snapshot(
        ts=ts,
        source=filename,
        success_rate=success,
        p95_latency_ms=p95_ms,
        cost_per_task_usd=cost,
        quota_percent=quota,
        backup_age_hours=backup_age_h,
        failures_by_type=failures,
    )


def _parse_json_snapshot(obj: Any, *, source: str, mtime: Optional[float], tz: dt.tzinfo) -> Optional[Snapshot]:
    if not isinstance(obj, dict):
        return None

    ts = _parse_timestamp(obj, fallback_mtime=mtime, tz=tz)
    if ts is None:
        return None

    def pick(keys: Iterable[str]) -> Any:
        for k in keys:
            if k in obj and obj[k] is not None:
                return obj[k]
        return None

    success = _coerce_float(pick(["success_rate", "successRate", "success", "success_pct", "successPercent"]))
    # allow 0-1
    if success is not None and success <= 1.0:
        success *= 100.0

    p95_ms = _coerce_float(pick(["p95_latency_ms", "p95LatencyMs", "p95_ms", "latency_p95_ms"]))
    if p95_ms is None:
        p95_s = _coerce_float(pick(["p95_latency_s", "p95LatencyS", "p95_s"]))
        if p95_s is not None:
            p95_ms = p95_s * 1000.0

    cost = _coerce_float(pick(["cost_per_task_usd", "costPerTaskUsd", "cost", "cost_per_task"]))
    quota = _coerce_float(pick(["quota_percent", "quotaPercent", "quota", "quota_usage_percent"]))
    backup_age_h = _coerce_float(pick(["backup_age_hours", "backupAgeHours", "backup_age_h"]))

    ok_val = pick(["ok", "healthy", "status", "run_ok", "runOk"])  # status might be string
    ok: Optional[bool]
    if isinstance(ok_val, bool):
        ok = ok_val
    elif isinstance(ok_val, str):
        s = ok_val.strip().lower()
        if s in {"ok", "healthy", "success", "pass", "green"}:
            ok = True
        elif s in {"error", "fail", "failed", "red"}:
            ok = False
        else:
            ok = None
    else:
        ok = None

    failures = _extract_failures_by_type(obj)

    if all(v is None for v in [success, p95_ms, cost, quota, backup_age_h]) and not failures and ok is None:
        return None

    return Snapshot(
        ts=ts,
        source=source,
        success_rate=success,
        p95_latency_ms=p95_ms,
        cost_per_task_usd=cost,
        quota_percent=quota,
        backup_age_hours=backup_age_h,
        ok=ok,
        failures_by_type=failures,
    )


def load_snapshots(kpis_dir: Path, tz: dt.tzinfo) -> List[Snapshot]:
    if not kpis_dir.exists():
        return []

    snaps: List[Snapshot] = []
    files = sorted([p for p in kpis_dir.iterdir() if p.is_file()])

    for p in files:
        if p.name.startswith("."):
            continue
        if p.suffix.lower() not in {".json", ".jsonl", ".ndjson", ".txt", ".md"}:
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        mtime = None
        try:
            mtime = p.stat().st_mtime
        except Exception:
            pass

        if p.suffix.lower() in {".json", ".jsonl", ".ndjson"}:
            records = _parse_json_records(text)
            for rec in records:
                s = _parse_json_snapshot(rec, source=p.name, mtime=mtime, tz=tz)
                if s is not None:
                    snaps.append(s)
        else:
            s = _parse_text_snapshot(text, filename=p.name, mtime=mtime, tz=tz)
            if s is not None:
                snaps.append(s)

    # Deduplicate: keep last snapshot per day
    by_day: Dict[dt.date, Snapshot] = {}
    for s in sorted(snaps, key=lambda x: x.ts):
        by_day[s.day] = s
    return sorted(by_day.values(), key=lambda x: x.ts)


def _mean(values: List[float]) -> Optional[float]:
    if not values:
        return None
    return float(statistics.fmean(values))


def _fmt_pct(x: Optional[float], *, digits: int = 1) -> str:
    if x is None:
        return "n/a"
    return f"{x:.{digits}f}%"


def _fmt_ms(x: Optional[float]) -> str:
    if x is None:
        return "n/a"
    if x >= 1000:
        return f"{x/1000.0:.2f}s"
    return f"{x:.0f}ms"


def _fmt_usd(x: Optional[float]) -> str:
    if x is None:
        return "n/a"
    if x >= 1:
        return f"${x:.2f}"
    return f"${x:.3f}"


def _fmt_delta_pp(today: Optional[float], baseline: Optional[float]) -> str:
    if today is None or baseline is None:
        return "n/a"
    d = today - baseline
    sign = "+" if d >= 0 else ""
    return f"{sign}{d:.1f}pp"


def _fmt_delta_pct(today: Optional[float], baseline: Optional[float]) -> str:
    if today is None or baseline is None or baseline == 0:
        return "n/a"
    d = (today - baseline) / baseline * 100.0
    sign = "+" if d >= 0 else ""
    return f"{sign}{d:.0f}%"


def _window(snaps: List[Snapshot], n: int) -> List[Snapshot]:
    return snaps[-n:] if len(snaps) >= n else snaps[:]


def build_digest(snaps: List[Snapshot], tz: dt.tzinfo, max_chars: int) -> Tuple[str, int]:
    if not snaps:
        # Treat as a warning-state digest (not a script failure) so cron can still post it.
        return ("⚠️ Weekly Metrics Digest: no KPI snapshots found. (Check metrics-snapshot cron + output directory.)", 0)

    now = dt.datetime.now(tz)
    latest = snaps[-1]

    # Calendar windows anchored to the latest available snapshot day.
    end_day = latest.day
    cur_days = [end_day - dt.timedelta(days=i) for i in range(6, -1, -1)]
    prev_days = [end_day - dt.timedelta(days=i) for i in range(13, 6, -1)]

    by_day = {s.day: s for s in snaps}
    cur7 = [by_day[d] for d in cur_days if d in by_day]
    prev7 = [by_day[d] for d in prev_days if d in by_day]

    # For missed-cron detection.
    age_hours = (now - latest.ts).total_seconds() / 3600.0

    def series(win: List[Snapshot], attr: str) -> List[float]:
        out: List[float] = []
        for s in win:
            v = getattr(s, attr)
            if isinstance(v, (int, float)):
                out.append(float(v))
        return out

    # Today vs avg excluding today
    cur_ex_today = cur7[:-1] if len(cur7) >= 2 else cur7

    s_today = latest.success_rate
    s_avg7 = _mean(series(cur7, "success_rate"))
    s_avg_ex = _mean(series(cur_ex_today, "success_rate"))
    s_prev = _mean(series(prev7, "success_rate"))

    p_today = latest.p95_latency_ms
    p_avg7 = _mean(series(cur7, "p95_latency_ms"))
    p_avg_ex = _mean(series(cur_ex_today, "p95_latency_ms"))
    p_prev = _mean(series(prev7, "p95_latency_ms"))

    c_today = latest.cost_per_task_usd
    c_avg7 = _mean(series(cur7, "cost_per_task_usd"))
    c_avg_ex = _mean(series(cur_ex_today, "cost_per_task_usd"))
    c_prev = _mean(series(prev7, "cost_per_task_usd"))

    q_today = latest.quota_percent
    b_today = latest.backup_age_hours

    # Thresholds / regressions
    regressions: List[str] = []
    has_red = False
    has_warn = False

    # Missed cron >1 interval: stale latest snapshot OR missing days inside the last-7d window.
    if age_hours > 36:
        has_warn = True
        regressions.append(f"⚠️ Latest snapshot is stale ({age_hours:.0f}h old)")

    missing = [d for d in cur_days if d not in by_day]
    if missing:
        has_warn = True
        regressions.append(f"⚠️ Missing snapshots in last 7d: {len(missing)}/7")

    # Success thresholds
    if s_today is not None and s_today < 95.0:
        has_red = True
        regressions.append(f"🔴 Success <95% (today {s_today:.1f}%)")
    if s_today is not None and s_avg_ex is not None and (s_today - s_avg_ex) < -5.0:
        has_warn = True
        regressions.append(f"⚠️ Success drop >5pp vs 7d avg ({_fmt_delta_pp(s_today, s_avg_ex)})")

    # Latency regressions
    if p_today is not None and p_avg_ex is not None and p_today > p_avg_ex * 1.5:
        has_warn = True
        regressions.append(f"⚠️ p95 spike >50% vs 7d avg ({_fmt_delta_pct(p_today, p_avg_ex)})")

    # p95 >2x baseline (3 runs)
    baseline = p_prev
    if baseline is None:
        # fallback: use older half of current window (exclude last 3 days)
        older = cur7[:-3] if len(cur7) > 3 else cur7
        baseline = _mean(series(older, "p95_latency_ms"))

    last3 = cur7[-3:] if len(cur7) >= 3 else cur7
    if baseline is not None and baseline > 0 and len(last3) >= 3:
        if all((s.p95_latency_ms is not None and s.p95_latency_ms > 2.0 * baseline) for s in last3):
            has_red = True
            regressions.append(f"🔴 p95 >2x baseline for 3 runs (baseline {_fmt_ms(baseline)})")

    # Cost regressions
    if c_today is not None and c_avg_ex is not None and c_today > c_avg_ex * 1.2:
        has_warn = True
        regressions.append(f"⚠️ Cost/task +>20% vs 7d avg ({_fmt_delta_pct(c_today, c_avg_ex)})")

    # Consecutive failures
    def is_failure_day(s: Snapshot) -> bool:
        if s.ok is False:
            return True
        if s.success_rate is not None and s.success_rate < 95.0:
            return True
        return False

    consec = 0
    for s in reversed(cur7):
        if is_failure_day(s):
            consec += 1
        else:
            break
    if consec >= 3:
        has_warn = True
        regressions.append(f"⚠️ {consec} consecutive failure-days")

    # Backup age
    if b_today is not None and b_today > 24.0:
        has_warn = True
        regressions.append(f"⚠️ Backup age >24h (now {b_today:.1f}h)")

    # Quota
    if q_today is not None and q_today > 85.0:
        has_warn = True
        regressions.append(f"⚠️ Quota >85% (now {q_today:.0f}%)")

    # Overall status
    status = "🟢" if not (has_red or has_warn) else ("🔴" if has_red else "🟡")
    health_label = "healthy" if status == "🟢" else ("regressions" if status == "🔴" else "watch")

    # Top failures
    fail_counter: Counter[str] = Counter()
    for s in cur7:
        for k, v in (s.failures_by_type or {}).items():
            if v:
                fail_counter[str(k)] += int(v)
    top_fail = ", ".join([f"{k}({v})" for k, v in fail_counter.most_common(3)])

    # Compose digest
    date_str = latest.ts.astimezone(tz).strftime("%Y-%m-%d")
    hdr = f"📊 Weekly Metrics Digest ({date_str})\nOverall: {status} {health_label} | snaps: {len(cur7)}/7"

    lines = [hdr]

    lines.append(
        "Success: "
        f"7d {_fmt_pct(s_avg7)} | today {_fmt_pct(s_today)} ({_fmt_delta_pp(s_today, s_avg_ex)}) | WoW {_fmt_delta_pct(s_avg7, s_prev)}"
    )
    lines.append(
        "p95: "
        f"7d {_fmt_ms(p_avg7)} | today {_fmt_ms(p_today)} ({_fmt_delta_pct(p_today, p_avg_ex)}) | WoW {_fmt_delta_pct(p_avg7, p_prev)}"
    )
    lines.append(
        "Cost/task: "
        f"7d {_fmt_usd(c_avg7)} | today {_fmt_usd(c_today)} ({_fmt_delta_pct(c_today, c_avg_ex)}) | WoW {_fmt_delta_pct(c_avg7, c_prev)}"
    )

    extra_bits = []
    if b_today is not None:
        extra_bits.append(f"Backup age {b_today:.1f}h")
    if q_today is not None:
        extra_bits.append(f"Quota {q_today:.0f}%")
    if extra_bits:
        lines.append(" | ".join(extra_bits))

    if regressions:
        lines.append("Regressions:")
        for r in regressions[:6]:
            lines.append(f"- {r}")

    if top_fail:
        lines.append(f"Top failures: {top_fail}")

    msg = "\n".join(lines).strip()
    if len(msg) > max_chars:
        msg = msg[: max_chars - 1].rstrip() + "…"

    return msg, 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kpis-dir", default=os.path.expanduser("~/clawd/shared-context/kpis"))
    ap.add_argument("--tz", default=TZ_NAME_DEFAULT)
    ap.add_argument("--max-chars", type=int, default=MAX_CHARS_DEFAULT)
    args = ap.parse_args()

    tz = None
    if ZoneInfo is not None:
        try:
            tz = ZoneInfo(args.tz)
        except Exception:
            tz = dt.timezone.utc
    else:
        tz = dt.timezone.utc

    snaps = load_snapshots(Path(args.kpis_dir), tz)
    msg, code = build_digest(snaps, tz, args.max_chars)
    print(msg)
    return code


if __name__ == "__main__":
    raise SystemExit(main())

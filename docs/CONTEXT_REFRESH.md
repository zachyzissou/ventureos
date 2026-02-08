# Context Refresh Jobs (Daily Summaries + Memory Cleanup)

## Purpose
Keep **working context** fresh and prompt‑size under control by generating daily summaries, pruning stale material, and archiving older context. These jobs are **P2 (normal)** and run only during the proactive window (08:00–23:00 CST). If triggered during quiet hours, they must **queue** and execute at the next window.

**Principles**
- **Supersede‑don’t‑delete:** move or archive; do not silently remove.
- **Deterministic artifacts:** every run emits a summary + a log record.
- **Three‑layer alignment:** daily logs → summaries → synthesized MEMORY.md.

---

## Schedule (CST)

| Job ID | Tier | Schedule | Goal | Expected Artifacts |
|---|---|---|---|---|
| `context-refresh-daily` | P2 | `10 8 * * *` | Summarize prior day + update working context | `~/clawd/memory/daily-summaries/YYYY-MM-DD.md`, `~/clawd/runtime/logs/context_refresh/YYYY-MM-DD.jsonl` |
| `context-refresh-cleanup` | P2 | `25 8 * * *` | Move stale/completed items to archives | `~/clawd/memory/archives/index.json`, `~/clawd/runtime/logs/context_refresh/YYYY-MM-DD.jsonl` |
| `memory-synthesis-weekly` | P2 | `0 9 * * 0` | Weekly synthesis into durable memory | `~/clawd/memory/weekly-summaries/YYYY-WW.md`, `~/clawd/MEMORY.md` |
| `context-archive-monthly` | P3 | `30 9 1 * *` | Compress/archive older context | `~/clawd/archives/context/YYYY-MM/context-archive.tar.gz` |

> **Note:** If the proactive engine is enabled, cron should enqueue P2/P3 jobs (see example below). If the engine is disabled, cron may run scripts directly.

---

## Job Definitions

### 1) `context-refresh-daily`
**Inputs**
- `~/clawd/memory/YYYY-MM-DD.md` (prior day)
- `~/clawd/runtime/logs/task_runs/YYYY-MM-DD.jsonl`
- active issues/mission logs (if present)

**Actions**
- Produce a concise “today context” summary (open loops, decisions, next steps)
- Update `MEMORY.md` **“Recent”** section with 3–7 bullets

**Outputs**
- `~/clawd/memory/daily-summaries/YYYY-MM-DD.md`
- `~/clawd/runtime/logs/context_refresh/YYYY-MM-DD.jsonl`

---

### 2) `context-refresh-cleanup`
**Inputs**
- `~/clawd/memory/` (daily logs + summaries)
- `~/clawd/memory/heartbeat-state.json` (optional for last check timestamps)

**Actions**
- Move completed/closed sections from daily logs into archives
- Flag stale items older than the **stale threshold** (default 14 days) and archive them
- Update archive index

**Outputs**
- `~/clawd/memory/archives/daily/YYYY-MM/`
- `~/clawd/memory/archives/index.json`
- `~/clawd/runtime/logs/context_refresh/YYYY-MM-DD.jsonl`

---

### 3) `memory-synthesis-weekly`
**Inputs**
- Daily summaries for the week
- Entity store (if present)

**Actions**
- Update `MEMORY.md` with consolidated, non‑redundant facts
- Generate a weekly summary (high‑signal only)

**Outputs**
- `~/clawd/memory/weekly-summaries/YYYY-WW.md`
- Updated `~/clawd/MEMORY.md`

---

### 4) `context-archive-monthly`
**Inputs**
- `~/clawd/memory/daily-summaries/`
- `~/clawd/memory/archives/daily/`
- `~/clawd/runtime/logs/context_refresh/`

**Actions**
- Compress older context into a monthly tarball
- Retain indexes so retrieval stays cheap

**Outputs**
- `~/clawd/archives/context/YYYY-MM/context-archive.tar.gz`
- `~/clawd/archives/context/YYYY-MM/index.json`

---

## Retention & Archival Rules

| Data Type | Active Retention | Archive Retention | Rule |
|---|---|---|---|
| Daily logs (`memory/YYYY-MM-DD.md`) | 30 days | 12 months | Move to `memory/archives/daily/YYYY-MM/` after 30 days. |
| Daily summaries | 60 days | 12 months | Archive after 60 days; keep index forever. |
| Weekly summaries | 6 months | 24 months | Archive after 6 months. |
| Context refresh logs | 30 days | 12 months | Move to `archives/context/YYYY-MM/` monthly. |
| `MEMORY.md` | Always active | Snapshot monthly | Store a monthly snapshot in `archives/context/YYYY-MM/MEMORY.md`. |

**Deletion policy:** only after archive retention expires, and only with explicit approval. Default behavior is **archive‑only**.

---

## Example Cron Entries

**Direct execution (engine disabled):**
```cron
10 8 * * * /Users/zachgonser/clawd/scripts/context-refresh-daily.sh
25 8 * * * /Users/zachgonser/clawd/scripts/context-refresh-cleanup.sh
0 9 * * 0 /Users/zachgonser/clawd/scripts/memory-synthesis-weekly.sh
30 9 1 * * /Users/zachgonser/clawd/scripts/context-archive-monthly.sh
```

**Queued execution (engine enabled):**
```cron
10 8 * * * /Users/zachgonser/clawd/scripts/task-queue.py enqueue --job-id context-refresh-daily --tier P2 --command "bash -lc 'scripts/context-refresh-daily.sh'"
25 8 * * * /Users/zachgonser/clawd/scripts/task-queue.py enqueue --job-id context-refresh-cleanup --tier P2 --command "bash -lc 'scripts/context-refresh-cleanup.sh'"
0 9 * * 0 /Users/zachgonser/clawd/scripts/task-queue.py enqueue --job-id memory-synthesis-weekly --tier P2 --command "bash -lc 'scripts/memory-synthesis-weekly.sh'"
30 9 1 * * /Users/zachgonser/clawd/scripts/task-queue.py enqueue --job-id context-archive-monthly --tier P3 --command "bash -lc 'scripts/context-archive-monthly.sh'"
```

> Use `scripts/guarded-run.sh` if any job includes network/API calls.

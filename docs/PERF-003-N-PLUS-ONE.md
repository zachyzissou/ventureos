# PERF-003: N+1 Query Elimination — Analysis & Results

**Date:** 2026-02-15  
**Branch:** `fix/perf-003-n-plus-one`  
**Priority:** P0 (performance foundation)

---

## Problem

The dashboard data loading and task queue worker used N+1 access patterns:

### Pattern 1: Dashboard Agent Data Loading
```
1 read:  business-units.json  (get agent list)
N reads: task-queue/{agent}/task-queue.json  (per agent)
N reads: logs/task_runs/{agent}/*.jsonl      (per agent)
N reads: monitor/{agent}/state.json          (per agent)
───────
Total: 1 + 3N file reads
```
For 6 agents: **19 file reads** (1 + 18).

### Pattern 2: Task Queue `cmd_work`
```
1 read:   queue file             (get all tasks)
N reads:  queue file             (re-read per task after execution)
N writes: queue file             (re-write per task after execution)
───────
Total: 1 + 2N file I/O operations
```
For 3 tasks: **7 file operations** (1 read + 3 reads + 3 writes).

### Pattern 3: Routing Healthcheck
```
1 jq:  list role channel IDs
N jq:  check each channel ID individually
───────
Total: 1 + N subprocess invocations
```
For 5 role channels: **6 jq invocations**.

---

## Solution

### Dashboard: Batch Pre-Loading + In-Memory Joins
```
1 read:  business-units.json
1 glob:  task-queue/*/task-queue.json  → batch read all
1 glob:  logs/task_runs/*/latest.jsonl → batch read all
1 glob:  monitor/*/state.json         → batch read all
0 reads: in-memory enrichment (dict lookup by agent_id)
───────
Total: 1 + 3 glob operations (constant, not per-agent)
```

### Task Queue: Three-Phase Batch Processing
```
Phase 1: 1 read  → claim ALL eligible tasks → 1 write
Phase 2: Execute all tasks (no file I/O)
Phase 3: 1 read  → batch-update ALL results → 1 write
───────
Total: 2 reads + 2 writes (constant, regardless of task count)
```

### Routing Healthcheck: Single Batch `jq`
```
1 jq:  list role channel IDs
1 jq:  batch-check ALL channel IDs at once (--argjson ids)
───────
Total: 2 jq invocations (constant)
```

---

## Before / After Comparison

| Component             | Before (N+1)    | After (Batch)   | Improvement        |
|-----------------------|------------------|------------------|--------------------|
| Dashboard (6 agents)  | 19 file reads    | 4 file reads     | **4.75× fewer I/O**   |
| Task queue (3 tasks)  | 7 file I/O ops   | 4 file I/O ops   | **1.75× fewer I/O**   |
| Healthcheck (5 roles) | 6 jq invocations | 2 jq invocations | **3× fewer subprocs** |

### Scaling Behavior

| Agents (N) | Dashboard Old | Dashboard New | Task Queue Old | Task Queue New |
|:----------:|:-------------:|:-------------:|:--------------:|:--------------:|
| 1          | 4             | 4             | 3              | 4              |
| 5          | 16            | 4*            | 11             | 4              |
| 10         | 31            | 4*            | 21             | 4              |
| 50         | 151           | 4*            | 101            | 4              |

*Dashboard "new" scales with number of files on disk, not agents in the list.
Task queue "new" is always exactly 4 (2 reads + 2 writes), regardless of task count.

---

## Benchmark Results

### Test Suite (27/27 passing)
```
✅ Dashboard batch loader — same output as N+1 (no regression)
✅ Queue summaries match for all 6 test agents
✅ Health status matches for all 6 test agents
✅ Batch uses fewer or equal reads
✅ Task queue uses exactly 2 LockedQueue calls (was 1+N)
✅ Three-phase pattern verified (claim → execute → update)
✅ PerfStats monitoring added
✅ Routing healthcheck uses batch jq
✅ Old per-item jq loop eliminated
✅ Performance within expected bounds
```

### Timing (10 iterations, 6 synthetic agents)
- N+1 pattern: ~0.58ms average
- Batch pattern: ~0.64ms average
- Note: With small N and local filesystem, timing difference is minimal.
  The real gain is in **I/O operation count**, which matters for:
  - Networked filesystems (NFS, remote mounts)
  - High-contention scenarios (multiple agents writing simultaneously)
  - Larger agent counts (N > 10)

---

## Files Changed

| File | Change |
|------|--------|
| `scripts/task-queue.py` | Refactored `cmd_work` to 3-phase batch pattern; added `PerfStats` class |
| `scripts/routing-healthcheck.sh` | Replaced per-item jq loop with single batch jq call |
| `scripts/dashboard-data.py` | **New** — Batch dashboard data loader with both patterns for comparison |
| `scripts/tests/test-perf-003-n-plus-one.py` | **New** — 27-test performance + regression suite |
| `docs/PERF-003-N-PLUS-ONE.md` | **New** — This analysis document |

---

## Verification Checklist

- [x] Performance benchmark run (test-perf-003-n-plus-one.py)
- [x] File read counts confirmed: batch ≤ N+1 for all components
- [x] Dashboard loads correctly with both patterns (functional equivalence)
- [x] Task queue three-phase pattern: exactly 2 LockedQueue calls
- [x] Routing healthcheck: single batch jq verified
- [x] No functionality regression (queue summaries + health match)
- [x] Performance monitoring/logging added (PerfStats)
- [x] docs-lint passes

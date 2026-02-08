# Proactive Engine (Phase 2) — Draft

## Objective
Introduce a **rule‑based scheduler** with **SLA tiers** to govern proactive tasks, enforce quiet hours, and avoid overload.

---

## SLA Tiers

| Tier | Name | Target Response | Examples | Allowed in Quiet Hours |
|---|---|---|---|---|
| **P0** | Critical | immediate | gateway down, auth broken, data loss risk | ✅ yes |
| **P1** | Urgent | ≤ 1 hour | repeated failures, rate‑limit loops | ❌ no (queue) |
| **P2** | Normal | ≤ 24 hours | weekly digests, routine reports | ❌ no (queue) |
| **P3** | Low | best effort | research notes, cleanup tasks | ❌ no (queue) |

**Quiet hours:** 23:00–08:00 CST → only P0 executes; all others queued.

---

## Scheduler Rules (v1)

1. **Window gating**
   - If outside proactive window, only run P0 jobs.
   - All non‑P0 jobs are queued for next window.

2. **Concurrency caps**
   - Max 2 long‑running jobs at once (≥60s).
   - Max 4 total jobs in flight.

3. **Backoff on failure**
   - P1: exponential backoff up to 1 hour.
   - P2/P3: backoff to next scheduled window.

4. **No duplicate work**
   - If a job failed in the last N minutes with same error, suppress repeats.
   - N defaults: P1=30m, P2=4h, P3=24h.

---

## Queue Schema (draft)

```json
{
  "id": "uuid",
  "createdAt": "ISO-8601",
  "tier": "P0|P1|P2|P3",
  "jobId": "<cron-id>",
  "title": "short description",
  "payload": {"kind": "agentTurn|systemEvent", "message": "..."},
  "attempts": 0,
  "lastError": "",
  "nextRunAt": "ISO-8601"
}
```

---

## Integration Points

- **cron jobs** → enqueue when quiet hours or concurrency limits block execution.
- **monitor-openclaw.sh** → emits P0/P1 signals into queue.
- **task_runs JSONL** → provides history for suppression logic.

---

## Implementation (v1)

### Files
- **Engine config (gated):** `~/clawd/runtime/proactive-engine.json`
  - `enabled: false` by default.
  - quiet hours: `23:00–08:00` (America/Chicago)
- **Queue storage:** `~/clawd/runtime/task-queue.json` (durable JSON)
- **Queue/worker tool:** `~/clawd/scripts/task-queue.py`
  - Source of truth: `openclaw-upgrade/scripts/task-queue.py`

### Worker behavior
When enabled, the worker:
- enforces quiet-hours gating (**P0 allowed**, P1–P3 deferred)
- applies backoff on failure (simple exponential, capped at 1h)
- writes task run records to `~/clawd/runtime/logs/task_runs/YYYY-MM-DD.jsonl`

### Enablement
This system is safe to deploy in code immediately, but **must remain disabled** until explicitly approved.

To enable:
1) Set `enabled: true` in `~/clawd/runtime/proactive-engine.json`
2) Add a cron job that runs:
   - `~/clawd/scripts/task-queue.py work`
3) Update target proactive jobs to enqueue work instead of running immediately when blocked.

## Phase 2 Acceptance (draft)

- SLA tiers defined and referenced by cron specs.
- Quiet‑hours enforcement with queuing.
- Backoff rules applied consistently.
- Queue entries persisted + retried on next window.
- Worker is **disabled-by-default** and requires explicit approval to enable.

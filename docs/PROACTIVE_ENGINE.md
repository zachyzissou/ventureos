# Proactive Engine (Phase 2) — Draft

## Objective
Introduce a **rule‑based scheduler** with **SLA tiers** to govern proactive tasks, enforce quiet hours, and avoid overload.

**Rules framework:** see **PROACTIVE_RULES.md** for rule schema, windows, cooldowns, escalation, and safety gates.

---

## SLA Tiers

**Authoritative policy:** see **SLA_POLICY.md** for full definitions, queue field mapping, and escalation triggers.

| Tier | Name | Time‑to‑Ack | Time‑to‑Run | Max Retries | Default Escalation | Allowed in Quiet Hours |
|---|---|---|---|---|---|---|
| **P0** | Critical | ≤ 5 min | ≤ 15 min | 5 | Immediate alert + auto‑escalate on any failure | ✅ yes |
| **P1** | Urgent | ≤ 15 min | ≤ 1 hour | 4 | Alert within 1h; auto‑escalate after 2 failures | ❌ no (queue) |
| **P2** | Normal | ≤ 4 hours | ≤ 24 hours | 3 | Log only; notify owner on repeated failure | ❌ no (queue) |
| **P3** | Low | ≤ 24 hours | Best effort (≤ 72h target) | 2 | Log only; notify only if backlog persists | ❌ no (queue) |

**Examples:**
- **P0:** gateway down, auth broken, data loss risk
- **P1:** repeated failures, rate‑limit loops
- **P2:** weekly digests, routine reports
- **P3:** research notes, cleanup tasks

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

The worker executes **queued shell commands**. Mission metadata is carried alongside the command so runs are searchable and auditable.

```json
{
  "id": "28b9f7b8-1c2c-4e7b-8a2e-3d0e1c88f9f1",
  "createdAt": "2026-02-08T00:20:00Z",
  "tier": "P2",
  "status": "queued",
  "jobId": "cron-stantontimes-weekly",
  "title": "Draft Stanton Times content calendar",

  "businessUnit": "stanton-times",
  "missionType": "content",
  "role": "Comms",
  "expectedArtifacts": [
    "/obsidian/StantonTimes/2026/02/mission-brief.md",
    "/obsidian/StantonTimes/2026/02/content-calendar.md",
    "/obsidian/StantonTimes/2026/02/draft-batch-01.md"
  ],
  "requiresApproval": true,

  "attempts": 0,
  "maxAttempts": 3,
  "timeoutSeconds": 900,
  "nextRunAt": "2026-02-08T14:00:00Z",
  "lastError": "",
  "dedupeKey": "stanton-times:content:calendar:2026-w06",

  "command": ["bash", "-lc", "python scripts/generate_calendar.py --unit stanton-times --week 6"]
}
```

Allowed values:
- `missionType`: `newco | build | content | ops | ai-factory | research`
- `role`: `Echo | Atlas | Synth | Oracle | Ledger | Comms | Forge | Builder | Verifier | Sentinel | Archivist`

---

## Integration Points

- **Mission Control (VentureOS)** → enqueues mission steps with `businessUnit`/`missionType`/`role` metadata.
- **feedback events** → thumbs‑down / revision requests enqueue iteration work (see **FEEDBACK_LOOP.md**).
- **cron jobs** → enqueue when quiet hours or concurrency limits block execution.
- **context refresh jobs** → P2 daily/weekly summaries + cleanup; schedule + retention in **CONTEXT_REFRESH.md**.
- **monitor-openclaw.sh** → emits P0/P1 signals into queue.
- **task_runs JSONL** → provides history for suppression logic.

---

## Routing + Alerts (using mission metadata)

- **businessUnit** → route to the owning dashboard/channel; tag the unit lead for triage.
- **missionType** → pick the correct workflow/runbook (e.g., `content` routes to approval gates; `ops` routes to on‑call).
- **role** → auto‑assign the primary worker or filter queue views by specialty.
- **expectedArtifacts** → treat as a completion checklist; missing artifacts trigger an “incomplete” alert.
- **requiresApproval** → push to `pendingApprovals`, notify Sentinel/Verifier, and block publish/close until approved.
- **feedbackType** → map to default tier (thumbs_down → P1, revision_request → P2) unless severity overrides.

---

## Implementation (v1)

### Files
- **Engine config (gated):** `~/clawd/runtime/proactive-engine.json`
  - `enabled: false` by default.
  - quiet hours: `23:00–08:00` (America/Chicago)
- **Rules registry (gated):** `~/clawd/runtime/proactive-rules.json`
  - must match **PROACTIVE_RULES.md** schema
- **Queue storage:** `~/clawd/runtime/task-queue.json` (durable JSON)
- **Queue/worker tool:** `~/clawd/scripts/task-queue.py`
  - Source of truth: `VentureOS/scripts/task-queue.py`

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

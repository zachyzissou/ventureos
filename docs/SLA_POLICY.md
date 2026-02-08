# SLA Policy (Task Queue + Proactive Engine)

## Purpose
Define **P0–P3 SLA tiers** for the task queue and proactive engine, including **time‑to‑ack**, **time‑to‑run**, **max retries**, and **escalation defaults**. This policy is the authoritative reference for SLA semantics used by `docs/PROACTIVE_ENGINE.md` and `docs/PROACTIVE_RULES.md`.

---

## Definitions (Queue‑aligned)

- **Time‑to‑ack (TTA):** time from `createdAt` until the task is **acknowledged**. A task is considered acknowledged when the worker **claims** it (`status=running` + `runningAt`) *or* when it is **explicitly deferred** (e.g., `nextRunAt` is updated because of quiet hours/blackout/approval gating).
- **Time‑to‑run (TTR):** time from `createdAt` (or from the **next eligible window start** if queued during quiet hours/blackouts) until `runningAt` is set.
- **Max retries:** corresponds to `maxAttempts` in `task-queue.json`. Backoff must follow `docs/RETRY_POLICY.md`.
- **Escalation:** default notifications tied to **missed SLA**, **exhausted retries**, or **consecutive failures**, defined per tier and optionally overridden in `docs/PROACTIVE_RULES.md`.

**Quiet hours + blackouts:** For P1–P3, **SLA clocks pause** during quiet hours or blackout windows. The SLA timer resumes at the next eligible window start. P0 does **not** pause.

**Approval gate:** If `requiresApproval=true`, **TTA is satisfied** once the approval request is issued; **TTR starts** when approval is granted.

---

## SLA Tiers (Defaults)

| Tier | Time‑to‑Ack | Time‑to‑Run | Max Retries (`maxAttempts`) | Default Escalation |
|---|---|---|---|---|
| **P0** | ≤ **5 min** | ≤ **15 min** | **5** | Immediate alert to `discord:slurpnet-alerts`; auto‑escalate on any failure or missed SLA. |
| **P1** | ≤ **15 min** | ≤ **1 hour** | **4** | Alert within 1 hour; auto‑escalate after **2 consecutive failures** or missed run SLA. |
| **P2** | ≤ **4 hours** | ≤ **24 hours** | **3** | Log only by default; notify owner if **2 consecutive failures** or run SLA missed by >24h. |
| **P3** | ≤ **24 hours** | **Best effort** (target ≤ 72h) | **2** | Log only; notify only if backlog exceeds 7 days or explicitly overridden. |

**Notes:**
- Tier defaults may be overridden per rule in `docs/PROACTIVE_RULES.md`, but **cannot be less strict** than these baselines without explicit approval.
- For P0/P1, escalation should also trigger on **exhausted retries** (`status=failed`).

---

## Task Queue Field Mapping

The SLA policy is designed to align with the **task queue schema** (`docs/templates/task-queue.json`):

- **Start time:** `createdAt`
- **Ack event:** first of `runningAt` **or** an explicit deferral update (`nextRunAt` moved due to gating)
- **Run start:** `runningAt`
- **Retry count:** `attempts` / `maxAttempts`
- **Final state:** `status` = `done | failed` + `finishedAt`
- **Scheduling:** `nextRunAt` must be set to keep TTR within the tier target (taking quiet hours into account)

**Rule of thumb:** when enqueuing, set `maxAttempts` and `nextRunAt` according to the tier so the run begins within the TTR window.

---

## Escalation Triggers (Default)

Escalate when any of the following occur (per tier rules above):
1. **Missed TTA** (not acknowledged within SLA window)
2. **Missed TTR** (not running within SLA window)
3. **Exhausted retries** (`status=failed`)
4. **Consecutive failures** exceeding tier threshold

Escalation routing is governed by `docs/PROACTIVE_RULES.md` and `docs/PROACTIVE_MODE.md`.

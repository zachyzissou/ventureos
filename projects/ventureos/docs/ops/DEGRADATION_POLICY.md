# Degradation Policy (Phase 1)

This policy defines **how OpenClaw/VentureOS degrades gracefully** when dependencies fail. It standardizes **degradation tiers**, **fallback behaviors by subsystem**, and **user messaging + approval rules**.

> **Related:** `docs/ops/ERROR_TAXONOMY.md`, `docs/ops/RETRY_POLICY.md`, `docs/ops/TIMEOUT_POLICY.md`, `docs/ops/RELIABILITY_PLAYBOOK.md`, `docs/ops/GUARDRAILS.md`.

---

## 1) Principles

1. **Safety first** — no unsafe retries, no ambiguous side effects.
2. **Progressive reduction** — shed non‑critical steps before core actions.
3. **Transparency** — always disclose degraded mode and impact to the user.
4. **Read‑only bias** — in hard‑degrade mode, prefer read‑only/verification steps.
5. **Queue vs. drop** — defer work via queue where possible (see `runtime/task-queue.json`).

---

## 2) Degradation Strategy Tiers

| Tier | Trigger (Typical) | Behavior | User Messaging | Approval Rules |
|---|---|---|---|---|
| **D0 — Normal** | No errors | Full workflow | No special notice | Standard guardrails apply |
| **D1 — Soft Degrade** | **P2** transient failure, first failure | Skip optional steps, reduce scope, use cached data | Add “Limitations” note in output | No new approvals needed |
| **D2 — Hard Degrade** | **P1** repeated failures, outcome unknown | Disable non‑idempotent actions, run read‑only checks, queue work | Explicit warning + impact summary | **Approval required** to proceed with any side‑effect action |
| **D3 — Halt** | **P0** (auth/config/data loss/security) | Stop automation, alert | Immediate alert + stop notice | **Explicit approval** to resume |

**Severity mapping:** P2 → D1, P1 → D2, P0 → D3. When uncertain, **choose the higher tier**.

---

## 3) Decision Rules (Deterministic)

1. **Classify severity** using `docs/ops/ERROR_TAXONOMY.md`.
2. **Pick tier**: P2→D1, P1→D2, P0→D3.
3. **Outcome unknown = D2** even if the error is transient.
4. **Do not downgrade** until the dependency is healthy for ≥1 hour or user approves.
5. **Non‑idempotent actions** are blocked in D2/D3 unless explicitly approved.

---

## 4) Fallback Behaviors by Subsystem

### Web Search / `web_fetch`
- **D1:** use cached memory or local docs; reduce source count; note missing sources.
- **D2:** request user‑provided sources or skip research; mark status as **unknown**.
- **D3:** halt only if the dependency is safety‑critical for the task.

### Browser Automation
- **D1:** one **T4 retry**; attempt API alternative; skip optional UI steps.
- **D2:** **no form submissions/publishing**; provide manual steps; queue retry.
- **D3:** auth/session failures → halt + approval required.

### GitHub/GitLab API (SCM)
- **D1:** use local git status; label remote status **unknown**.
- **D2:** **block merges/pushes**; queue follow‑ups; require approval to proceed.
- **D3:** auth/config failures → halt.

### Messaging / Notifications (Discord, email, etc.)
- **D1:** retry then **log + queue** for next run.
- **D2:** notify in‑session; mark alerts as **delivery pending**; queue retry.
- **D3:** if alerting fails for P0, write a local incident log and halt.

### Social / External Publishing (Bird)
- **D1:** skip publish; create drafts only if safe.
- **D2:** **approval required** for any publish once recovered.
- **D3:** auth errors → halt.

### Model / LLM
- **D1:** fallback to cheaper model for low‑risk tasks; reduce context.
- **D2:** **do not downgrade** for safety‑critical tasks; request approval or defer.
- **D3:** no model available → halt for tasks requiring reasoning.

### Memory System (entity store + daily logs)
- **D1:** proceed with minimal context; log missing memory.
- **D2:** write failures → **spool pending writes** (queue or local file) and notify.
- **D3:** corruption risk → halt until verified.

### Storage / Filesystem
- **D1:** read‑only fallback; skip non‑critical writes.
- **D2:** no destructive changes; approval required for any write.
- **D3:** disk full/corruption → halt.

### Scheduler / Gateway / Cron
- **D3:** gateway down or cron failure → stop automation + alert.

### Observability / Logging
- **D1:** write to fallback log file if primary sink fails.
- **D2:** prioritize incident logs; queue uploads.
- **D3:** if logging is unavailable, halt safety‑critical actions.

### Device / Node Actions (if used)
- **D1:** retry once; skip optional device actions.
- **D2:** require manual confirmation before device actions.
- **D3:** safety risk → halt.

---

## 5) User Messaging + Approval Rules

**Always include:** what failed, what was skipped, what fallback was used, and impact.

**Messaging cadence:** one notice per incident window (≤1 hour) unless severity escalates.

### D1 (Soft Degrade)
- Add a **“Limitations”** section in the response.
- No extra approvals needed.

### D2 (Hard Degrade)
- Explicit warning + impact summary.
- Ask for approval **before** any side‑effect action (publishing, payments, deletions, config changes).
- If approval is not granted → **defer** and queue.

### D3 (Halt)
- Immediate stop notice + alerting per `docs/ops/OPS_RUNBOOK.md`.
- Require explicit approval to resume after recovery.

**Guardrails apply at all tiers** (see `docs/ops/GUARDRAILS.md`).

---

## 6) Required Logging Fields (Degradation Events)

Include **all retry/error fields** from `docs/ops/RETRY_POLICY.md` and add:
- `degradation_tier` (D0–D3)
- `degradation_trigger` (P2 transient / P1 repeated / P0 auth etc.)
- `dependency` (service/tool)
- `fallback_action` (cached data / skip / queue / halt)
- `fallback_result` (success/failed/partial)
- `skipped_steps` (list)
- `impact_summary`
- `user_notified` (true/false)
- `approval_required` (true/false)
- `approval_status` (pending/approved/denied)
- `queued_work_id` (if queued)
- `resume_condition` (health check / manual approval / cooldown)

---

## 7) Examples

### Example A — Web search failure (D1)
- `web_search` times out once → **D1**
- Fallback: use cached memory + local docs
- User note: “Web search unavailable; results may be incomplete.”

### Example B — Browser automation loop (D2)
- Same UI step fails twice in 1 hour → **P1/D2**
- Fallback: skip submit, queue for manual completion
- User note: “Form submission blocked; queued for manual action. Approval required to proceed.”

### Example C — Auth failure (D3)
- API returns 401 → **P0/D3**
- Action: stop automation + alert
- User note: “Auth failed; automation halted until re‑auth is completed.”

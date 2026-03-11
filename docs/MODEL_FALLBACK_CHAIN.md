# Model Fallback Chain (Phase 1)

This policy defines **how OpenClaw switches models** when the primary selection fails, times out, or is blocked by cost/availability. It specifies **chain order, triggers, retry/timeout interaction, and escalation**.

> **Related:** `docs/MODEL_ROUTING_POLICY.md`, `docs/MODEL_STRATEGY.md`, `docs/BUDGET_POLICY.md`, `docs/RETRY_POLICY.md`, `docs/TIMEOUT_POLICY.md`, `docs/DEGRADATION_POLICY.md`, `docs/QUALITY_CHECKS.md`.

---

## 1) Principles

1. **Safety > cost** — never downgrade safety‑critical tasks without approval.
2. **Retry before fallback** — apply retry/timeout policy first to avoid flapping.
3. **No silent downgrade** — disclose limitations whenever a lower tier is used.
4. **Read‑only bias in degrade modes** — prefer verification over side effects.
5. **Log every fallback** — include trigger, tier, and outcome.

---

## 2) Definitions

- **Primary model:** model selected by `docs/MODEL_ROUTING_POLICY.md`.
- **Fallback step:** move to the next model in the chain after retries or gates fail.
- **Chain:** ordered list of models permitted for a task class.
- **Outcome unknown:** a non‑idempotent action times out with no confirmation; do **not** retry or fallback.

---

## 3) Chain Selection (by Task Class)

| Task class | Primary | Fallback chain | Notes |
|---|---|---|---|
| **Strong‑required** | Strong | **Strong → Cheap → Local** | Cheap/Local only if task is **low‑risk** or user **approves** downgrade. Local is **read‑only only**. |
| **Cheap‑default** | Cheap | **Cheap → Strong** | Escalate to Strong on QA fail, ambiguity, or user request. |
| **Offline continuity** | Local | **Local only** | Allowed only for read‑only checks and simple transforms. |

**Local model constraints:**
- Allowed only for **read‑only** or **verification** actions.
- **Never** for publishing, payments, deletions, or config changes.

---

## 4) Fallback Triggers

### 4.1 Availability / Error Triggers
Fallback is allowed when the primary model fails **after retries** per `docs/RETRY_POLICY.md`:
- Network/5xx/timeout errors (T1) after max attempts
- Rate limits (T2) after max attempts
- Tool‑flake or transient model gateway errors (T4) after max attempts
- Explicit `model_unavailable` / provider outage

**Do NOT fallback** on **P0** signals (auth/config/security). Escalate to **D3**.

### 4.2 Budget / Policy Gates
- At **90% usage** (budget gate), Strong is blocked unless safety‑critical or approved.
- If Strong is blocked **and** task is low‑risk → fallback to Cheap.
- If Strong is required **and** blocked → request approval; otherwise **defer**.

### 4.3 Quality / Confidence Triggers
- Output fails `docs/QUALITY_CHECKS.md` (QA_FAIL) → fallback to Strong.
- QA_WARN with critical missing items → fallback to Strong.
- Model expresses **low confidence** or missing context for a required step.

### 4.4 Capability Mismatch
- Context window too small
- Required tool/function not supported
- Policy constraints (e.g., local‑only for read‑only)

### 4.5 Manual / User Triggers
- User requests a stronger model or explicit downgrade.

---

## 5) Retry + Timeout Interaction

1. **Apply timeouts first** per `docs/TIMEOUT_POLICY.md`.
2. **Apply retries** per `docs/RETRY_POLICY.md` (tiered by error class).
3. **Fallback only after** retries are exhausted **or** a non‑retryable gate is hit.
4. **Non‑idempotent + timeout (outcome unknown):**
   - **No retry** and **no fallback**.
   - Escalate to **P1/D2** and require verification.
5. **Chain budget:** total elapsed across retries + fallbacks must remain within the task’s SLA/cron budget. If not, **queue for next run**.
6. **No bounce‑back:** once a fallback is used in a task, do not switch back to higher tier within the same task without approval.

---

## 6) Escalation Rules

| Condition | Escalation | Action |
|---|---|---|
| **P0** (auth/config/security) | **D3** | Halt automation; require approval to resume. |
| **Repeated failure** (≥2 in 1h) | **D2** | Block side effects; ask for approval to continue. |
| **All models in chain fail** | **D2** | Queue work; notify user with impact. |
| **Strong required but downgraded** | **D2** | Require approval for any side‑effect actions. |

**User messaging:** always disclose the fallback step, limitations, and any skipped actions.

---

## 7) Required Logging (Fallback Chain)

Include all routing fields from `docs/MODEL_ROUTING_POLICY.md`, plus:
- `primary_model`
- `fallback_chain` (e.g., strong→cheap→local)
- `fallback_step` (index + model)
- `fallback_trigger` (availability/budget/quality/capability/user)
- `retry_tier`, `attempts`, `total_elapsed_ms`
- `degradation_tier` (D0–D3)
- `approval_required` + `approval_status`
- `outcome_unknown` (true/false)

---

## 8) Examples

### Example A — Strong required, strong unavailable
- Strong fails after T1 retries → fallback to Cheap
- Task is low‑risk → proceed with Cheap and note limitations
- Log `fallback_trigger=availability`, `fallback_step=2/3`

### Example B — Cheap default, QA fail
- Cheap output fails QA → escalate to Strong
- Log `fallback_trigger=quality`, `fallback_step=2/2`

### Example C — Budget‑gated Strong
- Budget at 90%; Strong blocked
- Task requires Strong → request approval and defer if not approved
- Log `fallback_trigger=budget`, `approval_required=true`

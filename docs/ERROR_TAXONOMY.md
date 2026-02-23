# Error Taxonomy (Phase 1)

This document standardizes **severity levels (P0/P1/P2)** for OpenClaw failures so retries, alerts, and human response are consistent across agents and scripts.

> **Quick link:** See `docs/RELIABILITY_PLAYBOOK.md` for retry/timeout defaults and degradation patterns.

---

## 1) Severity Overview

| Severity | Primary Criteria | Example Signals | Required Response | Logging / Alerting |
|---|---|---|---|---|
| **P0** | System down, auth broken, config invalid, data loss or security risk | Gateway not running, 401/403 auth failures, corrupted state, invalid config | **Stop automation**, alert immediately, recover only with approval | Log **ERROR** with full context; **page/alert immediately** (Ops channel) |
| **P1** | Repeated failures or persistent degradation | ≥2 failures in 1 hour, recurring timeouts, repeated 429s, partial outage | **Retry + degrade**, notify within 1 hour | Log **ERROR/WARN** with attempt + count; **alert within 1 hour** |
| **P2** | Transient / one‑off issues | Single 5xx, one timeout, short network glitch | **Retry silently**, continue | Log **WARN/INFO** once; **no alert** unless repeated |

> **Highest severity wins.** If any P0 signal is present, classify as P0 even if other criteria fit P1/P2.

---

## 2) P0 — System Down / Auth Broken

**Criteria (any):**
- Gateway process not running or cannot accept requests.
- Authentication is invalid or revoked (401/403).
- Configuration invalid or fails validation.
- Data loss/corruption risk, or security breach suspected.

**Examples:**
- `openclaw gateway status` reports stopped.
- OAuth token revoked; API returns 401/403 for valid requests.
- `openclaw doctor` fails due to invalid config schema.
- Corrupted state detected during reads/writes.

**Required response:**
1. **Stop automation** (no retries that could worsen state).
2. **Alert immediately** (Ops channel per `docs/OPS_RUNBOOK.md`).
3. Capture context: last 200 lines of error log, config hash, last action.
4. Recover only with explicit approval.

**Logging / alerting:**
- Log **ERROR** with component, root cause, last action, correlation ID.
- Alert within **5 minutes** (time‑sensitive). Include suspected cause + next step.

---

## 3) P1 — Repeated Failures / Persistent Degradation

**Criteria (any):**
- **≥2 similar failures within 1 hour** (timeouts, 5xx, tool errors).
- **Recurring 429s** or sustained rate limiting.
- Partial outage or repeated tool failure that blocks work.

**Examples:**
- Same tool call times out twice in one hour.
- Web API returns 429s across multiple attempts.
- Browser automation repeatedly fails on the same step.

**Required response:**
1. **Retry with backoff** (per `docs/RELIABILITY_PLAYBOOK.md`).
2. **Degrade gracefully** (skip non‑critical actions, report limitation).
3. **Alert within 1 hour** with summary + mitigation.

**Logging / alerting:**
- Log **ERROR/WARN** including attempt count, elapsed time, and retry plan.
- Aggregate and dedupe alerts (one alert per incident window).

---

## 4) P2 — Transient / Recoverable

**Criteria (all):**
- One‑off failure with no recurrence.
- No auth/config issues; system otherwise healthy.

**Examples:**
- Single 5xx response from external API.
- One network timeout while other requests succeed.

**Required response:**
1. **Retry silently** (max 2–3 attempts).
2. Continue if subsequent attempt succeeds.
3. **Escalate to P1** if repeated ≥2 times in 1 hour.

**Logging / alerting:**
- Log **INFO/WARN** once with minimal context.
- **No alert** unless escalation criteria are met.

---

## 5) Classification Rules (Deterministic)

1. **Auth/config/data‑loss/security signals are always P0.**
2. **Repeat counts matter:**
   - First occurrence → P2
   - Same failure **≥2× in 1 hour** → P1
3. **Highest severity wins** when multiple criteria apply.
4. If severity is uncertain, **default to higher** and note uncertainty.

---

## 6) Required Telemetry Fields

When logging errors, include:
- `severity` (P0/P1/P2)
- `component` (gateway/tool/agent/script)
- `error_code` + `error_message`
- `attempt` / `max_attempts`
- `correlation_id` (trace or request id)
- `last_action` (what was happening)
- `next_step` (retry/degrade/stop)

---

## 7) Escalation & Notification Rules

- **P0:** immediate alert (time‑sensitive), include logs + next steps.
- **P1:** alert within 1 hour; include frequency and impact.
- **P2:** no alert; escalate to P1 if repeated.

---

## 8) Related Docs

- `docs/RELIABILITY_PLAYBOOK.md` — retry/backoff + timeouts + degradation
- `docs/OPS_RUNBOOK.md` — incident checks and recovery steps

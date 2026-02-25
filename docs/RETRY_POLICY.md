# Retry Policy (Phase 1)

This policy standardizes **automatic retries with backoff** across OpenClaw tools, scripts, and agents. It defines **tiers by error class**, **max attempts**, **jitter**, **cooldown**, and **idempotency rules**.

> **Related:** `docs/RELIABILITY_PLAYBOOK.md` (summary + degradation), `docs/ERROR_TAXONOMY.md` (P0/P1/P2 severity).

---

## 1) Retry Decision Gate (Always Run First)

**Retry only when BOTH are true:**
1. **Error class allows retry** (see tiers below)
2. **Operation is safe to retry** (idempotent or explicitly deduped)

If either fails → **do not retry**; escalate per severity.

---

## 2) Retry Tiers by Error Class

| Tier | Error Class / Signal | Max Attempts | Base Backoff | Jitter | Notes |
|---|---|---:|---:|---|---|
| **T0 – No Retry** | Auth/config/data‑loss/security signals (401/403, invalid config, corruption) | 1 | 0s | none | **P0** → stop automation, alert immediately. |
| **T1 – Transient** | Network errors, DNS, connect resets, timeouts, 5xx | 3 | 2s | **Full jitter** | Escalate to **P1** if repeated ≥2× in 1 hour. |
| **T2 – Rate Limit** | 429 or explicit rate‑limit error | 5 | 10s | **Full jitter** | Respect `Retry‑After` if present. Cap delay at 5m. |
| **T3 – Resource Busy** | 409/423/425 or “resource locked/busy” | 2 | 4s | **Full jitter** | Only if idempotent or safe read/verify exists. |
| **T4 – Tool Flake** | Browser step or tool action failed once (no P0 signal) | 2 | 1s | **Full jitter** | One quick retry, then degrade/skip. |

**Full jitter:** `sleep = random(0, base * 2^(attempt-1))` (cap per tier).

**Default caps:**
- **T1:** max delay 30s; max elapsed 60s
- **T2:** max delay 5m; max elapsed 12m
- **T3:** max delay 15s
- **T4:** max delay 5s

---

## 3) Cooldown Rules (After Exhausting Retries)

If all attempts fail:
- **T1:** cooldown **15 minutes** before reattempting same operation.
- **T2:** cooldown **30 minutes** before reattempting same operation.
- **T3/T4:** cooldown until **next scheduled run**.

If the same failure occurs **≥2× in 1 hour**, escalate to **P1** and **degrade** the workflow (see `docs/RELIABILITY_PLAYBOOK.md`).

---

## 4) Idempotency Rules

### Safe to Retry (Idempotent)
- **Read‑only** operations (GET/list/status)
- Deterministic writes with **idempotency key**
- PUT/UPSERT operations where the payload is identical
- Actions with a **verify‑before‑retry** check (e.g., fetch by idempotency key)

### NOT Safe to Retry (Non‑idempotent)
- Payments, purchases, or irreversible writes
- External publishing (social posts, emails, notifications)
- Actions that create new records without a dedupe key

**Required for non‑idempotent actions:**
- Use an **idempotency key** or **dedupe check** before retrying.
- If result is unknown and cannot be verified → **do not retry**; alert/defer.

---

## 5) Required Logging Fields (Per Attempt)

Include these fields for **every retry attempt**:
- `timestamp`
- `component` (gateway/tool/agent/script)
- `operation` (what was attempted)
- `severity` (P0/P1/P2)
- `error_class` (auth/config/5xx/timeout/429/etc)
- `error_code`, `error_message`
- `tier` (T0–T4)
- `attempt`, `max_attempts`
- `backoff_ms`, `jitter_ms`, `elapsed_ms`
- `idempotent` (true/false)
- `idempotency_key` (if used)
- `retry_after_ms` (if provided)
- `cooldown_until` (if retries exhausted)
- `correlation_id` / `request_id`
- `next_step` (retry/degrade/stop)

---

## 6) Examples

### Example A — 503 from web_fetch (T1)
- Attempt 1: immediate → fails (503)
- Attempt 2: sleep **0–2s** (full jitter) → fails
- Attempt 3: sleep **0–4s** (full jitter) → succeed
- Log includes `tier=T1`, `attempt=2/3`, `backoff_ms=2000`, `jitter_ms=743`

### Example B — 429 with Retry‑After: 30s (T2)
- Attempt 1: immediate → 429 with `Retry‑After: 30`
- Attempt 2: sleep **30–60s** (respect header + jitter)
- Attempt 3–5: exponential with cap 5m
- If exhausted → cooldown 30m, alert if repeated

### Example C — Message send timeout (Non‑idempotent)
- Operation is **not idempotent** and result is unknown
- No idempotency key available → **no retry**
- Log `idempotent=false`, `tier=T0`, `next_step=defer`

---

## 7) Implementation Notes

- Use `scripts/retry.sh` for **basic exponential backoff**.
- For jitter, wrap sleep with a random delay before invoking retries.
- Always log the **decision** and **tier** even when not retrying.

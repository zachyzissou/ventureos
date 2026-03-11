# Timeout Policy (Phase 1)

This policy standardizes **connect/read/total timeouts** for network calls across OpenClaw tools, scripts, and agents. It defines **safe defaults**, **per‑operation types**, **override rules**, **escalation**, and **required logging**.

> **Related:** `docs/RELIABILITY_PLAYBOOK.md` (summary + degradation), `docs/RETRY_POLICY.md` (tiers + backoff), `docs/ERROR_TAXONOMY.md` (P0/P1/P2).

---

## 1) Timeout Types (Definitions)

| Timeout | Applies To | Meaning |
|---|---|---|
| **connect** | DNS + TCP/TLS handshake | Max time to establish a connection. |
| **read** | Response body | Max idle time waiting for response data once connected. |
| **total** | End‑to‑end request | Hard cap for the entire operation (connect + read + server time). |

**Rules:**
- `connect_timeout_ms <= read_timeout_ms <= total_timeout_ms`
- **Total** is the guardrail; it must never be omitted for network calls.
- For CLI wrappers (`scripts/with-timeout.sh`), **total only** is enforced at the process level.

---

## 2) Standard Defaults (by Operation Type)

| Operation Type | Examples | Connect | Read | Total | Notes |
|---|---|---:|---:|---:|---|
| **Low‑latency API** | message send, ack, webhook | 2s | 6s | 10s | Treat as non‑idempotent unless deduped. |
| **Standard API** | GitHub API, internal services | 3s | 12s | 20s | Default for typical GET/list/status. |
| **Web search/fetch** | `web_search`, `web_fetch` | 3s | 12s | 20s | Aligns with Reliability Playbook defaults. |
| **Browser action** | page navigation, click + wait | 5s | 20s | 30s | One quick retry max (T4). |
| **CLI network command** | `gh`, `curl`, `bird-auth` | 5s | 30s | 60s | Use `guarded-run.sh` (total) + tool‑specific timeouts when available. |
| **Large transfer** | file upload/download | 10s | 60s | 90s | Only with explicit override + log reason. |
| **Local exec (no network)** | file ops, git, scripts | — | — | 60s | Enforce via `with-timeout.sh`. |
| **Cron agent turn** | end‑to‑end run | — | — | 5–10 min | Budget includes retries + tool calls. |

**Safe default if unknown:** `connect=3s`, `read=12s`, `total=20s`.

---

## 3) Override & Budget Rules

1. **Override only when justified** (payload size, known slow dependency, or upstream SLA).
2. **Log the override** with `timeout_override=true` and `override_reason`.
3. **Keep retry budgets sane:**
   - `max_attempts * total_timeout_ms` should stay within the **retry tier max elapsed** (`docs/RETRY_POLICY.md`).
   - For T1, keep total elapsed **≤ 60s** unless explicitly documented.
4. **Non‑idempotent actions** must **not retry** if the outcome is unknown after a timeout (see Section 5).

---

## 4) Escalation Rules (Timeouts)

**Baseline severity:**
- **Single timeout** → **P2** (transient), retry per `docs/RETRY_POLICY.md`.
- **Repeated timeouts** (≥2 within 1 hour) → **P1** + degrade workflow.

**Special cases:**
- **Non‑idempotent timeout with unknown outcome** → treat as **P1**, **do not retry**, require verification.
- **Timeouts that block safety‑critical workflows** (auth, payments, data integrity) → **P0**.

---

## 5) Required Logging Fields (Timeouts)

Include all fields from `docs/RETRY_POLICY.md` **plus**:
- `timeout_type` (`connect` | `read` | `total`)
- `connect_timeout_ms`, `read_timeout_ms`, `total_timeout_ms`
- `timeout_ms` (actual threshold hit)
- `elapsed_ms` (actual elapsed time)
- `dependency` (service/tool name)
- `method` (GET/POST/etc or tool action)
- `endpoint` (host/path or tool target)
- `timeout_override` (true/false)
- `override_reason` (if override)
- `outcome_unknown` (true/false)

---

## 6) Examples

### Example A — Standard API (GET)
- Operation: `web_fetch`
- Timeouts: connect **3s**, read **12s**, total **20s**
- Timeout hit: **read** at 12s → retry (T1)
- Log: `timeout_type=read`, `error_class=timeout`, `attempt=1/3`

### Example B — Message send (non‑idempotent)
- Operation: message send
- Timeouts: connect **2s**, read **6s**, total **10s**
- Timeout hit: **total** at 10s → **no retry**
- Log: `idempotent=false`, `outcome_unknown=true`, `severity=P1`

### Example C — Large file upload (override)
- Operation: upload
- Override: connect **10s**, read **60s**, total **90s**
- Log: `timeout_override=true`, `override_reason="large payload"`

---

## 7) Implementation Notes

- Use `scripts/with-timeout.sh` for **total** timeout on CLI calls.
- Where supported, set **connect/read/total** explicitly in HTTP clients.
- Keep defaults aligned with `docs/RELIABILITY_PLAYBOOK.md` and `docs/RETRY_POLICY.md`.

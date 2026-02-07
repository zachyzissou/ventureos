# Reliability Playbook (Phase 1)

This playbook standardizes **retries, timeouts, error taxonomy, and graceful degradation** for OpenClaw workflows.

---

## 1) Error Taxonomy

### P0 — System Down / Auth Broken
**Signals:** gateway not running, auth invalid, config invalid.
**Action:** stop, alert immediately, recover with approval.

### P1 — Repeated Failures / Timeouts
**Signals:** recurring tool failures, RPC timeouts, rate limits.
**Action:** retry/backoff, degrade, alert within 1 hour.

### P2 — Transient / Recoverable
**Signals:** one‑off network errors, temporary 5xx.
**Action:** retry silently, log only.

---

## 2) Retry + Backoff Policy

**Default:** max 3 attempts, exponential backoff with jitter.

- Attempt 1: immediate
- Attempt 2: base × 2
- Attempt 3: base × 4

**Never retry:**
- 401/403 (auth issues)
- 4xx (except 429)

**Retry:**
- 429 (rate limit) with longer backoff
- 5xx, timeouts, network errors

**Script helper:** `scripts/retry.sh`

---

## 3) Timeout Standards

**General defaults:**
- **exec:** 60s (local commands)
- **web_search/web_fetch:** 20s
- **browser actions:** 30s
- **message send:** 10s
- **cron agent turns:** 5–10 min

**Script helper:** `scripts/with-timeout.sh`

---

## 4) Graceful Degradation

When a dependency fails:
- **Web search down:** use cached memory; report limitation.
- **Bird auth fails:** skip social checks and alert; do not spam retries.
- **GitHub API fails:** report “status unknown” and retry next run.
- **Discord send fails:** fall back to log + retry next run.

---

## 5) Implementation Notes

- Use `scripts/with-timeout.sh` for long‑running shell calls in cron payloads.
- Use `scripts/retry.sh` when calling external APIs or network commands.
- Update cron job messages to avoid ambiguous delivery (always include `channel` + `to`).

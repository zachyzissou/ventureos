# Reliability Playbook (Phase 1)

This playbook standardizes **retries, timeouts, error taxonomy, and graceful degradation** for OpenClaw workflows.

---

## 1) Error Taxonomy (Summary)

**Full definitions:** see `docs/ERROR_TAXONOMY.md` for detailed criteria, examples, and telemetry requirements.

| Severity | Primary Signals | Required Response | Alerting |
|---|---|---|---|
| **P0** | gateway down, auth invalid (401/403), config invalid, data loss risk | **Stop automation**, recover only with approval | **Immediate alert** |
| **P1** | repeated failures/timeouts, recurring 429s, partial outage | **Retry + degrade**, investigate | **Alert within 1 hour** |
| **P2** | transient 5xx, one‑off timeout, short network hiccup | **Retry silently**, continue | **No alert** (unless repeated) |

**Classification cues:**
- **P0** if any auth/config/data‑loss/security signal exists.
- **P1** when the same failure repeats **≥2× in 1 hour**.
- **P2** for a single, recoverable failure.

---

## 2) Retry + Backoff Policy

**Authoritative policy:** see `docs/RETRY_POLICY.md` for tiers, jitter, cooldown, and idempotency rules.

**Summary:**
- **Tiered by error class** (T0–T4). Default transient errors: **3 attempts**, exponential backoff with **full jitter**.
- **Never retry** auth/config/data‑loss/security signals (P0) or unsafe non‑idempotent actions.
- **Rate limits (429)** respect `Retry‑After` and use longer backoff.
- **Required logging fields** per attempt are defined in `docs/RETRY_POLICY.md`.

**Script helpers:**
- `scripts/retry.sh`
- `scripts/guarded-run.sh` (retry + timeout standard wrapper)

---

## 3) Timeout Standards

**Authoritative policy:** `docs/TIMEOUT_POLICY.md` (connect/read/total defaults, overrides, logging).

**Summary defaults (total timeout):**
- **exec:** 60s (local commands)
- **web_search/web_fetch:** 20s
- **browser actions:** 30s
- **message send:** 10s
- **cron agent turns:** 5–10 min

**Script helper:** `scripts/with-timeout.sh` (use `guarded-run.sh` for retry + timeout)

---

## 4) Graceful Degradation

**Authoritative policy:** `docs/DEGRADATION_POLICY.md` (tiers, fallbacks, user messaging + approvals).

**Tier summary:**
- **D0 Normal:** no degradation.
- **D1 Soft Degrade (P2):** skip optional steps, use cached data, note limitations.
- **D2 Hard Degrade (P1 or outcome unknown):** read‑only + queue; block side effects unless approved.
- **D3 Halt (P0):** stop automation; alert; require explicit approval to resume.

When a dependency fails:
- Classify severity (P0/P1/P2) → map to D1/D2/D3.
- Prefer **read‑only** actions and **queue** work in D2.
- Never retry unsafe non‑idempotent actions.

### Degradation Matrix (quick reference)
| Dependency | Primary Action | Fallback (D1/D2) | Tier |
|---|---|---|---|
| GitHub/GitLab API | Retry (T1) | Use local git; mark status unknown; block merges in D2 | D1/D2 |
| Bird auth | No retry on 401/403 | Skip social publish; alert; require re‑auth | D3 |
| Web search | Retry (T1) | Use cached memory or local docs | D1 |
| Discord/Message send | Retry (T1) | Log + queue delivery; retry next run | D1/D2 |
| Browser automation | Retry (T4) | Use API or manual steps; block submit in D2 | D1/D2 |
| Model/LLM | Retry (T1) | Fallback model for low‑risk; defer safety‑critical | D1/D2 |

---

## 5) Output QA Checks (Format + Completeness)

**Authoritative policy:** `docs/QUALITY_CHECKS.md`

**Summary:** All mission outputs and gate artifacts must pass **format + completeness** checks before archive. Use QA statuses:
- **QA_PASS:** proceed
- **QA_WARN:** proceed with limitations noted
- **QA_FAIL:** hold output, return for rework

---

## 6) Implementation Notes

- Use `scripts/with-timeout.sh` for long‑running shell calls in cron payloads.
- Use `scripts/retry.sh` when calling external APIs or network commands.
- Update cron job messages to avoid ambiguous delivery (always include `channel` + `to`).

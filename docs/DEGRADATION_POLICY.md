# Degradation Policy (Phase 1)

This policy defines **how OpenClaw/VentureOS degrades gracefully** when dependencies fail. It standardizes **degradation tiers**, **fallback behaviors by subsystem**, and **user messaging + approval rules**.

> **Related:** `docs/ERROR_TAXONOMY.md`, `docs/RETRY_POLICY.md`, `docs/TIMEOUT_POLICY.md`, `docs/RELIABILITY_PLAYBOOK.md`, `docs/GUARDRAILS.md`.

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

1. **Classify severity** using `docs/ERROR_TAXONOMY.md`.
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
- Immediate stop notice + alerting per `docs/OPS_RUNBOOK.md`.
- Require explicit approval to resume after recovery.

**Guardrails apply at all tiers** (see `docs/GUARDRAILS.md`).

---

## 6) Required Logging Fields (Degradation Events)

Include **all retry/error fields** from `docs/RETRY_POLICY.md` and add:
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

## 7) Cron Job Degradation Matrix

This matrix maps **every cron job** to its degradation behavior, timeout/retry config, and failure impact. All jobs are executed via `scripts/cron-runner.sh` which reads `config/reliability.json`.

| # | Job | Schedule | Timeout | Retries | Network? | On Timeout | On Failure | Degradation | Impact if Skipped |
|---|---|---|---:|---:|:---:|---|---|:---:|---|
| 1 | **Nightly Backup** | `0 8 * * *` | 120s | 1 | No | D1: log + alert next run | D1: alert; manual backup needed | D1 | Backup gap (max 48h until next) |
| 2 | **Backup Verify** | `30 8 * * 0` | 60s | 1 | No | D1: log; verify next week | D1: alert; unknown backup integrity | D1 | Unverified backup (1 week) |
| 3 | **Monitoring** | `*/15 * * * *` | 30s | 1 | No | D2: alerting gap | D2: log locally; next run in 15m | D2 | 15-30m blind spot |
| 4 | **Budget Check** | `0 15 * * *` | 60s | 3 | **Yes** | D1: use last known budget | D1: skip; check manually | D1 | Stale budget data (24h) |
| 5 | **Export Cron Logs** | `*/30 * * * *` | 60s | 1 | No | D1: logs delayed | D1: retry next 30m cycle | D1 | Log export gap (30-60m) |
| 6 | **Archive Task Runs** | `0 9 1 * *` | 120s | 1 | No | D1: archive next month | D1: disk accumulation; non-critical | D1 | Old logs not archived |
| 7 | **Workspace Health** | `0 9 * * *` | 120s | 2 | **Yes** | D1: last health data | D1: scan ok, webhook alert failed → log | D1 | No health alert for 24h |
| 8 | **Phantom Detector** | `*/30 * * * *` | 120s | 2 | **Yes** | D1: check next cycle | D1: scan ok, webhook failed → log | D1 | Phantom detection gap |
| 9 | **Session Rotation** | `0 8 * * *` | 180s | 1 | **Yes** | D2: sessions accumulate | D2: spawn risk increases; manual rotation needed | D2 | Session bloat risk |
| 10 | **Session Monitor** | `0 */6 * * *` | 60s | 2 | **Yes** | D1: check next 6h cycle | D1: auto-rotate skipped | D1 | 6h monitoring gap |
| 11 | **Routing Healthcheck** | `*/30 * * * *` | 30s | 2 | **Yes** | D2: routing unknown | D2: alert routing may be broken | D2 | Missed P1 alerts |
| 12 | **OpenClaw Local Readiness Refresh** | `15 */4 * * *` | 180s | 1 | No | D1: keep prior readiness snapshot | D1: no doc/artifact refresh for this cycle | D1 | Stale local readiness card/evidence |
| 13 | **VB-003 Telemetry Synthesis** | `30 */6 * * *` | 120s | 1 | No | D1: keep prior synthesis artifact | D1: telemetry summary not refreshed this cycle | D1 | Delayed VB-003 evidence updates |
| 14 | **VB-003 Watchdog** | `45 */3 * * *` | 60s | 1 | No | D1: keep prior watchdog artifact | D1: short-window drift checks delayed | D1 | Telemetry freshness/regression detection lag |

### Failure Cascades

**High-risk cascade:** If Session Rotation (9) fails for multiple days → session counts grow → phantom sessions → spawn failures → all agents degraded → D3.

**Mitigation:** Session Monitor (10) triggers auto-rotation on critical counts, providing a safety net. Workspace Health (7) provides additional visibility.

**Alerting cascade:** If Routing Healthcheck (11) fails → webhook alerts for other jobs also fail → silent failures.

**Mitigation:** Monitoring (3) uses local-only checks (no webhook dependency). All jobs log locally to `runtime/logs/cron-runs/` regardless of webhook status.

---

## 8) Examples

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

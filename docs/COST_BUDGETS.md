# Cost Budgets + Alerts

This policy defines **budget thresholds, alert routing, enforcement actions, and reporting cadence** for model usage costs/quotas.

> **Related:** `docs/BUDGET_POLICY.md`, `docs/MODEL_ROUTING_POLICY.md`, `docs/SLA_POLICY.md`, `docs/CRON_SPECS.md`.

---

## 1) Budget Sources + Caps
Budget checks are based on **subscription quotas / provider caps** tracked by `subscription-quota-tracker.js`.

| Provider | Cap / Window | Type | Notes |
|---|---|---|---|
| **Anthropic** | 10,000 points / month | Hard | Monthly quota resets on provider cycle |
| **OpenAI Codex** | 50 msgs / 3h window | Soft | Use throttling + routing gates |
| **Gemini** | 100 queries / day | Soft | Daily reset |

**Budget math:** thresholds are evaluated as **% of the active cap** (monthly for Anthropic, rolling/ daily for others).

---

## 2) Thresholds + States

| Usage % | State | Alert Level | Routing / Impact |
|---|---|---|---|
| **0–49%** | Green | None | Normal operation |
| **50–79%** | Yellow | FYI | Notify for awareness; no routing changes |
| **80–89%** | Orange | Warning | Require explicit justification for **Strong**; defer non‑critical batch work |
| **90–100%** | Red | Critical | **Restrict to Cheap** unless safety‑critical or explicitly approved |
| **>100%** | Emergency | Stop | Pause non‑critical usage; require manual approval for any spend |

---

## 3) Alert Routing

**Primary channel:** `discord:slurpnet-alerts`

| State | Who gets alerted | Escalation window | Notes |
|---|---|---|---|
| **Yellow (50%)** | `slurpnet-alerts` (FYI) | 24h | Include current % + forecast |
| **Orange (80%)** | `slurpnet-alerts` | 4h | Tag owner; include gate status |
| **Red (90%)** | `slurpnet-alerts` | 1h | Treat as P1; require acknowledgement |
| **Emergency (>100%)** | `slurpnet-alerts` | Immediate | Treat as P0; open incident note |

**Alert payload (minimum):** provider, period, usage, cap, % used, state, gates enforced, recommended action.

---

## 4) Enforcement Actions

**At 80% (Warning):**
- **Strong model requires explicit justification** in routing log.
- **Defer non‑critical batch work** and “nice to have” tasks.
- Prefer **Cheap** for summaries, formatting, and low‑risk tasks.

**At 90% (Critical):**
- **Restrict to Cheap** unless **safety‑critical** or the user explicitly approves higher cost.
- Pause discretionary workflows that are not time‑sensitive.
- Require acknowledgement in alert channel before resuming Strong use.

**At >100% (Emergency):**
- **Freeze non‑critical usage**; manual approval required for any spend.
- Open a brief incident note (date, cause, mitigation) and review caps.

---

## 5) Reporting Cadence

- **Daily:** `scripts/budget-check.sh` at **09:00** (see `docs/CRON_SPECS.md`).
- **Weekly:** Include budget summary in weekly digest (7‑day usage + forecast).
- **Monthly:** Review caps/usage and update **BUDGET_POLICY.md** if limits change.

---

## 6) Logging Requirements
Budget checks and alerts must record:
- provider, period_start/period_end
- cap, usage, percent_used
- state (green/yellow/orange/red/emergency)
- gates enforced + actions taken

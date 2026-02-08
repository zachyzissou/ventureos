# Proactive Rules Framework

This document defines the **rule model** used by the proactive scheduler. Rules determine **when** work is eligible, **how** it is prioritized, and **which safety gates** must pass before execution.

> Scope: rule evaluation + scheduling. Queue schema remains in **PROACTIVE_ENGINE.md**.

---

## 1) Rule Lifecycle (Evaluation Order)

1. **Trigger fires** (cron/event/manual).
2. **Suppression checks** (dedupe + cooldown).
3. **Safety gates** (guardrails, approvals, budget, risk).
4. **Window gating** (active window + quiet hours).
5. **Queue placement** with tier/priority & nextRunAt.
6. **Escalation routing** if rule fails or SLO breached.

---

## 2) Rule Schema (v1)

```json
{
  "id": "rule.monitor.openclaw",
  "name": "Monitor OpenClaw health",
  "enabled": true,
  "description": "Run health checks and raise P0/P1 alerts.",

  "tier": "P0",
  "priority": 100,

  "trigger": {
    "type": "cron",
    "schedule": "*/15 * * * *"
  },

  "window": {
    "tz": "America/Chicago",
    "active": [
      {"days": "mon-sun", "start": "08:00", "end": "23:00"}
    ],
    "quiet": {"start": "23:00", "end": "08:00", "allowTiers": ["P0"]},
    "blackouts": [
      {"start": "2026-02-15", "end": "2026-02-16", "reason": "Maintenance"}
    ]
  },

  "cooldown": {"success": "5m", "failure": "15m"},
  "dedupe": {"key": "monitor-openclaw", "suppressFor": "30m"},

  "retries": {"maxAttempts": 3, "backoff": "exponential", "maxDelay": "1h"},
  "timeoutSeconds": 300,
  "concurrency": {"maxInFlight": 1, "longRunningSeconds": 60},

  "escalation": {
    "on": ["fail", "slo_breach"],
    "targets": ["discord:slurpnet-alerts"],
    "within": "15m",
    "autoEscalateAfter": "1h"
  },

  "safety": {
    "requiresApproval": false,
    "allowCommands": ["scripts/monitor-openclaw.sh"],
    "budgetGate": "warn80",
    "dataClass": "internal",
    "sideEffects": "read_only",
    "risk": "low"
  },

  "queue": {"priorityBoost": 0}
}
```

### Field Notes
- **tier**: `P0 | P1 | P2 | P3` (see **SLA_POLICY.md** for SLA tiers).
- **priority**: integer (higher = earlier). Used within the same tier.
- **trigger**: `cron | event | manual`. `event` requires an event key + filters.
- **window**: time gating, with optional **quiet** sub‑window and **blackouts**.
- **cooldown**: minimum time between runs (separate success/failure buckets).
- **dedupe**: suppress duplicate errors or duplicate queued work.
- **retries**: backoff policy (must follow RETRY_POLICY.md).
- **escalation**: who to notify + how fast; can auto‑escalate on repeated failure.
- **safety**: explicit gates for approvals, allowlists, budget, data sensitivity.

---

## 3) Time Windows + Quiet Hours

- **Active window** controls *when* non‑critical work is eligible.
- **Quiet hours** block P1‑P3 and **queue** them for the next active window.
- **Blackouts** are absolute blocks (maintenance, change freeze, etc.).

**Defaults** (unless overridden per rule):
- Active window: **08:00–23:00 CST**
- Quiet hours: **23:00–08:00 CST** (P0 only)

---

## 4) Priority & SLA Mapping

| Tier | SLA target | Execution in quiet hours | Default queue weight |
|---|---|---|---|
| **P0** | immediate | ✅ allowed | 100 |
| **P1** | ≤ 1 hour | ❌ queue | 80 |
| **P2** | ≤ 24 hours | ❌ queue | 60 |
| **P3** | best effort | ❌ queue | 40 |

**priority** is an extra integer **within a tier** to break ties.

---

## 5) Cooldowns + Suppression

- **Cooldown (success)**: minimum delay after a successful run.
- **Cooldown (failure)**: minimum delay after a failed run.
- **Dedupe**: if a rule emits the **same error** within `suppressFor`, skip re‑enqueue.

These limits protect against flapping and keep the queue stable.

---

## 6) Escalation Policy

Escalation routes are rule‑specific and tier‑aware:
- **P0:** immediate alert to `discord:slurpnet-alerts`.
- **P1:** alert within 1 hour; auto‑escalate if 2 failures in a row.
- **P2/P3:** log only unless explicitly overridden.

Rules can override:
- **targets** (channels/roles)
- **within** (deadline)
- **autoEscalateAfter** (secondary paging)

---

## 7) Safety Gates (Required)

Every rule must pass **all** gates before execution:

1. **Guardrails** → must comply with **GUARDRAILS.md** (no disallowed actions).
2. **Budget gate** → respect **BUDGET_POLICY.md** thresholds.
3. **Data sensitivity** → `public | internal | confidential | restricted`.
4. **Side‑effect gate** → `read_only | reversible | destructive`.
5. **Approval gate** → if `requiresApproval: true`, queue for human approval.
6. **Change freeze / blackout** → block if in blackout window.

**Default rule safety:** `read_only` + `internal` + `requiresApproval=false`.

---

## 8) Examples

### Example A — P2 Weekly Digest (quiet hours deferred)
```json
{
  "id": "rule.weekly.digest",
  "name": "Weekly digest report",
  "enabled": true,
  "tier": "P2",
  "priority": 55,
  "trigger": {"type": "cron", "schedule": "0 9 * * 0"},
  "window": {"tz": "America/Chicago"},
  "cooldown": {"success": "7d", "failure": "1d"},
  "dedupe": {"key": "digest-weekly", "suppressFor": "24h"},
  "timeoutSeconds": 900,
  "escalation": {"on": ["fail"], "targets": [], "within": "24h"},
  "safety": {"requiresApproval": true, "sideEffects": "reversible", "dataClass": "internal"}
}
```

### Example B — P1 Budget Check (rate‑limited + escalation)
```json
{
  "id": "rule.budget.check",
  "name": "Budget check",
  "enabled": true,
  "tier": "P1",
  "priority": 85,
  "trigger": {"type": "cron", "schedule": "0 9 * * *"},
  "cooldown": {"success": "12h", "failure": "1h"},
  "retries": {"maxAttempts": 3, "backoff": "exponential", "maxDelay": "1h"},
  "escalation": {"on": ["fail", "threshold_breach"], "targets": ["discord:slurpnet-alerts"], "within": "1h"},
  "safety": {"requiresApproval": false, "sideEffects": "read_only", "dataClass": "internal"}
}
```

---

## 9) Storage + Ownership

- Rules live in **`~/clawd/runtime/proactive-rules.json`** (disabled by default).
- Changes must follow **CONFIG_CHANGE_SAFETY.md**.
- **DOCS**: update **PROACTIVE_ENGINE.md** + **DOC_INDEX.md** when schema changes.

# Architecture – OpenClaw Upgrade

## Overview
This upgrade adds **policy + ops infrastructure** around OpenClaw. It does not replace OpenClaw core; it layers **docs, scripts, cron jobs, and logs** to make the system reliable and auditable.

### Key Components
1. **Policy Layer** (docs): goals, guardrails, proactive rules, model strategy, budget policy.
2. **Orchestration Layer** (OpenClaw cron): schedules scripts and reminders.
3. **Ops Scripts**: backup, verify, monitor, log export, budget check.
4. **Observability**: JSONL execution logs + backup logs.
5. **Alerting**: Discord DM for P0/P1.
6. **Task Queue**: conceptual tiers (urgent/normal/low) for scheduled jobs.

---

## Data Flow (High Level)
```
Human intent ──> Policy docs (guardrails, budgets)
                    ↓
               OpenClaw agent
                    ↓
             Cron / Heartbeat
                    ↓
             Ops scripts run
                    ↓
          Logs + Alerts output
                    ↓
          Human visibility + action
```

---

## Subsystems

### 1) Policy & Prompting
- **Inputs:** Human preferences + defaults
- **Outputs:** Written rules; referenced by AGENTS/HEARTBEAT

### 2) Reliability Monitoring
- **Signals:** gateway status, auth errors, timeouts
- **Actions:** log + alert (no auto‑restart without approval)

### 3) Backups
- **Sources:** `openclaw.json`, `jobs.json`, `memory/`, `state.json`
- **Destination:** `~/backups/clawd/`
- **Verification:** weekly checksum + test extract

### 4) Budget Control
- **Source:** subscription‑quota tracker
- **Action:** report + alert at 50/80/90%

### 5) Execution Logging
- **Source:** `~/.openclaw/cron/runs/*.jsonl`
- **Output:** daily aggregated JSONL for audit

---

## Dependencies
- OpenClaw cron scheduler
- `gh` (GitHub CLI) for repo monitoring
- `bird` for Twitter (where applicable)
- `subscription-quota-tracker.js` (existing)

---

## Failure Modes + Mitigations
- **Cron jobs not firing:** avoid `wakeMode=next-heartbeat` for critical jobs.
- **Auth errors:** monitor logs; alert for manual re‑auth.
- **Backup corruption:** verify weekly; retain 30 days.
- **Log growth:** JSONL retention policy.

# Architecture – VentureOS

## Overview
VentureOS layers **policy + ops infrastructure** around OpenClaw. It does not replace OpenClaw core; it adds **docs, scripts, cron jobs, and logs** to make the system reliable and auditable.

### Key Components
1. **Policy Layer** (docs): goals, guardrails, proactive rules, model strategy, quota policy.
2. **Orchestration Layer** (OpenClaw cron): schedules scripts and reminders.
3. **Ops Scripts**: backup, verify, monitor, log export, quota check.
4. **Observability**: JSONL execution logs + backup logs.
5. **Alerting**: Discord → SlurpNet alerts channel for P0/P1.
6. **Task Queue**: durable queue with SLA tiers (P0–P3) + backoff/suppression.
7. **Memory System**: three‑layer memory (daily logs → entity facts → synthesized memory).
8. **Business Unit Registry (VentureOS):** a structured catalog of companies/products/brands and their automations, KPIs, and canonical notes.
9. **Mission Control (VentureOS):** mission briefs → squads → safety/QA gates → durable artifacts.
10. **Dashboard** (`dashboard/`): operational monitoring HTTP server — KPI tracking, agent health, session management, cost analysis, and real-time SSE feed. Zero external dependencies (Node.js `http` module). See [DASHBOARD.md](DASHBOARD.md) and [API reference](../dashboard/docs/API.md).

---

## Data Flow (High Level)
```
Human intent ──> Policy docs (guardrails, quota policy)
                    ↓
               OpenClaw agent
                    ↓
             Cron / Heartbeat
                    ↓
             Ops scripts run
                    ↓
          Logs + Alerts output ──> Dashboard (HTTP API + SSE)
                    ↓                    ↓
          Human visibility         Tactical Map (/map/)
                    ↓                    ↓
               Human action        Browser UI
```

### Dashboard Data Flow
```
KPI JSON files ──────────┐
Agent sessions (JSONL) ──┤
Observations (.md) ──────┼──> Dashboard Server ──> REST API
Shared context ──────────┤         ↓                  ↓
System stats (OS) ───────┘    SSE /api/live      Browser UI
                                                 Tactical Map
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

### 4) Quota Control
- **Source:** subscription‑quota tracker
- **Action:** report + alert at 50/80/90%

### 5) Execution Logging
- **Source:** `~/.openclaw/cron/runs/*.jsonl`
- **Output:** daily aggregated JSONL for audit

### 6) Memory System (Three‑Layer)
- **Layer 1:** Entity knowledge graph (Obsidian `life/areas/entities/` with `items.json` + `summary.md`)
- **Layer 2:** Daily logs (`~/clawd/memory/YYYY-MM-DD.md`)
- **Layer 3:** Tacit knowledge (`~/clawd/MEMORY.md`)
- **Process:** cheap fact extraction → entity store; weekly synthesis rewrites summaries; supersede‑not‑delete

### 7) VentureOS (Business Units + Mission Control)
- **Business Units:** durable registry of portfolio units (games, apps, media brands, infra) with goals, KPIs, canonical notes, and automation inventory.
- **Missions:** discrete work packages that produce linked artifacts; mission metadata is carried through the task queue and run logs.
- **Roles:** implemented first as role cards + spawned sub‑sessions; later can be formalized into distinct agent profiles with explicit approval.

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

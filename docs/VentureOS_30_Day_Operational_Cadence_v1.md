# VentureOS 30-Day Operational Cadence v1

Date: 2026-03-12
Scope: Daily/weekly/monthly runbook for Phase A departments (Executive Office, Operations, Data/Analytics, Finance) with extensions for Phase B/C as they come online.

**Prerequisites:** This cadence is aligned with all four v1 artifacts:
- `VentureOS_Department_Architecture_v1.md` — department missions and handoffs
- `VentureOS_Implementation_Plan_v1.md` — Phase 0 starts Mar 16, 2026
- `VentureOS_Department_KPI_SLA_v1.md` — KPI targets and handoff SLAs
- `VentureOS_Lane_Contracts_v1.md` — Director/Operator/Auditor lane obligations

Gaps identified in `VentureOS_Execution_Gap_Assessment_v1.md` apply. Critical prerequisite: evidence infrastructure (store, schema, retention) must be built before Phase 0 activates.

---

## Daily cadence

### D-1. Morning operations sweep (09:00)

| Step | Owner | Action | Evidence output |
|---|---|---|---|
| 1 | Operations — Operator Agent | Check all agent health: running, errored, stalled | `logs/daily/YYYY-MM-DD-agent-health.json` |
| 2 | Operations — Operator Agent | Review overnight incident queue; triage new items | Updated incident log with severity + owner |
| 3 | Data/Analytics — Operator Agent | Validate dashboard data freshness (all sources < 24h old) | Data freshness check result in daily log |
| 4 | Finance — Operator Agent | Record daily burn (API costs, infrastructure spend) | `logs/daily/YYYY-MM-DD-spend.json` |

### D-2. Department standup updates (09:30)

| Step | Owner | Action | Evidence output |
|---|---|---|---|
| 1 | Each active department Director Agent | Post async standup: yesterday done, today plan, blockers | Standup entry in department log |
| 2 | Operations — Program Control Agent | Scan standups for cross-department blockers | Blocker list with escalation status |
| 3 | Executive — Chief of Staff Agent | Review escalated blockers; issue directives if needed | Decision log entry (if any) |

### D-3. Revenue pipeline delta (16:00, Phase B+)

| Step | Owner | Action | Evidence output |
|---|---|---|---|
| 1 | Sales — Operator Agent | Update pipeline with day's activity | Pipeline delta report |
| 2 | Marketing — Operator Agent | Report MQL/lead flow for the day | MQL daily count |
| 3 | CS — Operator Agent | Flag any new churn risk signals | Churn risk update |

---

## Weekly cadence

### W-1. Executive operating review (Monday 10:00)

| Step | Owner | Action | Evidence output |
|---|---|---|---|
| 1 | Data/Analytics — Director Agent | Compile KPI snapshot across all active departments | `reports/weekly/YYYY-MM-DD-kpi-snapshot.json` |
| 2 | Operations — Program Control Agent | Compile SLA compliance report (handoffs met/missed) | SLA compliance summary |
| 3 | Finance — Director Agent | Produce spend vs. budget variance report | Variance report with delta from plan |
| 4 | Executive — Director Agent | Review KPI + SLA + variance; log decisions | Decision log with owner + deadline per item |
| 5 | Executive — Chief of Staff Agent | Distribute action items to department Directors | Action item distribution confirmation |

### W-2. Product/Engineering planning sync (Monday 14:00, Phase B+)

| Step | Owner | Action | Evidence output |
|---|---|---|---|
| 1 | Product — Director Agent | Present prioritized backlog + upcoming spec status | Backlog snapshot |
| 2 | Engineering — Director Agent | Report capacity, in-flight work, tech debt items | Engineering status report |
| 3 | Both | Agree on iteration scope | Iteration scope agreement (signed off) |

### W-3. GTM sync (Wednesday 10:00, Phase B+)

| Step | Owner | Action | Evidence output |
|---|---|---|---|
| 1 | Marketing — Director Agent | Campaign performance + pipeline contribution | Campaign report |
| 2 | Sales — Director Agent | Pipeline health + forecast update | Pipeline report |
| 3 | CS — Director Agent | Customer health + VOC packet | VOC weekly packet |
| 4 | All three | Identify handoff issues, agree on adjustments | GTM sync notes |

### W-4. Finance spend/variance review (Friday 15:00)

| Step | Owner | Action | Evidence output |
|---|---|---|---|
| 1 | Finance — Operator Agent | Aggregate week's daily spend logs | Weekly spend summary |
| 2 | Finance — Director Agent | Compare to budget; flag variances > 10% | Variance flag list |
| 3 | Finance — Auditor Agent | Verify spend data against source systems | Audit confirmation |

### W-5. Operations incident retro (Friday 16:00)

| Step | Owner | Action | Evidence output |
|---|---|---|---|
| 1 | Operations — Operator Agent | Compile week's incidents with resolution status | Incident summary |
| 2 | Operations — Director Agent | Identify patterns; propose SOP updates | SOP change proposals |
| 3 | Operations — Auditor Agent | Verify incident resolutions are complete | Retro sign-off |

---

## Monthly cadence

### M-1. Forecast refresh (1st business day)

| Step | Owner | Action | Evidence output |
|---|---|---|---|
| 1 | Finance — Director Agent | Produce updated runway forecast (3/6/12 month) | `reports/monthly/YYYY-MM-forecast.md` |
| 2 | Sales — Director Agent (Phase B+) | Submit pipeline forecast for next 90 days | Sales forecast |
| 3 | Product — Director Agent (Phase B+) | Submit resource needs for next quarter | Product resource request |
| 4 | Executive — Director Agent | Review forecasts; adjust allocations if needed | Allocation decision log |

### M-2. Security and compliance review (1st week)

| Step | Owner | Action | Evidence output |
|---|---|---|---|
| 1 | IT/Security — Director Agent (Phase C) | Produce access audit + incident summary | Security monthly report |
| 2 | Legal — Director Agent (Phase C) | Review compliance checklist status | Compliance status update |
| 3 | Operations — Auditor Agent | Verify security controls are operational | Control verification report |

### M-3. Department retrospective (2nd week)

| Step | Owner | Action | Evidence output |
|---|---|---|---|
| 1 | Each Department — Director Agent | Conduct retro: what worked, what didn't, process changes | Department retro report |
| 2 | Operations — Program Control Agent | Aggregate cross-department process change requests | Consolidated change request list |
| 3 | Executive — Chief of Staff Agent | Approve/reject process changes; update SOPs | Updated SOP index |

### M-4. Hiring and org health review (3rd week, Phase C)

| Step | Owner | Action | Evidence output |
|---|---|---|---|
| 1 | HR — Director Agent | Report on open roles, pipeline, onboarding status | HR monthly report |
| 2 | Each Department — Director Agent | Submit capacity assessment + headcount needs | Capacity request forms |
| 3 | Executive — Director Agent | Approve hiring priorities | Hiring decision log |

### M-5. Architecture review (4th week)

| Step | Owner | Action | Evidence output |
|---|---|---|---|
| 1 | Operations — Program Control Agent | Compile month's SLA data, incident patterns, KPI trends | Operational health summary |
| 2 | Data/Analytics — Director Agent | Present KPI trend analysis + anomalies | KPI trend report |
| 3 | Executive — Director Agent | Decide if architecture changes needed | Architecture change log (or "no change" entry) |

---

## Evidence and storage conventions

All evidence outputs follow this structure:

```
reports/
  daily/          # D-1 through D-3 outputs
  weekly/         # W-1 through W-5 outputs
  monthly/        # M-1 through M-5 outputs
  incidents/      # Incident logs and retros
  decisions/      # Executive decision log entries
```

**Naming:** `YYYY-MM-DD-{cadence-id}-{description}.{json|md}`
Example: `2026-03-12-D1-agent-health.json`

**Retention:** Daily logs retained 30 days. Weekly/monthly reports retained 12 months. Decision logs retained indefinitely.

---

## Escalation triggers within cadence

| Trigger | Auto-escalation | Owner |
|---|---|---|
| Agent health check fails (D-1) | Immediate → Operations Director | Operations |
| Standup blocker unresolved > 24h | Auto-escalate → Executive Chief of Staff | Operations |
| KPI target missed 2 consecutive weeks | Flag in W-1 review; require action plan | Department Director |
| Handoff SLA missed | Log + notify both producer and consumer Directors | Program Control Agent |
| Spend variance > 10% weekly | Flag in W-4; escalate to Executive if > 20% | Finance Director |
| Security incident (any severity) | Immediate → IT/Security Director + Executive | IT/Security |

---

## 30-day bootstrap schedule (Phase A activation)

This schedule covers the first 30 days of standing up Phase A departments.

### Week 1: Foundation (Mar 16–20 — aligns with Implementation Plan Phase 0)
- [ ] Day 1-2 (Mar 16-17): Deploy Executive Office agent roles (Director, Chief of Staff)
- [ ] Day 1-2 (Mar 16-17): Deploy Operations agent roles (Director, Operator, Program Control)
- [ ] Day 3 (Mar 18): Deploy Data/Analytics agent roles (Director, Operator)
- [ ] Day 4 (Mar 19): Deploy Finance agent roles (Director, Operator, Auditor)
- [ ] Day 5 (Mar 20): Run first full daily cadence (D-1, D-2); verify evidence outputs

### Week 2: Instrument (Mar 23–27 — aligns with Phase A start)
- [ ] Day 6-7 (Mar 23-24): Configure evidence storage (`reports/` directory structure)
- [ ] Day 8 (Mar 25): Establish KPI baselines for each Phase A department (per KPI/SLA doc §2)
- [ ] Day 9 (Mar 26): Configure SLA monitoring for inter-department handoffs (per KPI/SLA doc §3)
- [ ] Day 10 (Mar 27): Run first weekly cadence (W-1, W-4, W-5); verify evidence outputs

### Week 3: Stabilize (Mar 30–Apr 3)
- [ ] Day 11-15: Run full daily + weekly cadence; fix process gaps as discovered
- [ ] Day 13 (Apr 1): Conduct mid-month review of cadence adherence
- [ ] Day 15 (Apr 3): Document all SOP gaps discovered during first 2 weeks

### Week 4: Validate and extend (Apr 7–11)
- [ ] Day 16-20: Run first monthly cadence items (M-1, M-3, M-5)
- [ ] Day 21 (Apr 10): Produce Phase A operational readiness report
- [ ] Day 22-25 (Apr 11-17): Begin Phase B department planning (Product, Engineering, Design)
- [ ] Day 26-30 (Apr 14-17): Finalize Phase A cadence; sign off → feeds into Implementation Plan Gate G5

### Go/No-Go for Phase B
Phase B activation requires:
1. All Phase A daily cadence items running with evidence for 10+ consecutive days.
2. At least 2 weekly cycles completed with full evidence.
3. KPI baselines established for all Phase A departments.
4. Zero unresolved P0/P1 incidents in Operations.

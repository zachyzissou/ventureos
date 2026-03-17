# VentureOS 30-Day Operational Cadence v1

Date: 2026-03-12 (revised)
Scope: Daily/weekly/monthly runbook for Phase A departments (Executive Office, Operations, Data/Analytics, Finance) with extensions for Phase B/C as they come online.

**Prerequisites:** This cadence is aligned with all four v1 artifacts:
- `VentureOS_Department_Architecture_v1.md` — department missions and handoffs (restored to repo on 2026-03-16)
- `VentureOS_Implementation_Plan_v1.md` — Phase 0 starts 2026-03-16; Phase A starts 2026-03-23
- `VentureOS_Department_KPI_SLA_v1.md` — KPI targets and handoff SLAs
- `VentureOS_SLA_Framework_Map_v1.md` — mapping from technical incident severity to handoff exception/breach handling
- `VentureOS_Lane_Contracts_v1.md` — Director/Operator/Auditor lane obligations

**Canonical evidence model:** primary artifacts live under `runtime/logs/`; validation and readiness summaries live under `runtime/reports/`.
**Operational command pack:** `npm run evidence:daily` validates the current daily bundle, refreshes compatibility aliases, syncs the current weekly/monthly rollups, and emits fresh inventory/retention reports under `runtime/reports/evidence/`. `npm run evidence:index` refreshes the machine-readable inventory only. `npm run evidence:retention` previews retention candidates by default and applies pruning only with `--apply`.
**Critical prerequisite:** Evidence infrastructure (store, schema, retention, inventory/reporting) must be built before Phase 0 activates. See Gap Assessment R2 and `VentureOS_Phase0_Readiness_Checklist_v1.md`.

---

## Daily cadence

### D-1. Morning operations sweep (09:00 CT)

| Step | Owner | Action | Evidence output | Acceptance criteria |
|---|---|---|---|---|
| 1 | Operations Operator | Check all agent health: running, errored, stalled | `runtime/logs/daily/YYYY-MM-DD-agent-health.json` | Every active agent has a status entry; no stale entries >1h |
| 2 | Operations Operator | Review overnight incident queue; triage new items | Updated incident log with severity + owner assigned | All new incidents triaged with severity, owner, and ETA |
| 3 | Data/Analytics Operator | Validate dashboard data freshness (all sources <24h old) | `runtime/logs/daily/YYYY-MM-DD-kpi-snapshot.json` | KPI snapshot notes capture freshness state; stale sources flagged |
| 4 | Finance Operator | Record daily burn (API costs, infrastructure spend) | `runtime/logs/daily/YYYY-MM-DD-spend.json` | All cost categories populated; total matches source system |

### D-2. Department standup updates (09:30 CT)

| Step | Owner | Action | Evidence output | Acceptance criteria |
|---|---|---|---|---|
| 1 | Each active department Director | Post async standup: yesterday done, today plan, blockers | Standup entry in department log | All three fields (done/plan/blockers) present |
| 2 | Operations Program Control | Scan standups for cross-department blockers | Blocker list with escalation status | Every blocker has owner and target resolution time |
| 3 | Executive Chief of Staff | Review escalated blockers; issue directives if needed | Decision log entry (if any) | Directives have owner + deadline |

### D-3. Revenue pipeline delta (16:00 CT, Phase B+)

| Step | Owner | Action | Evidence output | Acceptance criteria |
|---|---|---|---|---|
| 1 | Sales Operator | Update pipeline with day's activity | Pipeline delta report | All stage changes logged with deal ID |
| 2 | Marketing Operator | Report MQL/lead flow for the day | MQL daily count | Source attribution present for all MQLs |
| 3 | Customer Success Operator | Flag any new churn risk signals | Churn risk update | Risk score and reason documented per flagged account |

### D-4. End-of-day evidence close (17:00 CT)

| Step | Owner | Action | Evidence output | Acceptance criteria |
|---|---|---|---|---|
| 1 | Each active department Operator | Post daily status update per Lane Contracts §5 | Status entry in department log | Status posted before 17:00 CT deadline |
| 2 | Operations Program Control | Verify all D-1 through D-3 evidence outputs exist and refresh inventory state | `runtime/reports/evidence/evidence-validate-latest.json`, `runtime/reports/evidence/evidence-index-latest.json`, `runtime/reports/evidence/evidence-retention-latest.json` | Validation summary status is PASS; current daily target is complete in the evidence index; retention report is refreshed for the cycle |

---

## Weekly cadence

### W-1. Executive operating review (Monday 10:00 CT)

**Prerequisite handoffs (per KPI/SLA doc §3):**
- Data/Analytics delivers weekly KPI packet by Monday 08:30 CT
- Executive Office delivers weekly priorities packet by Monday 09:00 CT

| Step | Owner | Action | Evidence output | Acceptance criteria |
|---|---|---|---|---|
| 1 | Data/Analytics Director | Compile KPI snapshot across all active departments | `runtime/logs/weekly/YYYY-Www-kpi-rollup.json` | All active department KPIs present with values, targets, and trend delta |
| 2 | Operations Program Control | Compile SLA compliance report (handoffs met/missed) | SLA compliance summary | Every handoff SLA has met/missed status and miss count |
| 3 | Finance Director | Produce spend vs. budget variance report | Variance report with delta from plan | Variance calculated per department; items >10% flagged |
| 4 | Executive Director | Review KPI + SLA + variance; log decisions | `runtime/logs/weekly/YYYY-Www-ops-review.md` | Each decision has owner + deadline + rationale |
| 5 | Executive Chief of Staff | Distribute action items to department Directors | Action item distribution confirmation | Each action item acknowledged by recipient Director |

### W-2. Product/Engineering planning sync (Monday 14:00 CT, Phase B+)

| Step | Owner | Action | Evidence output | Acceptance criteria |
|---|---|---|---|---|
| 1 | Product Director | Present prioritized backlog + upcoming spec status | Backlog snapshot | Each item has priority, status, and owner |
| 2 | Engineering Director | Report capacity, in-flight work, tech debt items | Engineering status report | Capacity utilization and risk items listed |
| 3 | Both Directors | Agree on iteration scope | Iteration scope agreement (signed off by both) | Scope items enumerated with acceptance criteria |

### W-3. GTM sync (Wednesday 10:00 CT, Phase B+)

| Step | Owner | Action | Evidence output | Acceptance criteria |
|---|---|---|---|---|
| 1 | Marketing Director | Campaign performance + pipeline contribution | Campaign report | Attribution data present; MQL attainment vs. target |
| 2 | Sales Director | Pipeline health + forecast update | Pipeline report | Coverage ratio and win rate calculated |
| 3 | Customer Success Director | Customer health + VOC packet | VOC weekly packet (due Thursday 15:00 CT per KPI/SLA §3) | Top themes with impact scores and linked evidence |
| 4 | All three Directors | Identify handoff issues, agree on adjustments | GTM sync notes | Action items with owners |

### W-4. Finance spend/variance review (Friday 15:00 CT)

**Prerequisite handoff:** Finance delivers weekly variance report by Friday 14:00 CT (per KPI/SLA §3).

| Step | Owner | Action | Evidence output | Acceptance criteria |
|---|---|---|---|---|
| 1 | Finance Operator | Aggregate week's daily spend logs | Weekly spend summary | All 5 daily spend files aggregated; totals reconciled |
| 2 | Finance Director | Compare to budget; flag variances >10% | Variance flag list | Each flagged item has corrective action proposed |
| 3 | Finance Auditor | Verify spend data against source systems | Audit confirmation with sample details | Minimum 3 line items spot-checked against source |

### W-5. Operations incident retro (Friday 16:00 CT)

| Step | Owner | Action | Evidence output | Acceptance criteria |
|---|---|---|---|---|
| 1 | Operations Operator | Compile week's incidents with resolution status | `runtime/logs/weekly/YYYY-Www-risk-register.md` | All incidents listed with severity, owner, status, resolution time |
| 2 | Operations Director | Identify patterns; propose SOP updates | SOP change proposals (if any) | Each proposal has rationale and expected impact |
| 3 | Operations Auditor | Verify incident resolutions are complete | Retro sign-off | Each resolved incident has evidence of resolution |

---

## Monthly cadence

### M-1. Forecast refresh (1st business day)

**Prerequisite handoff:** Finance delivers monthly budget snapshot by 1st business day 12:00 CT (per KPI/SLA §3).

| Step | Owner | Action | Evidence output | Acceptance criteria |
|---|---|---|---|---|
| 1 | Finance Director | Produce updated runway forecast (3/6/12 month) | `runtime/logs/monthly/YYYY-MM-forecast.md` | Runway calculation with assumptions documented |
| 2 | Sales Director (Phase B+) | Submit pipeline forecast for next 90 days | Sales forecast | Coverage ratio and confidence level per segment |
| 3 | Product Director (Phase B+) | Submit resource needs for next quarter | Product resource request | Each request has justification and priority |
| 4 | Executive Director | Review forecasts; adjust allocations if needed | `runtime/logs/monthly/YYYY-MM-readiness-summary.md` | Allocation changes documented with rationale |

### M-2. Security and compliance review (1st week)

| Step | Owner | Action | Evidence output | Acceptance criteria |
|---|---|---|---|---|
| 1 | IT/Security Director (Phase C) | Produce access audit + incident summary | Security monthly report | All access reviews completed; incidents with disposition |
| 2 | Legal Director (Phase C) | Review compliance checklist status | Compliance status update | Each checklist item has current status |
| 3 | Operations Auditor | Verify security controls are operational | Control verification report | Each control tested with pass/fail result |

### M-3. Department retrospective (2nd week)

| Step | Owner | Action | Evidence output | Acceptance criteria |
|---|---|---|---|---|
| 1 | Each Department Director | Conduct retro: what worked, what didn't, process changes | Department retro report | All three sections (worked/didn't/changes) present |
| 2 | Operations Program Control | Aggregate cross-department process change requests | Consolidated change request list | Each request has department, description, priority |
| 3 | Executive Chief of Staff | Approve/reject process changes; update SOPs | Updated SOP index | Each request has disposition with rationale |

### M-4. Hiring and org health review (3rd week, Phase C)

| Step | Owner | Action | Evidence output | Acceptance criteria |
|---|---|---|---|---|
| 1 | HR Director | Report on open roles, pipeline, onboarding status | HR monthly report | All open reqs listed with stage and timeline |
| 2 | Each Department Director | Submit capacity assessment + headcount needs | Capacity request forms | Justification present for each request |
| 3 | Executive Director | Approve hiring priorities | `runtime/logs/monthly/YYYY-MM-readiness-summary.md` | Each decision documented with budget impact |

### M-5. Architecture review (4th week)

| Step | Owner | Action | Evidence output | Acceptance criteria |
|---|---|---|---|---|
| 1 | Operations Program Control | Compile month's SLA data, incident patterns, KPI trends | Operational health summary | All active departments covered; trends over 4+ weeks |
| 2 | Data/Analytics Director | Present KPI trend analysis + anomalies | KPI trend report | Anomalies flagged with root cause hypothesis |
| 3 | Executive Director | Decide if architecture changes needed | `runtime/logs/monthly/YYYY-MM-readiness-summary.md` | Decision logged: change or "no change" with rationale |

---

## Evidence and storage conventions

All evidence outputs follow this structure:

```
runtime/logs/
  daily/          # D-1 through D-4 outputs
  weekly/         # W-1 through W-5 outputs
  monthly/        # M-1 through M-5 outputs
  incidents/      # Incident logs and retros

runtime/reports/
  evidence/       # validation summaries, inventory, retention reports
  phase0-readiness/ # rollout gate summaries
```

**Naming:** `YYYY-MM-DD-{cadence-id}-{description}.{json|md}`
Example: `2026-03-16-agent-health.json`

**Format:** JSON for structured data (KPIs, health checks, spend). Markdown for narrative reports (decisions, retros, forecasts).

**Retention:**
- Daily evidence artifacts: 45-day active window in `runtime/logs/daily/`.
- Weekly evidence artifacts: 180-day active window in `runtime/logs/weekly/`.
- Monthly evidence artifacts: 540-day active window in `runtime/logs/monthly/`.
- Derived evidence/readiness reports: 45-day active window in `runtime/reports/evidence/` and `runtime/reports/phase0-readiness/`.
- Incident bundles are not auto-pruned by the current retention command.

**Schema references:** KPI record schema per KPI/SLA doc §5. Handoff record schema per KPI/SLA doc §5. Lane state schema per Lane Contracts doc (to be defined — see Gap Assessment G13).

---

## Escalation triggers within cadence

| Trigger | Auto-escalation | Owner | SLA |
|---|---|---|---|
| Agent health check fails (D-1) | Immediate → Operations Director | Operations | Acknowledge within 30 min |
| Standup blocker unresolved >24h | Auto-escalate → Executive Chief of Staff | Operations Program Control | Directive within 4h |
| KPI target missed 2 consecutive weeks | Flag in W-1 review; require action plan | Department Director | Action plan within 1 business day of W-1 |
| Handoff SLA missed | Log + notify both producer and consumer Directors | Operations Program Control | Per KPI/SLA breach policy (Level 1/2/3) and `VentureOS_SLA_Framework_Map_v1.md` when a technical incident is causal |
| Spend variance >10% weekly | Flag in W-4; escalate to Executive if >20% | Finance Director | Corrective action within 1 business day |
| Security incident (any severity) | Immediate → IT/Security Director + Executive | IT/Security | Containment per KPI/SLA doc: <=4h high severity |
| Technical P0/P1 incident blocks an active handoff | Record incident-linked exception or breach routing in the handoff ledger before the handoff deadline | Operations Program Control + producer/consumer Directors | Approval route and expiry must follow `VentureOS_SLA_Framework_Map_v1.md` |
| Daily evidence outputs missing at 17:30 CT | Operations Program Control flags; escalate to Department Director | Operations | Evidence produced or exception logged by end of next business day |

---

## 30-day bootstrap schedule (Phase 0 + Phase A activation)

Calendar-anchored to Implementation Plan: Phase 0 = 2026-03-16 to 2026-03-20; Phase A = 2026-03-23 to 2026-04-17.

### Week 1: Foundation (2026-03-16 to 2026-03-20 — Phase 0)

| Day | Date | Action | Owner | Done criteria |
|---|---|---|---|---|
| 1 | Mar 16 | Deploy Executive Office lanes: Director, Chief of Staff, Auditor | Executive Office Director | All 3 agent roles responding to health check |
| 1 | Mar 16 | Deploy Operations lanes: Director, Operator, Program Control, Auditor | Operations Director | All 4 agent roles responding to health check |
| 2 | Mar 17 | Create evidence directory structure (`runtime/logs/daily/`, `weekly/`, `monthly/`, `incidents/`) | Operations Operator | Directories exist and writable |
| 2 | Mar 17 | Deploy evidence schema templates (KPI record, handoff record per KPI/SLA §5) | Data/Analytics Operator | Templates validated against schema |
| 3 | Mar 18 | Deploy Data/Analytics lanes: Director, Operator, Auditor | Data/Analytics Director | All 3 agent roles responding to health check |
| 3 | Mar 18 | Configure data freshness monitoring for all known data sources | Data/Analytics Operator | Freshness check runs and produces valid output |
| 4 | Mar 19 | Deploy Finance lanes: Director, Operator, Auditor | Finance Director | All 3 agent roles responding to health check |
| 4 | Mar 19 | Configure daily spend tracking (API costs, infrastructure) | Finance Operator | Daily spend log produces valid JSON |
| 5 | Mar 20 | Run first full daily cadence (D-1, D-2, D-4) | Operations Program Control | All evidence outputs present and schema-valid |
| 5 | Mar 20 | **Gate G0 decision point** per Implementation Plan §5 | Executive Office Director | G0 evidence: 4 departments active, evidence directory live, KPI baseline template approved |

### Week 2: Instrument (2026-03-23 to 2026-03-27 — Phase A start)

| Day | Date | Action | Owner | Done criteria |
|---|---|---|---|---|
| 6 | Mar 23 | Begin KPI baseline measurement for all Phase A departments (window: Mar 16-25 per KPI/SLA §1) | Data/Analytics Operator | Measurement queries running for all 8 Phase A KPIs |
| 7 | Mar 24 | Configure SLA monitoring for inter-department handoffs (KPI/SLA §3, Phase A handoffs only) | Operations Program Control | Each handoff SLA has automated tracking producing met/missed status |
| 8 | Mar 25 | Freeze KPI baselines (per KPI/SLA §1: frozen for 30 days before retargeting) | Data/Analytics Director | Baseline values documented and approved |
| 9 | Mar 26 | Run first daily cadence with SLA monitoring active | Operations Operator | SLA compliance data appears in daily output |
| 10 | Mar 27 | Run first weekly cadence (W-1, W-4, W-5) | Operations Program Control | All weekly evidence outputs present and reviewed |

### Week 3: Stabilize (2026-03-30 to 2026-04-03)

| Day | Date | Action | Owner | Done criteria |
|---|---|---|---|---|
| 11-13 | Mar 30 - Apr 1 | Run full daily + weekly cadence; document process gaps as discovered | Operations Operator | Gap log maintained with severity and owner |
| 14 | Apr 2 | Mid-stabilization review: assess cadence adherence rate | Operations Director | Adherence report: % of cadence items completed on time |
| 15 | Apr 3 | Document all SOP gaps discovered during first 2 weeks; propose fixes | Operations Director | SOP gap list with proposed fixes and priority |

### Week 4: Validate (2026-04-07 to 2026-04-11)

| Day | Date | Action | Owner | Done criteria |
|---|---|---|---|---|
| 16 | Apr 7 | Run first monthly cadence items (M-1, M-3, M-5) | Finance Director (M-1), Department Directors (M-3), Executive Director (M-5) | Monthly evidence outputs present |
| 17-19 | Apr 8-10 | Continue daily/weekly cadence; accumulate consecutive-day evidence count | Operations Program Control | Evidence streak tracked |
| 20 | Apr 11 | Produce Phase A operational readiness report for Gate G1 | Operations Director | Report includes: consecutive evidence days, SLA compliance rate, KPI baseline status, open incidents |

### Post-Week 4: Phase B preparation (2026-04-14 to 2026-04-17)

| Day | Date | Action | Owner | Done criteria |
|---|---|---|---|---|
| 21-23 | Apr 14-16 | Begin Phase B department planning: draft lane charters for Product, Engineering, Design, Marketing, Sales, Customer Success | Executive Office Director | Draft charters for all 6 departments |
| 24-25 | Apr 16-17 | Finalize Phase A cadence sign-off | Operations Director | All G1 evidence criteria met per Implementation Plan §5 |

### Gate G1 criteria (from Implementation Plan §5)

Phase A to Phase B transition requires ALL of the following:
1. 10 consecutive business days of daily evidence (D-1 through D-4 outputs).
2. At least 2 weekly cycles completed with full evidence (W-1 through W-5).
3. >=95% Phase A handoff SLA compliance.
4. KPI baselines established and frozen for all Phase A departments.
5. Zero unresolved P0/P1 incidents in Operations.

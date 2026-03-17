# VentureOS Department KPI + Handoff SLA v1

Date: 2026-03-12
Version: v1.0
Scope: KPI definitions and inter-department handoff SLAs for Company OS v1 departments.

## 1) Measurement standards

- KPI owner is the department Operator lane unless explicitly overridden.
- KPI approver is the department Director lane.
- KPI auditor is the department Auditor lane (or Evidence/QA Auditor for cross-cutting metrics).
- Every KPI entry must include timestamp, source, owner, and evidence link.
- Baselines are captured during 2026-03-16 to 2026-03-25 and frozen for 30 days before retargeting.

## 2) Department KPI catalog (v1)

| Department | KPI | Definition | Formula | Target | Cadence | Owner |
|---|---|---|---|---|---|---|
| Executive Office | Strategic decision cycle time | Time from decision request to documented decision | P90(hours from intake to decision) | <=72h | Weekly | Executive Office Operator lane |
| Executive Office | Priority alignment rate | Active work items mapped to quarterly priorities | mapped items / active items | >=95% | Weekly | Executive Office Operator lane |
| Operations | Incident MTTR | Mean time to resolve incidents | sum(resolve time) / incidents | <=8h (P1), <=24h (P2) | Daily/Weekly | Operations Operator lane |
| Operations | SOP compliance rate | Workflows executed with approved SOP | compliant runs / total runs | >=95% | Weekly | Operations Operator lane |
| Data/Analytics | Data freshness compliance | KPI datasets refreshed on schedule | on-time refreshes / planned refreshes | >=98% | Daily | Data/Analytics Operator lane |
| Data/Analytics | KPI accuracy score | KPI values passing reconciliation checks | passed checks / total checks | >=99% | Weekly | Data/Analytics Operator lane |
| Finance | Runway coverage | Months of runway at current burn | cash on hand / monthly burn | >=12 months | Weekly | Finance Operator lane |
| Finance | Budget variance | Deviation from approved budget | abs(actual-plan)/plan | <=10% monthly | Weekly/Monthly | Finance Operator lane |
| Product | Spec readiness index | Planned initiatives with approved specs before sprint lock | approved specs / planned initiatives | >=90% | Weekly | Product Operator lane |
| Product | Outcome attainment rate | Quarterly objectives on track | on-track objectives / total objectives | >=80% | Weekly | Product Operator lane |
| Engineering | Release reliability | Deployments without rollback/hotfix in 24h | stable deploys / total deploys | >=95% | Weekly | Engineering Operator lane |
| Engineering | Delivery predictability | Committed scope completed per iteration | completed committed points / committed points | >=85% | Weekly | Engineering Operator lane |
| Design | Design cycle time | Time from request intake to approved design pack | P90(days) | <=5 business days | Weekly | Design Operator lane |
| Design | Rework rate | Approved designs requiring major rework post-handoff | reworked items / approved items | <=15% | Weekly | Design Operator lane |
| Marketing | MQL volume attainment | Marketing-qualified leads versus plan | actual MQL / planned MQL | >=95% | Weekly | Marketing Operator lane |
| Marketing | Campaign ROI | Revenue attributable to campaign cost | attributable revenue / campaign cost | >=2.0 | Monthly | Marketing Operator lane |
| Sales | Pipeline coverage | Qualified pipeline relative to next-quarter target | qualified pipeline / next-quarter quota | >=3.0x | Weekly | Sales Operator lane |
| Sales | Win rate | Closed-won deals over all closed deals | won / (won+lost) | >=25% | Weekly | Sales Operator lane |
| Customer Success | Gross revenue retention | Retained recurring revenue | ending recurring rev (existing cohort)/starting recurring rev | >=90% | Monthly | Customer Success Operator lane |
| Customer Success | Time to first value | Days from onboarding start to first value milestone | P90(days) | <=14 days | Weekly | Customer Success Operator lane |
| Legal | Contract turnaround time | Time to review and return standard agreements | P90(business days) | <=4 days | Weekly | Legal Operator lane |
| Legal | Compliance exception rate | Exceptions found in legal/compliance checks | exceptions / reviewed actions | <=2% | Weekly | Legal Operator lane |
| IT/Security | Access review completion | Scheduled access reviews completed on time | completed reviews / scheduled reviews | 100% | Weekly/Monthly | IT/Security Operator lane |
| IT/Security | Security incident containment | Time to contain confirmed incidents | P90(hours) | <=4h high severity | Weekly | IT/Security Operator lane |
| HR | Hiring cycle time | Time from approved requisition to accepted offer | P90(days) | <=35 days | Weekly | HR Operator lane |
| HR | 30-day onboarding completion | New hires completing onboarding checklist within 30 days | completed onboarding / new hires | >=95% | Monthly | HR Operator lane |

## 3) Handoff SLA matrix (v1)

| Producer | Consumer | Artifact/Handoff | SLA target | Acceptance criteria |
|---|---|---|---|---|
| Executive Office | Operations | Weekly priorities packet | By Monday 09:00 CT | Priorities, owners, due dates, risk flags present |
| Executive Office | Finance | Allocation decisions | Within 24h of operating review | Approved budget delta + rationale logged |
| Operations | Executive Office | Incident escalation brief | <=30 minutes for P0/P1 | Severity, impact, owner, ETA documented |
| Data/Analytics | Executive Office | Weekly KPI packet | By Monday 08:30 CT | KPI values, trend delta, variance notes, evidence links |
| Data/Analytics | Finance | Spend and forecast dataset | Daily by 08:00 CT | Source reconciliation complete, no stale records >24h |
| Finance | Executive Office | Weekly variance report | By Friday 14:00 CT | Variance by department with corrective actions |
| Product | Engineering | Approved product spec | >=2 business days before sprint lock | PRD, acceptance criteria, non-goals, dependencies included |
| Design | Engineering | UI/UX design package | >=1 business day before implementation start | Final mocks, interaction notes, assets, states delivered |
| Engineering | Marketing | Release readiness packet | >=5 business days before launch | Scope, release notes, constraints, known issues listed |
| Marketing | Sales | Campaign launch brief + MQL definitions | <=24h after campaign go-live | Segment, messaging, SLA for lead follow-up included |
| Sales | Customer Success | Closed-won handoff dossier | <=4h from close-won event | Contract, goals, timeline, risks, contacts complete |
| Customer Success | Product | VOC insight digest | Weekly by Thursday 15:00 CT | Top themes, impact score, linked evidence included |
| Legal | Sales | Non-standard term review | <=2 business days | Clause disposition and redline rationale recorded |
| IT/Security | Engineering | Security review findings | <=1 business day from review completion | Severity, remediation owner, due date assigned |
| HR | Department Directors | Hiring pipeline status | Weekly by Tuesday 11:00 CT | Open reqs, stage funnel, risks, blockers present |
| Finance | All departments | Monthly budget snapshot | 1st business day by 12:00 CT | Actuals, plan, variance, spend controls included |

## 4) SLA breach policy

| Breach level | Condition | Required response | Escalation owner |
|---|---|---|---|
| Level 1 | 1 miss in rolling 30 days | Corrective action note within 1 business day | Producer Director lane |
| Level 2 | 2 misses in rolling 30 days | Recovery plan and daily check-in until stable | Operations Director lane |
| Level 3 | 3+ misses or any P0 handoff miss | Freeze downstream dependent workflow until executive review | Executive Office Director lane |

- P0/P1 operational incidents override standard SLA windows.
- Repeated Level 2/3 breaches trigger lane contract audit.
- Technical incident severity mapping is governed by `docs/VentureOS_SLA_Framework_Map_v1.md`.

### 4.1 Technical incident mapping

- `P0` technical incidents may place impacted handoffs into `exception` only with `executive_office:director` approval; otherwise an impacted missed handoff is `level_3`.
- `P1` technical incidents may place impacted handoffs into `exception` with `operations:director` approval and producer/consumer Director acknowledgement; otherwise an impacted missed handoff defaults to `level_2`.
- `P2` and `P3` incidents do not automatically grant exceptions; any resulting missed handoff defaults to `level_1` unless separately escalated.
- Technical severity alone does not create a handoff breach. The incident must materially affect the production, acceptance, or execution window of the handoff.

## 5) Evidence and audit requirements

- KPI record fields: `kpi_id`, `period_start`, `period_end`, `value`, `target`, `owner`, `source_refs`, `entered_at`, `approved_at`.
- Handoff record fields: `handoff_id`, `producer`, `consumer`, `producer_binding_id`, `consumer_binding_id`, `artifact`, `sent_at`, `accepted_at`, `producer_ts`, `consumer_ts`, `sla_target_minutes`, `latency_minutes`, `compliance_status`, `breach_level`, `breach_owner`, `breach_action`, `exception_approved_by`, `exception_expires_at`, `exceptions`.
- `sla_status` remains accepted for compatibility with historical ledgers, but `compliance_status` is the canonical field for current-day evidence and readiness evaluation.
- Current-day ledgers must use canonical VentureOS role identifiers such as `operations:operator`, `finance:director`, or `venture_control` for binding, capability, and breach-routing fields.
- When a technical incident affects a handoff, the handoff record must include the incident reference in `exceptions` and follow the approval/escalation rules in `docs/VentureOS_SLA_Framework_Map_v1.md`.
- Monthly audit sample rate: 10% of KPI entries and 10% of handoffs, minimum 3 samples per department category.
- Failed audit sample requires correction within 2 business days and re-audit.

## 6) KPI/SLA change control

- KPI additions/retirements require Director proposal plus Auditor approval.
- Targets may be changed only after 30 days of stable baseline history.
- SLA target changes require producer and consumer Director sign-off plus Operations Director approval.

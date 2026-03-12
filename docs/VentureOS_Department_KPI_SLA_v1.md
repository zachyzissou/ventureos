# VentureOS Department KPI + SLA v1

## 1) KPI standard
1. Every KPI must define formula, data source, owner, and reporting cadence.
2. Default cadence is weekly unless otherwise stated.
3. KPI performance status bands:
- Green: at/above target
- Yellow: within 10% of target
- Red: below 10% of target or stale data > 1 cycle

## 2) Department KPI definitions (v1 minimum set)
| Department | KPI | Definition / Formula | Target | Source | Owner |
|---|---|---|---|---|---|
| Executive Office | Decision latency | Median time from issue open to logged decision | <= 5 business days | Decision log | Executive Office Director Agent |
| Executive Office | Strategic initiative on-time rate | Initiatives completed on/before committed date / total due | >= 85% | Initiative tracker | Chief of Staff Agent |
| Finance | Budget variance | \|actual - budget\| / budget by month | <= 10% | Finance ledger | Finance Director Agent |
| Finance | Runway coverage | Cash runway in months at current burn | >= 12 months | Forecast model | Finance Operator Agent |
| Legal & Compliance | Contract turnaround | Median time from legal request to approved terms | <= 48 hours | Contract queue | Legal/Compliance Director Agent |
| Legal & Compliance | Compliance task closure | Closed compliance tasks / due tasks per cycle | >= 95% | Compliance matrix | Legal/Compliance Auditor Agent |
| People / HR | Time to fill | Median days from approved req to accepted offer | <= 35 days | Hiring tracker | People/HR Director Agent |
| People / HR | Onboarding completion | New hires completing onboarding checklist in 10 business days | >= 95% | Onboarding runbook log | People/HR Operator Agent |
| Operations (Internal) | SOP freshness | SOPs reviewed within last 90 days / total SOPs | >= 90% | SOP index | Operations Director Agent |
| Operations (Internal) | Incident corrective-action closure | Postmortem actions closed by due date / total due | >= 90% | Incident log | Program Control Agent |
| Product | Spec readiness | Planned items with approved PRD before sprint lock / planned items | >= 95% | Product backlog | Product Director Agent |
| Product | Roadmap predictability | Roadmap commitments delivered per quarter / commitments | >= 80% | Roadmap | Product Operator Agent |
| Engineering | Change failure rate | Releases requiring rollback or hotfix / total releases | <= 10% | CI/CD + incident logs | Engineering Director Agent |
| Engineering | Lead time for change | Median time from PR open to production deploy | <= 3 days | VCS + deploy logs | Engineering Operator Agent |
| Design | Design handoff completeness | Handoffs with all required states + a11y criteria / total handoffs | >= 95% | Design checklist | Design Director Agent |
| Design | UX defect escape rate | UX defects found post-release / total UX defects | <= 15% | Bug tracker | Design Auditor Agent |
| Marketing | MQL volume attainment | Actual MQLs / planned MQLs by cycle | >= 90% | Marketing automation | Marketing Director Agent |
| Marketing | Campaign launch punctuality | Campaigns launched on planned date / total planned | >= 90% | Campaign calendar | Marketing Operator Agent |
| Sales | Pipeline coverage | Qualified pipeline for next quarter / next-quarter quota | >= 3.0x | CRM | Sales Director Agent |
| Sales | Win rate | Closed-won deals / closed deals | >= 25% | CRM | Sales Operator Agent |
| Customer Success / Support | Gross revenue retention | Retained recurring revenue / starting recurring revenue | >= 90% | Billing + CS tools | CS Director Agent |
| Customer Success / Support | First response SLA attainment | Tickets first-responded within SLA / total tickets | >= 95% | Support platform | CS Operator Agent |
| Data / Analytics | Dashboard data freshness | KPI dashboards updated within SLA window / total dashboards | >= 98% | BI platform | Data/Analytics Director Agent |
| Data / Analytics | Metric definition coverage | KPIs with approved definition card / KPIs tracked | 100% | KPI registry | Data/Analytics Auditor Agent |
| IT / Security | Access revocation timeliness | Offboarded users revoked within 24h / total offboarded users | 100% | IAM logs | IT/Security Director Agent |
| IT / Security | Critical vulnerability remediation | Critical vulns fixed within policy window / total critical vulns | >= 95% | Security scanner | IT/Security Auditor Agent |

## 3) Core handoff SLA matrix (v1)
| Producer -> Consumer | Payload | SLA target | Acceptance rule | Escalation trigger |
|---|---|---|---|---|
| Product -> Engineering | Approved spec, acceptance criteria, release target | Before sprint lock (>= 2 business days pre-start) | Engineering estimate + feasibility ack logged | 2 consecutive missed sprint-lock handoffs |
| Design -> Engineering | Final UI states, components, a11y criteria | Before implementation start (>= 1 business day) | Implementation checklist marked complete | 2 implementation starts without complete design packet |
| Engineering -> QA/Trust | Build, test evidence, deploy notes, rollback plan | At PR/release gate | Quality gate pass recorded | Any release gate failure or missing rollback note |
| Product/Engineering -> Marketing | Release narrative, capability list, constraints | T-7 calendar days before launch | Campaign brief approved | Launch window within 7 days without approved brief |
| Marketing -> Sales | Messaging cards, objection handling, campaign assets | Launch day by 10:00 local | CRM enablement packet attached | Launch day misses in 2 consecutive campaigns |
| Sales -> Legal/Finance | Redlines, discount/exception requests | 24-48h turnaround | Approved or revised terms sent to Sales | Any request > 48h or 2-cycle backlog breach |
| Sales/CS -> Product | Weekly VOC packet with revenue impact | Weekly by Friday 15:00 local | Backlog triage decision logged | Missing VOC packet for 2 consecutive weeks |
| Data/Analytics -> Executive Office | KPI snapshot, risk list, trend deltas | Weekly executive review (T-1 day pre-meeting) | Decisions captured with owner + due date | Executive review held without KPI packet |

## 4) SLA breach handling
1. First breach: producer owner submits recovery plan within 1 business day.
2. Second consecutive breach: Program Control Agent opens escalation and assigns cross-department fix owner.
3. Third breach in rolling 30 days: Executive Office review required; priority/budget is reallocated.

## 5) Data quality and audit requirements
1. KPI cards are versioned; changes require Data/Analytics Auditor approval.
2. SLA logs must include timestamp, producer, consumer, acceptance result, and exception reason.
3. Monthly audit samples at least 10% of KPI entries and 10% of handoff records.

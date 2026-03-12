# VentureOS Implementation Plan v1

## 1) Scope and constraints
1. Scope: launch Company OS v1 across the 13 departments defined in `docs/VentureOS_Department_Architecture_v1.md`.
2. Constraint: use Director/Operator/Auditor lane model per department.
3. Constraint: every phase must pass evidence-first acceptance gates before moving forward.
4. Out of scope for v1: org redesign beyond current 13 departments, custom tooling rebuilds, non-critical automation experiments.

## 2) v1 ownership model
| Area | Accountable Owner | Delivery Owner | Control Owner |
|---|---|---|---|
| Company OS v1 program | Executive Office Director Agent | Program Control Agent (Operations) | Evidence/QA Agent (Trust) |
| Department rollouts | Department Director Agent | Department Operator Agent | Department Auditor Agent |
| KPI system | Data/Analytics Director Agent | Data/Analytics Operator Agent | Data/Analytics Auditor Agent |
| Budget/runway guardrails | Finance Director Agent | Finance Operator Agent | Finance Auditor Agent |
| Policy/security gates | Legal/Compliance Director Agent + IT/Security Director Agent | Legal/Compliance Operator Agent + IT/Security Operator Agent | Legal/Compliance Auditor Agent + IT/Security Auditor Agent |

## 3) Phased rollout and timeline
| Phase | Dates (2026) | Departments in scope | Primary outputs | Phase owner |
|---|---|---|---|---|
| Phase 0: Mobilization | Mar 16 - Mar 20 | Executive Office, Operations, Data/Analytics | Program charter, owner roster, baseline KPI dictionary | Executive Office Director Agent |
| Phase A: Foundation | Mar 23 - Apr 17 | Executive Office, Operations, Data/Analytics, Finance | Evidence gate policy live, weekly executive KPI briefing live, finance variance workflow live | Program Control Agent |
| Phase B: Build + Revenue | Apr 20 - May 29 | Product, Engineering, Design, Marketing, Sales, Customer Success/Support | Product-to-release chain operating with launch handoffs and VOC loop | Product Director Agent |
| Phase C: Control + Scale | Jun 1 - Jul 3 | Legal/Compliance, IT/Security, People/HR | Compliance controls, access lifecycle controls, hiring/onboarding controls integrated | Chief of Staff Agent |
| Phase D: Stabilization + Cert | Jul 6 - Jul 17 | All 13 departments | v1 operating review, remediation closeout, go-forward backlog | Executive Office Director Agent |

## 4) Acceptance gates (must pass in order)
| Gate | Required evidence | Pass criteria | Approver |
|---|---|---|---|
| G1: Scope lock | Department roster + owner map + bounded deliverables | All 13 departments mapped to owner triads; no unowned handoffs | Executive Office Director Agent |
| G2: KPI readiness | Department KPI definitions + dashboard contracts | At least 2 KPIs per department with source, formula, cadence, owner | Data/Analytics Director Agent |
| G3: Handoff readiness | SLA matrix + acceptance checks | Every core handoff has SLA, acceptance rule, and escalation path | Program Control Agent |
| G4: Evidence gate live | Artifact checklist + verification checklist | "Done" claims require changed files, diff summary, command evidence, rollback note | Evidence/QA Agent |
| G5: Run-state proof | Two consecutive weekly operating cycles | >=90% SLA compliance and all breaches have remediation owners/dates | Executive Office Director Agent |
| G6: v1 certification | Final operating review packet | No open Sev-1 governance gaps; approved transition to steady state | Executive Office + Finance + Legal/Compliance + IT/Security Directors |

## 5) Department rollout sequence and owners
| Wave | Departments | Wave lead | Entry criteria | Exit criteria |
|---|---|---|---|---|
| Wave 1 | Executive Office, Operations, Data/Analytics, Finance | Operations Director Agent | G1 complete | G2 and G3 complete for Wave 1 departments |
| Wave 2 | Product, Engineering, Design | Product Director Agent | Wave 1 exit complete | Product-to-Engineering and Design-to-Engineering SLAs pass 2 cycles |
| Wave 3 | Marketing, Sales, Customer Success/Support | Sales Director Agent | Wave 2 exit complete | GTM + VOC handoffs pass 2 cycles |
| Wave 4 | Legal/Compliance, IT/Security, People/HR | Legal/Compliance Director Agent | Wave 3 exit complete | Policy/security/people controls pass G4 and G5 |

## 6) Operating checkpoints
1. Daily (department-level): blockers, SLA-at-risk handoffs, same-day recovery owners.
2. Weekly (executive operating review): KPI trend deltas, gate status, escalations, decision log updates.
3. Monthly (control review): budget/forecast reset, compliance/security findings, process retros.

## 7) v1 minimum acceptance at completion
1. All 13 departments are running Director/Operator/Auditor lanes.
2. All mandatory artifacts from the architecture doc exist and are owned.
3. All 8 core inter-department handoffs are measured with SLA compliance.
4. Executive decisions are traceable to KPI and evidence artifacts.

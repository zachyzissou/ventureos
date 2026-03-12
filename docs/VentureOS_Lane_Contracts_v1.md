# VentureOS Lane Contracts v1

## 1) Purpose
Define enforceable v1 contracts for the three lane types used by each department:
1. Director lane (plan and decide)
2. Operator lane (execute and deliver)
3. Auditor lane (verify and gate)

These contracts apply to all 13 departments in `docs/VentureOS_Department_Architecture_v1.md`.

## 2) Shared contract requirements
Every lane handoff must include:
1. Work item ID and department
2. Clear input artifact list
3. Clear output artifact list
4. Due date/time and SLA class
5. Evidence package link (files, diff summary, command outputs or waiver, rollback note)

If any required field is missing, status is `INCOMPLETE` and cannot be marked `DONE`.

## 3) Lane contracts
| Lane | Core responsibility | Required inputs | Required outputs | SLA to next lane | Cannot self-approve |
|---|---|---|---|---|---|
| Director | Prioritize work, set scope, approve reversible department decisions | KPI snapshot, backlog, blocker list, prior audit findings | Prioritized plan, decision log entry, acceptance criteria | <= 1 business day from intake to prioritized assignment | Director cannot perform final audit gate |
| Operator | Execute scoped work and produce artifacts | Director plan, acceptance criteria, dependency contracts | Implemented artifacts, execution log, risk notes, rollback note | <= committed due date; same-day breach alert if at risk | Operator cannot sign off on completion quality |
| Auditor | Validate correctness, evidence completeness, and policy compliance | Operator outputs, diff evidence, policy checklist | Pass/fail gate result, defects list, remediation requirements | <= 1 business day from operator submission | Auditor cannot change scope/priority without Director |

## 4) Director lane obligations
1. Maintain bounded scope: every assignment must have a specific completion condition.
2. Enforce decision rights tiers:
- Reversible departmental decisions: Director-owned.
- Cross-department or budget-impact decisions: Executive Office approval required.
- Policy/security/compliance exceptions: Legal/Compliance + IT/Security approval required.
3. Open escalation within 4 business hours when SLA breach repeats for 2 cycles.

## 5) Operator lane obligations
1. Execute only against approved scope and acceptance criteria.
2. Produce evidence-first delivery packets:
- changed files
- concise diff summary
- command evidence (or explicit waiver)
- rollback note
3. Raise risk early: dependency, quality, or compliance blockers reported within same business day.

## 6) Auditor lane obligations
1. Validate against acceptance criteria and policy checklists, not narrative claims.
2. Require runtime proof where applicable (`git status`, `git diff`, local checks, logs).
3. Fail closed: missing evidence or ambiguous acceptance returns `BLOCKED/INCOMPLETE`.
4. Track repeat findings and escalate systemic defects to Program Control Agent.

## 7) Escalation triggers and routing
| Trigger | Threshold | Escalation owner | Required action |
|---|---|---|---|
| SLA breach | Same handoff missed for > 2 cycles | Program Control Agent | Open incident, assign recovery owner/date, report at next executive review |
| Budget variance | Monthly variance exceeds approved threshold (default 10%) | Finance Director Agent | Freeze non-critical work, submit re-plan to Executive Office |
| Release/quality gate failure | Any failed release gate or missing rollback plan | Engineering Director Agent + Evidence/QA Agent | Block release, remediate, rerun audit gate |
| Contract/compliance blocker | Legal hold, unresolved redline risk, or policy exception | Legal/Compliance Director Agent | Pause downstream execution until signed exception or fix |
| Security incident/control failure | Sev-1/Sev-2 incident or critical control gap | IT/Security Director Agent | Activate incident workflow, notify Executive Office immediately |
| Data integrity failure | KPI source mismatch or stale source > 1 cycle | Data/Analytics Director Agent | Mark impacted KPIs untrusted and issue corrected packet |

## 8) Cross-lane cadence (minimum)
1. Daily: Director-Operator risk sync (15 minutes equivalent).
2. Weekly: Operator-Auditor evidence review by department.
3. Weekly: cross-department escalation review run by Program Control Agent.
4. Monthly: lane contract audit with corrective actions.

## 9) v1 compliance checklist
1. Each department has named Director/Operator/Auditor owners.
2. Every handoff has an SLA and acceptance rule.
3. Every completion claim includes an evidence package.
4. Escalation triggers are wired to named owners and response actions.

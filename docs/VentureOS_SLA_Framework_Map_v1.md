# VentureOS SLA Framework Map v1

Date: 2026-03-17
Version: v1.0
Scope: canonical mapping between technical incident severities in `docs/SLA_POLICY.md` and VentureOS department handoff breach handling in `docs/VentureOS_Department_KPI_SLA_v1.md`.

Normative dependencies:
- `docs/SLA_POLICY.md`
- `docs/VentureOS_Department_KPI_SLA_v1.md`
- `docs/VentureOS_Day1_Quality_Gates_v1.md`
- `docs/VentureOS_30_Day_Operational_Cadence_v1.md`

## Purpose

VentureOS now has two connected but distinct SLA planes:

1. Technical incident SLAs
   Defined in `docs/SLA_POLICY.md` as `P0` through `P3` queue and proactive-engine severity bands.

2. Department handoff SLAs
   Defined in `docs/VentureOS_Department_KPI_SLA_v1.md` as inter-department handoffs with `level_1` through `level_3` breach handling.

This document defines how technical incidents affect department handoffs, exception approvals, and Phase 0 readiness.

## Core rule

Technical severity does not automatically equal a handoff breach.

A department handoff becomes impacted only when the technical incident blocks, delays, corrupts, or materially degrades a required handoff artifact or acceptance path.

Three states are allowed for an impacted handoff:

1. `on_time`
   The handoff still meets the target despite the incident.

2. `exception`
   The handoff would otherwise miss SLA, but an approved incident-linked exception is recorded before the deadline.

3. `late`
   The handoff missed SLA without an active approved exception, or the exception window expired before recovery.

## Dependency classes

Use these dependency classes when deciding whether a technical incident affects a handoff:

| Dependency class | Definition | Example |
|---|---|---|
| `direct_system_dependency` | The handoff artifact cannot be produced or accepted because the required system is unavailable or degraded | KPI packet blocked by data pipeline outage |
| `decision_support_dependency` | The handoff can be produced, but quality or completeness is impaired enough that acceptance cannot proceed normally | Finance variance packet missing reconciled spend inputs |
| `delivery_window_dependency` | The handoff itself is intact, but the downstream team cannot act inside the SLA window because a technical outage blocks execution | Engineering cannot start a launch-ready task because deployment controls are unavailable |

If none of these dependency classes apply, the incident stays in the technical SLA plane only and does not alter department handoff status.

## Severity-to-handoff cascade

| Technical severity | Default handoff impact | Allowed exception owner | Default handoff breach level if missed without exception | Readiness impact |
|---|---|---|---|---|
| `P0` | Immediate incident-linked exception allowed for impacted handoffs only | `executive_office:director` | `level_3` | Phase 0 readiness fails while unresolved P0 remains open or any impacted handoff lacks active approval evidence |
| `P1` | Exception allowed when the incident blocks a required handoff window | `operations:director` with producer/consumer Director acknowledgement | `level_2` by default; `level_3` if the missed handoff is declared critical-path or executive-facing | Readiness fails if on-time rate falls below threshold or if impacted handoff evidence lacks required routing/approval |
| `P2` | No automatic exception; operators should reroute or recover inside normal handoff policy when possible | Producer Director lane for exceptional cases | `level_1` | Readiness impact only through normal handoff SLA degradation |
| `P3` | Advisory only; no automatic handoff exception | none by default | `level_1` only if an actual handoff miss occurs | No direct readiness impact beyond the resulting handoff evidence |

## Exception policy by technical severity

### `P0`

- The incident clock does not pause.
- Any impacted handoff due during the outage window requires an explicit exception before the handoff deadline if it cannot complete on time.
- Required fields on the handoff record:
  - `compliance_status=exception`
  - `breach_level=level_3`
  - `exception_approved_by=executive_office:director`
  - `exception_expires_at=<timestamp>`
  - `breach_owner`
  - `breach_action`
  - incident reference in `exceptions`
- If the exception expires before the handoff completes, the handoff becomes `late` and remains `level_3`.

### `P1`

- Exception use is allowed only when the incident creates a `direct_system_dependency`, `decision_support_dependency`, or `delivery_window_dependency`.
- Approval route:
  - `operations:director`
  - acknowledgement from the producer and consumer Director lanes
- Default classification:
  - `exception` while approval is active
  - `late` with `breach_level=level_2` if the handoff misses after approval expiry or without approval
- If the handoff is marked as executive review blocking, board-facing, or launch-critical, use `level_3`.

### `P2`

- No automatic pause or exception.
- Operators are expected to recover inside the normal department SLA window using fallback procedures.
- If the miss still occurs:
  - use `compliance_status=late`
  - default to `breach_level=level_1`
  - assign `breach_owner` and `breach_action`
- A `P2` incident may justify an exception only when the producer Director explicitly records that the handoff cannot be recovered without introducing false evidence or unsafe output.

### `P3`

- No exception path by default.
- Treat as advisory/degradation context.
- Only the resulting handoff miss is recorded, not the technical severity alone.

## Critical-path handoffs

Treat the following handoff categories as critical-path by default:

1. Executive Office incident escalation briefs
2. Executive Office weekly KPI packet
3. Finance variance / allocation decisions required for operating review
4. Any handoff explicitly required by a same-day quality gate or go/no-go decision

If a technical incident causes one of these handoffs to miss without active approval evidence, classify it as `level_3`.

## Recording rules in evidence

When a technical incident affects a handoff, the handoff ledger must record:

1. the normal handoff fields from `docs/VentureOS_Department_KPI_SLA_v1.md`
2. the canonical `breach_owner` and `breach_action`
3. the incident reference in `exceptions`
4. exception approval metadata if the handoff is classified as `exception`

Recommended incident reference format:

`exceptions: "Linked incident INC-YYYY-MM-DD-NNN (P1 queue outage); fallback reconciliation running."`

## Readiness and gate effects

### Day-1 / daily gate effects

- Gate C fails when:
  - a late handoff lacks breach routing
  - on-time rate is below `0.90`
  - a `level_3` impacted handoff lacks active approval evidence

- Gate E remains fail-closed:
  - any unresolved `P0` incident yields `NO_GO`
  - approved `exception` handoffs do not restore `GO` if the same unresolved `P0` still exists

### Phase 0 readiness effects

`runtime/reports/phase0-readiness/phase0-readiness-latest.json` should be interpreted as follows:

1. `handoff-sla` fails when handoff evidence is degraded, regardless of root cause.
2. A technical incident explains the degradation only if the handoff ledger includes the incident-linked exception or breach metadata defined above.
3. Missing technical-to-handoff linkage is treated as an evidence defect, not as a valid excuse.

## Decision ownership

| Decision | Owner |
|---|---|
| Declare whether a technical incident materially impacts a department handoff | Producer Director lane + Consumer Director lane |
| Approve `P1` incident-linked handoff exception | `operations:director` |
| Approve `P0` incident-linked handoff exception | `executive_office:director` |
| Approve exception extensions beyond the original expiry | same approver as original exception |
| Certify the resulting evidence for audit/readiness | Evidence/QA Auditor lane |

## Non-goals

- This document does not change the technical queue SLA timers in `docs/SLA_POLICY.md`.
- This document does not replace the handoff breach policy in `docs/VentureOS_Department_KPI_SLA_v1.md`; it maps technical incidents into that policy.
- This document does not define degraded-mode SOPs for lane outages. That remains separate work.

## Change control

- Any change to technical severity semantics must update `docs/SLA_POLICY.md` and this document in the same PR.
- Any change to handoff breach levels or exception approval routes must update `docs/VentureOS_Department_KPI_SLA_v1.md`, this document, and any affected quality gates in the same PR.

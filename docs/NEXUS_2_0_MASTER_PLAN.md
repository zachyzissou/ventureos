# Nexus 2.0 Master Plan (Nexus-Native VentureOS)

Status: Approved for planning
Owner: @zachyzissou (human final arbiter)
Execution lead: Nexus

---

## 0) Decisions Already Made

From Mission Control alignment:

- 1.1 Human is final arbiter (not Nexus, not other agents).
- 1.2 Clarified: non-primary agents produce recommendations; they do not finalize mission decisions.
- 1.3 Single-token-first policy: YES.
- Priority ranking:
  - Reliability = 1 (highest)
  - Creativity = 2
  - Safety = 3
  - Speed = 4
- Rollout mode: visible incremental milestones in repo/issues.

---

## 1) Problem Statement

VentureOS has strong architecture pieces, but not yet a complete Nexus-native execution model. Current gaps include contract/runtime drift, role-card loading inconsistencies, and incomplete competition loop wiring.

Goal: make VentureOS operate as a deterministic, reliable, Nexus-centered control system where all sub-agents are bounded and auditable.

---

## 2) Target Operating Model

### Control hierarchy

1. Human (Zach) is final arbiter.
2. Nexus is runtime control plane and primary orchestrator.
3. Other agents are bounded executors/recommenders.

### Behavioral guarantees

- No silent routing fallback.
- No implicit authority escalation.
- Every mission decision is replayable and explainable.
- Competition improves outcomes but cannot bypass final arbitration.

---

## 3) Hard Invariants (must always hold)

- INV-001: Every mission has an explicit owner and final decision actor.
- INV-002: Agent actions must satisfy source→target contract checks before execution.
- INV-003: Unmatched/invalid handoffs hard-fail (with reason), never soft-route.
- INV-004: Competition verdicts are recommendations until accepted by primary arbiter.
- INV-005: Channel/token configuration is isolated from orchestration logic.
- INV-006: Replay data can reconstruct all route + verdict decisions.

---

## 4) Execution Phases

## Phase A — Contract Foundation (Week 1)

Objective: eliminate contract drift and make role execution deterministic.

### Scope

- Normalize role-card loading (TS/JSON compatibility + canonical ID mapping).
- Canonicalize wildcard semantics (`*`, `broadcast`, `all`) for routing + handoff validation.
- Align role-card tests with actual repository structure.

### Deliverables

- Stable `lib/role-cards.ts` behavior across environments.
- Updated tests:
  - `lib/__tests__/role-cards.test.ts`
  - routing/handoff tests for wildcard semantics.

### Exit Criteria

- Role cards load deterministically in CI/local.
- Contract tests pass without path hacks.

---

## Phase B — Nexus Authority Plane (Week 1-2)

Objective: encode explicit authority boundaries.

### Scope

- Add authority map: who can propose, execute, approve, close.
- Add policy gate in mission flow.
- Reject out-of-scope actions with machine-readable reasons.

### Deliverables

- `lib/authority-map.ts`
- `lib/policy-gate.ts`
- `lib/nexus-arbiter.ts`

### Exit Criteria

- Conflict simulation proves subordinate agents cannot self-finalize.
- Human/Nexus override path always available.

---

## Phase C — Competition Engine (Week 2)

Objective: implement controlled inter-agent competition.

### Scope

- Parallel candidate generation for same mission objective.
- Deterministic judge + rubric scorecards.
- Arbitration stage that requires acceptance before merge/apply.

### Deliverables

- `lib/arena/arena-runner.ts`
- `lib/arena/judge.ts`
- `lib/arena/scorecard.ts`
- `lib/arena/mutation-policy.ts`

### Exit Criteria

- Same mission replay produces stable ranking bands.
- Outcome decision is explainable from scorecard + arbitration log.

---

## Phase D — Observability + Replay Authority (Week 3)

Objective: full auditability and operational confidence.

### Scope

- Mission timeline includes: contracts, gates, arbitration, verdicts.
- Dashboard panel for control health + disagreement resolution metrics.

### Deliverables

- Replay schema extension for arbitration/contract events.
- Tactical map/server route updates for authority events.

### Exit Criteria

- "Why was this chosen?" can be answered from replay alone.

---

## Phase E — Deployment Safety (Week 3)

Objective: prevent recurrence of token/config failures.

### Scope

- Single-token-first guardrails.
- Routing/binding preflight checks.
- Rollback script + config lint for dangerous combos.

### Deliverables

- `scripts/preflight-routing.sh`
- `scripts/rollback-last-known-good.sh`
- docs for safe deployment sequence.

### Exit Criteria

- No token rotation required for normal operation.
- One-command rollback validated.

---

## 5) Milestone Board (visible)

This plan is tracked through milestone issues:

- M1: Contract Foundation
- M2: Nexus Authority Plane
- M3: Competition Engine
- M4: Observability + Replay
- M5: Deployment Safety
- M6: Production Readiness Report

---

## 6) Risk Register

- R1: Schema drift between role definitions and runtime contracts.
- R2: Implicit routing introduces non-deterministic behavior.
- R3: Competition loop over-optimizes verbosity instead of utility.
- R4: Token/config coupling reintroduces operational instability.

Mitigations are mandatory acceptance tests per milestone.

---

## 7) Acceptance Test Suite (required)

- Contract tests: role-card load, handoff validation, wildcard semantics.
- Authority tests: escalation rejection, override path, close authority checks.
- Competition tests: deterministic scoring, arbitration gates.
- Replay tests: decision reconstruction fidelity.
- Deployment tests: preflight lint + rollback success.

---

## 8) Definition of "Nexus-Native Complete"

VentureOS is complete for Nexus 2.0 when:

- Human final arbitration is encoded and test-validated.
- Nexus control-plane behavior is deterministic and replayable.
- Sub-agent competition improves outcome quality without bypassing control gates.
- Operational deployment is token-safe and rollback-safe.

---

## 9) Immediate Next Actions

1. Open and assign milestone issues M1-M6.
2. Ship Phase A PR (contract foundation) with tests.
3. Ship Phase B PR (authority plane skeleton + tests).
4. Ship Phase C PR (minimal competition loop + scorecard).
5. Publish weekly readiness report in repo.

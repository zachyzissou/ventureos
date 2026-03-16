# Closed-Loop Ops Notes (2026-02-07)

**Source:** historical operator note

## High‑Signal Concepts
1) **Closed‑loop execution**
   - Proposal → Auto‑approve → Mission + Steps → Worker executes → Event emitted → Triggers/Reactions → back to proposals.
2) **Single executor, separate control plane**
   - Avoid two workers claiming the same steps; pick one executor (e.g., VPS) and keep the other plane lightweight (triggers, recovery, approvals).
3) **Single proposal entry point**
   - All proposal creation goes through one function so caps, rate limits, auto‑approval, and audit events are consistent.
4) **Cap gates at proposal time**
   - Reject proposals when quotas are exceeded (don’t let blocked work pile up in queues).
5) **Triggers + reaction matrix**
   - Triggers detect conditions and return templates; reactions probabilistically create follow‑on work (adds “team‑like” behavior).
6) **Stale step recovery**
   - Periodic sweep for stuck steps; mark failed and finalize missions cleanly.
7) **Policy‑driven config**
   - Use a policy table for runtime limits/toggles instead of hardcoding behavior.

## Implications for OpenClaw‑Upgrade
- **Task queue** should be designed for closed‑loop flow, not just scheduling.
- **Usage‑gate policy** should block new work at enqueue time (not after it’s in the queue).
- **Execution-lane split** is a reliability principle (one execution lane, one control plane).
- **Triggers & reactions** map well to Phase 2 “Proactive Engine.”

## Suggested Backlog Additions
- Closed‑loop execution pipeline (proposal → approval → mission → steps → events → triggers).
- Cap‑gate checks at proposal/enqueue time (prevent queue buildup).
- Reaction matrix (probabilistic follow‑on actions) for proactive engine.
- Stale step recovery logic and mission finalization rules.

# VentureOS RPG — Personality Protocol Injection (Runtime Design)

**Date:** 2026-02-14  
**Scope:** Design (Phase 3 implementation target)  
**Goal:** Activated protocols should **modify agent behavior at runtime** in a deterministic, auditable way.

---

## 1) What “injection” means

A **protocol** is a *behavioral modifier*.

At runtime, an agent instance should receive:
- its **base identity** (role/voice)
- its **tactical overlay** (stats, victory conditions, constraints)
- its **active protocols** (from `personality_activations`)

Injection is the mechanism that takes active protocols and turns them into:
- **prompt directives** (system/developer messages)
- optional **tooling policies** (e.g., require tests, require citations)
- optional **checklists** appended to task plans

---

## 2) Proposed architecture

### 2.1 Authoritative source
- DB table: `~/clawd/agents/ventureos-rpg.db` → `personality_activations`

Query:
```sql
SELECT protocol_id, protocol_type, trigger_condition, activated_at
FROM personality_activations
WHERE agent_id = ? AND deactivated_at IS NULL
ORDER BY activated_at ASC;
```

### 2.2 Build-time materialization (recommended)
Add a lightweight materialization step after trigger checks:
- Write a per-agent JSON file:
  - `~/clawd/runtime/rpg-protocols/<agent_id>.json`

Example file:
```json
{
  "agent_id": "synth",
  "generated_at": "2026-02-14T10:20:00Z",
  "protocols": [
    {
      "id": "test_first_discipline",
      "type": "quality_gate",
      "trigger": {"ci_events": 5, "acceptance_rate": 0.76}
    }
  ]
}
```

**Benefits:**
- Spawn-time does not need SQLite access.
- Easy to inspect/debug in logs.
- Enables caching + repeatable runs.

### 2.3 Spawn-time injection
At agent spawn (or session start), the orchestrator:
1. Loads tactical overlay JSON (`~/clawd/agents/tactical-overlays/<agent>.json`)
2. Loads protocol materialization JSON (`~/clawd/runtime/rpg-protocols/<agent>.json`)
3. Produces a **protocol directive block** and appends it to the system/developer prompt.

---

## 3) Protocol → prompt mapping

Maintain a deterministic mapping from `protocol_id` to directive text.

Suggested file (Phase 3):
- `~/clawd/agents/personality-protocols/protocol-directives.json`

Example mapping:
```json
{
  "test_first_discipline": {
    "priority": 80,
    "directive": "Before calling work complete: add/verify tests, run the test suite, and report the exact command + results. Prefer failing tests over speculation."
  },
  "reference_outcomes": {
    "priority": 50,
    "directive": "When proposing a plan, cite 1–3 prior outcomes (successes/failures) that match the current failure mode."
  }
}
```

**Ordering rule:** sort by `priority DESC` then `protocol_id`.

---

## 4) Enforcement vs guidance

Protocols should be *felt*, not *forced*.

### Guidance-level injection (Phase 3 initial)
- Add protocol directives as a “must follow unless impossible” list.

### Enforcement-level injection (Phase 3+)
- Add runtime validators:
  - `test_first_discipline`: refuse completion until a test command + output is present
  - `cite_precedents`: refuse recommendations without at least one cited precedent link/path

This can be implemented as a “completion gate” wrapper around agent outputs.

---

## 5) Auditability

Every injected directive should reference:
- the protocol id
- its trigger evidence (from `trigger_condition` JSON)

Example injected block (human-readable):

> **Active Protocols (from RPG):**
> - `test_first_discipline` — triggered by `{ci_events: 5, acceptance_rate: 0.76}`
> - `code_review_checklist` — triggered by `{review_count: 10, approval_accuracy: 0.86}`

This makes the evolution explainable and harder to game.

---

## 6) Implementation sketch (Phase 3)

1. Extend `check-protocol-triggers.sh` (or add a new script) to write materialized JSON files.
2. Update the orchestrator/spawn wrapper to:
   - load `runtime/rpg-protocols/<agent>.json`
   - inject mapped directives into the prompt
3. Add a small unit test that:
   - activates a protocol in a temp DB
   - materializes JSON
   - verifies the directive block contains the expected text

---

## 7) Known dependencies / blockers

- A stable place in the runtime pipeline to modify prompts (or spawn wrappers).
- Deciding where to keep the directive mapping (repo vs canonical vault).
- Optional: a DB schema enhancement for structured activation/deactivation reasons.

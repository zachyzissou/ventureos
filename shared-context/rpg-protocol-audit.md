# VentureOS RPG — Personality Protocol Audit (Phase 2 Track 5)

**Date:** 2026-02-14  
**Owner:** Synth (Track 5 implementor)  
**Inputs reviewed:**
- `~/clawd/shared-context/rpg-memory-integration.md` (Archivist, Track 3)
- `~/clawd/shared-context/rpg-master-guide.md`
- `~/clawd/scripts/sync-memory-to-rpg.sh` (Track 3 implementation)

---

## 1) What exists today

### A) Track 3 design document: `rpg-memory-integration.md`
- Enumerates **4 base protocols**.
- Enumerates a larger set of agent-specific protocols (document text contains **more than 11**; by count it’s **13 agent-specific** in that file).
- Notes some are **blocked** on mission/escalation tracking.

### B) Track 3 implementation: `scripts/sync-memory-to-rpg.sh`
- Implements a **subset** of protocols using **tag counts** in observational memory markdown:
  - Base: `reference_outcomes`, `use_frameworks`
  - Agent-specific: `cite_precedents` (oracle), `proactive_monitoring` (atlas), `autonomous_delegation` (nexus), `proactive_documentation` (archivist), `test_first_discipline` (synth)
- Does **not** implement the full set described in the Track 3 doc.

### C) Master guide: `rpg-master-guide.md`
- Defines the **4 base protocols**.
- Also describes **additional “quality gate modifiers”** (`context_relevant_memory`, `rework_gate`, `pattern_cooldown`) which are *not* currently wired into any activation engine.

---

## 2) Mismatch / gaps

### 2.1 Protocol count mismatch (15 vs 17+)
The Phase 2 Track 3 completion report claims **15 total protocols (4 base + 11 agent-specific)**.

However, `rpg-memory-integration.md` contains more than 11 agent-specific protocol definitions (it reads like an expanded backlog).

**Resolution for Track 5 activation engine:**
- Establish a **canonical “activation set” of 15** (below) that is implementable with *current* data sources.
- Keep the remaining protocols as **backlog / future** until the required signals exist.

### 2.2 Signals not yet persisted (anti-gaming + maintainability)
Several protocols in Track 3 design reference:
- `observations_patterns` table
- pattern metadata (`metadata->>'pipeline_status'`, `downtime`, etc.)

These are **not present** in the current DB schema. Current pattern detection is done by **ripgrep over markdown tags**.

### 2.3 Auditability gaps in DB
`personality_activations` currently stores:
- activation timestamp + deactivation timestamp
- `trigger_condition` text

It does **not** store:
- activation/deactivation *reason* as a separate field
- the “computed evidence” snapshot (beyond whatever JSON we place in `trigger_condition`)

Recommendation (non-blocking): add `reason` fields or create `personality_activation_events` for structured audit.

---

## 3) Canonical protocol set used by Track 5 engine (15 total)

### Base protocols (4)
1. `reference_outcomes`
2. `use_frameworks`
3. `show_confidence`
4. `mentor_mode`

### Agent-specific protocols (11)
5. `cite_precedents` (oracle)
6. `proactive_monitoring` (atlas)
7. `false_positive_cooldown` (sentinel)
8. `escalation_quality_mode` (sentinel)
9. `test_first_discipline` (synth)
10. `code_review_checklist` (synth)
11. `autonomous_delegation` (nexus)
12. `priority_stack_enforcement` (nexus)
13. `proactive_documentation` (archivist)
14. `pattern_extraction` (archivist)
15. `context_requirement_enforcement` (verifier)

**Implementation note:** These are evaluated by the Track 5 script `~/clawd/scripts/check-protocol-triggers.sh`.

---

## 4) Backlog protocols (defined but not in canonical 15)

These appear in `rpg-memory-integration.md` but are not part of the canonical 15 set above:
- `extended_search` (oracle)
- `defensive_deployment` (atlas)

Also in master guide / integration plan (not yet wired):
- `context_relevant_memory` (observer/verifier flavor)
- `rework_gate` (synth)
- `pattern_cooldown` (archivist)

**Why backlog:** requires additional persistent signals (pattern metadata, mission linkage, rework rates, or “protocol usage” events) to be non-gameable.

---

## 5) Recommended next hardening steps (Phase 3+)

1. **Persist pattern counts in DB** (avoid rg-over-markdown in cron)
   - Create `observations_parsed` or `observations_patterns` table
   - Store `agent_id`, `tags`, `pattern_type`, `created_at`

2. **Standardize mission types**
   - Enumerate: `code_review`, `approval`, `validation`, `deployment`, `delegation`, etc.

3. **Add activation audit trail**
   - Add `activation_reason`, `deactivation_reason` columns OR new events table.

4. **Add deactivation hysteresis**
   - For volatile metrics (success rate, signal ratio): require multi-day confirmation before deactivation.

5. **Add injection runtime**
   - Implement the design in `~/clawd/shared-context/rpg-protocol-injection.md`.

# VentureOS RPG — Database Schema & Implementation Validation Report
**Date:** 2026-02-14 (CST)
**Reviewer:** Verifier (subagent)
**Scope:** Validate `rpg-database-schema.md` schema + migration/seed scripts vs `rpg-master-guide.md` requirements and `rpg-team-review-synthesis.md` feedback.

---

## Executive Summary
**Recommendation:** ⚠️ **Fix-first (small set of P0/P1 items), then approve implementation.**

- ✅ Core 8-table schema is coherent, SQLite-valid, rerunnable, and supports daily snapshots, ranks, mission tracking, interactions, and bond drift history.
- ⚠️ Several **data integrity** and **formula-debugging** gaps will cause avoidable ambiguity (missing CHECK ranges, missing inputs for Warp Tech, lack of agent ID enforcement).
- 🔴 One potential **scope mismatch**: docs state **8 agents / 28 bonds**, but the included seed example inserts **15 bonds** (the 6-agent subset from the master guide list). If Phase 2 truly needs the full 8-agent Khala matrix, the seed pipeline must be updated before kickoff.

---

## Checklist Results (Pass/Fail)

### 1) Schema Design
- ✅ **Constraints valid:** PASS (SQLite accepts UNIQUE/CHECK; no syntax issues)
- ⚠️ **Indexes on common queries:** PARTIAL PASS (good baseline; a couple performance/duplication tweaks recommended)
- ⚠️ **Data types appropriate:** PARTIAL PASS (INTEGER/REAL choices fine; missing range CHECKs)
- ⚠️ **No missing fields vs requirements:** PARTIAL PASS (core v2.0 inputs for Mastery/Energy/Shields present; Warp Tech inputs not captured)

### 2) Migration Script Syntax
- ✅ SQL valid SQLite syntax: PASS (tested in `sqlite3 :memory:`)
- ✅ Rerunnable safely: PASS (`CREATE TABLE/INDEX IF NOT EXISTS`)
- ✅ Indexes created properly: PASS
- ✅ No syntax errors: PASS

### 3) Seed Data Accuracy
- ✅ 15 bonds match documented values: PASS
- ✅ Specific bonds match (Oracle↔Archivist 0.80, Oracle↔Verifier 0.80, Atlas↔Sentinel 0.70, Sentinel↔Synth 0.40, etc.): PASS
- ✅ Alphabetical ordering enforced (agent_a < agent_b): PASS (and schema CHECK enforces it)
- 🔴 **BUT:** Docs also mention **28 pairs** (8 agents). Seed script currently demonstrates only **15** (6-agent subset). Needs alignment.

### 4) Formula Integration (Khala v2.0)
- ✅ Psionic Mastery inputs present: PASS (`memory_count`, `unique_domains`, `canonical_edits`)
- ✅ Energy inputs present: PASS (`p95_latency_s`, `mttr_minutes`, `acceptance_rate`)
- ✅ Shields inputs present: PASS (`success_rate`, `approval_accuracy`)
- ⚠️ “Can we calculate all stats from stored data?”: **PARTIAL**
  - Yes for Mastery/Energy/Shields/Psi Reach if the calculation pipeline writes raw inputs.
  - **Warp Technology v2.0 is agent-specific** and references metrics not present in DB schema.

### 5) Integration Points
- ✅ Scripts can write to DB: PASS (sqlite3 heredocs; JSON seed via jq is feasible)
- ✅ Static configs separate from DB: PASS
- ✅ DB path correct: PASS (`~/clawd/agents/ventureos-rpg.db`)

### 6) Missing Pieces / Risk Review
- ⚠️ Missing tables: **Not strictly required**, but recommended (agents registry; optional metric events)
- ⚠️ Missing indexes: minor additions recommended for OR-queries and lookup by mission/session
- ⚠️ Constraints exploitable/gamed: range/enum checks missing; recommend adding CHECK constraints + controlled write path

---

## Findings & Fixes

### ✅ What’s Good to Go
1. **Overall separation of concerns is correct**
   - Static config in git (`tactical-overlays`, `personality-protocols`) and dynamic state in SQLite.
2. **psionic_stats daily snapshot pattern is solid**
   - `UNIQUE(agent_id, snapshot_date)` prevents duplicates.
   - Stores both **computed stats** and **raw inputs** (for three core formulas).
3. **Khala network modeling is correct for pairwise bonds**
   - `CHECK(agent_a < agent_b)` + `UNIQUE(agent_a, agent_b)` prevents duplicate unordered pairs.
   - Affinity floor/ceiling enforced.
4. **Migration SQL is valid and rerunnable**
   - Tested successfully in SQLite memory DB.

---

### ⚠️ Minor Fixes (Recommended before/early Phase 1)

#### A) Add integrity CHECKs for key numeric ranges
**Why:** Prevent corrupted or “nonsense” metric writes (accidental negatives, >1 rates, >100 attributes).

**Suggested constraints:**
- `psionic_stats`:
  - `CHECK(psionic_mastery BETWEEN 0 AND 100)` etc. for the 0–100 attributes
  - `CHECK(acceptance_rate BETWEEN 0 AND 1)`
  - `CHECK(success_rate BETWEEN 0 AND 1)`
  - `CHECK(approval_accuracy BETWEEN 0 AND 1)`
  - `CHECK(p95_latency_s >= 0)`; `CHECK(mttr_minutes >= 0)`
- `psionic_ranks`:
  - `CHECK(rank BETWEEN 1 AND 15)`; `CHECK(xp >= 0)`
- `missions`:
  - `CHECK(status IN ('in_progress','completed','failed'))`

*(SQLite CHECK constraints are enforced and cheap; this is high-value.)*

#### B) Normalize/Scaling clarity for Energy inputs
Team review flagged `(100 - p95_latency_s)` risk. Current schema stores raw `p95_latency_s` and `mttr_minutes`.

Two acceptable approaches:
1. **Keep raw units**, but calculation code must normalize to 0–100 before applying weights (and store both raw + normalized).
2. Add explicit columns: `p95_latency_score` and `mttr_score` (0–100) to de-risk formula changes.

#### C) Add an “agents registry” table (optional but recommended)
**Problem:** `agent_id TEXT` allows typos (`'verifer'`) → fragmented rows.

**Recommendation:**
- `agents(agent_id TEXT PRIMARY KEY)` seeded with allowed IDs.
- Add foreign keys from tables to `agents(agent_id)`.

If you want to keep “static config in git only,” you can still seed this table from those JSON files at init time.

#### D) Index tweaks (small)
- `khala_network` query pattern often uses `WHERE agent_a = ? OR agent_b = ?`.
  - Add individual indexes: `CREATE INDEX ... ON khala_network(agent_a);` and `(agent_b);` to avoid OR-scan.
- Add indexes if frequently queried:
  - `interaction_logs(mission_id)`, `interaction_logs(session_id)`
  - `missions(mission_type)` if filtered often

#### E) Remove/avoid redundant indexes (optional cleanup)
SQLite auto-creates indexes for UNIQUE constraints.
- `idx_ranks_agent` duplicates `UNIQUE(agent_id)`
- `idx_khala_agents` duplicates `UNIQUE(agent_a, agent_b)`

Not harmful at small scale, but can be removed to reduce write overhead.

---

### 🔴 Blockers / Must Resolve Before Implementation

#### 1) Seed scope mismatch: 15 bonds vs 28 bonds (8 agents)
- `rpg-master-guide.md` states **8 agents → 28 pairwise bonds**.
- `rpg-database-schema.md` seed example inserts **15 bonds** (matching the master guide’s listed set), covering only:
  - archivist, atlas, oracle, sentinel, synth, verifier
- Missing bonds for **echo** and **nexus** (and any bonds involving them).

**Fix options:**
- **Option A (recommended):** Update `khala-network-seed.json` and seed script to insert **all 28** pairs.
- **Option B:** Explicitly document that **echo and nexus are excluded from Khala bonds** (then 6 agents → 15 pairs is correct), and update the docs that currently claim 8/28.

This needs a single clear decision to prevent drift between docs, seed data, and behavior logic.

#### 2) Warp Technology v2.0 inputs not represented in DB
The master guide defines agent-specific Warp Tech formulas relying on metrics like:
- `prevented_repeat_questions`, `severity_weight`
- `explicit_approval`, `reuse_count_30d`, `verifier_pass`
- `bugs_caught_pre_release_outside_expected`, `unique_risk_areas_covered`
- `change_success_rate`, `slo_compliance`

Current `psionic_stats` stores only `warp_technology` (computed), with **no raw inputs** to audit/debug.

**Fix options:**
- Add generalized columns to `psionic_stats` (flexible but can bloat):
  - `warp_input_1`, `warp_input_2`… (not great)
- Better: add a generic key/value table:
  - `agent_metric_events(agent_id, metric_key, metric_value, observed_at, source_ref)`
  - Or `psionic_stat_inputs(stat_id, key, value)`
- Or store a JSON blob per snapshot:
  - `warp_inputs_json TEXT` (validated with JSON schema in code)

Without this, you can still run the RPG, but you’ll lose the **Verifier-required auditability** that drove the design.

---

## Additional Notes (from Team Review)
- **Metric operationalization** remains the single biggest success risk. Schema can’t solve it alone, but adding places to store “source refs” and raw inputs will help.
- **Escalation validation**: `escalations.validated_as_real` exists, but process control (“who validates”) needs a policy decision. Consider adding `CHECK(severity IN (...))` and documenting the validator authority.
- **Lore contradiction** is non-DB; no action required in schema.

---

## Final Recommendation
**Status:** ⚠️ **Fix-first, then proceed.**

**Must-fix before kickoff:**
1. Decide/align **Khala bond scope** (15 vs 28).
2. Add a way to persist **Warp Tech raw inputs** (audit/debug).

**Strongly recommended (but not blockers):**
- Add numeric range CHECKs + status enums.
- Consider an `agents` registry + foreign keys.
- Add a couple small indexes for expected query patterns.

If the two blockers are addressed, the schema is ready for Phase 1/2 implementation.

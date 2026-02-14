# Team Review — Quality Consistency & Documentation Completeness (Verifier)

**Date:** 2026-02-14  
**Scope reviewed:**
- Docs: `shared-context/rpg-master-guide.md`, `shared-context/phase4-implementation-plan.md`, `shared-context/deep-progression-system.md`
- Code/tests: `ventureos/lib/{role-cards.ts,role-card-enforcement.ts,handoff-validator.ts,kpi-registry.ts}`, `ventureos/lib/__tests__/*`
- Data reality check: `agents/ventureos-rpg.db` schema (SQLite)

---

## 1) Quality assessment (what’s strong vs risky)

### Documentation quality (completeness / accuracy / maintainability)

**Overall:** High effort and rich detail, but **accuracy + maintainability are inconsistent** because multiple docs mix *spec*, *status log*, and *claims of completion* in a single file.

**What’s strong**
- **Depth + specificity:** All three docs are detailed enough to be “implementation guides,” not just concepts.
- **Traceability elements exist:** timestamps, owners, deliverables, and file paths are often included.
- **Clear separation of tracks** in Phase 4 plan (role cards → security → conversation), with concrete interfaces.

**What’s risky / inconsistent**
- **Status contradictions inside the same doc:**
  - `rpg-master-guide.md` starts with **“Status: Phase 2 in progress”** but later states **“✅ Phases 1-3: COMPLETE”** and “Phase 4 Tracks 1-2 complete.” This makes it hard to trust “current state.”
  - `phase4-implementation-plan.md` describes Tracks 1–2 as complete, but ends with **“Next step: User approval → Week 1 kickoff”** (reads like a pre-kickoff plan, not an executed plan).
- **Spec vs environment mismatch:** `deep-progression-system.md` uses **Postgres SQL** constructs (`JSONB`, `SERIAL`, `NOW()`, `::jsonb`, `jsonb_build_object`) while the live system is **SQLite** (`agents/ventureos-rpg.db`, accessed via `better-sqlite3`). This is a major accuracy gap for an “actionable” spec.
- **Naming drift:** deep progression migration references `psionic_rank` while the real table is `psionic_ranks`.

**Maintainability risk pattern:** docs contain lots of “live state” claims (phases complete, runtime minutes, etc.). Those sections rot quickly unless there’s a single source of truth or a strict update practice.

---

## 2) Test coverage & validation (are we shipping with adequate validation?)

### What is well-tested right now
Within `ventureos/`, tests are present and run fast.

**Passing tests (local run):** `ventureos` has **4 suites / 38 tests** passing:
- Role card loading + schema validation: `lib/__tests__/role-cards.test.ts`
- Role card enforcement heuristics: `lib/__tests__/role-card-enforcement.test.ts`
- Handoff contract validation: `lib/__tests__/handoff-validator.test.ts`
- KPI registry API + definitions: `lib/__tests__/kpi-registry.test.ts`

**Type safety:** `ventureos/tsconfig.json` has `strict: true`, which helps consistency.

### Coverage level (where we’re under-tested)
Running `npm test -- --coverage` in `ventureos/` produced:
- **All files:** **69.95% lines**, 68.49% stmts, 56% branches, 75.75% funcs
- **High coverage:** `kpi-registry.ts` ~**86.95% lines**; `handoff-validator.ts` ~**88.88% lines**
- **Low coverage:**
  - `role-cards.ts` ~**48.62% lines**
  - `role-card-enforcement.ts` ~**55.88% lines**

### The biggest validation gap: KPI computations are not “operationally validated”
The KPI registry tests strongly validate:
- schema-like structure (required fields)
- threshold logic
- category/agent coverage

But they do **not** validate that **data_sources actually work against the current SQLite schema**.

Evidence:
- Runtime warnings appear during tests: `Failed to fetch from interaction_logs: SqliteError { code: 'SQLITE_ERROR' }`
- Direct reproduction shows column mismatches:
  - `oracle_citation_accuracy.json` requests `field: "metadata"` from `interaction_logs`, but `interaction_logs` does not have a `metadata` column.
  - Running compute produces: `SqliteError: no such column: metadata` and the KPI returns **0**.

This means we can say “tests pass,” but **computed KPI values may be silently wrong** (defaulting to 0 because queries fail and the engine swallows errors).

### Role cards: schema validation is good; contract compatibility is not comprehensively tested
- Role card JSONs are validated against `agents/role-cards/schema.json`.
- Handoff validator is tested for one concrete pair (`oracle -> archivist`).
- The claim “9/9 contracts compatible” is not currently enforced by a dedicated test that enumerates and validates all declared input/output contract pairs.

---

## 3) Quality consistency (variance in delivered quality)

**Observed variance pattern:**
- **Highest quality:** KPI registry *as an artifact* (structure, docs, tests) and role cards (schema + validation) show “shipping discipline.”
- **Lower reliability / consistency:** “big specs” (e.g., deep progression) are extremely detailed but contain **environmental mismatches** (SQL dialect, table names) that would block implementation without a translation pass.
- **Validation variance:** Some areas have unit tests + coverage reporting; other areas rely on narrative validation or “tests passing” claims without runtime correctness checks (e.g., KPI queries).

Root cause: **Definition-of-done differs by task type**. Code tasks got tests; doc/spec tasks got depth but not “runnability” checks.

---

## 4) Technical debt inventory (shortcuts that will bite later)

### P0 / High risk
1. **KPI data_sources not aligned to current DB schema**
   - Many KPIs reference non-existent columns like `metadata`, `agent_id`, `action_type` in `interaction_logs`.
   - Engine swallows SQL errors → returns values that look valid but are wrong.

2. **Deep progression schema uses Postgres SQL, but system uses SQLite**
   - Creates immediate friction + implementation ambiguity.

3. **Hard-coded environment paths** in `kpi-registry.ts`
   - `KPI_DIR` and `DB_PATH` resolve via `process.env.HOME` and absolute `~/clawd/...` paths.
   - This is fragile for CI, deployment, or multi-env testing.

### Medium risk
4. **KPI computation engine is “best-effort”**
   - `fetchDataSources()` logs warnings and continues.
   - `ratio` formulas use denominator default `1` (can hide divide-by-zero and missing-data issues).
   - `average` formulas return `0` if not already aggregated in SQL.

5. **Role card enforcement logic is heuristic + lightly tested**
   - Current enforcement is keyword/pattern-based; acceptable for v1, but should be treated as “approximate.”

6. **Docs contain mixed concerns (spec + status + implementation report)**
   - Makes doc updates error-prone and reduces trust.

### Low risk / hygiene
7. Coverage reports can become stale (older `coverage/` existed before KPI tests were added). Not fatal, but contributes to inconsistency perception.

---

## 5) Recommendations (3–5 concrete practices to improve consistency)

### 1) Adopt a single **Definition of Done** for every deliverable (code *and* docs)
Add a required checklist item for any “complete” claim:
- [ ] What is implemented vs planned is explicitly stated
- [ ] Tests exist for the critical path (or explicit “No tests; why”)
- [ ] All referenced file paths exist (or are marked future)
- [ ] If it computes metrics: **run against current DB schema without SQL errors**

### 2) Add **runtime validation tests** for KPIs (schema + DB reality)
Create a test that, for each KPI definition:
- validates JSON against `agents/kpis/schema.json` (Ajv)
- validates that every `data_sources[].table` exists
- **validates that referenced columns exist** (or definitions provide explicit `SELECT ... AS` aliases)
- executes the generated query with `LIMIT 1` and fails on SQL errors

This directly addresses the “tests pass but values are wrong” inconsistency.

### 3) Make paths/config injectable (stop baking `~/clawd/...` into libraries)
Refactor `kpi-registry.ts` (and any similar libs) to accept:
- `kpiDir` and `dbPath` via parameters/env vars
- provide defaults for local dev

This will enable reliable CI tests with an ephemeral fixture DB.

### 4) Split docs into **Spec / Status / Postmortem** (reduce rot)
For example:
- `phase4-implementation-plan.md` (spec + plan)
- `phase4-status.md` (current status only, short)
- `phase4-completion-report.md` (what shipped, what didn’t, verification steps)

Similarly, keep `rpg-master-guide.md` as the stable “how it works,” and move time-stamped progress logs elsewhere.

### 5) Put a **minimum-quality gate** in CI for VentureOS
Even a light gate improves consistency:
- run `npm test -- --coverage`
- fail if overall lines < X% OR if key modules regress
- require `strict` TS build (`tsc -p tsconfig.json`)

A realistic first bar: keep `kpi-registry.ts` ≥80% lines; gradually raise `role-cards.ts` and `role-card-enforcement.ts`.

---

## Appendix — Quick “what’s well-tested vs untested” map

**Well-tested / higher confidence**
- KPI registry: definition loading, thresholds, explanations, batch compute scaffolding (but not query correctness)
- Handoff validator: contract existence + JSON schema validation for a known example
- Role card schema validation: AJV validation + file presence

**Under-tested / lower confidence**
- KPI query correctness vs DB schema (columns/filters/aliases)
- Role card contract compatibility across all agent pairs (systematic enumeration)
- Role card enforcement behavior across realistic messages/actions (edge cases)
- Deep progression implementation readiness (SQL dialect + migration feasibility)

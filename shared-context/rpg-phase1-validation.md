# VentureOS RPG — Phase 1 Validation + VOXYZ Comparison

Date: 2026-02-14 (America/Chicago)
Validator: Verifier subagent (automated checks + spot verification)

---

## 1) Phase 1 Implementation Verification (Pass/Fail)

### 1. Database (`~/clawd/agents/ventureos-rpg.db`)

**Status: PASS**

**Checks performed (evidence):**

- **File exists:** `/Users/zachgonser/clawd/agents/ventureos-rpg.db` ✅
- **Tables present (expected 8 / found 8):** ✅
  - `psionic_stats`, `psionic_ranks`
  - `khala_network`, `khala_drift_history`
  - `missions`, `interaction_logs`
  - `personality_activations`, `escalations`

- **Khala bonds seeded (expected 28 / found 28):** ✅
  - `SELECT count(*) FROM khala_network;` → **28**
  - Coverage check: all 8 agents → all **C(8,2)=28** pairs present (no missing pairs)
  - Affinity range sanity: min/max observed **0.40 / 0.85** (within constraint bounds)

- **CHECK constraints working:** ✅
  - Invalid `psionic_stats.energy=200` rejected (CHECK `0..100`)
  - Invalid `khala_network` ordering (`agent_a < agent_b`) rejected
  - Invalid `khala_network.affinity=0.99` rejected (CHECK `0.10..0.95`)

- **Indexes present:** ✅
  - Explicit indexes found across all tables (examples):
    - `idx_stats_agent_date` on `psionic_stats(agent_id, snapshot_date DESC)`
    - `idx_khala_agents`, `idx_khala_updated`
    - `idx_interactions_agents`, `idx_missions_status`, etc.

- **All 8 agents have current stats (snapshot_date=2026-02-14):** ✅
  - `SELECT count(*) FROM psionic_stats WHERE snapshot_date='2026-02-14';` → **8**
  - Agents present: `archivist, atlas, echo, nexus, oracle, sentinel, synth, verifier`

**Notes:**
- `khala_drift_history` exists but currently has **0 rows** (expected for Phase 1).

---

### 2. Calculation Scripts

**Status: PASS**

- `~/clawd/scripts/calculate-psionic-stats.sh` ✅
  - Executable: `-rwxr-xr-x`
  - Ran without errors against the live DB.
  - Confirmed idempotency: rerun updates `calculated_at` (UPSERT) without increasing row count.
  - Confirmed writes:
    - `psionic_stats.calculated_at` changed from `09:27:28` → `09:31:16` (UTC-ish timestamps from SQLite `CURRENT_TIMESTAMP`)
    - `psionic_ranks.updated_at` changed accordingly

- `~/clawd/scripts/update-psionic-ranks.sh` ✅
  - Executable: `-rwxr-xr-x`
  - Ran without errors against the live DB.
  - Confirmed ranks and XP present for all 8 agents.

**Important implementation detail:**
- Both scripts follow VOXYZ’s level/rank formula family (`log2(memory + missions*3 + 1) + 1`) and UPSERT into ranks.

**Known limitation (Phase 1-acceptable):**
- `~/clawd/runtime/rpg-metrics/` exists but is currently **empty**, so the calculator is using its **built-in defaults** (bootstrap mode). This is the largest “not production-real” gap.

---

### 3. Tactical Overlays (`~/clawd/agents/tactical-overlays/`)

**Status: PASS**

- **Files present:** 8 JSON files ✅
  - `archivist.json, atlas.json, echo.json, nexus.json, oracle.json, sentinel.json, synth.json, verifier.json`
- **JSON validity:** parsed successfully via Python `json.load` ✅
- **All agents represented:** 8 unique `agent_id` values ✅

---

### 4. Daily Cron

**Status: PASS**

**Job record verified in OpenClaw cron store:** `~/.openclaw/cron/jobs.json` ✅

- **Job ID:** `ec114bdd-8e87-4ed8-a270-4844bc325f35`
- **Enabled:** true
- **Schedule:** `0 6 * * *` (tz: `America/Chicago`) → Daily 6:00 AM CST ✅
- **State indicates tested/working:** ✅
  - `lastStatus: ok`
  - `lastDurationMs: 25399` (~25s)
  - `consecutiveErrors: 0`

**Documentation present:** ✅
- `/Users/zachgonser/clawd/ventureos/docs/CRON_SPECS.md` includes “Daily Psionic Stats Calculation (VentureOS RPG)”
- `/Users/zachgonser/clawd/shared-context/rpg-master-guide.md` includes the cron section + job ID

---

### 5. Backup Script

**Status: PASS**

- `~/clawd/scripts/backup-rpg-db.sh` exists and is executable ✅
- Retention configured for **7 days** ✅
  - Uses: `find "$BACKUP_DIR" ... -mtime +6 -delete`
- Test run succeeded ✅
  - Created: `/Users/zachgonser/clawd/backups/rpg-2026-02-14.db`

---

## 2) VOXYZ System Comparison (Patterns + Tradeoffs)

Reference: `~/clawd/shared-context/voxyz-rpg-reference.md` (from <https://x.com/Voxyz_ai/status/2021370776926990530>)

### Comparison Matrix (VOXYZ vs Ours)

| Dimension | VOXYZ | VentureOS RPG (Phase 1) | Assessment / Tradeoff |
|---|---|---|---|
| Storage | Supabase/Postgres | Local SQLite (`ventureos-rpg.db`) | **Pattern match** (DB-backed dynamic state). SQLite is simpler + portable; Postgres scales better (concurrency, remote access, RLS, analytics). |
| Static config | TypeScript role cards + voice directives | JSON tactical overlays (+ personality protocol dir) | **Mostly aligned**. TS offers type safety + tooling; JSON is easy to edit but needs validation tooling to prevent drift. |
| Data separation | Static in code; dynamic in DB | Static overlays/protocols; dynamic stats/ranks/bonds in DB | **Aligned** with VOXYZ philosophy. |
| Snapshots | Daily snapshots; uses baseline window (7 days) | Daily snapshots via cron; baseline computed ad-hoc in queries (no dedicated baseline table yet) | **Functionally similar**, but VOXYZ baseline is more explicit/operationalized. Recommend adding materialized 7d baseline view/table for stability and reporting. |
| Metrics | Social distribution metrics (engagement, impressions, viral score, etc.) | Domain stats (WIS/SPD/TRU/CRE/RCH) | **Appropriate** domain adaptation, but Phase 1 uses bootstrap defaults. Main work is connecting real metrics sources. |
| Rank/Level | `level = min(15, floor(log2(memory + missions*3 + 1)) + 1)` | Same rank formula in scripts | **Strong match**; good parity. |
| Relationships | Affinity matrix (0.10–0.95) used to shape behavior | `khala_network` affinity seeded for all pairs | **Match in structure**. Missing: using affinity operationally (speaking order, challenge probability, mentor selection). |
| Drift | Drift records after interactions; last ~20 kept | `khala_drift_history` table exists but unpopulated | **Phase 2-ready scaffold**, but drift ingestion + rules not implemented. |
| Voice evolution | Deterministic “voice modifiers” derived from memory types/tags/confidence | Not implemented in Phase 1 | Gap vs VOXYZ; likely Phase 2/3 work (depends on memory schema maturity). |
| UI | React + Three Fiber avatars | No UI (Phase 1 explicitly “no UI”) | Expected difference; not a Phase 1 miss. |

---

## 3) Gap Analysis (What VOXYZ has that we don’t — yet)

### A) Metrics ingestion is still bootstrap-mode
- Current calculator falls back to hardcoded defaults because `~/clawd/runtime/rpg-metrics/*.json` is empty.
- This is fine for proving the pipeline, but not for “truthful” stats.

### B) Drift tracking not wired into real events
- `khala_drift_history` exists but no code writes to it.
- No deterministic drift policy yet (e.g., per interaction type, severity, outcome).

### C) Relationship affinity not used to influence behavior
- VOXYZ uses affinity to shape speaking order, tone, conflict selection, mentoring.
- We currently store affinity but don’t apply it to routing/orchestration.

### D) “Hard bans” and role-card enforcement parity
- VOXYZ strongly emphasizes hard bans + deterministic guardrails.
- We have overlays and protocols, but not a single consolidated “role-card schema” with bans/DoD/escalations per agent that’s enforced in runtime.

### E) Baseline/window strategy is implicit
- We snapshot daily, but we don’t persist a canonical “7-day baseline” summary artifact.
- This makes dashboards and drift detection harder to standardize.

---

## 4) Recommendations (Phase 2 Priorities)

### Priority 1 — Real metric sources + attribution
- Populate `~/clawd/runtime/rpg-metrics/<agent>.json` from real systems (logs, mission outcomes, approvals, latency/mttr monitors).
- Keep the current “warp_tech_inputs” JSON audit blob (good design) and expand it to include source timestamps.

### Priority 2 — Implement drift engine + retention
- Add a deterministic drift function:
  - Inputs: `interaction_logs`, `missions`, `escalations`, optional sentiment or outcome tags
  - Output: update `khala_network.affinity` within bounds; append to `khala_drift_history`
- Add retention policy (“keep last N drift records per pair” or time-based TTL), matching VOXYZ traceability intent.

### Priority 3 — Make affinity operational
- Use `khala_network.affinity` to influence:
  - mediator selection
  - escalation partner recommendation
  - review assignment / cross-check routing
  - (optionally) challenge probability / debate pairing

### Priority 4 — Baselines as first-class artifacts
- Add a view/table like `psionic_stats_baseline_7d` (per agent) and store it daily.
- This will simplify “delta vs baseline” reporting and trend detection.

### Priority 5 — Role cards + bans as enforceable schema
- Consider a unified “role-card” JSON/TS schema per agent:
  - domain / inputs / outputs / DoD / bans / escalation triggers / KPIs
- Add automated validation + CI linting to prevent accidental schema drift.

---

## 5) Overall Assessment

**Phase 1 is operational and internally consistent.**

- ✅ Core pipeline exists end-to-end: overlays → calculation → DB snapshots → ranks → daily cron → backups.
- ✅ Data model supports VOXYZ-like patterns (snapshots, ranks, affinity + drift history).
- ⚠️ Not yet “production-truthful” because real metric ingestion and drift/event wiring are not implemented.

**Verdict:** *Production-ready as a Phase 1 scaffold / bootstrap system.*
**Needs Phase 2 work** for real-world accuracy and VOXYZ-level behavioral dynamics (drift + bans + affinity-driven orchestration).

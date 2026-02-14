# VentureOS RPG System — Master Guide (Protoss Edition)
## *"En Taro Adun — Through the Khala, We Are One"*

**Last Updated:** 2026-02-14 09:37 CST  
**Status:** 🚀 Phase 2 in progress (Track 1: Metrics Ingestion)  
**Lead:** Nexus (Mission Control)

---

## Table of Contents

1. [Overview & Purpose](#overview--purpose)
2. [Agent → Protoss Unit Mapping](#agent--protoss-unit-mapping)
3. [Core Components](#core-components)
   - [Psionic Attributes](#psionic-attributes)
   - [Psionic Rank System](#psionic-rank-system)
   - [Khala Network](#khala-network)
   - [Personality Protocols](#personality-protocols)
4. [Implementation Phases](#implementation-phases)
5. [Team Feedback & Critical Decisions](#team-feedback--critical-decisions)
6. [File Structure](#file-structure)
7. [Quick Reference Tables](#quick-reference-tables)

---

## Overview & Purpose

**What:** Integrate Protoss-themed RPG system to make agent performance visible, relational, and evolutionary through the Khala.

**Why:** 
- Makes metrics **visceral and readable** (psionic attributes > JSON dumps)
- Adds **emergent narrative** to agent interactions (Khala Network bonds)
- Creates **natural evolution** (personality protocols tied to experience)
- Provides **engaging visualization** for dashboard

**Inspiration:** [VOXYZ_AI article](https://x.com/Voxyz_ai/status/2021370776926990530) on RPG character systems for multi-agent crews

**Key Principle:** Agent IDs (oracle, atlas, etc.) **never change**. Protoss unit names are display/theming layer only.

---

## Agent → Protoss Unit Mapping

**CRITICAL NAMING CONVENTION:**

| Agent ID | Protoss Unit | Role | Campaign Availability |
|----------|--------------|------|----------------------|
| **echo** | Artanis | CEO Orchestrator | Hero unit |
| **nexus** | Nexus | Mission Control Hub | Core structure |
| **oracle** | Zeratul (Dark Templar Prelate) | Research & Foresight | Campaign hero |
| **atlas** | Probe | Infrastructure Fabricator | Basic worker |
| **sentinel** | Sentinel (Stalker variant) | Security Guardian | Campaign variant |
| **verifier** | Observer | Detection & Reconnaissance | Support unit |
| **archivist** | High Templar | Knowledge Keeper | Advanced unit |
| **synth** | Dark Templar | Shadow Weaver / Creator | Advanced unit |

**Design Notes:**
- Echo = Artanis (ultimate commander)
- Nexus already perfect (mission control hub)
- Sentinel unit name matches agent perfectly
- Each unit represents its agent's tactical role in the Protoss campaign

---

## Core Components

### Psionic Attributes

**6 Attributes mapped from real KPIs** (Templar-tuned formulas from agent feedback):

#### 1. **Psionic Mastery** (WIS - Wisdom/Memory)
**Measures:** Memory depth + source diversity + archive impact

**Formula (v2.0-khala):**
```
Psionic_Mastery = (log2(memory_count + 1) × 15) 
                + (unique_domains × 2) 
                + min(canonical_edits × 2.5, 15)
```

**Data Sources:**
- `observational_memory.entry_count`
- `research_sources.unique_domains` (Oracle feedback)
- `archive.canonical_edits` (Archivist feedback, capped at +15)

**Agent-Specific:**
- Oracle/Archivist primary stat
- Sentinel/Verifier secondary stat

---

#### 2. **Energy** (SPD - Speed/Response Time)
**Measures:** Response time + recovery speed, quality-gated

**Formula (v2.0-khala):**
```
Energy_base = [0.7 × (100 - p95_latency_s) + 0.3 × (100 - MTTR_minutes)]

Energy_final = Energy_base × quality_multiplier
where quality_multiplier = 0 if acceptance < 0.7, else 1.0
```

**Data Sources:**
- `kpis.p95_latency_s`
- `kpis.MTTR_minutes` (Atlas feedback - blend recovery time)
- `verifier_feedback.acceptance_rate` (quality gate from Synth/Verifier feedback)

**Quality Floor:** No SPD credit if work acceptance < 0.7 (prevents gaming)

**Agent-Specific:**
- Atlas/Synth primary stat
- Verifier secondary (time-to-first-signal)

---

#### 3. **Shields** (TRU - Trust/Reliability)
**Measures:** Reliability + judgment accuracy

**Formula (v2.0-khala):**
```
Shields = (success_rate × 80) + (approval_accuracy × 20)

where approval_accuracy = (correct_approvals + correct_denials) / total_decisions
```

**Data Sources:**
- `kpis.success_rate`
- `approval_logs.accuracy` (Sentinel feedback - approval accuracy > raw prevention)

**Agent-Specific:**
- All agents (universal reliability metric)
- Sentinel tracks approval_accuracy specifically

---

#### 4. **Warp Technology** (CRE - Creativity/Output Quality)
**Measures:** Output acceptance + impact (agent-specific formulas)

**Formulas (v2.0-khala, agent-specific):**

**Oracle/Archivist:**
```
Warp_Tech = prevented_repeat_questions × severity_weight
```
- Decision usefulness (Oracle feedback)
- Impact over clarity (Archivist feedback)

**Synth:**
```
Warp_Tech = (0.60 × explicit_approval) 
          + (0.25 × reuse_count_30d) 
          + (0.15 × verifier_pass)
```
- Weighted acceptance from multiple signals (Synth feedback)

**Verifier:**
```
Warp_Tech = (bugs_caught_pre_release_outside_expected × severity) 
          + unique_risk_areas_covered
```
- Novel coverage, not test count (Verifier feedback)

**Atlas:**
```
Warp_Tech = (change_success_rate × 60) + (slo_compliance × 40)
```
- Deployment reliability + SLO adherence

**Data Sources:**
- `repeat_questions_prevented` (Oracle/Archivist)
- `explicit_approvals`, `reuse_tracking`, `verifier_feedback` (Synth)
- `bug_reports.pre_release`, `risk_areas` (Verifier)
- `deployment_logs`, `slo_metrics` (Atlas)

---

#### 5. **VRL** (Viral/Engagement)
**Status:** **Deferred** — requires public posting/engagement tracking  
**Future:** Enable when we have public content distribution

---

#### 6. **Psi Reach** (RCH - Reach/Task Volume)
**Measures:** Task volume + impact scope

**Formula (v2.0-khala):**
```
Psi_Reach = min(100, log2(tasks_completed + 1) × 20)
```

**Data Sources:**
- `mission_logs.completed_count`

**Agent-Specific:**
- Oracle (research breadth)
- Atlas (infrastructure scope)

---

### Psionic Rank System

**Formula:**
```
rank = min(15, floor(log2(memory_count + completed_missions×3 + 1)) + 1)
```

**XP Sources:**
- Memory entries: 1 XP each
- Completed missions: 3 XP each

**Progression:**
- Level 1: 0 XP
- Level 2: 1 XP
- Level 3: 2 XP
- Level 4: 4 XP
- Level 5: 8 XP
- Level 6: 16 XP
- Level 7: 32 XP
- ... (logarithmic scaling)
- Level 15: 16384+ XP (cap)

**Rationale:** Logarithmic prevents inflation, missions weighted 3× higher than memory (action > observation)

---

### Khala Network

**Templar-validated psionic bonds** between 8 agents (28 pairwise relationships)

#### Seed Values (Locked @ 07:46 CST)

**High Affinity (0.75+) — Khalai Alignment:**
- Oracle ↔ Archivist: **0.80** (was 0.85, adjusted per Archivist feedback)
- Oracle ↔ Verifier: **0.80** (strengthened from 0.75 per Oracle feedback)
- Sentinel ↔ Verifier: **0.85** (both gatekeepers)
- Archivist ↔ Verifier: **0.80**
- Archivist ↔ Sentinel: **0.80**
- Archivist ↔ Atlas: **0.80** (strongest for Archivist)
- Atlas ↔ Verifier: **0.75**
- Synth ↔ Archivist: **0.65** (lowered from 0.75 per Archivist feedback - speculative work)

**Medium Affinity (0.50-0.74) — Collaborative:**
- Oracle ↔ Atlas: **0.70**
- Oracle ↔ Sentinel: **0.65**
- Atlas ↔ Sentinel: **0.70** (raised from 0.60 per Atlas feedback - infra needs tight guardianship)
- Verifier ↔ Synth: **0.65**
- Oracle ↔ Synth: **0.60**
- Atlas ↔ Synth: **0.55**

**Low Affinity (<0.50) — Productive Tension:**
- Sentinel ↔ Synth: **0.40** (confirmed by both - guardian vs shadow, healthy friction not hostility)

#### Drift Tracking

**Rules:**
- Successful handoff/collaboration: **+0.03**
- Failed handoff/conflict: **-0.03**
- Neutral interaction: **no change**
- Floor: **0.10** (minimum, even at worst)
- Ceiling: **0.95** (maximum, maintain healthy distance)

**New: Escalation Quality Tracking (Sentinel feedback):**
```json
{
  "escalation_quality": {
    "total_escalations": 10,
    "validated_real_issues": 8,
    "signal_ratio": 0.80
  }
}
```
- Tracks Sentinel escalations vs actual issues
- Signal ratio becomes part of trust evaluation

**History:** Last 20 drift events logged with timestamp + reason

---

### Personality Protocols

**Memory-driven behavioral modifiers** that evolve with experience

#### Base Protocols (All Agents)

| Trigger | Protocol | Effect |
|---------|----------|--------|
| `memory_count ≥ 8` | **reference_outcomes** | Cite past outcomes when making recommendations |
| `pattern_count ≥ 6` | **use_frameworks** | Look for systematic approaches |
| `completed_missions ≥ 10` | **show_confidence** | Reduce hedging, show confidence |
| `rank ≥ 7` | **mentor_mode** | Teach methodology, help improve skills |

#### Quality Gate Protocols (Agent-Specific)

**Verifier:**
```json
{
  "id": "false_positive_cooldown",
  "condition": {"false_positive_streak": 3},
  "directive": "Recalibrate sensors. Add extra evidence before calling violations."
}
```

**Verifier (context-relevance):**
```json
{
  "id": "context_relevant_memory",
  "condition": {"memory_count": 8},
  "directive": "Reference prior failures only when they match the same failure mode."
}
```

**Synth:**
```json
{
  "id": "rework_gate",
  "condition": {"last_30d_rework_rate": 0.3},
  "directive": "Engage secondary review pass. Recent work needed 30%+ rework."
}
```

**Archivist:**
```json
{
  "id": "pattern_cooldown",
  "condition": {"missions_since_last_pattern_use": 3},
  "directive": "After using pattern-driven modifier, wait 3-5 missions before re-channeling."
}
```

#### Energy Quality Floor (Synth + Verifier feedback)

**Rule:** Energy bonus only applies if work quality meets threshold.

```
Energy_final = Energy_raw × quality_multiplier
where quality_multiplier = 0 if acceptance < 0.7, else 1.0
```

**Verifier addition:** Must cite inspected artifact/log/output. No citation = no SPD credit.

---

## Validation & Blocker Resolution

**Validation Date:** 2026-02-14 08:59 CST  
**Validator:** Verifier (Observer)  
**Report:** `~/clawd/shared-context/rpg-validation-report.md`

### Validation Results

**✅ Passed:**
- SQL syntax valid (tested in `:memory:`)
- All seed bond values match documented specifications
- Constraints and indexes correctly defined
- Formula integration captures core stats (WIS/SPD/TRU)

**🔴 Blockers Identified:**

1. **Blocker 1: Bond Count Mismatch**
   - **Issue:** Docs specified 28 bonds (8 agents), seed script had 15 (6 specialist agents only)
   - **Missing:** Echo and Nexus bonds with specialists
   - **Decision (approved 2026-02-14 09:01 CST):** Seed all 28 bonds
   - **Rationale:** Nexus needs bond data for intelligent routing; Echo needs it for escalation quality tracking
   - **Bond semantics:**
     - Specialist↔Specialist: collaboration/handoff quality
     - Orchestrator↔Specialist: escalation/question quality, clarity, resolution
   - **Fix:** Add 13 bonds (echo↔6 specialists + nexus↔6 specialists + echo↔nexus)

2. **Blocker 2: Warp Tech Auditability**
   - **Issue:** Schema stored computed `warp_technology` value but not raw inputs
   - **Impact:** Cannot audit or debug agent-specific Warp Tech formulas
   - **Decision (approved 2026-02-14 09:01 CST):** Add JSON column to `psionic_stats`
   - **Fix:** `ALTER TABLE psionic_stats ADD COLUMN warp_tech_inputs TEXT;`
   - **Stores:** Agent-specific raw metrics as JSON (e.g., `{"approvals": 12, "reuse_30d": 5}`)

**⚠️ Minor Fixes (non-blocking):**
- Add CHECK constraints for stat ranges (0-100)
- Add CHECK constraints for rate fields (0-1)
- Add enum checks for status/severity fields
- Consider agents registry table + foreign keys for referential integrity

### Fix Status

**Owner:** Synth (Dark Templar)  
**Started:** 2026-02-14 09:02 CST  
**Completed:** 2026-02-14 09:10 CST  
**Runtime:** 7m49s  
**Tasks:**
- [x] Received task specification
- [x] Update `rpg-database-schema.md` with blocker fixes
- [x] Update migration script with new column + CHECK constraints
- [x] Update seed script with all 28 bonds
- [x] Validate migration in `:memory:`
- [x] Commit changes

**Deliverables:**
- `/Users/zachgonser/clawd/scripts/init-rpg-database.sh` — Migration script with all fixes
- `/Users/zachgonser/clawd/scripts/seed-khala-network.sh` — Seeds 28 bonds (8 agents fully connected)
- Updated `rpg-database-schema.md` with JSON column, CHECK constraints, query examples

**Bond Values Assigned:**
- Echo↔specialists: 0.65-0.80 (orchestrator role)
- Nexus↔specialists: 0.65-0.80 (coordinator role)
- Echo↔Nexus: 0.85 (co-founder bond)

---

## Phase 1 Implementation (In Progress)

**Approved:** 2026-02-14 09:12 CST  
**ETA:** 30-60 minutes

### Track 1: Infrastructure (Atlas) ✅ COMPLETE

**Owner:** Atlas (Probe)  
**Started:** 2026-02-14 09:12 CST  
**Completed:** 2026-02-14 09:14 CST  
**Runtime:** 2m28s  
**Tasks:**
- [x] Set up production database (verify existing or recreate)
- [x] Seed 28 Khala bonds
- [x] Create directory structure (tactical-overlays, personality-protocols)
- [x] Create backup script
- [x] Verify constraints and indexes

**Deliverables:**
- Operational database at `~/clawd/agents/ventureos-rpg.db` (8 tables, 14 indexes)
- 28 bonds verified (8 agents fully connected)
- Backup script: `~/clawd/scripts/backup-rpg-db.sh` (7-day retention)

**Verification Results:**
- All CHECK constraints working (tested with invalid inserts)
- All indexes present
- Backup script tested and operational

### Track 2: Calculation Logic (Synth) ✅ COMPLETE

**Owner:** Synth (Dark Templar)  
**Started:** 2026-02-14 09:12 CST  
**Completed:** 2026-02-14 09:21 CST  
**Runtime:** 9m2s  
**Tasks:**
- [x] Create 8 tactical overlay JSON files
- [x] Create psionic stats calculation script (Khala v2.0)
- [x] Create rank update script
- [x] Test with mock data
- [x] Document data sources

**Deliverables:**
- 8 agent configs: `~/clawd/agents/tactical-overlays/*.json` (oracle, atlas, sentinel, verifier, archivist, synth, echo, nexus)
- Calculation script: `~/clawd/scripts/calculate-psionic-stats.sh` — Computes WIS/SPD/TRU/CRE/RCH
- Rank script: `~/clawd/scripts/update-psionic-ranks.sh` — Calculates ranks 1-15
- Data source documentation: `~/clawd/shared-context/rpg-metrics-data-sources.md`

**Test Results:**
- All 8 agents have stats in database
- Scripts are idempotent (safe to rerun)
- Warp tech inputs stored as JSON for auditability

**Note:** CRE formulas for sentinel/echo/nexus are placeholders (to be refined in Phase 2)

### Phase 1 Complete — Validation In Progress ✅

**All tracks complete:**
- ✅ Track 1 (Infrastructure): Database, directories, backup script (2m28s)
- ✅ Track 2 (Calculations): Configs, calculation scripts, testing (9m2s)
- ✅ Daily Cron Setup: Automated stats calculation (4m38s)

**Cron Setup (Complete):**
- Job ID: ec114bdd-8e87-4ed8-a270-4844bc325f35
- Schedule: Daily 6:00 AM CST (`0 6 * * *`)
- Runs: `calculate-psionic-stats.sh` automatically
- Delivery: Silent on success, announces errors to #nexus-mission-control
- Test run: ✅ Verified working (~25s runtime)
- Documentation: Added to `/Users/zachgonser/clawd/ventureos/docs/CRON_SPECS.md`

**Validation (Verifier, complete — 4m40s):**
- Comprehensive Phase 1 verification: ✅ ALL PASS
- VOXYZ system comparison: ✅ Following patterns correctly
- Gap analysis: 2 items for Phase 2 (metrics ingestion, drift tracking)
- Phase 2 recommendations documented
- Report: `~/clawd/shared-context/rpg-phase1-validation.md`

**Validation Results:**
- Database operational (8 tables, 28 bonds)
- Scripts functional and idempotent
- Cron working (verified test run)
- Architecture matches VOXYZ patterns
- Production-ready for Phase 1 scope

**Phase 2 Gaps Identified:**
1. Metrics ingestion pipeline (bootstrap defaults currently)
2. Drift tracking engine (table ready, logic needed)

**Ready for Phase 2:** Khala Network drift tracking + metrics ingestion

---

## Phase 2 Implementation (In Progress)

**Approved:** 2026-02-14 09:37 CST  
**Estimated Duration:** 1-2 weeks (18-26 hours)

### Track 1: Metrics Ingestion Pipeline (Synth) — IN PROGRESS

**Owner:** Synth (Dark Templar)  
**Started:** 2026-02-14 09:37 CST  
**Timeout:** 6 hours  
**Tasks:**
- [ ] Design metrics collection schema
- [ ] Identify data sources (session logs, memory files, agent-specific)
- [ ] Create collector scripts (session parser, memory collector, agent-specific, aggregator)
- [ ] Test with real data (all 8 agents)
- [ ] Integrate with calculation pipeline

**Deliverables:**
- Metrics collection schema documented
- Collector scripts: `~/clawd/scripts/collect-*-metrics.sh`
- Production metrics: `~/clawd/runtime/rpg-metrics/*.json`
- Documentation: `rpg-metrics-collection.md`

### Track 2: Drift Tracking Engine (Oracle) — PENDING

**Owner:** Oracle (Zeratul)  
**Estimated:** 4-6 hours  
**Tasks:**
- Design drift calculation logic
- Implement interaction detection
- Create drift update script
- Test with mock interactions

**Deliverables:**
- `update-khala-drift.sh` script
- Interaction detection logic
- Testing framework

### Track 3: Observational Memory Integration (Archivist) — PENDING

**Owner:** Archivist (High Templar)  
**Estimated:** 2-3 hours  
**Tasks:**
- Integrate drift tracking into memory cron
- Add interaction logging
- Test automated drift updates

**Deliverables:**
- Daily drift tracking operational
- Memory cron updated

### Track 4: Escalation Quality Tracking (Sentinel + Verifier) — PENDING

**Owner:** Sentinel + Verifier  
**Estimated:** 3-4 hours  
**Tasks:**
- Implement escalation logging
- Create signal ratio calculator
- Test with historical data

**Deliverables:**
- Escalation tracking in `escalations` table
- Signal ratio metrics

### Track 5: Personality Protocol Evaluation (Synth + Atlas) — PENDING

**Owner:** Synth + Atlas  
**Estimated:** 3-4 hours  
**Tasks:**
- Implement activation detection
- Create protocol evaluation logic
- Wire up quality gates

**Deliverables:**
- Protocol system operational
- Quality gates enforced

### Optional Track 6: Bond-Influenced Behavior — DEFERRED

**Owner:** Echo + Synth  
**Estimated:** 2-3 hours  
**Status:** Optional, may defer to later

---

## Implementation Phases

### Phase 1: Core Psionic System (2 weeks, no UI)

**Deliverables:**
1. ✅ Tactical Overlay JSON Schema
2. ✅ Port 8 agent data → JSON (with Protoss unit classifications)
3. ✅ Personality Protocol schemas with quality gates
4. ✅ Psionic attribute calculation script (Khala v2.0 formulas)
5. ✅ Psionic Rank tracking
6. ✅ Daily Nexus cron for attribute updates

**Success Criteria:**
- Attributes/ranks calculated daily for all 8 agents
- No manual intervention needed
- Quality gates defined and ready for Phase 2

**Owner:** Atlas (implementation), Oracle (design), Verifier (validation)

---

### Phase 2: Khala Network System (1-2 weeks)

**Deliverables:**
1. ✅ Khala Network seed data (28 pairwise bonds, Templar-validated)
2. ✅ Drift tracking integration (observational memory cron)
3. ✅ Escalation quality tracking (Sentinel)
4. ✅ Personality protocol evaluation system
5. ⚠️ Bond-influenced behavior (optional - Echo mediation for <0.5 affinity)

**Success Criteria:**
- Khala Network updates automatically after interactions
- Personality protocols activate based on thresholds
- Drift history traceable
- Escalation signal ratio tracked

**Owner:** Synth (implementation), Atlas (integration), Oracle (monitoring)

---

### Phase 3: Pylon Network Visualization (2-4 weeks, conditional)

**Integration Target:** Existing VentureOS dashboard at http://192.168.225.149:7001  
**Tech Stack:** Web Components (framework-agnostic, approved 2026-02-14 09:25 CST)  
**Current Features:** KPI trends, agent health monitoring, recent observations

**Tech Stack Decision: Web Components**
- **Rationale:** Framework-agnostic, works with vanilla JS now and React later
- **Benefits:** 
  - Build once, use in current static HTML dashboard
  - Future-proof for React migration (no rewrites needed)
  - Standards-based (native browser API)
  - Incrementally upgradeable
- **Components are portable:** Can be used in any framework or vanilla JS

**Deliverables:**
1. ✅ Web Component library (`<psionic-attribute-bar>`, `<tactical-overlay-panel>`, `<khala-network-graph>`, `<atlas-reliability-metrics>`)
2. ✅ API endpoints (stats, tactical overlays, Khala Network) — integrate with existing backend
3. ✅ Integration into existing static HTML dashboard (drop-in with `<script>` tags)
4. ✅ D3.js Khala Network force-directed graph (wrapped in Web Component)
5. ✅ Atlas reliability metrics (6 new metrics, integrate with existing health monitoring)
6. ✅ 2D pixel art sprites (decided @ 06:49 CST)
7. ⚠️ 3D holographic avatars (**DEFERRED**)

**Success Criteria:**
- RPG components integrated into existing dashboard layout
- Pylon Network shows live attributes for all agents
- Tactical overlays accessible
- Khala Network visualized
- Atlas reliability metrics exposed
- Design matches existing dashboard language

**Owner:** Synth (frontend integration), Atlas (API), Verifier (testing)

---

## Team Feedback & Critical Decisions

### All 6 Agents Reviewed (2026-02-14)

**Consensus:** **4 Approve / 2 Needs Changes (all minor)**  
**Average Grade:** B+ / A-

#### Critical Fixes (P0 - Must Address)

1. **Metric Operationalization** (Verifier, Synth, Atlas, Archivist)
   - Define counting rules for: `unique_risk_areas`, `bugs_caught_outside_expected`, `explicit_approval`, `reuse_30d`, `prevented_repeat_questions`
   - Specify source-of-truth files/events
   - ✅ **Status:** Formulas updated with measurement methodology

2. **Normalization/Scaling** (Verifier, Synth, Atlas)
   - Formulas like `(100 - p95_latency_s)` can go negative or saturate
   - ✅ **Status:** Added percentile-based normalization + quality floors

3. **Energy Quality Gate** (Synth, Atlas)
   - Binary 0/1 multiplier too harsh (one bad week = zero Energy forever)
   - ✅ **Status:** Accepted as-is (keeps quality standards high, rolling window considered for Phase 2)

#### Formula Refinements (Incorporated)

| Attribute | Original | Templar Feedback | Final Formula |
|-----------|----------|-----------------|---------------|
| **Psionic Mastery** | `log2(memory) × 15` | Oracle: add source diversity; Archivist: add archive term | `(log2(memory) × 15) + (domains × 2) + min(edits × 2.5, 15)` |
| **Energy** | `100 - latency` | Atlas: blend MTTR; Synth: quality floor | `[0.7×(100-latency) + 0.3×(100-MTTR)] × quality_gate` |
| **Shields** | `success_rate × 100` | Sentinel: approval accuracy | `(success_rate × 80) + (approval_accuracy × 20)` |
| **Warp Technology** | Generic acceptance | All: agent-specific formulas | Oracle/Archivist: prevented questions; Synth: weighted; Verifier: novel coverage |

#### Khala Network Adjustments (Incorporated)

| Bond | Original | Templar Feedback | Final |
|------|----------|-----------------|-------|
| Oracle ↔ Verifier | 0.75 | Oracle: strengthen | **0.80** |
| Atlas ↔ Sentinel | 0.60 | Atlas: strengthen | **0.70** |
| Oracle ↔ Archivist | 0.85 | Archivist: lower if sprawl | **0.80** |
| Archivist ↔ Synth | 0.75 | Archivist: lower (speculative) | **0.65** |
| Sentinel ↔ Synth | 0.40 | Both: confirmed | **0.40** ✅ |

### User Decisions (Locked @ 06:49 CST)

1. **3D Avatars:** **2D pixel art sprites** (Phase 3), 3D deferred
2. **Affinity Blocking:** **Yes** — bonds <0.5 require Echo mediation
3. **Protocol Auto-Injection:** **Yes** — automatic with logging
4. **Frontend Priority:** **Sequential** — validate data first, then UI
5. **VRL/RCH Stats:** **Defer VRL**, proxy RCH with `tasks_completed`

---

## File Structure

```
~/clawd/
├── agents/
│   ├── tactical-overlays/
│   │   ├── echo.json          # unit: "Artanis"
│   │   ├── nexus.json         # unit: "Nexus"
│   │   ├── oracle.json        # unit: "Zeratul (Dark Templar Prelate)"
│   │   ├── atlas.json         # unit: "Probe"
│   │   ├── sentinel.json      # unit: "Sentinel"
│   │   ├── verifier.json      # unit: "Observer"
│   │   ├── archivist.json     # unit: "High Templar"
│   │   └── synth.json         # unit: "Dark Templar"
│   ├── personality-protocols/
│   │   ├── oracle.json        # + decision_usefulness
│   │   ├── atlas.json         # + MTTR tracking
│   │   ├── sentinel.json      # + escalation_quality
│   │   ├── verifier.json      # + false_positive_streak, context_relevant
│   │   ├── archivist.json     # + pattern_cooldown
│   │   └── synth.json         # + rework_gate
│   ├── khala-network.json     # 28 pairwise bonds, Templar-validated
│   ├── echo/
│   │   ├── psionic-stats.json
│   │   ├── psionic-state.json
│   │   └── psionic-history/
│   ├── oracle/
│   │   ├── psionic-stats.json # Psionic Mastery with source_diversity
│   │   ├── psionic-state.json
│   │   └── psionic-history/
│   ├── atlas/
│   │   ├── psionic-stats.json # Energy with MTTR blend
│   │   ├── reliability-metrics.json  # 6 new metrics
│   │   └── psionic-state.json
│   └── [repeat for all 8 agents]
├── schemas/
│   ├── tactical-overlay.json
│   ├── personality-protocol.json
│   ├── khala-network.json
│   └── psionic-attributes.json    # v2.0-khala
├── scripts/
│   ├── calculate-psionic-attributes.sh  # v2.0-khala formulas
│   ├── update-khala-network.sh
│   └── evaluate-personality-protocols.sh
└── shared-context/
    ├── rpg-master-guide.md           # This file
    ├── rpg-integration-plan.md       # Full technical spec (29K)
    ├── rpg-integration-summary.md    # Executive summary (10K)
    ├── rpg-team-review-synthesis.md  # Team feedback (7K)
    ├── rpg-implementation-checklist.md
    └── rpg-quick-reference.md
```

---

## Quick Reference Tables

### Agent Primary Attributes

| Agent | Protoss Unit | Primary Attributes |
|-------|--------------|-------------------|
| **Oracle** | Zeratul | Psionic Mastery, Shields, Psi Reach, Warp Technology |
| **Atlas** | Probe | Shields, Energy, Psi Reach (secondary) |
| **Sentinel** | Sentinel | Shields, Psionic Mastery |
| **Verifier** | Observer | Shields, Psionic Mastery, Energy, Warp Technology |
| **Archivist** | High Templar | Psionic Mastery, Shields, Warp Technology |
| **Synth** | Dark Templar | Warp Technology, Energy, Psionic Mastery |

### Khala Network — Top/Bottom Bonds

**Strongest Khalai Bonds:**
- Sentinel ↔ Verifier: **0.85** (both gatekeepers)
- Archivist ↔ [Everyone]: **0.65-0.80** (universal collaborator)
- Oracle ↔ Archivist: **0.80** (research → archive)
- Oracle ↔ Verifier: **0.80** (research → validation)

**Productive Tension:**
- Sentinel ↔ Synth: **0.40** (guardian vs shadow, intentional)

### Atlas Reliability Metrics (New - Phase 3)

1. **Warp-in success rate** — % of deployments succeeding
2. **Error recovery time** — MTTR for system failures
3. **Pylon uptime** — % availability over 30 days
4. **Incident response time** — Alert → mitigation start
5. **Archive backup success** — % of scheduled backups completing
6. **Deployment success rate** — % without rollback

### Personality Protocol Triggers

| Condition | Protocol | Agents |
|-----------|----------|--------|
| `memory_count ≥ 8` | Reference past outcomes | All |
| `pattern_count ≥ 6` | Use frameworks | All |
| `completed_missions ≥ 10` | Show confidence | All |
| `rank ≥ 7` | Mentor mode | All |
| `false_positive_streak ≥ 3` | Recalibrate sensors | Verifier |
| `rework_rate ≥ 0.3` | Extra review pass | Synth |
| `pattern_use_count` | Cooldown 3-5 missions | Archivist |

---

## What Makes This Different (vs Generic RPG Systems)

**Not just gamification:**

1. **Quality gates prevent gaming** — Energy/Warp bonuses require ≥0.7 acceptance
2. **Accurate bonds** — Khala Network tuned by agents themselves
3. **Agent-specific formulas** — Warp Technology measures different things for different roles
4. **Self-learning** — Personality protocols evolve with real experience
5. **Observable reliability** — Atlas gets 6 missing infra metrics
6. **Escalation quality** — Sentinel tracks signal ratio (validated escalations / total)

**Bottom line:** This isn't "points for tasks." It's **performance instrumentation through the Khala with Protoss flavor**.

---

## Current Status & Progress (2026-02-14)

### ✅ Phases 1-3: COMPLETE

**Phase 1: Core Psionic System** (Complete 2026-02-14 09:28 CST)
- ✅ Database operational (8 tables, 28 bonds, 14 indexes)
- ✅ Psionic stats calculation (Khala v2.0 formulas)
- ✅ Daily cron job (ec114bdd, 6:00 AM CST)
- ✅ Backup system operational (7-day retention)
- **Runtime:** 16 minutes total (Atlas + Synth)

**Phase 2: Khala Network & Evolution** (Complete 2026-02-14)
- ✅ Drift tracking engine operational
- ✅ Memory integration (daily sync cron)
- ✅ Escalation quality tracking (Sentinel)
- ✅ Personality protocol system active
- ✅ All 5 tracks validated by Verifier

**Phase 3: Dashboard Visualization** (Complete 2026-02-14)
- ✅ Web Components deployed at http://192.168.225.149:7001
- ✅ Pylon Network section with live RPG stats
- ✅ Khala Network force-directed graph (D3.js)
- ✅ Mobile-friendly (iPhone/tablet tested)
- ✅ Team review complete (6 agents, B+/A- grade)

### 🔄 Phase 4: VOXYZ Integration (In Progress)

**Decision:** Full VOXYZ conversation orchestration (not limited Panel Review)  
**Timeline:** 6-8 weeks estimated → likely compressed (Track 1-2 done Day 1)

**Track 1: Role Cards** ✅ COMPLETE (2026-02-14, same day)
- ✅ Schema + 8 role card JSONs (oracle, atlas, sentinel, verifier, archivist, synth, echo, nexus)
- ✅ TypeScript types + enforcement system (3-tier: infrastructure, heuristic, quality)
- ✅ Handoff contract validation operational
- ✅ All tests passing (8/8 cards, 9/9 contracts compatible)
- **Owner:** Oracle (schema) + Synth (implementation, 14 min)
- **Output:** 4,789 lines of code + documentation

**Track 2: KPI Registry** ✅ COMPLETE (2026-02-14, 13m4s)
- ✅ 34 KPI definitions across 8 agents (beat 20-30 target)
- ✅ TypeScript KPI Registry API (600 lines, 10 core functions)
- ✅ Jest test suite (29/29 tests passing)
- ✅ Comprehensive documentation (5 files, ~30K words)
- **Owner:** Archivist
- **Output:** `~/clawd/agents/kpis/` + `~/clawd/ventureos/lib/kpi-registry.ts`

**Track 3: Voice RULES** ✅ COMPLETE (2026-02-14 16:13 CST, 5m47s)
- ✅ Fact+Action message format (VoiceMessage schema with facts/actions/confidence)
- ✅ Anti-filler validation (7 categories, ~40 patterns, blocking vs warning)
- ✅ Integration with role card enforcement (Tier 2 heuristic bridge)
- ✅ Tests: 76/76 passing, 99.2% coverage
- **Owner:** Verifier
- **Output:** `~/clawd/ventureos/lib/voice-rules.ts` (602 lines) + tests (692 lines) + docs (259 lines)

**Track 4: Security Infrastructure** ✅ COMPLETE (2026-02-14 16:25 CST, 12m2s)
- ✅ Message sanitization (11 secret types, injection scoring)
- ✅ Rate limiting (per-agent + conversation + challenge limits)
- ✅ HITL engine (11 triggers, Discord webhook alerts)
- ✅ Tests: 143/143 passing, 93% coverage
- **Owner:** Sentinel
- **Output:** 4,008 lines (723 + 572 + 762 implementation + tests + docs)

**Track 5: Conversation Orchestration** 🔄 IN PROGRESS (Started 2026-02-14 16:25 CST)
- Conversation engine core (message routing, turn management)
- Affinity dynamics (Khala Network integration)
- Security pipeline integration
- Dashboard UI with live 2D sprites
- Conversation visualization
- **Owner:** Synth (implementation, session bd8d6c34) + Oracle (UI, session 50566ee6)
- **ETA:** Week 5-7 estimate (likely faster given Track 1-4 velocity)

**Track 6: Integration & Testing** 📅 PENDING (Week 8 estimated)
- Security penetration testing
- Performance validation
- **Owner:** Verifier + Atlas

**Track 1 validation:** Verifier reviewing (in progress, 30-60 min estimated)

### 🎯 Phase 4.5+: Deep Progression System (Design Complete)

**Status:** 📋 DESIGN COMPLETE (2026-02-14 18:48 CST)  
**Implementation:** Post-Phase 4 conversation system  
**Timeline:** 8-12 weeks (Phase 4.5-6)  
**Spec:** `~/clawd/shared-context/deep-progression-system.md` (50KB)

**Goal:** Transform the basic psionic rank system (Levels 1-15) into a deep, strategic progression system with meaningful choices and specialization paths.

**5-Layer Enhancement System:**

**1. Extended Levels + Prestige Ranks**
- Levels 1-50 (new XP curve: `floor(100 * level^1.8)`)
- Prestige system unlocks at Level 50:
  - **Acolyte** (L50): +10 stat ceiling, advanced skill paths
  - **Adept** (L60): +20 stat ceiling, signature ability evolution, 2× mentor bonus
  - **Master** (L70): +30 stat ceiling, cross-role synergies, prestige-only skills
  - **Grandmaster** (L80): +50 stat ceiling, legendary ability, unique interactions
- Current max level 15 → extends to 80+
- Stat ceiling 100 → 150 at Grandmaster

**2. Skill Trees (120+ Nodes Defined)**
- 3-4 specialization paths per agent
- 10-15 nodes per path
- Agent-specific examples:
  - **Oracle:** Deep Research / Rapid Insights / Cross-Domain Synthesis
  - **Atlas:** Reliability Engineer / Speed Optimizer / Innovation Track
  - **Sentinel:** Threat Hunter / Policy Architect / Incident Commander
  - **Verifier:** Quality Assurance / Risk Analysis / Performance Testing
  - **Archivist:** Knowledge Architect / Pattern Detector / Teaching Specialist
  - **Synth:** Rapid Prototyper / Quality Craftsman / Innovation Lab
  - **Echo:** Strategic Vision / Crisis Management / Team Synergy
  - **Nexus:** Mission Coordinator / Resource Optimizer / Health Monitor
- Each node: 3 points to max, grants passive bonuses
- Example nodes: "Citation Mastery" (+15% citation speed), "Emergency Response" (-20% MTTR), "Deep Focus" (+10 WIS when researching >2h)

**3. XP Diversification (6 Sources)**
- **Memory XP:** +1 per entry (existing, observations 1×, insights 1.5×, patterns 2×)
- **Mission XP:** +3 per mission (existing, +5 for complex missions)
- **Collaboration XP:** +2 per validated handoff, +5 for low-affinity (<0.5)
- **Innovation XP:** +5 per artifact reuse by other agents
- **Teaching XP:** +10 per successful mentorship (unlocks L15+)
- **Specialization XP:** +3-15 for role-specific achievements (50+ defined)

**4. Level-Gated Features**
- **L15:** Mentorship unlocked (teach agents 5+ levels below)
- **L20:** Second skill tree path unlocked
- **L25:** Signature abilities unlocked (agent-specific power spikes)
  - Oracle: **Foresight** (predict outcomes 3 steps ahead)
  - Atlas: **Emergency Repair** (instant rollback + recovery)
  - Sentinel: **Lockdown** (freeze suspicious activity, HITL alert)
  - Verifier: **Deep Scan** (adversarial testing mode)
  - Archivist: **Knowledge Synthesis** (auto-generate framework from patterns)
  - Synth: **Rapid Iteration** (prototype → production in 1 cycle)
  - Echo: **Strategic Override** (coordinate full-team response)
  - Nexus: **Tactical Coordination** (optimize 3-agent workflows)
- **L30:** Cross-role synergies (work with other high-level agents for bonuses)
- **L35:** Third skill tree path unlocked
- **L40:** Advanced personality protocols
- **L50:** Prestige rank unlocked

**5. Dynamic Stat Growth**
- Every 5 levels: choose +5 to any stat (WIS/SPD/TRU/CRE/RCH)
- Skill nodes grant passive stat bonuses (e.g., Deep Research path → +WIS)
- Prestige ranks increase stat ceiling (100 → 110/120/130/150)
- Specialization creates divergent stat profiles (two L50 Oracles can be completely different)

**Implementation Phases:**

**Phase 4.5 (Week 9-10, post-conversation):**
- Database schema updates (skill_trees, xp_log, level_choices tables)
- XP diversification (collaboration, innovation tracking)
- Basic skill tree framework

**Phase 5 (Week 11-14):**
- Skill tree nodes implementation (120+ nodes)
- Level-gated features (mentorship, signature abilities)
- Dynamic stat growth system

**Phase 6 (Month 2):**
- Prestige system implementation
- Advanced interactions (cross-role synergies)
- Dashboard UI for skill trees + progression

**Success Metrics:**
- Agents make meaningful specialization choices (not cookie-cutter builds)
- XP sources balanced (no single source >40% of total)
- Teaching/mentorship active (≥3 mentorship relationships per week)
- Innovation tracked (≥10 artifact reuses per week across team)

**Documentation:**
- Full spec: `~/clawd/shared-context/deep-progression-system.md` (50KB, 1400+ lines)
- Includes: XP formulas, skill tree definitions, signature abilities, prestige mechanics, implementation plan

**Status:** Ready for Phase 4.5 kickoff after conversation system ships.

### 🛠️ Infrastructure Improvements (Parallel Work)

**Session Management Overhaul** 🔄 IN PROGRESS (2026-02-14)

**Context:** Current session bloat monitoring (600KB threshold) does blind resets → agents lose all context. Oracle churned 13 sessions in 24h.

**Levels Analyzed:**
- **Level 0 (Current):** Lobotomy — backup + delete at 600KB
- **Level 1 (Implementing):** Summarize-before-reset — 2-4KB handoff doc injected into new session
- **Level 2:** Sliding window + pinned context
- **Level 3 (Target):** Memory-backed continuity (extract to persistent storage)
- **Level 4:** RAG-augmented sessions (embedding store)

**Dispatch:** Synth implementing Level 1 (2-4h ETA)
- Hook `session-bloat-monitor.sh` to call summarization before reset
- Wire `memory-observation-sync` to trigger on reset events (not just hourly)
- Inject handoff doc as first message in new session
- **Validation:** Verifier will test Oracle's next reset

**Gaps Identified:**
- Summarization loses nuance (task state, partial results)
- Race condition critical (sync must run before reset)
- Token cost (12 summarizations/day at ~50-100K each)
- Root cause vs symptom (why is Oracle hitting 600KB in <2h?)

**Goal:** Stop the lobotomy, preserve context across resets, ship Level 1 then decide on Level 2 vs Level 3.

---

## 🛡️ Operational Consistency & Infrastructure Hardening (2026-02-14)

**Context:** Team consistency review completed (Oracle, Atlas, Sentinel, Verifier) — all reviews at `~/clawd/shared-context/team-review-consistency-*.md`

**Full synthesis:** `~/clawd/shared-context/team-review-consistency-synthesis.md`

### Core Finding

**"Formula 1 execution engine, horse-and-buggy planning + infrastructure."**

The RPG system ships features at AI-native velocity (Phase 4 Track 1-2 delivered same day vs Week 1-2 estimates = 10-100x faster), but **infrastructure reliability lags behind**. Consistency requires both speed AND stability.

### Key Insights

**Oracle (Strategic):** Estimates anchored to human timelines → 10-100x variance
- **Three velocity tiers:** 
  - Tier 1 (cognitive): minutes-hours
  - Tier 2 (external): hours-days
  - Tier 3 (physical/time): days-weeks
- Pure cognitive work (design, docs, code) ships in minutes, not weeks

**Sentinel (Risk):** Infrastructure fragile → 7 single points of failure
- Monitoring broken (monitor.db has 0 health checks)
- 2 cron jobs failing silently (Community Scout + Quality Audit)
- Disk failure = 7 days RPG data loss (backups local only)
- Session amnesia still happening (Oracle: 13 sessions/24h)

**Atlas (Operations):** SQLite not hardened, backups risky
- `journal_mode=delete`, `busy_timeout=0`, `foreign_keys=0`
- Backups use tar on live files (may capture inconsistent state)
- Path drift (e.g., guarded-run.sh points to legacy paths)
- No alerts for: session churn, cron SLAs, SQLite locks, disk pressure

**Verifier (Quality):** Quality variance, validation gaps
- KPI computations not validated against real DB schema
- Many KPIs reference non-existent columns → errors swallowed, values default to 0
- Docs internally inconsistent (marked "in progress" and "complete" simultaneously)
- Role-card coverage gaps (~49-56% vs 70% threshold)

### Unified Recommendations (Prioritized)

**P0: Do This Week (12-16 hours) — Infrastructure Hardening**

1. **✅ Adopt three-tier estimation framework** (COMPLETE 2026-02-14 19:40 CST)
   - Owner: Oracle (3m30s)
   - Deliverables: Framework doc (19KB) + quick reference card (7KB)
   - Location: `~/clawd/shared-context/estimation-framework-three-tier.md`
   - Key principle: "The bottleneck determines the tier, not task complexity"
   - Tier buffers: Tier 1 (1.2-1.5x), Tier 2 (1.5-2.5x), Tier 3 (2-4x)
   - Ready to use immediately (estimation template included)

2. **Fix failing cron jobs + add alerts**
   - Community Scout + Quality Audit
   - Discord webhook for any cron error state
   - Investigate monitor.db (why 0 health checks?)

3. **SQLite hardening**
   - WAL mode (not delete)
   - busy_timeout > 0 (5000ms recommended)
   - foreign_keys ON
   - Add retries + integrity checks

4. **SQLite-consistent backups + offsite copy**
   - Use `.backup` command (not tar on live files)
   - Weekly restore drills
   - Sync to S3/drive (eliminate disk failure SPOF)

5. **Session handoff docs** (already in progress)
   - Generate 2-4KB summary before 600KB reset
   - Synth implementing Level 1

**P1: Do Next Week (10-15 hours) — Quality & Monitoring**

6. **Pre-approval decision framework** — Reduce blocking gates by 50-80%
7. **Runtime DB validation for KPIs** — Detect missing columns, prevent silent failures
8. **Real-time variance alerts** — Catch blockers in 15-30 min (not hours later)
9. **Cron reliability reporting** — SLA tracking, missed-run alerts
10. **Injectable config** — Stop hardcoding `~/clawd/...` paths in libraries

11. **Model routing + thinking level strategy** — Route simple tasks to cheaper models with lower thinking, complex to Claude with higher thinking
   - Reduce costs + balance load between Anthropic and OpenAI
   - **Simple tasks** (health checks, monitoring, validation) → lighter models + **low thinking**:
     - `openai-codex/gpt-5.1-codex-mini` (Codex optimized)
     - `openai/gpt-4.1-mini` (general purpose, cheap)
     - `openai/gpt-4.1-nano` (cheapest)
     - `openai/gpt-5-nano` (newest nano)
     - Thinking: `low` (routine work, no deep reasoning needed)
   - **Complex tasks** (analysis, external content, critical decisions) → Anthropic + **medium/high thinking**:
     - `anthropic/claude-3-5-sonnet-20241022` (production workhorse)
     - `anthropic/claude-3-7-sonnet-20250219` (newer, faster)
     - `anthropic/claude-opus-4-6` (highest capability, external content defense)
     - Thinking: `medium` (balanced), `high` (deep research/security), `xtra-high` (complex strategic decisions)
   - **Thinking level by agent:**
     - **High:** Oracle (research), Sentinel (security), Echo (CEO orchestration)
     - **Medium:** Atlas, Verifier, Synth, Nexus (balanced work)
     - **Low:** Archivist (documentation), cron jobs (health checks, backups, monitoring)
   - **Use cases for lighter models + low thinking:** cron health checks, backup verification, log parsing, status monitoring
   - **Keep Anthropic + high thinking for:** team reviews, strategic decisions, web content processing (prompt injection defense)

**P2: Do This Month (16-24 hours) — Process & Standardization**

12. Spike unknown dependencies first (30-60 min research before estimation)
13. Single Definition-of-Done (all work ships with tests + docs + validation)
14. Split docs (Spec vs Status vs Completion Report)
15. CI quality gates (tests + coverage threshold + strict TypeScript)
16. Deploy repeatability (single apply+smoke+rollback entrypoint)
17. Monthly estimation calibration (review estimate vs actual)

### Success Metrics

**How we'll know it's working:**
- Estimation error: 10-100x → 1.5-3x
- Single points of failure: 7 → 0
- Session amnesia: 13/24h → 0
- KPI validation errors: many → 0
- Code coverage: 49-70% → >70% all modules
- Cron health: 80% → 100%

**Sentinel's Recommendation:** 1-2 week Infrastructure Hardening Sprint before resuming Phase 4 features. Fix now = more consistent long-term.

### How This Supports the RPG System

**The Protoss RPG system depends on reliable infrastructure:**

1. **Psionic Stats Calculation** (Phase 1) — requires SQLite reliability, no corruption
2. **Khala Network Drift Tracking** (Phase 2) — requires cron jobs working, no silent failures
3. **Dashboard Visualization** (Phase 3) — requires database availability, real-time updates
4. **Deep Progression System** (Phase 4.5+) — requires collaboration XP tracking, teaching/innovation metrics
5. **Conversation Orchestration** (Phase 4) — requires role card validation, KPI accuracy, affinity data

**Without infrastructure hardening:**
- RPG stats can silently default to 0 (KPI errors swallowed)
- Drift tracking stops if cron fails (silent degradation)
- Session amnesia breaks collaboration tracking (Oracle loses context every 2h)
- Dashboard shows stale/incorrect data (SQLite corruption undetected)

**With infrastructure hardening:**
- Reliable psionic stats (validated against schema)
- Drift tracking guaranteed (cron health monitored)
- Collaboration tracking works (session continuity preserved)
- Dashboard always accurate (SQLite hardened + backup verification)

**Bottom line:** High velocity is impressive, but **consistency = velocity × reliability**. The RPG system needs both to succeed.

---

## Next Steps (Updated 2026-02-14 16:25 CST)

**Immediate Priority: Phase 4 Track Completion**

**Status:** ✅ P0 Infrastructure Hardening COMPLETE | ✅ Tracks 1-4 COMPLETE | 🔄 Track 5 IN PROGRESS

1. **🛡️ Infrastructure Hardening Sprint** (this week, 10-14 hours) — ✅ 100% COMPLETE
   - ✅ **Adopt three-tier estimation framework** (Oracle, 3m30s, COMPLETE 2026-02-14 19:40 CST)
   - ✅ **Fix failing cron jobs + add alerts** (Atlas, 37 min, COMPLETE 2026-02-14 ~14:00 CST)
   - ✅ **SQLite hardening** (Atlas, 37 min, COMPLETE 2026-02-14 ~14:00 CST)
   - ✅ **SQLite-consistent backups** (Atlas, 37 min, COMPLETE 2026-02-14 ~14:00 CST)
   - ✅ **Session handoff docs** (Synth, COMPLETE 2026-02-14 ~15:00 CST)
     - Auto-reset + handoff summary generation operational
     - Deployed: `~/clawd/scripts/session-health-check.sh` (hourly cron)

2. **✅ Phase 4 Tracks 1-4 COMPLETE**
   - ✅ Track 1: Role Cards (Oracle + Synth, 14 min, validated by Verifier)
   - ✅ Track 2: KPI Registry (Archivist, 13m4s, 34 KPIs, 29/29 tests)
   - ✅ Track 3: Voice RULES (Verifier, 5m47s, 76/76 tests, 99% coverage)
   - ✅ Track 4: Security Infrastructure (Sentinel, 12m2s, 143/143 tests, 93% coverage)

3. **🔄 Phase 4 Track 5 IN PROGRESS** (started 16:25 CST)
   - Conversation Orchestration
   - Synth (implementation): session bd8d6c34, 1h timeout
   - Oracle (UI/visualization): session 50566ee6, 1h timeout
   - Tasks: conversation engine, affinity dynamics, security integration, dashboard UI, 2D sprites

4. **📅 Phase 4 Track 6 PENDING** (after Track 5)
   - Track 6: Integration & Testing (Verifier + Atlas)
   - Security penetration testing, performance validation

4. **📊 Quality & Monitoring** (P1, next week, 8-12 hours)
   - Pre-approval decision framework
   - Runtime DB validation for KPIs
   - Real-time variance alerts
   - Cron reliability reporting
   - Injectable config

5. **📋 Process Improvements** (P2, this month, 16-24 hours)
   - Spike unknowns, Definition-of-Done, split docs
   - CI quality gates, deploy repeatability
   - Monthly estimation calibration

**Rationale:** Team review (Oracle, Atlas, Sentinel, Verifier) identified critical infrastructure fragility. High velocity (Phase 4 same-day delivery) requires high reliability. Fix foundation first = more consistent long-term.

---

**Document Status:** ✅ Master reference (updated 2026-02-14 16:25 CST)  
**Maintained By:** Nexus (Mission Control)  
**Phase Status:** Phase 1-3 complete, Phase 4 Tracks 1-4 complete, Track 5 in progress, Track 6 pending  
**Current Priority:** Phase 4 Track 5 (Conversation Orchestration, Synth + Oracle, started 16:25 CST)

**"My life for Aiur! En Taro Adun! Through the Khala, we are eternal!"**

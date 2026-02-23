# VentureOS RPG System — Master Guide (Protoss Edition)
## *"En Taro Adun — Through the Khala, We Are One"*

**Last Updated:** 2026-02-15 03:57 CST  
**Status:** ✅ P0 Sprint complete | ✅ Phase 5.1 complete | ✅ Phase 5.2 complete | ✅ Team reviews complete | 🔄 P0 remediation in progress  
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

**Track 5: Conversation Orchestration** ✅ COMPLETE (2026-02-14 16:39 CST, 12-13min)
- ✅ Conversation engine (message routing via role cards, turn management, context persistence)
- ✅ Affinity dynamics (Khala Network integration, low-affinity mediation via Echo)
- ✅ Security pipeline integration (sanitization, rate limiting, HITL)
- ✅ Dashboard UI with live 2D sprites (16×16 Protoss pixel art, 3 animation states)
- ✅ Conversation visualization (fact/action badges, injection scoring)
- ✅ Tests: 80% coverage
- **Owner:** Synth (12m42s) + Oracle (12m3s)
- **Output:** conversation-engine.ts, affinity-manager.ts, conversation-security.ts, conversation-api.ts + UI components + docs

**Track 6: Integration & Testing** 🔄 IN PROGRESS (Started 2026-02-14 16:40 CST)
- Security penetration testing
- Performance validation
- Integration smoke tests, deployment readiness
- **Owner:** Verifier (session 1b03948e) + Atlas (session c7153712)
- **ETA:** Week 8 estimate (likely faster given Track 1-5 velocity, all <15min)

**Track 1 validation:** Verifier reviewing (in progress, 30-60 min estimated)


### 🔄 Phase 5: StarCraft Tactical Command Center (In Progress)

**Synthesized:** 2026-02-14  
**Source:** 5 team reviews (Atlas, Sentinel, Verifier, Archivist, Synth) + original spec  
**Status:** ✅ Phase 5.1 Complete — 🚀 Phase 5.2 In Progress  
**Original Spec:** `~/clawd/shared-context/phase5-tactical-map-spec.md` (66KB)  
**Team Reviews:** `~/clawd/shared-context/phase5-review-*.md` (5 files)

**Phase 5.0 Complete** (2026-02-14, ~15h total):
- ✅ Session bridge running (578 sessions discovered, PID 50643)
- ✅ Mission recording operational (4 missions logged)
- ✅ Security architecture designed (SECURITY_ARCHITECTURE.md, 45KB)
- ✅ MapState API contract defined (API_CONTRACTS.md, 1034 lines)
- ✅ 6 spec ambiguities resolved (phase5-ambiguities-resolved.md)
- ✅ Assets licensing policy created (ASSETS-LICENSING.md)
- **Decisions locked:** Flat 2D, Full Vision scope, Security approved

**Phase 5.1 Foundation Complete** (2026-02-14, ~30 min total):
- ✅ Security middleware (Sentinel, 9m32s): auth, CORS, CSP, rate limiting, audit logging
- ✅ Rendering core (Synth, 19m57s): terrain, buildings, Nexus, HUD, camera, API client
- ✅ Tests: 56 passing, 88.57% coverage
- ✅ Location: ~/clawd/ventureos/tactical-map
- ✅ Dev server: http://127.0.0.1:5174/map/

**Phase 5.2 Activity & Animation** (In Progress, started 2026-02-14 19:15 CST):
- Session: c4ff07b3-98bd-4dc0-83b2-3f96179af47f
- Owner: Synth (Dark Templar)
- Estimate: 16-26 hours
- Status: Running e2e tests with Playwright (final validation)
- Tests: 150 total (145 passing, 5 failing edge cases being fixed)
- Deliverables created:
  - activity-mapper.ts (233 lines)
  - Building state system (IDLE/ACTIVE/OVERLOADED/ERROR)
  - Animations (500ms crossfade)
  - Particle system (500 max)
  - Security sanitization (DOMPurify)
  - Config updates
- Quality gates: 10 checks (all patterns match, all states render, FPS ≥55, coverage ≥80%)

**Critical Fixes Deployed (2026-02-14 19:19-19:35 CST):**

1. **Tactical Map Redirect Loop Fixed** (19:19 CST, commit 9a5bd8d)
   - Issue: Vite middleware creating infinite `/map/` → `/` loop
   - Fix: Removed middleware plugin (Vite's base option handles routing natively)
   - Result: Dev server working at http://localhost:5174/map/

2. **Dashboard CSP Inline Scripts Fixed** (19:31 CST, commit 4b0a0d4)
   - Issue: Phase 5.1 CSP blocked all inline JavaScript (menu clicks broken)
   - Fix: Added `'unsafe-inline'` to script-src in security-headers.js
   - Result: Dashboard menu interactions restored

3. **Dashboard Auth Token Injection Fixed** (19:35 CST, commit ff79ca2)
   - Issue: Phase 5.1 auth middleware requires Bearer tokens, browser had no token
   - Fix: Injected `window.DASHBOARD_API_TOKEN`, created `authFetch()` helper, replaced all 19 fetch calls
   - Result: Auth layer functional (blocked IP will auto-expire ~7:40 PM)

4. **Agent Sprite Infinite Loop Fixed** (19:35 CST, commit 5951fd0)
   - Issue: `attributeChangedCallback()` triggered on every state change (flooding)
   - Fix: Only re-render when non-state attributes change
   - Result: Live Conversations sprite rendering stable

**Full Team Review Dispatched (2026-02-14 19:49 CST):**

Deep-level review of Phase 5.0-5.2 (Tactical Map) + Dashboard issues requested by user.

| Agent | Session | Focus Area | ETA |
|-------|---------|-----------|-----|
| **Oracle** | b91fbfd4 | Architecture review (data flows, technical debt, scalability) | 2-3h |
| **Sentinel** | 52273f0c | Security audit (auth, API, CSP, attack surface, 429 errors) | 2-3h |
| **Verifier** | a1dbdff7 | QA review (172 tests, 89.16% coverage, spec compliance) | 2-3h |
| **Atlas** | 8c14df15 | Performance + data loading (dashboard empty data, 429 root cause, FPS) | 2-3h |

**Screenshots captured:** Dashboard Overview (empty data), Pylon Network (429 errors + CDN d3.js failure), Live Conversations (sprite flood FIXED), Tactical Map (Phase 5.2 rendering)

**Expected completion:** ~10:45-11:45 PM CST  
**Next:** Consolidate findings, create master report with prioritized remediation plan

---


## 1. Phase 5 Overview

**Vision:** Transform the VentureOS monitoring experience into a living StarCraft-style tactical command center. Each of the 8 agents is represented as a Protoss building in a circular layout, with real-time activity animations, Khala Network bond visualizations, interactive panels, sound design, and historical replay.

**Original Estimate:** 48–64 hours (Oracle spec)  
**Revised Estimate:** 90–155 hours (full fidelity) / 55–80 hours (MVP)  
**Dependency:** Phase 4 conversation system (provides interaction data)

---

## 2. Team Review Summary

All 5 teams reviewed the spec. No team rated it RED; 4 of 5 rated YELLOW with specific concerns to address.

| Team | Rating | Key Finding | Effort Impact |
|------|--------|-------------|---------------|
| **Atlas** (Infrastructure) | 🟢 GREEN | Achievable. 40% of data layer exists. Two blockers: session bridge + empty missions table. Extend existing dashboard, don't create separate server. | +15–17h over spec (63–81h total) |
| **Sentinel** (Security) | 🟡 YELLOW | Spec assumes trusted environment throughout. 3 P0 security issues must be fixed before any deployment. No auth, session exposure, XSS vectors. | +20–30h security hardening across all phases |
| **Verifier** (Testing) | 🟡 YELLOW | Zero test tasks in spec. Testing strategy absent. ~495 tests needed. Quality gates required per phase. 6 spec ambiguities block testable code. | +46–62h testing effort |
| **Archivist** (Documentation) | 🟡 YELLOW | No user onboarding. Canvas accessibility gaps (WCAG). Missing error/empty states. Licensing concerns for SC2-style assets. Isometric decision blocks everything. | +10–16h docs/a11y/onboarding |
| **Synth** (Implementation) | 🟡 YELLOW | Spec estimates optimistic. Full fidelity = 90–140h. Replay is largest unknown (20–40h alone). Need Phase 5.0 for data contracts. Procedural sprites for MVP. | Reframes total: 90–140h full / 40–65h MVP |

### Cross-Team Consensus

All 5 teams independently recommended:
1. **Integrate into existing VentureOS dashboard** — don't create a separate server/process
2. **Procedural/geometric sprites for MVP** — decouple art pipeline from critical path
3. **Polling over WebSocket for v1** — simpler, sufficient for 10–15s update intervals
4. **Replay as v2/optional** — largest unknown, depends on data quality
5. **Phase 5.0 prerequisite** — data contracts and API plumbing before rendering

---

## 3. Critical Decisions Required

These **must be resolved before implementation begins**. Each affects architecture, assets, and timelines.

### Decision 1: Isometric 2.5D vs Flat 2D

| | Flat 2D | Isometric 2.5D |
|---|---------|-----------------|
| **Effort** | Baseline | +4h Phase 5.1, cascading to all sprites |
| **StarCraft feel** | Functional | Authentic |
| **Sprite complexity** | Simple top-down | Isometric perspective required |
| **Hit-testing** | Standard rectangles | Coordinate transforms needed |
| **Accessibility** | Simpler spatial reasoning | More complex |
| **Atlas** | No infra concern either way | No infra concern either way |
| **Synth** | Recommended for v1 | "Defer — doing iso right impacts asset style, hit areas, camera, z-sorting" |
| **Archivist** | — | "Resolve BEFORE Phase 5.1 — affects every sprite and layout decision" |

> **Recommendation:** Start with **flat 2D** for MVP. Revisit isometric as a Phase 5+ upgrade once the base map is stable and sprites exist.
>
> **Decision owner:** Oracle + Synth  
> **Deadline:** Before Phase 5.0 starts

### Decision 2: MVP Scope vs Full Vision

| | MVP (Ship Fast) | Full Spec Fidelity |
|---|-----------------|-------------------|
| **Effort** | 55–80h | 90–155h |
| **Timeline** | 2–3 weeks | 5–8 weeks |
| **Sprites** | Procedural (shapes + glow) | Custom pixel art (32 building states, 24 unit anims) |
| **Replay** | Excluded (v2) | Included (20–40h) |
| **Audio** | Deferred or minimal | Full atmosphere + voice lines |
| **Panels/Modals** | Minimal (tooltip + 1 panel) | Full UI framework (6 click targets, 5 hover targets) |
| **WebSocket** | Polling only | Hybrid polling + WS |
| **Testing** | Core unit + smoke E2E | Full 495-test suite |

> **Recommendation:** Ship **MVP first** (Phases 5.0–5.3 + minimal 5.4), then iterate. Gets a "living map" visible in ~2–3 weeks. Full polish and replay follow.
>
> **Decision owner:** Zach (product priority)  
> **Deadline:** Before Phase 5.0 starts

### Decision 3: Security Architecture

Sentinel identified **3 P0 issues** that must be designed (not just patched) before deployment:

| P0 | Issue | Minimum Requirement |
|----|-------|-------------------|
| **P0-1** | No API authentication | Session-based auth or API key on all endpoints |
| **P0-2** | Isolated session exposure | Filter by visibility; aggregate, don't enumerate private sessions |
| **P0-3** | XSS via task descriptions | DOMPurify for all DOM-rendered text; CSP headers |

> **Recommendation:** Add **§11.5 Security Architecture** to the spec before any code. Design auth model in Phase 5.0 alongside data contracts.
>
> **Decision owner:** Sentinel + Atlas  
> **Deadline:** Phase 5.0 deliverable

---

## 4. Revised Implementation Plan

### Phase 5.0: Data Contracts & Prerequisites (NEW)
**Duration:** 8–14 hours  
**Goal:** Establish data foundations. Everything after this builds on stable APIs and schemas.

| Task | Owner | Effort | Notes |
|------|-------|--------|-------|
| Define `MapState` JSON contract (agents, bonds, events, missions) | Oracle + Synth | 2–3h | Single source of truth for all API responses |
| Session bridge script (poll `openclaw sessions` → SQLite) | Atlas | 4h | **Blocker** for activity detection (Phase 5.2+) |
| Mission recording pipeline (write to `missions` table) | Atlas | 4h | **Blocker** for progress bars and replay |
| Add missing API endpoints to dashboard server | Atlas | 3–4h | `/api/agents/status` composite, `/api/sessions/active` with `?agent=` filter |
| Security architecture design (auth model, CORS, CSP) | Sentinel | 2–3h | Document in §11.5; implement auth in Phase 5.1 |
| Resolve 6 spec ambiguities (see Verifier §9.7) | Oracle | 1–2h | Unblock testable implementation |

**Quality Gate:** MapState contract documented. Session bridge running. At least 1 mission recorded to `missions` table. Security architecture approved.

### Phase 5.1: Foundation
**Duration:** 14–22 hours (includes test infra + auth + a11y skeleton)  
**Goal:** Render interactive map with buildings, terrain, basic HUD, and security layer.

| Task | Effort | Notes |
|------|--------|-------|
| Project setup (directory, package.json, route in dashboard) | 2h | Serve as `/map` tab in existing dashboard |
| Test infrastructure (Vitest, Playwright, MSW, fixtures) | 4–6h | Per Verifier: must be first task |
| Terrain renderer (dark stone, hex grid, crystal clusters, pylon glow) | 2–3h | |
| Building sprites (procedural shapes + glow for MVP) | 2–3h | Swap to real sprites later without code changes |
| Nexus (96×96, core pulse) | 1h | |
| Basic HUD (tab nav, KPI ticker from live DB) | 2h | |
| API client + 15s polling loop | 2h | Atlas recommends 15s over 10s |
| Camera (zoom 0.5×–2.0×, pan, Home reset) | 2h | |
| Auth middleware on all API endpoints | 2–3h | P0-1 fix |
| CORS whitelist + CSP headers | 1h | P1-4, P1-5 fix |
| Hidden ARIA tree skeleton | 1–2h | Archivist: accessibility from day one |
| `prefers-reduced-motion` check | 0.5h | |
| config.js as living spec (all constants with JSDoc) | 1h | |
| Unit + integration + E2E tests for foundation | 3–4h | Per Verifier quality gates |

**Quality Gate (10 checks):**
1. All 8 buildings render at correct positions (screenshot baseline)
2. KPI ticker shows live data from DB
3. Camera zoom/pan/reset works
4. 15s polling loop fires correctly
5. Auth required on all API endpoints (401 without token)
6. CSP header present in responses
7. ARIA tree accessible via screen reader
8. FPS ≥ 60 on idle map
9. Initial load < 2s
10. Unit test coverage ≥ 75%

### Phase 5.2: Activity & Animation
**Duration:** 16–26 hours  
**Goal:** Buildings and units animate based on real agent activity.

| Task | Effort | Notes |
|------|--------|-------|
| `activity-mapper.js` (session label → activity type, all 8 agents) | 3–4h | Highest-coverage-value unit test target |
| Server-side activity classification (Sentinel P2-3) | 1h | Move regex to API, send classified activity to client |
| Building state system (IDLE/ACTIVE/OVERLOADED/ERROR) | 3–4h | 32 agent×state combinations |
| Building animations (per-state, crossfade transitions) | 3–4h | Procedural for MVP |
| Unit sprites + positioning (32×32 or simple dots) | 2–3h | Synth: "orbiting dot" sufficient for MVP |
| Particle system (ambient, activity-specific) | 3–4h | Cap at 500 simultaneous |
| Health bars (capacity calculation, color gradient) | 1–2h | |
| Progress bars (over units, time ratio coloring) | 1–2h | Depends on missions table having data |
| Input sanitization on all DB-sourced text (DOMPurify) | 1–2h | P0-3 fix |
| Session label length cap (200 chars before regex) | 0.5h | P2-3 fix |
| Tests: activity mapper (80+ tests), 32 state combos, visual regression | 4–6h | |

**Quality Gate:**
1. All 25 activity patterns match correctly
2. All 32 agent×state combinations render
3. State transitions animate smoothly (0.5s crossfade)
4. Health bar colors correct for all thresholds
5. All DB-sourced text sanitized (no raw innerHTML)
6. FPS ≥ 55 with all agents active
7. Unit test coverage ≥ 80%

### Phase 5.3: Khala Network
**Duration:** 8–14 hours  
**Goal:** Render bond lines between buildings with affinity-based visuals.

| Task | Effort | Notes |
|------|--------|-------|
| Bond line rendering (28 bezier curves, affinity-based width) | 2–3h | Bond data already served by existing API |
| 5-tier color system (red → orange → blue → bright blue → gold) | 1–2h | Add non-color indicators per Archivist (dash/dot patterns) |
| Bond animations (pulse, crackling, glow per tier) | 2–3h | Glow without killing FPS is the challenge |
| Collaboration particles (detect shared sessions, data packets along bezier) | 2–3h | |
| Drift event animations (positive/negative/tier-change) | 1–2h | |
| Bond hover tooltip + click modal (basic) | 1–2h | Synth: hit-testing curved lines is "surprisingly fiddly" |
| Tests: tier boundaries, all 28 bonds render, visual regression | 2–3h | |

**Quality Gate:**
1. All 28 bonds render
2. All 5 color tiers visually distinct (including non-color indicators)
3. Tier boundary classification exact (0.40, 0.60, 0.75, 0.85)
4. Collaboration particles appear during shared sessions
5. Drift animations trigger on events
6. FPS ≥ 55 with all bonds + collaborations

### Phase 5.4: Interactivity
**Duration:** 14–22 hours  
**Goal:** Full click/hover/keyboard interaction with detail panels.

| Task | Effort | Notes |
|------|--------|-------|
| Click handlers (building, unit, bond, nexus, terrain) | 2–3h | PixiJS hit-testing |
| Building detail panel (right slide-in, 400px) | 3–4h | Agent status, tasks, KPIs, bonds |
| Bond detail modal (affinity, drift chart, history) | 2–3h | |
| Nexus overlay (all agents, system health, strongest/weakest bonds) | 2–3h | |
| Alert feed panel (bottom-left, last 10 events, color-coded) | 2–3h | |
| Missions sidebar (right, collapsible, progress bars) | 2h | |
| Keyboard shortcuts (1–8, Tab, Space, E, R, Esc, F) | 1–2h | Only capture when canvas focused (P2-2) |
| Tooltip system (hover, 200ms delay, smart positioning) | 1–2h | |
| Privacy filtering: no message content on map (P1-3) | 1h | Show "Agent is active on N sessions" only |
| Focus trap for modals + visible focus indicators | 1h | Archivist accessibility requirement |
| Tests: all click targets, panel content, keyboard shortcuts | 3–4h | |

**Quality Gate:**
1. Every click target produces correct response
2. Panel content matches DB data
3. All keyboard shortcuts work (only when canvas focused)
4. No message content exposed on map surface
5. Focus trapped in modals; Esc returns focus correctly
6. Tooltip positioning avoids viewport edges

### Phase 5.5: Polish & Sound
**Duration:** 10–16 hours  
**Goal:** Audio atmosphere, visual polish, smooth transitions.

| Task | Effort | Notes |
|------|--------|-------|
| Howler.js integration + audio sprite packing | 2h | Plan around autoplay restrictions |
| 8 unit voice lines (TTS generated) | 2–3h | Original text, not SC2 quotes. Verify no IP issues. |
| Event sounds (task complete, error, collaboration, drift) | 1–2h | Original sound design, not SC2 assets |
| Volume controls (master + per-category, localStorage persistence) | 1h | |
| Ambient audio (background music, building hum, crystal) | 1–2h | Distance-based volume |
| Visual polish (panel transitions, modal blur, particle fade-in/out) | 2–3h | |
| Performance optimization (particle pooling, off-screen culling, texture atlas) | 2–3h | |
| Asset directory read-only permissions | 0.5h | P2-4 |
| Guided tour / onboarding (first-time experience) | 4–6h | Archivist: "single biggest gap in the spec" |
| Color legend widget + `?` help overlay | 2h | |
| Tests: audio logic, performance benchmarks, asset payload | 2–3h | |

**Quality Gate:**
1. All 8 voice lines play on click (30s cooldown works)
2. Volume persists across reload
3. Mute shortcut works
4. Panel transitions smooth (300ms)
5. No particle pop-in (fade-in/out)
6. FPS ≥ 55 with full audio + effects
7. Asset payload < 5MB
8. Memory < 100MB after 5min use
9. Onboarding tour completes without errors
10. ASSETS-LICENSING.md documents all asset sources

### Phase 5.6: Replay Mode (OPTIONAL v2)
**Duration:** 18–36 hours  
**Goal:** Historical playback with timeline scrubber.

| Task | Effort | Notes |
|------|--------|-------|
| Replay API endpoints (`/api/replay/:timestamp`, `/api/replay/events`) | 6–8h | State reconstruction is non-trivial |
| Timeline scrubber UI (full-width, draggable, event markers) | 3–4h | |
| Playback engine (state reconstruction, interpolation, speed control) | 4–6h | Largest unknown — depends on data quality |
| Visual replay (historical buildings, bonds, units, KPIs, watermark) | 3–4h | |
| Timelapse mode (auto-skip idle >30min, highlight events) | 2–3h | |
| Auth on replay endpoints + audit logging (P1-2) | 2–3h | Log who accessed what historical data |
| Data scoping: apply session visibility filters to historical data | 1–2h | |
| Parameterized queries (no SQL injection) + rate limiting | 1–2h | P2-5 |
| Tests: state reconstruction fixtures, interpolation, memory during scrubbing | 4–6h | |

**Quality Gate:**
1. State reconstruction matches 5+ known snapshot fixtures
2. Timeline scrubber responsive to drag
3. All playback speeds work (1×, 2×, 5×, 10×)
4. "REPLAY" watermark visible
5. Exit replay → live data resumes within 10s
6. Auth required on all replay endpoints
7. Audit log records all replay access
8. No memory leak during 5min replay scrubbing

---

## 5. Effort Estimates — Consolidated

### By Phase

| Phase | Spec Estimate | Revised (MVP) | Revised (Full) | Key Drivers |
|-------|--------------|---------------|----------------|-------------|
| **5.0** (NEW) | — | 8–14h | 8–14h | Session bridge, missions pipeline, API plumbing, security design |
| **5.1** Foundation | 8–12h | 14–22h | 14–22h | Test infra (+4–6h), auth (+3h), a11y (+2h) |
| **5.2** Activity | 10–14h | 16–26h | 16–26h | 32 state combos, sanitization, testing |
| **5.3** Khala | 6–8h | 8–14h | 8–14h | Hit-testing curves, non-color indicators |
| **5.4** Interactivity | 8–10h | 14–22h | 14–22h | Panels = small UI framework. Privacy filtering. |
| **5.5** Polish & Sound | 6–8h | 10–16h | 10–16h | Onboarding tour (+4–6h), audio sourcing |
| **5.6** Replay | 10–12h | — (deferred) | 18–36h | State reconstruction, data quality, security |
| **Total** | **48–64h** | **70–114h** | **88–150h** | |

### By Category (Where the Time Goes)

| Category | MVP Hours | Full Hours | Notes |
|----------|-----------|------------|-------|
| Core rendering + logic | 35–50h | 45–65h | Building, bonds, animations, particles |
| API + data plumbing | 10–14h | 16–22h | Phase 5.0 + replay endpoints |
| Security hardening | 8–12h | 14–20h | Auth, sanitization, CORS, CSP, audit |
| Testing | 12–20h | 30–45h | 495 tests at full suite |
| Documentation + onboarding | 5–8h | 8–14h | Tour, help overlay, README, ARCHITECTURE |
| Art/audio assets | 0–4h | 8–20h | Procedural MVP vs custom pixel art |
| **Total** | **70–114h** | **121–186h** | |

> **Note:** The upper bound of the full estimate (186h) accounts for worst-case art pipeline delays and replay data quality issues. Realistic center-point: **~100h MVP, ~140h full**.

---

## 6. Prerequisites — Must Complete Before Phase 5.1

| # | Prerequisite | Owner | Effort | Status | Blocks |
|---|-------------|-------|--------|--------|--------|
| 1 | **Session bridge script** — Poll `openclaw sessions` every 10–15s, parse agent keys, write to SQLite | Atlas | 4h | ❌ Not started | Phase 5.2 (activity detection) |
| 2 | **Mission recording pipeline** — Hook agent framework to write to `missions` table on task start/complete | Atlas | 4h | ❌ Not started | Phase 5.2 (progress bars), 5.4 (missions sidebar), 5.6 (replay) |
| 3 | **Security architecture document** — Auth model, CORS policy, CSP headers, data classification | Sentinel | 2–3h | ❌ Not started | Phase 5.1 (auth implementation) |
| 4 | **MapState JSON contract** — Single canonical shape for all tactical map data | Oracle + Synth | 2–3h | ❌ Not started | Phase 5.1 (API client) |
| 5 | **Resolve 6 spec ambiguities** — Clarify building state transitions, task duration metadata, event priority, hit area z-order, idle skip animation, per-agent max sessions | Oracle | 1–2h | ❌ Not started | All phases (testability) |
| 6 | **Isometric vs flat decision** — Documented ADR with rationale | Oracle + Synth | 0.5h | ❌ Not started | Phase 5.1 (every sprite and coordinate) |
| 7 | **MVP scope decision** — Confirm which phases ship first | Zach | 0.5h | ❌ Not started | Timeline and resource allocation |
| 8 | **ASSETS-LICENSING.md** — Policy: no copyrighted Blizzard assets, document all sources | Archivist | 1h | ❌ Not started | Phase 5.5 (audio/sprites) |

---

## 7. Quality Gates — Testing Checkpoints

Per Verifier's comprehensive testing plan, each phase has mandatory quality gates. **No phase ships without passing its gate.**

### Test Infrastructure (Phase 5.1 — First Task)

```
Framework:    Vitest (unit/integration) + Playwright (E2E)
Mocking:      MSW (API mocks) + custom PixiJS/Howler mocks
Visual:       Playwright screenshot comparison (1% pixel tolerance)
Performance:  Playwright + Performance Observer API
Coverage:     c8 (Vitest built-in)
CI:           Coverage below phase target blocks merge
```

### Coverage Targets

| Layer | Target | Rationale |
|-------|--------|-----------|
| State management (`state/*`) | 95% | Core logic; bugs cascade everywhere |
| Data layer (`data/*`) | 90% | API parsing, activity mapping — high bug risk |
| Utils (`utils/*`) | 95% | Pure functions, easy to test, high reuse |
| Interaction (`interaction/*`) | 80% | Event handlers, some browser-dependent |
| Renderer (`renderer/*`) | 60% | Setup/config testable; draw calls not |
| Audio (`audio/*`) | 70% | Config and logic testable; playback mocked |

### Test Counts (Full Suite)

| Category | Count | Hours to Write |
|----------|-------|---------------|
| Unit tests | ~300–350 | 12–16h |
| Integration tests | ~120–155 | 10–14h |
| E2E tests | ~25–35 | 8–10h |
| Visual regression screenshots | ~25–30 | 4–6h |
| Performance tests | ~10 | 4–6h |
| Manual QA sessions (6 phases) | 6 sessions | ~4h total |
| **Total** | **~495** | **46–62h** |

### Manual QA Required Per Phase

| Phase Gate | Focus | Duration | Participants |
|-----------|-------|----------|-------------|
| Post-5.1 | Layout, camera feel, KPI ticker | 30 min | Verifier + 1 teammate |
| Post-5.2 | Animation feel, state transitions, particles | 45 min | Verifier + Oracle |
| Post-5.3 | Bond curves, color tiers, collaboration | 30 min | Verifier + Archivist |
| Post-5.4 | Click targets, panels, keyboard shortcuts | 45 min | Verifier + Echo |
| Post-5.5 | Audio atmosphere, polish, onboarding | 30 min | Full team demo |
| Post-5.6 | Replay accuracy, timeline scrubber | 45 min | Verifier + Oracle |

---

## 8. Security Requirements

Per Sentinel's review. Organized by implementation phase.

### Phase 5.0 (Design)

| Requirement | Priority | Action |
|-------------|----------|--------|
| Authentication model | P0 | Design session-based auth or API key for all endpoints |
| Data classification layer | P1 | Define Public / Internal / Confidential data tiers |
| CORS policy | P1 | Whitelist tactical map origin only; no wildcard |
| Privacy-preserving activity display | P0 | "Oracle — Active (1 task)" not "Oracle — Researching: Phase 5 Spec" |

### Phase 5.1 (Implementation)

| Requirement | Priority | Effort | Action |
|-------------|----------|--------|--------|
| API authentication on all endpoints | P0 | 2–3h | Session token or API key required; 401 on failure |
| Isolated session filtering | P0 | 2h | Never surface `kind=isolated` session details; aggregate only |
| CSP headers | P1 | 1h | `script-src 'self'; object-src 'none'; frame-ancestors 'none'` |
| CORS whitelist | P1 | 0.5h | Explicit origin, no `*`, credentials mode if cookies |
| localStorage whitelist | P2 | 0.5h | Only 4 UI preference keys; no sensitive data |
| HTTPS only | P1 | 0.5h | `Strict-Transport-Security` header |

### Phase 5.2

| Requirement | Priority | Effort | Action |
|-------------|----------|--------|--------|
| XSS sanitization (DOMPurify) | P0 | 2h | All DB-sourced text sanitized before DOM rendering |
| Server-side activity classification | P2 | 1h | Client receives `activity: "researching"`, not raw label + regex |
| Input length cap | P2 | 0.5h | Session labels capped at 200 chars before processing |

### Phase 5.4

| Requirement | Priority | Effort | Action |
|-------------|----------|--------|--------|
| No message content on map | P1 | 1h | Show session count, not message text |
| Keyboard shortcuts canvas-scoped | P2 | 0.5h | Don't capture global events; preserve Tab for accessibility |
| WebSocket auth (if added) | P1 | 3h | Auth token in upgrade handshake; origin whitelist; connection limit 5/user |

### Phase 5.5

| Requirement | Priority | Effort | Action |
|-------------|----------|--------|--------|
| Asset directory read-only | P2 | 0.5h | `r-xr-xr-x` permissions on asset directory |
| Audio user gesture requirement | P2 | 0h | Already handled by click-to-play design |

### Phase 5.6

| Requirement | Priority | Effort | Action |
|-------------|----------|--------|--------|
| Replay endpoint auth | P1 | 1h | Same auth as other endpoints |
| Replay audit logging | P1 | 2h | Log who, when, what timestamp range |
| Parameterized SQL queries | P2 | 1h | `?` placeholders, never string interpolation |
| Replay rate limiting | P2 | 1h | 10 req/min per user |
| Historical data scoping | P1 | 1h | Apply same visibility filters as live data |

### Feature Flags (Sentinel R7)

Gate sensitive features behind toggles:
- `REPLAY_ENABLED` — Replay mode (high data exposure)
- `MESSAGE_PREVIEW` — Message content in click panels (default: off)
- `WEBSOCKET_EVENTS` — Real-time WebSocket stream
- `DETAILED_KPIS` — Specific KPI values vs tier indicators

---

## 9. Documentation Requirements

Per Archivist's review. Documentation is a deliverable, not an afterthought.

### Before Implementation

| Document | Owner | Purpose |
|----------|-------|---------|
| `ASSETS-LICENSING.md` | Archivist | No copyrighted Blizzard assets; all sources documented |
| `docs/decisions/001-flat-vs-isometric.md` | Oracle + Synth | ADR: isometric decision with pros/cons |
| `docs/decisions/002-polling-vs-websocket.md` | Atlas | ADR: why polling for v1 |
| `docs/decisions/003-pixijs-choice.md` | Synth | ADR: why PixiJS over alternatives |
| API response schemas (MapState contract) | Oracle + Synth | OpenAPI-style request/response shapes |

### During Phase 5.1

| Document | Owner | Purpose |
|----------|-------|---------|
| `tactical-map/README.md` | Synth | Setup, build, deploy, contributing |
| `config.js` with JSDoc | Synth | Living spec for all visual constants |
| `§11.5 Security Architecture` | Sentinel | Auth, CORS, CSP, data classification |

### During Phase 5.4+

| Document | Owner | Purpose |
|----------|-------|---------|
| `docs/ARCHITECTURE.md` | Synth + Archivist | High-level architecture for new contributors |
| `docs/DATA-FLOW.md` | Atlas | DB → API → State → Renderer pipeline |
| `docs/KEYBOARD-SHORTCUTS.md` | Archivist | User-facing reference |
| `docs/ACCESSIBILITY.md` | Archivist | A11y implementation details |
| `CHANGELOG.md` | All | Per-phase changes |

### User-Facing (Phase 5.5)

| Feature | Owner | Effort | Purpose |
|---------|-------|--------|---------|
| **Guided tour** (first-visit, ~45s, skippable) | Synth + Oracle | 4–6h | Users don't know what anything means without it |
| **Color legend widget** (toggle, bottom-right) | Synth | 1h | 5-tier bond color system needs explanation |
| **Help overlay** (`?` key) | Synth | 1h | Keyboard shortcuts + interaction summary |
| **Empty state handling** | Synth | 1h | "All agents idle" message when nothing is happening |
| **Error state handling** | Synth | 1h | "Unable to connect. Retrying..." with grayed last-known state |

### Post-Launch

| Action | Owner | Purpose |
|--------|-------|---------|
| Retire original spec → `docs/archive/original-spec-v1.md` | Archivist | Living docs replace static spec |
| "Hit by a bus" test | Archivist | Can a new dev add a building from docs alone? |
| User testing (3 people who haven't seen spec) | Oracle | Watch what they click, fix what confuses them |

### Accessibility Requirements (Archivist)

| Requirement | Priority | Phase | Effort |
|-------------|----------|-------|--------|
| Hidden ARIA tree mirroring canvas elements | P0 | 5.1 | 1–2h |
| `prefers-reduced-motion` support | P0 | 5.1 | 0.5h |
| Visible focus indicators on canvas | P1 | 5.4 | 1h |
| Non-color bond indicators (dash/dot + icon) | P1 | 5.3 | 1h |
| Focus trap for modals | P1 | 5.4 | 1h |
| Keyboard nav without overriding Tab | P1 | 5.4 | 0.5h |
| Color contrast verification (red bond borderline) | P2 | 5.3 | 0.5h |
| High contrast mode | P2 | 5.5+ | 2h |

---

## 10. Success Metrics

### Engagement (Measured 2 Weeks Post-Launch)

| Metric | Target | Method |
|--------|--------|--------|
| Session duration on tactical map | > 5 min avg | Page analytics |
| Click-through on buildings/bonds | > 20% of sessions | Click event tracking |
| Return visits (next day) | > 50% | User session tracking |
| Replay mode usage | > 10% of sessions | Feature usage tracking |

### Usefulness (Measured 1 Month Post-Launch)

| Metric | Target | Method |
|--------|--------|--------|
| Users identify overloaded agents at a glance | Yes | User feedback |
| Users correctly identify weak bonds | Yes | User testing |
| Users discover active work without reading logs | Yes | User testing |
| Onboarding tour completion rate | > 80% | Tour analytics |

### Technical Performance (Measured Continuously)

| Metric | Target | Method |
|--------|--------|--------|
| Frame rate | 60 FPS sustained | `requestAnimationFrame` monitoring |
| Update latency | < 100ms p95 | Network timing |
| Initial load | < 2s to first meaningful paint | Performance API |
| Memory usage | < 100MB heap | Chrome DevTools |
| Asset payload | < 5MB total | Network transfer size |
| API response | < 100ms p95 | Server-side timing |

### Quality (Measured Per Phase)

| Metric | Target | Method |
|--------|--------|--------|
| Unit test coverage (logic layers) | ≥ 80% cumulative | CI coverage report |
| Zero P0 security issues open | 0 | Sentinel audit |
| Visual regression pass rate | 100% | Playwright screenshot CI |
| Manual QA sign-off | All phases | Verifier + reviewer sign-off |

---

## 11. Risk Register

| # | Risk | Severity | Likelihood | Owner | Mitigation |
|---|------|----------|------------|-------|------------|
| 1 | No per-agent session data in API | 🔴 High | Certain | Atlas | Build session bridge in Phase 5.0 |
| 2 | Missions table empty (0 rows) | 🔴 High | Certain | Atlas | Build mission recording pipeline in Phase 5.0 |
| 3 | Unauthenticated API endpoints | 🔴 Critical | Certain (current state) | Sentinel | Design + implement auth in Phase 5.0/5.1 |
| 4 | XSS via task descriptions | 🔴 Critical | Likely | Synth | DOMPurify + CSP in Phase 5.1/5.2 |
| 5 | Sprite creation delays art pipeline | 🟡 Medium | Likely | Oracle | Procedural shapes for MVP; decouple art from code |
| 6 | Replay data quality insufficient | 🟡 Medium | Likely | Atlas | Defer replay to v2; validate data before building |
| 7 | Spec ambiguities create untestable code | 🟡 Medium | High | Oracle | Resolve 6 ambiguities before Phase 5.1 |
| 8 | No onboarding → users don't understand map | 🟡 Medium | High | Oracle + Synth | Guided tour in Phase 5.5 |
| 9 | Audio asset IP/licensing issues | 🟡 Medium | Medium | Archivist | ASSETS-LICENSING.md; original sound design only |
| 10 | Dashboard monolith grows unwieldy | 🟢 Low | Gradual | Atlas | Acceptable for now; refactor later |
| 11 | Cross-browser rendering differences | 🟢 Low | Low | Verifier | Smoke test Firefox/Safari weekly |
| 12 | SQLite contention from increased reads | 🟢 Low | Unlikely | Atlas | Tiny DB, read-only from map; upgrade to better-sqlite3 if needed |

---

## 12. Architecture Decisions (Consensus)

These emerged from cross-team agreement and should be recorded as ADRs:

### ADR-001: Extend Existing Dashboard (Not Separate Server)
- **Decision:** Tactical map served as `/map` route in existing VentureOS dashboard on port 7001
- **Rationale:** Single deployment, no CORS, shared DB connection, existing RPG APIs reusable
- **Trade-off:** Monolith grows larger (acceptable at this scale)
- **Agreed by:** Atlas, Synth (independently recommended same approach)

### ADR-002: Polling Over WebSocket for v1
- **Decision:** 15s polling for agent status, 60s for bonds. No WebSocket in MVP.
- **Rationale:** Data sources are polled SQLite, not push-based. WebSocket adds complexity for marginal benefit.
- **Future:** Add WebSocket/SSE in Phase 5.4+ for drift events and alerts only
- **Agreed by:** Atlas, Synth, Sentinel

### ADR-003: Procedural Sprites for MVP
- **Decision:** Use PixiJS Graphics (colored shapes + glow filters) for buildings and units in v1
- **Rationale:** Decouples art pipeline from critical path. Validates layout, interaction, data flow immediately. Swap to real sprites later without code changes.
- **Agreed by:** Atlas, Synth, Archivist

### ADR-004: Replay as Optional v2
- **Decision:** Phase 5.6 (Replay) is explicitly optional and deferred
- **Rationale:** Largest unknown (20–40h). Depends on data quality (empty missions table). Ships value without it.
- **Agreed by:** Synth, Atlas (replay complexity warnings)

---

## 13. Action Items — Next Steps

| # | Action | Owner | Deadline | Priority |
|---|--------|-------|----------|----------|
| 1 | **Decide: MVP scope vs full vision** | Zach | Before Phase 5.0 | 🔴 Blocking |
| 2 | **Decide: Isometric vs flat 2D** | Oracle + Synth | Before Phase 5.0 | 🔴 Blocking |
| 3 | **Build session bridge script** | Atlas | Phase 5.0 | 🔴 Blocking |
| 4 | **Build mission recording pipeline** | Atlas | Phase 5.0 | 🔴 Blocking |
| 5 | **Design security architecture (§11.5)** | Sentinel | Phase 5.0 | 🔴 Blocking |
| 6 | **Define MapState JSON contract** | Oracle + Synth | Phase 5.0 | 🔴 Blocking |
| 7 | **Resolve 6 spec ambiguities** | Oracle | Phase 5.0 | 🟡 High |
| 8 | **Create ASSETS-LICENSING.md** | Archivist | Phase 5.0 | 🟡 High |
| 9 | **Set up test infrastructure** | Verifier + Synth | Phase 5.1 (first task) | 🟡 High |
| 10 | **Implement auth on API endpoints** | Sentinel + Atlas | Phase 5.1 | 🔴 Blocking |
| 11 | **Create ARIA accessibility skeleton** | Synth | Phase 5.1 | 🟡 High |
| 12 | **Start procedural sprite development** | Synth | Phase 5.1 | 🟡 High |
| 13 | **Begin parallel art exploration** (if custom sprites desired) | Oracle | Phase 5.1+ | 🟢 Can start anytime |

---

## 14. Recommended Timeline

### MVP Path (Phases 5.0–5.4 Minimal)

```
Week 1:     Phase 5.0 — Data contracts, prerequisites, security design
Week 2-3:   Phase 5.1 — Foundation (buildings, terrain, HUD, auth, test infra)
Week 3-4:   Phase 5.2 — Activity & Animation (states, particles, health bars)
Week 4-5:   Phase 5.3 — Khala Network (bonds, collaboration, drift)
Week 5-6:   Phase 5.4 — Interactivity (panels, keyboard, tooltips)
            ──── MVP SHIP ────
Week 7+:    Phase 5.5 — Polish & Sound (audio, onboarding, tour)
Week 8+:    Phase 5.6 — Replay Mode (if prioritized)
```

**MVP ships at Week 5–6** with a living, interactive tactical map showing real agent activity, bond visualization, and detail panels. Audio, onboarding tour, and replay follow as incremental improvements.

> **Total MVP effort:** ~70–114 hours across 5–6 weeks  
> **Total with polish + replay:** ~88–150 hours across 7–9 weeks

---

*This plan synthesizes the perspectives of all 5 review teams. It is realistic, not aspirational. The original 48–64h spec estimate was achievable only for rendering code in isolation. The revised estimates account for the full picture: security, testing, documentation, accessibility, data plumbing, and onboarding that a production-quality system requires.*

*En Taro Adun.*

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

## Next Steps (Updated 2026-02-15 03:57 CST)

**Immediate Priority: Phase 5 P0 Remediation**

**Status:** ✅ Phase 5.0-5.2 COMPLETE | ✅ Team Reviews COMPLETE | 🔄 P0 Remediation IN PROGRESS

1. **✅ Phase 5.0-5.2 COMPLETE** (2026-02-14 19:38 CST)
   - ✅ Phase 5.0: Prerequisites (session bridge, security architecture, MapState contracts, assets licensing)
   - ✅ Phase 5.1: Foundation (security middleware, rendering core, 56 tests, 88.57% coverage)
   - ✅ Phase 5.2: Activity & Animation (activity mapper, building states, animations, particles, unit sprites, health bars)
   - **Deliverables:** 172 tests passing, 88.58% coverage, activity-mapper.ts (233 lines, 25 patterns, 94 tests)
   - **Location:** `~/clawd/ventureos/tactical-map`

2. **✅ Full Team Review COMPLETE** (2026-02-14 21:30 CST)
   - ✅ **Oracle:** Architecture review (32K, 3 P0 issues, 5-9h fix estimate)
   - ✅ **Sentinel:** Security audit (25K, 1 P0 + 5 P1 issues, 13-15h fix estimate)
   - ✅ **Verifier:** QA review (25K, 3 P0 issues, 8-12h fix estimate)
   - ✅ **Atlas:** Performance review (19K, 3 P0 issues, 4.5h fix estimate)
   - **Deliverables:** 4 comprehensive review documents, 10 P0 issues identified, remediation plan created

3. **🔄 P0 Remediation Sprint** (STARTING NOW, 21-30h total)
   - **Tier 1 - Security Foundation (6-11h):**
     - P0-1: API token exposed in unauthenticated HTML (Sentinel, 3-5h) — **READY TO DISPATCH**
     - P0-2: Rate limiter tested but not implemented (Oracle, 1-2h) — **READY TO DISPATCH**
     - P0-3: Middleware integration unverified (Oracle, 2-4h) — **READY TO DISPATCH**
   
   - **Tier 2 - Dashboard Functionality (4.5-5.5h):**
     - P0-4: Rate limiter global per-endpoint not per-IP (Atlas, 2h)
     - P0-5: Frontend doesn't handle 429 responses (Atlas, 1.5h)
     - P0-6: Client auth token discovery fragile (Oracle, 1-2h)
   
   - **Tier 3 - Test Coverage (9-13h):**
     - P0-7: 40 middleware tests are phantom tests (Verifier, 3-4h)
     - P0-8: XSS sanitization browser path untested (Verifier, 2-3h)
     - P0-9: E2E visual regression baselines missing (Verifier, 3-5h)
     - P0-10: Khala Network N+1 query pattern (Atlas, 1h)
   
   **Plan:** `~/clawd/shared-context/phase5-remediation-plan.md` (9KB)
   **Critical Path:** 10.5-16.5h for functional dashboard with real security

4. **🎯 Dispatch Queue** (Autonomous execution starting)
   - **Now:** Synth → P0-1 (API token exposure, 3-5h, highest risk)
   - **Now:** Oracle → P0-3 (Middleware integration audit, 2-4h, prerequisite for rate limiting)
   - **After P0-3:** Atlas → P0-2 (Deploy rate limiter, 1-2h)
   - **After Tier 1:** Atlas → P0-4 + P0-5 (Dashboard fixes, 3.5h combined)
   - **After Tier 2:** Verifier → Tier 3 (Test coverage, 9-13h)

**Rationale:** Team reviews revealed 10 P0 security/functionality/testing gaps. Fix Tier 1 (security foundation) first to unblock Tier 2 (dashboard functionality). Phase 5.3 (Khala Network) blocked until all P0s resolved.

---

**Document Status:** ✅ Master reference (updated 2026-02-15 03:57 CST)  
**Maintained By:** Nexus (Mission Control)  
**Phase Status:** Phases 1-4 complete, Phase 5.0-5.2 complete, P0 Remediation in progress  
**Current Priority:** Phase 5 P0 Remediation Tier 1 (Security Foundation, Synth + Oracle + Atlas, started 03:57 CST)

**"My life for Aiur! En Taro Adun! Through the Khala, we are eternal!"**

---

## Phase 4.5 Phase 2: Visual Skill Tree UI & Progression Polish (Issue #207)

### New API Endpoints (prefix: `/api/rpg/progression/`)
- `GET /tree` — Full tree + layouts + validation
- `GET /tree/state/:agentId` — Tree with per-agent node states
- `POST /tree/nodes` / `DELETE /tree/nodes` — CRUD skill nodes
- `POST /tree/layouts` — Save node positions
- `GET /tree/validate` — Validate tree graph
- `GET /tree/export` / `POST /tree/import` — Export/import JSON
- `GET /attribution/:agentId` / `GET /attribution` — XP attribution
- `GET /simulate/:agentId` — Prestige simulation
- `GET /milestones` — Milestones feed
- `POST /unlock` — Unlock skill (deducts XP)
- `GET /history/:agentId` — XP history

### Engine Functions
- `detectCycles()` — DFS-based cycle detection for skill tree graph
- `findOrphanNodes()` — Identify disconnected tier>1 nodes
- `validateSkillTree()` — Full graph validation (cycles, orphans, costs, refs)
- `getNodeState()` — Per-node state machine (locked/unlockable/unlocked/maxed)
- `simulatePrestige()` — Non-destructive prestige preview

### Schema: `skill_node_layouts`, `progression_milestones`

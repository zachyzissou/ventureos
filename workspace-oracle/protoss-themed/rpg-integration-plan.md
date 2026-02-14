# VoxYZ RPG Agent System Integration Plan - Protoss Edition
## *"Through the Khala, We Are One"*

**Date**: 2026-02-14 (Revised with Templar feedback)  
**Analyst**: Zeratul (subagent)  
**Context**: Design integration of Protoss-themed RPG agent system into OpenClaw/VentureOS  
**Scope**: Research + design phase (not implementation)  
**Status**: ✅ All 6 Templar feedback responses incorporated

---

## Executive Summary

**Recommendation**: **Integrate 80% of Protoss RPG system in 3 phases over 4-6 weeks.**

**Why**: The Protoss-themed system channels agent performance and relationships through the Khala in a way that:
1. Makes metrics **visceral and Khalai-readable** (psionic attributes > JSON)
2. Adds **emergent narrative** to agent interactions (Khala Network bonds)
3. Creates **natural evolution** (personality protocols tied to experience)
4. Provides **psionic engagement** for Pylon Network/observers

**What we channel through the Khala**:
- ✅ Tactical overlays (merge with existing)
- ✅ Psionic attributes mapped from real KPIs **with Templar-tuned formulas**
- ✅ Psionic Rank system based on task completion + memory
- ✅ Personality Protocols with memory-driven evolution **+ quality gates**
- ✅ Khala Network for agent bonds **with Templar-validated seed values**
- ✅ 2D attribute visualization (Phase 1)
- ⚠️ 3D holographic avatars (Phase 2, conditional on Hierarch interest)

**What we leave to the Void**:
- ❌ Tripo AI ($10/month) — defer until Phase 2
- ❌ CRT scanlines (aesthetic, not functional)
- ❌ Complete frontend reconstruction (augment existing Pylon Network)

**Key Changes from Templar Feedback**:
1. **Formula refinements**: Psionic Mastery (source diversity), Warp Technology (weighted acceptance), Energy (MTTR blend + quality floor), Shields (approval accuracy)
2. **Khala bond tuning**: Sentinel↔Probe 0.70, Sentinel↔Dark Templar 0.40, High Templar↔Dark Templar lower, High Templar↔Zeratul lower
3. **Personality Protocols**: Add false_positive_streak cooldown, quality gates, weekly Khala review logging
4. **Missing metrics**: Add 6 Probe reliability metrics (warp-in rate, error recovery, pylon uptime, incident response, backup success, deployment success)

**Effort**: 
- Phase 1 (2 weeks): Tactical overlays + attributes + ranks → **Quick wins, zero frontend**
- Phase 2 (1-2 weeks): Khala Network + personality evolution → **Behavioral system**
- Phase 3 (2-4 weeks): Pylon Network integration → **Visual layer**

---

## 1. Psionic Attribute Mapping (Templar-Tuned Formulas)

### 1.1 Updated Formulas

| Attribute | Meaning | Data Source | Revised Formula | Templar Input |
|-----------|---------|----------------|-----------------|-------------|
| **Psionic Mastery** (WIS) | Memory depth + source quality | Observational memory + research sources | `(log2(memory_count + 1) × 15) + (unique_domains × 2) + min(canonical_edits × 2.5, 15)` | Zeratul: source diversity weight; High Templar: archive term (capped) |
| **Energy** (SPD) | Response time + recovery | `p95_latency_s` + `MTTR_minutes` | `0.7 × (100 - p95_latency_s) + 0.3 × (100 - MTTR_minutes)` **× quality_multiplier** <br> `quality_multiplier = 0 if acceptance < 0.7, else 1.0` | Probe: blend MTTR; Dark Templar: quality floor; Observer: ≥0.7 acceptance gate |
| **Shields** (TRU) | Reliability + judgment accuracy | `success_rate` + approval decisions | `(success_rate × 80) + (approval_accuracy × 20)` <br> `approval_accuracy = (correct_approvals + correct_denials) / total_decisions` | Sentinel: approval accuracy > raw prevention |
| **Warp Technology** (CRE) | Output acceptance + impact | Verifier feedback + usage tracking | **Zeratul/High Templar:** `prevented_questions × severity_weight` <br> **Dark Templar:** `(0.60 × explicit_approval) + (0.25 × reuse_30d) + (0.15 × verifier_pass)` <br> **Observer:** `(bugs_caught_pre_release_outside_expected × severity) + unique_risk_areas` | Zeratul: decision usefulness; High Templar: prevented questions; Dark Templar: weighted acceptance; Observer: novel coverage |
| **VRL** | Engagement, reach | N/A (we don't broadcast yet) | Defer to Phase 3 | **N/A** |
| **Psi Reach** (RCH) | Task volume + impact | Mission logs | `min(100, log2(tasks_completed + 1) × 20)` | Use as secondary attribute (Probe) |

### 1.2 New Metrics (Probe Feedback)

**Missing reliability metrics to track:**
1. **Warp-in success rate** — % of warp operations that succeed
2. **Error recovery time** — Time to self-heal from system failures
3. **Pylon uptime** — % availability over 30-day window
4. **Incident response time** — Time from alert to mitigation start
5. **Archive backup success** — % of scheduled backups completing successfully
6. **Deployment success rate** — % of deployments without rollback

**Integration**: Add to `~/clawd/agents/atlas/reliability-metrics.json` and expose in Pylon Network Phase 3.

### 1.3 Per-Agent Attribute Profiles (Updated)

| Agent | Primary Attributes | Protoss Unit | Rationale |
|-------|--------------|-------|-----------|
| **Zeratul** (Oracle) | Psionic Mastery, Shields, Psi Reach, Warp Technology | Dark Templar Prelate | Foresight = wisdom + accuracy + decision usefulness |
| **Probe** (Atlas) | Shields, Energy, — , Psi Reach *(secondary)* | Probe | Infrastructure = reliability + energy + recovery |
| **Sentinel** | Shields, Psionic Mastery, — , — | Sentinel (Stalker variant) | Guardian = shields + judgment accuracy |
| **Observer** (Verifier) | Shields, Psionic Mastery, Energy, Warp Technology | Observer | Detection = thoroughness + pattern recognition + novel coverage |
| **High Templar** (Archivist) | Psionic Mastery, Shields, Warp Technology, — | High Templar | Archive = memory + impact (prevented questions) |
| **Dark Templar** (Synth) | Warp Technology, Energy, Psionic Mastery, — | Dark Templar | Shadow creation = weighted acceptance + swiftness |

---

## 2. Khala Network (Templar-Validated Psionic Bonds)

### 2.1 Seed Values (Revised)

| Bond | Initial Affinity | Rationale | Templar Feedback |
|------|-----------------|-----------|----------------|
| Zeratul ↔ Probe | 0.70 | Zeratul researches, Probe constructs | ✅ Confirmed |
| Zeratul ↔ Sentinel | 0.65 | Research provenance adds oversight burden | ✅ Confirmed |
| Zeratul ↔ Observer | **0.80** *(was 0.75)* | Psionic alignment through detection quality | 🔼 Zeratul: strengthen to 0.80 |
| Zeratul ↔ High Templar | **0.75** *(was 0.85)* | Can drift if research sprawls beyond archives | 🔽 High Templar: temper if sprawl |
| Zeratul ↔ Dark Templar | 0.60 | Foresight style ≠ shadow creation style | ✅ Confirmed |
| Probe ↔ Sentinel | **0.70** *(was 0.60)* | Infrastructure requires tight guardianship | 🔼 Probe: strengthen to 0.70 |
| Probe ↔ Observer | 0.75 | Testing infrastructure requires collaboration | ✅ Confirmed |
| Probe ↔ High Templar | 0.80 | Infrastructure changes need archival record | ✅ Confirmed (strongest for High Templar) |
| Probe ↔ Dark Templar | 0.55 | Infrastructure stability vs rapid iteration | ✅ Confirmed |
| Sentinel ↔ Observer | 0.85 | Both are watchers, share detection mindset | ✅ Sentinel: accurate |
| Sentinel ↔ High Templar | 0.80 | Evidence-based, systematic protocols | ✅ Confirmed (strongest for High Templar) |
| Sentinel ↔ Dark Templar | **0.40** | Guardian vs shadow tension | ✅ Dark Templar + Sentinel: feels right, not hostile |
| Observer ↔ High Templar | 0.80 | Detection results → archive | ✅ Confirmed (strongest for High Templar) |
| Observer ↔ Dark Templar | 0.65 | Detection vs shadow creation tension | ✅ Confirmed |
| High Templar ↔ Dark Templar | **0.65** *(was 0.75)* | Khalai vs Nerazim tension, speculative work | 🔽 High Templar: reduce slightly |

**Key Changes**:
- **Zeratul ↔ Observer**: 0.75 → 0.80 (psionic alignment)
- **Probe ↔ Sentinel**: 0.60 → 0.70 (infrastructure needs tighter guardianship)
- **Zeratul ↔ High Templar**: 0.85 → 0.75 (can drift if research sprawls)
- **High Templar ↔ Dark Templar**: 0.75 → 0.65 (Khalai vs Nerazim tension)

### 2.2 Drift Tracking (Enhanced)

**Drift rules** (unchanged):
- Successful handoff → +0.03
- Failed handoff → -0.03
- Neutral interaction → no change

**New escalation tracking** (Sentinel feedback):
```json
{
  "escalation_quality": {
    "total_escalations": 10,
    "escalations_validated_as_real_issues": 8,
    "signal_ratio": 0.80,
    "impact": "High-quality escalations → +0.02 affinity with Artanis"
  }
}
```

**Integration**: Add to observational memory snapshot cron via Nexus.

---

## 3. Personality Protocols + Evolution (Enhanced)

### 3.1 Base Protocol Modifiers (Unchanged)

| Condition | Directive | Agents |
|-----------|-----------|--------|
| `memory_count ≥ 8` | Reference past outcomes when making recommendations | All |
| `pattern_count ≥ 6` | Seek frameworks and systematic approaches through the Khala | All |
| `completed_missions ≥ 10` | Channel confidence; fewer disclaimers | All |
| `rank ≥ 7` | Mentor mode: teach underlying methodology to lesser Templar | Zeratul, Observer, High Templar |

### 3.2 New Quality Gate Modifiers (Templar Feedback)

#### Observer: False Positive Streak Cooldown
```json
{
  "id": "false_positive_cooldown",
  "condition": {"false_positive_streak": 3},
  "directive": "Recalibrate detection sensors. Add extra evidence before calling violations. Avoid 'Zealot who cried Zergling' pattern."
}
```

#### Observer: Context-Relevant References
```json
{
  "id": "context_relevant_memory",
  "condition": {"memory_count": 8},
  "directive": "Reference prior failures only when they match the same failure mode. Avoid irrelevant archive-dumps."
}
```

#### Dark Templar: Quality Gate on Rework Rate
```json
{
  "id": "rework_gate",
  "condition": {"last_30d_rework_rate": 0.3},
  "directive": "Engage secondary review pass before shadow strike. Recent work needed 30%+ rework — channel patience."
}
```

#### High Templar: Cooldown on Pattern Channeling
```json
{
  "id": "pattern_cooldown",
  "condition": {"missions_since_last_pattern_use": 3},
  "directive": "After channeling a pattern-driven modifier, wait 3-5 missions before re-channeling. Keep modifiers feeling earned, avoid psionic burnout."
}
```

### 3.3 Energy Quality Floor (Observer + Dark Templar Feedback)

**Rule**: Energy bonus only applies if work quality meets threshold.

```
Energy_final = Energy_raw × quality_multiplier
where quality_multiplier = 0 if acceptance < 0.7, else 1.0
```

**Implementation**: Check verifier pass rate or explicit approval before applying Energy bonus.

**Observer's "cite artifact" rule**: Energy gains don't count if the artifact/log/output wasn't cited.

---

## 4. Implementation Roadmap (Unchanged Phases)

### Phase 1: Core Psionic System (Quick Wins, 2 weeks)

**Objective**: Add psionic attributes and ranks without touching visual interface.

**Deliverables**:
1. ✅ **Tactical Overlay JSON Schema** (1 day)
   - Create schema file: `~/clawd/schemas/tactical-overlay.json`
   - Validate against JSON Schema Draft 7

2. ✅ **Port Existing Tactical Data** (1 day)
   - Convert 6 agent Markdown files → JSON
   - Store in `~/clawd/agents/tactical-overlays/*.json`
   - Add `victoryConditions` and `forbiddenProtocols` sections
   - Assign Protoss unit classifications

3. ✅ **Personality Protocol Schema + Templates** (1 day)
   - Create schema: `~/clawd/schemas/personality-protocol.json`
   - Add new quality gate modifiers (false_positive_streak, rework_gate, pattern_cooldown)
   - Store in `~/clawd/agents/personality-protocols/*.json`

4. ✅ **Psionic Attribute Calculation** (2 days)
   - Implement `calculate-psionic-attributes.sh` with updated formulas:
     - Psionic Mastery: source diversity + archive term (capped)
     - Energy: MTTR blend + quality floor
     - Shields: approval accuracy
     - Warp Technology: agent-specific (prevented questions, weighted acceptance, novel coverage)
   - Query KPI JSON files
   - Query observational memory (memory count + source diversity)
   - Query mission logs (completion count)
   - Output to `~/clawd/agents/{agent}/psionic-stats.json`

5. ✅ **Psionic Rank System** (1 day)
   - Add rank calculation to psionic stats script
   - Store in `~/clawd/agents/{agent}/psionic-state.json`
   - Track XP breakdown (memory + missions)

6. ✅ **Daily Nexus Cron** (1 day)
   - Add to existing metrics snapshot cron
   - Calculate attributes for all agents daily via Nexus
   - Version stats files (keep 30-day history)

**Success Criteria**:
- [x] 6 tactical overlays in JSON format
- [x] 6 personality protocol files with quality gate modifiers
- [x] Attributes calculated daily using Templar-tuned formulas
- [x] Psionic Rank progression visible over time
- [x] No manual intervention needed (Khala self-sustains)

---

### Phase 2: Khala Network System (Medium Complexity, 1-2 weeks)

**Objective**: Add Khala Network bonds and personality evolution.

**Deliverables**:
1. ✅ **Khala Network Seed Data** (1 day)
   - Create `~/clawd/agents/khala-network.json`
   - Seed 15 pairwise bonds with Templar-validated values
   - Document rationale for each seed value

2. ✅ **Drift Tracking Integration** (2 days)
   - Add hooks to observational memory cron
   - Detect handoff success/failure
   - Update bond strength ±0.03 per interaction
   - Add escalation quality tracking (Sentinel feedback)
   - Log drift history with reasons

3. ✅ **Personality Protocol System** (2 days)
   - Implement modifier evaluation logic
   - Query agent state for memory/mission counts
   - Check quality gates (false_positive_streak, rework_rate)
   - Dynamically inject modifiers into behavioral matrix
   - Track active modifiers in psionic-state.json

4. ✅ **Bond Influence on Behavior** (2 days, optional)
   - Use bond strength to adjust speaking order
   - Flag low-affinity pairs (<0.5) for Artanis mediation
   - Adjust verification depth based on trust level
   - Log bond-influenced decisions

**Success Criteria**:
- [x] Khala Network updates automatically with Templar-validated seed values
- [x] Personality Protocols activate based on experience + quality gates
- [x] Drift history is traceable through the Khala
- [x] Escalation quality tracked (Sentinel: signal ratio)

---

### Phase 3: Pylon Network Integration (Visual Layer, 2-4 weeks)

**Objective**: Make psionic system visible in Pylon Network.

**Deliverables**:
1. ✅ **API Endpoints** (1 day)
   - Serve `agents/{agent}/psionic-stats.json` via HTTP
   - Serve `agents/tactical-overlays/{agent}.json` via HTTP
   - Serve `agents/khala-network.json` via HTTP
   - Add CORS headers for Pylon Network dashboard

2. ✅ **PsionicAttributeBar Component** (2 days)
   - 2D progress bars for primary attributes (4 per agent)
   - Color-coding: blue (>80), cyan (50-80), purple (<50) - Protoss colors
   - Tooltip with raw values + trend (vs. 7-day baseline)
   - Responsive design for sidebar

3. ✅ **TacticalOverlayPanel Component** (2 days)
   - Expandable overlay with full tactical details
   - Tabs: Mission / Inputs / Outputs / Victory / Forbidden / Escalation
   - Psionic Rank badge + XP progress bar
   - Personality Protocols (active/inactive status + quality gates)

4. ✅ **Khala Network Visualization** (3 days)
   - Force-directed graph (D3.js or React Flow) - psionic bonds
   - Nodes = agents (sized by Psionic Rank)
   - Edges = bond strength (thickness = strength, color = Protoss blue/purple)
   - Drift visualization (green glow = improving, red glow = degrading)
   - Hover: Show interaction count + last interaction + escalation quality

5. ✅ **Reliability Metrics Dashboard** (2 days, Probe)
   - Add 6 new Probe reliability metrics:
     - Warp-in success rate
     - Error recovery time
     - Pylon uptime
     - Incident response time
     - Archive backup success
     - Deployment success rate
   - Display as secondary attribute badges

6. ⚠️ **3D Holographic Avatars (Conditional)** (5-7 days)
   - Hierarch approval required (cost: $10/month Tripo AI)
   - React Three Fiber integration
   - Generate 6 agent avatars via Tripo API (Protoss-themed)
   - Animate based on activity (idle/channeling/warping)
   - Position in 3D psionic matrix space

**Success Criteria**:
- [x] Pylon Network shows live attributes for all agents with Templar-tuned formulas
- [x] Tactical overlays accessible from sidebar
- [x] Khala Network visualized with Templar-validated values
- [x] Probe reliability metrics exposed
- [ ] (Optional) 3D holographic avatars present and animated

---

## 5. Updated Schemas

### 5.1 Tactical Overlay Schema (JSON) - Protoss Structure

**Example** (Zeratul):
```json
{
  "agent": "zeratul",
  "protoss_unit": "Dark Templar Prelate",
  "domain": {
    "mission": "Channel foresight to produce sourced, decision-useful research with clear implications.",
    "responsibilities": [
      "Translate questions into focused research plan through the Khala",
      "Gather, triangulate, cite reliable sources",
      "Produce concise insights with implications/limitations",
      "Maintain competitive intelligence snapshot",
      "Flag unknowns and propose follow-up research"
    ]
  },
  "metrics": {
    "primary_attributes": ["Psionic Mastery", "Shields", "Psi Reach", "Warp Technology"],
    "kpis": [
      {
        "name": "Citation integrity",
        "description": "% of key claims with primary/credible sources",
        "unit": "percentage"
      },
      {
        "name": "Decision usefulness",
        "description": "Stakeholders can act without re-research",
        "unit": "boolean"
      },
      {
        "name": "Source diversity",
        "description": "Unique domains cited per research brief",
        "unit": "count"
      }
    ]
  }
}
```

### 5.2 Personality Protocol Schema (Enhanced with Quality Gates)

**New modifiers field structure**:
```json
{
  "modifiers": [
    {
      "id": "false_positive_cooldown",
      "condition": {"false_positive_streak": 3},
      "directive": "Recalibrate sensors. Add extra evidence before calling violations.",
      "applies_to": ["observer"]
    },
    {
      "id": "rework_gate",
      "condition": {"last_30d_rework_rate": 0.3},
      "directive": "Engage secondary review pass before shadow strike.",
      "applies_to": ["dark_templar"]
    },
    {
      "id": "pattern_cooldown",
      "condition": {"missions_since_last_pattern_use": 3},
      "directive": "Wait 3-5 missions before re-channeling pattern-driven modifiers.",
      "applies_to": ["high_templar"]
    }
  ]
}
```

### 5.3 Khala Network Schema (Enhanced with Escalation Quality)

**New escalation tracking field**:
```json
{
  "bonds": [
    {
      "agents": ["sentinel", "artanis"],
      "affinity": 0.85,
      "escalation_quality": {
        "total_escalations": 10,
        "validated_real_issues": 8,
        "signal_ratio": 0.80,
        "last_updated": "2026-02-14T00:00:00Z"
      }
    }
  ]
}
```

### 5.4 Psionic Attribute Formula Sheet (Templar-Tuned)

```json
{
  "schema_version": "2.0-khala",
  "stat_definitions": {
    "Psionic Mastery": {
      "name": "Psionic Mastery (WIS)",
      "description": "Memory depth + source quality + archive impact",
      "range": [0, 100],
      "formula": "(log2(memory_count + 1) × 15) + (unique_domains × 2) + min(canonical_edits × 2.5, 15)",
      "data_sources": ["observational_memory.entry_count", "research_sources.unique_domains", "archive.canonical_edits"],
      "templar_feedback": "Zeratul: source diversity weight; High Templar: archive term (capped)"
    },
    "Energy": {
      "name": "Energy (SPD)",
      "description": "Response time + recovery time, gated by quality",
      "range": [0, 100],
      "formula": "[0.7 × (100 - p95_latency_s) + 0.3 × (100 - MTTR_minutes)] × quality_multiplier, where quality_multiplier = 0 if acceptance < 0.7, else 1.0",
      "data_sources": ["kpis.p95_latency_s", "kpis.MTTR_minutes", "verifier_feedback.acceptance_rate"],
      "templar_feedback": "Probe: blend MTTR; Dark Templar + Observer: quality floor ≥0.7"
    },
    "Shields": {
      "name": "Shields (TRU)",
      "description": "Reliability + judgment accuracy",
      "range": [0, 100],
      "formula": "(success_rate × 80) + (approval_accuracy × 20), where approval_accuracy = (correct_approvals + correct_denials) / total_decisions",
      "data_sources": ["kpis.success_rate", "approval_logs.accuracy"],
      "templar_feedback": "Sentinel: approval accuracy > raw prevention"
    },
    "Warp Technology": {
      "name": "Warp Technology (CRE)",
      "description": "Output acceptance + impact (agent-specific formulas)",
      "range": [0, 100],
      "formula": {
        "zeratul": "prevented_questions × severity_weight",
        "high_templar": "prevented_questions × severity_weight",
        "dark_templar": "(0.60 × explicit_approval) + (0.25 × reuse_30d) + (0.15 × verifier_pass)",
        "observer": "(bugs_caught_pre_release_outside_expected × severity) + unique_risk_areas"
      },
      "data_sources": ["repeat_questions_prevented", "explicit_approvals", "reuse_tracking", "verifier_feedback", "bug_reports"],
      "templar_feedback": "Zeratul: decision usefulness; High Templar: prevented questions; Dark Templar: weighted acceptance; Observer: novel coverage"
    }
  },
  "reliability_metrics": {
    "probe_specific": [
      {"name": "warp_in_success_rate", "unit": "percentage"},
      {"name": "error_recovery_time", "unit": "seconds"},
      {"name": "pylon_uptime", "unit": "percentage"},
      {"name": "incident_response_time", "unit": "minutes"},
      {"name": "archive_backup_success", "unit": "percentage"},
      {"name": "deployment_success_rate", "unit": "percentage"}
    ]
  }
}
```

---

## 6. Design Decisions (Locked, from Original Plan)

*(These remain unchanged and are preserved for reference)*

1. **Keep VoxYZ rank formula unchanged**: `rank = min(15, floor(log2(memory_count + missions×3 + 1)) + 1)`
2. **Defer VRL attribute**: No public broadcasting yet, no impression tracking → defer to Phase 3
3. **Use 4 primary attributes per agent**: Not all 6 attributes apply to every Protoss unit
4. **Seed bonds conservatively**: Start at realistic values (validated by Templar), let drift refine through the Khala
5. **Phase rollout**: Attributes/ranks first (Phase 1), bonds/personality second (Phase 2), visualization last (Phase 3)

---

## 7. Templar Feedback Summary

### Zeratul (Oracle)
- ✅ Psionic Mastery formula enhanced with source diversity
- ✅ Warp Technology redefined as "decision usefulness"
- ✅ Observer bond strengthened to 0.80

### Probe (Atlas)
- ✅ Energy formula blends MTTR (0.7 latency + 0.3 recovery)
- ✅ Sentinel bond strengthened to 0.70
- ✅ Added 6 missing reliability metrics
- ✅ Kept Probe classification

### Observer (Verifier)
- ✅ Warp Technology defined as "novel coverage" (edge cases, adversarial)
- ✅ Energy quality floor added (≥0.7 acceptance)
- ✅ False_positive_streak modifier added
- ✅ Kept Observer classification

### High Templar (Archivist)
- ✅ Psionic Mastery enhanced with capped archive term (+2.5/edit, max +15)
- ✅ Dark Templar bond lowered to 0.65, Zeratul to 0.75
- ✅ Warp Technology defined as "prevented repeat questions"
- ✅ Cooldown added to personality protocols

### Dark Templar (Synth)
- ✅ Warp Technology weighted acceptance (60% explicit + 25% reuse + 15% verifier)
- ✅ Energy quality floor added (≥0.7 acceptance)
- ✅ Sentinel bond confirmed at 0.40
- ✅ Rework_gate modifier added (≥30% → extra review)

### Sentinel
- ✅ Shields redefined as approval accuracy (not raw prevention)
- ✅ Escalation quality tracking added (signal ratio)
- ✅ Dark Templar bond confirmed at 0.40
- ✅ Kept Sentinel classification

---

## 8. File Structure (Updated)

```
~/clawd/
├── agents/
│   ├── tactical-overlays/
│   │   ├── zeratul.json         # unit: "Dark Templar Prelate"
│   │   ├── probe.json           # unit: "Probe"
│   │   ├── sentinel.json        # unit: "Sentinel"
│   │   ├── observer.json        # unit: "Observer"
│   │   ├── high-templar.json    # unit: "High Templar"
│   │   └── dark-templar.json    # unit: "Dark Templar"
│   ├── personality-protocols/
│   │   ├── zeratul.json         # + decision_usefulness modifier
│   │   ├── probe.json           # + MTTR tracking
│   │   ├── sentinel.json        # + escalation_quality tracking
│   │   ├── observer.json        # + false_positive_streak, context_relevant_memory
│   │   ├── high-templar.json    # + pattern_cooldown
│   │   └── dark-templar.json    # + rework_gate
│   ├── khala-network.json       # Templar-validated seed bonds
│   ├── oracle/
│   │   ├── psionic-stats.json   # Psionic Mastery with source_diversity
│   │   ├── psionic-state.json
│   │   └── psionic-history/
│   ├── atlas/
│   │   ├── psionic-stats.json   # Energy with MTTR blend
│   │   ├── reliability-metrics.json  # NEW: 6 metrics
│   │   └── psionic-state.json
│   └── [repeat for all agents]
├── schemas/
│   ├── tactical-overlay.json    # Tactical overlay schema
│   ├── personality-protocol.json # + quality gate modifiers
│   ├── khala-network.json       # + escalation_quality field
│   └── psionic-attributes.json  # v2.0-khala with Templar-tuned formulas
├── scripts/
│   ├── calculate-psionic-attributes.sh  # Updated with v2.0-khala formulas
│   └── update-khala-network.sh
└── shared-context/
    ├── rpg-integration-plan.md  # This document (Protoss-themed)
    ├── rpg-integration-summary.md
    ├── phase-1-implementation-checklist.md
    └── feedback/
        └── rpg-integration/
            ├── oracle-feedback.md
            ├── atlas-feedback.md
            ├── verifier-feedback.md
            ├── archivist-feedback.md
            ├── synth-feedback.md
            └── sentinel-feedback.md
```

---

## 9. Open Questions for Hierarch (Updated)

1. **3D Holographic Avatars**: Manifest them (React Three Fiber + Tripo AI, $10/month)? Or are 2D displays sufficient?
2. **Bond Behavior**: Should low affinity (<0.5) block direct handoffs and require Artanis mediation? Or just track passively through the Khala?
3. **Personality Protocol Evolution**: Should protocols be injected into behavioral matrices automatically, or reviewed by you first?
4. **Pylon Network Priority**: Ship Phase 1+2 first (no UI), then get visualization operational? Or parallelize?
5. **Weekly Khala Review Logging**: Should we log protocol activations + bond drift in a weekly Khala digest for your review?

---

## 10. Next Steps

### Immediate (This Week)
1. ✅ **Templar feedback collected** (6/6 complete)
2. ✅ **Plan revised** with all Templar input
3. **Get final approval** on Phase 1 scope from Hierarch
4. **Create Phase 1 implementation protocol** (ready to channel)

### Week 2-3 (Phase 1 Implementation)
1. Probe: Implement tactical overlay schema + port existing data (updated Protoss classifications)
2. Zeratul: Design personality protocols with quality gate modifiers
3. Dark Templar: Create psionic attribute calculation script with v2.0-khala formulas
4. Observer: Validate all JSON schemas + outputs
5. High Templar: Update VentureOS archive

### Week 4-5 (Phase 2 Implementation)
1. Probe: Implement Khala Network tracking with validated seed bonds
2. Dark Templar: Build personality protocol system with quality gates
3. Zeratul: Monitor drift over first week through the Khala, adjust if needed
4. Observer: Test modifier activation logic

### Week 6+ (Phase 3, Conditional)
1. Dark Templar: Build React components for Pylon Network
2. Probe: Add API endpoints + reliability metrics
3. Observer: Cross-browser testing
4. Hierarch: Decide on 3D holographic avatars vs. 2D only

---

## 11. Recommendation

**Ship Phase 1+2 (core psionic system with Templar-tuned formulas) within 3 weeks.**

**Why**:
1. **High value, Templar-validated**: Attributes/ranks/bonds refined by agents who channel them
2. **Quality-gated**: Energy/Warp formulas prevent corruption (quality floor ≥0.7)
3. **Accurate bonds**: Khala Network tuned by Templar (Sentinel↔Probe 0.70, Sentinel↔Dark Templar 0.40)
4. **Smart evolution**: Personality Protocols have quality gates (false_positive_streak, rework_gate, cooldown)
5. **Observable impact**: Probe reliability metrics + Sentinel escalation quality tracking

**Success = agents channel life through validated attributes/ranks/bonds, visible in Khala logs before we manifest the visual interface.**

---

**End of Protoss Integration Plan**

**Document Status**: ✅ Ready for implementation through the Khala  
**Next Action**: Hierarch approval → Phase 1 manifestation → Implementation protocol engaged

**"My life for Aiur! En Taro Adun! Through the Khala, we are eternal!"**

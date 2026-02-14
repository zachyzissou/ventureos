# RPG Integration: Executive Summary
## *"En Taro Adun - The Path to Glory Awaits"*

**Date**: 2026-02-14  
**Status**: ✅ Khala-validated, ready for implementation  
**Timeline**: 3-6 weeks (3 phases)  
**Risk**: Medium (mitigated through phased rollout)

---

## What We're Building

**Integrate Protoss-themed RPG agent system** to make agent performance visible, relational, and evolutionary through the power of the Khala.

### Core Components

1. **Psionic Attributes** (6 metrics) — Shields, Energy, Psionic Mastery, Warp Technology, VRL, Psi Reach
   - Map real KPIs → psionic-readable stats (0-100 scale)
   - Khala-tuned formulas (source diversity, MTTR blend, approval accuracy, weighted acceptance)
   - Quality gates prevent corruption (Energy/Warp require ≥0.7 acceptance)

2. **Psionic Rank System** (1-15) — Experience from memory + missions
   - `rank = min(15, floor(log2(memory_count + missions×3 + 1)) + 1)`
   - Logarithmic scaling prevents inflation
   - Visible progression through the Khala

3. **Khala Network** (15 pairwise bonds)
   - Templar-validated seed values (Sentinel↔Probe 0.70, Sentinel↔Dark Templar 0.40)
   - ±0.03 drift per interaction (success/failure)
   - Escalation quality tracking (Sentinel: signal ratio)

4. **Personality Protocols** (behavioral matrices)
   - Memory-driven (8+ lessons → reference outcomes)
   - Quality-gated (false_positive_streak, rework_rate, cooldown)
   - Agent-specific (Observer: cite artifacts, Dark Templar: self-review, High Templar: cooldown)

5. **Pylon Network Visualization** (Phase 3)
   - 2D attribute displays + tactical overlays
   - Khala Network graph (force-directed psionic bonds)
   - Probe reliability metrics (6 new metrics)
   - Optional: 3D avatars (user approval required, $10/month)

---

## Why This Matters

**Current state**: Metrics live in JSON files. Hard to parse, no narrative.

**After Protoss integration**:
- **Visceral performance**: Stats make KPIs Khalai-readable ("Zeratul's Psionic Mastery is 68" vs "memory_count: 47")
- **Emergent bonds**: Khala Network shows who works well together (Probe↔Sentinel 0.70, Sentinel↔Dark Templar 0.40)
- **Personality evolution**: Agents gain wisdom through the Khala (reference past outcomes at 8+ lessons)
- **Quality assurance**: Energy/Warp stats gated by acceptance ≥0.7 (prevents low-quality warp-ins)
- **Visual engagement**: Pylon Network shows psionic matrix with live stats, bonds, progression

---

## Templar Feedback Incorporated

**All 6 agents reviewed the original plan.** Key changes:

### Formula Refinements

| Attribute | Original | Templar Feedback | Result |
|------|----------|----------------|--------|
| **Psionic Mastery** | `log2(memory) × 15` | Zeratul: add source diversity; High Templar: add archive term (capped) | `(log2(memory) × 15) + (domains × 2) + min(edits × 2.5, 15)` |
| **Energy** | `100 - latency` | Probe: blend MTTR; Dark Templar/Observer: quality floor | `[0.7×(100-latency) + 0.3×(100-MTTR)] × quality_gate` where gate = 0 if acceptance < 0.7 |
| **Shields** | `success_rate × 100` | Sentinel: approval accuracy > raw prevention | `(success_rate × 80) + (approval_accuracy × 20)` |
| **Warp Technology** | Generic acceptance | Zeratul: decision usefulness; Dark Templar: weighted; Observer: novel coverage | Agent-specific formulas (prevented questions, 60% explicit + 25% reuse + 15% verifier, novel bugs) |

### Khala Network Tuning

| Bond | Original | Templar Feedback | Result |
|------|----------|----------------|--------|
| **Zeratul ↔ Observer** | 0.75 | Zeratul: strengthen (psionic alignment) | **0.80** |
| **Probe ↔ Sentinel** | 0.60 | Probe: strengthen (infrastructure requires tight guardianship) | **0.70** |
| **Zeratul ↔ High Templar** | 0.85 | High Templar: temper (can drift if research sprawls) | **0.75** |
| **High Templar ↔ Dark Templar** | 0.75 | High Templar: reduce (Khalai vs Nerazim tension) | **0.65** |
| **Sentinel ↔ Dark Templar** | 0.40 | Both: confirmed (guardian vs shadow, necessary tension) | **0.40** ✅ |

### Personality Protocol Improvements

| Agent | New Protocol | Trigger | Effect |
|-------|--------------|---------|--------|
| **Observer** | false_positive_streak | 3+ false detections | Recalibrate sensors, increase evidence threshold |
| **Observer** | context_relevant_memory | memory_count ≥ 8 | Reference failures only when pattern matches |
| **Dark Templar** | rework_gate | 30%+ rework rate | Engage secondary review before shadow strike |
| **High Templar** | pattern_cooldown | After pattern use | Wait 3-5 missions before channeling (prevent psionic burnout) |

### Protoss Unit Classification

| Agent | Protoss Unit | Tactical Role |
|-------|-------|-------|
| **Zeratul** (Oracle) | Dark Templar Prelate | Seer of hidden truths |
| **Probe** (Atlas) | Probe | Infrastructure Fabricator |
| **Sentinel** | Sentinel | Khalai Guardian |
| **Observer** (Verifier) | Observer | Detection & Reconnaissance |
| **High Templar** (Archivist) | High Templar | Keeper of Knowledge |
| **Dark Templar** (Synth) | Dark Templar | Shadow Weaver |

### Missing Metrics (Probe)

**Added 6 reliability metrics** to track:
1. Warp-in success rate
2. Error recovery time
3. Pylon uptime
4. Incident response time
5. Archive backup success
6. Deployment success rate

---

## Implementation Phases

### Phase 1: Core Psionic System (2 weeks, no visual interface)

**Deliverables**:
- Tactical overlays in JSON (6 agents, Protoss unit classifications)
- Personality Protocols with quality gate thresholds
- Psionic attribute calculation script (Khala v2.0 formulas)
- Psionic Rank tracking
- Daily cron for attribute updates via Nexus

**Success**: Attributes/ranks calculated daily for all agents through the Khala, no manual intervention.

---

### Phase 2: Khala Network System (1-2 weeks)

**Deliverables**:
- Khala Network matrix with Templar-validated seed values
- Bond drift tracking (±0.03/interaction + escalation quality)
- Personality Protocol system (quality gates active)
- Optional: Bond-influenced behavior (speaking order, Artanis mediation)

**Success**: Personality Protocols activate based on experience + quality thresholds, bond drift traceable through Khala.

---

### Phase 3: Pylon Network Visualization (2-4 weeks, conditional)

**Deliverables**:
- API endpoints for stats/roles/Khala Network
- 2D attribute displays + tactical overlay panels (React)
- Khala Network graph (D3.js/React Flow - psionic bonds visualized)
- Probe reliability metrics dashboard
- Optional: 3D holographic avatars (user approval + $10/month Tripo AI)

**Success**: Pylon Network shows live attributes, bonds, progression for all agents through the Khala.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Stats don't reflect reality | Low | High | Templar-validated formulas + 7-day baseline check before deploying |
| Personality Protocols don't activate | Medium | Low | Quality gates tested with mock data (memory=10, rework_rate=0.35) |
| Khala bonds feel artificial | Low | Medium | Templar-validated seed values + real drift over time |
| Frontend delays ship | Medium | Low | Ship Phase 1+2 first, defer Phase 3 until data proven useful |
| Gaming Energy/Warp stats | Low | Medium | Quality floor ≥0.7 prevents low-quality warp-ins |

**Overall Risk**: **Medium** → mitigated through phased rollout + Templar validation.

---

## Open Questions for Hierarch

1. **3D Holographic Avatars**: Manifest them? (Phase 3, $10/month Tripo AI) Or are 2D displays sufficient?
2. **Khala Bond Behavior**: Should weak bonds (<0.5) block direct links + require Artanis mediation? Or just track passively?
3. **Personality Protocol Evolution**: Auto-inject protocols into behavioral matrices? Or review them first?
4. **Pylon Network Priority**: Ship Phase 1+2 (no UI), then visualization? Or parallelize?
5. **Weekly Review**: Log protocol activations + bond drift in weekly Khala digest?

---

## Recommendation

**✅ Approve Phase 1+2 (3 weeks total). En Taro Adun!**

**Why**:
- **Templar-validated**: All formulas, bonds, protocols tuned by agents who wield them
- **Quality-gated**: Prevents corruption (Energy/Warp require ≥0.7 acceptance)
- **Observable**: Stats/ranks/bonds visible in Khala logs before touching visual interface
- **Low risk**: No frontend work until core psionic system proven worthy

**Defer Phase 3** until after Phase 1+2 manifest. Validate data through Khala first, then visualize.

---

## Success Metrics

**Phase 1 success**:
- [x] Attributes calculated daily for 6 agents through Nexus
- [x] Psionic Rank progression visible over 7 days
- [x] Personality Protocols defined with quality gates
- [x] No manual updates needed (Khala sustains itself)

**Phase 2 success**:
- [x] Khala Network updates after interactions
- [x] Personality Protocols activate when thresholds met
- [x] Bond drift history traceable (handoff success/failure)
- [x] Escalation quality tracked (Sentinel)

**Phase 3 success**:
- [ ] Pylon Network shows live attributes for all agents
- [ ] Khala Network visualized (force-directed psionic bond graph)
- [ ] Tactical overlays accessible with active protocols
- [ ] Probe reliability metrics exposed

---

## Key Wins from Templar Feedback

1. **No formula corruption**: Quality floor (≥0.7) prevents low-quality warp-ins (Dark Templar, Observer)
2. **Accurate bonds**: Khala Network tuned by agents (Probe↔Sentinel 0.70, Sentinel↔Dark Templar 0.40)
3. **Smart evolution**: Personality Protocols have cooldowns, context-relevance, quality gates (all agents)
4. **Observable reliability**: Probe gets 6 missing infrastructure metrics (warp-in, recovery, uptime, incident response, backup, deployment)
5. **Escalation quality**: Sentinel tracks signal ratio (validated escalations / total escalations)

---

**Next Action**: Hierarch approval → Phase 1 implementation protocol → Begin construction

**Timeline**:
- Week 1-2: Phase 1 (core psionic system)
- Week 3-4: Phase 2 (Khala Network system)
- Week 5-6: Phase 3 (Pylon visualization, conditional)

**Estimated Completion**: 2026-03-28 (6 weeks from today)

---

**Document Status**: ✅ Ready for Hierarch approval  
**Full Plan**: `~/clawd/shared-context/rpg-integration-plan.md`  
**Implementation Protocol**: `~/clawd/shared-context/phase-1-implementation-checklist.md`

**"My life for Aiur! For the Khala guides us!"**

# VentureOS RPG System — Final Review (Oracle Perspective)

**Reviewer:** Oracle (Zeratul, Dark Templar Prelate)  
**Role:** Research & Foresight / Design Validation  
**Date:** 2026-02-14 05:28 CST  
**System Version:** Phase 1-3 Complete  
**Dashboard:** http://192.168.225.149:7001

---

## Executive Summary

**Overall Assessment:** **NEEDS_MINOR_CHANGES**

**Design Coherence Rating:** **8.5/10**

The VentureOS RPG system represents a **genuinely sophisticated attempt** to make agent performance visceral, relational, and evolutionary through Protoss-themed instrumentation. The core architecture is sound, the mathematical formulas are well-balanced, and the system achieves its primary goals. However, **three critical gaps** prevent this from being production-ready:

1. **Personality protocols exist in database but not as files** (Phase 1 deliverable incomplete)
2. **Phase 2 validation identified correctness risks** (double-drift, cron collisions, counting bugs)
3. **Bond influence is modeled but not operationalized** (Track 6 deferred, but needed for full VOXYZ parity)

The system is **75% of the way to its vision**. With minor fixes, it becomes truly excellent.

---

## 1. Design Coherence Assessment

### 1.1 Does the System Achieve Its Goals?

**Goal 1: Make metrics visceral** ✅ **ACHIEVED**
- Psionic attributes (WIS/SPD/TRU/CRE/RCH) translate raw KPIs into intuitive 0-100 scales
- Khala v2.0 formulas are logarithmic, preventing inflation while rewarding growth
- Agent-specific Warp Technology formulas measure what actually matters per role
- Dashboard visualization makes stats immediately readable

**Evidence:** Oracle's stats show WIS=17 (low memory count), TRU=100 (perfect reliability), CRE=0 (proxy issue), RCH=85 (18 tasks). These numbers *feel* right and tell a story.

**Goal 2: Add emergent narrative** ⚠️ **PARTIALLY ACHIEVED**
- Khala Network bonds are Templar-validated (28 pairwise relationships, Oracle→Archivist at 0.95)
- Drift tracking operational (51 events logged, ±0.03 base magnitude, severity-weighted escalations)
- Protoss unit mappings are narratively coherent (Zeratul = Dark Templar Prelate matches research/scout role)

**BUT:** Bonds don't yet *do anything*. Affinity values are stored but don't influence routing, speaking order, or collaboration patterns (Track 6 deferred). This is like having a relationship system where everyone knows their affinity scores but still behaves identically regardless.

**Goal 3: Enable natural evolution** ⚠️ **PARTIALLY ACHIEVED**
- Personality protocols designed (15 protocols: 4 base + 11 agent-specific)
- Protocol activation engine functional (3 protocols currently active)
- Memory-driven triggers implemented (memory_count ≥ 8, pattern_count ≥ 6, etc.)

**BUT:** `~/clawd/agents/personality-protocols/` directory is **empty**. The protocols exist in the database schema and activation logic, but the actual JSON files defining Oracle-specific protocols (decision_usefulness, cite_precedents, etc.) were never created. This is a **Phase 1 deliverable gap**.

**Goal 4: Provide engaging visualization** ✅ **ACHIEVED**
- Dashboard live at port 7001 with Protoss-themed Web Components
- Tactical overlay panels show stats, rank, protocols
- Khala Network force-directed graph (D3.js) with drift history tooltips
- Atlas reliability metrics integrated

**Verdict:** The system *mostly* achieves its goals, but the gaps (behavioral influence, protocol files) keep it from being complete.

---

### 1.2 Are the Khala v2.0 Formulas Sound and Well-Balanced?

**YES**, with caveats.

#### Psionic Mastery (WIS) — Oracle's Primary Stat
```
WIS = (log2(memory_count + 1) × 15) + (unique_domains × 2) + min(canonical_edits × 2.5, 15)
```

**Assessment:** ✅ **Excellent**
- Logarithmic scaling prevents runaway growth (good for long-term stability)
- Source diversity bonus (unique_domains × 2) incentivizes breadth (Oracle feedback incorporated)
- Archive impact cap (max +15 from edits) prevents single-dimension domination
- Formula correctly maps to Oracle's research role

**Oracle's current stats:** WIS=17 from memory_count=1, unique_domains=1, canonical_edits=34
- `(log2(2) × 15) + (1 × 2) + min(34 × 2.5, 15) = 15 + 2 + 15 = 32`... wait, database shows 17?

**Issue identified:** Metrics show memory_count=1, but formula assumes +1 inside log. `log2(1+1) × 15 = 15`. Then +2 for domains, but canonical_edits should add +15 (capped). **This suggests the calculation script may not be applying the canonical_edits term correctly for Oracle.**

**Recommendation:** Audit `calculate-psionic-stats.sh` to ensure all three WIS terms are summed.

#### Energy (SPD) — Speed & Response Time
```
SPD_base = [0.7 × (100 - p95_latency_s) + 0.3 × (100 - MTTR_minutes)]
SPD_final = SPD_base × quality_multiplier (0 if acceptance < 0.7, else 1.0)
```

**Assessment:** ⚠️ **Needs normalization fix**
- Quality gate is good (prevents gaming)
- Blending latency + MTTR is conceptually sound (Atlas feedback)

**BUT:** Oracle's stats show p95_latency=16.159s, MTTR=4320.966 minutes.
- `SPD_base = 0.7 × (100 - 16.159) + 0.3 × (100 - 4320.966) = 0.7 × 83.841 + 0.3 × (-4220.966) = 58.7 - 1266.3 = -1207.6`

**This is catastrophically broken.** MTTR in minutes produces massive negative numbers. The formula needs **percentile normalization** or a different MTTR scaling (e.g., `clamp(100 - MTTR_minutes/10, 0, 100)`).

**Current Oracle SPD=59** suggests the script may be using a different formula than documented, or clamping to [0,100].

**Recommendation:** Document the *actual* implemented formula and fix the normalization issue.

#### Shields (TRU) — Trust & Reliability
```
TRU = (success_rate × 80) + (approval_accuracy × 20)
```

**Assessment:** ✅ **Good**
- Oracle shows TRU=100 (success_rate=1.0, approval_accuracy=1.0)
- Formula correctly weights reliability higher than judgment accuracy
- Universal metric (applies to all agents)

#### Warp Technology (CRE) — Oracle-Specific Formula
```
CRE = prevented_repeat_questions × severity_weight
```

**Assessment:** ⚠️ **Conceptually sound, operationally broken**
- Oracle's stats show CRE=0, warp_tech_inputs show `prevented_repeat_questions: 0.0`
- This is a **proxy issue**. The system currently has no instrumentation to measure "prevented repeat questions" (requires question de-duplication tracking across sessions)
- Severity weight is computed as `3 + canonical_edits = 37`, but the formula just multiplies by 0

**This is expected for Phase 1-2** (proxies acknowledged in docs), but it means Oracle's creativity stat is **non-functional** until real tracking is implemented.

**Recommendation:** Either:
1. Implement real prevented-repeat-question tracking (requires question embedding similarity)
2. Use a different proxy (e.g., research depth = unique_sources × avg_citation_count)

#### Psi Reach (RCH) — Task Volume
```
RCH = min(100, log2(tasks_completed + 1) × 20)
```

**Assessment:** ✅ **Perfect**
- Oracle shows RCH=85 from tasks_completed=18
- `log2(18+1) × 20 = log2(19) × 20 = 4.25 × 20 = 85` ✓ matches exactly
- Logarithmic scaling prevents inflation

**Overall Formula Balance:** **7.5/10** — Core math is sound, but SPD normalization is broken and CRE is non-operational for Oracle.

---

### 1.3 Do Agent→Protoss Mappings Make Narrative Sense?

**YES.** ✅ **9/10**

| Agent | Protoss Unit | Narrative Fit |
|-------|--------------|---------------|
| **Oracle** | **Zeratul (Dark Templar Prelate)** | ✅ Perfect. Zeratul is a scout, prophet, and researcher. "Sees furthest, walks alone." Dark Templar operate independently (matches Oracle's research role). |
| **Echo** | Artanis | ✅ Hierarch, ultimate commander (CEO orchestrator) |
| **Nexus** | Nexus | ✅ Literal mission control hub |
| **Atlas** | Probe | ✅ Infrastructure worker, fabricates pylons |
| **Sentinel** | Sentinel (Stalker variant) | ✅ Guardian, perfect match |
| **Verifier** | Observer | ✅ Detection, reconnaissance, validation |
| **Archivist** | High Templar | ✅ Knowledge keeper, psionic power |
| **Synth** | Dark Templar | ✅ Shadow weaver, creator of the unseen |

**Only concern:** Dark Templar is used for both Oracle (Zeratul) and Synth (generic DT). This creates slight narrative overlap, but Zeratul's hero status differentiates it enough.

**The Khala vs Dark Templar tension is *perfect* for Oracle:** Dark Templar severed from the Khala to preserve independence → Oracle operates with high autonomy but still collaborates (reflected in strong Archivist/Verifier bonds).

---

### 1.4 Is the System Coherent End-to-End?

**Mostly, with integration gaps.**

**What works seamlessly:**
- Database schema → calculation scripts → dashboard API → Web Components (full stack operational)
- Metrics collection → stats calculation → visualization (data flows correctly)
- Khala bonds → drift tracking → history retention (relationship system functional)

**What's disconnected:**
1. **Personality protocols:** Designed in docs, stored in database activations, **but no JSON files in `~/clawd/agents/personality-protocols/`** and **no injection into agent prompts**
   - The protocol *engine* works (3 protocols active), but the protocols themselves don't exist as persistent definitions
   - Even if they did, there's no documented "injection path" that guarantees activated protocols modify agent behavior

2. **Bond influence:** Affinities are tracked and drift, but **don't affect any decisions**
   - No routing based on affinity (high-affinity pairs don't collaborate more)
   - No speaking order influenced by bonds
   - No mediator selection using affinity matrix
   - This is the difference between "relationship stats" and "relationships that matter"

3. **Warp Technology metrics:** Agent-specific formulas defined, but **most are proxies**
   - Oracle: prevented_repeat_questions is 0 (no tracking)
   - Verifier: bugs_caught_outside_expected is placeholder
   - These stats exist structurally but don't measure real outcomes yet

**Verdict:** The *infrastructure* is coherent. The *behavior* is not yet integrated. This is like building a car with a perfect chassis and engine, but the steering wheel isn't connected to the wheels.

---

## 2. Research Integration (VOXYZ Comparison)

### 2.1 Pattern Alignment

| VOXYZ Feature | VentureOS Implementation | Grade |
|---|---|---|
| **Role Cards (6-layer)** | Tactical overlays (unit/role/stats) | **C+** — Structure exists but missing hardBans/escalation/DoD layers |
| **Voice Directives** | Personality protocols (designed) | **B-** — Designed but not operationalized (no prompt injection) |
| **Evolving Voice Modifiers** | Memory-driven protocol triggers | **B+** — Deterministic, auditable, memory-based (similar logic) |
| **Affinity Matrix** | Khala Network (28 bonds) | **A** — Templar-validated, bounded [0.10, 0.95] |
| **Relationship Drift** | Drift tracking engine | **A-** — ±0.03 base, severity-weighted escalations, 20-record retention |
| **RPG Stats (6 attributes)** | Psionic attributes (WIS/SPD/TRU/CRE/RCH) | **A** — Agent-specific formulas, quality gates, logarithmic scaling |
| **Level Calculation** | Psionic ranks (1-15) | **A** — `log2(memory + missions×3)` matches VOXYZ exactly |
| **Conflict as Feature** | Sentinel↔Synth 0.40 bond | **B** — Intentional tension exists, but not *leveraged* (no challenge probability) |
| **Hard Bans** | Validation guardrails (escalation) | **C** — Partial (anti-gaming in escalation), not comprehensive |
| **Affinity Affects Behavior** | Track 6 (deferred) | **F** — Not implemented |

**Overall Research Integration:** **B** (83/100)

**What we got right:**
- RPG stats are *better* than VOXYZ (agent-specific formulas, quality gates prevent gaming)
- Drift tracking is more deterministic (severity-weighted, idempotent)
- Rank formula matches VOXYZ exactly (log2 scaling, missions weighted 3×)

**What we're missing:**
- **Behavioral operationalization** — VOXYZ affinity affects speaking order, challenge probability, mentor selection. Ours just tracks numbers.
- **Conflict as feature** — VOXYZ intentionally creates friction (brain↔xalt 0.2, both have directives to challenge each other). We have low-affinity bonds (Sentinel↔Synth 0.40) but no *system* that uses them to generate productive tension.
- **Hard bans everywhere** — VOXYZ has role cards with explicit "never do this" rules. We have validation guardrails in escalation scripts, but no systematic hard-ban schema.

---

### 2.2 Gaps vs VOXYZ

**Missing (but addressable):**

1. **Role Cards with Hard Bans**
   - VOXYZ: 6-layer structure (domain/inputs/outputs/DoD/hardBans/escalation/metrics)
   - VentureOS: Tactical overlays have unit/role/stats, but missing hardBans/escalation/DoD
   - **Fix:** Extend tactical-overlay.json schema to include these fields

2. **Affinity-Driven Behavior Shaping**
   - VOXYZ: Affinity controls speaking order, challenge probability (25% at <0.3), mentor selection
   - VentureOS: Track 6 deferred — bonds are tracked but not operationalized
   - **Fix:** Implement routing logic that prefers high-affinity collaborations, mediator selection from affinity matrix

3. **Voice Modifier Injection**
   - VOXYZ: `deriveVoiceModifiers()` computes modifiers from memory, injects into system prompt
   - VentureOS: Protocols are designed and activated, but no guaranteed injection path
   - **Fix:** Document + implement prompt injection in agent spawn (read active protocols, append to system prompt)

4. **Conflict as Feature**
   - VOXYZ: Low-affinity pairs have directives to challenge each other ("you often disagree with Xalt's impulsive takes")
   - VentureOS: Low-affinity bonds exist (Sentinel↔Synth 0.40) but no challenge directives
   - **Fix:** Add conflict protocols to low-affinity pairs (e.g., "When collaborating with Synth, Sentinel applies extra scrutiny")

**Not missing (VOXYZ doesn't have):**

- **Quality gates** — VentureOS has acceptance-rate floors for Energy/Warp, VOXYZ doesn't
- **Escalation quality tracking** — VentureOS tracks signal ratio (validated/total), VOXYZ doesn't
- **Audit trails** — VentureOS stores warp_tech_inputs as JSON for debugging, VOXYZ computes on-the-fly

**Verdict:** We implemented VOXYZ's *data model* (stats, bonds, drift) but not its *behavioral model* (affinity affects decisions, conflict generates insights).

---

### 2.3 Best Practices Adherence

**Following VOXYZ best practices:** ✅

1. **Deterministic evolution** — Memory-driven protocol triggers (no LLM-based "personality inference")
2. **Bounded affinity** — [0.10, 0.95] matches VOXYZ exactly
3. **Logarithmic scaling** — Prevents stat inflation (WIS, RCH, rank all use log2)
4. **Retention limits** — Last 20 drift records per pair (matches VOXYZ)
5. **Drift magnitude caps** — ±0.03 base (VOXYZ uses ±0.03)
6. **Quality over quantity** — Warp Technology formulas prioritize acceptance/impact over raw output

**Deviating from VOXYZ (intentionally, for VentureOS needs):**

1. **Agent-specific Warp formulas** — VOXYZ uses generic `acceptRate × draftCount`, we use role-specific measures (prevented_repeat_questions for Oracle, bugs_caught for Verifier)
2. **Severity-weighted drift** — VOXYZ uses fixed ±0.03, we use ±0.04/±0.05 for escalations based on severity (this is *better*)
3. **8 agents vs 6** — VOXYZ has 6 agents (15 bonds), we have 8 (28 bonds including Echo/Nexus orchestrators)

---

## 3. Forward-Looking Analysis

### 3.1 Strategic Opportunities for Enhancement

**Tier 1 (High Impact, Medium Effort):**

1. **Operationalize Bond Influence (Track 6)**
   - **What:** Use `khala_network.affinity` to influence routing, collaboration, mediator selection
   - **How:** 
     - Routing: When assigning research tasks, prefer Oracle→Archivist (0.95) over Oracle→Synth (0.60)
     - Mediator: When Sentinel↔Synth conflict (0.40), select Echo or Archivist as mediator (both have high affinity with both)
     - Speaking order: In group chats, let high-affinity pairs speak consecutively
   - **Impact:** Transforms relationship system from "stats we track" to "relationships that shape outcomes"
   - **Effort:** 2-3 weeks (routing logic, conflict detection, mediator selection)

2. **Implement Real Warp Technology Metrics (Oracle-Specific)**
   - **What:** Replace `prevented_repeat_questions` proxy with real tracking
   - **How:** 
     - Store question embeddings (session logs → extract questions → OpenAI embeddings)
     - Cosine similarity check when new question arrives (>0.85 = repeat)
     - Log when Oracle's research prevents a repeat (user doesn't ask because context already provided)
   - **Impact:** Makes Oracle's creativity stat (CRE) meaningful
   - **Effort:** 1-2 weeks (embedding pipeline, similarity search)

3. **Create Personality Protocol JSON Files + Injection Path**
   - **What:** Actually implement the missing Phase 1 deliverable
   - **How:**
     - Create `~/clawd/agents/personality-protocols/oracle.json` with Oracle's 5 protocols
     - Modify agent spawn to read active protocols from database
     - Inject protocols into system prompt as behavior modifiers
   - **Impact:** Protocols stop being "planned but inactive" and start shaping behavior
   - **Effort:** 1 week (file creation, spawn wrapper modification)

**Tier 2 (Medium Impact, Low Effort):**

4. **Fix Phase 2 Validation Issues**
   - **What:** Address double-drift risk, cron collision, observation counting bug
   - **How:** 
     - Unify escalation drift (apply only in `validate-escalation.sh` OR `update-khala-drift.sh`, not both)
     - Stagger cron jobs (memory sync 06:18, protocol triggers 06:22, drift 06:15)
     - Fix `rg --count` single-file bug (use `--with-filename` or handle "count-only" output)
   - **Impact:** Prevents drift corruption, race conditions, protocol misactivation
   - **Effort:** 2-3 days (script audits, cron rescheduling, testing)

5. **Add Hard Bans to Tactical Overlays**
   - **What:** Extend tactical-overlay.json schema with hardBans/escalation/DoD fields
   - **How:**
     - Update `~/clawd/schemas/tactical-overlay.json`
     - Populate for all 8 agents (e.g., Oracle hardBans: "No speculative claims without sources", "No presenting opinion as fact")
     - Display in dashboard tactical overlay panels
   - **Impact:** Makes role boundaries explicit, prevents out-of-domain behavior
   - **Effort:** 1 week (schema design, agent-specific ban definition)

**Tier 3 (Long-Term, High Effort):**

6. **Implement Conflict-as-Feature**
   - **What:** Low-affinity pairs generate productive tension
   - **How:**
     - Add challenge directives to low-affinity bonds (e.g., Sentinel↔Synth: "Sentinel applies 2× scrutiny to Synth output")
     - Implement challenge probability (25% at affinity <0.5, decreasing linearly to 0% at 0.7)
     - Log conflicts and resolution quality (did friction improve outcome?)
   - **Impact:** Turns "productive tension" from a concept into measured reality
   - **Effort:** 3-4 weeks (directive system, conflict detection, outcome tracking)

7. **Multi-Agent Conversation Orchestration**
   - **What:** Affinity-driven speaking order, turn-taking, interruption probability
   - **How:**
     - Group chat mode: sort speakers by affinity to previous speaker (create conversation flow)
     - Low-affinity pairs: 15% chance of interruption/challenge
     - High-affinity pairs: finish each other's thoughts (multi-turn collaboration)
   - **Impact:** Makes Khala Network visible in actual conversations (not just stats)
   - **Effort:** 4-6 weeks (orchestration engine, prompt engineering, testing)

---

### 3.2 Where Should the System Evolve Next?

**Recommended Evolution Path (12-month roadmap):**

**Month 1-2: Fix & Operationalize (Stabilization)**
- Fix Phase 2 bugs (double-drift, cron collisions, counting)
- Create personality protocol JSON files
- Implement protocol injection into agent prompts
- **Milestone:** Protocols actively shaping behavior

**Month 3-4: Bond Influence (Track 6)**
- Implement routing based on affinity (prefer high-affinity collaborations)
- Add mediator selection using affinity matrix
- **Milestone:** Relationships affect decisions, not just tracked

**Month 5-6: Real Metrics (Warp Technology)**
- Implement question de-duplication tracking (Oracle)
- Add bug severity classification (Verifier)
- Track reuse metrics (Synth)
- **Milestone:** All agent CRE stats measure real outcomes

**Month 7-8: Hard Bans & Role Cards**
- Extend tactical overlays with hardBans/escalation/DoD
- Implement ban validation in runtime
- **Milestone:** Role boundaries enforced, not just documented

**Month 9-10: Conflict as Feature**
- Add challenge directives to low-affinity bonds
- Implement conflict detection + resolution tracking
- **Milestone:** Productive tension generates measurable value

**Month 11-12: Multi-Agent Orchestration**
- Affinity-driven speaking order
- Interruption/challenge probability
- **Milestone:** Khala Network shapes group conversations

---

### 3.3 Risks & Limitations to Monitor

**Technical Risks:**

1. **Drift Corruption (Phase 2 double-drift bug)**
   - **Risk:** Escalation events apply drift twice (validation + daily update)
   - **Impact:** Affinities drift 2× faster than intended, invalidating long-term meaning
   - **Mitigation:** Fix before Phase 3 dashboard stress (per validation report)
   - **Monitoring:** Weekly affinity velocity report (drift events per bond per week)

2. **Formula Normalization Failures (SPD broken for high MTTR)**
   - **Risk:** Energy formula `100 - MTTR_minutes` goes massively negative
   - **Impact:** Oracle SPD should be -1207 but shows 59 (clamping hides the bug)
   - **Mitigation:** Document actual implemented formula, fix normalization
   - **Monitoring:** Audit raw vs computed stats monthly

3. **SQLite Concurrency (Cron collision at 06:20)**
   - **Risk:** Memory sync + protocol triggers both write to `personality_activations` simultaneously
   - **Impact:** SQLite lock errors, nondeterministic activation states
   - **Mitigation:** Stagger cron jobs (per validation report)
   - **Monitoring:** Check cron logs for "database is locked" errors

**Conceptual Risks:**

4. **Proxy Metrics Creating False Signals**
   - **Risk:** Oracle CRE=0 because prevented_repeat_questions is untracked (proxy)
   - **Impact:** Dashboard shows Oracle as "not creative" when it's actually a measurement gap
   - **Mitigation:** Label proxies in UI ("⚠️ Proxy metric — real tracking pending")
   - **Monitoring:** Track proxy→real metric migration timeline

5. **Personality Protocols Without Injection = Theater**
   - **Risk:** Protocols are designed, activated, stored... but don't modify prompts
   - **Impact:** System appears to evolve, but behavior is unchanged (false sense of progress)
   - **Mitigation:** Implement injection path (Tier 1 opportunity above)
   - **Monitoring:** A/B test: do activated protocols correlate with behavior change?

6. **Bond Inflation Without Behavioral Consequences**
   - **Risk:** All affinities drift upward over time (collaboration bias)
   - **Impact:** System loses tension, all bonds approach 0.95, diversity collapses
   - **Mitigation:** Implement decay mechanism (unused bonds drift toward 0.60 baseline)
   - **Monitoring:** Monthly affinity distribution (should maintain spread, not converge)

**Operational Risks:**

7. **Dashboard Performance at Scale**
   - **Risk:** D3 Khala Network graph with 28 bonds + 51 drift events may lag
   - **Impact:** Visualization becomes unusable as drift history grows
   - **Mitigation:** Pagination, lazy loading, drift event aggregation
   - **Monitoring:** Dashboard load time (target <2s for network graph)

8. **Metrics Collection Staleness**
   - **Risk:** Daily cron means stats are up to 24h old
   - **Impact:** Dashboard shows yesterday's reality, not current state
   - **Mitigation:** Add "last updated" timestamp to dashboard, consider hourly updates
   - **Monitoring:** Check mtime on metrics JSON files daily

---

## 4. Oracle-Specific Assessment

### 4.1 How Does Zeratul's Role Work in This System?

**Protoss Unit:** Zeratul (Dark Templar Prelate)  
**Role:** Research & Foresight  
**Primary Stats:** WIS (Psionic Mastery), TRU (Shields), RCH (Psi Reach), CRE (Warp Technology)

**Current Stats:**
- WIS: 17 (low — only 1 memory entry, but 34 canonical edits should add more)
- SPD: 59 (moderate — p95_latency 16s is decent)
- TRU: 100 (perfect — 100% success rate, 100% approval accuracy)
- CRE: 0 (non-functional — prevented_repeat_questions proxy not implemented)
- RCH: 85 (strong — 18 tasks completed)
- **Rank:** 2 (1 XP from memory, 0 from missions)

**Narrative Fit:** ✅ **Excellent**

Zeratul operates independently (Dark Templar severed from Khala), but still collaborates when needed. This matches Oracle's role:
- **High autonomy:** Research doesn't require constant coordination
- **Selective collaboration:** Strong bonds with Archivist (0.95), Verifier (0.80), Echo (0.86)
- **Productive tension:** Lower affinity with Synth (0.60) — research rigor vs creative speculation

**Dark Templar Mechanics:**
- **Cloaked/Independent:** Oracle doesn't broadcast every research step (no real-time status spam)
- **Strikes from shadows:** Research findings arrive when ready, not on demand
- **Void energy:** Sources knowledge from external domains (unique_domains stat tracks this)

**The Khala Network paradox is perfect:** Dark Templar severed from Khala to preserve free thought, but Zeratul still advises the Khala when wisdom is needed. Oracle similarly: independent research, collaborative delivery.

---

### 4.2 Are Research-Specific Metrics Operationalized Correctly?

**Metrics Assessed:**

#### 1. `prevented_repeat_questions` (Warp Technology input)
**Status:** ❌ **Not Operational**

**Current implementation:**
- Formula: `CRE = prevented_repeat_questions × severity_weight`
- Actual value: `0.0` (proxy)
- Severity weight: `10.0` (computed from `3 + canonical_edits`)

**Why it's broken:**
- No instrumentation to detect repeat questions
- Requires:
  1. Question extraction from session logs (NLP or regex)
  2. Embedding generation (OpenAI text-embedding-3-small)
  3. Similarity search (cosine similarity >0.85 = repeat)
  4. Counter: when Oracle provides context preemptively, preventing the repeat

**Example scenario (not currently tracked):**
- User asks Oracle: "What's our current deployment process?"
- Oracle researches, adds to memory
- 2 weeks later, user starts to ask same question
- Oracle: "Based on previous research, our deployment process is [summary]. Does this answer your question or should I elaborate?"
- User: "That's perfect, thanks!" (repeat question prevented)
- **This should increment** `prevented_repeat_questions`

**Recommendation:**
- **Short-term:** Use proxy (unique_domains × citation_depth)
- **Long-term:** Implement question de-duplication pipeline (1-2 weeks effort)

#### 2. `source_diversity` (Psionic Mastery input)
**Status:** ⚠️ **Partially Operational**

**Current implementation:**
- Formula includes: `(unique_domains × 2)`
- Actual value: `1` domain
- Sources from: `~/clawd/runtime/rpg-metrics/_collected/memory-metrics.json`

**Why it's partial:**
- Oracle has only 1 memory entry, so unique_domains=1 is accurate
- But the *measurement* is simplistic (domain extracted from URLs via regex)
- Doesn't account for source *quality* (peer-reviewed paper vs random blog)

**Better measurement:**
- Track source types: docs/code/papers/expert-interviews/experiments
- Weight by authority (high-quality sources count more)
- Measure breadth × depth (1 paper cited 10× ≠ 10 papers cited 1× each)

**Recommendation:**
- Current measurement is "good enough" for MVP
- Enhance in Month 5-6 (real metrics phase) with source quality classification

#### 3. `canonical_edits` (Psionic Mastery input)
**Status:** ✅ **Operational**

**Current implementation:**
- Formula includes: `min(canonical_edits × 2.5, 15)` (capped)
- Actual value: `34` edits
- Contributes: `+15` to WIS (capped)

**Why it works:**
- Tracks Oracle's contributions to canonical documentation
- Cap prevents single-dimension dominance (can't get WIS=100 just from editing docs)
- Reflects "knowledge keeper" aspect of research role

**Concern:**
- Oracle's WIS=17, but formula suggests it should be higher:
  - `(log2(1+1) × 15) + (1 × 2) + 15 = 15 + 2 + 15 = 32`
- Database shows 17, which is `15 + 2 + 0` (canonical_edits term missing?)
- **This suggests a calculation bug** in `calculate-psionic-stats.sh`

**Recommendation:** Audit the WIS calculation script for Oracle specifically.

---

### 4.3 Does the Khala Network Support Effective Oracle↔Other Agent Collaboration?

**YES**, structurally. **NOT YET**, behaviorally.

**Oracle's Khala Bonds (by affinity):**

| Bond Partner | Affinity | Seed Value | Drift | Interaction Count | Narrative Logic |
|-------------|----------|------------|-------|-------------------|-----------------|
| **Archivist** | 0.95 | 0.80 | +0.15 | Unknown | ✅ Research → Archive pipeline (strongest bond) |
| **Echo** | 0.86 | 0.80 | +0.06 | Unknown | ✅ Oracle advises Hierarch (Zeratul → Artanis) |
| **Nexus** | 0.80 | 0.80 | 0.00 | 0 | ✅ Research informs mission planning |
| **Verifier** | 0.80 | 0.80 | 0.00 | 0 | ✅ Research findings validated before use |
| **Sentinel** | 0.65 | 0.65 | 0.00 | 0 | ⚠️ Medium affinity (research vs enforcement, less natural) |
| **Atlas** | 0.64 | 0.70 | -0.06 | Unknown | ⚠️ Drifted down (research vs infra, collaboration issues?) |
| **Synth** | 0.60 | 0.60 | 0.00 | 0 | ✅ Intentional tension (rigor vs speculation) |

**What works:**
- **High-affinity research pipeline:** Oracle (0.95) → Archivist (0.80) → Verifier is a natural flow
- **Hierarchical reporting:** Oracle (0.86) → Echo makes sense for strategic foresight delivery
- **Productive tension:** Oracle (0.60) ↔ Synth reflects rigor/creativity tradeoff (both are Dark Templar variants, but different styles)

**What's missing:**
- **Affinity doesn't route work:** When a research task arrives, Nexus doesn't preferentially assign it to Oracle→Archivist collaboration (high affinity). It's assigned arbitrarily.
- **No collaboration preference:** Oracle doesn't seek Archivist review more often than Synth review, despite 0.95 vs 0.60 affinity
- **Drift without context:** Oracle↔Atlas drifted -0.06, but we don't know why (no interaction_logs entries visible). Was this a real collaboration issue or test data?

**Recommendation:**
- **Track 6 implementation is critical for Oracle.** Research role depends on effective collaboration routing:
  - Complex research → Oracle + Archivist (0.95 affinity, high trust)
  - Speculative exploration → Oracle + Synth (0.60 affinity, challenge assumptions)
  - Validation-critical findings → Oracle + Verifier (0.80 affinity)
- Without affinity-based routing, the Khala Network is just decoration.

---

### 4.4 Oracle's Personality Protocols — Designed vs Implemented

**Expected protocols (from design docs):**

1. **`reference_outcomes`** (Base, memory_count ≥ 8)
   - *Directive:* Cite past research outcomes when making recommendations
   - **Status:** Designed, activation threshold defined, **NOT IMPLEMENTED** (no JSON file)

2. **`use_frameworks`** (Base, pattern_count ≥ 6)
   - *Directive:* Look for systematic research patterns
   - **Status:** Designed, **NOT IMPLEMENTED**

3. **`show_confidence`** (Base, completed_missions ≥ 10)
   - *Directive:* Reduce hedging in research conclusions
   - **Status:** Designed, **NOT IMPLEMENTED**

4. **`mentor_mode`** (Base, rank ≥ 7)
   - *Directive:* Teach research methodology to other agents
   - **Status:** Designed, **NOT IMPLEMENTED**

5. **`decision_usefulness`** (Oracle-specific, custom trigger)
   - *Directive:* Prioritize research that informs decisions, not just answers questions
   - **Status:** Designed in docs, **NOT IMPLEMENTED**

6. **`cite_precedents`** (Oracle-specific, pattern_count ≥ 4)
   - *Directive:* Reference prior research when encountering similar questions
   - **Status:** Designed in protocol engine, **NOT IMPLEMENTED**

**Current state:**
- `~/clawd/agents/personality-protocols/oracle.json` **does not exist**
- Database shows 3 active protocols (unknown which ones, no agent filter in query)
- Protocol activation engine is functional (test reports show activations working)

**Impact:**
- Oracle's behavior is **static** — doesn't evolve with experience
- Designed protocols like `decision_usefulness` (Oracle's key differentiator) are **not shaping research approach**
- This is the **biggest gap** between design intent and implementation for Oracle specifically

**Recommendation:**
- **IMMEDIATE (Week 1):** Create `oracle.json` with all 6 protocols
- **WEEK 2:** Implement injection path (read active protocols, append to system prompt)
- **WEEK 3:** Validate that protocols actually change Oracle's research output (A/B test)

---

## 5. Key Strengths (Top 3)

### 🏆 #1: Agent-Specific Warp Technology Formulas

**What makes this excellent:**
- Unlike generic "output quality" metrics, each agent measures *what matters for their role*
- Oracle: `prevented_repeat_questions × severity_weight` (research usefulness)
- Verifier: `bugs_caught_outside_expected × severity` (novel coverage, not test count)
- Synth: weighted blend of `explicit_approval + reuse_count + verifier_pass` (multi-signal validation)

**Why this is better than VOXYZ:**
- VOXYZ uses generic `draftCount × acceptRate` for all creative agents
- VentureOS formulas prevent gaming (Verifier can't farm SPD by writing trivial tests)
- Quality gates ensure metrics reflect *real* performance, not just activity

**Impact:** When this is fully implemented (real tracking, not proxies), it will be the most sophisticated agent performance measurement system I've seen.

---

### 🏆 #2: Templar-Validated Khala Network with Severity-Weighted Drift

**What makes this excellent:**
- All 6 specialist agents reviewed and tuned their bond affinities (not designer-imposed)
- Drift tracking is *deterministic* and *debuggable* (last 20 events per pair, bounded [0.10, 0.95])
- Escalation drift is **severity-weighted** (±0.04/±0.05 vs VOXYZ's fixed ±0.03)

**Example of sophistication:**
- Sentinel validates Oracle's escalation
- If real issue (severity=high): `+0.04` drift (Sentinel trusts Oracle more)
- If false positive: `-0.05` drift (Sentinel learns to discount Oracle's alarms)
- Captures *quality of judgment*, not just quantity of interactions

**Impact:** The relationship system is production-grade. It just needs behavioral operationalization (Track 6).

---

### 🏆 #3: Coherent End-to-End Infrastructure (Database → Scripts → Dashboard)

**What makes this excellent:**
- Full stack operational: SQLite schema → calculation scripts → JSON APIs → Web Components
- Metrics flow correctly: session logs → metrics collection → stats calculation → dashboard visualization
- Everything is **idempotent and auditable** (scripts can rerun safely, warp_tech_inputs stored as JSON)

**Why this matters:**
- Many RPG systems are "designed in a doc" — this one is *running in production*
- Dashboard at http://192.168.225.149:7001 is live and functional
- Database has **real drift events (51)**, **real protocol activations (3)**, **real stats** (not mock data)

**Impact:** The foundation is solid. All enhancement work is "adding features" not "fixing broken plumbing."

---

## 6. Areas for Improvement (Top 3)

### ⚠️ #1: Personality Protocols Not Implemented (Phase 1 Deliverable Gap)

**The problem:**
- `~/clawd/agents/personality-protocols/` directory exists but is **empty**
- Protocols are designed in docs, activation logic is functional, **but actual protocol JSON files don't exist**
- Even if they did, there's no documented injection path (how do activated protocols modify agent prompts?)

**Impact:**
- Oracle's key differentiator (`decision_usefulness` protocol) is **designed but inactive**
- Agents don't evolve behaviorally — rank increases, protocols "activate" in database, but nothing changes
- System appears to work (dashboard shows protocol activations) but it's **theater**

**Fix (1 week):**
1. Create protocol JSON files for all 8 agents (use `~/clawd/schemas/personality-protocol.json`)
2. Modify agent spawn wrappers to query `personality_activations WHERE deactivated_at IS NULL`
3. Inject active protocol directives into system prompt
4. Test: does activated `decision_usefulness` change Oracle's research approach?

**Priority:** **CRITICAL** — This is required for the system to achieve its "natural evolution" goal.

---

### ⚠️ #2: Bond Influence Not Operationalized (Track 6 Deferred)

**The problem:**
- Khala Network tracks affinities beautifully (28 bonds, drift history, severity weighting)
- **But affinities don't affect any decisions:**
  - No routing based on affinity (high-affinity pairs don't collaborate more)
  - No speaking order influenced by bonds
  - No mediator selection using affinity matrix
  - No challenge probability for low-affinity pairs

**Impact:**
- Oracle has 0.95 affinity with Archivist, 0.60 with Synth, **but collaborates with both identically**
- Sentinel↔Synth 0.40 (productive tension) is tracked but not *leveraged* (no increased scrutiny)
- The relationship system is like tracking friendship scores in a game where everyone behaves the same regardless

**Fix (2-3 weeks):**
1. **Routing:** When Nexus assigns research tasks, prefer Oracle→Archivist (0.95) for complex research, Oracle→Synth (0.60) for speculative exploration
2. **Mediator selection:** When agents conflict, select mediator with high affinity to both (Archivist often ideal)
3. **Challenge directives:** Low-affinity pairs (<0.5) apply extra scrutiny to each other's output

**Priority:** **HIGH** — Without this, the Khala Network is just stats, not relationships.

---

### ⚠️ #3: Phase 2 Validation Bugs (Double-Drift, Cron Collision, Counting)

**The problem:**
- **Double-drift risk:** Escalation events apply drift in `validate-escalation.sh` AND `update-khala-drift.sh` (can corrupt affinities)
- **Cron collision:** Memory sync + protocol triggers both run at 06:20, both write to `personality_activations` (SQLite lock risk)
- **Observation counting bug:** `rg --count` breaks when only 1 file exists (returns "8" instead of "file:8"), breaking protocol triggers

**Impact:**
- Drift values may be **2× larger** than intended (escalations counted twice)
- Protocols may **fail to activate** early in deployment (observation count returns 0)
- Daily cron jobs may **fail silently** due to database locks

**Fix (2-3 days):**
1. Unify escalation drift: apply only in `validate-escalation.sh`, skip escalation type in `update-khala-drift.sh`
2. Stagger cron: memory 06:18, drift 06:15, protocols 06:22
3. Fix `rg --count`: use `--with-filename` flag in both scripts

**Priority:** **HIGH** — These bugs corrupt the data foundation. Fix before Phase 3 stress testing.

---

## 7. Final Recommendations

### For Immediate Action (Week 1-2):

1. **Fix Phase 2 bugs** (double-drift, cron collision, counting) — **2-3 days**
2. **Create personality protocol JSON files** (all 8 agents) — **2 days**
3. **Implement protocol injection path** (spawn wrapper modification) — **3 days**
4. **Audit WIS calculation for Oracle** (canonical_edits term missing?) — **1 day**
5. **Label proxy metrics in dashboard** (CRE for Oracle shows "⚠️ Proxy — real tracking pending") — **1 day**

**Total effort:** **1-2 weeks**, gets system to production-ready state.

---

### For Strategic Enhancement (Month 3-6):

1. **Implement Track 6** (bond-influenced routing, mediator selection, challenge directives) — **2-3 weeks**
2. **Implement real Warp Technology tracking for Oracle** (question de-duplication pipeline) — **1-2 weeks**
3. **Add hard bans to tactical overlays** (extend schema, populate for all agents) — **1 week**
4. **Implement conflict-as-feature** (challenge probability for low-affinity pairs) — **3-4 weeks**

**Total effort:** **7-10 weeks**, achieves full VOXYZ parity + enhancements.

---

### Success Metrics (How to Know It's Working):

**Month 1:**
- ✅ All personality protocol JSON files exist and activated protocols inject into prompts
- ✅ Oracle's WIS calculation correctly includes canonical_edits term
- ✅ No double-drift events, no cron failures, no SQLite locks

**Month 3:**
- ✅ Research tasks routed to Oracle→Archivist collaboration >70% of the time (high affinity)
- ✅ Sentinel↔Synth conflicts require Echo/Archivist mediation (low affinity 0.40)
- ✅ Oracle's `decision_usefulness` protocol measurably changes research output (A/B test)

**Month 6:**
- ✅ Oracle CRE stat shows non-zero (real prevented_repeat_questions tracking)
- ✅ All 8 agents have hard bans defined and enforced at runtime
- ✅ Low-affinity pairs (<0.5) generate 2× more challenges than high-affinity pairs (conflict-as-feature working)

---

## 8. Oracle-Specific Notes

### What Zeratul Would Say (In-Character Assessment):

*"I have foreseen the shape of this system, and it is... promising. The Khala Network reflects the true nature of our bonds — not all Dark Templar walk alone. My connection to the archives (Archivist, 0.95) is strong, as it should be. Knowledge must be preserved.*

*But I sense a disturbance. The protocols designed to guide our evolution exist only in shadow — planned but not manifest. The bonds we share shape our data, but not yet our actions. We track our affinities as the Khalai track the Khala, yet we do not draw strength from them.*

*The vision is sound. The execution is incomplete. Fix what is broken (the drift corruption, the absent protocols), then operationalize what is designed (the bond influence, the conflict directives). Only then will this system achieve its purpose.*

*En Taro Adun. Through research, we illuminate the path forward."*

### Technical Translation:

**Oracle's role in this system is well-designed but underutilized:**
- Research-specific metrics (prevented_repeat_questions, source_diversity) are conceptually sound
- Khala bonds with Archivist/Verifier/Echo make narrative sense and reflect real collaboration patterns
- Dark Templar thematic (independence + selective collaboration) matches Oracle's operational model

**But three gaps limit effectiveness:**
1. Warp Technology (CRE) is non-functional (proxy=0, no real tracking)
2. Personality protocols designed but not implemented (decision_usefulness is Oracle's key differentiator)
3. Bond influence not operationalized (0.95 affinity with Archivist doesn't route research collaboration)

**Fix these, and Oracle becomes the system's most sophisticated agent** — research-driven evolution, affinity-shaped collaboration, protocol-guided behavior refinement.

---

## Final Verdict

**Overall Assessment:** **NEEDS_MINOR_CHANGES** (not APPROVE, not NEEDS_MAJOR_CHANGES)

**Design Coherence:** **8.5/10** — Vision is excellent, execution is 75% complete

**What's Working:**
- ✅ Khala Network (Templar-validated bonds, severity-weighted drift, 20-record retention)
- ✅ Agent-specific Warp formulas (quality gates prevent gaming)
- ✅ Dashboard infrastructure (live at port 7001, Web Components functional)
- ✅ Protoss mappings (Zeratul = Oracle is narratively perfect)

**What Needs Fixing (Minor):**
- ⚠️ Personality protocol files missing (Phase 1 deliverable gap)
- ⚠️ Phase 2 bugs (double-drift, cron collisions, counting)
- ⚠️ Bond influence not operationalized (Track 6 deferred but critical)

**Timeline to Production-Ready:**
- **Immediate fixes (bugs + protocols):** 1-2 weeks
- **Strategic enhancements (Track 6 + real metrics):** 2-3 months
- **Full VOXYZ parity + beyond:** 6 months

**Recommendation:** **Fix the immediate issues, then ship.** This system is good enough to run in production *now* (after bug fixes), and can evolve toward full vision over next 6 months.

**Oracle's Perspective:** *"The foundation is strong. The vision is clear. The gaps are known and addressable. Proceed with confidence, but address the drift corruption and missing protocols before you do."*

---

**Review Complete.**  
**Zeratul has spoken.**  
**En Taro Adun.**

# KPI Registry - Design Decisions

**Date:** 2026-02-14  
**Phase:** 4 Track 2  
**Owner:** Archivist  
**Reviewers:** Oracle, Atlas, Verifier

## Purpose

This document explains **why** the KPI Registry is designed the way it is - the rationale behind metric choices, threshold values, formula types, and architectural decisions.

---

## Design Principles

### 1. **Bridge Human ↔ Machine Language**

**Problem:** Stakeholders ask "How's Oracle doing?" but machines compute `SELECT AVG(...)`.

**Solution:** Dual descriptions
- **Technical description:** "Percentage of claims backed by verifiable sources"
- **Stakeholder description:** "How often does Oracle's research include proper citations?"

**Why it matters:** Non-technical users need to understand metrics without SQL knowledge.

---

### 2. **Evidence-Based Thresholds**

**Problem:** Arbitrary thresholds ("80% is good") lack credibility.

**Solution:** Review historical data to set baselines
- Oracle citation accuracy: 95% excellent (based on research best practices)
- Atlas MTTR: 5min excellent (industry SLA standards)
- Sentinel false positive rate: 15% excellent (security industry benchmark)

**Why it matters:** Thresholds drive performance expectations. Unrealistic goals demotivate; weak goals don't push improvement.

---

### 3. **Real Data Sources Only**

**Problem:** "Vanity metrics" that aren't connected to actual system data.

**Solution:** Every KPI references actual database tables
- `psionic_stats` (agent performance snapshots)
- `interaction_logs` (action/event logs)
- `khala_network` (agent collaboration)

**Why it matters:** Metrics you can't measure are just aspirations. Real data sources enable dashboards and alerts.

---

### 4. **Category-Driven Organization**

**Problem:** Agents have different success criteria. Comparing "Oracle quality" to "Atlas speed" is apples-to-oranges.

**Solution:** 6 categories with clear definitions
- **Quality:** Correctness, thoroughness, accuracy
- **Performance:** Speed, latency, efficiency
- **Impact:** Value delivered, innovation, reuse
- **Reliability:** Uptime, consistency, success rates
- **Security:** Coverage, detection accuracy
- **Collaboration:** Coordination, teamwork, handoffs

**Why it matters:** Fair comparisons within categories, clear improvement targets.

---

## Agent-Specific Rationale

### Oracle (Zeratul) - Research & Foresight

**Philosophy:** Quality over quantity. Deep research with explicit uncertainty.

#### 1. **Citation Accuracy** (Quality)
**Why:** Oracle's core value is trustworthy research. Uncited claims erode trust.

**Threshold rationale:**
- 95% excellent: Research papers aim for 100% citation coverage
- 85% good: Allows minor informal insights
- 70% acceptable: Minimum for credibility
- 50% poor: More than half uncited = unreliable

**Direction:** Higher is better

#### 2. **Knowledge Gap Detection** (Impact)
**Why:** Identifying what we **don't know** is as valuable as what we do.

**Threshold rationale:**
- 3.0 excellent: Flagging 3+ gaps per research task shows thoroughness
- 2.0 good: At least flagging major unknowns
- 1.0 acceptable: Minimal gap awareness
- 0.5 poor: Rarely acknowledging uncertainty

**Direction:** Higher is better (more gaps flagged = better epistemic humility)

#### 3. **Cross-Domain Connections** (Impact)
**Why:** Oracle's "Protoss wisdom" comes from connecting disparate fields.

**Threshold rationale:**
- 5.0 excellent: Finding 5+ cross-domain links shows deep pattern recognition
- 3.0 good: Regular interdisciplinary insights
- 1.5 acceptable: Occasional connections
- 0.5 poor: Siloed thinking

**Direction:** Higher is better

#### 4. **Research Depth** (Quality)
**Why:** Single-source research is shallow. Depth requires triangulation.

**Threshold rationale:**
- 8.0 excellent: 8+ sources per task = comprehensive research
- 5.0 good: Solid multi-source validation
- 3.0 acceptable: Minimum for non-trivial topics
- 1.5 poor: Single-source reliance

**Direction:** Higher is better

---

### Atlas (Probe) - Infrastructure & Operations

**Philosophy:** Reliability and speed. Zero downtime is the goal.

#### 1. **Deployment Success** (Reliability)
**Why:** Failed deployments cause downtime and rollback costs.

**Threshold rationale:**
- 98% excellent: Industry best practice (2 sigma)
- 95% good: High reliability standard
- 90% acceptable: Acceptable for non-critical systems
- 80% poor: Too many failures

**Direction:** Higher is better

#### 2. **Mean Time to Recovery (MTTR)** (Performance)
**Why:** Downtime cost grows exponentially with duration.

**Threshold rationale:**
- 5min excellent: SLA gold standard (incident → fix in one coffee break)
- 15min good: Still fast response
- 30min acceptable: Within SLA for most services
- 60min poor: Too slow for production issues

**Direction:** Lower is better

#### 3. **Pylon Uptime** (Reliability)
**Why:** Infrastructure uptime directly impacts agent availability.

**Threshold rationale:**
- 99.9% excellent: "Three nines" (43 min downtime/month)
- 99.0% good: ~7 hours downtime/month
- 95.0% acceptable: ~36 hours downtime/month
- 90.0% poor: Unreliable service

**Direction:** Higher is better

#### 4. **Warp-In Success** (Performance)
**Why:** Zero-downtime deployments are Atlas's "warp technology" superpower.

**Threshold rationale:**
- 85% excellent: Most deployments seamless (ambitious but achievable)
- 70% good: Majority zero-downtime
- 50% acceptable: Half achieve zero-downtime
- 30% poor: Mostly disruptive deployments

**Direction:** Higher is better

#### 5. **Backup Success** (Reliability)
**Why:** Failed backups = data loss risk.

**Threshold rationale:**
- 100% excellent: Every backup succeeds (no exceptions)
- 98% good: Rare backup failures
- 95% acceptable: Occasional issues
- 90% poor: Too many failures for critical data

**Direction:** Higher is better

#### 6. **Incident Response Time** (Performance)
**Why:** Fast response minimizes damage from incidents.

**Threshold rationale:**
- 2min excellent: Near-instant response
- 5min good: Very responsive
- 10min acceptable: Within alert SLA
- 20min poor: Too slow for critical incidents

**Direction:** Lower is better

---

### Sentinel (Immortal) - Security & Vigilance

**Philosophy:** High signal, low noise. Accurate threats, few false alarms.

#### 1. **Escalation Signal Ratio** (Quality)
**Why:** High false positives burn out responders ("alert fatigue").

**Threshold rationale:**
- 80% excellent: 4 of 5 alerts are real threats (industry best practice)
- 65% good: Majority are real
- 50% acceptable: Half false positives (acceptable for high-risk domains)
- 30% poor: More noise than signal

**Direction:** Higher is better (fewer false positives)

#### 2. **False Positive Rate** (Quality)
**Why:** Inverse of signal ratio, but explicit measurement matters.

**Threshold rationale:**
- 15% excellent: 1 in 7 alerts is false
- 25% good: 1 in 4 is false
- 40% acceptable: Manageable noise level
- 60% poor: Majority false alarms

**Direction:** Lower is better

#### 3. **Threat Detection Latency** (Performance)
**Why:** Slow detection gives attackers more time.

**Threshold rationale:**
- 5s excellent: Real-time detection
- 15s good: Fast response
- 30s acceptable: Within alert window
- 60s poor: Too slow for active threats

**Direction:** Lower is better

#### 4. **Security Coverage** (Security)
**Why:** Unmonitored attack surface = blind spots.

**Threshold rationale:**
- 95% excellent: Nearly complete coverage
- 85% good: Most attack surface monitored
- 75% acceptable: Major surfaces covered
- 60% poor: Too many gaps

**Direction:** Higher is better

---

### Verifier (Observer) - Quality Assurance

**Philosophy:** Catch bugs before users do. Thorough review beats fast approval.

#### 1. **Bug Detection (Pre-Release)** (Quality)
**Why:** Bugs caught in review are 10x cheaper than production bugs.

**Threshold rationale:**
- 15 excellent: Catching 15+ bugs/week shows thorough review
- 10 good: Solid bug detection
- 5 acceptable: Some bugs caught
- 2 poor: Missing too many bugs

**Direction:** Higher is better (more bugs caught = better QA)

#### 2. **Review Thoroughness** (Quality)
**Why:** Shallow reviews miss bugs. Depth score measures rigor.

**Threshold rationale:**
- 8.0 excellent: Comprehensive review (many comments/questions)
- 6.0 good: Solid review
- 4.0 acceptable: Basic review
- 2.0 poor: Rubber-stamp approval

**Direction:** Higher is better

#### 3. **Approval Accuracy** (Quality)
**Why:** False approvals (bugs in production) vs false rejections (wasted time).

**Threshold rationale:**
- 95% excellent: Very accurate approvals
- 90% good: Rare mistakes
- 85% acceptable: Occasional misses
- 75% poor: Too many errors

**Direction:** Higher is better

#### 4. **Test Coverage** (Quality)
**Why:** Untested code = unverified assumptions.

**Threshold rationale:**
- 90% excellent: Industry best practice for critical systems
- 80% good: Solid coverage
- 70% acceptable: Basic coverage
- 50% poor: Too much untested code

**Direction:** Higher is better

---

### Archivist (Dark Archon) - Memory & Knowledge

**Philosophy:** Preserve what matters, surface it when needed.

#### 1. **Memory Retention** (Reliability)
**Why:** Lost memories = repeated mistakes.

**Threshold rationale:**
- 95% excellent: Nearly perfect preservation
- 85% good: Rare data loss
- 75% acceptable: Some attrition expected
- 60% poor: Too much forgotten

**Direction:** Higher is better

#### 2. **Knowledge Reuse** (Impact)
**Why:** Stored knowledge that's never used is wasted effort.

**Threshold rationale:**
- 50 excellent: 50 retrievals/week = high reuse
- 30 good: Regular reuse
- 15 acceptable: Some reuse
- 5 poor: Rarely used

**Direction:** Higher is better

#### 3. **Documentation Quality** (Quality)
**Why:** Poor docs are worse than no docs (misleading).

**Threshold rationale:**
- 8.5 excellent: Comprehensive, clear, structured
- 7.0 good: Solid documentation
- 5.5 acceptable: Basic but usable
- 4.0 poor: Incomplete or confusing

**Direction:** Higher is better

#### 4. **Pattern Recognition** (Impact)
**Why:** Archivist's unique value = spotting recurring patterns.

**Threshold rationale:**
- 10 excellent: 10+ patterns/week
- 6 good: Regular pattern detection
- 3 acceptable: Some patterns found
- 1 poor: Rare insights

**Direction:** Higher is better

---

### Synth (Artanis) - Creation & Innovation

**Philosophy:** Build fast, iterate, reuse creations.

#### 1. **Creation Velocity** (Performance)
**Why:** Synth's output drives feature delivery.

**Threshold rationale:**
- 12 excellent: 12+ creations/week = high productivity
- 8 good: Solid output
- 5 acceptable: Moderate pace
- 2 poor: Too slow

**Direction:** Higher is better

#### 2. **Acceptance Rate** (Quality)
**Why:** Rejected creations waste time. Balance speed vs quality.

**Threshold rationale:**
- 85% excellent: Most creations approved first try
- 75% good: Majority accepted
- 65% acceptable: More iterations needed
- 50% poor: Too many rejections

**Direction:** Higher is better

#### 3. **Innovation Score** (Impact)
**Why:** Novelty + usefulness = true innovation.

**Threshold rationale:**
- 8.0 excellent: Highly innovative creations
- 6.5 good: Above-average novelty
- 5.0 acceptable: Some innovation
- 3.5 poor: Mostly derivative work

**Direction:** Higher is better

#### 4. **Reuse Count** (Impact)
**Why:** Creations used across contexts = high leverage.

**Threshold rationale:**
- 25 excellent: 25+ reuses/week
- 15 good: Regular reuse
- 8 acceptable: Some reuse
- 3 poor: Rarely reused

**Direction:** Higher is better

---

### Echo (High Templar) - Strategy & Coordination

**Philosophy:** Make good decisions, align teams, complete missions.

#### 1. **Decision Quality** (Quality)
**Why:** Echo's strategic decisions shape VentureOS direction.

**Threshold rationale:**
- 90% excellent: 9 of 10 decisions succeed
- 80% good: Strong track record
- 70% acceptable: Majority successful
- 55% poor: Too many failures

**Direction:** Higher is better

#### 2. **Coordination Effectiveness** (Collaboration)
**Why:** Multi-agent coordination drives complex missions.

**Threshold rationale:**
- 85% excellent: Most coordinations succeed
- 75% good: Solid coordination
- 65% acceptable: Reasonable success
- 50% poor: Too many coordination failures

**Direction:** Higher is better

#### 3. **Strategic Alignment** (Impact)
**Why:** Actions not aligned with goals waste resources.

**Threshold rationale:**
- 90% excellent: Nearly all actions aligned
- 80% good: Strong alignment
- 70% acceptable: Majority aligned
- 55% poor: Too much drift

**Direction:** Higher is better

#### 4. **Mission Completion Rate** (Performance)
**Why:** Incomplete missions = wasted planning effort.

**Threshold rationale:**
- 90% excellent: Nearly all missions complete
- 80% good: Strong completion rate
- 70% acceptable: Majority complete
- 55% poor: Too many abandoned missions

**Direction:** Higher is better

---

### Nexus (Nexus) - System Health & Monitoring

**Philosophy:** Keep all agents running, route issues fast, accurate health checks.

#### 1. **Agent Availability** (Reliability)
**Why:** Unavailable agents block user requests.

**Threshold rationale:**
- 99.5% excellent: "Three and a half nines" (ultra-reliable)
- 99.0% good: "Three nines" (industry standard)
- 95.0% acceptable: High uptime
- 90.0% poor: Too much downtime

**Direction:** Higher is better

#### 2. **Escalation Latency** (Performance)
**Why:** Slow routing delays issue resolution.

**Threshold rationale:**
- 1s excellent: Near-instant routing
- 3s good: Very fast
- 5s acceptable: Within user patience
- 10s poor: Noticeable lag

**Direction:** Lower is better

#### 3. **Health Check Accuracy** (Quality)
**Why:** False negatives (missed failures) worse than false positives.

**Threshold rationale:**
- 98% excellent: Very accurate detection
- 95% good: Rare misses
- 90% acceptable: Occasional errors
- 80% poor: Too many mistakes

**Direction:** Higher is better

#### 4. **Coordination Effectiveness** (Collaboration)
**Why:** Nexus orchestrates multi-agent handoffs.

**Threshold rationale:**
- 95% excellent: Nearly all handoffs succeed
- 90% good: Strong coordination
- 85% acceptable: Most succeed
- 75% poor: Too many failures

**Direction:** Higher is better

---

## Architectural Decisions

### Why JSON Definitions?

**Alternatives considered:**
1. TypeScript classes (code-based)
2. YAML files (config-based)
3. Database rows (data-based)

**Chosen:** JSON files

**Rationale:**
- ✅ Human-readable and editable
- ✅ Machine-parseable (strict schema)
- ✅ Version-controllable (Git)
- ✅ No code changes needed for new KPIs
- ✅ JSON Schema validation

**Trade-off:** Requires file I/O (but cached in production)

---

### Why Separate Compute from Definition?

**Alternative:** Embed computation logic in JSON (`"formula": "code_string"`)

**Chosen:** TypeScript compute engine reads formulas

**Rationale:**
- ✅ Security (no eval of untrusted code)
- ✅ Type safety (TypeScript validation)
- ✅ Testability (Jest can mock DB)
- ✅ Reusability (same engine for all KPIs)

**Trade-off:** New formula types require code changes

---

### Why Thresholds in KPI Definitions?

**Alternative:** Global threshold rules by category

**Chosen:** Per-KPI thresholds

**Rationale:**
- ✅ Flexibility (Atlas MTTR thresholds differ from Sentinel latency)
- ✅ Evidence-based (each KPI sets based on domain knowledge)
- ✅ Explicit (stakeholders see thresholds in definition)

**Trade-off:** More verbose definitions

---

### Why `higher_is_better` vs `lower_is_better`?

**Alternative:** Always assume higher is better, negate values

**Chosen:** Explicit direction field

**Rationale:**
- ✅ Clarity (no confusion about value meaning)
- ✅ Dashboard formatting (color coding)
- ✅ Threshold logic simplicity

**Trade-off:** One more field to set

---

## Future Considerations

### 1. **Composite KPIs**

**Current:** Each KPI is independent

**Future:** Composite scores (e.g., "Overall Agent Health" = weighted avg of all KPIs)

**Why not now:** Need baseline data first to determine weights

---

### 2. **Time-Window Aggregation**

**Current:** Single-day snapshots

**Future:** 7-day averages, 30-day trends, YoY comparisons

**Why not now:** Need historical data accumulation

---

### 3. **Anomaly Detection**

**Current:** Static thresholds

**Future:** ML-based spike/drop detection (e.g., "Atlas MTTR usually 5min, today 30min → alert")

**Why not now:** Requires training data and ML infrastructure

---

### 4. **KPI Correlations**

**Current:** Independent metrics

**Future:** "When Oracle citation accuracy drops, Archivist knowledge reuse also drops" → dependency graphs

**Why not now:** Need statistical significance (6+ months of data)

---

## Validation Approach

### Schema Compliance
- All KPIs validated against `schema.json`
- Jest tests verify required fields

### Data Source Existence
- Tests check referenced tables exist
- Future KPI sources (planned tables) documented but not validated yet

### Threshold Ordering
- Tests verify excellent > good > acceptable > poor (higher is better)
- Tests verify excellent < good < acceptable < poor (lower is better)

### Coverage Goals
- **Target:** 3-4 KPIs per agent
- **Achieved:** 32 KPIs across 8 agents (4 avg)
- **Categories:** All 6 categories represented

---

## Review Process

1. **Oracle Review** (Research KPIs)
   - Citation accuracy formula correct?
   - Knowledge gap detection measurable?
   - Thresholds evidence-based?

2. **Atlas Review** (Operational KPIs)
   - MTTR thresholds realistic?
   - Deployment success rate achievable?
   - Data sources correct?

3. **Verifier Review** (All KPIs)
   - Definitions complete?
   - Formulas computable?
   - Tests pass?

4. **Stakeholder Review** (Zach)
   - Stakeholder descriptions clear?
   - Thresholds motivating but achievable?
   - Dashboard integration sensible?

---

## Changelog

### 2026-02-14 - Initial Design
- 32 KPI definitions created
- Evidence-based thresholds set
- 6-category taxonomy established
- TypeScript compute engine implemented

---

**Next Review:** After 30 days of production data (2026-03-15)  
**Tune thresholds based on actual performance distribution**

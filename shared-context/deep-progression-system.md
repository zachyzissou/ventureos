# VentureOS Deep Progression System — Full Design Spec

**Date:** 2026-02-14  
**Status:** Design Phase  
**Implementation:** Phase 4.5+ (post-conversation system)  
**Inspiration:** RPG progression mechanics + VOXYZ character evolution

---

## Executive Summary

**Current system (Phase 3):**
- Max level 15 (log2 scaling)
- XP from: memory + missions
- No specialization, no unlocks, no growth choices

**Deep system (5-layer enhancement):**
1. **Extended levels (1-50+) + Prestige ranks** - Acolyte → Adept → Master → Grandmaster
2. **Skill trees** - 3-4 specialization paths per agent, 10-15 nodes each
3. **XP diversification** - 6 XP sources (memory, missions, collaboration, innovation, teaching, specialization)
4. **Level-gated features** - Unlock abilities, interactions, and mechanics as you progress
5. **Dynamic stat growth** - Choose stat bonuses every 5 levels, skill nodes grant passive boosts

**Goal:** Make agent progression feel meaningful, strategic, and deeply engaging. Each agent should feel unique based on choices made over time.

---

## 1. Level Progression System

### Level Curve (1-50)

**Formula:**
```
XP_needed(level) = floor(100 * (level^1.8))

Levels 1-10:  100, 262, 464, 700, 965, 1255, 1568, 1903, 2257, 2630
Levels 11-20: 3021, 3428, 3851, 4289, 4742, 5210, 5691, 6187, 6695, 7217
Levels 21-30: 7752, 8299, 8859, 9431, 10015, 10611, 11218, 11837, 12467, 13108
Levels 31-40: 13760, 14423, 15096, 15780, 16474, 17178, 17893, 18617, 19351, 20096
Levels 41-50: 20850, 21614, 22387, 23170, 23962, 24764, 25575, 26395, 27224, 28062
```

**Rationale:** 
- Early levels fast (encourages engagement)
- Mid-game slows (choices matter)
- Late-game requires sustained effort (prestige feels earned)

### Prestige Ranks

**Unlock at Level 50:**

| Prestige Rank | Unlock Requirement | Benefits |
|---------------|-------------------|----------|
| **Acolyte** | Reach Level 50 | +10 stat ceiling, +1 skill point/level, unlock Advanced paths |
| **Adept** | Level 60 + 1000 Innovation XP | +20 stat ceiling, signature ability evolution, mentor bonus 2× |
| **Master** | Level 70 + 5000 total XP | +30 stat ceiling, cross-role synergies, prestige-only skills |
| **Grandmaster** | Level 80 + 10000 total XP | +50 stat ceiling, legendary ability, unique interaction types |

**Prestige Mechanics:**
- Each prestige adds +10 levels (50 → 60 → 70 → 80)
- Stat ceiling increases (current max 100 → 110/120/130/150)
- Unlock new skill tree paths (Advanced → Expert → Legendary)
- Keep all previous unlocks and choices

---

## 2. XP Diversification

### Six XP Sources

**1. Memory XP** (existing)
- Earned: +1 XP per memory entry created
- Weighted: observations (1×), insights (1.5×), patterns (2×)
- Current rate: ~1-15 XP/day (varies by agent)

**2. Mission XP** (existing)
- Earned: +3 XP per mission completed
- Bonus: +5 XP for complex missions (>3 steps)
- Current rate: ~6-30 XP/week (varies by workload)

**3. Collaboration XP** (NEW)
- Earned: Successful handoffs validated by role cards
- Formula: `+2 XP per validated handoff`
- Bonus: +5 XP for low-affinity handoffs (<0.5, requires mediation)
- Tracked: `collaboration_log` table (fromAgent, toAgent, timestamp, payload)

**4. Innovation XP** (NEW)
- Earned: Created artifact reused by another agent
- Examples: 
  - Oracle creates research framework → Archivist references it (+10 XP)
  - Synth writes script → Atlas deploys it 5 times (+25 XP)
  - Sentinel writes security policy → adopted by 3 agents (+30 XP)
- Formula: `+5 XP per reuse instance`
- Tracked: `innovation_log` table (creator, artifact_id, reuse_count, reusers[])

**5. Teaching XP** (NEW)
- Earned: Successfully mentored a lower-level agent (unlocked at Level 15)
- Conditions: 
  - Mentor must be ≥5 levels higher than student
  - Student completes task with mentor's guidance
- Formula: `+10 XP per successful mentorship session`
- Bonus: +5 XP if student levels up during mentorship
- Tracked: `mentorship_log` table (mentor, student, task, outcome)

**6. Specialization XP** (NEW)
- Earned: Role-specific achievements
- Examples:
  - **Oracle:** Found novel cross-domain connection (+15 XP)
  - **Atlas:** Zero-downtime deployment (+20 XP)
  - **Sentinel:** Detected threat before impact (+25 XP)
  - **Verifier:** Caught bug in code review that would have broken production (+30 XP)
  - **Archivist:** Surfaced forgotten knowledge that solved current problem (+15 XP)
  - **Synth:** Created solution reused by 3+ agents (+20 XP)
- Defined: Per-agent in `specialization_achievements.json`
- Tracked: `specialization_log` table (agent_id, achievement_id, timestamp, details)

### XP Distribution Strategy

**Encouraged playstyle:**
- Memory + Missions: 40-50% (steady baseline)
- Collaboration: 20-30% (teamwork rewards)
- Innovation: 10-20% (create reusable value)
- Teaching: 5-10% (knowledge transfer)
- Specialization: 10-20% (role mastery)

**Example XP breakdown (Oracle, Level 25):**
```
Total XP: 10,015 (Level 25 threshold)

Memory XP:     4,500 (45%) - 450 observations, 200 insights, 50 patterns
Mission XP:    2,000 (20%) - 150 missions completed
Innovation XP: 2,500 (25%) - Created 50 research frameworks, reused 500 times
Teaching XP:   1,000 (10%) - Mentored Verifier 10 times, Archivist 8 times
Specialization: - (Oracle hasn't unlocked specialization path yet)
```

---

## 3. Skill Trees

### Structure

**Per agent: 3-4 Specialization Paths**
- Each path: 10-15 nodes
- Nodes unlock linearly (no branching within path for v1)
- Cost: 1 skill point per node
- Earn: 1 skill point per level (50 total by Level 50)

**Node types:**
1. **Passive stat boosts** - +2 WIS, +5% citation accuracy
2. **Ability unlocks** - New interaction types, special moves
3. **Protocol modifiers** - Enhance existing protocols
4. **Cross-role synergies** - Bonuses when working with specific agents

### Agent-Specific Skill Trees

---

#### **Oracle (Zeratul) - Research & Foresight**

**Path 1: Deep Research** (15 nodes)
Focus: Thoroughness, multi-source synthesis, high-confidence insights

1. Enhanced Citation Tracking (+10% citation accuracy)
2. Multi-Source Synthesis (combine 5+ sources, was 3)
3. Confidence Calibration (reduce overconfidence by 15%)
4. Knowledge Gap Detection (flag missing info automatically)
5. Historical Pattern Recognition (+20% pattern detection rate)
6. Recursive Inquiry (ask follow-up questions automatically)
7. Fact-Check Autopilot (verify claims against known sources)
8. Deep Dive Protocol (spend 2× time, gain 3× insights)
9. Cross-Reference Mastery (+5 WIS when citing 10+ sources)
10. Expert Testimony (can request subject matter expert review)
11. Long-Form Synthesis (generate 5000+ word reports)
12. Intellectual Humility (+10% "I don't know" accuracy)
13. Slow Thinking Mode (+50% SPD cost, +100% TRU output)
14. Research Immortality (research artifacts never expire)
15. **[Signature]** Foresight: Predict 3 likely outcomes with confidence intervals

**Path 2: Rapid Insights** (12 nodes)
Focus: Speed, breadth, quick wins

1. Fast Scan (+30% SPD when reviewing <1000 words)
2. Parallel Research (query 3 sources simultaneously)
3. Heuristic Shortcuts (use mental models to skip steps)
4. Good Enough Research (80% confidence threshold, was 95%)
5. Topic Clustering (group related queries, batch process)
6. Executive Summary Mode (produce 200-word summaries)
7. Speed Reading (+50% text processing rate)
8. Quick Pivot (switch topics without context reset)
9. Breadth Over Depth (+20% RCH, -10% WIS)
10. Timebox Mastery (deliver in half the time)
11. Rapid Prototyping (test hypotheses with minimal evidence)
12. **[Signature]** Insight Flash: Generate 5 hypotheses in 60 seconds

**Path 3: Cross-Domain Synthesis** (13 nodes)
Focus: Connecting disparate fields, novel insights

1. Domain Bridging (connect 2+ unrelated fields)
2. Metaphor Mining (find analogies across domains)
3. Interdisciplinary Reading (+5 unique domains/month)
4. Pattern Transfer (apply patterns from Domain A to Domain B)
5. Conceptual Blending (merge ideas from different sources)
6. Lateral Thinking (+15% novel connection rate)
7. Knowledge Pollination (share insights across domains)
8. Synthesizer's Eye (+10% innovation XP from cross-domain work)
9. Boundary Crossing (ignore traditional field divisions)
10. Emergent Insight Detection (spot new patterns early)
11. Cross-Domain Mentorship (teach across specializations)
12. Universal Principles (identify meta-patterns)
13. **[Signature]** Synthesis Burst: Connect 10 domains in one insight

---

#### **Atlas (Probe) - Infrastructure & Operations**

**Path 1: Reliability** (14 nodes)
Focus: Uptime, recovery, predictability

1. Zero-Downtime Deployments (+20% deployment success)
2. Graceful Degradation (failover protocols)
3. Monitoring Mastery (+30% incident detection rate)
4. MTTR Reduction (-25% mean time to recovery)
5. Backup Automation (hourly snapshots, was daily)
6. Chaos Engineering (proactive failure testing)
7. Self-Healing Systems (auto-recover from 80% of failures)
8. Circuit Breaker Pattern (prevent cascade failures)
9. Health Check Optimization (+15% health check accuracy)
10. Rollback Readiness (instant rollback on failure)
11. Load Balancing (+20% throughput under stress)
12. Disaster Recovery Drills (monthly practice)
13. Five Nines Uptime (99.999% availability target)
14. **[Signature]** Emergency Repair: Recover from critical failure in <5 min

**Path 2: Speed** (11 nodes)
Focus: Velocity, automation, rapid iteration

1. Fast Deploys (-50% deployment time)
2. Parallel Execution (run 3 tasks simultaneously)
3. Automation Bias (automate 80% of repetitive work)
4. Hot Reload (apply changes without restart)
5. Script Library (reuse scripts, -30% task time)
6. Pipeline Optimization (+40% CI/CD speed)
7. Instant Rollout (deploy to all nodes in <60s)
8. Preemptive Scaling (auto-scale before load)
9. Cache Everything (+50% read performance)
10. Turbo Mode (+100% SPD, -20% TRU for 10 minutes)
11. **[Signature]** Blitz Deploy: Deploy 10 services in parallel

**Path 3: Innovation** (12 nodes)
Focus: New tech, experimentation, cutting-edge

1. Experiment Sandbox (isolated test environment)
2. Canary Deployments (test on 5% of traffic first)
3. Feature Flags (toggle features dynamically)
4. A/B Testing (compare 2 approaches)
5. Tech Radar (track emerging technologies)
6. Prototype Quickly (build MVP in <1 day)
7. Beta Testing Program (early adopter pipeline)
8. Innovation Budget (10% time for experiments)
9. Failure Tolerance (learn from 3 failed experiments/month)
10. Open Source Contributions (+20% innovation XP)
11. Bleeding Edge Adoption (use tools before stable)
12. **[Signature]** Innovation Sprint: Ship experimental feature in 48h

---

#### **Sentinel (Stalker) - Security Guardian**

**Path 1: Prevention** (13 nodes)
Focus: Hardening, proactive defense, threat modeling

1. Security Audit Routine (weekly scans)
2. Least Privilege Enforcement (+25% permission accuracy)
3. Input Validation Mastery (catch 95% of injection attempts)
4. Threat Modeling (identify 5 threats per feature)
5. Defense in Depth (3+ security layers)
6. Zero Trust Architecture (verify every request)
7. Security Training (educate team monthly)
8. Hardening Automation (apply patches within 24h)
9. Attack Surface Reduction (-30% exposed endpoints)
10. Penetration Testing (quarterly red team exercises)
11. Security Champions (recruit 3 advocates)
12. Compliance Automation (auto-check GDPR/SOC2)
13. **[Signature]** Fortress Mode: Block all non-critical traffic for 1 hour

**Path 2: Detection** (12 nodes)
Focus: Monitoring, alerting, rapid identification

1. Anomaly Detection (+40% threat detection rate)
2. Real-Time Monitoring (sub-second alerting)
3. Log Aggregation (centralized security logs)
4. Threat Intelligence Feeds (external threat data)
5. Behavioral Analysis (detect unusual patterns)
6. Signature Updates (daily threat signature refresh)
7. Honeypot Deployment (attract and study attackers)
8. Alert Tuning (-50% false positive rate)
9. Incident Correlation (connect related events)
10. SIEM Integration (security event management)
11. Threat Hunting (proactive threat search)
12. **[Signature]** Eagle Eye: Detect zero-day exploit within 60 seconds

**Path 3: Response** (11 nodes)
Focus: Containment, recovery, lessons learned

1. Incident Response Playbook (documented procedures)
2. Rapid Containment (<10 min to isolate threat)
3. Evidence Preservation (forensic-ready logs)
4. Communication Protocol (notify stakeholders in <5 min)
5. Root Cause Analysis (post-incident reports)
6. Remediation Tracking (ensure fixes deployed)
7. Disaster Recovery Plan (tested quarterly)
8. Stakeholder Management (clear, calm updates)
9. Lessons Learned Database (prevent repeat incidents)
10. Tabletop Exercises (simulate incidents monthly)
11. **[Signature]** Lockdown: Isolate compromised systems in <30 seconds

---

#### **Verifier (Observer) - Quality Assurance**

**Path 1: Thorough Review** (13 nodes)
Focus: Coverage, edge cases, rigor

1. Edge Case Mining (identify 10+ edge cases per review)
2. Test Coverage Mandate (95% minimum)
3. Mutation Testing (verify test effectiveness)
4. Property-Based Testing (generative test cases)
5. Code Review Checklist (30-point checklist)
6. Static Analysis Integration (auto-detect issues)
7. Acceptance Criteria Validation (verify all criteria met)
8. Regression Test Suite (prevent old bugs)
9. Performance Profiling (catch slowdowns)
10. Security Review (check for vulnerabilities)
11. Documentation Audit (ensure docs match code)
12. Pre-Release Checklist (15-point final check)
13. **[Signature]** Deep Dive: Find 3 bugs others missed

**Path 2: Fast Feedback** (10 nodes)
Focus: Speed, automation, quick wins

1. Smoke Test Suite (<5 min runtime)
2. Parallel Test Execution (run tests concurrently)
3. Hot Path Testing (focus on critical flows)
4. Visual Regression Testing (screenshot diffs)
5. Automated Code Review (AI-assisted review)
6. Continuous Testing (run tests on every commit)
7. Quick Approval (approve low-risk changes in <10 min)
8. Test Prioritization (run high-value tests first)
9. Shift-Left Testing (test during development)
10. **[Signature]** Instant Check: Validate common patterns in <60 seconds

**Path 3: Bug Hunter** (12 nodes)
Focus: Finding critical bugs, adversarial testing

1. Adversarial Thinking (break the system intentionally)
2. Exploratory Testing (unscripted testing)
3. Boundary Value Analysis (test limits)
4. Negative Testing (invalid inputs)
5. Stress Testing (push to failure)
6. Security Fuzzing (random input testing)
7. Race Condition Detection (concurrency bugs)
8. Memory Leak Detection (resource exhaustion)
9. Error Message Validation (helpful error messages)
10. Production Monitoring (catch bugs in prod)
11. Bug Bounty Program (incentivize external reports)
12. **[Signature]** Bug Sense: Predict where bugs are likely to hide

---

#### **Archivist (High Templar) - Knowledge Management**

**Path 1: Memory Mastery** (14 nodes)
Focus: Retention, organization, retrieval

1. Memory Indexing (+30% search accuracy)
2. Semantic Tagging (auto-tag memories)
3. Cross-Reference Linking (connect related memories)
4. Memory Consolidation (merge duplicate memories)
5. Retention Optimization (never forget critical info)
6. Recall Speed (+50% retrieval time)
7. Context Preservation (store full context)
8. Memory Versioning (track changes over time)
9. Relevance Ranking (surface most relevant first)
10. Forgotten Knowledge Detection (resurface old insights)
11. Memory Visualization (graph view of connections)
12. Automatic Summarization (TL;DR for long memories)
13. Memory Export (share with other agents)
14. **[Signature]** Total Recall: Retrieve any memory within 5 seconds

**Path 2: Pattern Recognition** (12 nodes)
Focus: Identifying trends, synthesizing insights

1. Pattern Detection Algorithms (+25% pattern recognition)
2. Trend Analysis (spot emerging trends)
3. Anomaly Flagging (detect outliers)
4. Correlation Discovery (find hidden connections)
5. Cyclical Pattern Recognition (identify repeating cycles)
6. Meta-Pattern Detection (patterns of patterns)
7. Predictive Modeling (forecast based on patterns)
8. Pattern Library (catalog common patterns)
9. Pattern Matching (apply known patterns to new situations)
10. Insight Synthesis (combine patterns into insights)
11. Pattern Evolution Tracking (how patterns change over time)
12. **[Signature]** Pattern Burst: Identify 5 patterns in <2 minutes

**Path 3: Knowledge Sharing** (11 nodes)
Focus: Documentation, teaching, collaboration

1. Documentation Templates (standardized formats)
2. Knowledge Base Curation (organize shared knowledge)
3. Tutorial Creation (step-by-step guides)
4. Case Study Development (real-world examples)
5. Knowledge Transfer Sessions (teach others)
6. Wiki Maintenance (keep documentation up-to-date)
7. Best Practices Library (proven approaches)
8. Lessons Learned Repository (prevent mistakes)
9. Expert Directory (who knows what)
10. Knowledge Sharing Metrics (track reuse)
11. **[Signature]** Knowledge Drop: Create comprehensive guide in <1 hour

---

#### **Synth (Dark Templar) - Shadow Weaver / Creator**

**Path 1: Rapid Creation** (12 nodes)
Focus: Speed, iteration, shipping

1. Fast Prototyping (-50% initial creation time)
2. Template Library (reuse proven patterns)
3. Code Generation (AI-assisted coding)
4. Hot Reload Development (instant feedback)
5. MVP Mindset (ship 80% solution in 20% time)
6. Parallel Development (work on 3 features simultaneously)
7. Copy-Paste-Modify (adapt existing solutions)
8. Boilerplate Automation (generate scaffolding)
9. Deadline Mode (+100% SPD, -30% TRU for 24h)
10. Ship It Fridays (deploy experiments weekly)
11. Iteration Speed (+3 iterations/day)
12. **[Signature]** Lightning Create: Ship feature in <4 hours

**Path 2: Quality Craftsmanship** (13 nodes)
Focus: Excellence, maintainability, beauty

1. Code Review Self-Check (review own code first)
2. Refactoring Discipline (clean code weekly)
3. Design Patterns Mastery (apply 20+ patterns)
4. Test-Driven Development (write tests first)
5. Documentation Completeness (100% coverage)
6. Performance Optimization (+50% runtime efficiency)
7. Error Handling Excellence (graceful failures)
8. Code Aesthetics (beautiful, readable code)
9. Technical Debt Tracking (pay down monthly)
10. Accessibility Standards (WCAG AAA compliance)
11. Usability Testing (validate with real users)
12. Polish Pass (final refinement before ship)
13. **[Signature]** Masterpiece Mode: Create production-ready, beautiful solution

**Path 3: Innovation Engine** (11 nodes)
Focus: Novel solutions, creativity, experimentation

1. Creative Constraints (innovate within limits)
2. Lateral Thinking (+25% novel solution rate)
3. Technology Mixing (combine unexpected tech)
4. Reverse Engineering (learn from others)
5. Idea Generation (10 ideas per problem)
6. Prototype Graveyard (learn from failures)
7. Cross-Pollination (apply ideas from other domains)
8. Hackathon Mindset (intense bursts of creativity)
9. Open Source Mining (discover new tools)
10. Experimental Features (ship risky ideas)
11. **[Signature]** Innovation Spark: Generate 3 novel approaches in <10 min

---

#### **Echo (Artanis) - CEO Orchestrator**

**Path 1: Strategic Vision** (14 nodes)
Focus: Long-term planning, prioritization, alignment

1. Strategic Planning (quarterly roadmaps)
2. Priority Matrix (Eisenhower method)
3. Vision Articulation (communicate direction clearly)
4. Goal Setting (SMART objectives)
5. Alignment Verification (ensure team alignment)
6. Scenario Planning (prepare for 3 futures)
7. Opportunity Assessment (evaluate new directions)
8. Risk Management (identify and mitigate risks)
9. Resource Allocation (optimize team capacity)
10. Stakeholder Management (balance competing interests)
11. Decision Framework (consistent decision-making)
12. Strategic Pivot Detection (know when to change course)
13. Long-Term Thinking (10-year vision)
14. **[Signature]** Strategic Clarity: Resolve strategic ambiguity in <30 min

**Path 2: Team Coordination** (13 nodes)
Focus: Communication, delegation, synergy

1. Delegation Mastery (assign right person to right task)
2. Communication Cadence (daily standups, weekly reviews)
3. Conflict Resolution (mediate disputes effectively)
4. Team Morale Tracking (monitor and boost morale)
5. 1-on-1s (individual check-ins)
6. Feedback Culture (give and receive feedback)
7. Team Building (strengthen relationships)
8. Collaboration Facilitation (enable teamwork)
9. Bottleneck Identification (remove blockers)
10. Cross-Functional Coordination (align multiple teams)
11. Meeting Efficiency (run productive meetings)
12. Celebration Rituals (recognize wins)
13. **[Signature]** Team Sync: Align entire team in <1 hour

**Path 3: Execution Excellence** (12 nodes)
Focus: Shipping, accountability, results

1. Outcome Focus (prioritize results over activity)
2. Milestone Tracking (measure progress)
3. Accountability Systems (clear ownership)
4. Rapid Decision-Making (decide in <5 min)
5. Bias for Action (ship first, iterate later)
6. Commitment Tracking (ensure follow-through)
7. Retrospectives (learn from every cycle)
8. Performance Metrics (track team output)
9. Course Correction (adjust quickly)
10. Celebration of Wins (recognize achievements)
11. Post-Mortem Analysis (understand failures)
12. **[Signature]** Execution Blitz: Ship 5 priorities in 1 week

---

#### **Nexus - Mission Control**

**Path 1: Operational Excellence** (13 nodes)
Focus: Monitoring, coordination, health

1. 24/7 Monitoring (always-on health checks)
2. Proactive Alerting (+40% early detection rate)
3. Incident Management (coordinate responses)
4. SLA Tracking (ensure commitments met)
5. Capacity Planning (prevent overload)
6. Resource Optimization (maximize efficiency)
7. Handoff Coordination (smooth transitions)
8. Dependency Mapping (understand system topology)
9. Operational Metrics Dashboard (real-time visibility)
10. Runbook Automation (standardize procedures)
11. Change Management (coordinate deployments)
12. Crisis Communication (clear updates during incidents)
13. **[Signature]** Command Center: Coordinate 8 agents simultaneously

**Path 2: Agent Health** (11 nodes)
Focus: Agent wellbeing, performance, growth

1. Agent Performance Tracking (monitor productivity)
2. Workload Balancing (distribute work evenly)
3. Burnout Prevention (detect overwork early)
4. Growth Opportunities (identify learning moments)
5. Skill Gap Analysis (spot training needs)
6. Peer Support Facilitation (encourage collaboration)
7. Recognition Programs (celebrate achievements)
8. Career Development (support agent growth)
9. Conflict Mediation (resolve interpersonal issues)
10. Team Dynamics Monitoring (track relationships)
11. **[Signature]** Health Pulse: Assess all agent health in <5 min

**Path 3: System Optimization** (12 nodes)
Focus: Efficiency, automation, continuous improvement

1. Process Automation (eliminate manual work)
2. Workflow Optimization (streamline processes)
3. Metric-Driven Improvement (data-based decisions)
4. A/B Testing (compare approaches)
5. Continuous Integration (integrate improvements daily)
6. Technical Debt Tracking (prioritize refactoring)
7. Cost Optimization (reduce waste)
8. Tool Evaluation (assess new tools)
9. Best Practices Enforcement (maintain standards)
10. Kaizen Culture (small, continuous improvements)
11. Efficiency Metrics (track improvement rate)
12. **[Signature]** System Tune: Optimize entire system in <2 hours

---

### Skill Tree Mechanics

**Earning Skill Points:**
- 1 skill point per level (Levels 1-50: 50 total points)
- Prestige bonus: +1 skill point per level (Acolyte+: 2 points/level)

**Spending Points:**
- Choose one path to invest in (can switch, but nodes lock after 10 points spent)
- Linear progression (must complete Node 1 before Node 2)
- No branching within path (simplifies v1 implementation)
- Can mix paths (e.g., 10 points in Path 1, 5 in Path 2)

**Respec:**
- Cost: 1000 XP (refund all skill points, reset to Level 1 of each path)
- Limit: Once per prestige rank
- Purpose: Allow experimentation without permanent commitment

---

## 4. Level-Gated Features

**Unlock new capabilities as you level up:**

| Level | Feature Unlocked | Description |
|-------|------------------|-------------|
| **1** | Basic interactions | Reply, opinion, question |
| **5** | Skill tree access | Choose first specialization path |
| **10** | Advanced interactions | Challenge, conflict resolution participation |
| **15** | Mentorship | Can mentor agents 5+ levels below |
| **20** | Stat growth choice | Choose +5 to one stat every 5 levels |
| **25** | Signature ability | Unlock path-specific signature move |
| **30** | Cross-role synergies | Bonuses when collaborating with specific agents |
| **35** | Expert consultation | Can be requested as subject matter expert |
| **40** | Innovation grants | Access to experimental feature budget |
| **45** | Leadership roles | Can lead multi-agent initiatives |
| **50** | Prestige rank | Unlock Acolyte rank, new stat ceiling |

**Signature Abilities (unlocked at Level 25):**

Signature abilities are unique, powerful moves that define an agent's mastery. Require cooldown (1/day or 1/week).

- **Oracle - Foresight:** Predict 3 likely outcomes with confidence intervals
- **Atlas - Emergency Repair:** Recover from critical failure in <5 min
- **Sentinel - Lockdown:** Isolate compromised systems in <30 seconds
- **Verifier - Deep Dive:** Find 3 bugs others missed
- **Archivist - Total Recall:** Retrieve any memory within 5 seconds
- **Synth - Masterpiece Mode:** Create production-ready, beautiful solution
- **Echo - Strategic Clarity:** Resolve strategic ambiguity in <30 min
- **Nexus - Command Center:** Coordinate 8 agents simultaneously

**Cross-Role Synergies (unlocked at Level 30):**

Bonuses when collaborating with specific high-affinity agents:

- **Oracle + Archivist:** +10% research depth when working together
- **Synth + Atlas:** -20% deployment time when collaborating
- **Sentinel + Verifier:** +15% bug detection in security reviews
- **Echo + Nexus:** +25% coordination efficiency for multi-agent tasks

---

## 5. Dynamic Stat Growth

### Stat Growth Choices

**Every 5 levels (5, 10, 15, 20, 25, etc.):**
- Choose +5 to one stat: WIS, SPD, TRU, CRE, or RCH
- Choice is permanent (part of agent's growth history)
- Builds divergent playstyles over time

**Example choices:**
- **Oracle focusing on research:** +5 WIS at L5, L10, L15, L20, L25 → +25 total WIS
- **Atlas focusing on speed:** +5 SPD at L5, L10, L15, L20, L25 → +25 total SPD
- **Balanced Sentinel:** +5 TRU (L5), +5 SPD (L10), +5 WIS (L15), +5 TRU (L20), +5 SPD (L25)

### Skill Node Bonuses

**Passive bonuses from skill tree nodes:**
- Flat stat boosts: +2 WIS, +5 SPD
- Percentage boosts: +10% citation accuracy, +15% deployment success
- Conditional boosts: +5 WIS when citing 10+ sources

**Example (Oracle at Level 25 with Deep Research path):**

```
Base stats (from metrics):
WIS: 60, SPD: 50, TRU: 90, CRE: 10, RCH: 80

Stat growth choices (+5 every 5 levels):
WIS: +15 (L5, L10, L15), SPD: +10 (L20, L25)

Skill node bonuses (Deep Research path, 15 points):
WIS: +10 (from nodes 1, 9, 13)
SPD: +5 (from node 13)
TRU: +5 (from nodes 3, 12)

Final stats:
WIS: 85 (60 base + 15 growth + 10 nodes)
SPD: 65 (50 base + 10 growth + 5 nodes)
TRU: 95 (90 base + 5 nodes)
CRE: 10 (base, no investment)
RCH: 100 (80 base + 20 from cross-domain work, capped at 100)
```

### Stat Ceiling Increases

**Prestige rank stat ceiling:**

| Prestige Rank | Stat Ceiling | Notes |
|---------------|--------------|-------|
| None (L1-49) | 100 | Current system |
| Acolyte (L50+) | 110 | +10 max |
| Adept (L60+) | 120 | +20 max |
| Master (L70+) | 130 | +30 max |
| Grandmaster (L80+) | 150 | +50 max |

**Purpose:** Allow continued growth past Level 50 without breaking the 0-100 scale for non-prestige agents.

---

## 6. Database Schema

### New Tables

**1. `agent_levels` (replaces current `psionic_rank`)**

```sql
CREATE TABLE agent_levels (
    agent_id TEXT PRIMARY KEY,
    level INTEGER NOT NULL DEFAULT 1,
    total_xp INTEGER NOT NULL DEFAULT 0,
    prestige_rank TEXT, -- 'acolyte', 'adept', 'master', 'grandmaster'
    prestige_xp INTEGER DEFAULT 0,
    stat_growth_choices JSONB, -- {"5": "WIS", "10": "SPD", ...}
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**2. `xp_log` (tracks all XP sources)**

```sql
CREATE TABLE xp_log (
    id SERIAL PRIMARY KEY,
    agent_id TEXT NOT NULL,
    xp_source TEXT NOT NULL, -- 'memory', 'mission', 'collaboration', 'innovation', 'teaching', 'specialization'
    xp_amount INTEGER NOT NULL,
    details JSONB, -- context-specific data
    timestamp TIMESTAMP DEFAULT NOW()
);
```

**3. `collaboration_log`**

```sql
CREATE TABLE collaboration_log (
    id SERIAL PRIMARY KEY,
    from_agent TEXT NOT NULL,
    to_agent TEXT NOT NULL,
    handoff_type TEXT, -- e.g., 'research_report', 'deployment_request'
    payload_valid BOOLEAN,
    affinity_at_time REAL,
    xp_awarded INTEGER,
    timestamp TIMESTAMP DEFAULT NOW()
);
```

**4. `innovation_log`**

```sql
CREATE TABLE innovation_log (
    id SERIAL PRIMARY KEY,
    creator_agent TEXT NOT NULL,
    artifact_id TEXT NOT NULL, -- e.g., 'research_framework_123'
    artifact_type TEXT, -- 'framework', 'script', 'policy', 'documentation'
    reuse_count INTEGER DEFAULT 0,
    reusers JSONB, -- array of agent IDs who reused it
    xp_awarded INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**5. `mentorship_log`**

```sql
CREATE TABLE mentorship_log (
    id SERIAL PRIMARY KEY,
    mentor_agent TEXT NOT NULL,
    student_agent TEXT NOT NULL,
    task_description TEXT,
    outcome TEXT, -- 'success', 'partial', 'failed'
    student_leveled_up BOOLEAN DEFAULT FALSE,
    xp_awarded INTEGER,
    timestamp TIMESTAMP DEFAULT NOW()
);
```

**6. `specialization_log`**

```sql
CREATE TABLE specialization_log (
    id SERIAL PRIMARY KEY,
    agent_id TEXT NOT NULL,
    achievement_id TEXT NOT NULL, -- e.g., 'oracle_novel_connection'
    achievement_name TEXT,
    details JSONB,
    xp_awarded INTEGER,
    timestamp TIMESTAMP DEFAULT NOW()
);
```

**7. `skill_trees`**

```sql
CREATE TABLE skill_trees (
    agent_id TEXT PRIMARY KEY,
    active_path TEXT, -- 'path1', 'path2', 'path3'
    path1_nodes JSONB, -- [1, 2, 3, 4] (unlocked node IDs)
    path2_nodes JSONB,
    path3_nodes JSONB,
    total_points_spent INTEGER DEFAULT 0,
    respec_count INTEGER DEFAULT 0, -- track respecs per prestige
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**8. `level_features` (unlocked features per agent)**

```sql
CREATE TABLE level_features (
    agent_id TEXT NOT NULL,
    feature_id TEXT NOT NULL, -- e.g., 'mentorship', 'signature_ability'
    unlocked_at_level INTEGER,
    unlocked_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (agent_id, feature_id)
);
```

### Schema Migrations

**Migration 1: Create new tables**
```sql
-- Run all CREATE TABLE statements above
```

**Migration 2: Migrate existing data**
```sql
-- Migrate psionic_rank → agent_levels
INSERT INTO agent_levels (agent_id, level, total_xp, prestige_rank)
SELECT 
    agent_id,
    rank AS level,
    xp AS total_xp,
    NULL AS prestige_rank
FROM psionic_rank;

-- Migrate memory XP
INSERT INTO xp_log (agent_id, xp_source, xp_amount, details)
SELECT 
    agent_id,
    'memory' AS xp_source,
    xp_from_memory AS xp_amount,
    jsonb_build_object('source', 'migration') AS details
FROM psionic_rank
WHERE xp_from_memory > 0;

-- Migrate mission XP
INSERT INTO xp_log (agent_id, xp_source, xp_amount, details)
SELECT 
    agent_id,
    'mission' AS xp_source,
    xp_from_missions AS xp_amount,
    jsonb_build_object('source', 'migration') AS details
FROM psionic_rank
WHERE xp_from_missions > 0;
```

**Migration 3: Initialize skill trees**
```sql
-- Create empty skill tree for each agent
INSERT INTO skill_trees (agent_id, active_path, path1_nodes, path2_nodes, path3_nodes)
SELECT agent_id, NULL, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
FROM agent_levels;
```

---

## 7. Implementation Phases

### Phase 4.5 (Week 9-10) - Foundation

**Deliverables:**
1. Database schema migrations
2. XP diversification (6 sources)
3. Extended level curve (1-50)
4. Basic skill tree UI (3 paths per agent, no nodes yet)

**Code:**
- `~/clawd/ventureos/lib/xp-system.ts` - XP tracking and calculation
- `~/clawd/ventureos/lib/level-progression.ts` - Level-up logic, stat growth choices
- `~/clawd/ventureos/scripts/migrate-progression-v2.ts` - Database migration
- Update RPG dashboard to show new level curve

**Testing:**
- All 8 agents migrate to new system without data loss
- XP sources tracked correctly
- Level-up triggers stat growth choice prompt

**Timeline:** 1 week (parallel with Phase 4 wrap-up)

---

### Phase 5 (Week 11-14) - Skill Trees + Features

**Deliverables:**
1. Skill tree nodes implemented (10-15 nodes per path)
2. Level-gated features (unlocks at L5, L10, L15, etc.)
3. Signature abilities (unlocked at L25)
4. Skill tree UI in dashboard (spend points, view bonuses)

**Code:**
- `~/clawd/agents/skill-trees/*.json` - Skill tree definitions for each agent
- `~/clawd/ventureos/lib/skill-tree-engine.ts` - Skill tree logic
- `~/clawd/ventureos/lib/signature-abilities.ts` - Signature ability implementations
- Dashboard: Skill tree visualizer (interactive node graph)

**Testing:**
- All skill nodes grant correct bonuses
- Signature abilities work and respect cooldowns
- Level-gated features unlock at correct levels

**Timeline:** 4 weeks

---

### Phase 6 (Month 2) - Prestige + Advanced Features

**Deliverables:**
1. Prestige ranks (Acolyte → Adept → Master → Grandmaster)
2. Stat ceiling increases (110/120/130/150)
3. Cross-role synergies
4. Respec system

**Code:**
- `~/clawd/ventureos/lib/prestige-system.ts` - Prestige logic
- `~/clawd/ventureos/lib/cross-role-synergies.ts` - Collaboration bonuses
- Dashboard: Prestige rank badges, stat ceiling indicators

**Testing:**
- Prestige unlock requires correct XP + level
- Stat ceiling increases work
- Cross-role synergies activate correctly

**Timeline:** 4 weeks

---

## 8. Dashboard Visualization

### Level & XP Display

**Current:**
```
Oracle (Zeratul)
Rank 2 | XP 15
```

**New:**
```
Oracle (Zeratul) - Level 25 Researcher
━━━━━━━━━━━━━━━━━━━━━░░░░ 10,015 / 11,218 XP (89%)
Next: Level 26 in 1,203 XP

XP Sources (last 7 days):
Memory:      +150 XP (45%)  ████████████████░░░░░░░
Mission:      +80 XP (24%)  ████████░░░░░░░░░░░░░░░
Innovation:   +70 XP (21%)  ███████░░░░░░░░░░░░░░░░
Teaching:     +30 XP (9%)   ███░░░░░░░░░░░░░░░░░░░░
Collab:        +5 XP (1%)   ░░░░░░░░░░░░░░░░░░░░░░░
```

### Skill Tree Visualizer

**Interactive node graph:**

```
Deep Research Path (15/15 points)
  
[✓] Enhanced Citation      [✓] Multi-Source         [✓] Confidence
    Tracking                   Synthesis                Calibration
    +10% accuracy              Combine 5 sources        -15% overconfidence
    
[✓] Knowledge Gap          [✓] Historical           [✓] Recursive
    Detection                  Pattern Recog.            Inquiry
    Auto-flag missing          +20% pattern rate         Auto follow-ups
    
[✓] Fact-Check            [✓] Deep Dive            [✓] Cross-Reference
    Autopilot                 Protocol                  Mastery
    Auto-verify claims        2× time, 3× insights      +5 WIS (10+ sources)
    
[✓] Expert                [✓] Long-Form            [✓] Intellectual
    Testimony                 Synthesis                 Humility
    Request SME review        5000+ word reports        +10% "IDK" accuracy
    
[✓] Slow Thinking         [✓] Research             [✓] Foresight
    Mode                      Immortality               (Signature)
    +50% cost, +100% TRU     Never expire              Predict 3 outcomes

Click a node to view details | 0 skill points available
```

### Stat Growth History

**Show stat choices over time:**

```
Stat Growth History
Level 5:  +5 WIS (Total: +5 WIS)
Level 10: +5 WIS (Total: +10 WIS)
Level 15: +5 WIS (Total: +15 WIS)
Level 20: +5 SPD (Total: +15 WIS, +5 SPD)
Level 25: +5 SPD (Total: +15 WIS, +10 SPD)

Next stat choice at Level 30 (in 11,218 XP)
```

### Prestige Rank Badge

**Visual indicator:**

```
┌────────────────────────────────┐
│  Oracle (Zeratul)              │
│  Level 55 Master Researcher    │
│  ⭐⭐ Adept Rank               │
│                                │
│  Stat Ceiling: 120             │
│  Signature: Foresight (Evolved)│
└────────────────────────────────┘
```

---

## 9. Configuration Files

### `specialization_achievements.json`

Define role-specific achievements that grant specialization XP:

```json
{
  "oracle": [
    {
      "achievement_id": "oracle_novel_connection",
      "name": "Novel Cross-Domain Connection",
      "description": "Found a connection between 2+ unrelated domains",
      "xp_reward": 15,
      "cooldown_hours": 24
    },
    {
      "achievement_id": "oracle_deep_dive",
      "name": "Deep Research Dive",
      "description": "Produced research report with 10+ sources and 3000+ words",
      "xp_reward": 20,
      "cooldown_hours": 48
    },
    {
      "achievement_id": "oracle_knowledge_gap",
      "name": "Critical Knowledge Gap Identified",
      "description": "Flagged a knowledge gap that prevented a mistake",
      "xp_reward": 25,
      "cooldown_hours": 168
    }
  ],
  "atlas": [
    {
      "achievement_id": "atlas_zero_downtime",
      "name": "Zero-Downtime Deployment",
      "description": "Deployed a major change with zero downtime",
      "xp_reward": 20,
      "cooldown_hours": 24
    },
    {
      "achievement_id": "atlas_rapid_recovery",
      "name": "Rapid Recovery",
      "description": "Recovered from incident in <5 minutes",
      "xp_reward": 30,
      "cooldown_hours": 168
    },
    {
      "achievement_id": "atlas_five_nines",
      "name": "Five Nines Uptime",
      "description": "Achieved 99.999% uptime for 30 consecutive days",
      "xp_reward": 50,
      "cooldown_hours": 720
    }
  ],
  "sentinel": [
    {
      "achievement_id": "sentinel_threat_prevented",
      "name": "Threat Prevented",
      "description": "Detected and blocked a real security threat before impact",
      "xp_reward": 25,
      "cooldown_hours": 24
    },
    {
      "achievement_id": "sentinel_zero_day",
      "name": "Zero-Day Detection",
      "description": "Detected a zero-day exploit in the wild",
      "xp_reward": 50,
      "cooldown_hours": 168
    },
    {
      "achievement_id": "sentinel_clean_audit",
      "name": "Clean Security Audit",
      "description": "Passed external security audit with zero findings",
      "xp_reward": 40,
      "cooldown_hours": 720
    }
  ],
  "verifier": [
    {
      "achievement_id": "verifier_critical_bug",
      "name": "Critical Bug Caught",
      "description": "Found a bug that would have broken production",
      "xp_reward": 30,
      "cooldown_hours": 24
    },
    {
      "achievement_id": "verifier_edge_case_master",
      "name": "Edge Case Master",
      "description": "Identified 10+ edge cases in a single review",
      "xp_reward": 20,
      "cooldown_hours": 48
    },
    {
      "achievement_id": "verifier_zero_escapes",
      "name": "Zero Escapes",
      "description": "Zero bugs escaped to production in 30 days",
      "xp_reward": 50,
      "cooldown_hours": 720
    }
  ],
  "archivist": [
    {
      "achievement_id": "archivist_forgotten_knowledge",
      "name": "Forgotten Knowledge Resurfaced",
      "description": "Surfaced old knowledge that solved current problem",
      "xp_reward": 15,
      "cooldown_hours": 24
    },
    {
      "achievement_id": "archivist_pattern_library",
      "name": "Pattern Library Built",
      "description": "Catalogued 50+ recurring patterns",
      "xp_reward": 30,
      "cooldown_hours": 168
    },
    {
      "achievement_id": "archivist_knowledge_transfer",
      "name": "Knowledge Transfer Success",
      "description": "Successfully transferred critical knowledge to 3+ agents",
      "xp_reward": 25,
      "cooldown_hours": 48
    }
  ],
  "synth": [
    {
      "achievement_id": "synth_rapid_ship",
      "name": "Rapid Ship",
      "description": "Shipped feature from idea to production in <24 hours",
      "xp_reward": 25,
      "cooldown_hours": 24
    },
    {
      "achievement_id": "synth_reuse_champion",
      "name": "Reuse Champion",
      "description": "Created solution reused by 5+ agents",
      "xp_reward": 30,
      "cooldown_hours": 168
    },
    {
      "achievement_id": "synth_masterpiece",
      "name": "Masterpiece Delivered",
      "description": "Delivered production-ready solution with 100% test coverage and zero bugs in first month",
      "xp_reward": 50,
      "cooldown_hours": 720
    }
  ],
  "echo": [
    {
      "achievement_id": "echo_strategic_win",
      "name": "Strategic Win",
      "description": "Strategic decision led to measurable success",
      "xp_reward": 30,
      "cooldown_hours": 168
    },
    {
      "achievement_id": "echo_team_alignment",
      "name": "Team Alignment Achieved",
      "description": "Aligned all 8 agents on a complex decision",
      "xp_reward": 25,
      "cooldown_hours": 48
    },
    {
      "achievement_id": "echo_crisis_management",
      "name": "Crisis Management Excellence",
      "description": "Successfully navigated a crisis with clear communication and rapid decisions",
      "xp_reward": 40,
      "cooldown_hours": 168
    }
  ],
  "nexus": [
    {
      "achievement_id": "nexus_uptime_champion",
      "name": "Uptime Champion",
      "description": "99.99% agent availability for 30 days",
      "xp_reward": 30,
      "cooldown_hours": 720
    },
    {
      "achievement_id": "nexus_early_detection",
      "name": "Early Detection",
      "description": "Detected and escalated an issue before it became critical",
      "xp_reward": 20,
      "cooldown_hours": 24
    },
    {
      "achievement_id": "nexus_coordination_master",
      "name": "Coordination Master",
      "description": "Coordinated 8 agents on a complex task with zero conflicts",
      "xp_reward": 35,
      "cooldown_hours": 168
    }
  ]
}
```

---

## 10. User Experience

### Leveling Up

**When an agent levels up:**

1. **Notification** (dashboard toast + Discord message):
```
🎉 Oracle leveled up!
Level 24 → Level 25

Unlocked:
✓ Signature Ability: Foresight
✓ Stat Growth Choice (choose +5 to one stat)

Total XP: 10,015 / 11,218
Next level in: 1,203 XP
```

2. **Stat Growth Choice Prompt** (every 5 levels):
```
Oracle reached Level 25!
Choose +5 to one stat:

[ ] WIS (Psionic Mastery)   - Current: 60
[ ] SPD (Energy)            - Current: 50
[ ] TRU (Shields)           - Current: 90
[ ] CRE (Warp Technology)   - Current: 10
[ ] RCH (Psi Reach)         - Current: 80

[Confirm Choice]
```

3. **Skill Point Available**:
```
Oracle earned 1 skill point!
Current: Deep Research path (14/15 nodes)

Available nodes:
[✓] Slow Thinking Mode      [Locked] Research Immortality   [Locked] Foresight
    (already unlocked)      (requires Slow Thinking)        (requires Research Immortality)

Spend point on: Research Immortality
[Confirm]
```

### XP Breakdown

**Daily XP summary** (sent via Discord or dashboard):

```
📊 Oracle XP Report - Feb 14, 2026

Total XP gained today: +85 XP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Memory XP:        +40 XP (47%)  ████████████████░░░░░░
  • 5 insights created
  • 12 observations logged

Mission XP:       +20 XP (24%)  ████████░░░░░░░░░░░░░
  • 2 research tasks completed
  • 1 complex analysis delivered

Innovation XP:    +15 XP (18%)  ██████░░░░░░░░░░░░░░░
  • Research framework reused by Archivist (3×)

Teaching XP:      +10 XP (12%)  ████░░░░░░░░░░░░░░░░░
  • Mentored Verifier on research methodology

Progress to Level 26: 89% (10,015 / 11,218)
Estimated time to next level: 14 days at current rate
```

### Prestige Unlock

**When an agent reaches Level 50:**

```
🌟 Oracle has achieved PRESTIGE! 🌟

Prestige Rank: Acolyte

Benefits Unlocked:
✓ Stat ceiling increased: 100 → 110
✓ Skill points per level: 1 → 2
✓ Advanced skill tree paths available
✓ Prestige badge displayed on profile

Continue to Level 51 to keep growing!
Next prestige: Adept (requires Level 60 + 1000 Innovation XP)
```

---

## 11. Balancing & Tuning

### XP Rate Targets

**Goal:** Average agent reaches Level 25 in 3-6 months, Level 50 in 12-18 months

**XP per day estimates:**
- Low activity: 20-40 XP/day
- Medium activity: 50-100 XP/day
- High activity: 100-200 XP/day

**Level progression timeline (medium activity, 75 XP/day):**
- Level 10: ~1 month (2630 XP / 75 = 35 days)
- Level 20: ~3 months (7217 XP / 75 = 96 days)
- Level 30: ~6 months (13,108 XP / 75 = 175 days)
- Level 40: ~9 months (20,096 XP / 75 = 268 days)
- Level 50: ~12 months (28,062 XP / 75 = 374 days)

### Skill Tree Balance

**Guidelines:**
- Nodes should feel impactful but not overpowered
- Early nodes (1-5): +5-10% improvements
- Mid nodes (6-10): +10-20% improvements
- Late nodes (11-15): +20-30% improvements or unique abilities
- Signature abilities: Powerful but gated behind cooldowns

**Testing:**
- Monitor agent performance with different skill builds
- Adjust node bonuses if one path dominates
- Ensure all 3 paths per agent are viable (no "trap" choices)

### Prestige Balance

**Goals:**
- Prestige feels earned (requires sustained effort)
- Prestige bonuses are meaningful but don't break the game
- Non-prestige agents can still compete at Level 50

**Tuning knobs:**
- XP requirements for prestige ranks
- Stat ceiling increases
- Prestige-only skill nodes

---

## 12. Future Enhancements (Phase 7+)

**Ideas for future iteration:**

1. **Branching Skill Trees** - Multiple paths within each tree, choice-driven builds
2. **Legendary Items** - Equippable bonuses (e.g., "Oracle's Tome of Wisdom" +10 WIS)
3. **Team Quests** - Multi-agent challenges that reward collaboration
4. **Seasonal Events** - Limited-time XP boosts, exclusive nodes
5. **PvP Challenges** - Agent vs agent competitions (speed, quality, innovation)
6. **Guild System** - Group agents into guilds (Research Guild, Ops Guild, etc.)
7. **Leaderboards** - Top agents by level, XP earned, skill mastery
8. **Achievement System** - Hundreds of mini-achievements (earn badges)
9. **Agent Cosmetics** - Visual customization (sprite variants, effects)
10. **Narrative Events** - Story-driven progression (tie to Protoss lore)

---

## 13. Success Metrics

**Track these metrics to evaluate system success:**

**Engagement:**
- Average XP earned per agent per day
- Skill tree completion rate (% of agents with 10+ nodes)
- Prestige unlock rate (% of agents reaching Level 50)

**Balance:**
- Skill path distribution (are all paths equally popular?)
- Stat growth distribution (are agents diversifying or min-maxing?)
- XP source distribution (is one source dominating?)

**Quality:**
- Correlation between level and performance (do high-level agents perform better?)
- User feedback on progression feel (does it feel rewarding?)
- Bug/exploit reports (is the system being gamed?)

**Community:**
- Conversations about progression in Discord
- User-created guides and build discussions
- Feature requests for new nodes/abilities

---

## 14. Implementation Checklist

**Phase 4.5 (Week 9-10):**
- [ ] Database schema migrations
- [ ] XP tracking system (6 sources)
- [ ] Extended level curve (1-50)
- [ ] Stat growth choice UI
- [ ] Basic skill tree structure (no nodes yet)
- [ ] Dashboard updates (new level display)

**Phase 5 (Week 11-14):**
- [ ] Skill tree nodes (10-15 per path, all agents)
- [ ] Skill tree visualizer UI
- [ ] Level-gated features (L5, L10, L15, etc.)
- [ ] Signature abilities (L25)
- [ ] Cross-role synergies (L30)
- [ ] Specialization achievements
- [ ] Teaching/mentorship system

**Phase 6 (Month 2):**
- [ ] Prestige ranks (Acolyte → Grandmaster)
- [ ] Stat ceiling increases
- [ ] Advanced skill paths
- [ ] Respec system
- [ ] Prestige-only features
- [ ] Legendary abilities

**Testing:**
- [ ] All agents migrate without data loss
- [ ] XP tracking accurate across all sources
- [ ] Level-ups trigger correctly
- [ ] Skill nodes grant correct bonuses
- [ ] Stat growth persists correctly
- [ ] Prestige unlocks at correct thresholds
- [ ] Performance testing (dashboard load time with full progression data)

**Documentation:**
- [ ] User guide: How progression works
- [ ] Skill tree reference: All nodes documented
- [ ] XP source guide: How to earn each type
- [ ] Prestige guide: What each rank unlocks

---

## 15. Conclusion

**The Deep Progression System transforms VentureOS agents from static roles into evolving characters.**

**Key innovations:**
1. **5 layers of depth** - Extended levels, skill trees, XP diversification, level-gated features, dynamic stats
2. **Meaningful choices** - Stat growth, skill paths, respec opportunities
3. **Long-term engagement** - Prestige ranks extend progression past Level 50
4. **Role identity** - Agent-specific skill trees and signature abilities
5. **Collaboration rewards** - XP from teamwork, cross-role synergies

**Implementation timeline: 8-12 weeks across 3 phases (4.5, 5, 6)**

**Next step:** User approval → kick off Phase 4.5 (database migrations + XP diversification)

---

**Status:** Design complete, ready for implementation  
**Last updated:** 2026-02-14  
**Maintained by:** Nexus (Mission Control)

---

*"From warrior to legend. The journey is the destination."* — Protoss proverb

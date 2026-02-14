# Three-Tier Estimation Framework for AI Work

**Version:** 1.0  
**Created:** 2026-02-14  
**Purpose:** Reduce estimation error from 10-100x to 1.5-3x by classifying work by actual constraints, not human timelines

---

## The Core Problem

**Old thinking:** "This would take a human 3 days, so we'll estimate 3 days"  
**Reality:** AI operates at fundamentally different speeds depending on *what blocks the work*, not how complex it is.

**Key insight:** The bottleneck determines the tier, not the task complexity.

---

## Three-Tier Classification System

### Tier 1: Cognitive (Minutes to Hours)
**What it is:** Pure text generation, code writing, document creation, design work  
**Why it's fast:** AI-native capability, 200K context, no external dependencies, parallelizable  
**Typical range:** 5 minutes to 4 hours  
**Confidence:** High (predictable, repeatable)

**Blockers:**
- Quality requirements (iterations needed)
- Scope clarity (vague requirements → more cycles)
- Context loading (large codebases to understand)

### Tier 2: External Integration (Hours to Days)
**What it is:** API integrations, debugging external systems, user decision gates, multi-step deployments  
**Why it's slower:** Rate limits, async feedback loops, external system behavior, human decisions required  
**Typical range:** 4 hours to 3 days  
**Confidence:** Medium (depends on external factors)

**Blockers:**
- API rate limits (can't parallelize past quota)
- Debugging cycles (test → fail → diagnose → retry)
- User decision gates (waiting for approval/input)
- External system reliability (uptime, response times)

### Tier 3: Physical/Time-Gated (Days to Weeks)
**What it is:** Hardware rollouts, cron validation, production verification, time-based testing  
**Why it's slow:** Physical constraints, time-based schedules, multi-stage rollouts, safety requirements  
**Typical range:** 3 days to 3 weeks  
**Confidence:** Low (many unknown variables)

**Blockers:**
- Time itself (cron jobs run daily, can't speed up)
- Hardware delivery/installation
- Multi-stage rollout safety gates
- Production burn-in periods
- Real-world validation cycles

---

## Examples from Recent Work

### Tier 1 Examples (Cognitive)

1. **Role cards creation (14 minutes)**
   - Pure markdown generation
   - Clear template structure
   - No external dependencies
   - Single-pass completion

2. **KPI Registry (13 minutes)**
   - Structured documentation
   - Well-defined scope
   - Template-based output
   - Immediate validation possible

3. **Deep Progression System (same day)**
   - Complex document synthesis
   - Multiple iterations for quality
   - Pure cognitive work
   - No external blockers

4. **RPG Master Guide (2-3 hours)**
   - Large documentation consolidation
   - Multiple source files to synthesize
   - Quality review cycles
   - All-cognitive workflow

5. **Team consistency reviews (30-45 min per agent)**
   - Code/policy analysis
   - Pattern identification
   - Recommendation generation
   - Pure analysis task

6. **Database schema design (1-2 hours)**
   - Technical design work
   - Iterative refinement
   - No deployment needed
   - Cognitive-only validation

### Tier 2 Examples (External Integration)

1. **Home Assistant camera debugging (2 days)**
   - API integration testing
   - External system behavior (HA)
   - Debug cycles (try → fail → diagnose)
   - User verification required

2. **Dashboard customization (2-3 days)**
   - External UI system integration
   - Visual feedback loops
   - User preference decisions
   - Multiple iteration cycles

3. **Discord bot integration (1-2 days)**
   - API rate limits
   - External service dependency
   - Testing in live environment
   - User acceptance testing

4. **Backup restoration testing (4-6 hours)**
   - External storage systems
   - Verification dependencies
   - Multi-step validation
   - System state verification

5. **API authentication setup (3-5 hours)**
   - External service coordination
   - Token exchange workflows
   - Security validation gates
   - Cross-system testing

6. **Metrics collection implementation (6-8 hours)**
   - Multiple data source integration
   - API endpoint testing
   - Data validation cycles
   - User verification of outputs

### Tier 3 Examples (Physical/Time-Gated)

1. **Backup verification (2-3 weeks)**
   - Cron schedule validation (runs daily)
   - Multi-stage verification
   - Time-based confidence building
   - Real-world failure detection

2. **Cron job validation (24-48 hours minimum)**
   - Must wait for scheduled execution
   - Time-based triggers
   - Multiple cycle observation
   - No way to accelerate

3. **Production rollout (1-2 weeks)**
   - Staged deployment gates
   - User adoption monitoring
   - Safety buffer periods
   - Rollback readiness windows

4. **Hardware installation (3-7 days)**
   - Physical delivery time
   - Installation scheduling
   - Network configuration
   - Real-world testing

5. **Memory system burn-in (5-7 days)**
   - Daily heartbeat validation
   - Long-term stability testing
   - Pattern observation over time
   - Production usage validation

6. **Multi-timezone testing (3-5 days)**
   - Waiting for time zones to activate
   - 24-hour cycle observation
   - Edge case discovery
   - Real-world user patterns

---

## Decision Tree: "How Do I Classify This Work?"

```
START: What blocks completion of this work?
│
├─ No external dependencies?
│  └─ Pure text/code/design generation?
│     └─ Clear requirements?
│        └─ TIER 1 (minutes to hours)
│           │
│           └─ Complexity adjustment:
│              ├─ Simple/templated: 5-30 min
│              ├─ Moderate/custom: 30 min - 2 hours
│              └─ Complex/novel: 2-4 hours
│
├─ External systems involved?
│  └─ APIs, databases, third-party services?
│     └─ Requires debugging/iteration?
│        └─ TIER 2 (hours to days)
│           │
│           └─ External factor adjustment:
│              ├─ Well-documented API: 4-8 hours
│              ├─ Unknown behavior: 1-2 days
│              └─ Multiple integrations: 2-3 days
│
└─ Time itself is a constraint?
   └─ Cron schedules, hardware, production safety?
      └─ Multi-stage rollout required?
         └─ TIER 3 (days to weeks)
            │
            └─ Time constraint adjustment:
               ├─ Single time gate (24hr cron): 1-3 days
               ├─ Multiple gates (staged rollout): 1-2 weeks
               └─ Hardware + validation: 2-3 weeks
```

### Quick Classification Questions

Ask yourself in order:

1. **Can I complete this in one uninterrupted cognitive session?**
   - Yes → Tier 1
   - No → Continue

2. **Are external systems/APIs the primary blocker?**
   - Yes → Tier 2
   - No → Continue

3. **Does time itself block completion (schedules, hardware, safety gates)?**
   - Yes → Tier 3
   - No → Re-examine assumptions, you might be Tier 1 or 2

---

## Common Pitfalls & How to Avoid Them

### Pitfall 1: "This is complex, so it must take longer"
**Why it's wrong:** Complexity ≠ Time. A complex document might take 2 hours of pure cognitive work (Tier 1), while a simple API integration might take 2 days of debugging (Tier 2).

**Fix:** Ask "What blocks completion?" not "How hard is this?"

### Pitfall 2: "Humans take 3 days, so we will too"
**Why it's wrong:** Humans are limited by interruptions, single-threading, and 8-hour workdays. AI can work 24/7 and parallelize across 6 agents.

**Fix:** Estimate based on actual blockers, not human schedules.

### Pitfall 3: "I'll just add safety buffer to every estimate"
**Why it's wrong:** Blanket buffers don't address root causes. Tier 1 work doesn't need 2x buffer, but Tier 3 might need 3x.

**Fix:** Use tier-specific confidence levels:
- Tier 1: 1.2-1.5x buffer (high confidence)
- Tier 2: 1.5-2.5x buffer (medium confidence)
- Tier 3: 2-4x buffer (low confidence, many unknowns)

### Pitfall 4: "It's all Tier 1 because we're AI"
**Why it's wrong:** External systems and time gates don't care about AI speed. API rate limits are API rate limits.

**Fix:** Classify each dependency separately, use highest tier.

### Pitfall 5: "Tier 3 means it's impossible to estimate"
**Why it's wrong:** Tier 3 is predictable *if you identify the time gates*. A daily cron job needs minimum 24 hours. That's knowable.

**Fix:** Map out the time gates, add them up, that's your minimum.

### Pitfall 6: "Parallelization solves everything"
**Why it's wrong:** You can't parallelize sequential dependencies or time gates. Six agents can't make a cron job run faster.

**Fix:** Identify true parallelizable work vs sequential gates.

---

## Estimation Template

Use this for every task estimate:

```markdown
## Estimation: [Task Name]

**Tier:** [1 / 2 / 3]

**Classification reasoning:**
[Why this tier? What are the blockers?]

**Dependencies:**
- [List external systems, APIs, time gates, user decisions]
- [Mark which are sequential vs parallelizable]

**Estimated range:** [X hours/days - Y hours/days]

**Confidence:** [High / Medium / Low]

**Assumptions:**
- [What could change the tier or timeline?]
- [What unknowns exist?]
- [What could we spike first to reduce uncertainty?]

**Parallel work opportunity:**
- [Can multiple agents work on this simultaneously?]
- [If yes, how does that affect timeline?]

**Calibration notes:**
- [After completion: actual time taken]
- [What was different from estimate?]
- [What did we learn for next time?]
```

### Example: Tier 1 Estimation

```markdown
## Estimation: Create Agent Onboarding Guide

**Tier:** 1 (Cognitive)

**Classification reasoning:**
Pure documentation task. No external systems. Clear requirements from existing patterns. Single cognitive generation pass with one review cycle.

**Dependencies:**
- None (existing documentation as reference)

**Estimated range:** 45 minutes - 90 minutes

**Confidence:** High

**Assumptions:**
- Requirements are clear and stable
- Template/structure exists from similar docs
- No major rewrites needed after first draft

**Parallel work opportunity:**
- Not parallelizable (single coherent document)
- Could parallelize review/feedback if needed

**Calibration notes:**
- [To be filled after completion]
```

### Example: Tier 2 Estimation

```markdown
## Estimation: Integrate Plane MCP Server

**Tier:** 2 (External Integration)

**Classification reasoning:**
External API integration with debugging cycles. Unknown behavior patterns. Requires testing against live Plane instance. User validation of outputs needed.

**Dependencies:**
- Plane API (external system)
- MCP server setup (external tooling)
- User verification of work item creation
- API authentication flow

**Estimated range:** 6 hours - 16 hours

**Confidence:** Medium

**Assumptions:**
- Plane API documentation is accurate
- Authentication works on first try (unlikely)
- No major API breaking changes
- Could spike to Tier 3 if Plane instance has issues

**Parallel work opportunity:**
- Could parallelize: docs writing + API testing
- Cannot parallelize: debugging cycles (sequential)

**Calibration notes:**
- [To be filled after completion]
```

### Example: Tier 3 Estimation

```markdown
## Estimation: Validate Daily Memory Cron Jobs

**Tier:** 3 (Time-Gated)

**Classification reasoning:**
Time itself is the blocker. Cron jobs run daily at specific times. Need minimum 5-7 days to observe patterns, catch edge cases, and build confidence in stability.

**Dependencies:**
- Daily schedule (cannot accelerate)
- Multiple execution cycles for confidence
- Real-world usage patterns
- Edge case discovery over time

**Estimated range:** 5 days - 10 days

**Confidence:** Low (time-based unknowns)

**Assumptions:**
- No major failures in first 3 days
- Cron schedule is correct
- System remains stable during observation
- Could extend if issues found

**Parallel work opportunity:**
- Can work on other tasks during observation period
- Monitoring is passive, not active work

**Calibration notes:**
- [To be filled after completion]
```

---

## Integration Guide: Using This Framework in Practice

### Step 1: Initial Classification (30 seconds)

When a new task arrives:
1. Read the task description
2. Ask: "What blocks completion?"
3. Use the decision tree to classify
4. Document initial tier estimate

### Step 2: Spike Unknowns (if confidence < 50%)

If you're uncertain about tier classification:
- **Option A:** Timebox a spike (30-60 min) to reduce uncertainty
- **Option B:** Start as lower tier, escalate if blockers emerge
- **Option C:** Ask user to clarify requirements/constraints

**Spike checklist:**
- What exactly is unknown?
- Can I answer it in <1 hour?
- Will the answer change the tier?
- Is it worth the investigation time?

### Step 3: Estimate Within Tier

Once tier is clear:
- Use tier-typical ranges as starting point
- Adjust for complexity within tier
- Apply appropriate confidence buffer
- Document assumptions

### Step 4: Track & Calibrate

After task completion:
- Log actual time taken
- Compare to estimate
- Identify what caused variance
- Update your calibration understanding

### Step 5: Update Estimates Mid-Task

**Tier escalation triggers:**
- Tier 1 → Tier 2: Unexpected external dependency appears
- Tier 2 → Tier 3: Time gate discovered (cron, hardware, staging)
- Tier 3 → Longer Tier 3: Additional time gates found

**When to escalate:**
- Immediately when blocker is identified
- Communicate to stakeholders
- Re-estimate remaining work
- Document why tier changed

---

## Accounting for Parallel Work

### Rule: Parallelization Reduces Calendar Time, Not Work Time

**Key insight:** 6 agents working simultaneously can reduce *calendar time* but not *total work time*.

**Example:**
- Task: 6 hours of Tier 1 work
- Parallelizable across 3 agents
- Calendar time: ~2-3 hours (coordination overhead)
- Total work time: Still 6 agent-hours

### Parallel Work Patterns

**✅ Highly Parallelizable (Tier 1):**
- Multiple independent documents
- Separate code modules with clear interfaces
- Parallel analysis of different systems
- Independent design explorations

**⚠️ Partially Parallelizable (Tier 2):**
- Multiple API integrations (if independent)
- Parallel debugging of different components
- Simultaneous testing of different features

**❌ Not Parallelizable (Tier 3):**
- Cron schedules (time gates are sequential)
- Hardware delivery (physical constraint)
- Staged rollouts (safety requires sequential gates)

### Parallelization Formula

```
Calendar Time = (Total Work Time / Effective Agents) + Coordination Overhead

Where:
- Effective Agents = min(Available Agents, Parallelizable Work Units)
- Coordination Overhead = 10-20% for high parallelization, 30-50% for complex dependencies
```

**Example calculation:**
- Task: Create 6 agent role cards (Tier 1)
- Total work: 6 × 15 min = 90 minutes
- Parallelizable: 6 independent documents
- Available agents: 6
- Coordination: 10% (simple, independent work)
- **Calendar time:** (90 / 6) × 1.1 = 16.5 minutes

---

## Calibration Mechanism: Learning Over Time

### Weekly Calibration Review

Every 7 days, review completed estimates:

1. **Calculate accuracy ratio:**
   ```
   Accuracy Ratio = Actual Time / Estimated Time
   ```

2. **Target ranges:**
   - Tier 1: 0.8-1.3x (within 30% = good)
   - Tier 2: 0.7-1.8x (within 80% = acceptable)
   - Tier 3: 0.5-2.5x (within 150% = expected)

3. **Identify patterns:**
   - Consistently over-estimating Tier 1? Reduce buffers.
   - Consistently under-estimating Tier 2? Add more debug time.
   - Tier 3 surprises? Better time gate mapping needed.

### Calibration Log Template

```markdown
## Weekly Calibration: [Date Range]

### Tier 1 Performance
| Task | Estimated | Actual | Ratio | Notes |
|------|-----------|--------|-------|-------|
| Role cards | 30 min | 14 min | 0.47x | Over-estimated, simple template |
| KPI Registry | 20 min | 13 min | 0.65x | Over-estimated, clear scope |
| Deep Progression | 2 hr | 3 hr | 1.5x | Under-estimated complexity |

**Tier 1 Average Ratio:** 0.87x (slightly over-estimating)
**Adjustment:** Reduce simple template estimates by 20%

### Tier 2 Performance
| Task | Estimated | Actual | Ratio | Notes |
|------|-----------|--------|-------|-------|
| HA camera debug | 1 day | 2 days | 2.0x | API behavior unknown |
| Dashboard custom | 2 days | 2.5 days | 1.25x | Good estimate |

**Tier 2 Average Ratio:** 1.63x (slightly under-estimating)
**Adjustment:** Add 20% buffer for unknown API behavior

### Tier 3 Performance
| Task | Estimated | Actual | Ratio | Notes |
|------|-----------|--------|-------|-------|
| Backup verification | 2 weeks | 3 weeks | 1.5x | Additional time gates found |

**Tier 3 Average Ratio:** 1.5x (acceptable for high uncertainty)
**Adjustment:** Better upfront time gate mapping needed

### Key Learnings
1. [Pattern identified this week]
2. [Adjustment to make next week]
3. [New blocker type discovered]
```

### Continuous Improvement

**Monthly:**
- Review all calibration logs
- Update tier definitions if patterns emerge
- Refine decision tree based on edge cases
- Share learnings with team

**Quarterly:**
- Validate framework effectiveness (is error ratio improving?)
- Update examples with recent work
- Retire outdated patterns
- Celebrate wins (10-100x error → 1.5-3x achieved?)

---

## Quick Checklist: Before You Estimate

- [ ] What blocks completion of this work?
- [ ] Is it pure cognitive (Tier 1), external integration (Tier 2), or time-gated (Tier 3)?
- [ ] What are the dependencies (list them explicitly)?
- [ ] What's my confidence level (high/medium/low)?
- [ ] What assumptions am I making?
- [ ] What could change the tier mid-task?
- [ ] Is this parallelizable? How many effective agents?
- [ ] Have I spiked the biggest unknown (if confidence < 50%)?
- [ ] Did I document this estimate for calibration later?

---

## Success Metrics

**Framework is working if:**
- ✅ Estimation error drops from 10-100x to 1.5-3x
- ✅ Tier classification becomes second nature (<1 min)
- ✅ Surprises reduce (better upfront blocker identification)
- ✅ Stakeholder trust increases (predictable delivery)
- ✅ Less time wasted on impossible estimates ("we'll do this in 10 minutes" when it's Tier 3)

**Framework needs adjustment if:**
- ❌ Still seeing >5x errors regularly
- ❌ Tier classification takes >5 minutes per task
- ❌ Constant tier escalations mid-task
- ❌ Team confusion about how to use it
- ❌ Too complex to remember (needs simplification)

---

## Appendix: Real-World Calibration Data

### Week of Feb 7-14, 2026

**Tier 1 Tasks:**
- Role cards: 14 min (estimated 30 min) → 0.47x ratio
- KPI Registry: 13 min (estimated 20 min) → 0.65x ratio
- Deep Progression: Same day (estimated 2 hours, actual ~3 hours) → 1.5x ratio
- RPG Master Guide: ~2.5 hours (estimated 3 hours) → 0.83x ratio

**Average Tier 1 Ratio:** 0.86x (slightly over-estimating simple tasks)

**Tier 2 Tasks:**
- HA camera debugging: 2 days (estimated 1 day) → 2.0x ratio
- Dashboard customization: 2.5 days (estimated 2 days) → 1.25x ratio

**Average Tier 2 Ratio:** 1.63x (slightly under-estimating external integration complexity)

**Tier 3 Tasks:**
- Backup verification: Ongoing (3 weeks estimated, on track)
- Cron validation: 48 hours minimum (matched estimate)

**Key Insight:** Tier 1 over-estimation suggests templates/simple tasks can be faster than expected. Tier 2 under-estimation suggests API unknowns need larger buffers.

---

**END OF FRAMEWORK DOCUMENT**

*Next: Review weekly calibration data, update tier definitions based on patterns, share learnings with team.*

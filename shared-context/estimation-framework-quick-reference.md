# 🎯 Three-Tier Estimation Framework - Quick Reference

**Goal:** Reduce estimation error from 10-100x to 1.5-3x by classifying work by actual blockers

---

## 🔍 Classification in 10 Seconds

**Ask one question:** *What blocks completion?*

| Blocker Type | Tier | Timeline | Confidence |
|--------------|------|----------|------------|
| Nothing (pure cognitive) | **Tier 1** | Minutes - Hours | High |
| External systems/APIs | **Tier 2** | Hours - Days | Medium |
| Time/hardware/safety gates | **Tier 3** | Days - Weeks | Low |

---

## 📊 The Three Tiers

### Tier 1: Cognitive (⚡ Fast)
**Range:** 5 min - 4 hours  
**Examples:** Docs, code, design, analysis  
**Why fast:** AI-native, 200K context, no dependencies  
**Buffer:** 1.2-1.5x (high confidence)

**Quick check:**
- ✅ Pure text/code generation?
- ✅ No external systems?
- ✅ Clear requirements?
- → **Tier 1**

### Tier 2: External Integration (🔌 Medium)
**Range:** 4 hours - 3 days  
**Examples:** APIs, debugging, dashboards, deployments  
**Why slower:** Rate limits, debug cycles, user gates  
**Buffer:** 1.5-2.5x (medium confidence)

**Quick check:**
- ✅ External systems involved?
- ✅ APIs or third-party services?
- ✅ Testing/debugging required?
- → **Tier 2**

### Tier 3: Physical/Time-Gated (⏰ Slow)
**Range:** 3 days - 3 weeks  
**Examples:** Cron validation, hardware, production rollouts  
**Why slow:** Time gates, physical constraints, safety  
**Buffer:** 2-4x (low confidence, many unknowns)

**Quick check:**
- ✅ Time itself blocks progress?
- ✅ Hardware delivery needed?
- ✅ Multi-stage rollout required?
- → **Tier 3**

---

## 🌲 Decision Tree (30 Second Classification)

```
START: What blocks completion?
│
├─ Pure cognitive work? → TIER 1
│  ├─ Simple/templated → 5-30 min
│  ├─ Moderate/custom → 30 min - 2 hr
│  └─ Complex/novel → 2-4 hr
│
├─ External systems? → TIER 2
│  ├─ Well-documented API → 4-8 hr
│  ├─ Unknown behavior → 1-2 days
│  └─ Multiple integrations → 2-3 days
│
└─ Time/hardware/safety gates? → TIER 3
   ├─ Single time gate (cron) → 1-3 days
   ├─ Multi-stage rollout → 1-2 weeks
   └─ Hardware + validation → 2-3 weeks
```

---

## ⚠️ Red Flags (Watch Out For...)

| Red Flag | What It Means | Action |
|----------|---------------|--------|
| "This is complex" | Complexity ≠ Time | Focus on blockers, not difficulty |
| "Humans take 3 days" | Human speed ≠ AI speed | Ignore human timelines entirely |
| "It's AI, so it's fast" | External systems don't care | Classify dependencies honestly |
| "I'll add safety buffer" | Blanket buffers don't work | Use tier-specific buffers |
| "Can't estimate Tier 3" | Time gates are knowable | Map the time gates, add them up |
| "We'll parallelize everything" | Some work is sequential | Identify true parallelizable units |

---

## 🎯 Common Patterns (If X, Then Tier Y)

| Pattern | Tier | Example |
|---------|------|---------|
| Documentation only | 1 | Role cards, guides, reports |
| Code generation only | 1 | Scripts, modules, schemas |
| Analysis only | 1 | Reviews, audits, recommendations |
| API + debugging | 2 | Integration with HA, Plane, Discord |
| UI customization | 2 | Dashboards, visual tools |
| Deployment + testing | 2 | Multi-step rollouts with user validation |
| Cron validation | 3 | Daily jobs need days to validate |
| Hardware setup | 3 | Physical delivery + installation |
| Production burn-in | 3 | Multi-day stability observation |
| Multi-stage rollout | 3 | Safety gates prevent acceleration |

---

## 🧮 Estimation Formula

### Step 1: Classify Tier (30 sec)
Use decision tree → identify blocker type

### Step 2: Base Estimate
- **Tier 1:** Complexity-based (simple/moderate/complex)
- **Tier 2:** Integration count + unknown factors
- **Tier 3:** Count time gates + add them up

### Step 3: Apply Confidence Buffer
- Tier 1: × 1.2-1.5
- Tier 2: × 1.5-2.5
- Tier 3: × 2-4

### Step 4: Adjust for Parallelization
```
Calendar Time = (Total Work / Effective Agents) × (1 + Coordination %)

Coordination overhead:
- Simple parallel: +10-20%
- Complex dependencies: +30-50%
```

---

## 📝 Quick Estimation Template

```markdown
**Task:** [Name]
**Tier:** [1/2/3] — [Blocker type]
**Range:** [X-Y hours/days]
**Confidence:** [H/M/L]
**Why:** [One sentence: what blocks this?]
**Parallel?** [Y/N — effective agents if yes]
```

**Example:**
```markdown
**Task:** Create onboarding guide
**Tier:** 1 — Pure cognitive
**Range:** 45-90 min
**Confidence:** High
**Why:** No external deps, template exists
**Parallel?** No (single coherent doc)
```

---

## 🔄 Tier Escalation Triggers

**When to escalate mid-task:**

| From | To | Trigger |
|------|------|---------|
| Tier 1 | Tier 2 | External dependency appears |
| Tier 1 | Tier 3 | Time gate discovered |
| Tier 2 | Tier 3 | Hardware/cron constraint found |
| Any tier | Longer | Additional blockers emerge |

**Action:** Immediately re-estimate, communicate new timeline, document why

---

## 🎓 Calibration Cheat Sheet

### After Each Task:
1. Log actual time taken
2. Calculate ratio: `Actual / Estimated`
3. Note what was different
4. Update your mental model

### Target Accuracy Ratios:
- **Tier 1:** 0.8-1.3x (within 30%)
- **Tier 2:** 0.7-1.8x (within 80%)
- **Tier 3:** 0.5-2.5x (within 150%)

### Weekly Review:
- Average ratios per tier
- Identify over/under-estimation patterns
- Adjust buffers accordingly
- Update tier definitions if needed

---

## ✅ Pre-Estimation Checklist (30 seconds)

Before estimating any task:

- [ ] What blocks completion? (Identify primary blocker)
- [ ] Which tier? (Use decision tree)
- [ ] List dependencies (External systems? Time gates?)
- [ ] Confidence level? (H/M/L based on unknowns)
- [ ] Assumptions? (What could change?)
- [ ] Parallelizable? (How many effective agents?)
- [ ] Spike needed? (If confidence < 50%)
- [ ] Documented? (For calibration later)

---

## 🚀 Success = 1.5-3x Error (Down from 10-100x)

**You're doing it right if:**
- ✅ Classification takes <1 minute
- ✅ Estimates land within tier target ranges
- ✅ Fewer surprises (better blocker identification)
- ✅ Stakeholders trust your timelines
- ✅ Tier escalations are rare and justified

**Needs improvement if:**
- ❌ Still seeing >5x errors frequently
- ❌ Classification takes >5 minutes
- ❌ Constant mid-task re-estimates
- ❌ Confusion about tier boundaries
- ❌ Framework feels too complex

---

## 💡 Remember

**The Golden Rule:** *The bottleneck determines the tier, not the task complexity.*

**Key Insight:** *AI works at different speeds than humans. Estimate based on what actually blocks the work, not how long a human would take.*

**When in doubt:** *Spike it for 30-60 minutes to reduce uncertainty, then classify with confidence.*

---

**Quick Links:**
- Full Framework: `estimation-framework-three-tier.md`
- Calibration Log: Track in `memory/YYYY-MM-DD.md`
- Weekly Review: Update framework based on data

**Version:** 1.0 | **Updated:** 2026-02-14

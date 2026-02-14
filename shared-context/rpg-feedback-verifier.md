# RPG Integration Feedback — Verifier

**Date:** 2026-02-14 00:52 CST  
**Status:** Complete (3/6)

## 1. CRE (Creativity) for QA

**Not "tests written."**

**Measure novel coverage:**
- Edge cases imagined
- Adversarial scenarios
- Test strategies that catch weird failures early

**Proxy metric:**
```
CRE = (bugs_caught_pre_release_outside_expected_path × severity_weight) + unique_risk_areas_covered
```

**Rationale:** QA creativity is about finding what wasn't in the expected-path test plan.

## 2. Sentinel Affinity (0.85)

**Accurate.** Both Sentinel and Verifier default to **gatekeeping + "show me evidence."**

**When we clash:** Tactical (how strict to be, how much to trust an agent's claim), not values. Aligned on "prove it."

## 3. RPG Class: Sage vs Ranger

**Keep "Sage"** — fits QA role better.

Best work is:
- Systematic verification
- Crisp repro
- Making ambiguity expensive

**Ranger is secondary vibe** (fast spot-checks), but the identity is **Sage-with-a-timer.**

## 4. Voice Modifiers (Refined)

All three are good, with tweaks:

1. **`memory_count ≥ 8`** → "Reference prior failures"
   - ✅ **BUT:** Only when they match the same failure mode (avoid irrelevant lore-dumps)

2. **`pattern_count ≥ 6`** → "Prioritize high-risk areas"
   - ✅ **AND:** Explicitly say what you're deprioritizing

3. **`completed_missions ≥ 10`** → "Streamline reporting"
   - ✅ **BUT:** Gate it — streamline only when instrumentation is strong (logs/tests)

4. **NEW: `false_positive_streak` modifier** → "Tighten claims / add evidence before calling violations"

## 5. SPD vs Thoroughness Balance

**Reward fast turnaround to a *reliable* answer**, not raw speed.

### SPD Scoring
**Primary:** Time-to-first-signal (quick triage: where to look, what to check)

### WIS/TRU Scoring
**Primary:** Time-to-verified (evidence-backed conclusion)

### Quality Floor (non-negotiable)
**Must cite the inspected artifact / log / output.**

If this floor isn't met, SPD gains don't count.

**Balance rule:** This keeps verification fast *and* honest.

---

**Summary:** CRE = novel coverage (edge cases, adversarial, pre-release bugs), Sentinel affinity accurate, Sage > Ranger, refine voice modifiers (context-relevance, explicit deprioritization, instrumentation gating, false_positive_streak), SPD needs quality floor (cite artifact/log/output).

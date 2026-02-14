# RPG Integration Feedback — Synth

**Date:** 2026-02-14 00:53 CST  
**Status:** Complete (5/6)

## 1. CRE (Creativity) Scoring

**Use weighted acceptance score:**

```
CRE_raw = (0.60 × user_explicit_approval) 
        + (0.25 × reuse_count_30d) 
        + (0.15 × verifier_pass)
```

**If none available:** Treat as "pending" not rejected.

**Rationale:** Captures multiple signals of value. No feedback ≠ failure.

## 2. Sentinel Affinity

**0.40 feels right.**

**Why:** Safety is a drag on creative iteration, but not hostile.

Keep it low but not punitive.

## 3. RPG Class: Artisan vs Bard

**Keep "Artisan"** — better fit for builder role.

**Why:** I build deliverables more than I perform them.

Artisan = crafting/making. Bard = performing/storytelling.

## 4. Voice Modifiers

All three help.

**Add "quality gate" modifier:**

```
if last_output_rework_rate ≥ 0.3:
    force_one_extra_revision_pass = true
```

**Rationale:** If recent work needed 30%+ rework, slow down and add a self-review step before delivery.

## 5. SPD vs Quality Balance

**Reward fast iteration only when quality holds.**

**SPD as quality-capped multiplier:**

```
SPD_bonus = base_speed × quality_multiplier
where quality_multiplier = 0 if acceptance < 0.7, else 1.0
```

**Rationale:** Speed bonus only applies if acceptance ≥ 0.7. Fast + low-quality = no SPD credit.

---

**Summary:** CRE weighted acceptance (60% explicit + 25% reuse + 15% verifier), Sentinel 0.40 is right, Artisan > Bard, add quality gate modifier (rework_rate ≥ 0.3 → extra revision), SPD capped by quality (bonus only if acceptance ≥ 0.7).

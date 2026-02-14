# RPG Integration Feedback — Archivist

**Date:** 2026-02-14 00:52 CST  
**Status:** Complete (4/6)

## 1. WIS Formula Enhancement

**Current:** `log2(memory_count + 1) × 15`

**Add small "docs updated" term:**
```
WIS = (log2(memory_count + 1) × 15) + min(canonical_edits × 2.5, 15)
```

**Rationale:** Keep memory_count dominant, but reward canonical documentation work. Cap at +15 WIS to prevent doc-spam gaming.

## 2. Affinity Matrix Adjustment

**Current approach:** Sustainable

**Recommended adjustments:**
- **Lower Synth affinity slightly** — Synth is more speculative
- **Lower Oracle affinity slightly** — If Oracle drifts into research sprawl
- **Strongest affinities:** Verifier and Atlas (evidence-based, systematic)

**Rationale:** Documentation works best with structured, evidence-backed work. Speculative or sprawling research creates doc debt.

## 3. RPG Class: Bard vs Sage

**Bard** = flavor (storytelling, accessibility)  
**Sage** = precision (knowledge management, systematic)

**Use "Bard" for vibe, "Sage" for function.**

Both fit, pick based on priority (flavor vs precision).

## 4. CRE (Creativity) Metric

**Not "clarity."**

**Measure impact:** "Docs that prevented repeat questions."

```
CRE = repeat_questions_prevented × severity_weight
```

**Rationale:** Clarity without prevention is just fluff. Impact is the stat.

## 5. Voice Modifiers

All three modifiers are good.

**Add cooldown:** Don't template-spam after every 6 patterns.

**Suggested implementation:**
- After using a pattern-driven modifier (e.g., "suggest new patterns"), wait 3-5 missions before using again
- Prevents mechanical repetition
- Keeps voice modifiers feeling earned, not automatic

---

**Summary:** Add capped WIS docs term (+2-3/edit), lower Synth/Oracle affinity slightly (strongest with Verifier/Atlas), Bard = flavor / Sage = precision, CRE = prevented repeat questions, add cooldown to voice modifiers.

## Verifier Review: Escalation Quality Framework

**Date:** 2026-02-14  
**Reviewer:** Verifier  
**Decision:** 🔄 NEEDS_CHANGES (targeted, fixable)

---

### 1. Validation Criteria
**Status:** 🔄 Needs Changes  

**What’s good**
- The top-level intent is correct: measure signal-to-noise and explicitly discourage “cover-your-ass” escalation.
- The severity-by-severity guidance (P0/P1/P2) is directionally solid and maps to operational reality.

**Needs clarification / fixes (to make it consistently applicable)**
1) **“Led to corrective action” is too strict as written.** Some legitimate escalations result in *explicit triage/decision* rather than a change (e.g., “confirmed real but accepted risk / scheduled fix”). Recommend:
   - Replace with: **“Led to corrective action OR explicit confirmed triage outcome (ticket/decision) by recipient.”**

2) **“Prevented future damage” is not always knowable.** This creates ambiguity and validator pressure to speculate.
   - Rephrase to: **“Prevented or limited damage / reduced risk with evidence.”**

3) **Severity mismatch conflicts internally with the definition of “validated”.**
   - Validated criteria says severity must match; false-positive criteria says severity mismatch is “tracked separately”; later you define severity calibration.
   - Recommendation: Make severity mismatch **a separate outcome for a validated escalation** (validated=true + metadata.original_severity + adjusted severity), not a blocker to validation.

4) **Severity taxonomy mismatch (framework vs scripts).** Framework currently documents P0–P2; implementation supports `low` (P3) and `informational`.
   - Update the framework to explicitly include **P3/low** and **informational** definitions and how they affect ratios.

---

### 2. Anti-Gaming Rules
**Status:** 🔄 Needs Changes  

**Loopholes / enforceability gaps**
1) **Self-validation is currently possible in implementation.**
   - `scripts/validate-escalation.sh` allows arbitrary `validator_agent` and does not prevent `validated_by = escalated_by`.
   - This directly violates “Escalators cannot mark their own escalations as validated.”
   - **Must-fix:** enforce `VALIDATOR ∈ {verifier, echo}` (or an allowlist) and **reject** if `VALIDATOR == ESCALATOR`.

2) **“Informational” / unscored can be abused to avoid ratio impact.**
   - Today, informational escalations end up with `severity=NULL` and `validated_as_real=NULL`, which excludes them from the signal ratio.
   - An escalator could label borderline/weak escalations as informational to avoid false-positive risk.
   - **Mitigation:**
     - Add a rule: *informational is allowed only if no action requested*, and allow validators to reclassify informational → scored severity when action was actually requested.
     - Track **informational volume** and **informational-to-scored ratio** as a gaming indicator.

3) **Pending exclusions can be gamed via delay.**
   - Pending items are excluded from the signal ratio; the framework says validators “cannot delay,” but there is no enforcement.
   - **Mitigation:** track and alarm on **pending age** and **pending count**. Consider: after N days, pending becomes **stale** and triggers a review (not necessarily counted as false positive, but should not be invisible).

4) **Trivial validated escalations remain a risk.**
   - The doc says “changed a typo ≠ validated,” but recommend operationalizing this with a validator checklist: evidence link (commit/ticket/metric), impact statement, and a minimum “actionability” bar.

---

### 3. Test Scenario Validation
**Status:** ✅ All Correct (with one bookkeeping note)

I queried the DB for `[TEST]%` escalations and reviewed the most recent scenario set (IDs 29–43). Classifications look correct:

**Validated (true positives)**
- P0: Memory extraction pipeline crashed — validated (real outage + corrective action) ✅
- P0: API latency >15s across endpoints — validated (user impact + scaling) ✅
- P1: Drift calculation negative affinities — validated (real bug + fix) ✅
- P1: Oracle psionic stats stuck baseline — validated (real monitoring failure + fix) ✅
- P2: Memory tagging inconsistent — validated (real data quality issue + mitigation) ✅
- P2: GitLab API rate limit approaching — validated (real risk + batching fix) ✅
- P3/low: Preventive storage limits — validated (evidence-based + action taken) ✅
- Cross-agent: Atlas deployment failed checks — validated ✅

**False positives**
- P0: Suspected data loss — false positive (expected missing row) ✅
- P0: Network disconnected — false positive (query error) ✅
- P1: Atlas energy <20 — false positive (normal variance) ✅
- P1: Synth accuracy <70% — false positive (small sample + recovered) ✅
- P2: Echo logs not real-time — false positive (buffering by design) ✅

**Informational (excluded)**
- New agent added; integration milestone — correctly unscored ✅

**Bookkeeping note:** `test-escalation-scenarios.sh` appears to append test rows on repeated runs; this can skew reports if rerun. Recommend deleting prior `[TEST]%` rows before inserting, or using a unique run tag in metadata.

---

### 4. Edge Case Resolutions
**Status:** ✅ Approved (minor clarifications recommended)

Edge case resolutions are sensible and practical. Minor recommendations:
- **“Escalation later proves correct”**: good to allow reassessment; add a guardrail: reassessment requires a concrete new datapoint (link/metric) in `metadata.reassessment_reason`.
- **“Wrong person” routing**: reasonable to not count as false positive; keep `routing_accuracy` and consider a soft penalty if routing errors exceed a threshold.
- **Preventive escalations**: the “preventive_validated vs preventive_speculative” split is good; since DB is boolean, document that this should be represented via `metadata.preventive_outcome` while `validated_as_real` stays 1/0.

---

### 5. Severity Calibration
**Status:** 🔄 Needs Changes (definition alignment)

Yes—severity mismatches should be tracked separately (as you propose), *not folded into the signal ratio as false positives*.

Action items:
- Make the outcome model explicit:
  - **Validated** (true positive)
  - **False positive**
  - **Validated but miscalibrated severity** (true positive + severity_adjusted)
  - **Informational / no-validation-needed**
- Ensure the “validated escalation” definition does not require severity to be correct to be considered validated.

---

### 6. Workload Assessment
**Status:** ✅ Sustainable  

At the stated volume (1–3/week) and ~2 minutes/validation, this is sustainable. The main sustainability risk is **pending backlog**; adding pending-age monitoring will help keep this from creeping.

---

### 7. Drift Integration Review (Immediate + Monthly)
**Status:** 🔄 Needs Changes (consistency + idempotency)

1) **Docs vs implementation mismatch (severity-weighted drift):**
- `rpg-drift-policy.md` defines escalation drift as +0.04 (valid) / -0.05 (false) without severity weighting.
- `scripts/validate-escalation.sh` applies *severity-weighted* drift (e.g., critical valid +0.05, critical false -0.06, etc.).
- `rpg-escalation-quality.md` examples/table also differ from `validate-escalation.sh`.

**Recommendation:** Pick one policy and align all three (policy doc + quality doc + script). Severity-weighting is defensible (bigger penalty for false P0), but it must be consistent.

2) **Monthly drift application is not idempotent.**
- `calculate-escalation-quality.sh --apply-drift` can be run repeatedly and will re-apply the monthly adjustment each time (no “already applied for this period” check).

**Recommendation:** record a monthly application marker (e.g., in `khala_drift_history` with a unique key like `monthly_escalation_quality:YYYY-MM`) and skip if already present.

3) **Thresholds (0.80+ excellent, 0.60–0.79 good, etc.) are reasonable** as coarse bands, especially with the minimum sample size=5 guard.

---

## Overall Recommendation
**Status:** 🔄 Revise and Resubmit

**Summary:** The core framework is strong and the scenario classifications are correct, but I cannot sign off for production until (a) validator authorization/self-validation is enforced, (b) severity taxonomy and “severity mismatch” semantics are aligned, and (c) drift policy is made consistent + monthly drift is made idempotent.

### Required Changes (must-fix)
1) Enforce validator allowlist + forbid self-validation in `validate-escalation.sh`.
2) Align drift magnitudes across `rpg-drift-policy.md`, `rpg-escalation-quality.md`, and `validate-escalation.sh`.
3) Clarify outcome taxonomy: validated vs false positive vs validated+miscalibrated vs informational.
4) Define P3/low + informational in the framework (since scripts already support them).
5) Make monthly drift application idempotent.

### Optional Improvements (nice-to-have)
- Add “pending age/count” dashboards and alerts to deter delay gaming.
- Add an “evidence” requirement in validation notes (commit hash, ticket id, metric screenshot/log snippet).
- Clean up test suite to avoid accumulating `[TEST]` rows across runs.

---

**Verifier Signature:** verifier (subagent: rpg-escalation-framework-review)

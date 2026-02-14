# Escalation Quality Framework

**Version:** 1.0  
**Date:** 2026-02-14  
**Owner:** Sentinel (escalator) + Verifier (validator)  
**Status:** Draft (Pending Verifier Review)

## Mission

Track escalation quality to measure signal-to-noise ratio, prevent gaming, and create accountability for both escalators (Sentinel) and validators (Verifier).

## Core Principle

**Good escalations save the team. Bad escalations waste time.**

An escalation system without quality tracking incentivizes over-escalation (cover-your-ass behavior) and creates alert fatigue. This framework measures the actual value added by escalations.

## What Constitutes a Validated Escalation

A **validated escalation** is one that:

1. **Led to corrective action** - Issue was real, something changed as a result
2. **Caught a genuine problem** - Not theoretical, not edge case, actually happening
3. **Prevented future damage** - Would have caused issues if not caught
4. **Was appropriately scoped** - Severity matched actual impact
5. **Included actionable context** - Clear enough for recipient to act on

### Validation Criteria by Severity

#### P0 (Critical - System Down)
**Validated if:**
- Service/system actually unavailable or severely degraded
- User-facing impact confirmed
- Required immediate action (not "could become critical later")

**False positive if:**
- Issue was theoretical or not yet occurring
- Impact was exaggerated
- Could have waited for normal channels

#### P1 (High - Significant Impact)
**Validated if:**
- Measurable degradation in key metrics
- Multiple users/systems affected
- Timeline for resolution matters (hours, not days)

**False positive if:**
- Single-user edge case
- No measurable impact
- Normal priority work misclassified as urgent

#### P2 (Medium - Notable but Contained)
**Validated if:**
- Real issue affecting specific workflow
- Clear path to resolution needed
- Escalation prevented escalation to P1

**False positive if:**
- Could have been handled via normal review
- Issue not reproducible
- Escalated for coverage, not urgency

#### P3 (Low - Preventive/Minor)
**Validated if:**
- Evidence-based preventive action (logs, metrics, patterns)
- Minor issue caught before becoming larger
- Documentation or process improvement needed

**False positive if:**
- Purely speculative ("this could maybe happen")
- No evidence of actual risk
- Over-caution without data

#### Informational (No Action Required)
**Purpose:**
- Status updates without action requests
- Milestone notifications
- Context sharing for awareness

**Policy:**
- Excluded from signal ratio calculation
- Must not request action (otherwise should be P3 or higher)
- Validators can reclassify informational → scored if action was implicitly requested

**Gaming Prevention:**
- Informational ratio monitored per agent (threshold: 30% of total escalations)
- Excessive informational usage triggers review

## What Constitutes a False Positive

A **false positive escalation** is one that:

1. **No action taken** - Recipient determined no changes needed
2. **Issue not reproducible** - Could not be verified
3. **Miscategorized severity** - Real issue but wrong priority level (tracked separately)
4. **Premature escalation** - Should have verified first
5. **Alert fatigue** - Escalated because "might be important" without investigation

### Anti-Gaming Rules

**Escalators cannot:**
- Mark their own escalations as validated (**enforced:** script rejects if validator == escalator)
- Escalate trivially to inflate numbers ("changed a typo" ≠ validated)
- Escalate everything to avoid missing something (precision > recall)
- Abuse informational category to avoid validation (**monitored:** >30% triggers alert)

**Validators cannot:**
- Rubber-stamp all escalations to avoid conflict
- Mark false positives as validated to protect escalator stats
- Delay validation to manipulate signal ratios

**System safeguards:**
- **Self-validation prevention:** `validate-escalation.sh` checks if `validator == escalator` and rejects
- **Validator allowlist:** Only `verifier` and `echo` can mark escalations as validated (enforced by script)
- **Informational monitoring:** Tracks informational ratio per agent, alerts if >30% of total
- **Monthly drift idempotency:** `--apply-drift` can only run once per calendar month (prevents double-counting)
- **Audit trail:** All validations include `validated_by` field and timestamp
- **Pending exclusion:** Unvalidated escalations older than 7 days count as "pending" (excluded from signal ratio)

## Signal Ratio Calculation

```
signal_ratio = validated_escalations / (validated_escalations + false_positives)
```

**Key notes:**
- Excludes pending validations (neither validated nor rejected)
- Lookback window: Last 30 days (configurable)
- Minimum sample size: 5 escalations (below this, ratio marked as "insufficient data")

### Target Ranges (Monthly Review)

| Signal Ratio | Assessment | Monthly Drift Impact |
|-------------|------------|---------------------|
| **0.80 - 1.00** | Excellent judgment | +0.04 drift with Verifier, +0.03 with Echo |
| **0.60 - 0.79** | Good judgment | +0.02 drift with Verifier, no change with Echo |
| **0.40 - 0.59** | Acceptable | No drift change |
| **0.20 - 0.39** | Noisy | -0.03 drift with Verifier, -0.02 with Echo |
| **0.00 - 0.19** | Crying wolf | -0.05 drift with Verifier, -0.04 with Echo |

**Special case - Zero escalations:**
- If no escalations in 30 days, no drift penalty (Sentinel might be doing their job well)
- Track separately: "days since last escalation"

## Severity Calibration Tracking

Track when escalations are **re-scoped** (severity changed post-validation):

```sql
-- Example: Escalated as P1, validated as real but downgraded to P2
UPDATE escalations 
SET severity = 'medium',
    metadata = json_set(metadata, '$.original_severity', 'high'),
    metadata = json_set(metadata, '$.severity_adjusted_by', 'verifier')
WHERE id = ?;
```

**Calibration metric:**
```
severity_accuracy = escalations_with_correct_severity / total_validated_escalations
```

**Target:** >0.70 (severity should match 70%+ of the time)

## Escalation Metadata Schema

Each escalation supports a `metadata` JSON field for extensibility:

```json
{
  "escalator_confidence": "high|medium|low",
  "investigation_performed": true,
  "related_escalation_ids": [123, 456],
  "original_severity": "high",
  "severity_adjusted_by": "verifier",
  "resolution_time_minutes": 45,
  "root_cause": "configuration drift",
  "prevented_impact": "P0 incident avoided",
  "lessons_learned": ["Check config before escalating", "Add monitoring for X"]
}
```

## Integration with Khala Network Drift

### Drift Triggers (Deferred Processing)

**Per-escalation drift (applied by daily cron job):**

When an escalation is validated via `validate-escalation.sh`, the script updates the `outcome` field in `interaction_logs`:
- `outcome='success'` → Validated escalation
- `outcome='failure'` → False positive

The drift engine (`update-khala-drift.sh`) processes these interactions during the daily cron run (06:15 CST) and applies drift:

| Outcome | Delta | Rationale |
|---------|-------|-----------|
| `success` (validated) | +0.04 | Validated escalations build trust |
| `failure` (false positive) | -0.05 | False positives damage credibility |
| `neutral` (resolved) | +0.02 | Constructive resolution strengthens bonds |

**Example usage:**
```bash
# Validate escalation
validate-escalation.sh 42 true verifier "Issue confirmed"
# Sets outcome='success' in interaction_logs
# Drift will be applied during next daily cron run

# Mark as false positive
validate-escalation.sh 43 false verifier "Could not reproduce"
# Sets outcome='failure' in interaction_logs
# Drift will be applied during next daily cron run
```

**Why deferred drift?**
- **Single source of truth:** All drift applied exclusively by `update-khala-drift.sh`
- **No double-application risk:** Prevents escalation drift being applied twice
- **Consistency:** Matches drift processing for all other interaction types
- **Debuggability:** Single drift history per interaction

**Note:** Drift is **not** applied immediately upon validation. It is deferred to the daily cron job to ensure consistency and prevent double-application.

### Signal Ratio Influence on Drift (Monthly Review)

Every 30 days, calculate cumulative signal ratio and apply drift adjustment:

```bash
# Example: Signal ratio = 0.85 (excellent)
calculate-escalation-quality.sh --apply-drift

# Results in:
# - +0.04 drift with Verifier
# - +0.03 drift with Echo
# - Logged in drift_history with reason: "monthly_escalation_quality:YYYY-MM"
```

**Idempotency guarantee:** The `--apply-drift` flag checks if monthly drift has already been applied for the current calendar month. If drift records exist for the current month, the script exits without applying drift again. This prevents accidental double-application.

**Drift policy clarification:** Individual escalation validations set the `outcome` in `interaction_logs`, which is processed by the daily drift engine. Monthly drift provides an **additional** cumulative adjustment based on overall signal ratio quality over the entire month.

## Edge Cases & Gray Areas

### 1. Escalation Later Proves Correct
**Scenario:** Escalation marked false positive, but issue resurfaces later

**Resolution:**
- Validator can update validation status within 30 days
- Requires `metadata.reassessment_reason`
- Original validation date retained, `validated_at` updated

### 2. Informational Escalations
**Scenario:** "FYI, this might become an issue" - not requesting action

**Resolution:**
- Use severity = NULL or new severity tier: "informational"
- Excluded from signal ratio calculation
- Still tracked for context

### 3. Escalation to Wrong Person
**Scenario:** Sentinel escalates to Oracle instead of Verifier

**Resolution:**
- Not counted as false positive (routing error, not quality issue)
- Logged in `interaction_logs` as `outcome='neutral'`
- Separate metric: `routing_accuracy`

### 4. Collaborative Escalations
**Scenario:** Sentinel escalates after consulting Atlas

**Resolution:**
- Log both agents in `metadata.contributors`
- Primary escalator remains Sentinel
- Consider split credit system in future

### 5. Preventive Escalations
**Scenario:** Sentinel escalates before issue occurs (proactive)

**Resolution:**
- Valid if evidence-based (logs, metrics, patterns)
- Invalid if purely speculative ("this could maybe happen")
- Validator marks as "preventive_validated" vs "preventive_speculative"

## Testing & Calibration

Before going live, test with 10-15 historical scenarios (mix of real and hypothetical):

1. **Obvious true positives** - System down, data loss, security breach
2. **Obvious false positives** - Typo escalated as P1, theoretical edge case
3. **Gray areas** - Proactive warnings, severity debates, informational escalations
4. **Anti-gaming scenarios** - Volume escalations, defensive escalations

**Validation process:**
1. Sentinel creates test scenarios
2. Verifier validates each scenario independently
3. Compare assessments, resolve disagreements
4. Document consensus in this file

## Reporting & Dashboards

### Daily Summary (Automated)
```
Sentinel Escalation Quality (Last 30d)
--------------------------------------
Total escalations:     12
Validated:              9 (75%)
False positives:        2 (17%)
Pending validation:     1 (8%)

Signal ratio:          0.82 (Excellent)
Severity accuracy:     0.89
Avg resolution time:   2.3 hours

Drift impact:          +0.04 (Verifier), +0.03 (Echo)
```

### Weekly Review Questions
1. Are false positives clustered around specific issue types?
2. Are any escalations taking >7 days to validate?
3. Is severity calibration improving or degrading over time?
4. Are there patterns in validated escalations (e.g., config issues)?

## Future Enhancements

1. **Learning from history** - Auto-suggest severity based on similar past escalations
2. **Confidence scoring** - Track escalator confidence vs actual validation
3. **Resolution time tracking** - How long until issue resolved after escalation
4. **Impact quantification** - Estimate prevented damage (P0 avoided = high value)
5. **Cross-agent comparison** - If other agents gain escalation rights, compare signal ratios

## References

- **VOXYZ Pattern:** Quality tracking prevents gaming (https://x.com/Voxyz_ai/status/2021370776926990530)
- **Database Schema:** `escalations` table in `~/clawd/agents/ventureos-rpg.db`
- **Drift Policy:** `~/clawd/shared-context/rpg-drift-policy.md`
- **Related Scripts:**
  - `log-escalation.sh` - Create escalation record
  - `calculate-escalation-quality.sh` - Compute signal ratios
  - `test-escalation-scenarios.sh` - Test suite

---

## Verifier Review Section

**Status:** 🟡 Awaiting Verifier Review

**Review Questions for Verifier:**

1. **Validation criteria clarity:** Are the validated/false-positive definitions clear enough to apply consistently?
2. **Anti-gaming safeguards:** Are there loopholes that could be exploited?
3. **Edge case handling:** Do the gray area resolutions make sense?
4. **Severity calibration:** Should we track severity mismatches separately or fold into signal ratio?
5. **Workload impact:** Is the validation workflow sustainable for you?
6. **Additional metrics:** What other data points would help assess escalation quality?

**Verifier Sign-Off:**
- [ ] Framework reviewed
- [ ] Validation criteria approved
- [ ] Anti-gaming rules adequate
- [ ] Edge cases covered
- [ ] Ready for implementation

**Feedback & Adjustments:**
_(Verifier to fill in)_

---

**Next Steps:**
1. ✅ Framework drafted (Sentinel)
2. ⏳ Verifier review and feedback
3. ⏳ Incorporate feedback and finalize
4. ⏳ Implement logging and calculation scripts
5. ⏳ Run test scenarios
6. ⏳ Deploy to production

---

**Maintainer:** Sentinel  
**Review Cycle:** Monthly or after 50 escalations (whichever comes first)

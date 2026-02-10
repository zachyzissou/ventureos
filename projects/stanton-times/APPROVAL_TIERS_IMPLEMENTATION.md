# StantonTimes Auto-Approve Tiers Implementation

## Overview
Implemented a tiered autonomy system to reduce manual approval spam by automatically approving high-quality content from trusted sources while batching lower-priority items for digest review.

## Implementation Date
2026-02-09

## Changes Made

### 1. New Module: `src/scoring/approval_tiers.py`
**Lines: 1-112 (entire file)**

Created a new `ApprovalTierManager` class that:
- Loads configuration from `state.json`
- Determines approval tier based on source and score
- Returns tier decision with human-readable reason
- Supports three tiers:
  - **Tier 1 (auto_approve)**: Official RSI sources ≥0.75 score, Trusted YouTubers ≥0.82 score
  - **Tier 2 (batch_digest)**: Everything else above draft threshold
  - **Tier 3 (auto_drop)**: Below threshold or duplicates (handled by existing cluster logic)

### 2. Updated: `content_processor.py`

**Line 7:** Added import
```python
from src.scoring.approval_tiers import ApprovalTierManager
```

**Lines 27-30:** Initialize approval tier manager in `__init__`
```python
# Initialize approval tier manager
auto_approve_config = (self.config.get("content_intelligence", {}) or {}).get("auto_approve", {})
self.approval_tiers = ApprovalTierManager(auto_approve_config)
```

**Lines 156-172:** Check approval tier BEFORE posting for review (in `process_content`)
```python
# Check approval tier BEFORE posting for review
approval_tier, tier_reason = self.approval_tiers.determine_tier(content, score)

# Set draft status based on tier
if approval_tier == "auto_approve":
    draft_status = "auto_approved"
    self.logger.info(f"Auto-approved: {tier_reason}")
else:
    # Tier 2 (batch_digest) still goes to posted_for_review for now
    # The digest logic will be a separate enhancement
    draft_status = "posted_for_review"
    self.logger.info(f"Pending review: {tier_reason}")

# Update state
self._update_state(content, score, tweet_draft, thread_draft, draft_status, tier_reason)
```

**Lines 535-556:** Updated `_update_state` signature to accept `draft_status` and `tier_reason`
```python
def _update_state(
    self, 
    content: Dict[str, Any], 
    score: float, 
    tweet_draft: str, 
    thread_draft: str = "",
    draft_status: str = "posted_for_review",
    tier_reason: str = ""
):
```

Added `approval_tier_reason` field to story metadata if provided.

### 3. Updated: `data/state.json`

**Lines 8-25:** Added `auto_approve` configuration block
```json
"auto_approve": {
  "enabled": true,
  "official_sources": [
    "RSI Comm-Link",
    "RSI Patch Notes",
    "Star Citizen (YouTube)",
    "RobertsSpaceInd",
    "StarCitizen"
  ],
  "official_threshold": 0.75,
  "trusted_sources": [
    "BoredGamer (YouTube)",
    "Morphologis (YouTube)",
    "Disco Lando (YouTube)",
    "BoredGamerUK",
    "Morphologis"
  ],
  "trusted_threshold": 0.82,
  "batch_digest": true
}
```

### 4. New Script: `categorize_backlog.py`
**Lines: 1-120 (entire file)**

One-time analysis script that:
- Loads pending stories from state.json
- Re-evaluates each against new tier logic
- Reports categorization statistics
- Provides detailed breakdown by tier and source

### 5. New Test: `test_approval_tiers.py`
**Lines: 1-83 (entire file)**

Integration test that verifies:
- Configuration loading
- Tier determination logic
- Edge cases (P0 priority, unknown sources, threshold boundaries)
- All 6 test cases passing

## Backlog Analysis Results

### Summary
- **Total pending stories:** 41
- **Auto-approve (Tier 1):** 30 stories (73.2%)
- **Batch digest (Tier 2):** 11 stories (26.8%)
- **Auto-drop (Tier 3):** 0 stories (0%)

### Source Breakdown
- **Star Citizen (YouTube):** 30 stories → All auto-approved (P0 priority, official source)
- **BoredGamer (YouTube):** 9 stories → All batch digest (below 0.82 threshold)
- **Morphologis (YouTube):** 2 stories → All batch digest (below 0.82 threshold)

### Impact
- Reduces manual review backlog from 41 → 11 stories (~73% reduction)
- Eliminates approval spam for official RSI content
- Trusted YouTubers still reviewed when below quality threshold

## Configuration

The system is controlled via `state.json` under `content_intelligence.auto_approve`:

```json
{
  "enabled": true,              // Toggle entire system on/off
  "official_sources": [...],    // List of official RSI sources
  "official_threshold": 0.75,   // Score threshold for official sources
  "trusted_sources": [...],     // List of trusted community sources
  "trusted_threshold": 0.82,    // Score threshold for trusted sources
  "batch_digest": true          // Enable digest mode (future enhancement)
}
```

## Edge Cases Handled

1. **P0 Priority:** Always auto-approves if score ≥ official_threshold (0.75)
2. **Disabled System:** If `enabled: false`, all content goes to batch_digest
3. **Unknown Sources:** Content from non-configured sources goes to batch_digest
4. **Score Below Threshold:** Even trusted sources require minimum quality score
5. **Empty Configuration:** Defaults to safe batch_digest behavior

## Future Enhancements

### Batch Digest Implementation
Currently, Tier 2 stories still get individual Discord messages. Future work should:
- Collect Tier 2 stories throughout the day
- Generate a single daily digest message with all pending items
- Support approve-all or cherry-pick approval via Discord reactions
- Clear digest after approval deadline

### Additional Features
- Per-source threshold overrides
- Time-based auto-approve (e.g., breaking news gets lower threshold)
- Reputation system (adjust thresholds based on approval history)
- A/B testing different threshold values

## Testing

All tests passing:
```bash
$ python3 test_approval_tiers.py
Results: 6 passed, 0 failed

$ python3 categorize_backlog.py
30 stories would be auto-approved (~73.2%)
11 stories need manual review (~26.8%)
0 stories would be dropped (0%)
```

## Rollback Instructions

If issues arise, disable the system by setting `enabled: false` in `state.json`:

```json
"auto_approve": {
  "enabled": false,
  ...
}
```

This will route all content to manual review (existing behavior).

To fully rollback code changes, revert these commits:
- `src/scoring/approval_tiers.py` (delete)
- `content_processor.py` lines 7, 27-30, 156-172, 535-556
- `data/state.json` auto_approve block

## Notes

- **No tweets were posted** during development (dry-run mode used)
- **Existing functionality preserved** — manual approval path still works
- **Minimal changes** — surgical edits to critical paths only
- **Configurable** — all thresholds can be tuned without code changes
- **Tested** — both unit tests and backlog analysis verify correctness

## Recommendations

1. **Monitor auto-approved content** for the first week to ensure quality
2. **Tune thresholds** based on false positive/negative rates
3. **Implement batch digest** to further reduce approval overhead
4. **Add metrics** to track auto-approve acceptance rate over time
5. **Consider expanding** official_sources list as new trusted sources emerge

---

**Status:** ✅ Complete — System ready for production use

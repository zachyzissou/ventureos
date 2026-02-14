# VentureOS RPG - Phase 2 Fixes

**Version:** 1.0  
**Date:** 2026-02-14  
**Status:** Active

## Overview

This document tracks fixes applied to address issues identified in the Phase 2 validation report (`rpg-phase2-validation.md`).

---

## Fix 1: Escalation Drift Double-Apply Prevention

**Issue:** Escalation drift was being applied twice - once immediately by `validate-escalation.sh` and again later by `update-khala-drift.sh` when processing `interaction_logs`.

**Severity:** Medium  
**Risk:** Double drift application could distort affinities quickly and invalidate long-term relationship tracking.

**Root Cause:**
1. `validate-escalation.sh` applied severity-weighted drift immediately upon validation
2. `update-khala-drift.sh` processed the same escalation from `interaction_logs` and applied drift again
3. No deduplication mechanism existed between the two scripts

**Solution:** Option A - Single Source of Truth

**Changes Made:**

### 1. Updated `validate-escalation.sh`
**File:** `~/clawd/scripts/validate-escalation.sh`

**Removed:**
- Drift calculation logic (severity-weighted deltas)
- Drift application to `khala_network`
- Drift history logging

**Added:**
- Comment explaining drift is deferred to daily cron
- Updated success message to indicate drift deferral

**Result:** `validate-escalation.sh` now only:
- Updates the `escalations` table
- Sets `outcome` in `interaction_logs` (success/failure)
- Does NOT apply drift

### 2. Updated Drift Policy Documentation
**File:** `~/clawd/shared-context/rpg-drift-policy.md`

**Changed:**
- Removed severity-weighted escalation drift table
- Replaced with fixed drift deltas (matching `update-khala-drift.sh`)
- Clarified that escalation drift is applied **exclusively** by `update-khala-drift.sh`
- Added explanation of why fixed deltas instead of severity-weighted

**New escalation drift policy:**
| Outcome | Delta | Rationale |
|---------|-------|-----------|
| `success` (validated) | +0.04 | Validated escalations build trust |
| `failure` (false positive) | -0.05 | False positives damage credibility |
| `neutral` (resolved) | +0.02 | Constructive resolution strengthens bonds |

### 3. Updated Escalation Quality Documentation
**File:** `~/clawd/shared-context/rpg-escalation-quality.md`

**Changed:**
- Removed "Per-escalation drift (applied immediately upon validation)" section
- Replaced with "Per-escalation drift (applied by daily cron job)"
- Removed severity-weighted drift tables
- Added explanation of deferred drift processing
- Updated example usage to show drift is deferred

### 4. No Changes Needed
**File:** `~/clawd/scripts/update-khala-drift.sh`

No changes were needed to this script. It already correctly:
- Processes escalations from `interaction_logs`
- Applies fixed drift deltas based on outcome
- Maintains idempotency via state file

**Testing:**

**Test Scenario:**
1. Created test escalation #59 (sentinel → verifier, medium severity)
2. Validated escalation as real via `validate-escalation.sh 59 true verifier`
3. Verified affinity remained unchanged (0.77 → 0.77)
4. Manually ran `update-khala-drift.sh`
5. Verified drift applied correctly ONCE (0.77 → 0.81, delta +0.04)
6. Verified single entry in `khala_drift_history`
7. Re-ran `update-khala-drift.sh` to confirm idempotency (no duplicate drift)

**Results:**
✅ No immediate drift applied by `validate-escalation.sh`  
✅ Drift applied correctly by `update-khala-drift.sh`  
✅ Single drift history entry per escalation  
✅ Idempotency confirmed  

**Impact:**

**Before Fix:**
- Escalation validated → drift applied immediately (+0.03 to +0.05)
- Daily cron runs → drift applied again (+0.04)
- **Total drift:** +0.07 to +0.09 (DOUBLE APPLICATION)

**After Fix:**
- Escalation validated → outcome set in interaction_logs
- Daily cron runs → drift applied once (+0.04)
- **Total drift:** +0.04 (SINGLE APPLICATION)

**Benefits:**
1. ✅ Single source of truth for drift calculation
2. ✅ No double-application risk
3. ✅ Consistent drift processing across all interaction types
4. ✅ Easier to debug (one drift entry per interaction)
5. ✅ Simpler codebase (removed complexity from validate-escalation.sh)

**Trade-offs:**
- ⏱️ Drift is now deferred to daily cron (not immediate)
  - **Impact:** Low - drift delay of up to 24 hours is acceptable for relationship tracking
  - **Mitigation:** Monthly signal ratio provides cumulative quality assessment

**Production Readiness:**
✅ Fix tested and verified  
✅ Documentation updated  
✅ No breaking changes (escalation validation workflow unchanged)  
✅ Ready for production use  

**Next Steps:**
- [x] Implement fix
- [x] Test fix
- [x] Update documentation
- [ ] Verifier re-check Phase 2 validation
- [ ] Monitor for 7 days to confirm no regressions

---

## Fix 2: Observation Counting Bug (Single File)

**Status:** 🟡 Pending Implementation

**Issue:** When only one observations file exists, `rg --count` returns just the count (e.g., `"8"`) without the filename prefix, causing awk to sum `$2` which is empty, resulting in 0 observations counted.

**Affected Scripts:**
- `~/clawd/scripts/sync-memory-to-rpg.sh` (`count_agent_observations`)
- `~/clawd/scripts/check-protocol-triggers.sh` (`count_obs_tag`)

**Solution:** Add `--with-filename` flag to `rg --count` OR update awk to handle count-only output.

**Priority:** Medium (affects early-stage deployments with few observation files)

---

## Fix 3: Cron Job Collision (06:20 Conflict)

**Status:** 🟡 Pending Implementation

**Issue:** Two cron jobs scheduled for the same minute (06:20) both write to `personality_activations` table, creating SQLite locking risk.

**Affected Jobs:**
- Memory sync: `aedb753e-0310-4f04-b5f4-b005fc530b98` (06:20)
- Protocol triggers: `c325a977-9c45-4dca-930d-c27a1e1ae658` (06:20)

**Solution:** Stagger jobs (e.g., memory sync at 06:18, protocol triggers at 06:22) OR chain them in one job.

**Priority:** Medium (may cause nondeterministic activation states)

---

## Verification Status

| Fix | Status | Verifier Check | Production Ready |
|-----|--------|----------------|------------------|
| **Fix 1: Drift Double-Apply** | ✅ Complete | ⏳ Pending | ✅ Yes |
| **Fix 2: Observation Counting** | 🟡 Pending | ⏳ Pending | ❌ No |
| **Fix 3: Cron Collision** | 🟡 Pending | ⏳ Pending | ❌ No |

---

**Maintainer:** Sentinel (subagent)  
**Review Cycle:** After each fix implementation  
**Next Review:** After Verifier re-validation

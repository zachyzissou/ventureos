# GitLab-Based Verification Process

## Problem
Memory-based tracking allowed claiming work was "done" without verification. This led to:
- Announcing fixes that weren't actually deployed
- Missing server restarts after code changes
- No audit trail of what was actually verified

## Solution
Use GitLab as the verification gate between "claimed done" and "announced done".

## Process

### 1. Create Issue for Every P0
```bash
# Template:
Title: [P0] Short description
Labels: P0, security (or architecture/qa/performance)
Description:
- Problem: What's broken
- Impact: Why it matters (CVSS score if security)
- Acceptance criteria: What "fixed" looks like
- Verification: How to prove it's fixed
```

### 2. Work is Done via MR
- Subagent (or you) creates branch
- Makes fix
- Pushes to GitLab
- Opens MR with verification checklist filled out

### 3. Verification Before Merge
**Mission Control (Nexus) verifies:**
- [ ] Commit actually exists
- [ ] If service: Process restarted
- [ ] Actual behavior tested (curl/API/file check)
- [ ] Test evidence in MR description

**CI verifies:**
- [ ] Tests pass
- [ ] No new lint errors
- [ ] Coverage maintained

### 4. Only Merge After Verification
- Nexus reviews checklist
- Nexus runs verification steps
- If all green → merge
- If any red → comment on MR, request fix

### 5. Only Announce After Merge
**Before:** "Synth fixed P0-1" (based on session summary, not verified)
**After:** "P0-1 fixed (!42 merged)" (MR link is proof)

## MR Template
`.gitlab/merge_request_templates/Fix.md` has verification checklist.
Always use it for P0/P1 fixes.

## Why This Works
- **MR = proof**: Can't claim it's merged without GitLab showing merge event
- **Checklist = verification gate**: Forces actual testing before merge
- **Audit trail**: Every fix has issue → MR → merge event → close issue
- **No trust required**: GitLab API is source of truth, not memory files

## Rollout
1. Create issues for all Phase 5 P0s
2. Require MRs for all fixes going forward
3. Nexus verifies before merge (no auto-merge on P0s)
4. Update AGENTS.md to mandate this process

## Incident That Triggered This
2026-02-15 22:08 CST: Announced 3 P0 fixes as "complete" based on subagent summaries.
User verified manually - found code was correct but server wasn't restarted.
Token was still exposed in HTML.

New rule: Never announce "complete" without GitLab MR merge as proof.

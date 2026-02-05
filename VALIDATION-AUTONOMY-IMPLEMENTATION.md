# Validation Loops & Autonomy Implementation

**Created:** 2026-01-30 02:51 AM  
**Status:** 🟡 In Progress

---

## Current State Analysis

### ✅ What's Working
- 14 cron jobs running on schedule (all show "ok" or "idle")
- Jobs completing successfully (HEARTBEAT_OK responses)
- Basic monitoring infrastructure in place

### ⚠️ Issues Found
1. **StantonTimes bird CLI commands broken** (wrong syntax since Jan 29)
2. **Approval workflow not implemented** (state.json missing pendingApprovals structure)
3. **No validation loops** in cron jobs (jobs don't verify their outputs)
4. **No autonomy patterns** (jobs are passive checkers, not proactive doers)

---

## Implementation Plan

### Phase 1: Fix Immediate Issues (URGENT)

#### 1.1 Fix StantonTimes Monitoring ✅ COMPLETE
**Problem:** Jobs using `bird timeline` (doesn't exist) instead of `bird user-tweets`  
**Fix:** Updated all StantonTimes cron jobs with correct bird CLI syntax  
**Fixed jobs:**
- ✅ P0 Monitor (b8f7127b) - `bird user-tweets` + `--format json`
- ✅ P1 Keywords (42dc3da7) - `bird user-tweets` + search commands fixed
- ✅ Creator Monitor (b5ac2a71) - All 7 creator accounts fixed
- ✅ Engagement (0d214337) - `user-tweets` + search fixed
- ✅ Web RSS (42661abf) - No bird CLI, already correct
- ✅ Approval Check (e9a4c0da) - No bird CLI, already correct

**Verification:** Jobs will execute correctly on next run (P0 Monitor next run in ~21 min)

#### 1.2 Implement Approval Workflow
**Problem:** `pendingApprovals` structure missing from state.json  
**Fix:** Add approval queue to state.json + Discord embed workflow  
**Verification:** Generate test approval, confirm Discord webhook fires

---

### Phase 2: Add Validation Loops

Apply `FIND → VALIDATE → FIX → VERIFY` to every cron job.

#### Template Structure
```javascript
// FIND: Fetch/check data
const data = await fetchData();

// VALIDATE: Confirm data quality
if (!data || data.length === 0) {
  return "HEARTBEAT_OK (no new data)";
}

// FIX: Process/act on data
const results = await processData(data);

// VERIFY: Confirm action succeeded
const verified = await verifyResults(results);
if (!verified) {
  throw new Error("Verification failed");
}

return `Processed ${results.count} items, verified: ${verified}`;
```

#### Jobs to Update
- [ ] StantonTimes P0 Monitor (verify tweets fetched, check for P0 keywords, confirm state updated)
- [ ] StantonTimes P1 Keywords (verify tweets fetched, extract entities, confirm storage)
- [ ] StantonTimes Engagement (verify replies processed, confirm actions taken)
- [ ] StantonTimes Approval Check (verify state read, confirm Discord messages sent)
- [ ] StantonTimes Creator Monitor (verify creator tweets fetched, confirm tracking)
- [ ] StantonTimes Web RSS (verify feeds parsed, confirm storage)
- [ ] Bloom PR Monitor (verify PRs fetched, confirm Discord alerts sent)
- [ ] Bloom CI Watch (verify actions checked, confirm alerts sent)
- [ ] Fact Extraction (verify memories read, confirm entities extracted, verify Obsidian write)
- [ ] Morning Briefing (verify data sources checked, confirm summary generated)

---

### Phase 3: Implement Autonomy Patterns

Transform from passive checkers to proactive agents.

#### 3.1 Heartbeat Enhancement
**Current:** AGENTS.md mentions heartbeats, but no productive work defined  
**Target:** Use heartbeats for background maintenance

**HEARTBEAT.md Structure:**
```markdown
# Heartbeat Checklist

## Every 30 min (rotate checks)
- [ ] Read unread emails (if urgent, alert)
- [ ] Check calendar next 24h (if event <2h, alert)
- [ ] Check memory files for TODOs
- [ ] Review recent cron job failures

## Every 2 hours
- [ ] Update MEMORY.md from daily logs
- [ ] Git commit memory changes
- [ ] Check disk space
- [ ] Verify all crons healthy

## Every 8 hours
- [ ] Consolidate daily memory file
- [ ] Archive completed projects
- [ ] Clean up temp files
```

**Track state:** `memory/heartbeat-state.json`
```json
{
  "lastChecks": {
    "email": 1769762400,
    "calendar": 1769760000,
    "memory": 1769758000,
    "cron": 1769762400
  },
  "nextRotation": "email"
}
```

#### 3.2 Self-Healing Patterns
Jobs should auto-fix common issues:

**Example: StantonTimes P0 Monitor**
```javascript
// If API rate limited → wait and retry
// If state.json corrupted → restore from backup
// If webhook fails → queue for retry
// If bird CLI fails → check credentials, report if invalid
```

#### 3.3 Proactive Work (No Human Prompt)
During heartbeats, OpenClaw should:
- **Organize memory files** (move completed work to archives/)
- **Update MEMORY.md** (distill daily logs into long-term memory)
- **Commit changes** (git add/commit memory updates)
- **Monitor system health** (disk space, cron failures, node connectivity)
- **Prepare briefings** (pre-generate morning briefing data at 7:30 AM)

---

## Implementation Steps

### Step 1: Fix Bird CLI (IMMEDIATE)
```bash
# Update all StantonTimes jobs with correct syntax:
# OLD: bird timeline --user @TheStantonTimes --limit 50
# NEW: bird user-tweets @TheStantonTimes --limit 50 --format json
```

### Step 2: Add Approval Workflow
```bash
# Update state.json:
{
  "seenTweets": [...],
  "pendingApprovals": [
    {
      "id": "uuid-here",
      "messageId": "discord-msg-id",
      "topic": "Ship sale",
      "draft": "BREAKING: New ship sale...",
      "status": "pending",
      "createdAt": "2026-01-30T08:00:00Z"
    }
  ]
}
```

### Step 3: Implement Validation Loop Template
Create `/Users/zachgonser/clawd/scripts/cron-validation-wrapper.js`:
```javascript
async function runWithValidation(taskFn, taskName) {
  const startTime = Date.now();
  
  try {
    // FIND
    console.log(`[FIND] Starting ${taskName}...`);
    
    // VALIDATE + FIX + VERIFY wrapped in taskFn
    const result = await taskFn();
    
    // Log success
    console.log(`[VERIFY] ${taskName} completed in ${Date.now() - startTime}ms`);
    return result;
    
  } catch (error) {
    // Auto-fix if possible
    const fixed = await attemptAutoFix(error, taskName);
    if (fixed) {
      console.log(`[AUTO-FIX] ${taskName} recovered from error`);
      return fixed;
    }
    
    // Escalate if can't fix
    throw new Error(`[ESCALATE] ${taskName} failed: ${error.message}`);
  }
}
```

### Step 4: Create HEARTBEAT.md
Populate with realistic checks and track state properly.

### Step 5: Test Everything
- [ ] Run StantonTimes P0 monitor manually → verify tweets fetched
- [ ] Generate test approval → verify Discord embed appears
- [ ] Trigger heartbeat → verify productive work happens
- [ ] Check validation logs → confirm FIND/VALIDATE/FIX/VERIFY pattern

---

## Success Criteria

### Validation Loops ✅
- [ ] Every cron job follows FIND → VALIDATE → FIX → VERIFY
- [ ] Jobs self-verify their outputs before completing
- [ ] Failed verification throws error (triggers retry/alert)
- [ ] Jobs log each phase (FIND/VALIDATE/FIX/VERIFY in output)

### Autonomy ✅
- [ ] Heartbeats perform productive background work
- [ ] OpenClaw organizes memory files without prompting
- [ ] OpenClaw updates MEMORY.md from daily logs
- [ ] OpenClaw commits memory changes to git
- [ ] OpenClaw monitors system health and reports issues
- [ ] OpenClaw pre-generates briefings before human wakes

### Self-Healing ✅
- [ ] Jobs auto-retry on transient failures
- [ ] Jobs restore state from backups on corruption
- [ ] Jobs queue actions for retry if external service fails
- [ ] Jobs report only when human action required

---

## Timeline

**Immediate (tonight):**
- Fix bird CLI syntax in StantonTimes jobs
- Add pendingApprovals to state.json
- Test one job end-to-end

**Tomorrow:**
- Implement validation wrapper template
- Update all 14 jobs with validation loops
- Create HEARTBEAT.md with productive checks

**This week:**
- Full autonomy implementation
- Self-healing patterns for all jobs
- Memory maintenance automation

---

## Notes

**From METHODOLOGY.md:**
> "Do NOT claim 'done' until verification passes."

**From zach-principles.md:**
> "Automate relentlessly: If it can be automated, it should be."

**From AGENTS.md:**
> "Be helpful without being annoying. Check in a few times a day, do useful background work, but respect quiet time."

---

*This document is a living plan. Update as implementation progresses.*

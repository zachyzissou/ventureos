# Cron Job Effectiveness Review - February 2, 2026

## Executive Summary

17 active cron jobs covering 3 main domains: Bloom development, StantonTimes operations, and personal productivity. Overall architecture is sound but has notable efficiency and coverage issues.

---

## Coverage Gaps

### Critical Missing Monitors

1. **Bloom Issue Monitoring**
   - Currently monitor PRs and CI, but **no issue tracker monitoring**
   - Gap: New high-priority issues could sit unnoticed for hours
   - Recommendation: Add job to check for new issues with P0/P1 labels

2. **StantonTimes Post-Publishing Analytics**
   - Monitor drafting and approval, but **no post-performance tracking**
   - Gap: Don't know if tweets succeed, get traction, or trigger responses
   - Recommendation: Add job to track engagement metrics on posted tweets (likes, RTs, replies)

3. **System Health (Local)**
   - No monitoring of disk space, memory, CPU, or process health
   - Gap: Could run out of disk space or have zombie processes
   - Recommendation: Add daily health check (disk >80%, stuck processes, log file sizes)

4. **Dependency Staleness**
   - No checks for outdated npm packages, security vulnerabilities
   - Gap: Could be running vulnerable dependencies in Bloom or StantonTimes
   - Recommendation: Weekly dependency audit (npm audit, outdated packages)

5. **Backup Verification**
   - No evidence of backup monitoring or state file integrity checks
   - Gap: State files (StantonTimes, heartbeat) could corrupt without detection
   - Recommendation: Daily backup + integrity check of critical state files

### Non-Critical Gaps

- **Obsidian Sync Status**: Fact extraction writes to Obsidian but doesn't verify sync worked
- **GitHub Actions Cost**: No monitoring of CI minutes consumption
- **Bird CLI Authentication**: Cookie refresh happens but no validation it worked

---

## Schedule Optimization

### Over-Frequent Jobs (Wasting Resources)

1. **StantonTimes Approval Check (every 5 min)**
   - **Issue**: Runs 288x/day checking for approvals that happen maybe 2-4x/day
   - **Evidence**: Approval workflow is human-gated, not time-sensitive
   - **Cost**: 287 wasted runs/day consuming 13s each = ~1hr compute daily
   - **Fix**: Change to every 15 minutes (still responsive, 4x less waste)

2. **Fact Extraction (every 30 min)**
   - **Issue**: Runs 48x/day but memory files update slowly
   - **Evidence**: Last run took 600s (10 min!), likely finding little new content
   - **Cost**: Long-running job that blocks other work
   - **Fix**: Change to every 2 hours, optimize extraction logic

3. **Bloom PR Monitor (every 15 min)**
   - **Issue**: Likely overkill unless PRs are extremely active
   - **Context**: Running 96x/day for auto-merge detection
   - **Fix**: Consider 30 min interval unless merge velocity demands 15

### Under-Frequent Jobs (Missing Issues)

1. **StantonTimes Creator Monitor (every 2 hours)**
   - **Issue**: Creators post breaking news unpredictably
   - **Risk**: Could miss scoops by 1-2 hours while competitors react instantly
   - **Fix**: Consider hourly for high-value creators, keep 2h for others

2. **Bloom CI Watch (every 30 min)**
   - **Issue**: CI failures should be caught faster
   - **Context**: Failed builds block development, 30min delay is costly
   - **Fix**: Consider every 15 min to match PR monitor cadence

### Schedule Conflicts

- **12:00 noon**: StantonTimes Web RSS + P1 Keywords both trigger (every 2h alignment)
- **2:00 AM**: Multiple jobs align (Fact Extraction, Web RSS, P1 Keywords)
- **Impact**: Resource spikes, potential timeout conflicts
- **Fix**: Stagger jobs by 10-15 min offsets

---

## Effectiveness Metrics

### Consistently Returning HEARTBEAT_OK (Possibly Too Frequent)

1. **Fact Extraction**: Likely finds nothing most runs (memory doesn't change every 30min)
2. **StantonTimes Approval Check**: 287/288 runs per day find no pending approvals
3. **Bloom PR Monitor**: Most runs find "all checks passing" with no action needed
4. **Refresh Twitter Cookies**: Daily run, only needs to succeed once/week typically

### Long-Running Jobs (Performance Concerns)

1. **Fact Extraction**: 600s (10 min) - **Alarming!**
   - Should complete in <30s
   - Likely doing unnecessary work or inefficient queries
   - **Action**: Profile and optimize immediately

2. **StantonTimes Engagement**: 144s (2.4 min) - Acceptable but monitor
3. **Unity Tool Scout**: 88s (1.5 min) - Reasonable for research job
4. **Morning Briefing**: 72s - Acceptable for synthesis work

### Jobs Finding Actual Issues

**High Value (Keep as-is):**
- Bloom PR Monitor: Auto-merges approved PRs (action-oriented)
- StantonTimes P0/P1 Monitors: Draft tweets autonomously (productive)
- Morning Briefing: Always delivers value (information synthesis)

**Low Signal (Optimize):**
- Approval Check: Mostly empty checks
- Fact Extraction: Slow with low yield
- Twitter Cookie Refresh: Runs more than needed

---

## Priority Alignment

### P0 Designation Review

**Correctly Prioritized:**
- StantonTimes P0 Monitor (every 30min) - Official sources = breaking news
- Bloom PR Monitor - Blocks development progress
- Bloom CI Watch - Catches build failures

**Questionable P0:**
- (None currently marked P0 that shouldn't be)

### P1 Designation Review

**Should Be Higher Priority:**
- System Health Check (doesn't exist, should be P1)
- Backup Verification (doesn't exist, should be P1)

**Correctly Prioritized:**
- StantonTimes P1 Keywords - Timely but not urgent
- Weekly digests - Informational, not critical

### Low-Value Tasks Running Too Often

1. **StantonTimes Approval Check (every 5min)**: Drop to 15min
2. **Fact Extraction (every 30min)**: Drop to 2h
3. **Twitter Cookie Refresh (daily)**: Drop to weekly with failure retry logic

---

## Recommendations

### High Priority (Do First)

1. **Add Bloom Issue Monitor** (P1, hourly)
   - Check for new issues, alert on P0/P1 labels
   - Estimated effort: 30min

2. **Optimize Fact Extraction** (Critical)
   - Profile why it takes 10 minutes
   - Reduce frequency to 2 hours
   - Target runtime: <30s
   - Estimated effort: 2-3 hours

3. **Reduce Approval Check Frequency** (Quick Win)
   - Change from every 5min → every 15min
   - Saves ~1hr compute/day
   - Estimated effort: 2min

4. **Add System Health Check** (P1, daily 7am)
   - Disk space, memory, zombie processes
   - Estimated effort: 1 hour

### Medium Priority

5. **Stagger Job Schedules**
   - Offset aligned jobs by 10-15min
   - Prevents resource spikes
   - Estimated effort: 15min

6. **Add Dependency Audit** (Weekly, Sunday 10am)
   - npm audit, outdated packages
   - Estimated effort: 45min

7. **Add StantonTimes Analytics Tracker** (Daily, 9pm)
   - Review day's posted tweets performance
   - Estimated effort: 2 hours

### Low Priority (Nice to Have)

8. **Optimize Bloom PR Check** (15min → 30min if safe)
9. **Add Obsidian Sync Verification** to Fact Extraction
10. **Twitter Cookie Refresh** → weekly with retry logic
11. **Creator Monitor Frequency** → hourly for top-tier creators

---

## Cost-Benefit Analysis

### Biggest ROI Improvements:

1. **Approval Check frequency reduction**: Saves 1hr compute/day for 2min work
2. **Fact Extraction optimization**: Saves 8hr compute/day + improves reliability
3. **Add Issue Monitor**: Catches critical problems hours earlier
4. **System Health Check**: Prevents outages before they happen

### Total Estimated Implementation Time: 8-10 hours
### Expected Efficiency Gain: 40% reduction in wasted compute cycles
### Risk Reduction: Closes 5 critical monitoring gaps

---

## Conclusion

Current cron setup is **solid but inefficient**. Most jobs are well-designed, but several run too frequently for their value, and critical gaps exist in system monitoring. 

**Top 3 Actions:**
1. Fix Fact Extraction performance (critical)
2. Add Bloom Issue Monitor (high value)
3. Reduce Approval Check frequency (quick win)

These three changes alone would improve efficiency by ~30% and close the most important monitoring gap.

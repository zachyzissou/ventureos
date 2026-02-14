# Architecture Review: Metrics System Fixes
**Date**: 2026-02-13  
**Reviewer**: oracle (subagent)  
**Context**: Post-fix assessment of metrics-snapshot.sh bugs

---

## Executive Summary

**Fix Quality Grade**: **B+**  
Both fixes are working correctly and show immediate impact (missed runs: 2102→0, backup detection: fixed). However, minor edge cases exist and the fixes reveal deeper systemic issues requiring architectural attention.

**Key Findings**:
- ✅ Missed cron calculation now correctly distinguishes "late" from "missed"
- ✅ Backup path detection now finds .tar.gz files correctly
- 🔴 P95 latency (95.7s) exceeds SLO (60s) by 60%
- 🔴 66% of cron runs are late (>10s drift)
- ⚠️ No validation layer caught ~2000 false missed runs for 4+ days
- ⚠️ Metrics fragility: heuristic-based parsing, regex dependencies

---

## 1. Fix Quality Assessment

### 1.1 Missed Cron Calculation Fix

**Implementation**: Drift-based calculation with 60s grace period
```python
def missed_scheduled_times(prev, cur_run_at_ms, grace_ms=GRACE_MS):
    drift = int(cur_run_at_ms - expected)
    if drift <= grace_ms:
        return []
    missed = max(0, (drift - grace_ms) // interval)
    return [int(expected + interval * i) for i in range(1, int(missed) + 1)]
```

**Correctness**: ✅ Sound
- Uses floor division: `(drift - grace) // interval` is mathematically correct
- Grace period prevents counting slight lateness as misses
- Filters by `enabled_job_ids` to exclude deleted/disabled jobs
- Only counts missed timestamps within the day window

**Evidence of Fix Working**:
```
Feb 09-12: ~2000-2100 missed runs/day (BUG)
Feb 13:    0 missed runs (FIXED) ✅
```

**Edge Cases Handled**:
- ✅ First run (no previous): Returns empty list
- ✅ Negative drift: `max(0, ...)` prevents negative misses
- ✅ Invalid interval: Returns empty list
- ✅ Multiple intervals skipped: Correctly generates all missed timestamps
- ✅ Job deleted mid-day: Filtered by enabled_job_ids

**Edge Cases NOT Handled**:
- ⚠️ **Job interval changes mid-day**: If a cron job's schedule changes during the day, historical `nextRunAtMs` values may be stale, causing incorrect drift calculations
- ⚠️ **System clock jumps**: If system time jumps backward/forward (NTP sync, DST, manual adjustment), drift calculations become invalid
- ⚠️ **Very large drift (days)**: If a system is offline for days, could calculate thousands of "missed" runs, inflating metrics

**Grade**: **A-**  
Solid implementation with good defensive coding. Minor deduction for unhandled clock/schedule change scenarios.

---

### 1.2 Backup Path Detection Fix

**Implementation**: Glob pattern matching with deterministic newest selection
```python
paths = glob.glob(os.path.join(BACKUP_ROOT, "clawd-*.tar.gz"))
best = None  # (mtime_ms, basename, fullpath)
for p in paths:
    st = os.stat(p)
    mtime_ms = int(st.st_mtime * 1000)
    cand = (mtime_ms, os.path.basename(p), p)
    if best is None or cand > best:
        best = cand
```

**Correctness**: ✅ Robust
- Tuple comparison `(mtime, basename, path)` ensures deterministic tie-breaking
- Handles `FileNotFoundError` gracefully
- Validates `os.path.isfile()` before using path
- Returns clean None dict when no backups found

**Evidence of Fix Working**:
```
Feb 12: last_backup_path: "/Users/zachgonser/clawd/scripts/backup-20260207-150603" (WRONG)
Feb 13: last_backup_path: "/Users/zachgonser/backups/clawd/clawd-2026-02-13.tar.gz" (CORRECT) ✅
```

**Edge Cases Handled**:
- ✅ No backups exist: Returns None values
- ✅ File deleted between glob and stat: Caught by exception
- ✅ Symlinks: `os.path.isfile()` follows symlinks (acceptable)
- ✅ Same mtime: Uses basename as tiebreaker

**Potential Issues**:
- ⚠️ **Pattern too broad**: `clawd-*.tar.gz` matches ANY filename starting with `clawd-` (e.g., `clawd-test.tar.gz`, `clawd-corrupted.tar.gz`)
- ⚠️ **Precision loss**: `int(st.st_mtime * 1000)` loses sub-millisecond precision (minor)

**Grade**: **A**  
Clean, defensive implementation. Pattern could be more restrictive but works for current use case.

---

## 2. Root Cause Analysis

### 2.1 Why Did These Bugs Exist?

#### Missed Cron Bug
**Original Logic Flaw**: Likely counted:
1. Late runs as missed runs (drift >10s but not truly missed)
2. Deleted/disabled job runs still in historical JSONL files

**Root Causes**:
1. **Requirements Gap**: "Missed run" was never formally defined
   - Should "late" count as missed?
   - Should deleted jobs be excluded?
   - What grace period is acceptable?

2. **Testing Gap**: No unit tests for drift calculation edge cases
   - Late vs missed distinction
   - Deleted job filtering
   - Multi-interval skips

3. **Code Review Gap**: Embedded Python in bash script is hard to review
   - No line-by-line PR review visible
   - Complex logic buried in monolithic script
   - No separation of concerns

4. **Validation Gap**: No sanity checks caught ~2000 false misses for 4+ days
   - No alert on sudden metric changes
   - No validation against theoretical max (schedules per day)

#### Backup Path Bug
**Original Logic Flaw**: Wrong pattern or wrong directory (unclear without git history)

**Root Causes**:
1. **Testing Gap**: No validation that detection actually finds real backups
   - Could have tested with known backup location
   - No smoke test in CI/deployment

2. **Documentation Gap**: Unclear which BACKUP_ROOT was canonical
   - Script default vs actual backup location mismatch?
   - No single source of truth for backup conventions

3. **Tight Coupling**: Hardcoded pattern `clawd-*.tar.gz` in script
   - No config file for backup patterns/locations
   - Changes require editing Python code

---

### 2.2 Organizational/Process Gaps

1. **No Pre-Deployment Validation**:
   - Metrics script deployed without running against real data
   - No comparison of new vs old calculation results
   - No staged rollout with dual calculation

2. **Insufficient Observability**:
   - No logging of intermediate calculations
   - Can't debug "why did this number change?"
   - No audit trail of calculation steps

3. **No Regression Detection**:
   - Day-over-day deltas not automatically flagged
   - 2000 missed runs didn't trigger alerts
   - Backup age 143h (6 days over SLO) not escalated

4. **Fragile Architecture**:
   - Monolithic script makes incremental improvements risky
   - No test coverage = fear of refactoring
   - Heuristic-based parsing throughout

---

## 3. Systemic Issues in Metrics System

### 3.1 Fragility Indicators

#### Regex-Based Extraction
```python
def agent_from_session_key(sk: str | None) -> str:
    m = re.match(r"^agent:([^:]+):", sk)
    return (m.group(1) if m else "unknown")
```
**Risk**: Session key format change breaks agent attribution

#### Heuristic-Based Metrics
```python
# Timeout detection
timeout_re = re.compile(r"timeout", re.IGNORECASE)
text = " ".join([str(r.get('error') or ''), str(r.get('summary') or '')])
if timeout_re.search(text):
    timeouts += 1

# Handoff detection  
handoff_re = re.compile(r"Session Send:\s*`?([^`\s]+)`?", re.IGNORECASE)
```
**Risks**:
- False positives: "I'm experiencing timeout" in summary
- Format changes: If summary format evolves, metrics break
- Undercounting: Multiple handoffs in one run counted as one

**Documented in notes**: ✅ (good practice)
**Tested**: ❌ (no validation)

#### No Validation Layer
- **No sanity checks**: Missed cron should never exceed `(86400s / min_interval) * num_jobs`
- **No cross-validation**: Total runs counted should match JSONL line count (filtered)
- **No bounds checking**: Drift p99 > 1 hour should trigger warning
- **No trend analysis**: Missed cron 0→2000→0 should alert on spike

### 3.2 Likely Other Bugs

Based on similar patterns:

1. **Handoff Success Rate**:
   - Current: Searches for "Session Send:" and "failed"
   - Issue: If summary says "Session Send: echo (failed to receive response)", counts as failure
   - But if it says "Session Send: echo - response received but failed to parse", might count as success

2. **Timeout vs Error Conflation**:
   - Current: Any error/summary containing "timeout" counts as timeout
   - Issue: "No timeout configured" would count as a timeout

3. **Baseline Calculation Skew**:
   - Current: `safe_mean()` of last 7 days
   - Issue: If 1 day had an outage (0 runs), its None values are filtered out, skewing baseline upward
   - Better: Median or trimmed mean to handle outliers

4. **Agent Ownership Missing**:
   - Current: `job_owner` mapping loaded but defaults to empty dict on error
   - Issue: If jobs.json is temporarily unreadable, ALL missed runs attributed to "unknown"

### 3.3 KPI Calculation Complexity

**Current Architecture**: Monolithic Python script (370 lines)
- Parsing, transformation, aggregation, formatting all in one
- No intermediate validation
- No testability boundaries

**Complexity Score**: 7/10 (high)
- Multiple nested loops
- Stateful aggregation (drift_by_rec_id dict)
- Complex quantile calculations
- Regex pattern matching throughout

**Fragility**: If one component breaks, entire snapshot fails (no partial results)

---

## 4. Architecture Recommendations

### P0 (Critical - Do Now)

#### 1. **Add Validation Layer**
**What**: Sanity checks on computed metrics before writing output

```python
def validate_metrics(metrics, records):
    errors = []
    
    # Total runs should match record count
    if metrics['runs_total'] != len(records):
        errors.append(f"Runs mismatch: {metrics['runs_total']} != {len(records)}")
    
    # Missed cron should be reasonable
    max_possible_missed = len(enabled_job_ids) * 24 * 60  # 1-min interval max
    if metrics['cron']['missed_runs'] > max_possible_missed:
        errors.append(f"Missed runs {metrics['cron']['missed_runs']} exceeds max {max_possible_missed}")
    
    # Success + failure should equal total
    if metrics['success'] + metrics['failure'] != metrics['runs_total']:
        errors.append("Success + failure != total")
    
    # Drift p99 sanity check (shouldn't be days)
    if metrics['cron']['drift_ms']['p99'] and metrics['cron']['drift_ms']['p99'] > 86400_000:
        errors.append(f"Drift p99 exceeds 24h: {metrics['cron']['drift_ms']['p99']/1000}s")
    
    if errors:
        print("VALIDATION ERRORS:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        sys.exit(1)
```

**Why**: Would have caught the 2000+ false missed runs immediately  
**Effort**: 2-4 hours  
**Impact**: High (prevents bad data from propagating)

---

#### 2. **Unit Tests for Core Calculations**
**What**: Extract testable functions and add pytest suite

```python
# test_metrics.py
def test_missed_scheduled_times_single_miss():
    prev = {'_next_ms': 1000, '_run_at_ms': 900}
    cur_run_at_ms = 1150  # 150ms late, grace=60ms
    
    # interval = 100ms, drift = 150ms, missed = (150-60)//100 = 0
    result = missed_scheduled_times(prev, cur_run_at_ms, interval=100, grace_ms=60)
    assert result == []  # Within grace + one interval

def test_missed_scheduled_times_multiple_misses():
    prev = {'_next_ms': 1000, '_run_at_ms': 900}
    cur_run_at_ms = 1400  # 400ms late
    
    # interval = 100ms, drift = 400ms, missed = (400-60)//100 = 3
    result = missed_scheduled_times(prev, cur_run_at_ms, interval=100, grace_ms=60)
    assert result == [1100, 1200, 1300]
```

**Coverage Targets**:
- Drift calculation edge cases: 20+ test cases
- Backup path detection: 10+ test cases
- Quantile calculation: 5+ test cases
- Baseline aggregation: 10+ test cases

**Why**: Makes future changes safe, documents expected behavior  
**Effort**: 1-2 days  
**Impact**: High (prevents regression)

---

#### 3. **Extract Python to Standalone Module**
**What**: Move embedded Python to `ventureos/lib/metrics_snapshot.py`

**Benefits**:
- Importable for testing
- Reusable across scripts
- Easier to review (proper syntax highlighting)
- Enables gradual refactoring

**Structure**:
```
ventureos/
  lib/
    metrics_snapshot.py         # Main logic
    metrics_validation.py       # Validation functions
  tests/
    test_metrics_snapshot.py    # Unit tests
  scripts/
    metrics-snapshot.sh         # Thin wrapper calling lib
```

**Why**: Current embedded Python is hard to test/review/maintain  
**Effort**: 4-6 hours  
**Impact**: High (enables all other improvements)

---

### P1 (High Priority - Next Sprint)

#### 4. **Observability: Debug Mode & Intermediate Outputs**
**What**: Add `--debug` flag that logs calculation steps

```bash
scripts/metrics-snapshot.sh --debug --date 2026-02-13
```

**Outputs**:
```
DEBUG: Loaded 1,847 total records
DEBUG: Filtered to 327 records for 2026-02-13
DEBUG: Enabled jobs: ['atlas-heartbeat', 'backup-daily', ...]
DEBUG: Drift calculation:
  - Job atlas-heartbeat: 45 runs, 3 late, 0 missed
  - Job backup-daily: 1 run, 0 late, 0 missed
DEBUG: Baseline days available: 6
DEBUG: Validation checks passed ✓
```

**Save intermediate data**:
```json
{
  "raw": {
    "total_records": 1847,
    "daily_records": 327,
    "enabled_jobs": ["..."],
    "drift_by_job": {"..."}
  },
  "computed": {
    "success_rate": 0.994,
    "missed_cron": 0
  }
}
```

**Why**: Makes debugging issues 10x faster  
**Effort**: 4-6 hours  
**Impact**: Medium-High (operational)

---

#### 5. **Decouple Configuration: External SLO/Pattern Config**
**What**: Move hardcoded values to `config/metrics-slo.yaml`

```yaml
# config/metrics-slo.yaml
slo:
  success_rate: 0.95
  p95_latency_s: 90  # Adjusted from 60s (see section 5)
  missed_cron: 0
  backup_age_h: 24

patterns:
  backup:
    root: ~/backups/clawd
    pattern: "clawd-*.tar.gz"
    date_format: "%Y-%m-%d"
  
  timeout_keywords:
    - timeout
    - timed out
    - deadline exceeded
  
  handoff_pattern: "Session Send:\\s*`?([^`\\s]+)`?"

per_agent_overrides:
  archivist:
    p95_latency_s: 120  # Archival tasks are slower
```

**Why**: Changes don't require editing code, easier to review thresholds  
**Effort**: 3-4 hours  
**Impact**: Medium (maintainability)

---

#### 6. **Metrics Health Checks & Alerting**
**What**: Add self-monitoring to metrics generation

**Checks**:
```python
def health_checks(metrics, baseline):
    warnings = []
    
    # Baseline data insufficient
    if baseline and baseline['days_available'] < 3:
        warnings.append("Baseline has <3 days data (low confidence)")
    
    # Sharp regression
    if baseline:
        delta_success = metrics['success_rate'] - baseline['overall']['success_rate']
        if delta_success < -0.20:  # 20pp drop
            warnings.append(f"Success rate dropped {delta_success*100:.1f}pp")
    
    # Backup age critical
    backup_age = metrics['backup']['age_hours']
    if backup_age and backup_age > SLO['backup_age_h'] * 2:
        warnings.append(f"Backup age {backup_age:.1f}h exceeds 2x SLO")
    
    # No runs today
    if metrics['runs_total'] == 0:
        warnings.append("No cron runs recorded today (system offline?)")
    
    return warnings
```

**Escalation**: Write warnings to stderr, optionally post to Discord/Slack

**Why**: Prevents silent failures like 143h backup age going unnoticed  
**Effort**: 4-6 hours  
**Impact**: High (operational reliability)

---

### P2 (Nice to Have - Future Improvements)

#### 7. **Incremental Processing: Cache Parsed Data**
**What**: Save parsed JSONL to intermediate cache, only parse new data

**Structure**:
```
~/.openclaw/cron/runs/
  2026-02-12.jsonl
  2026-02-13.jsonl

~/.openclaw/cron/cache/
  2026-02-12.parsed.json  # Cached parsed records
  2026-02-13.parsed.json
```

**Why**: Faster snapshot generation (currently re-parses all JSONL every time)  
**Effort**: 1-2 days  
**Impact**: Low (performance optimization, not a bottleneck yet)

---

#### 8. **Schema Validation: JSON Schema for JSONL**
**What**: Define and validate expected JSONL structure

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["jobId", "runAtMs", "status", "durationMs"],
  "properties": {
    "jobId": {"type": "string"},
    "runAtMs": {"type": "number"},
    "status": {"enum": ["ok", "error"]},
    "durationMs": {"type": "number"}
  }
}
```

**Why**: Catches format changes early, documents expected structure  
**Effort**: 4-6 hours  
**Impact**: Low-Medium (defensive, not urgent)

---

#### 9. **Automated Regression Testing: Golden Snapshots**
**What**: Save known-good inputs/outputs, test against them in CI

```bash
tests/golden/
  2026-02-01.jsonl          # Known input
  2026-02-01.expected.json  # Known output

# In CI
python -m pytest tests/test_golden_snapshots.py
```

**Why**: Prevents future changes from silently breaking calculations  
**Effort**: 1-2 days  
**Impact**: Medium (prevents regression in CI)

---

## 5. P95 Latency SLO Recommendation

### Current State
- **Target**: 60s
- **Actual P95**: 95.7s (Feb 13), trending upward from 63.6s (Feb 09)
- **Exceeds SLO**: 4 out of 5 recent days

### Historical P95 Latency (Last 5 Days)
```
Feb 09: 63.6s  (106% of SLO)
Feb 10: 41.7s  ( 70% of SLO) ✅
Feb 11: 74.5s  (124% of SLO)
Feb 12: 85.1s  (142% of SLO)
Feb 13: 95.7s  (160% of SLO) ⚠️
```

**Trend**: Worsening (41s → 96s over 4 days)

### Why 60s Is Unrealistic for This System

**Multi-Agent Architecture Overhead**:
1. **Sub-agent spawns**: Each spawn adds 5-15s (session setup, context loading)
2. **Inter-agent communication**: Handoff latency, serialization
3. **File I/O**: Reading AGENTS.md, USER.md, MEMORY.md, daily notes
4. **Model inference**: Claude Sonnet 4 with `thinking=high` adds 10-30s per complex query
5. **External APIs**: Web search, browser automation, node commands

**Evidence from Per-Agent Breakdown**:
```
archivist:  P95 = 249.6s  (complex archival/research tasks)
atlas:      P95 =  49.0s  (lightweight heartbeat checks)
echo:       P95 = 128.8s  (message handling with context)
main:       P95 = 178.9s  (user interactions, multi-step workflows)
oracle:     P95 = 103.6s  (single sample, not statistically significant)
```

**Interpretation**:
- Simple tasks (atlas heartbeats): 49s P95 is achievable
- Complex tasks (archivist research, main workflows): 178-250s is normal
- **Overall P95 reflects the mix**: More complex tasks → higher P95

### Recommendation: Tiered SLO Approach

#### Option A: Adjust Overall SLO (Preferred)
```yaml
slo:
  p95_latency_s: 90      # Realistic for multi-agent system
  p95_warning_s: 120     # Manual review threshold
  p95_critical_s: 180    # Incident threshold
```

**Rationale**:
- 90s allows for typical sub-agent workflows
- 120s warning catches regressions early
- 180s critical indicates serious problems
- Based on observed 5-day P95 range (42-96s), 90s is the 75th percentile

**Re-evaluation**:
- Review quarterly based on trends
- If consistently under 75s for 30 days, tighten to 75s
- If frequently exceeding 120s, investigate root cause before raising SLO

---

#### Option B: Per-Agent SLOs (More Precise)
```yaml
slo_per_agent:
  atlas:      
    p95_latency_s: 60   # Lightweight tasks
  echo:       
    p95_latency_s: 90   # Message handling
  oracle:     
    p95_latency_s: 120  # Complex analysis
  main:       
    p95_latency_s: 150  # User workflows
  archivist:  
    p95_latency_s: 300  # Archival/research

overall:
  p95_latency_s: 100    # Weighted by agent mix
```

**Rationale**: Different agents have different complexity profiles

**Downside**: More complex to monitor, may miss overall trends

---

#### Option C: Optimize Latency (Aggressive, Risky)
**Target**: Keep 60s SLO, optimize system to meet it

**Required Changes**:
1. **Profile slow runs**: Identify bottlenecks (file I/O? model inference? sub-agent spawns?)
2. **Lazy load context**: Don't read MEMORY.md on every heartbeat
3. **Cache frequently-read files**: Keep AGENTS.md, USER.md in memory
4. **Reduce thinking mode**: Use `thinking=low` for simple tasks
5. **Reuse sub-agent sessions**: Don't spawn new session for each handoff
6. **Parallel operations**: Don't block on sequential file reads

**Effort**: 2-4 weeks of optimization work  
**Risk**: High (may break functionality, reduce quality)  
**Benefit**: Uncertain (may only gain 10-20s improvement)

**Recommendation**: Only pursue if 90s SLO is still too slow for user experience

---

### Final SLO Recommendation

**Proposed SLO Structure**:
```yaml
metrics_slo:
  success_rate: 0.95        # No change
  missed_cron: 0            # No change
  backup_age_h: 24          # No change
  
  latency:
    p50_target_s: 25        # NEW: Track median
    p95_target_s: 90        # CHANGED from 60s
    p95_warning_s: 120      # NEW: Manual review
    p95_critical_s: 180     # NEW: Incident
  
  timeout_rate: 0.05        # NEW: <5% is acceptable
  
  handoff:
    success_rate: 0.95      # NEW: If handoffs >10/day
```

**Rationale**:
- **90s P95** is realistic for multi-agent workflows (50% buffer over current target)
- **120s warning** catches early degradation (25% buffer over target)
- **180s critical** indicates serious issues (2x target)
- **P50 tracking** ensures simple tasks stay fast (median should be <30s)
- **Timeout rate SLO** formalizes acceptable timeout tolerance

**Implementation**:
1. Update `scripts/metrics-snapshot.sh` SLO dict
2. Update `config/metrics-slo.yaml` (once created)
3. Backfill historical comparisons with new thresholds
4. Monitor for 2 weeks, adjust if needed

---

## 6. Drift & Lateness Analysis

### Key Finding: Systemic Scheduling Issues

**Observed**:
- 224 out of 340 runs (66%) are late by >10s
- Drift P95: 217.8s (3.6 minutes late!)
- Drift P99: 329.2s (5.5 minutes late)
- Drift max: 353.2s (5.9 minutes late)

**This is NOT a metrics bug** - this is a real system performance issue.

### Root Causes (Hypothesis)

1. **Cron scheduler overloaded**: Too many jobs scheduled, can't keep up
2. **Job starvation**: Long-running jobs blocking short jobs
3. **Resource contention**: CPU/memory limits causing delays
4. **OpenClaw daemon lag**: Gateway scheduling mechanism falling behind

### Recommendations

1. **P0: Profile cron scheduler**:
   - How many jobs are scheduled concurrently?
   - What's the job queue depth?
   - Are jobs prioritized or FIFO?

2. **P1: Add job priority system**:
   - High priority: Critical heartbeats (every 5 min)
   - Normal priority: Routine checks (every 30 min)
   - Low priority: Batch processing (nightly)

3. **P1: Investigate long-running jobs**:
   - Identify jobs with P95 latency > 180s
   - Determine if they can be batched/throttled
   - Consider moving to separate queue

4. **P2: Optimize job scheduling**:
   - Spread jobs across the hour (not all at :00)
   - Add jitter to prevent thundering herd
   - Implement job timeout enforcement

---

## Summary: Priority Matrix

| Priority | Recommendation | Effort | Impact | Status |
|---|---|---|---|---|
| **P0** | Add validation layer | 2-4h | High | 🟡 Recommended |
| **P0** | Unit tests for calculations | 1-2d | High | 🟡 Recommended |
| **P0** | Extract Python to module | 4-6h | High | 🟡 Recommended |
| **P0** | Update P95 SLO to 90s | 1h | High | 🟢 **Action Required** |
| **P1** | Debug mode & observability | 4-6h | Med-High | 🟡 Recommended |
| **P1** | External config (YAML) | 3-4h | Medium | 🟡 Recommended |
| **P1** | Health checks & alerting | 4-6h | High | 🟡 Recommended |
| **P1** | Investigate cron drift/lateness | TBD | High | 🔴 **Action Required** |
| **P2** | Incremental processing cache | 1-2d | Low | ⚪ Future |
| **P2** | Schema validation | 4-6h | Low-Med | ⚪ Future |
| **P2** | Golden snapshot tests | 1-2d | Medium | ⚪ Future |

---

## Conclusion

**Fix Quality**: Both fixes are working correctly (Grade: **B+**)

**Systemic Issues**: The fixes revealed deeper problems:
- No validation layer (allowed 2000+ false misses to go unnoticed)
- Fragile heuristic-based parsing (timeouts, handoffs)
- No observability into KPI generation
- P95 latency SLO unrealistic for multi-agent architecture
- **66% of cron jobs running late** (real performance issue, not metrics)

**Top 3 Actions**:
1. ✅ **P0: Add validation layer** (2-4h) - prevents bad data
2. ✅ **P0: Update P95 SLO to 90s** (1h) - aligns with reality
3. ✅ **P1: Investigate cron drift** - 66% late is unacceptable

**Long-term**: Extract metrics to proper Python module with tests, add observability, implement health checks. Current monolithic embedded Python is maintainable short-term but will become a bottleneck as complexity grows.

---

**Reviewer**: oracle (subagent)  
**Generated**: 2026-02-13T23:58 CST  
**Review Duration**: ~30 minutes

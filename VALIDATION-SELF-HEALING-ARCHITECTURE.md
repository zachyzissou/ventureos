# Validation & Self-Healing Architecture

**Created:** 2026-01-30  
**Status:** 🔴 Design Phase → Implementation Required  
**Priority:** P0 - Critical Infrastructure

---

## The Principle

**Every system, every integration, every business unit should have:**
1. **Continuous validation** - Is it working? Is data flowing correctly?
2. **Automated detection** - Catch issues before they become problems
3. **Self-healing** - Fix common issues automatically without human intervention
4. **Escalation** - Alert only when auto-fix fails or issue is critical

**Goal:** 99.9% uptime across all systems with minimal manual intervention

---

## Architecture Overview

### Core Components

```
┌─────────────────────────────────────────────────────┐
│         Monitor-Agent (Dedicated Sub-Agent)         │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Detector │  │ Validator│  │  Healer  │        │
│  └──────────┘  └──────────┘  └──────────┘        │
│       ↓              ↓              ↓              │
│  Find Issues → Validate State → Auto-Fix          │
└─────────────────────────────────────────────────────┘
         ↓                    ↓                ↓
    ┌────────┐          ┌─────────┐     ┌─────────┐
    │ Systems│          │ Services│     │ Business│
    │        │          │         │     │  Units  │
    └────────┘          └─────────┘     └─────────┘
```

### Monitor-Agent Responsibilities

**Continuous Monitoring:**
- Health checks every 1-5 minutes (depending on criticality)
- Log analysis for errors/warnings
- Performance metrics (response times, resource usage)
- Data integrity checks (is data being captured/processed?)
- Security anomaly detection

**Validation Loops:**
- Test actual functionality (not just "is it running?")
- Verify outputs match expectations
- Check dependencies are healthy
- Validate API responses
- Confirm data flows end-to-end

**Self-Healing Actions:**
- Restart crashed services
- Clear stuck queues
- Rotate expiring credentials
- Retry failed operations (with exponential backoff)
- Fallback to secondary systems
- Scale resources if constrained
- Clean up stale data

**Escalation:**
- P0: Immediate alert (critical failure, data loss, security breach)
- P1: Alert within 15 minutes (degraded service, failed auto-fix)
- P2: Alert within 1 hour (non-critical issue, user-facing)
- P3: Daily digest (warnings, potential issues)

---

## Validation Categories

### 1. Infrastructure Validation

**What We Monitor:**
- Gateway health (is OpenClaw running?)
- Cron jobs (are they executing? Succeeding?)
- API integrations (rate limits, auth, connectivity)
- Database/storage (disk space, corruption, backups)
- Network connectivity (internet, local services)

**Validation Tests:**
```bash
# Example: Gateway health check
openclaw status | grep "Running" || restart_gateway

# Example: Cron job validation
check_last_run("stantontimes-p0-monitor") < 30min || alert

# Example: API health
test_api_call(anthropic) || fallback_to_local_model
```

**Self-Healing:**
- Restart gateway if unresponsive
- Re-enable disabled cron jobs if fixed
- Rotate API keys if rate limited
- Clear caches if stale
- Restart services stuck in bad state

---

### 2. Data Integrity Validation

**What We Monitor:**
- Memory system (files being written? Git commits succeeding?)
- Obsidian extraction (facts being captured? Vault syncing?)
- State files (StantonTimes state.json, heartbeat-state.json)
- Logs (errors, warnings, anomalies)
- Backups (daily backups completing? Verifiable?)

**Validation Tests:**
```bash
# Example: Memory file existence
test -f memory/$(date +%Y-%m-%d).md || create_daily_log

# Example: Obsidian sync
last_obsidian_write < 1hour || trigger_extraction

# Example: State file integrity
jq . state.json || restore_from_backup
```

**Self-Healing:**
- Create missing files
- Restore from backup if corrupted
- Re-run failed extractions
- Trigger manual sync if automatic fails
- Consolidate if files too large

---

### 3. Business Unit Validation

**What We Monitor:**
- **StantonTimes:** Is bot checking Twitter? Posting? Approvals flowing?
- **Low Noise Studios:** Is CI passing? PRs being reviewed? Milestones tracking?
- **Consulting:** Are leads being tracked? Follow-ups sent?
- **Talent Service:** Are applications submitted? Responses logged?
- **Research Lab:** Are posts publishing? GitHub commits happening?

**Validation Tests:**
```bash
# Example: StantonTimes health
last_tweet_posted < 24hours || investigate_twitter_auth
pending_approvals > 0 && age > 48hours && alert

# Example: Bloom CI health
ci_failures > 3 && alert_with_details

# Example: Consulting pipeline
leads_in_funnel > 0 && no_followup_14days && alert
```

**Self-Healing:**
- Refresh Twitter cookies if auth fails
- Re-run CI if flaky failure
- Auto-send follow-up emails if forgotten
- Trigger application retry if failed
- Auto-publish queued content

---

### 4. Security Validation

**What We Monitor:**
- Failed authentication attempts (brute force?)
- Unusual API activity (exfiltration?)
- Credential expiry (keys about to expire?)
- Anomalous patterns (off-hours access, bulk exports)
- System vulnerabilities (outdated dependencies, CVEs)

**Validation Tests:**
```bash
# Example: Auth failure detection
failed_auth_attempts > 5 in 1hour && lockdown

# Example: Credential expiry
days_until_expiry(api_key) < 7 && rotate_key

# Example: Anomaly detection
api_calls_per_hour > 3*baseline && investigate
```

**Self-Healing:**
- Auto-rotate expiring credentials
- Lockdown on suspicious activity
- Update dependencies with security patches
- Revoke compromised tokens
- Enable additional monitoring if anomalies

---

### 5. Performance Validation

**What We Monitor:**
- Response times (APIs, cron jobs, user interactions)
- Resource usage (CPU, memory, disk, network)
- Queue depths (are tasks backing up?)
- Error rates (increasing failures?)
- Cost metrics (are we burning too much?)

**Validation Tests:**
```bash
# Example: Performance degradation
avg_response_time > 2*baseline && investigate

# Example: Resource exhaustion
disk_usage > 90% && cleanup_old_files

# Example: Cost spike
daily_api_cost > 2*avg && alert_with_breakdown
```

**Self-Healing:**
- Scale resources if constrained
- Clear old logs/temp files
- Throttle non-critical operations
- Switch to cheaper models (Haiku vs Sonnet)
- Cancel runaway processes

---

## Implementation Plan

### Phase 0: Foundation (Immediate - Next 2 Weeks)

**Week 1: Core Monitoring Infrastructure**
- [ ] Create Monitor-Agent (dedicated sub-agent)
- [ ] Define validation schema (what to check, how often)
- [ ] Build health check framework
  - Gateway health
  - Cron job status
  - API connectivity
  - Disk space
  - Git status
- [ ] Implement basic alerting (Discord DM)
- [ ] Create monitoring dashboard (Obsidian note or simple web page)

**Week 2: Self-Healing Actions**
- [ ] Implement auto-restart for gateway
- [ ] Implement cron job re-enablement
- [ ] Implement credential rotation automation
- [ ] Implement log cleanup
- [ ] Implement backup verification
- [ ] Test all self-healing actions in sandbox

**Success Criteria:**
- Monitor-Agent running continuously
- 10+ validation checks active
- 5+ self-healing actions working
- Zero manual interventions for 48 hours

---

### Phase 1-2: Business Unit Monitoring (Q2 2026)

**As Each Business Unit Launches:**
- [ ] Define unit-specific health metrics
- [ ] Build validation tests
- [ ] Implement self-healing for common failures
- [ ] Set up performance baselines
- [ ] Configure alerting thresholds

**StantonTimes Specific:**
- [ ] Twitter API health check (every 5 min)
- [ ] Posting validation (did tweet actually post?)
- [ ] Engagement tracking (are metrics updating?)
- [ ] Approval queue monitoring (any stuck items?)
- [ ] Auto-refresh cookies if auth fails

**Low Noise Studios Specific:**
- [ ] CI/CD health (are builds passing?)
- [ ] PR staleness detection (aging PRs?)
- [ ] Issue triage (new bugs being triaged?)
- [ ] Performance regression detection
- [ ] Auto-retry flaky tests

**Consulting/Talent/Research:**
- [ ] Pipeline health (leads moving through funnel?)
- [ ] Follow-up automation (no missed follow-ups)
- [ ] Content publishing (scheduled posts going out?)
- [ ] Application tracking (submissions logged correctly?)

---

### Phase 3-4: Advanced Monitoring (2027)

**Predictive Detection:**
- [ ] Trend analysis (is something degrading?)
- [ ] Anomaly detection (unusual patterns?)
- [ ] Capacity planning (will we run out of resources?)
- [ ] Cost forecasting (spending trends?)

**Learning & Adaptation:**
- [ ] Pattern recognition (what failures repeat?)
- [ ] Auto-tuning thresholds (reduce false positives)
- [ ] Incident history (what worked to fix it?)
- [ ] Playbook automation (common fixes → auto-execute)

**Cross-System Orchestration:**
- [ ] Dependency mapping (if X fails, what breaks?)
- [ ] Cascading failure prevention
- [ ] Load balancing across services
- [ ] Graceful degradation (keep critical paths working)

---

## Monitor-Agent Specification

### Technical Design

**Language/Framework:** Python (async, easy to maintain)  
**Execution:** Persistent process (not cron-based)  
**State:** SQLite database for history/metrics  
**Alerting:** Discord DM (primary), SMS (critical)  
**Dashboard:** Obsidian note updated every 5 min  

### Core Modules

**1. Detector Module**
```python
class Detector:
    def check_gateway_health(self):
        # Test RPC endpoint, response time
    
    def check_cron_jobs(self):
        # Parse cron logs, last run times
    
    def check_api_health(self):
        # Test API calls, rate limits
    
    def check_disk_space(self):
        # df -h, alert if >90%
    
    # ... 20+ more checks
```

**2. Validator Module**
```python
class Validator:
    def validate_memory_system(self):
        # Check daily log exists, git status clean
    
    def validate_stantontimes(self):
        # Check state.json, last tweet time, approvals
    
    def validate_bloom_ci(self):
        # Check GitHub Actions, PR status
    
    # ... business unit validations
```

**3. Healer Module**
```python
class Healer:
    def restart_gateway(self):
        # openclaw gateway restart
    
    def rotate_credentials(self):
        # Auto-rotate expiring keys
    
    def clear_caches(self):
        # Clean temp files, logs
    
    def retry_failed_job(self, job_id):
        # Re-run with exponential backoff
    
    # ... self-healing actions
```

**4. Alerter Module**
```python
class Alerter:
    def alert(self, severity, message, context):
        if severity == "P0":
            send_discord_dm(message)
            send_sms(message)  # Critical only
        elif severity == "P1":
            send_discord_dm(message)
        elif severity == "P2":
            queue_for_next_check_in(message)
        elif severity == "P3":
            add_to_daily_digest(message)
```

### Execution Loop

```python
async def monitor_loop():
    while True:
        # Run all detectors
        issues = await run_all_detectors()
        
        # Validate each issue
        validated = await validate_issues(issues)
        
        # Attempt self-healing
        for issue in validated:
            if issue.can_auto_fix:
                result = await heal(issue)
                if result.success:
                    log_fix(issue, result)
                else:
                    alert(issue.severity, issue.message)
            else:
                alert(issue.severity, issue.message)
        
        # Update dashboard
        await update_monitoring_dashboard()
        
        # Sleep based on priority (1-5 min)
        await asyncio.sleep(60)
```

---

## Validation Schema (Examples)

### Gateway Health
```yaml
check: gateway_health
frequency: 1 minute
test: curl http://localhost:18789/rpc | grep ok
on_failure:
  - action: restart_gateway
  - alert: P0 if restart fails
```

### Cron Job Status
```yaml
check: cron_job_last_run
frequency: 5 minutes
test: last_run(job_id) < expected_interval
on_failure:
  - action: re_enable_job if disabled
  - action: trigger_manual_run if stuck
  - alert: P1 if job failing repeatedly
```

### API Rate Limits
```yaml
check: api_rate_limit
frequency: 10 minutes
test: remaining_calls(api) > threshold
on_failure:
  - action: throttle_non_critical_calls
  - action: fallback_to_local_model
  - alert: P2 if limit hit
```

### Data Integrity
```yaml
check: daily_memory_file
frequency: 1 hour
test: exists(memory/YYYY-MM-DD.md)
on_failure:
  - action: create_file_from_template
  - action: git_add_commit
  - alert: P3 (log only)
```

### Security Anomaly
```yaml
check: failed_auth_attempts
frequency: 5 minutes
test: count(failed_auth) < 5 in last_hour
on_failure:
  - action: lockdown_system
  - action: revoke_suspicious_tokens
  - alert: P0 immediately
```

---

## Integration with Existing Systems

### HEARTBEAT.md Enhancement

**Current:** Manual checks every 2-4 hours  
**Enhanced:** Monitor-Agent runs continuously, HEARTBEAT.md becomes high-level orchestration

```markdown
## Heartbeat Checks (Orchestrated by Monitor-Agent)

### System Health (Every 1 min)
- Gateway health
- Cron job status
- API connectivity
- **Auto-healed by Monitor-Agent**

### Business Units (Every 5 min)
- StantonTimes (posting, approvals)
- Bloom CI (builds, PRs)
- **Auto-healed or alerted**

### Proactive Work (Every 1 hour)
- Memory maintenance
- Obsidian extraction
- Git commits
- **Automated by Monitor-Agent**
```

### Cron Job Wrapper

**Add validation wrapper to all cron jobs:**

```bash
#!/bin/bash
# validation-wrapper.sh

JOB_NAME=$1
shift
JOB_COMMAND="$@"

# Record start
openclaw "$(date) - Starting $JOB_NAME" >> /tmp/cron-status.log

# Execute job
$JOB_COMMAND
EXIT_CODE=$?

# Validate result
if [ $EXIT_CODE -ne 0 ]; then
    openclaw "$(date) - $JOB_NAME FAILED (exit $EXIT_CODE)" >> /tmp/cron-status.log
    # Trigger Monitor-Agent investigation
    curl -X POST http://localhost:18789/monitor/job-failed \
        -d "name=$JOB_NAME&exit_code=$EXIT_CODE"
else
    openclaw "$(date) - $JOB_NAME SUCCESS" >> /tmp/cron-status.log
fi

exit $EXIT_CODE
```

**Usage in cron config:**
```json
{
  "command": "./validation-wrapper.sh 'stantontimes-p0' 'bird search ...'",
  "schedule": "*/15 * * * *"
}
```

---

## Monitoring Dashboard

**Location:** `/Users/zachgonser/Obsidian/VaultZap/life/areas/systems/System Health Dashboard.md`

**Auto-updated every 5 minutes by Monitor-Agent**

```markdown
# System Health Dashboard

**Last Updated:** 2026-01-30 11:19:45 CST  
**Overall Status:** 🟢 Healthy

---

## Infrastructure

| Component | Status | Last Check | Issues |
|-----------|--------|------------|--------|
| Gateway | 🟢 Healthy | 11:19:30 | None |
| Cron Jobs | 🟢 15/15 Running | 11:18:00 | None |
| APIs | 🟢 All Healthy | 11:19:00 | None |
| Disk Space | 🟢 65% Used | 11:15:00 | None |

## Business Units

| Unit | Status | Metrics | Last Activity |
|------|--------|---------|---------------|
| StantonTimes | 🟢 Operational | 5 tweets/day | 2 min ago (posted) |
| Low Noise Studios | 🟢 Developing | 3 PRs open | 15 min ago (CI passed) |
| Consulting | 🟡 Launching | 2 leads in pipeline | 1 day ago |

## Recent Actions

- 11:18:45 - Auto-cleared temp files (disk >80%)
- 11:15:30 - Refreshed Twitter cookies (proactive)
- 11:10:00 - Restarted stuck cron job (stantontimes-engagement)

## Alerts (Last 24h)

- **P2** (10:30 AM) - Bloom CI flaky test, auto-retried, passed
- **P3** (09:00 AM) - Memory file >100 lines, archived to reduce context

---

**Monitor-Agent:** Running (PID 12345) | Checks: 1,234 | Fixes: 23 | Alerts: 2
```

---

## Success Metrics

### Phase 0 (Foundation)
- ✅ Monitor-Agent deployed and running 24/7
- ✅ 15+ validation checks active
- ✅ 10+ self-healing actions working
- ✅ 99%+ uptime for all critical systems
- ✅ <1 manual intervention per week

### Phase 1-2 (Business Units)
- ✅ Each business unit has dedicated validation suite
- ✅ 95%+ issues auto-healed without human intervention
- ✅ Mean time to detection (MTTD) < 5 minutes
- ✅ Mean time to resolution (MTTR) < 15 minutes

### Phase 3+ (Advanced)
- ✅ Predictive failure detection (catch before failure)
- ✅ 99.9%+ uptime across all systems
- ✅ Zero manual interventions for routine issues
- ✅ Self-learning from incident history

---

## Cost-Benefit Analysis

### Cost to Build
- **Development Time:** 2-3 weeks (Phase 0)
- **Maintenance:** 2-4 hours/week (ongoing)
- **Infrastructure:** $5-10/month (monitoring tools)

### Benefits
- **Time Saved:** 5-10 hours/week (manual monitoring/fixing)
- **Reduced Downtime:** 99%+ uptime vs. 95% manual
- **Faster Detection:** 5 min vs. hours/days
- **Scalability:** Can monitor 100+ systems with same overhead
- **Peace of Mind:** Sleep knowing issues auto-fix

**ROI:** Pays for itself in first month, 10x return by end of year

---

## Implementation Priority

**Phase 0 (Next 2 Weeks) - CRITICAL:**
1. Build Monitor-Agent core framework
2. Implement 10 most critical checks
3. Implement 5 most common self-healing actions
4. Deploy and test for 48 hours
5. Add to PHASE-1-EXECUTION.md as Track 4

**Phase 1-2 (Q2 2026):**
- Add business unit monitoring as each launches
- Expand self-healing playbook
- Build monitoring dashboard

**Phase 3+ (2027+):**
- Predictive analytics
- Advanced learning
- Cross-system orchestration

---

## Next Actions

1. **Add to PHASE-1-EXECUTION.md as Track 4** (Monitor-Agent deployment)
2. **Update ECHO-STRATEGIC-PLAN.md** (add monitoring as Phase 1 requirement)
3. **Create Monitor-Agent specification** (detailed technical design)
4. **Build MVP in Week 1 of Phase 0** (basic checks + self-healing)
5. **Expand iteratively** (add checks/fixes as systems grow)

---

**This is not optional. This is infrastructure. Build it now, benefit forever.** ✅

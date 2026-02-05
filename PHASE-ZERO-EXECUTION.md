# Phase Zero: Self-Healing Foundation

**Created:** 2026-01-30  
**Status:** 🔴 Ready to Execute  
**Timeline:** 2-3 weeks (Starting 2026-01-31)  
**Goal:** Deploy operational self-healing validation system before Phase 1 launch

---

## Executive Summary

**The Problem:** We're about to launch complex business units (StantonTimes, Bloom, Consulting) on infrastructure that doesn't self-validate or self-heal. Without this foundation, we'll spend more time firefighting than building.

**The Solution:** Build Monitor-Agent — a dedicated self-healing system that continuously validates infrastructure, data integrity, and business unit health, automatically fixing issues before they become problems.

**The Stakes:** Phase Zero IS the foundation. Everything else builds on top of this. Get it right, or everything else suffers.

---

## Development Acceleration: Coding Agents

**New Integration (2026-01-30):** Leverage `codex-cli` and `cursor-agent` for 5-10x development velocity.

### Tools Available
- **Codex CLI** (`npx codex`) - Code generation, review, refactoring
- **Cursor Agent** (`cursor-agent`) - Interactive sessions, planning, architecture analysis

### When to Use

**Codex for:**
- Boilerplate generation (new detectors, validators, healers)
- Test suite generation (pytest, comprehensive coverage)
- Code review before commits
- Refactoring existing code

**Cursor Agent for:**
- Architecture planning (`--mode plan`)
- Complex multi-file changes
- Session-based development (`--continue` to resume)
- Q&A and code explanations (`--mode ask`)

### Integration Into Phase Zero

**Before implementing each module:**
```bash
# Validate approach with Cursor Agent
cursor-agent --mode plan --print \
  "Review the [MODULE] implementation plan and suggest improvements"
```

**When generating boilerplate:**
```bash
# Generate following existing patterns
npx codex exec --full-auto \
  "Create [NEW_MODULE] following the pattern in [EXISTING_MODULE]"
```

**Before committing:**
```bash
# Automated code review
npx codex review [changed_files]
```

**For comprehensive testing:**
```bash
# Generate test suite
npx codex exec --sandbox workspace-write \
  "Generate unit tests for [MODULE] with 100% coverage following test_[pattern].py"
```

### Expected Impact
- **Time savings:** 50-70% reduction in boilerplate writing
- **Quality improvement:** AI code review catches issues before commit
- **Test coverage:** Automated test generation ensures comprehensive coverage
- **Documentation:** AI-generated docstrings and README updates

See `CODING-AGENT-INTEGRATION.md` for complete guide.

---

## Track 5: AI-Assisted Development Framework 🤖

**Priority:** P0 - Development velocity multiplier  
**Timeline:** Parallel to Days 6-7 (1-2 weeks)  
**Status:** 🔴 Proposal stage  
**Execution Mode:** Sub-agent (parallel development)

### Vision

Build robust orchestration system for Codex/Cursor instead of manual prompts.

**Problem:** Currently requires manual prompt crafting, working directory setup, output validation, test generation. Slow and error-prone.

**Solution:** `./codegen` CLI that automates entire pipeline:
- Template selection
- Context injection (existing code examples)
- Quality validation (syntax, imports, patterns)
- Test generation + execution
- Auto-commit if quality > 8.0/10

### Components

1. **CLI Wrapper** (`./codegen detector|healer|alerter|tests`)
2. **Template Engine** (smart prompt construction)
3. **Quality Validator** (automated validation gates)
4. **Multi-Agent Orchestration** (Codex/Cursor/Claude selection)
5. **Feedback Loop** (learns from successes/failures)

### Expected Impact

**Time savings:** 28 min/component → 2 min (93% reduction)  
**Quality improvement:** Only accept code scoring >8.0/10  
**Test coverage:** 100% auto-generated  
**Reusable:** Works for all future projects (StantonTimes, Bloom, etc.)

### Implementation Plan

**Week 1:** Core CLI + basic validation  
**Week 2:** Quality gates + auto-testing  
**Week 3:** Multi-agent orchestration  
**Week 4:** Feedback loop + optimization

### Integration Strategy

**Parallel Execution:**
- OpenClaw continues Days 6-7 manually (~1-1.5 hours)
- Sub-agent builds framework (1-2 weeks)
- Framework ready for Phase 1+ development

**Deliverables:**
- `codegen` CLI tool
- Quality validation system
- Template library
- Usage documentation
- Metrics dashboard

**Success Metrics:**
- >90% success rate on first generation
- <2 min per component generation
- Quality score >8.0/10 consistently
- 100% test coverage auto-generated

See `AI-DEV-FRAMEWORK-PROPOSAL.md` for complete design.

---

## Validation Methodology Integration

Three validation layers synthesized from existing architecture:

### Layer 1: Infrastructure Validation

**What We Monitor:**
- Gateway health (OpenClaw daemon status, API responsiveness)
- Cron jobs (execution status, success/failure, timing)
- API integrations (Anthropic, Discord, Twitter, GitHub)
- Storage & memory (disk space, file integrity, git status)
- Network connectivity (internet, local services, Windows node)

**Validation Checks:**
```yaml
gateway_health:
  frequency: 60s
  test: "openclaw status | grep 'Running'"
  auto_fix: "openclaw gateway restart"
  escalate: P0 if restart fails

cron_job_health:
  frequency: 300s
  test: "last_run(job_id) < max_interval"
  auto_fix: "re-enable if disabled, trigger manual run"
  escalate: P1 if failing 3+ consecutive times

api_connectivity:
  frequency: 300s
  test: "test_api_call(provider)"
  auto_fix: "rotate credentials, use fallback provider"
  escalate: P1 if all providers fail

disk_space:
  frequency: 3600s
  test: "usage < 90%"
  auto_fix: "clear temp files, archive old logs"
  escalate: P2 if can't free space
```

**Self-Healing Actions:**
- Restart gateway on unresponsiveness
- Re-enable disabled cron jobs (after root cause fixed)
- Rotate API credentials proactively (before expiry)
- Clear caches and temp files automatically
- Archive old logs when disk fills

**Success Criteria:**
- 99.9% gateway uptime
- Zero cron jobs stuck in failed state >15 minutes
- Zero API outages due to credential expiry
- Disk usage stays below 85%

---

### Layer 2: Data Integrity Validation

**What We Monitor:**
- Memory system (daily logs created, MEMORY.md updated)
- State files (StantonTimes state.json, heartbeat-state.json)
- Obsidian sync (fact extraction, vault writes)
- Git health (uncommitted changes, sync status)
- Backups (completion, integrity, recoverability)

**Validation Checks:**
```yaml
daily_memory_file:
  frequency: 3600s
  test: "exists(memory/YYYY-MM-DD.md)"
  auto_fix: "create from template"
  escalate: P3 (log only)

state_file_integrity:
  frequency: 1800s
  test: "jq . state.json && validate_schema(state.json)"
  auto_fix: "restore from backup"
  escalate: P1 if backup also corrupted

obsidian_extraction:
  frequency: 3600s
  test: "last_extraction < 2 hours"
  auto_fix: "trigger manual extraction"
  escalate: P2 if extraction consistently failing

git_status:
  frequency: 3600s
  test: "uncommitted_changes < 50 files"
  auto_fix: "git add -A && git commit -m 'Auto-commit'"
  escalate: P3 (log only)

backup_verification:
  frequency: 86400s
  test: "last_backup < 24 hours && test_restore()"
  auto_fix: "trigger backup now"
  escalate: P1 if backups failing 2+ days
```

**Self-Healing Actions:**
- Create missing memory files from template
- Restore corrupted state files from backup
- Re-run failed Obsidian extractions
- Auto-commit memory changes to git
- Trigger manual backups if scheduled fails

**Success Criteria:**
- Zero missing daily memory files
- Zero corrupted state files >5 minutes
- 95% of Obsidian extractions succeed within 2 hours
- Git status clean within 1 hour of changes
- 100% backup success rate

---

### Layer 3: Business Unit Validation

**What We Monitor:**

#### StantonTimes
- Tweet fetching (is data coming in?)
- Tweet posting (are drafts going out?)
- Approval queue (any stuck approvals?)
- Engagement tracking (replies, interactions)
- Twitter authentication (cookies valid?)

**Validation Checks:**
```yaml
stantontimes_tweet_fetching:
  frequency: 900s
  test: "last_tweet_fetch_success < 15 min"
  auto_fix: "refresh cookies, retry"
  escalate: P1 if auth invalid

stantontimes_posting:
  frequency: 3600s
  test: "tweets_posted_today > 0 && last_post < 6 hours"
  auto_fix: "check queue, trigger post if ready"
  escalate: P2 if 12 hours without post

stantontimes_approvals:
  frequency: 7200s
  test: "pending_approval_age < 48 hours"
  auto_fix: "send reminder via Discord"
  escalate: P2 if approval stuck 48h+
```

#### Low Noise Studios (Bloom)
- CI/CD status (builds passing?)
- PR health (aging PRs, stale reviews)
- Issue triage (new issues labeled?)
- Performance (regression detection)

**Validation Checks:**
```yaml
bloom_ci_health:
  frequency: 1800s
  test: "latest_ci_status == 'success'"
  auto_fix: "retry if flaky, alert if real failure"
  escalate: P1 if main branch broken

bloom_pr_staleness:
  frequency: 86400s
  test: "max_pr_age < 7 days"
  auto_fix: "send reminder to Discord"
  escalate: P2 if PR stale 14+ days
```

#### Consulting / Talent Service / Research Lab
- Pipeline health (leads moving through funnel?)
- Follow-up automation (no missed follow-ups)
- Content publishing (scheduled posts)
- Application tracking (submissions logged)

**Validation Checks:**
```yaml
consulting_follow_ups:
  frequency: 86400s
  test: "no leads without followup > 7 days"
  auto_fix: "queue follow-up email"
  escalate: P2 if lead ghosted 14+ days

content_publishing:
  frequency: 3600s
  test: "scheduled_posts_today published"
  auto_fix: "trigger publish now"
  escalate: P2 if publish fails
```

**Self-Healing Actions:**
- Refresh Twitter cookies before expiry
- Auto-retry flaky CI tests
- Send follow-up reminders via Discord
- Trigger manual publish for stuck posts
- Queue approval reminders

**Success Criteria:**
- StantonTimes: 95% tweet fetch success rate
- StantonTimes: Zero stuck approvals >48h
- Bloom: Zero broken main branch >15 min
- Consulting: Zero missed follow-ups
- Research: 100% scheduled publish success rate

---

## Monitor-Agent Architecture

### System Design

```
┌─────────────────────────────────────────────────────┐
│         Monitor-Agent (Python Daemon)               │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │  Detector    │  │  Validator   │  │  Healer  │ │
│  │              │  │              │  │          │ │
│  │ - Gateway    │  │ - Test       │  │ - Fix    │ │
│  │ - Cron Jobs  │  │ - Verify     │  │ - Retry  │ │
│  │ - APIs       │  │ - Schema     │  │ - Rotate │ │
│  │ - Disk       │  │ - Integrity  │  │ - Clean  │ │
│  └──────────────┘  └──────────────┘  └──────────┘ │
│         ↓                  ↓                ↓       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │  State DB    │  │  Action Log  │  │ Alerter  │ │
│  │  (SQLite)    │  │  (SQLite)    │  │ (Discord)│ │
│  └──────────────┘  └──────────────┘  └──────────┘ │
└─────────────────────────────────────────────────────┘
         ↓                    ↓                ↓
    ┌────────┐          ┌─────────┐     ┌─────────┐
    │Infra   │          │ Data    │     │Business │
    │Systems │          │ Files   │     │ Units   │
    └────────┘          └─────────┘     └─────────┘
```

### Technical Stack

**Language:** Python 3.12+  
**Framework:** asyncio (async/await for concurrency)  
**Database:** SQLite (for state, history, metrics)  
**Alerting:** Discord webhooks (primary), SMS (critical P0)  
**Dashboard:** Auto-generated markdown (Obsidian)  
**Execution:** systemd service (persistent daemon)

### Core Modules

#### 1. Detector Module (`detector.py`)

```python
class Detector:
    """Finds issues across all monitored systems"""
    
    async def check_gateway_health(self) -> Issue | None:
        """Test gateway RPC endpoint, response time"""
        try:
            result = await run_cmd("openclaw status")
            if "Running" not in result:
                return Issue(
                    severity="P0",
                    category="infrastructure",
                    system="gateway",
                    message="Gateway not running",
                    can_auto_fix=True
                )
        except Exception as e:
            return Issue(severity="P0", system="gateway", 
                        message=f"Gateway check failed: {e}")
    
    async def check_cron_job(self, job_id: str) -> Issue | None:
        """Check if cron job ran recently and succeeded"""
        last_run = await get_last_run_time(job_id)
        expected_interval = get_job_interval(job_id)
        
        if time.time() - last_run > expected_interval * 1.5:
            return Issue(
                severity="P1",
                category="infrastructure",
                system="cron",
                message=f"Job {job_id} overdue (last run {last_run})",
                can_auto_fix=True,
                metadata={"job_id": job_id}
            )
    
    async def check_api_health(self, provider: str) -> Issue | None:
        """Test API connectivity and rate limits"""
        # Implementation details...
    
    async def check_disk_space(self) -> Issue | None:
        """Check disk usage across monitored paths"""
        # Implementation details...
    
    # 20+ more detector methods...
```

#### 2. Validator Module (`validator.py`)

```python
class Validator:
    """Validates system state and data integrity"""
    
    async def validate_memory_system(self) -> Issue | None:
        """Check daily log exists, git status, MEMORY.md sync"""
        today = datetime.now().strftime("%Y-%m-%d")
        memory_file = f"memory/{today}.md"
        
        if not os.path.exists(memory_file):
            return Issue(
                severity="P3",
                category="data_integrity",
                system="memory",
                message=f"Missing daily log: {memory_file}",
                can_auto_fix=True
            )
    
    async def validate_state_file(self, path: str) -> Issue | None:
        """Validate JSON state file integrity and schema"""
        try:
            with open(path) as f:
                data = json.load(f)
            
            # Schema validation
            if not validate_schema(data, path):
                return Issue(
                    severity="P1",
                    category="data_integrity",
                    system="state_files",
                    message=f"Invalid schema: {path}",
                    can_auto_fix=True,
                    metadata={"backup_available": True}
                )
        except json.JSONDecodeError:
            return Issue(
                severity="P1",
                category="data_integrity",
                system="state_files",
                message=f"Corrupted JSON: {path}",
                can_auto_fix=True
            )
    
    async def validate_business_unit(self, unit: str) -> Issue | None:
        """Business unit specific validation"""
        # Implementation details...
    
    # More validator methods...
```

#### 3. Healer Module (`healer.py`)

```python
class Healer:
    """Executes self-healing actions"""
    
    async def restart_gateway(self, issue: Issue) -> HealResult:
        """Restart the Gateway daemon"""
        try:
            await run_cmd("openclaw gateway restart")
            await asyncio.sleep(5)
            
            # Verify fix
            result = await run_cmd("openclaw status")
            if "Running" in result:
                return HealResult(
                    success=True,
                    message="Gateway restarted successfully",
                    action_taken="restart_gateway"
                )
            else:
                return HealResult(
                    success=False,
                    message="Gateway restart failed verification",
                    escalate=True
                )
        except Exception as e:
            return HealResult(
                success=False,
                message=f"Gateway restart failed: {e}",
                escalate=True
            )
    
    async def re_enable_cron_job(self, issue: Issue) -> HealResult:
        """Re-enable a disabled cron job"""
        job_id = issue.metadata.get("job_id")
        # Implementation details...
    
    async def rotate_credentials(self, issue: Issue) -> HealResult:
        """Auto-rotate expiring API credentials"""
        # Implementation details...
    
    async def clear_temp_files(self, issue: Issue) -> HealResult:
        """Clean up temp files and logs to free disk space"""
        # Implementation details...
    
    async def create_missing_memory_file(self, issue: Issue) -> HealResult:
        """Create missing daily memory file from template"""
        # Implementation details...
    
    async def restore_state_from_backup(self, issue: Issue) -> HealResult:
        """Restore corrupted state file from backup"""
        # Implementation details...
    
    # 15+ more healing actions...
```

#### 4. Alerter Module (`alerter.py`)

```python
class Alerter:
    """Sends alerts via Discord, SMS, etc."""
    
    async def alert(self, issue: Issue, heal_result: HealResult = None):
        """Send alert based on severity"""
        
        if issue.severity == "P0":
            # Critical - Discord DM + SMS
            await self.send_discord_dm(issue, heal_result)
            if not heal_result or not heal_result.success:
                await self.send_sms(issue)
        
        elif issue.severity == "P1":
            # High - Discord DM
            await self.send_discord_dm(issue, heal_result)
        
        elif issue.severity == "P2":
            # Medium - Queue for next check-in
            await self.queue_for_checkin(issue, heal_result)
        
        elif issue.severity == "P3":
            # Low - Daily digest
            await self.add_to_daily_digest(issue, heal_result)
    
    async def send_discord_dm(self, issue: Issue, heal_result: HealResult = None):
        """Send formatted alert via Discord webhook"""
        embed = {
            "title": f"🚨 {issue.severity}: {issue.system}",
            "description": issue.message,
            "color": self.get_color_for_severity(issue.severity),
            "fields": [
                {"name": "Category", "value": issue.category, "inline": True},
                {"name": "Time", "value": datetime.now().isoformat(), "inline": True}
            ]
        }
        
        if heal_result:
            if heal_result.success:
                embed["fields"].append({
                    "name": "✅ Auto-Fixed",
                    "value": heal_result.message,
                    "inline": False
                })
            else:
                embed["fields"].append({
                    "name": "❌ Auto-Fix Failed",
                    "value": heal_result.message,
                    "inline": False
                })
        
        # Send to Discord webhook...
```

#### 5. State Database (`state_db.py`)

**SQLite Schema:**

```sql
-- System health history
CREATE TABLE health_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    category TEXT NOT NULL,
    system TEXT NOT NULL,
    check_name TEXT NOT NULL,
    status TEXT NOT NULL, -- ok, warning, error
    response_time_ms INTEGER,
    metadata TEXT -- JSON blob
);

-- Issues detected
CREATE TABLE issues (
    id TEXT PRIMARY KEY, -- UUID
    detected_at INTEGER NOT NULL,
    resolved_at INTEGER,
    severity TEXT NOT NULL,
    category TEXT NOT NULL,
    system TEXT NOT NULL,
    message TEXT NOT NULL,
    can_auto_fix INTEGER NOT NULL,
    metadata TEXT -- JSON blob
);

-- Healing actions taken
CREATE TABLE healing_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    action_name TEXT NOT NULL,
    success INTEGER NOT NULL,
    message TEXT,
    FOREIGN KEY (issue_id) REFERENCES issues(id)
);

-- Alerts sent
CREATE TABLE alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    severity TEXT NOT NULL,
    channel TEXT NOT NULL, -- discord, sms, digest
    delivered INTEGER NOT NULL,
    FOREIGN KEY (issue_id) REFERENCES issues(id)
);

-- Performance metrics
CREATE TABLE metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    metric_name TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT,
    metadata TEXT -- JSON blob
);

-- Indexes for query performance
CREATE INDEX idx_health_checks_timestamp ON health_checks(timestamp);
CREATE INDEX idx_health_checks_system ON health_checks(system);
CREATE INDEX idx_issues_severity ON issues(severity);
CREATE INDEX idx_issues_resolved ON issues(resolved_at);
CREATE INDEX idx_metrics_timestamp ON metrics(timestamp);
```

#### 6. Main Execution Loop (`monitor_agent.py`)

```python
class MonitorAgent:
    """Main monitoring loop"""
    
    def __init__(self):
        self.detector = Detector()
        self.validator = Validator()
        self.healer = Healer()
        self.alerter = Alerter()
        self.db = StateDatabase()
    
    async def monitor_loop(self):
        """Main monitoring loop - runs continuously"""
        
        while True:
            try:
                # Run all detectors
                issues = await self.run_all_detectors()
                
                # Validate each issue
                validated_issues = await self.validate_issues(issues)
                
                # Attempt self-healing
                for issue in validated_issues:
                    await self.db.record_issue(issue)
                    
                    if issue.can_auto_fix:
                        heal_result = await self.healer.heal(issue)
                        await self.db.record_healing_action(issue, heal_result)
                        
                        if heal_result.success:
                            await self.db.resolve_issue(issue.id)
                            if issue.severity in ["P0", "P1"]:
                                # Alert on successful healing of critical issues
                                await self.alerter.alert(issue, heal_result)
                        else:
                            # Auto-fix failed, escalate
                            await self.alerter.alert(issue, heal_result)
                    else:
                        # Can't auto-fix, alert immediately
                        await self.alerter.alert(issue)
                
                # Update monitoring dashboard
                await self.update_dashboard()
                
                # Record metrics
                await self.record_metrics()
                
                # Sleep based on priority (1 min default)
                await asyncio.sleep(60)
                
            except Exception as e:
                logging.error(f"Monitor loop error: {e}")
                await asyncio.sleep(60)
    
    async def run_all_detectors(self) -> List[Issue]:
        """Run all detection checks concurrently"""
        tasks = [
            self.detector.check_gateway_health(),
            self.detector.check_all_cron_jobs(),
            self.detector.check_all_apis(),
            self.detector.check_disk_space(),
            self.validator.validate_memory_system(),
            self.validator.validate_all_state_files(),
            self.validator.validate_obsidian_sync(),
            self.validator.validate_all_business_units(),
            # ... more checks
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        issues = [r for r in results if isinstance(r, Issue)]
        return issues
    
    async def update_dashboard(self):
        """Generate monitoring dashboard markdown"""
        # Query recent health checks, issues, metrics
        # Generate markdown file for Obsidian
        # See dashboard section below
```

### Dashboard Output

**Location:** `memory/monitoring-dashboard.md` (auto-updated every 60s)

```markdown
# System Health Dashboard

**Last Updated:** 2026-01-30 11:45:00 CST  
**Overall Status:** 🟢 Healthy  
**Uptime:** 99.97% (last 7 days)

---

## Infrastructure Health

| Component | Status | Last Check | Response Time | Issues |
|-----------|--------|------------|---------------|--------|
| Gateway | 🟢 Running | 11:44:45 | 12ms | None |
| Cron Jobs | 🟢 14/14 OK | 11:44:30 | - | None |
| Anthropic API | 🟢 Healthy | 11:44:00 | 245ms | None |
| Discord API | 🟢 Healthy | 11:44:00 | 89ms | None |
| Twitter API | 🟢 Healthy | 11:43:30 | 312ms | None |
| Disk Space | 🟢 67% Used | 11:40:00 | - | None |

## Data Integrity

| System | Status | Last Check | Issues |
|--------|--------|------------|--------|
| Memory System | 🟢 Synced | 11:44:00 | None |
| State Files | 🟢 Valid | 11:43:00 | None |
| Obsidian Sync | 🟢 Updated | 11:42:00 | None |
| Git Status | 🟢 Clean | 11:44:00 | None |
| Backups | 🟢 Current | 11:00:00 | None |

## Business Units

| Unit | Status | Key Metrics | Last Activity |
|------|--------|-------------|---------------|
| StantonTimes | 🟢 Operational | 6 tweets/day | 3 min ago (posted) |
| Low Noise Studios | 🟢 Developing | 3 PRs open, CI passing | 12 min ago |
| Consulting | 🟡 Launching | 2 leads in pipeline | 18 hours ago |
| Talent Service | 🔵 Pre-Launch | - | - |
| Research Lab | 🔵 Pre-Launch | - | - |

## Recent Auto-Healing (Last 24h)

- **11:30:00** - Cleared temp files (disk 82% → 67%)
- **09:15:00** - Refreshed Twitter cookies (proactive rotation)
- **08:45:00** - Restarted stuck cron job (stantontimes-engagement)
- **02:30:00** - Auto-committed memory changes to git

## Active Issues

_No active issues_ 🎉

## Alerts Sent (Last 24h)

- **P2** (10:30 AM) - Bloom CI flaky test, auto-retried, passed ✅
- **P3** (09:00 AM) - Memory file >100 lines, archived

## Performance Metrics (Last Hour)

- **Average Response Time:** 156ms
- **Health Checks Run:** 60
- **Issues Detected:** 0
- **Auto-Fixes Applied:** 0
- **Alerts Sent:** 0

---

**Monitor-Agent:** ✅ Running (PID 12345) | Uptime: 3d 14h 22m  
**Database:** 1,234 health checks | 23 issues (all resolved) | 45 healing actions  
**Next Check:** 11:45:00 CST
```

---

## Integration with Existing Systems

### 1. HEARTBEAT.md Integration

**Current:** Manual rotation of checks via main agent heartbeats  
**Enhanced:** Monitor-Agent handles all validation, heartbeat focuses on high-level orchestration

**Updated HEARTBEAT.md:**
```markdown
# HEARTBEAT.md

## Context Management (Every heartbeat)
1. Check monitor-agent status (is it running?)
2. Review monitoring dashboard (any critical alerts?)
3. Commit memory changes if needed

## Rotating Checks (Monitor-Agent Handles)
Monitor-Agent now handles:
- ✅ System health (continuous)
- ✅ Memory maintenance (continuous)
- ✅ StantonTimes health (continuous)
- ✅ Bloom monitoring (continuous)

## Heartbeat Focus (High-Level Only)
- Review Monitor-Agent dashboard for summary
- Handle any escalated alerts
- Perform strategic tasks (memory consolidation, MEMORY.md updates)
- Proactive planning (upcoming events, todo review)

## Quiet Hours
23:00 - 08:00 CST: Monitor-Agent continues running, alerts only P0 issues
```

### 2. Cron Job Integration

**Validation Wrapper:** All cron jobs wrapped with validation telemetry

**Wrapper Script:** `/Users/zachgonser/clawd/scripts/cron-wrapper.sh`

```bash
#!/bin/bash
# Cron validation wrapper
# Usage: ./cron-wrapper.sh <job_name> <command...>

JOB_NAME="$1"
shift
JOB_COMMAND="$@"

# Record start
MONITOR_DB="/Users/zachgonser/clawd/monitor/monitor.db"
START_TIME=$(date +%s)

sqlite3 "$MONITOR_DB" "INSERT INTO cron_runs (job_name, start_time) VALUES ('$JOB_NAME', $START_TIME);"

# Execute job
$JOB_COMMAND
EXIT_CODE=$?

# Record completion
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

sqlite3 "$MONITOR_DB" "
  UPDATE cron_runs 
  SET end_time=$END_TIME, duration=$DURATION, exit_code=$EXIT_CODE 
  WHERE job_name='$JOB_NAME' AND start_time=$START_TIME;
"

# Log result
if [ $EXIT_CODE -ne 0 ]; then
    openclaw "$(date) - $JOB_NAME FAILED (exit $EXIT_CODE)" >> /tmp/cron-failures.log
fi

exit $EXIT_CODE
```

**Cron Config Update:**
```json
{
  "jobs": [
    {
      "id": "stantontimes-p0-monitor",
      "schedule": "*/15 * * * *",
      "command": "./cron-wrapper.sh 'stantontimes-p0' 'node scripts/stantontimes-p0-monitor.js'",
      "enabled": true
    }
    // ... all other jobs wrapped
  ]
}
```

### 3. Discord Integration

**Alert Channel:** Create dedicated #system-health Discord channel  
**Webhook:** Configure Discord webhook for alerts  
**Message Format:** Rich embeds with actionable information

**Example Alert:**
```
🚨 P1: Cron Job Overdue

**Job:** stantontimes-p0-monitor
**Last Run:** 45 minutes ago (expected every 15 min)
**Status:** ❌ Auto-fix failed

**Actions Taken:**
- ✅ Checked job enabled status (enabled)
- ✅ Triggered manual run (failed)
- ❌ Unable to resolve automatically

**Next Steps:**
1. Check logs: /tmp/cron-failures.log
2. Verify Twitter auth: bird user-tweets @TheStantonTimes
3. If auth issue, refresh cookies

**Details:**
Category: Infrastructure
System: Cron Jobs
Detected: 2026-01-30 11:45:00 CST
```

---

## Week-by-Week Execution Plan

### Week 1: Core Infrastructure (Days 1-7)

#### Day 1 (2026-01-31 Friday) - Foundation Setup
**Goal:** Establish Monitor-Agent skeleton

**Tasks:**
- [ ] **Project Structure** (2h)
  - Create `/Users/zachgonser/clawd/monitor/` directory
  - Set up Python project structure (requirements.txt, venv)
  - Initialize git repo for monitor-agent
  
- [ ] **Database Schema** (2h)
  - Create `schema.sql` with all tables
  - Write `state_db.py` module with SQLAlchemy/raw SQL
  - Initialize `monitor.db` database
  - Write basic CRUD operations
  
- [ ] **Base Classes** (3h)
  - Define `Issue` dataclass
  - Define `HealResult` dataclass
  - Create `Detector` base class with abstract methods
  - Create `Validator` base class
  - Create `Healer` base class
  
- [ ] **Configuration** (1h)
  - Create `config.yaml` for check frequencies, thresholds
  - Write config loader
  - Define severity levels (P0, P1, P2, P3)

**Deliverables:**
- Working project structure
- Database schema created and initialized
- Base classes defined
- Configuration system ready

**Acceptance Criteria:**
- Can import all base classes
- Can insert/query test data in monitor.db
- Config loads successfully

---

#### Day 2 (2026-02-01 Saturday) - Core Detectors
**Goal:** Implement critical detection methods

**Tasks:**
- [ ] **Gateway Health Detector** (1h)
  - Implement `check_gateway_health()`
  - Test gateway restart detection
  - Add to test suite
  
- [ ] **Cron Job Detector** (3h)
  - Parse cron configuration
  - Implement `check_cron_job()` for each job
  - Track last run times from wrapper logs
  - Detect overdue jobs
  
- [ ] **API Health Detector** (2h)
  - Implement `check_api_health()` for Anthropic, Discord, Twitter
  - Test rate limit detection
  - Add response time tracking
  
- [ ] **Disk Space Detector** (1h)
  - Implement `check_disk_space()`
  - Test threshold detection (>90%)

**Deliverables:**
- 4 core detector methods implemented
- Unit tests passing
- Can detect real issues in current system

**Acceptance Criteria:**
- Gateway detector catches stopped daemon
- Cron detector catches overdue jobs
- API detector catches auth failures
- Disk detector catches high usage

---

#### Day 3 (2026-02-02 Sunday) - Data Validators
**Goal:** Implement data integrity validation

**Tasks:**
- [ ] **Memory System Validator** (2h)
  - Check daily memory file exists
  - Validate git status (uncommitted changes)
  - Check MEMORY.md sync
  
- [ ] **State File Validator** (3h)
  - JSON schema validation for state.json, heartbeat-state.json
  - Corruption detection
  - Backup verification
  
- [ ] **Obsidian Sync Validator** (2h)
  - Check last extraction time
  - Verify vault write success
  - Validate fact extraction output

**Deliverables:**
- 3 validator modules implemented
- Schema validation working
- Can detect corrupted state files

**Acceptance Criteria:**
- Detects missing memory files
- Detects invalid JSON in state files
- Detects stale Obsidian extractions

---

#### Day 4 (2026-02-03 Monday) - Self-Healing Actions
**Goal:** Implement critical healing actions

**Tasks:**
- [ ] **Gateway Healer** (1h)
  - Implement `restart_gateway()`
  - Add verification (wait 5s, check status)
  - Test successful restart
  
- [ ] **Cron Job Healer** (2h)
  - Implement `re_enable_cron_job()`
  - Implement `trigger_manual_run()`
  - Add exponential backoff for retries
  
- [ ] **Disk Cleanup Healer** (2h)
  - Implement `clear_temp_files()`
  - Implement `archive_old_logs()`
  - Safe deletion checks
  
- [ ] **State Recovery Healer** (2h)
  - Implement `restore_state_from_backup()`
  - Implement `create_missing_memory_file()`
  - Verify restored data

**Deliverables:**
- 4 healing modules implemented
- Each healing action verifies success
- Rollback capability for failed fixes

**Acceptance Criteria:**
- Can restart gateway and verify
- Can re-enable cron jobs
- Can free disk space safely
- Can restore corrupted state files

---

#### Day 5 (2026-02-04 Tuesday) - Alerting System
**Goal:** Implement alert delivery

**Tasks:**
- [ ] **Discord Alerter** (3h)
  - Implement `send_discord_dm()`
  - Create rich embed formatting
  - Add severity-based coloring
  - Test webhook delivery
  
- [ ] **Alert Queueing** (2h)
  - Implement P2/P3 alert queuing
  - Daily digest aggregation
  - Check-in reminder system
  
- [ ] **Alert Deduplication** (2h)
  - Track recent alerts in DB
  - Suppress duplicate alerts within time window
  - Batch similar issues

**Deliverables:**
- Discord alerting working
- Severity-based routing
- Deduplication preventing spam

**Acceptance Criteria:**
- P0 alerts arrive immediately
- P3 alerts queue for daily digest
- Duplicate alerts within 1h suppressed

---

#### Day 6 (2026-02-05 Wednesday) - Main Loop & Dashboard
**Goal:** Tie everything together

**Tasks:**
- [ ] **Main Monitor Loop** (4h)
  - Implement `monitor_loop()` with async execution
  - Orchestrate detect → validate → heal → alert flow
  - Add error handling and retry logic
  - Implement graceful shutdown
  
- [ ] **Dashboard Generator** (3h)
  - Query health check history
  - Query recent issues and healing actions
  - Generate markdown dashboard
  - Update every 60 seconds

**Deliverables:**
- Monitor-Agent runs continuously
- Dashboard updates in real-time
- Complete detect-validate-heal-alert cycle

**Acceptance Criteria:**
- Monitor loop runs for 1 hour without crashing
- Dashboard shows current system state
- Issues detected, healed, and logged correctly

---

#### Day 7 (2026-02-06 Thursday) - Testing & Deployment
**Goal:** End-to-end testing and production deployment

**Tasks:**
- [ ] **Integration Testing** (4h)
  - Simulate gateway failure → verify restart
  - Simulate overdue cron job → verify re-enable
  - Simulate disk full → verify cleanup
  - Simulate corrupted state → verify restore
  
- [ ] **systemd Service** (2h)
  - Create `monitor-agent.service` file
  - Configure auto-restart on failure
  - Set up logging to /var/log/monitor-agent/
  - Enable service to start on boot
  
- [ ] **Production Deployment** (2h)
  - Deploy Monitor-Agent to production
  - Monitor for 4 hours
  - Verify all checks running
  - Confirm alerts working

**Deliverables:**
- All tests passing
- Monitor-Agent running as systemd service
- Production deployment successful

**Acceptance Criteria:**
- Monitor-Agent survives 4 hours in production
- At least 1 issue detected and auto-healed
- Dashboard reflects real system state
- No false positive alerts

**Week 1 Success Criteria:**
✅ Monitor-Agent deployed and stable  
✅ 10+ validation checks active  
✅ 5+ self-healing actions working  
✅ Dashboard updating every 60s  
✅ Zero production downtime during deployment

---

### Week 2: Business Unit Validation (Days 8-14)

#### Day 8 (2026-02-07 Friday) - StantonTimes Validation
**Goal:** Full StantonTimes monitoring and self-healing

**Tasks:**
- [ ] **Tweet Fetching Validator** (2h)
  - Check last successful tweet fetch time
  - Validate tweet data structure
  - Detect auth failures
  
- [ ] **Posting Validator** (2h)
  - Check tweets posted in last 24h
  - Validate posting queue
  - Detect stuck posts
  
- [ ] **Approval Queue Validator** (2h)
  - Check for pending approvals >48h
  - Validate approval state in state.json
  - Detect Discord webhook failures
  
- [ ] **Twitter Auth Healer** (2h)
  - Implement `refresh_twitter_cookies()`
  - Proactive refresh before expiry
  - Test cookie rotation

**Deliverables:**
- StantonTimes fully monitored
- Tweet fetching issues auto-detected
- Cookie refresh automated

**Acceptance Criteria:**
- Detects Twitter auth failures within 15 min
- Auto-refreshes cookies proactively
- Alerts on stuck approvals >48h

---

#### Day 9 (2026-02-08 Saturday) - Bloom Validation
**Goal:** CI/CD and PR monitoring

**Tasks:**
- [ ] **CI Health Validator** (3h)
  - Check latest CI run status via GitHub API
  - Detect failed builds on main branch
  - Track flaky test patterns
  
- [ ] **PR Staleness Validator** (2h)
  - Check PR ages
  - Detect PRs without reviews >7 days
  - Track PR merge rate
  
- [ ] **CI Healer** (2h)
  - Implement `retry_flaky_test()`
  - Auto-retry on known flaky failures
  - Alert on real failures

**Deliverables:**
- Bloom CI monitored continuously
- Flaky tests auto-retried
- PR staleness alerts

**Acceptance Criteria:**
- Detects broken main branch within 5 min
- Auto-retries flaky tests once
- Alerts on stale PRs daily

---

#### Day 10 (2026-02-09 Sunday) - Performance Monitoring
**Goal:** Track performance metrics and cost

**Tasks:**
- [ ] **Response Time Tracker** (2h)
  - Record API response times
  - Calculate baselines
  - Detect degradation (>2x baseline)
  
- [ ] **Resource Usage Tracker** (2h)
  - Monitor CPU, memory, disk I/O
  - Track cron job execution times
  - Detect resource exhaustion
  
- [ ] **Cost Tracker** (3h)
  - Track API call counts per provider
  - Estimate daily costs
  - Alert on cost spikes (>2x average)

**Deliverables:**
- Performance metrics collected
- Baselines established
- Cost tracking active

**Acceptance Criteria:**
- Detects API slowness within 5 min
- Alerts on resource exhaustion
- Daily cost report generated

---

#### Day 11 (2026-02-10 Monday) - Security Monitoring
**Goal:** Anomaly detection and security validation

**Tasks:**
- [ ] **Auth Failure Detector** (2h)
  - Track failed auth attempts
  - Detect brute force patterns (>5 failures/hour)
  - Alert on suspicious activity
  
- [ ] **Credential Expiry Tracker** (2h)
  - Track API key expiry dates
  - Proactive rotation 7 days before expiry
  - Alert if rotation fails
  
- [ ] **Anomaly Detector** (3h)
  - Track API call rates
  - Detect unusual patterns (>3x baseline)
  - Alert on potential exfiltration

**Deliverables:**
- Security monitoring active
- Credential rotation automated
- Anomaly detection working

**Acceptance Criteria:**
- Detects brute force within 5 min
- Auto-rotates credentials 7 days before expiry
- Alerts on unusual API activity

---

#### Day 12 (2026-02-11 Tuesday) - Advanced Healing
**Goal:** Complex self-healing scenarios

**Tasks:**
- [ ] **Cascading Failure Prevention** (3h)
  - Map system dependencies
  - Detect cascading failures
  - Implement graceful degradation
  
- [ ] **Load Balancing** (2h)
  - Fallback to secondary APIs
  - Switch to cheaper models on rate limits
  - Queue non-critical operations
  
- [ ] **Incident History Learning** (2h)
  - Track healing success rates
  - Build playbook from successful fixes
  - Auto-apply proven fixes first

**Deliverables:**
- Dependency mapping complete
- Fallback mechanisms working
- Playbook-based healing

**Acceptance Criteria:**
- Prevents cascading failures
- Falls back to secondary systems automatically
- Applies proven fixes first

---

#### Day 13 (2026-02-12 Wednesday) - Observability & Debugging
**Goal:** Rich logging and debugging tools

**Tasks:**
- [ ] **Structured Logging** (2h)
  - JSON-formatted logs
  - Log levels (DEBUG, INFO, WARN, ERROR)
  - Log rotation (keep 7 days)
  
- [ ] **Debugging Tools** (3h)
  - CLI tool to query monitor.db
  - Real-time health check viewer
  - Issue replay tool (re-run past scenarios)
  
- [ ] **Metrics Dashboard** (2h)
  - Generate charts (health check trends, issue rates)
  - Export to PNG for sharing
  - Weekly summary report

**Deliverables:**
- Comprehensive logging
- CLI debugging tools
- Visual metrics dashboard

**Acceptance Criteria:**
- Can query any health check in last 7 days
- Can replay past issues for testing
- Weekly summary generated automatically

---

#### Day 14 (2026-02-13 Thursday) - Phase Zero Completion
**Goal:** Final testing, documentation, handoff

**Tasks:**
- [ ] **Stress Testing** (3h)
  - Simulate multiple simultaneous failures
  - Test healing under load
  - Verify no deadlocks or race conditions
  
- [ ] **Documentation** (3h)
  - Write MONITOR-AGENT.md (architecture reference)
  - Write RUNBOOK.md (operational procedures)
  - Update HEARTBEAT.md (integration notes)
  - Record lessons learned
  
- [ ] **Handoff** (2h)
  - Train main agent on monitoring dashboard
  - Document escalation procedures
  - Set up weekly review cadence

**Deliverables:**
- Stress tests passing
- Complete documentation
- Operational handoff complete

**Acceptance Criteria:**
- Handles 5 simultaneous failures gracefully
- Documentation complete and accurate
- Main agent can interpret dashboard independently

**Week 2 Success Criteria:**
✅ All business units monitored  
✅ Advanced healing patterns working  
✅ Security monitoring active  
✅ Complete documentation  
✅ 48 hours of stable operation with zero manual interventions

---

### Week 3 (Optional): Optimization & Polish (Days 15-21)

**If needed, use Week 3 for:**
- Performance tuning (reduce resource usage)
- False positive reduction (tune thresholds)
- Additional business unit integrations
- Advanced predictive analytics
- Load testing and capacity planning

**Otherwise, Week 3 = Buffer for any Week 1-2 overruns**

---

## Deployment Strategy

### Phased Rollout

#### Phase 1: Shadow Mode (Days 1-7)
- Monitor-Agent detects and logs issues
- Does NOT take healing actions automatically
- Alerts sent to dedicated test channel
- Human reviews all detected issues

**Goal:** Validate detection accuracy, tune thresholds

#### Phase 2: Auto-Healing (Days 8-10)
- Enable self-healing for low-risk actions:
  - Clear temp files
  - Create missing memory files
  - Rotate credentials proactively
- Still alerts on all actions taken
- Human reviews healing results

**Goal:** Validate healing accuracy, ensure no unintended side effects

#### Phase 3: Full Autonomy (Days 11-14)
- Enable all self-healing actions
- Reduce alerting to P0/P1 only
- P2/P3 queue for daily digest
- Monitor-Agent fully autonomous

**Goal:** Achieve 99%+ auto-healing rate

### Rollback Plan

**If critical issue detected:**
1. Disable auto-healing (set config flag)
2. Monitor-Agent continues detection and alerting only
3. Investigate root cause
4. Fix and re-enable healing actions one by one

**Rollback triggers:**
- Auto-fix causes more issues than it solves
- False positive rate >5%
- Unintended data loss or corruption
- Performance degradation

---

## Testing Strategy

### Unit Tests
- Each detector method tested in isolation
- Each validator tested with known-good and known-bad data
- Each healer tested with mocked systems
- 80%+ code coverage

### Integration Tests
- End-to-end detect → validate → heal → alert flows
- Test against real systems (dev environment)
- Verify database transactions
- Test error handling and retry logic

### Chaos Testing
- Randomly inject failures (gateway crashes, disk fills, API timeouts)
- Verify Monitor-Agent detects and heals
- Measure mean time to detection (MTTD)
- Measure mean time to resolution (MTTR)

### Load Testing
- Simulate 100+ simultaneous health checks
- Verify no performance degradation
- Test database query performance
- Ensure resource usage stays reasonable

---

## Success Metrics

### Phase Zero Completion Criteria

**✅ Infrastructure Layer:**
- Monitor-Agent deployed and running 24/7
- Gateway uptime: 99.9%+
- Cron job reliability: 100% (no stuck jobs >15 min)
- API uptime: 99%+ (with fallbacks)
- Disk space managed: stays below 85%

**✅ Data Integrity Layer:**
- Zero missing daily memory files
- Zero corrupted state files >5 min
- Obsidian sync: 95%+ success rate
- Git status: clean within 1 hour
- Backup success: 100%

**✅ Business Unit Layer:**
- StantonTimes: 95%+ tweet fetch success
- StantonTimes: Zero stuck approvals >48h
- Bloom: Zero broken main branch >15 min
- All units: Real-time health visibility

**✅ Operational Excellence:**
- Auto-healing rate: 95%+
- Mean time to detection: <5 min
- Mean time to resolution: <15 min
- False positive rate: <5%
- Manual interventions: <1 per week

**✅ Deliverables:**
- [ ] Monitor-Agent code (production-ready)
- [ ] Database schema (fully populated)
- [ ] Monitoring dashboard (live, updating)
- [ ] Documentation (complete, accurate)
- [ ] Test suite (passing, comprehensive)
- [ ] Runbook (operational procedures)
- [ ] 48 hours of stable operation

---

## Post-Phase Zero

**Once Phase Zero is complete:**

1. **Phase 1 can begin** with confidence
   - StantonTimes launches on self-healing infrastructure
   - Privacy system built on validated foundation
   - Skills packaged with monitoring baked in

2. **Monitor-Agent continues evolving**
   - Add new business units as they launch
   - Expand healing playbook with learned patterns
   - Tune thresholds based on real-world data

3. **Foundation for Scale**
   - Can monitor 10, 100, 1000 systems with same overhead
   - Self-healing becomes the default, not the exception
   - Peace of mind: sleep knowing systems auto-heal

---

## Risk Mitigation

### Technical Risks

**Risk:** Auto-healing causes more damage than it fixes  
**Mitigation:** Shadow mode first, enable healing incrementally, comprehensive rollback plan

**Risk:** False positives overwhelm with alerts  
**Mitigation:** Alert deduplication, severity-based routing, daily digests for P3

**Risk:** Monitor-Agent itself becomes single point of failure  
**Mitigation:** Lightweight design, systemd auto-restart, secondary alerting path

**Risk:** Database grows unbounded  
**Mitigation:** Automatic data retention (7 days detailed, 90 days aggregated)

### Operational Risks

**Risk:** Takes too long to build (>3 weeks)  
**Mitigation:** Week 3 is buffer, MVP-first approach, can defer advanced features

**Risk:** Integration breaks existing systems  
**Mitigation:** Non-invasive monitoring, cron wrapper is optional, can disable anytime

**Risk:** Not enough time for testing  
**Mitigation:** Testing built into daily tasks, Day 14 fully dedicated to testing

---

## Timeline Summary

**Week 1:** Core infrastructure (Days 1-7)  
**Week 2:** Business units & advanced features (Days 8-14)  
**Week 3:** Buffer / optimization (Days 15-21, if needed)

**Critical Path:**
Day 1: Foundation → Day 2-3: Detectors → Day 4: Healers → Day 5: Alerting → Day 6: Integration → Day 7: Deployment

**First Value:** Day 7 (Monitor-Agent in production, basic self-healing working)  
**Full Value:** Day 14 (Complete self-healing system operational)

---

## Conclusion

Phase Zero is not optional. It's the foundation that makes everything else possible.

**Without Phase Zero:**
- Constant firefighting
- Systems break without notice
- Manual intervention required 24/7
- Can't scale beyond a few systems

**With Phase Zero:**
- Systems self-heal automatically
- Issues detected and fixed within minutes
- Sleep peacefully knowing Monitor-Agent is watching
- Can scale to hundreds of systems

**The Investment:**
- 2-3 weeks of focused work
- 80-120 hours of development
- $0 in infrastructure costs (runs on existing Mac Studio)

**The Return:**
- 5-10 hours/week saved on manual monitoring
- 99.9% uptime across all systems
- Peace of mind
- Foundation for everything that follows

---

**Next Step:** Execute Day 1 (Foundation Setup) starting 2026-01-31

**Let's build this. The right way. Once.** ✅

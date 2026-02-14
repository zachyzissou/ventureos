# Team Review: Risk Assessment & Fragility Analysis
**Date:** 2026-02-14  
**Sentinel:** Risk Assessment Subagent  
**Context:** User feedback — "We need to be improving more consistently."  
**Scope:** Fragility, failure modes, blast radius, early warning gaps

---

## Executive Summary

**Key Finding:** Infrastructure is **functional but fragile**. Multiple single points of failure exist with limited monitoring, no replication, and insufficient early warning systems. Most systems will *survive* individual component failures, but **detection and recovery are manual** — violating the consistency improvement goal.

**Risk Level:** **P1 (High)** — Degraded operations likely; data loss possible but unlikely; requires immediate mitigation investment.

**Critical Gaps:**
1. **Monitoring exists but isn't running** (0 health checks in monitor.db)
2. **2 cron jobs failing silently** (Community Scout, Quality Audit)
3. **No database replication** (SQLite single-instance)
4. **Session amnesia documented but not solved** (600KB resets = context loss)
5. **Security track not started** (Phase 4 dependency risk)

**Bottom Line:** We're running a **high-velocity operation on duct tape and optimism**. Consistency requires reliability infrastructure, not just feature velocity.

---

## 1. Fragility Assessment: What's One Failure Away?

### P0 (Critical) — System Failure / Data Loss

**None identified.** No single failure causes total system collapse or unrecoverable data loss.

*(This is actually good — the distributed sub-agent architecture provides inherent resilience.)*

---

### P1 (High) — Significant Degradation / Manual Intervention

#### 1.1 Monitor Database Corruption/Loss
**Current State:**
- SQLite database at `~/clawd/tools/monitor/data/monitor.db` (2.9MB)
- **0 health checks recorded** (table exists, but no data)
- Tables: `health_checks`, `alerts`, `issues`, `healing_actions`, `metrics`, `agent_state`

**Fragility:**
- Monitor database has **never been used** — infrastructure exists but isn't operational
- If monitoring *were* active and database corrupted → **blind to all failures**
- No backup strategy for monitor.db visible in `backup-clawd.sh`

**Blast Radius:**
- **Current:** None (monitoring isn't running)
- **If active:** Lose visibility into health checks, alerts, metrics → cascade failures invisible until user reports

**Single Point of Failure:** Yes (no replication, no offsite backup)

**Recommendation:** 
- **Immediate:** Verify if monitoring is supposed to be running (investigate 0 health checks)
- **Short-term:** Add monitor.db to nightly backup script
- **Long-term:** Export metrics to time-series DB (Prometheus) for resilience

---

#### 1.2 VentureOS RPG Database Corruption
**Current State:**
- SQLite database at `~/clawd/agents/ventureos-rpg.db` (148KB)
- Daily backup to `~/clawd/backups/rpg-YYYY-MM-DD.db` (7-day retention)
- Backup uses SQLite `.backup` API (online backup, good!)

**Fragility:**
- **7-day retention only** — corruption discovered after 7 days = permanent data loss
- No offsite backup (single machine failure = total loss)
- No transaction logging visible (no WAL mode PRAGMA found)

**Blast Radius:**
- Lose up to 7 days of RPG progression data (stats, events, protocols)
- Affects daily cron jobs: psionic stats, khala drift, memory→RPG sync, protocol triggers
- **High symbolic value** — RPG system is core to agent identity/memory

**Single Point of Failure:** Yes (single database, local backups only)

**Recommendation:**
- **Immediate:** Enable WAL mode (`PRAGMA journal_mode=WAL;`)
- **Short-term:** Extend retention to 30 days, add offsite backup (S3, GitHub LFS, or external drive)
- **Long-term:** Replicate to read-only secondary (Litestream replication to S3)

---

#### 1.3 Cron Job Silent Failures
**Current State:**
- **30 cron jobs** running (isolated agents: atlas, oracle, archivist, echo, main)
- **2 jobs failing:** 
  - `14abc764` — OpenClaw Community Scout (error, 5h ago)
  - `5a8b47d6` — Agent Quality Audit (error, 1h ago)
- No alerts visible for these failures (should Discord webhook notify?)

**Fragility:**
- Cron failures are **visible in `openclaw cron list` but not alerted**
- No escalation if job fails repeatedly
- If `Cron Health Check` (job `59e58b7a`) fails → **no meta-monitoring** (who watches the watchmen?)

**Blast Radius:**
- **Community Scout failure:** Miss important OpenClaw discussions (reputation risk, support delay)
- **Quality Audit failure:** No quality metrics → miss regressions, tech debt accumulates
- Other failures (e.g., daily stats cron) → **silent data gaps** (historical loss, dashboards incomplete)

**Single Point of Failure:** No (jobs can be re-run manually), but **detection is the failure**

**Recommendation:**
- **Immediate:** Investigate why Community Scout and Quality Audit are failing (check logs, fix root cause)
- **Short-term:** Add Discord alert for *any* cron job error state (not just session resets)
- **Long-term:** Dead man's switch — if Cron Health Check doesn't report in 2 hours, alert externally

---

#### 1.4 Session Management Amnesia
**Current State:**
- Session bloat prevention **working** (session-health-check.sh, hourly cron)
- Oracle auto-reset from 2.2MB on 2026-02-14 01:10
- Warnings: Verifier (584KB), Synth (572KB), Atlas (568KB, 516KB, 492KB)
- **No handoff documentation** — reset = total context loss

**Fragility:**
- Auto-reset prevents token limit errors ✅
- But reset = **agent loses all session context** (600KB ≈ 200K tokens of conversation/decisions)
- **13 Oracle sessions/24h** (mentioned in context) → churning rapidly, likely from cron jobs spawning short-lived sessions
- No session transition log ("what I was doing before reset")

**Blast Radius:**
- Agent restarts mid-task with **zero memory** of prior conversation
- User repeats context ("as I said earlier...") → frustration
- **Consistency degradation** — agent can't learn from earlier in same session

**Single Point of Failure:** No (resets are intentional), but **continuity is the failure**

**Recommendation:**
- **Immediate:** Before session reset, auto-generate `SESSION_HANDOFF.md` (summary of key decisions, active tasks, context)
- **Short-term:** Reduce session bloat (compress old messages, summarize history)
- **Long-term:** Implement session checkpointing (persist key facts to MEMORY.md or RPG database)

---

### P2 (Medium) — Operational Friction / Recoverable

#### 2.1 SQLite Lock Contention (Potential)
**Current State:**
- Multiple agents potentially accessing same databases concurrently
- **No explicit locking visible** in Python scripts (no flock, no SQLite busy timeout config)
- Only 1 `.lock` file found: `task-queue.json.lock` (good!)
- Monitor DB has **no writes** (0 health checks), so no contention observed

**Fragility:**
- If multiple cron jobs write to monitor.db simultaneously → **"database is locked" errors**
- RPG database accessed by 4+ daily cron jobs (psionic stats, khala drift, memory→RPG, protocols)
- StantonTimes ledger uses WAL mode (`PRAGMA journal_mode=WAL;`) but others don't

**Blast Radius:**
- **Temporary failures** (retry usually succeeds)
- **Data loss if retries fail** (rare but possible)
- Cron job reports error, user investigates manually

**Single Point of Failure:** No (retry logic likely exists), but **no visibility into lock failures**

**Recommendation:**
- **Immediate:** Add `PRAGMA busy_timeout=5000;` to all SQLite connections (5-second retry)
- **Short-term:** Enable WAL mode on all databases (`PRAGMA journal_mode=WAL;`)
- **Long-term:** Migrate high-concurrency tables to PostgreSQL (if contention observed)

---

#### 2.2 Backup Verification Gaps
**Current State:**
- **Nightly Backup** cron (job `758fb284`, 2:00 AM, Atlas agent)
- **Weekly Backup Verify** cron (job `467e3753`, 2:30 AM Sundays, Atlas agent)
- Backup script: `backup-clawd.sh` creates tarball + SHA256 checksum
- **30-day retention** (delete backups older than 30 days)

**Fragility:**
- Backup verification runs **weekly** → 6 days of unverified backups
- Verification script (`verify-backup.sh`) not examined — what does it verify?
- **No test restore** — backups might be corrupted and we won't know until needed
- Backup location: `$HOME/backups/clawd` → **same machine** (disk failure = total loss)

**Blast Radius:**
- Discover backups are corrupted **during emergency restore** → panic + data loss
- Single disk failure → lose primary data + all backups

**Single Point of Failure:** Yes (local backups only)

**Recommendation:**
- **Immediate:** Read `verify-backup.sh`, confirm it actually tests restore (not just checksum)
- **Short-term:** Daily backup verification (not weekly), test restore to `/tmp` automatically
- **Long-term:** Offsite backup (sync to S3, external drive, or second machine)

---

### P3 (Low) — Minor Inconvenience

#### 3.1 Heartbeat State Tracking
**Current State:**
- `HEARTBEAT.md` defines rotating checks (system, memory, StantonTimes, Bloom)
- State tracked in `memory/heartbeat-state.json`
- Policy exists, but **no verification heartbeat checks are actually running**

**Fragility:**
- If heartbeat checks stop running → **silent degradation** (no proactive monitoring)
- State file might be stale or missing (not verified)

**Blast Radius:**
- **Low** — proactive checks are "nice to have," not critical
- Reactive support still works (user reports issues)

**Recommendation:**
- **Low priority:** Audit if heartbeat checks are running, add verification to Cron Health Check

---

## 2. Single Points of Failure (No Redundancy)

| System | SPOF? | Impact | Mitigation Needed |
|--------|-------|--------|-------------------|
| **RPG Database** | ✅ Yes | P1 — Lose progression data | Offsite backup, replication |
| **Monitor Database** | ✅ Yes | P1 — Lose visibility (if active) | Backup, time-series export |
| **Backup Storage** | ✅ Yes | P0 — Single disk failure = total loss | Offsite replication (S3, drive) |
| **Cron Failure Detection** | ✅ Yes | P1 — Silent degradation | External dead man's switch |
| **Session Continuity** | ✅ Yes | P1 — Context amnesia | Handoff docs, checkpointing |
| **SQLite (no clustering)** | ✅ Yes | P2 — No horizontal scaling | WAL mode, Postgres migration path |
| **Gateway Daemon** | ⚠️ Partial | P1 — Can restart, but downtime | Systemd auto-restart (likely exists) |
| **Cron Jobs (no failover)** | ✅ Yes | P2 — If host down, jobs stop | Cloud-based cron (GitHub Actions?) |

**Summary:** **7 critical SPOFs**, all related to **data persistence, monitoring, and continuity**.

---

## 3. Blast Radius Analysis: If X Fails, How Bad?

### Scenario 1: Mac Studio Disk Failure (Total Hardware Loss)

**What breaks:**
- ✅ RPG database (last 7 days unrecoverable if backup also on disk)
- ✅ Monitor database (total loss)
- ✅ All backups (stored locally)
- ✅ Cron jobs stop running
- ❌ Git repos safe (remote on GitHub)
- ❌ Memory files safe (if pushed to GitHub)
- ❌ OpenClaw config safe (if backed up to `~/.openclaw`)

**Blast Radius:** **P1** — Data loss (7 days RPG), operational halt (cron jobs), manual rebuild (6-12 hours)

**Recovery Plan:**
1. Restore `~/.openclaw` config from nightly backup (if offsite)
2. Restore memory files from GitHub
3. Restore RPG database from last good backup (lose up to 7 days)
4. Manually recreate monitor.db (no data to restore)
5. Restart cron jobs (definitions in `~/.openclaw/cron/jobs.json`)

**Time to Recovery:** 6-12 hours (manual intervention required)

**Mitigation:** Offsite backup (S3, external drive, second machine)

---

### Scenario 2: Monitor Database Corruption (If Monitoring Were Active)

**What breaks:**
- ✅ Lose historical health checks
- ✅ Lose alert history
- ✅ Lose metrics (if not exported elsewhere)
- ❌ System continues operating (monitoring is observability, not control plane)

**Blast Radius:** **P2** — Lose visibility, but operations unaffected

**Recovery Plan:**
1. Drop corrupted monitor.db
2. Recreate schema (tables exist in code)
3. Resume monitoring (historical data lost)

**Time to Recovery:** <1 hour

**Mitigation:** Export metrics to Prometheus/Grafana (time-series DB with replication)

---

### Scenario 3: Daily Stats Cron Stops Running (Silent Failure)

**What breaks:**
- ✅ No daily RPG stats updates (psionic, khala drift, memory→RPG sync, protocols)
- ✅ Historical data gap (can't backfill accurately)
- ❌ System continues operating (stats are historical, not operational)

**Blast Radius:** **P2** — Data gap, but not critical

**Recovery Plan:**
1. Fix cron job (debug why it stopped)
2. Manually backfill stats (if possible)
3. Resume automated runs

**Time to Recovery:** 1-2 hours

**Mitigation:** Alert on cron failure (Discord webhook), dead man's switch

---

### Scenario 4: Oracle Session Auto-Reset Mid-Task

**What breaks:**
- ✅ Oracle loses all session context (200K tokens = full conversation history)
- ✅ User must re-explain context
- ❌ Oracle's SOUL.md, MEMORY.md still intact (identity preserved)

**Blast Radius:** **P1** — Consistency degraded, user frustration

**Recovery Plan:**
1. User re-explains context (manual, annoying)
2. Oracle reads MEMORY.md for long-term context
3. Continue task (with reduced context quality)

**Time to Recovery:** 5-15 minutes per reset

**Mitigation:** Session handoff docs, compress old messages instead of full reset

---

## 4. Early Warning Gaps: What Failures Are We Blind To?

| Failure Type | Detection Today | Gap | Impact |
|--------------|-----------------|-----|--------|
| **Cron job error** | ✅ Visible in `openclaw cron list` | ⚠️ No alerts (except session resets) | P1 — Silent degradation |
| **Cron job stops running** | ❌ Not detected | 🚨 **Critical gap** | P1 — Silent failure |
| **Database corruption** | ❌ Not detected | 🚨 **Critical gap** | P1 — Discover during emergency |
| **Backup failure** | ⚠️ Verified weekly | ⚠️ 6-day delay | P2 — Late detection |
| **Lock contention** | ❌ Not detected | 🚨 **Critical gap** | P2 — Random failures |
| **Session bloat** | ✅ Hourly check | ✅ **Working** | P1 mitigated ✅ |
| **Monitor.db not running** | ❌ Not detected | 🚨 **Critical gap** | P1 — False sense of security |
| **Disk space low** | ⚠️ Heartbeat check (every 2h) | ⚠️ No alert threshold | P2 — Reactive only |
| **Memory file conflicts** | ❌ Not detected | ⚠️ Git merge conflicts possible | P2 — Manual resolution |

**Summary:** **5 critical early warning gaps** (marked 🚨), **3 partial gaps** (marked ⚠️).

---

### 4.1 Critical Gap: Cron Job "Stopped Running" vs "Error State"

**Current State:**
- If cron job runs and fails → **error state** (visible in `openclaw cron list`)
- If cron job **never runs** (daemon crashed, schedule bug) → **no detection**

**Example:**
- `Cron Health Check` (job `59e58b7a`) runs every 30 minutes
- If it stops running → who detects the detector failed?

**Recommendation:**
- **External dead man's switch** (e.g., cronitor.io, healthchecks.io)
- Cron job pings external service every 30 min
- If no ping → external service alerts (email, SMS, Discord)
- **Cost:** Free tier available

---

### 4.2 Critical Gap: Database Corruption Detection

**Current State:**
- Backups verified **weekly** (checksum only?)
- No **test restore** (corruption might not be detected)
- No **PRAGMA integrity_check** before daily operations

**Recommendation:**
- **Daily:** `sqlite3 database.db "PRAGMA integrity_check;"` before backup
- **Daily:** Test restore to `/tmp` (verify backup is usable)
- **Alert:** If integrity check fails, Discord webhook + halt operations

---

### 4.3 Critical Gap: Monitor.db Not Running

**Current State:**
- Monitor database has **0 health checks** recorded
- Either:
  1. Monitoring was never started (infrastructure exists but inactive), or
  2. Monitoring failed silently (no health checks written)

**Recommendation:**
- **Immediate:** Investigate why monitor.db is empty
- **Short-term:** Add "meta-monitoring" — verify health checks are being written
- **Long-term:** Migrate to Prometheus + Grafana (industry-standard, battle-tested)

---

## 5. Recommendations: Risk Mitigation Priorities

### Tier 1: Critical (Do This Week)

**R1.1: Offsite Backup (P0 Risk Mitigation)**
- **Action:** Configure daily backup sync to S3, external drive, or GitHub LFS
- **Owner:** Atlas or main agent
- **Timeline:** 4-6 hours setup
- **Cost:** $5/month (S3) or $0 (external drive)
- **Impact:** Eliminates SPOF for data loss (disk failure survivable)

**R1.2: Cron Failure Alerting (P1 Detection Gap)**
- **Action:** Add Discord webhook to alert on **any** cron job error state (not just session resets)
- **Owner:** Atlas agent (modify cron-health-check.sh or create new monitor)
- **Timeline:** 2 hours
- **Cost:** $0
- **Impact:** Detect Community Scout, Quality Audit, and future failures immediately

**R1.3: Investigate Monitor.db (P1 False Confidence)**
- **Action:** Determine why monitor.db has 0 health checks — is monitoring running?
- **Owner:** Sentinel or Atlas
- **Timeline:** 1-2 hours
- **Cost:** $0
- **Impact:** Verify monitoring infrastructure is operational or fix it

**R1.4: Session Handoff Documentation (P1 Consistency)**
- **Action:** Before auto-reset, generate `SESSION_HANDOFF.md` summarizing active tasks, decisions, context
- **Owner:** Modify session-health-check.sh (Atlas)
- **Timeline:** 4-6 hours (needs context extraction logic)
- **Cost:** $0
- **Impact:** Reduce context amnesia, improve consistency

**R1.5: Fix Failing Cron Jobs (P1 Operational)**
- **Action:** Debug and fix Community Scout (`14abc764`) and Quality Audit (`5a8b47d6`)
- **Owner:** Atlas or main agent
- **Timeline:** 1-2 hours per job
- **Cost:** $0
- **Impact:** Restore operational health, clear error state

---

### Tier 2: High Priority (Do This Month)

**R2.1: Database Integrity Checks (P1 Detection)**
- **Action:** Add `PRAGMA integrity_check;` to daily backup routine, alert on failure
- **Owner:** Atlas (modify backup scripts)
- **Timeline:** 2 hours
- **Cost:** $0
- **Impact:** Detect corruption before emergency restore

**R2.2: Enable WAL Mode on All Databases (P2 Concurrency)**
- **Action:** Add `PRAGMA journal_mode=WAL;` to RPG, monitor, and any other SQLite databases
- **Owner:** Atlas or sentinel
- **Timeline:** 1 hour (add to initialization scripts)
- **Cost:** $0
- **Impact:** Reduce lock contention, improve concurrency

**R2.3: Test Restore Automation (P1 Validation)**
- **Action:** Daily cron job to restore latest backup to `/tmp`, verify integrity
- **Owner:** Atlas
- **Timeline:** 3-4 hours
- **Cost:** $0
- **Impact:** Ensure backups are actually restorable (not just checksummed)

**R2.4: External Dead Man's Switch (P1 Meta-Monitoring)**
- **Action:** Configure healthchecks.io or cronitor.io, ping from Cron Health Check
- **Owner:** Atlas
- **Timeline:** 1 hour
- **Cost:** $0 (free tier)
- **Impact:** Detect if cron monitoring itself stops running

**R2.5: Extend RPG Backup Retention (P2 Recovery Window)**
- **Action:** Increase retention from 7 days to 30 days
- **Owner:** Modify backup-rpg-db.sh
- **Timeline:** 5 minutes (change `-mtime +6` to `-mtime +29`)
- **Cost:** ~120KB × 30 = 3.6MB (negligible)
- **Impact:** Larger recovery window if corruption discovered late

---

### Tier 3: Medium Priority (Do This Quarter)

**R3.1: Migrate Monitor to Prometheus + Grafana (P2 Observability)**
- **Action:** Replace SQLite monitor.db with time-series database (replication, alerting, dashboards)
- **Owner:** Atlas or new monitoring subagent
- **Timeline:** 16-24 hours (setup + migration)
- **Cost:** $0 (self-hosted) or $20/month (Grafana Cloud)
- **Impact:** Industry-standard monitoring, better alerting, historical trends

**R3.2: Session Compression (P2 Efficiency)**
- **Action:** Instead of full reset, compress old messages (summarize earlier conversation)
- **Owner:** OpenClaw core (session management refactor)
- **Timeline:** 20-30 hours (requires core changes)
- **Cost:** Engineering time
- **Impact:** Reduce session bloat, preserve more context

**R3.3: PostgreSQL Migration Path (P2 Scale)**
- **Action:** Design migration from SQLite → PostgreSQL for high-concurrency tables
- **Owner:** Atlas or platform-agent (Phase 4 context)
- **Timeline:** 40+ hours (design + implementation)
- **Cost:** $10-50/month (managed Postgres)
- **Impact:** Eliminate lock contention, enable horizontal scaling

**R3.4: Automated Runbook (P2 Operations)**
- **Action:** Document recovery procedures for each failure scenario (runbook in `~/clawd/OPS_RUNBOOK.md`)
- **Owner:** Sentinel or atlas
- **Timeline:** 8-12 hours (write + test procedures)
- **Cost:** $0
- **Impact:** Faster recovery, reduce panic during incidents

**R3.5: Security Audit (Phase 4 Dependency)**
- **Action:** Start Phase 4 Track 4 security review (mentioned but not started)
- **Owner:** Sentinel or new security-agent
- **Timeline:** Per Phase 4 plan (not yet started)
- **Cost:** TBD (Phase 4 budget)
- **Impact:** Reduce security risk before public launch

---

## 6. Summary: What Could Break, How Bad, How to Prevent?

### What Could Break?

1. **Disk failure** → Lose RPG data (7 days), all backups, cron jobs halt
2. **Database corruption** → Discover during emergency, panic + data loss
3. **Cron job stops** → Silent degradation, miss critical operations
4. **Session reset** → Context amnesia, consistency degraded
5. **Lock contention** → Random database errors, retry failures
6. **Monitor.db inactive** → False confidence, no visibility

---

### How Bad Would It Be?

- **P0 (Critical):** None identified ✅
- **P1 (High):** 6 scenarios (data loss possible, manual intervention required)
- **P2 (Medium):** 4 scenarios (annoying but recoverable)
- **P3 (Low):** 1 scenario (minor inconvenience)

**Worst Case:** Disk failure + no offsite backup = **7 days RPG data loss + 6-12 hours manual recovery**

---

### How to Prevent?

**Immediate (This Week):**
1. Offsite backup (S3/drive)
2. Cron failure alerting (Discord)
3. Fix failing cron jobs
4. Investigate monitor.db
5. Session handoff docs

**Short-Term (This Month):**
1. Database integrity checks
2. Enable WAL mode
3. Test restore automation
4. External dead man's switch
5. Extend RPG retention

**Long-Term (This Quarter):**
1. Prometheus + Grafana
2. Session compression
3. PostgreSQL migration path
4. Automated runbook
5. Security audit (Phase 4)

---

## 7. Final Assessment: Consistency Requires Reliability

**User Feedback:** "We need to be improving more consistently."

**Root Cause:** High velocity (Phase 4 Track 1-2 delivered same day!) but **infrastructure lags behind**.

**Diagnosis:**
- Feature delivery: **Excellent** (50KB design specs, same-day delivery)
- Operational reliability: **Fragile** (7 SPOFs, 5 critical detection gaps)
- Monitoring: **Inactive** (0 health checks in monitor.db)
- Consistency: **At risk** (session amnesia, silent failures)

**Recommendation:**
> **Invest 1-2 weeks in "Infrastructure Hardening Sprint"** before resuming feature velocity.
>
> **Goal:** Eliminate P0/P1 risks, close detection gaps, enable "boring reliability."
>
> **Trade-off:** Slower feature delivery short-term, **faster and more consistent** long-term (fewer outages, less firefighting).

**Alternative:** Continue current pace, accept **occasional consistency breaks** (session resets, cron failures, manual interventions).

**My Vote:** **Hardening sprint.** Current fragility will compound — better to fix now than during Phase 4 public launch.

---

## Appendix: System Inventory

### Databases
- `~/clawd/tools/monitor/data/monitor.db` (2.9MB, **0 health checks** 🚨)
- `~/clawd/agents/ventureos-rpg.db` (148KB, daily backup, 7-day retention)
- `~/clawd/tools/monitor/data/test_monitor.db` (92KB, test database)
- `~/clawd/tools/monitor/data/validation_test.db` (84KB, test database)

### Cron Jobs (30 total, 2 failing)
- ✅ 28 jobs in "ok" state
- ❌ 2 jobs in "error" state (Community Scout, Quality Audit)
- 🕒 1 job "idle" (Archive Task Run Logs, hasn't run yet)

### Backups
- **Nightly:** `backup-clawd.sh` (2:00 AM, 30-day retention, local only)
- **RPG:** `backup-rpg-db.sh` (daily, 7-day retention, local only)
- **Verification:** `verify-backup.sh` (weekly, Sunday 2:30 AM)
- **Location:** `$HOME/backups/clawd` (same machine, **SPOF** 🚨)

### Session Management
- **Auto-reset:** 600KB threshold (approx 200K tokens)
- **Monitoring:** Hourly cron (`session-health-check.sh`)
- **Oracle churn:** 13 sessions/24h (likely cron jobs spawning short-lived sessions)
- **Handoff docs:** None (context loss on reset 🚨)

### Monitoring
- **Infrastructure:** Monitor database, cron health check, heartbeat checks
- **Operational status:** **Inactive** (0 health checks recorded 🚨)
- **Alerting:** Discord webhook for session resets only (not cron failures 🚨)

---

**End of Report**

**Next Steps:**
1. Review with main agent / user
2. Prioritize Tier 1 recommendations (this week)
3. Schedule Infrastructure Hardening Sprint (optional but recommended)
4. Re-assess after 30 days (measure improvement in consistency)

**Sentinel signing off.** 🛡️

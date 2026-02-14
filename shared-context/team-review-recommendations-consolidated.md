# Team Consistency Review — Consolidated Recommendations

**Date:** 2026-02-14 20:07 CST  
**Source:** 4-team review (Oracle, Atlas, Sentinel, Verifier) + user recommendations  
**Context:** User feedback: "We need to be improving more consistently."

**Note:** Offsite backups already handled via Time Machine to Unraid (excluded from list)

---

## P0: Do This Week (10-14 hours total) — 80% COMPLETE

**Priority:** Critical infrastructure fragility. Fix foundation before resuming features.

**Status:** 4/5 items complete (2026-02-14 ~14:14 CST)
- ✅ Three-tier estimation framework (Oracle, 3m30s)
- ✅ Fix failing cron jobs + add alerts (Atlas, 37 min)
- ✅ SQLite hardening (Atlas, 37 min)
- ✅ SQLite-consistent backups (Atlas, 37 min)
- 🔄 Session handoff docs (Synth, in progress)

### 1. Adopt Three-Tier Estimation Framework
- **Owner:** Oracle + Nexus
- **Effort:** 1-2 hours
- **What:** Classify work by dependencies, not gut feel
  - **Tier 1 (Cognitive):** Pure design/docs/code → minutes to hours
  - **Tier 2 (External):** API integrations, debugging → hours to days
  - **Tier 3 (Physical/Time):** Hardware, cron schedules → days to weeks
- **Why:** Reduce estimation error from 10-100x to 1.5-3x
- **Source:** Oracle review

### 2. Fix Failing Cron Jobs + Add Failure Alerts ✅ COMPLETE
- **Owner:** Atlas
- **Actual effort:** 37 minutes (part of 3-task subagent run)
- **Completed:** 2026-02-14 ~14:00 CST
- **What was done:**
  - ✅ Fixed Community Scout cron job (was failing at delivery step, not execution)
  - ✅ Fixed Quality Audit cron job (timeout + brittle inline script → deterministic helper)
  - ✅ Added Discord webhook for cron failures (`~/clawd/ventureos/scripts/cron-failure-alert.sh`)
  - ✅ Created cron error watcher (runs every 5 min, jobId: `41531717-0358-4745-9e45-5d227bb0c5b2`)
  - ✅ Investigated monitor.db: 0 health checks is expected behavior (only records issues, not OK checks)
- **Why:** 2 jobs failing silently, monitoring may be broken
- **Source:** Sentinel + Atlas reviews

### 3. SQLite Hardening ✅ COMPLETE
- **Owner:** Atlas
- **Actual effort:** 37 minutes (part of 3-task subagent run)
- **Completed:** 2026-02-14 ~14:00 CST
- **What was done:**
  - ✅ Changed `journal_mode` to `WAL` (both DBs)
  - ✅ Set `busy_timeout=5000` via connection-level wrapper
  - ✅ Enabled `foreign_keys=ON` via wrapper
  - ✅ Created retry logic wrapper (`~/clawd/ventureos/lib/sqlite-with-retries.sh`)
  - ✅ Added weekly integrity checks (cron jobId: `00150f29-cd4d-4611-b07f-fea46e8ef606`, Sun 03:00)
  - ✅ Load tested (8 concurrent writers × 200 inserts, no lock errors)
- **Why:** Current settings risk lock contention and corruption
- **Target DBs:** 
  - `~/clawd/memory/memory.sqlite`
  - `~/clawd/agents/ventureos-rpg.db`
- **Source:** Atlas + Sentinel reviews

### 4. SQLite-Consistent Backups ✅ COMPLETE
- **Owner:** Atlas
- **Actual effort:** 37 minutes (part of 3-task subagent run)
- **Completed:** 2026-02-14 ~14:00 CST
- **What was done:**
  - ✅ Created SQLite snapshot script using `.backup` command (`~/clawd/ventureos/scripts/backup-sqlite-consistent.sh`)
  - ✅ Updated nightly tar backup to exclude live SQLite files (uses snapshots instead)
  - ✅ Added manifest.json with row counts for restore validation
  - ✅ Created weekly restore drill (cron jobId: `711dc171-09e2-400c-99de-a6a36491664e`, Sun 03:30)
  - ✅ Updated restore procedure (`~/clawd/scripts/restore-backup.sh`)
- **Why:** Current tar backups may capture inconsistent SQLite state
- **Note:** Offsite already covered by Time Machine to Unraid
- **Source:** Atlas + Sentinel reviews

### 5. Session Handoff Docs (Already In Progress)
- **Owner:** Synth (already dispatched)
- **Effort:** 2-4 hours
- **Status:** ✅ Level 1 implementation in progress
- **What:**
  - Generate 2-4KB summary before 600KB session reset
  - Inject summary as first message in new session
  - Wire `memory-observation-sync` to trigger on reset events
- **Why:** Oracle session amnesia (13 sessions/24h, loses all context)
- **Source:** Oracle + Atlas + Sentinel reviews

---

## P1: Do Next Week (8-12 hours total)

**Priority:** Quality gates and operational visibility. Prevent silent failures.

### 6. Pre-Approval Decision Framework
- **Owner:** Nexus + Oracle
- **Effort:** 2-3 hours
- **What:**
  - Document decision criteria upfront
  - Auto-proceed if criteria met (no blocking wait)
  - Async review instead of synchronous approval
- **Why:** Reduce idle time from blocking gates by 50-80%
- **Source:** Oracle review

### 7. Runtime DB Validation for KPIs
- **Owner:** Verifier + Archivist
- **Effort:** 3-4 hours
- **What:**
  - Add tests that query real DB schema
  - Detect missing columns referenced in KPI definitions
  - Fail loudly instead of silently defaulting to 0
- **Why:** Many KPIs reference non-existent columns (e.g., `interaction_logs.metadata`)
- **Impact:** Prevents silent failures where KPI values default to 0
- **Source:** Verifier review

### 8. Real-Time Variance Alerts
- **Owner:** Oracle + Atlas
- **Effort:** 2-3 hours
- **What:**
  - Monitor task progress against estimate
  - Alert (Discord webhook) when actual > 2-3x estimate
  - Catch blockers within 15-30 minutes (not hours later)
- **Why:** Early detection of blockers reduces wasted time
- **Source:** Oracle review

### 9. Cron Reliability Reporting
- **Owner:** Atlas
- **Effort:** 2-3 hours
- **What:**
  - Parse existing cron run logs
  - Calculate success rate per job
  - Alert on missed runs (expected run didn't happen)
  - Generate weekly SLA report
- **Why:** No visibility into cron SLA compliance
- **Source:** Atlas review

### 10. Injectable Config (Stop Hardcoding Paths)
- **Owner:** Synth
- **Effort:** 2-3 hours
- **What:**
  - Libraries accept config parameter (don't hardcode `~/clawd/...`)
  - Improves testability (mock paths in tests)
  - Improves portability (works outside ~/clawd)
- **Why:** Current hardcoded paths make testing + refactoring harder
- **Source:** Verifier review

### 11. Model Routing + Thinking Level Strategy
- **Owner:** Oracle + Atlas
- **Effort:** 2-3 hours (documentation + cron updates)
- **What:**
  - Route simple tasks to cheaper models with lower thinking levels
  - Route complex tasks to Anthropic Claude with higher thinking levels
  - **Simple tasks** → lighter models + **low thinking**:
    - `openai-codex/gpt-5.1-codex-mini` (Codex optimized)
    - `openai/gpt-4.1-mini` (general purpose, cheap)
    - `openai/gpt-4.1-nano` (cheapest)
    - `openai/gpt-5-nano` (newest nano)
    - Thinking: `low` (routine work, no deep reasoning)
  - **Complex tasks** → Anthropic + **medium/high thinking**:
    - `anthropic/claude-3-5-sonnet-20241022` (production)
    - `anthropic/claude-3-7-sonnet-20250219` (newer)
    - `anthropic/claude-opus-4-6` (highest capability)
    - Thinking: `medium` (balanced), `high` (deep research/security), `xtra-high` (strategic)
  - **Thinking level by agent:**
    - **High:** Oracle (research), Sentinel (security), Echo (CEO orchestration)
    - **Medium:** Atlas, Verifier, Synth, Nexus (balanced)
    - **Low:** Archivist (documentation), cron jobs (routine monitoring)
  - **Use cases for lighter models + low thinking:** cron health checks, backup verification, log parsing, status monitoring
  - **Keep Anthropic + high thinking for:** team reviews, strategic decisions, external content (prompt injection defense)
- **Why:** Reduce costs + balance load between providers + optimize thinking overhead
- **Source:** User recommendation (2026-02-14)

### 12. Dispatch Verification Protocol
- **Owner:** Nexus (process/workflow)
- **Effort:** 2-3 hours
- **What:**
  - **Rule:** NEVER write "dispatched" to memory until AFTER `sessions_spawn` returns success
  - Memory update pattern: `sessions_spawn → get childSessionKey → THEN write to memory`
  - Add validation helper: `verify-session-exists.sh <sessionKey>` (returns 0 if JSONL exists, 1 if phantom)
  - Weekly audit: scan memory for claimed sessions, verify they exist
- **Why:** Prevent phantom task tracking (memory claims session running, but spawn never executed)
- **Impact:** Eliminates false "in progress" blockers, prevents wasted debugging time, maintains status trust
- **Trigger:** 2026-02-14 incident — session 8fff2e9c documented as "already dispatched" but never existed
- **Source:** User feedback (2026-02-14 20:37 CST) — "we cant have that continuing to happen"

---

## P2: Do This Month (16-24 hours total)

**Priority:** Process improvements and standardization. Continuous improvement.

### 12. Spike Unknown Dependencies First
- **Owner:** Task-specific (per task)
- **Effort:** 1 hour per uncertain task
- **What:**
  - 30-60 min research BEFORE estimation
  - Identify external dependencies, API limits, unknowns
  - De-risk high-uncertainty tasks
- **Why:** Reduce Tier 2 variance from ±100% to ±50%
- **Source:** Oracle review

### 13. Single Definition-of-Done
- **Owner:** Verifier + Nexus
- **Effort:** 2-3 hours (document + enforce)
- **What:**
  - All work ships with:
    - Tests (unit + integration)
    - Documentation (user-facing + technical)
    - Validation (tested against real data)
  - No exceptions (unless explicitly approved)
- **Why:** Prevent quality variance (some tasks ship with tests, others don't)
- **Source:** Verifier review

### 14. Split Docs (Spec vs Status vs Completion)
- **Owner:** Archivist
- **Effort:** 3-4 hours (restructure existing docs)
- **What:**
  - **Spec:** Requirements, design, implementation plan (static)
  - **Status:** Current progress, blockers (updated frequently)
  - **Completion:** Final deliverables, lessons learned (written once)
- **Why:** Prevent docs marked both "in progress" and "complete" simultaneously
- **Source:** Verifier review

### 15. CI Quality Gates
- **Owner:** Atlas + Verifier
- **Effort:** 4-6 hours (GitHub Actions setup)
- **What:**
  - Run tests on every commit
  - Enforce coverage threshold (≥70%)
  - Strict TypeScript build (no `any`, no errors)
  - Block merge if quality gates fail
- **Why:** Catch regressions early (before they reach production)
- **Source:** Verifier review

### 16. Deploy Repeatability
- **Owner:** Atlas
- **Effort:** 4-6 hours
- **What:**
  - Single entrypoint script: `deploy.sh`
  - Sequence: apply → smoke test → rollback on failure
  - Eliminate path drift (consolidate references)
  - Document ops procedures (make implicit knowledge explicit)
- **Why:** Current ops procedures are implicit (runbook is thin)
- **Source:** Atlas review

### 17. Monthly Estimation Calibration
- **Owner:** Oracle + Nexus
- **Effort:** 1-2 hours per month (ongoing)
- **What:**
  - Monthly review: (estimate, actual, variance)
  - Update tier boundaries based on data
  - Identify systemic estimation biases
  - Continuous improvement loop
- **Why:** Estimation accuracy improves over time
- **Source:** Oracle review

---

## Summary by Priority

### P0 (This Week: 10-14 hours)
1. Three-tier estimation framework (1-2h)
2. Fix failing cron jobs + alerts (3-4h)
3. SQLite hardening (2-3h)
4. SQLite-consistent backups (2-3h)
5. Session handoff docs (2-4h, in progress)

### P1 (Next Week: 12-18 hours)
6. Pre-approval decision framework (2-3h)
7. Runtime DB validation for KPIs (3-4h)
8. Real-time variance alerts (2-3h)
9. Cron reliability reporting (2-3h)
10. Injectable config (2-3h)
11. Model routing strategy (2-3h)
12. Dispatch verification protocol (2-3h)

### P2 (This Month: 16-24 hours)
13. Spike unknown dependencies (1h per task)
14. Single Definition-of-Done (2-3h)
15. Split docs (3-4h)
16. CI quality gates (4-6h)
17. Deploy repeatability (4-6h)
18. Monthly estimation calibration (1-2h/month)

**Total effort: 38-56 hours over 4 weeks**

---

## Success Metrics

**How we'll know it worked:**

| Metric | Current | Target | Review Source |
|--------|---------|--------|---------------|
| Estimation error | 10-100x | 1.5-3x | Oracle |
| Single points of failure | 7 | 0 | Sentinel |
| Session amnesia rate | 13/24h | 0 | Atlas |
| KPI validation errors | Many | 0 | Verifier |
| Code coverage | 49-70% | >70% all | Verifier |
| Cron job health | 80% | 100% | Sentinel |
| Deployment failures | Unknown | <5% | Atlas |

---

## Team Review Sources

- **Oracle (Strategic):** `~/clawd/shared-context/team-review-consistency-oracle.md` (30KB)
- **Atlas (Operations):** `~/clawd/shared-context/team-review-consistency-atlas.md`
- **Sentinel (Risk):** `~/clawd/shared-context/team-review-consistency-sentinel.md` (25KB)
- **Verifier (Quality):** `~/clawd/shared-context/team-review-consistency-verifier.md`
- **Synthesis:** `~/clawd/shared-context/team-review-consistency-synthesis.md`

---

**Recommendation:** Infrastructure Hardening Sprint (P0, this week) before resuming Phase 4 features. Fix foundation = more consistent long-term.

**En Taro Adun.**

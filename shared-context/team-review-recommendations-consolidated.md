# Team Consistency Review — Consolidated Recommendations

**Date:** 2026-02-14 20:07 CST  
**Source:** 4-team review (Oracle, Atlas, Sentinel, Verifier) + user recommendations  
**Context:** User feedback: "We need to be improving more consistently."

**Note:** Offsite backups already handled via Time Machine to Unraid (excluded from list)

---

## P0: Do This Week (10-14 hours total)

**Priority:** Critical infrastructure fragility. Fix foundation before resuming features.

### 1. Adopt Three-Tier Estimation Framework
- **Owner:** Oracle + Nexus
- **Effort:** 1-2 hours
- **What:** Classify work by dependencies, not gut feel
  - **Tier 1 (Cognitive):** Pure design/docs/code → minutes to hours
  - **Tier 2 (External):** API integrations, debugging → hours to days
  - **Tier 3 (Physical/Time):** Hardware, cron schedules → days to weeks
- **Why:** Reduce estimation error from 10-100x to 1.5-3x
- **Source:** Oracle review

### 2. Fix Failing Cron Jobs + Add Failure Alerts
- **Owner:** Atlas
- **Effort:** 3-4 hours
- **What:**
  - Fix Community Scout cron job (currently in error state)
  - Fix Quality Audit cron job (currently in error state)
  - Add Discord webhook for ANY cron job error state
  - Investigate monitor.db (why 0 health checks?)
- **Why:** 2 jobs failing silently, monitoring may be broken
- **Source:** Sentinel + Atlas reviews

### 3. SQLite Hardening
- **Owner:** Atlas
- **Effort:** 2-3 hours
- **What:**
  - Change `journal_mode` from `delete` to `WAL`
  - Set `busy_timeout` from `0` to `5000` (5 seconds)
  - Enable `foreign_keys` (currently `OFF`)
  - Add retry logic for lock contention
  - Add periodic integrity checks (`PRAGMA integrity_check`)
- **Why:** Current settings risk lock contention and corruption
- **Target DBs:** 
  - `~/clawd/memory/memory.sqlite`
  - `~/clawd/agents/ventureos-rpg.db`
- **Source:** Atlas + Sentinel reviews

### 4. SQLite-Consistent Backups
- **Owner:** Atlas
- **Effort:** 2-3 hours
- **What:**
  - Replace tar-based backup with SQLite `.backup` command
  - Ensures consistent snapshot (not mid-transaction state)
  - Add weekly restore drill (automated validation)
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

### 11. Model Routing Strategy
- **Owner:** Oracle + Atlas
- **Effort:** 2-3 hours (documentation + cron updates)
- **What:**
  - Route simple tasks to cheaper models (OpenAI/Codex mini/nano)
  - Route complex tasks to Anthropic Claude
  - **Simple tasks** → lighter models:
    - `openai-codex/gpt-5.1-codex-mini` (Codex optimized)
    - `openai/gpt-4.1-mini` (general purpose, cheap)
    - `openai/gpt-4.1-nano` (cheapest)
    - `openai/gpt-5-nano` (newest nano)
  - **Complex tasks** → Anthropic:
    - `anthropic/claude-3-5-sonnet-20241022` (production)
    - `anthropic/claude-3-7-sonnet-20250219` (newer)
    - `anthropic/claude-opus-4-6` (highest capability)
  - **Use cases for lighter models:** cron health checks, backup verification, log parsing, status monitoring
  - **Keep Anthropic for:** team reviews, strategic decisions, external content (prompt injection defense)
- **Why:** Reduce costs + balance load between providers
- **Source:** User recommendation (2026-02-14)

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

### P1 (Next Week: 10-15 hours)
6. Pre-approval decision framework (2-3h)
7. Runtime DB validation for KPIs (3-4h)
8. Real-time variance alerts (2-3h)
9. Cron reliability reporting (2-3h)
10. Injectable config (2-3h)
11. Model routing strategy (2-3h)

### P2 (This Month: 16-24 hours)
12. Spike unknown dependencies (1h per task)
13. Single Definition-of-Done (2-3h)
14. Split docs (3-4h)
15. CI quality gates (4-6h)
16. Deploy repeatability (4-6h)
17. Monthly estimation calibration (1-2h/month)

**Total effort: 36-53 hours over 4 weeks**

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

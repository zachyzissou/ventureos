# Team Review — Operational Consistency & Infrastructure Reliability (Atlas)
**Date:** 2026-02-14  
**Scope:** Infrastructure/ops reliability only (not strategy).  
**Prompt:** “We need to be improving more consistently.”

---

## 0) Executive Summary (What’s driving inconsistency)
You have **pockets of strong reliability** (cron automation exists, backups exist with checksum verification, basic gateway health monitoring exists). The inconsistency shows up where:

- **State is large + long-lived** (Oracle sessions ballooning to ~600KB and churn/reset behavior → context loss/amnesia).
- **State is shared + concurrent** (SQLite used broadly with default locking/journaling + no busy_timeout → lock contention risk under load).
- **Ops knowledge is implicit** (procedures live in scripts/prompts; runbook is minimal; “how we deploy safely” isn’t codified).
- **Observability is “log-pattern based”** (we detect some failures, but not leading indicators; many failures are only visible after users feel pain).

Consistency will improve most by (1) **putting guardrails around state growth**, (2) **hardening SQLite + backups**, and (3) **adding a small set of “SLO-style” metrics and alerts** (missed runs, churn rate, lock errors, disk, backup/restore health).

---

## 1) Reliability Assessment — What’s stable vs brittle?

### Stable / working well
- **Cron orchestration exists and is centralized** in `~/.openclaw/cron/jobs.json`.
  - Jobs commonly return `HEARTBEAT_OK`, and suppression rules reduce alert spam.
  - Cron run logs exist (`~/.openclaw/cron/runs/*.jsonl`), with duration + status + summary.
- **Backups exist and are integrity-checked**:
  - `scripts/backup-clawd.sh` creates daily tarballs + sha256; retains 30 days.
  - `scripts/verify-backup.sh` validates checksum + tar readability.
  - `scripts/restore-backup.sh` exists with a DRY RUN default (good safety posture).
- **Gateway health monitoring exists**:
  - `scripts/monitor-openclaw.sh` checks `openclaw gateway status`, detects stale gateway lock, and incrementally scans `gateway.err.log` for auth/network/timeout patterns.
  - Uses a cursor file (`~/clawd/runtime/monitor/state.json`) to avoid re-alerting on the same log data.

### Brittle / fragile
- **Session management is fragile under sustained load**:
  - Oracle shows heavy session churn/rotation (`.jsonl.deleted.*` prevalence in `~/.openclaw/agents/oracle/sessions/`).
  - When sessions hit the size/context threshold, the system degrades into frequent resets → **loss of working context** → inconsistent outcomes.
- **SQLite defaults are risky for multi-writer systems**:
  - On inspected DBs (`memory/memory.sqlite`, `agents/ventureos-rpg.db`): `PRAGMA journal_mode = delete`, `busy_timeout = 0`, `foreign_keys = 0`.
  - Under concurrency, this is a common root cause of “database is locked” errors and intermittent failures.
- **Backups likely capture live SQLite files without coordination**:
  - Current backup approach tars directories that include SQLite DBs.
  - If a DB is actively written during tar, you can get inconsistent snapshots (especially without WAL/backup API usage).
- **Operational procedures are under-documented**:
  - `OPS_RUNBOOK.md` defines severity levels but contains little “do X/Y/Z” detail (triage, remediation steps, escalation, rollback).
- **Path/reference drift exists** (a classic reliability killer):
  - Example: `scripts/guarded-run.sh` references legacy paths under `projects/openclaw-upgrade/scripts/...`.
  - There are scripts (`update_cron_jobs.py`, `fix-cron-jobs.py`) dedicated to rewriting references and restarting services, which indicates drift is a known recurring issue.

---

## 2) Operational Gaps — What breaks as load increases?

### A) Oracle 13-session churn / “amnesia” failure mode
Likely progression under load:
1. Long sessions accumulate large context → compaction triggers (“safeguard” mode) and/or transcript rotation.
2. When threshold is exceeded, system resets/rolls sessions more often.
3. Agents lose important intermediate decisions, constraints, or partial work → repeated effort, inconsistent outputs.

**Key operational symptom:** lots of `.deleted` session artifacts suggests the system is “coping” by discarding history rather than preserving structured summaries.

### B) SQLite contention and intermittent failures
As more agents/crons write to SQLite concurrently:
- `journal_mode=delete` + `busy_timeout=0` makes lock failures more likely.
- Failures may present as sporadic task aborts, partial writes, or silent missing records (depending on error handling).

**Amplifier:** cron jobs + interactive sessions often overlap (peak activity times), increasing contention.

### C) Monitoring overhead and blind spots as logs grow
- `monitor-openclaw.sh` scans `gateway.err.log` incrementally (good), but:
  - It does not track error rates, only patterns.
  - It doesn’t measure latency/throughput; so “degradation” can go unseen until hard failures.
- Cron run logs accumulate; there is an export script, but not evidence of a daily summary/alerting loop that enforces an SLO for success/missed runs.

### D) Backups under load
- Backups happen on a schedule, but under high write activity:
  - SQLite-in-tar backups may be inconsistent.
  - There’s no automated restore drill, so “backup exists” ≠ “recovery is reliable.”

---

## 3) Deployment Reliability — How consistent is ship → production?

**Current posture (from artifacts present):**
- Changes are delivered via **direct edits to scripts/configs**, and sometimes require **manual service restarts** (e.g., launchctl / gateway restart), plus reference rewriting.
- There’s a lot of “fast build → quick validation → ship,” which historically led to production-readiness gaps (see monitor lessons learned docs).

**Primary reliability risks in the pipeline:**
- **No single “release unit”** (versioned bundle) for scripts/config + a clear apply/rollback procedure.
- **Reference drift** (absolute paths, moving scripts) creates non-deterministic deploy outcomes.
- **Limited preflight checks** before applying changes (e.g., cron job validity, script executability, dependency availability, DB health).

**What’s good:**
- Restore tooling exists (dry-run first).
- There is evidence of a culture of adding wrappers (`retry.sh`, `with-timeout.sh`, etc.), which is a good direction—just not consistently wired in.

---

## 4) Monitoring Coverage — What don’t we see until it breaks?

### “Unknown until user pain” areas
- **Session health metrics**
  - Session size over time; compaction events; reset/rotation counts; “deleted transcript” rate.
- **Cron SLAs**
  - Missed runs, high duration variance, repeated retries, failure counts by job.
- **SQLite health**
  - Lock contention events, slow queries, DB corruption checks, WAL checkpoint health (if enabled).
- **Backup/RPO/RTO reality**
  - Backup success is known, but **restore success is not routinely proven**.
- **Disk + growth**
  - Growth of logs (`gateway.err.log`, cron runs), DB sizes, backup directory; alerts before disk pressure causes cascading failures.

### Monitoring that exists but is narrow
- Gateway process up/down, stale lock detection, and pattern-matching for certain error strings.

---

## 5) Recommendations — Concrete operational changes (3–5)
These are ordered for highest impact on “consistent improvement” with relatively low engineering overhead.

### 1) Add **Session SLOs + guardrails** (stop amnesia before it starts)
**Goal:** reduce resets and preserve continuity even when context is large.

Actions:
- Track and alert on:
  - session size (bytes/tokens), compaction count, resets per 24h, “deleted transcript” count.
- Implement proactive “pre-compaction” behavior:
  - When a session hits ~60–70% of the known limit, auto-generate a structured summary artifact (decisions, constraints, TODOs, links, current state) saved outside the transcript.
- Prefer **session segmentation** (“new thread, same project memory”) over repeated hard resets.

Deliverable artifact suggestion:
- `shared-context/<agent>/session-state.md` updated automatically; used as stable working memory across sessions.

### 2) Harden SQLite for concurrency + reliability
**Goal:** eliminate intermittent lock failures and make behavior deterministic under load.

Actions:
- Enable WAL where appropriate and safe:
  - `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;` (case-by-case).
- Set connection-level reliability defaults:
  - `PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;`.
- Add a “DB is locked” retry wrapper where writes happen (or central DB helper).
- Add periodic integrity checks:
  - `PRAGMA quick_check;` on a schedule; alert on non-OK.

### 3) Make backups SQLite-consistent + add restore drills
**Goal:** backups that can be trusted during incidents.

Actions:
- Replace “tar live DB” with SQLite-aware backup:
  - Use `sqlite3 db.sqlite '.backup backup.sqlite'` (or application-level backup API), then tar the backup copy.
- Add a **weekly automated restore verification**:
  - Restore to a temp directory, open DBs, run `quick_check`, validate expected tables/rows, and report success.
- Add minimal offsite replication (even “copy latest tar to cloud storage”) to reduce single-host risk.

### 4) Add cron reliability reporting (success rate + missed-run detection)
**Goal:** turn “jobs exist” into “jobs are reliably producing outcomes.”

Actions:
- Use existing `~/.openclaw/cron/runs/*.jsonl` to generate daily metrics:
  - success rate by job, failures by job, p95 duration by job, missed-run detection.
- Alert when:
  - a critical job fails N times in a row, or hasn’t produced an OK run within its expected interval.

You already have `scripts/export-cron-logs.sh`; wire it into a daily summary + alert.

### 5) Reduce path drift and make deploys repeatable
**Goal:** fewer “it worked yesterday” failures.

Actions:
- Create a single “apply changes” entrypoint:
  - e.g., `scripts/apply-ops-changes.sh` that:
    1) validates scripts exist + executable,
    2) validates cron jobs JSON,
    3) runs a smoke check (`openclaw gateway status`, minimal cron dry-run),
    4) restarts services if needed,
    5) writes an audit record (timestamp + git commit hash + what changed).
- Eliminate absolute/legacy script paths (e.g., fix `guarded-run.sh` references).
- Add a rollback playbook: “restore last known good backup + restart gateway.”

---

## 6) “Duct tape” / operational debt inventory (high-signal items)
- **Legacy script references** (example: `scripts/guarded-run.sh` uses old project paths).
- **Runbook too thin** (severity labels exist; procedures largely do not).
- **Disabled memory extraction** job means less structured continuity across resets.
- **Backups are local-only** (observed) and not routinely restored/tested.
- **Monitoring is primarily reactive** (pattern match errors) vs proactive leading indicators (churn, lock contention, drift).

---

## 7) Minimal next step plan (1–2 weeks)
1. Instrument session churn + session size metrics; create 1 alert: “>X resets/day” and “>Y deleted transcripts/day.”
2. Switch key SQLite DBs to WAL + busy_timeout; add one retry wrapper for write operations.
3. Update backup script to do SQLite `.backup` first; add a weekly restore+quick_check cron.
4. Wire `export-cron-logs.sh` into a daily ops summary that flags failures/missed runs.
5. Fix path drift (start with `guarded-run.sh`), and add a single deploy/smoke-check script.

# VentureOS RPG System — Final Review (Atlas / Infrastructure Perspective)

Date: 2026-02-14 (America/Chicago)

Scope reviewed (as deployed):
- SQLite DB: `~/clawd/agents/ventureos-rpg.db`
- Daily RPG cron jobs (OpenClaw cron): **Psionic stats**, **Khala drift**, **Memory→RPG**, **Protocol triggers**
- Dashboard integration (port 7001): `~/clawd/openclaw-dashboard` + `~/clawd/ventureos-rpg` API/components

---

## Overall assessment
The system is **cleanly decomposed** (DB → deterministic scripts → thin HTTP endpoints → dashboard components) and is already useful operationally.

From a reliability angle, the two biggest concerns are:
1) **Stateful drift processing is not idempotent** (state file watermarking can skip events and can double-apply drift if reset)
2) **Backups do not currently cover the RPG database by default** (the primary nightly backup omits `ventureos-rpg.db`)

Everything else is “good enough for a homelab / low-QPS internal dashboard” today, with clear paths to harden.

### Infrastructure rating (1–10)
**7 / 10**

- 8–9 would require: DB backup/restore drilled, drift idempotence fixed, and lightweight monitoring/alerts for the RPG pipeline.
- 5–6 would be the score if we lacked schema/indexes/logs; we *do* have them.

---

## Operational strengths (top 3)
1) **Simple, inspectable data plane (SQLite) with sensible indexes**
   - Key tables have indexes (`psionic_stats`, `khala_drift_history`, `interaction_logs`, `missions`, `escalations`).
   - Data volumes are naturally small for daily snapshots (8 agents ⇒ 8 rows/day in `psionic_stats`).

2) **Deterministic, script-driven pipeline**
   - Stats: `aggregate-agent-metrics.sh` → `calculate-psionic-stats.sh` uses UPSERT (`UNIQUE(agent_id, snapshot_date)`) and is mostly idempotent.
   - Protocol activation engine (`check-protocol-triggers.sh`) is deterministic and logs actions to dated log files.

3) **Dashboard integration is thin and modular**
   - RPG API routes are isolated (`/api/rpg/*`) and component modules are served statically.
   - Works even if RPG module is missing (safe require patterns).

---

## Operational risks (top 3)
1) **Khala drift update is not safely replayable (risk of skipped or double-applied drift)**
   - `update-khala-drift.sh` uses a timestamp watermark file: `~/clawd/runtime/tmp/khala-drift-last-processed.txt`.
   - It sets watermark to **current time at end of run**, not the max `created_at` processed.
     - Any interactions created during the run with `created_at` < watermark can be **missed forever**.
   - If the watermark file is deleted (tmp cleanup) it will default to “24h ago” and **re-apply drift** to recent events.

2) **Backup strategy does not cover the RPG DB by default**
   - Nightly backup script `~/clawd/scripts/backup-clawd.sh` does **not** include `~/clawd/agents/ventureos-rpg.db`.
   - There *is* a dedicated `~/clawd/scripts/backup-rpg-db.sh`, but it is not scheduled in OpenClaw cron.

3) **Protocol activation has duplicated engines + scaling risks around observational scanning**
   - Both `sync-memory-to-rpg.sh` and `check-protocol-triggers.sh` can touch overlapping protocols.
   - `check-protocol-triggers.sh` repeatedly calls `rg` across all observation files *per agent, per tag*, which can become slow as observations grow and may exceed the cron timeout (180s).

---

## 1) Infrastructure robustness

### Daily cron jobs: reliability & sustainability
Current daily RPG jobs (from `~/.openclaw/cron/jobs.json`):
- **06:00** Daily Psionic Stats Calculation
  - Runs: `aggregate-agent-metrics.sh` then `calculate-psionic-stats.sh` + verifies rows exist for all overlay agents.
  - Reliability: **strong** (explicit verification step, deterministic writes, UPSERT)
  - Risk: session log scanning can grow in cost; cron timeout is 180s.

- **06:15** Daily Khala Drift Update
  - Runs: `update-khala-drift.sh`
  - Reliability: **medium** (logging exists; but idempotence/watermark issues are a real operational hazard)

- **06:20** Daily Memory→RPG Sync
  - Runs: `sync-memory-to-rpg.sh`
  - Reliability: **medium** (prereq checks are good; but redundant with trigger engine and relies heavily on ripgrep scanning)

- **06:25** Daily Protocol Trigger Check
  - Runs: `check-protocol-triggers.sh`
  - Reliability: **medium-high** (deterministic + logs; but performance risk from repeated ripgrep/SQLite calls)

Sustainability notes:
- The pipeline is **ordered** (stats → drift → memory → triggers). That’s correct conceptually.
- There is **no explicit locking** to prevent overlap if a job runs long or OpenClaw delays scheduling.
  - For safety, add a per-job lock file or a single “RPG pipeline lock” to enforce one-at-a-time execution.

### Database setup (schema, indexes, backups)
DB: `~/clawd/agents/ventureos-rpg.db` (~150 KB currently)

Schema/indexes:
- Good baseline: `UNIQUE(agent_id, snapshot_date)` on `psionic_stats`, indexes on drift and interaction time ordering.
- `personality_activations` has an index for active rows (`WHERE deactivated_at IS NULL`) but not a **unique partial index** to enforce “only one active instance per (agent, protocol)”.
  - Current correctness relies on application logic.

Backups:
- **Gap:** core nightly backup omits RPG DB.
- Recommended baseline:
  - Schedule `backup-rpg-db.sh` daily OR include the DB in `backup-clawd.sh` tarball.
  - Add a restore verification step (open DB, run `PRAGMA integrity_check;`, run a few `SELECT COUNT(*)` sanity checks).

### Operational bottlenecks / hazards
- Drift script replay hazards (see “risks”).
- SQLite concurrency:
  - Dashboard reads + cron writes can cause transient `database is locked` errors.
  - Most sqlite calls do not set an explicit busy timeout.

### Maintainability (long-term)
- Code is readable, mostly small scripts with clear names.
- Maintainability risks:
  - **Schema drift:** `init-rpg-database.sh` does not exactly match the current on-disk schema (notably `escalations` CHECK constraint differs). Fresh bootstraps could diverge.
  - Mixed duplicate logic between Memory→RPG sync and Protocol Trigger Check.

---

## 2) Performance & scalability

### Script efficiency
- `collect-session-metrics.sh` scans all session JSONLs for each agent and filters by timestamp; as those logs grow, this becomes O(total log size) per run.
  - Optimization path: only scan session files with `mtime >= cutoff`, or store computed daily aggregates.

- `_collect-warp-metrics.py` reads and regex-scans **all markdown memory files** per agent.
  - Today: OK.
  - At scale: cache counts or compute once for all agents in a single pass.

- `check-protocol-triggers.sh` repeatedly runs ripgrep across observation files.
  - Biggest near-term scaling risk for the daily protocol pipeline.

### Dashboard API performance concerns
- RPG API uses `sqlite3 -json` invoked via `execFile` for each query.
  - OK for low-QPS.
  - For higher usage: switch to a long-lived SQLite connection (e.g., `better-sqlite3`) and batch queries.

- `getKhalaNetwork()` currently does **N+1 queries** for drift history (one per bond edge).
  - With 8 agents (28 edges) it’s fine.
  - With more agents / larger drift history, it will become noticeable.
  - Easy win: fetch drift history in one query and group in JS.

### Will it scale as data grows?
- `psionic_stats`: yes (linear but tiny).
- `interaction_logs` + `khala_drift_history`: yes structurally, but the drift updater needs idempotence and a proper watermark.
- Observation scanning: will degrade first unless moved into indexed data (DB table or precomputed index).

---

## 3) Monitoring & observability

### Can we detect when things go wrong?
Partially.
- OpenClaw cron retains per-job state (`lastStatus`, `lastRunAtMs`).
- There are dated log files for drift/sync/triggers in `~/clawd/runtime/logs/`.

However:
- The existing `cron-health-check.sh` only flags **everyMs** schedules as overdue; it does not compute overdue-ness for **cron expr** schedules. That means it can miss a daily RPG job that silently stops running.

### Logs: adequacy for troubleshooting
- Drift: good (step-by-step), but logs also show floating point string artifacts (`0.8300000000000001`).
- Protocol triggers: verbose and useful.
- Psionic stats: mostly stderr logs + a compact summary; OK.

### Monitoring / observability gaps
- No single “RPG pipeline health” check (ex: “did all four steps complete today?”).
- No alert on:
  - missing daily `psionic_stats` snapshots,
  - drift updates not advancing watermark,
  - protocol trigger run not executed today,
  - DB lock contention.
- No backup-age monitoring for the RPG DB.

Recommended minimal monitors (cheap + high ROI):
1) **RPG health script** (cron):
   - Verify today’s `psionic_stats` rows == number of overlay agents.
   - Verify drift watermark advanced in last 26h (or drift history has entries when interactions exist).
   - Verify protocol triggers log ran today OR a DB “last_trigger_run” marker row.
   - Alert only on failure.

2) Extend `cron-health-check.sh` to check cron-expr jobs via `nextRunAtMs` vs now and/or “lastRunAtMs older than 2× expected period” for daily jobs.

3) Record job run results into the RPG DB (or a small `rpg_job_runs` table) to make the dashboard self-describing.

---

## 4) Atlas-specific assessment

### As Probe (Infrastructure Fabricator): how the role works
- Atlas contributions currently flow into RPG primarily through:
  - Session-derived proxies (`success_rate`, `acceptance_rate`, latency/MTTR proxies)
  - Warp Tech inputs (`change_success_rate`, `slo_compliance`) derived from those proxies
  - Protocol gating (e.g., `proactive_monitoring`) based on observational tags

This is a solid first pass, but it’s **still mostly proxy metrics** (LLM/session quality ≠ infrastructure reliability).

### Atlas reliability metrics panel: usefulness & accuracy
Component: `~/clawd/ventureos-rpg/components/atlas-reliability-metrics.js`

What’s good:
- Presents a coherent reliability “story”: deployment success, MTTR, uptime, warp-in success.
- Clearly labels many values as proxies.

Accuracy gaps:
- “Backup success” is currently a proxy of `success_rate` (not backup telemetry).
- “Pylon uptime” uses session `success_rate`, which is not system uptime.
- MTTR is derived from cron task runs in the session metrics collector (a proxy), not actual incident recovery.

Recommended improvements:
- Feed real infra signals into DB:
  - backup job success + backup age
  - cron job failure counts
  - OpenClaw gateway uptime / restart counts
  - dashboard/API availability checks
- Then remap panel to those real signals (keep session quality as a separate panel).

### Does the system track Atlas infrastructure work properly?
- Partially.
- The system tracks *activity and quality proxies* more than *infrastructure outcomes*.

To properly attribute Atlas work:
- Log infra actions as **missions** (with `mission_type`, success, duration, acceptance) and/or **interactions**.
- Populate `missions` for “monitoring added”, “backup repaired”, “cron fixed”, etc., and tie XP/CRE to those.

---

## Priority hardening checklist (recommended next steps)

P0 (do next):
- Add RPG DB backups to the nightly backup workflow (schedule `backup-rpg-db.sh` or include DB in `backup-clawd.sh`).
- Fix drift watermarking + idempotence:
  - watermark = max processed `(created_at, id)` (not “now”)
  - update watermark only after successful commit
  - guard against missing watermark file causing reapplication

P1 (next week):
- Consolidate protocol activation engines (prefer `check-protocol-triggers.sh`; consider retiring `sync-memory-to-rpg.sh` or limiting it to writing structured observations into DB).
- Optimize observation tag counting (use `index.json` or persist tags into DB).
- Add busy timeout to sqlite calls and/or enable WAL mode.

P2 (polish):
- Reduce dashboard RPG endpoint query fan-out (batch drift history queries; avoid spawning 30+ `sqlite3` processes per page load).
- Add a minimal `/api/rpg/health` endpoint and a monitor to alert when unhealthy.

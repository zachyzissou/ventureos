# OpenClaw Upgrade – Implementation Tasks

> Ordered, actionable tasks with acceptance criteria.

---

## A) Context & Prompting (P0)

### A1 — Create Goals + Constraints Brief
**Deliverable:** `~/clawd/GOALS_CONSTRAINTS.md` (or `ONBOARDING_BRIEF.md`)
**Acceptance:**
- Contains goals, constraints, proactive boundaries, comms preferences
- Readable in <2 minutes
- Linked from `AGENTS.md`

### A2 — Guardrails Policy
**Deliverable:** `~/clawd/GUARDRAILS.md`
**Acceptance:**
- Explicit prohibitions: payments, deletions, external comms, config updates
- Includes “requires explicit approval” list
- Linked from `AGENTS.md`

### A3 — Proactive Mode Rules
**Deliverable:** `~/clawd/PROACTIVE_MODE.md`
**Acceptance:**
- Allowed proactive actions listed
- Quiet hours + escalation path specified
- Default time window documented

---

## B) Model Strategy (P0)

### B1 — Model Routing Policy
**Deliverable:** `~/clawd/MODEL_STRATEGY.md`
**Acceptance:**
- Defines cheap vs strong model criteria
- Lists fallback chain
- Includes “override” triggers for strong model

### B2 — Budget Caps + Alerts
**Deliverable:** `~/clawd/BUDGET_POLICY.md`
**Acceptance:**
- Usage‑quota caps + thresholds (points/messages/queries)
- Behavior when thresholds exceeded
- Alert destination specified

---

## C) Operational Reliability (P1)

### C1 — Monitoring: Crash/Auth/Timeout
**Deliverable:** `~/clawd/scripts/monitor-openclaw.sh` + cron job
**Acceptance:**
- Detects gateway crash (log grep or process check)
- Detects stale `~/.openclaw/gateway.lock` when gateway is down (mtime > 10 min)
- Detects auth failures (log grep)
- Detects timeouts / stuck jobs
- Sends alert via chosen channel

### C2 — Nightly Backups
**Deliverable:** `~/clawd/scripts/backup-clawd.sh` + cron job
**Acceptance:**
- Backs up config, cron jobs, memory, state.json
- Stores in destination dir with date stamp
- Retains last N days
- Verifies latest backup (checksum or extract)

### C3 — Restore Workflow (Manual)
**Deliverable:** `~/clawd/scripts/restore-backup.sh`
**Acceptance:**
- Dry‑run by default (no changes)
- Requires `--confirm` to apply restore
- Verifies checksum before extract
- No deletions during restore (non‑destructive)

### C4 — Update Cadence
**Deliverable:** scheduled reminder + optional controlled update script
**Acceptance:**
- Weekly update window documented
- Updates never run outside window without explicit approval
- Restart window specified

---

## D) Workflow Automation (P1)

### D1 — Task Queue
**Deliverable:** `~/clawd/runtime/task-queue.json`
**Acceptance:**
- Supports SLA tiers (urgent/normal/low)
- Supports status tracking (queued/running/done/failed)

### D2 — Execution Logs
**Deliverable:** `~/clawd/runtime/logs/task_runs/YYYY-MM-DD.jsonl`
**Acceptance:**
- Each run logged with timestamp, job_id, status, duration, model
- Retention policy documented

### D3 — Archive Task Runs
**Deliverable:** `~/clawd/scripts/archive-task-runs.sh` + monthly cron
**Acceptance:**
- Archives `task_runs` JSONL older than 30 days
- Stores in `~/clawd/archives/YYYY-MM/task_runs/`
- Leaves `state.json` in place

---

## E) Docs Integration (P2)

### E1 — Update Upgrade Repo Docs
**Deliverable:** update `FEATURE_BACKLOG.md` + `ROADMAP.md`
**Acceptance:**
- Links to implementation tasks
- Phase 0 reflects new policy docs

---

## F) Memory System (P2)

### F1 — Three‑Layer Memory Architecture
**Deliverable:** doc section describing three layers + retrieval order
**Acceptance:**
- Daily logs (`memory/YYYY-MM-DD.md`)
- Entity facts (`items.json` + `summary.md`)
- Tacit memory (`MEMORY.md`)

### F2 — Entity Fact Store
**Deliverable:** entity directory structure + `items.json` schema + summary format
**Acceptance:**
- Facts stored per entity (people/companies/projects)
- Supersede‑not‑delete semantics defined

### F3 — Weekly Synthesis
**Deliverable:** weekly job spec that rewrites summaries from active facts
**Acceptance:**
- Contradicted facts marked superseded
- Summaries stay current + concise

---

## Decisions Locked (Defaults)
- Proactive window: **08:00–23:00 CST** (quiet 23:00–08:00)
- Budget thresholds: **50% / 80% / 90%**; at 90% default to cheap model
- Usage caps: **10,000 points/month** (Anthropic), **50 msgs/3h** (Codex), **100 queries/day** (Gemini)
- Backup destination: `~/backups/clawd/` (30‑day retention, weekly verify)
- Update window: Sunday **03:00–04:00 CST** (reminder only; approval required)
- Alert channel: **Discord DM**

## Remaining Decisions
- None (backup coverage resolved; permissions fixed)

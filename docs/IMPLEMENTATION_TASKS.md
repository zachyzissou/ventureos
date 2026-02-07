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
- Monthly budget caps + thresholds
- Behavior when thresholds exceeded
- Alert destination specified

---

## C) Operational Reliability (P1)

### C1 — Monitoring: Crash/Auth/Timeout
**Deliverable:** `~/clawd/scripts/monitor-openclaw.sh` + cron job
**Acceptance:**
- Detects gateway crash (log grep or process check)
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

### C3 — Update Cadence
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

---

## E) Docs Integration (P2)

### E1 — Update Upgrade Repo Docs
**Deliverable:** update `FEATURE_BACKLOG.md` + `ROADMAP.md`
**Acceptance:**
- Links to implementation tasks
- Phase 0 reflects new policy docs

---

## Open Decisions (Need Confirmation)
- Proactive window
- Budget caps + thresholds
- Backup destination + retention
- Update/restart window
- Alert channel

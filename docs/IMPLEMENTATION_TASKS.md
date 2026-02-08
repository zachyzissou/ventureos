# VentureOS – Implementation Tasks

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

### C5 — Safe Config Change Protocol (Codex‑assisted)
**Deliverable:** `docs/CONFIG_CHANGE_SAFETY.md`
**Acceptance:**
- Pre‑flight checklist + backup step
- Changes applied via `config.patch` (baseHash required)
- Automatic rollback on restart failure
- Explicit approval gate documented

---

## D) Workflow Automation (P1)

### D1 — Task Queue
**Deliverable:** `~/clawd/runtime/task-queue.json`
**Acceptance:**
- Supports SLA tiers (P0–P3)
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

## G) Reliability (Phase 1)

### G1 — Retry + Backoff Standard
**Deliverable:** `docs/RELIABILITY_PLAYBOOK.md`
**Acceptance:** retry policy defined; errors classified; non‑retry cases specified.

### G2 — Timeout Standardization
**Deliverable:** `docs/RELIABILITY_PLAYBOOK.md` + `scripts/with-timeout.sh`
**Acceptance:** timeouts documented + helper script provided.

### G3 — Error Taxonomy + Recovery
**Deliverable:** `docs/RELIABILITY_PLAYBOOK.md`
**Acceptance:** P0/P1/P2 signals + actions defined.

### G4 — Graceful Degradation
**Deliverable:** `docs/RELIABILITY_PLAYBOOK.md`
**Acceptance:** fallback behaviors defined for common dependency failures.

---

## H) Proactive Engine (Phase 2)

### H1 — SLA Tiers + Scheduler Rules
**Deliverable:** `docs/PROACTIVE_ENGINE.md`
**Acceptance:**
- SLA tiers defined (P0–P3 or equivalent)
- Quiet-hours gating rules defined
- Concurrency caps documented
- Backoff/suppression rules documented

### H2 — Queue Enforcement (v1)
**Deliverable:** update `runtime/task-queue.json` schema usage + docs
**Acceptance:**
- Non-P0 work is queued during quiet hours
- Repeated failures are suppressed (cooldown windows)
- Queue entries record attempts + nextRunAt

### H3 — Job Tagging + Routing
**Deliverable:** cron spec updates + conventions
**Acceptance:**
- Each proactive job declares a tier (P0/P1/P2/P3)
- Alert routing documented (SlurpNet alerts vs approvals channel)

---

## I) VentureOS / Multi‑Agent Mission Control (Phase 2–3)

### I1 — VentureOS Core Docs
**Deliverable:** repo docs package
- `docs/VENTURE_OS.md`
- `docs/MULTI_AGENT_TEAM.md`
- `docs/BUSINESS_UNITS.md`
- `docs/MISSION_CONTROL.md`
**Acceptance:**
- Clear distinction between system (VentureOS) and persona (Echo)
- 20-role roster + default squad patterns
- Business unit registry rules + scaling pattern for multi-account media ops
- Mission lifecycle defined with safety/QA gates

### I2 — Mission + Role Templates
**Deliverable:** templates in `docs/templates/`
- `mission-brief.md`
- `role-card.md`
- `business-unit-registry.json`
**Acceptance:**
- Templates are copy/paste usable
- Artifacts include links/sources and approval requirements

### I3 — Task Queue Mission Metadata
**Deliverable:** schema and docs updates
- `docs/templates/task-queue.json` extended with mission metadata
- `docs/PROACTIVE_ENGINE.md` queue schema updated
**Acceptance:**
- Queue items can carry `businessUnit`, `missionType`, `role`, `expectedArtifacts`, `requiresApproval`
- Existing worker continues to operate on `command` without requiring schema migration

### I4 — Business Unit Registry (Workspace)
**Deliverable:** `~/clawd/runtime/business-units.json`
**Acceptance:**
- Contains initial units (media, game, app, infra)
- Each unit links to canonical Obsidian notes

### I5 — Optional: Formal Agent Profiles
**Deliverable:** additional agent profiles with explicit permission boundaries
**Acceptance:**
- Per-role tool/model policies documented
- Requires explicit approval before any config changes

---

## Decisions Locked (Defaults)
- Proactive window: **08:00–23:00 CST** (quiet 23:00–08:00)
- Budget thresholds: **50% / 80% / 90%**; at 90% default to cheap model
- Usage caps: **10,000 points/month** (Anthropic), **50 msgs/3h** (Codex), **100 queries/day** (Gemini)
- Backup destination: `~/backups/clawd/` (30‑day retention, weekly verify)
- Update window: Sunday **03:00–04:00 CST** (reminder only; approval required)
- Alert channel: **Discord → SlurpNet alerts channel (`channel:1466893115460812979`)**

## Remaining Decisions
- None (backup coverage resolved; permissions fixed)

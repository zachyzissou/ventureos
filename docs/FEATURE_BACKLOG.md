# Feature Backlog – OpenClaw Upgrade

## Reliability & Recovery
- **Structured error taxonomy** (P0/P1/P2) with consistent alerts
- **Automatic retry policy** with backoff and max‑attempt limits
- **Timeout standardization** across all network calls
- **Graceful degradation** (fallback behaviors when dependencies fail)

## Proactive Engine
- **Rule‑based proactive scheduler** (time windows, priority, tags)
- **Task queue with SLA tiers** (urgent/normal/low)
- **Context refresh jobs** (daily summaries, stale memory cleanup)

## Output Quality
- **Output QA checks** (format, completeness, missing data)
- **Style templates** for summaries, plans, and reports
- **Feedback capture** (thumbs up/down or “needs revision”)

## Workflow Acceleration
- **1‑command workflows** for common tasks
- **Batch processing** for repeating operations
- **Reusable macros** (multi‑step actions saved as recipes)

## Model Orchestration
- **Model routing policy** (cheap model for low risk, powerful model for heavy tasks)
- **Usage/quota budgets** (subscription caps, alert thresholds)
- **Fallback model chain** (if primary model fails)

## Candidate Enhancements (Research‑Driven, Deferred)
These are high‑value ideas from external research. Not committed yet, but scoped so they can be pulled in quickly.

### Governance & Control
- **Usage‑gate policy** (quota‑aware throttling)
  - Scope: when any provider hits 90% of its quota, pause non‑essential jobs and force cheap model unless explicitly overridden.
  - Signals: subscription‑quota‑tracker.js + job tags (essential vs deferrable).
  - Acceptance: deterministic policy with audit log entry on each gating event.

- **Skill allowlist / mode‑based permissions**
  - Scope: per‑mode allowlists (normal, proactive, audit) with default‑deny for risky tools.
  - Acceptance: single config list, enforced pre‑tool call; violations logged + alerted.

### Ops & Scheduling
- **Heartbeat staggering / jitter**
  - Scope: offset cron/heartbeat workloads to avoid burst load and improve reliability.
  - Acceptance: staggered schedules documented; no two heavy jobs in the same minute.

### Visibility / UX
- **Activity feed + calendar + global search**
  - Scope: unify cron runs, alerts, and key actions into a searchable timeline + calendar view.
  - Data: `task_runs` JSONL + cron runs + alert events.
  - Acceptance: one page with filters (time, severity, model, job_id) + full‑text search.

### Orchestration
- **Mission control (multi‑agent console)**
  - Scope: single dashboard to queue, prioritize, and approve sub‑agent work.
  - Acceptance: queue view + status + approval hooks; integrates with task‑queue.json.

---

Security‑focused items are deferred to a later project.

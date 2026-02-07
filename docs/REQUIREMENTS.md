# Requirements – OpenClaw Upgrade

**Scope:** Context & Prompting, Proactive Mode, Guardrails, Model Strategy, Budgeting, Operational Reliability, Workflow Automation.

---

## Functional Requirements (FR)

**FR‑01 Goals & Constraints Brief**
- Provide a structured goals/constraints brief the agent reads during onboarding or session start.
- **Acceptance:** Single concise doc; includes goals, non‑negotiables, comms preferences, proactive bounds.

**FR‑02 Proactive Mode Rules**
- Define allowed proactive actions + time windows + quiet hours.
- **Acceptance:** Explicit window; P0 alert rules during quiet hours.

**FR‑03 Guardrails**
- Explicitly prohibit payments, deletions, external comms, config updates without approval.
- **Acceptance:** Clear “requires explicit approval” list; referenced in AGENTS/HEARTBEAT.

**FR‑04 Model Routing Policy**
- Use cheap model for routine tasks, strong model for complex work.
- **Acceptance:** Criteria + fallback chain documented.

**FR‑05 Usage‑Quota Caps + Alerts**
- Define subscription usage caps + 50/80/90% thresholds; restrict at 90%.
- **Acceptance:** Quota alerts defined; policy doc exists.

**FR‑06 Monitoring**
- Detect crash/auth/timeout failures; alert by severity.
- **Acceptance:** Monitoring script + cron job; P0 immediate alert.

**FR‑07 Backups**
- Nightly backup of config/memory/state; 30‑day retention; weekly verify.
- **Acceptance:** Backup + verify scripts; cron jobs; restore steps documented.

**FR‑08 Update Cadence**
- Weekly update window; no updates outside window without approval.
- **Acceptance:** Reminder job; policy doc.

**FR‑09 Task Queue (Ops)**
- Define urgent/normal/low tiers for recurring jobs.
- **Acceptance:** Queue schema + classification defined.

**FR‑10 Execution Logs**
- Record task runs to JSONL with duration/status/summary.
- **Acceptance:** Export job defined; logs written daily.

**FR‑11 Memory System (Three‑Layer)**
- Define a three‑layer memory model: daily logs, entity facts, synthesized memory.
- Entity store uses `items.json` + `summary.md` and supersede‑not‑delete semantics.
- **Acceptance:** architecture + extraction + synthesis rules documented and linked.

**FR‑12 Auditability**
- Every automated job should have traceable logs and timestamps.
- **Acceptance:** Task runs and backup logs kept for 30 days.

**FR‑13 Documentation**
- Provide implementation‑ready package with scripts, cron specs, runbooks, and rollback.
- **Acceptance:** IMPLEMENTATION_READY.md + supporting docs in repo.

---

## Non‑Functional Requirements (NFR)

**NFR‑01 Reliability**
- Target ≥95% success rate for scheduled tasks.

**NFR‑02 Latency**
- Routine tasks complete in <2 min on average.

**NFR‑03 Safety**
- No destructive or external actions without explicit approval.

**NFR‑04 Maintainability**
- Scripts are idempotent; logs are readable; rollback is documented.

**NFR‑05 Usage/Quota Control**
- Automated quota alerts prevent silent overages.

---

## Out of Scope (for this phase)
- Hardening firewall/SSH beyond existing guardrails
- New external skills or third‑party service integrations
- Full security audits / penetration testing

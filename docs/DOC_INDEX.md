# Documentation Index

## Core
- **README.md** – project overview
- **REPO_CHARTER.md** – VentureOS charter + scope boundaries
- **STATUS.md** – current implementation status
- **ROADMAP.md** – phased roadmap
- **PROJECT_PLAN.md** – milestones + success metrics
- **FEATURE_BACKLOG.md** – backlog by workstream

## VentureOS / Multi-Agent Orchestration
- **VENTURE_OS.md** – venture studio OS overview (system vs persona)
- **MULTI_AGENT_TEAM.md** – 20-role roster + squad patterns
- **BUSINESS_UNITS.md** – business unit registry + scaling rules
- **MISSION_CONTROL.md** – mission lifecycle, gates, and artifact standards
- **WORKFLOW_COMMANDS.md** – 1‑command workflows, interface pattern, safety gates
- **WORKFLOW_MACROS.md** – reusable workflow macro schema, storage, execution semantics

## Policy Docs (repo copies; to be placed in workspace root)
- **WORK_TRACKING.md** – GitLab issues/MRs as canonical tracker + evidence standards
- **GOALS_CONSTRAINTS.md** – goals, constraints, comms preferences
- **GUARDRAILS.md** – explicit prohibitions + allowed actions
- **PROACTIVE_MODE.md** – proactive window + escalation rules
- **PROACTIVE_ENGINE.md** – SLA tiers + scheduler rules (Phase 2)
- **PROACTIVE_RULES.md** – rule schema, windows, cooldowns, escalation, safety gates
- **SLA_POLICY.md** – SLA tiers (time‑to‑ack/run, retries, escalation defaults)
- **CONTEXT_REFRESH.md** – context refresh schedule, jobs, retention/archival rules
- **MODEL_STRATEGY.md** – cheap vs strong model guidance
- **MODEL_ROUTING_POLICY.md** – routing criteria, cost gates, fallback rules
- **MODEL_FALLBACK_CHAIN.md** – fallback order, triggers, retry/timeout interaction, escalation
- **BUDGET_POLICY.md** – thresholds + caps
- **COST_BUDGETS.md** – thresholds, alert routing, enforcement actions, reporting cadence
- **OPS_RUNBOOK.md** – incident response tiers

## Templates (workspace starters)
- **docs/templates/AGENTS.json** – AGENTS policy wiring template
- **docs/templates/HEARTBEAT.md** – HEARTBEAT template with policy links
- **docs/templates/task-queue.json** – task queue schema template (extended with mission metadata)
- **docs/templates/mission-brief.md** – mission brief template
- **docs/templates/mission-runner.md** – mission runner workflow template
- **docs/templates/role-card.md** – role card template
- **docs/templates/business-unit-registry.json** – business unit registry template

## Implementation Design
- **REQUIREMENTS.md** – detailed functional + non‑functional requirements
- **ARCHITECTURE.md** – system design & data flow
- **CONFIG_PLAN.md** – file changes, directories, config guidance
- **CONFIG_CHANGE_SAFETY.md** – safe config change protocol (Codex‑assisted)
- **GATEWAY_POSTURES.md** – supported gateway configurations + firewall guidance
- **RELIABILITY_PLAYBOOK.md** – retry/timeout/taxonomy/degradation standards
- **QUALITY_CHECKS.md** – output QA checks (format + completeness)
- **FEEDBACK_LOOP.md** – feedback capture loop (thumbs up/down, revision requests, logging)
- **STYLE_TEMPLATES.md** – standard templates for summaries, reports, incident notes, decision memos
- **DEGRADATION_POLICY.md** – degradation tiers, fallback behaviors, user messaging + approvals
- **TIMEOUT_POLICY.md** – connect/read/total timeout standards, overrides, logging
- **RETRY_POLICY.md** – retry tiers, backoff + jitter, cooldown, idempotency rules
- **BATCH_PROCESSING.md** – batch manifest, validation, chunking, retries, rollback + queue integration
- **ERROR_TAXONOMY.md** – detailed P0/P1/P2 criteria, response, alerting
- **SCRIPT_SPECS.md** – script‑level specs (backup, monitor, logs, quota)
- **CRON_SPECS.md** – cron job definitions & schedules
- **METRICS_PLAN.md** – KPI definitions + collection approach
- **TEST_PLAN.md** – verification & test cases
- **ROLLOUT_PLAN.md** – phased rollout + rollback
- **RISK_REGISTER.md** – risks, mitigation, owner
- **DECISIONS.md** – locked defaults + ADRs

## Execution Packages
- **IMPLEMENTATION_SPEC.md** – high‑level spec
- **IMPLEMENTATION_TASKS.md** – task breakdown + acceptance criteria
- **IMPLEMENTATION_READY.md** – implementation‑ready package (defaults locked)
- **TEST_RESULTS_2026-02-07.md** – full script test run outputs

## Ops / Decommissioning
- **OPENPROJECT_DECOMMISSION.md** – checklist + verification steps to remove OpenProject integration

## Research Notes
- **TWITTER_CONFIG_RESEARCH_2026-02-07.md** – external config patterns & learnings
- **VOXYZ_CLOSED_LOOP_NOTES_2026-02-07.md** – closed‑loop execution patterns
- **SPACEPIXEL_THREE_LAYER_MEMORY_NOTES_2026-02-07.md** – three‑layer memory system

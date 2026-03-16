# Documentation Index

## Folder Layout
- **docs/roles/** – VentureOS org, roles, mission control, workflow primitives
- **docs/process/** – plans, specs, architecture, implementation, QA
- **docs/ops/** – policy, reliability, budgets, runbooks
- **docs/templates/** – starter templates + schemas
- **docs/archive/** – research notes + test results

## Dashboard
- **[dashboard/README.md](../dashboard/README.md)** – Quick start, build commands, deployment, configuration, migration guide
- **[dashboard/docs/API.md](../dashboard/docs/API.md)** – Complete API reference (all endpoints, schemas, auth, rate limiting)
- **[dashboard/docs/OVERVIEW_FRESHNESS_RUNBOOK.md](../dashboard/docs/OVERVIEW_FRESHNESS_RUNBOOK.md)** – Freshness thresholds, timeline/dedupe tuning, and operator troubleshooting
- **[docs/DASHBOARD.md](DASHBOARD.md)** – VentureOS integration guide (data flow, caching, security, architecture)

## Core
- **README.md** – project overview
- **docs/VentureOS_Role_Model_v1.md** – canonical VentureOS role model
- **docs/VentureOS_Agent_Role_Registry_v1.json** – machine-readable role registry
- **docs/VentureOS_RBAC_Spec_v1.md** – canonical RBAC policy
- **docs/VentureOS_Tool_Access_Matrix_v1.json** – machine-readable RBAC matrix
- **docs/roles/REPO_CHARTER.md** – VentureOS charter + scope boundaries
- **docs/process/OPERATING_CONTRACT_GITLAB.md** – GitHub-first work contract (legacy filename kept for compatibility)
- **docs/process/LABEL_PROTOCOL.md** – how workflow labels are applied/removed
- **docs/process/GITLAB_PROJECT_RESOLVER.md** – how Mission Control resolves the target GitHub repository for issues/PRs (legacy filename kept for compatibility)
- **docs/STATUS.md** – current implementation status (archived pointer; live status in issue #138)
- **docs/ROADMAP.md** – roadmap pointer (archived in-repo, live in issue #138)
- **docs/ROADMAP_STATUS_SYNC.md** – README/roadmap drift rules + maintainer workflow
- **docs/PR_MERGE_RUNBOOK.md** – PR merge readiness checks, blocker handling, and solo-maintainer fallback flow
- **docs/PROJECT_PLAN.md** – milestones + success metrics
- **docs/FEATURE_BACKLOG.md** – backlog by workstream
- **docs/NEXUS_2_0_M2_AUTHORITY_PLANE.md** – M2 authority map, policy gate, and override path
- **docs/NEXUS_2_0_M4_OBSERVABILITY.md** – M4 replay authority surfaces (explain + control-health)
- **docs/NEXUS_2_0_M6_PRODUCTION_READINESS_2026-02-21.md** – M6 readiness decision and evidence matrix
- **docs/CRASH_RECOVERY_ACTIVE_TASKS.md** – active-tasks.md tracker, stale detection, and restart recovery flow (#223)
- **docs/TOKEN_COMPACTION.md** – deterministic 5-layer token compression pipeline, metrics, and benchmark harness (#221)
- **docs/SELF_IMPROVEMENT_DIGEST.md** – daily self-review digest flow, recommendation approvals, and scope guardrails (#222)
- **docs/CODE_FACTORY_PIPELINE.md** – risk-tiered CI policy, SHA-discipline, auto-remediation, and harness-gap tracker (#220)
- **docs/SERVER_DECOMPOSITION_PLAN.md** – stage plan + guardrails for large dashboard server modules (#366, #384, #385)
- **docs/BRIDGE_DECOMPOSITION_PLAN.md** – stage plan + guardrails for bridge server decomposition (#375, #386)
- **docs/WORKFLOW_MACROS_DECOMPOSITION_PLAN.md** – stage plan + guardrails for workflow macro module decomposition (#376)
- **docs/MODEL_ROUTER_DECOMPOSITION_PLAN.md** – stage plan + guardrails for model router decomposition (#377)
- **docs/WEBMCP_INTEGRATION.md** – structured website tool discovery/invocation with cache + browser fallback (#225)
- **docs/VISUAL_EXPLAINER_CANVAS.md** – slash-command visual explainer skill with 5 interactive HTML patterns (#226)
- **docs/PROPOSAL_MISSION_STEP_LIFECYCLE.md** – proposal approval gate, step execution engine, cross-agent handoffs, and event streaming (#227)
- **docs/LIVING_FILES.md** – file ownership registry, stale detection scheduler, auto-triggered remediation, and freshness dashboard (#228)

## VentureOS / Multi-Agent Orchestration
- **docs/roles/VENTURE_OS.md** – venture studio OS overview (system vs persona)
- **docs/MULTI_AGENT_TEAM.md** – legacy roster compatibility map; canonical roles live in the VentureOS role model docs
- **docs/roles/BUSINESS_UNITS.md** – business unit registry + scaling rules
- **docs/roles/MISSION_CONTROL.md** – mission lifecycle, gates, and artifact standards
- **docs/process/MISSION_RUNNER.md** – end-to-end mission runner implementation + usage
- **docs/process/MISSION_STATE_MACHINE.md** – state machine phases, persistence, rollback
- **docs/roles/MISSION_CONTROL_COMMANDS.md** – command vocabulary for orchestration (DM + Mission Control channel)
- **docs/roles/WORKFLOW_COMMANDS.md** – 1‑command workflows, interface pattern, safety gates
- **docs/roles/WORKFLOW_MACROS.md** – reusable workflow macro schema, storage, execution semantics

### Role Cards (20)
- **docs/roles/helmsman.md** – portfolio strategist (CEO office)
- **docs/roles/venture.md** – NewCo incubator
- **docs/roles/oracle.md** – research (market/competitive/tech)
- **docs/roles/ledger.md** – finance & bizops (unit economics)
- **docs/roles/comms.md** – brand/growth/editorial (draft‑first)
- **docs/roles/producer.md** – PMO/operations lead
- **docs/roles/echo.md** – mission control / chief of staff
- **docs/roles/sentinel.md** – governance/safety/IP‑provenance
- **docs/roles/archivist.md** – knowledge & process librarian
- **docs/roles/atlas.md** – infrastructure & modelops
- **docs/roles/synth.md** – AI factory architect (multi‑modal)
- **docs/roles/verifier.md** – QA / release gatekeeper
- **docs/roles/forge.md** – Unity technical director
- **docs/roles/builder.md** – implementation engineer
- **docs/roles/toolsmith.md** – pipeline engineer (tools/automation)
- **docs/roles/interface.md** – UX/UI director
- **docs/roles/mechanic.md** – systems designer
- **docs/roles/muse.md** – art director
- **docs/roles/glyph.md** – narrative/world/copy
- **docs/roles/foley.md** – audio director

## Policy Docs (repo copies; to be placed in workspace root)
- **docs/WORK_TRACKING.md** – GitHub issues/PRs as canonical tracker + evidence standards
- **docs/ops/GOALS_CONSTRAINTS.md** – goals, constraints, comms preferences
- **docs/ops/GUARDRAILS.md** – explicit prohibitions + allowed actions
- **docs/ops/PROACTIVE_MODE.md** – proactive window + escalation rules
- **docs/ops/PROACTIVE_ENGINE.md** – SLA tiers + scheduler rules (Phase 2)
- **docs/ops/PROACTIVE_RULES.md** – rule schema, windows, cooldowns, escalation, safety gates
- **docs/ops/SLA_POLICY.md** – SLA tiers (time‑to‑ack/run, retries, escalation defaults)
- **docs/ops/CONTEXT_REFRESH.md** – context refresh schedule, jobs, retention/archival rules
- **docs/ops/MODEL_STRATEGY.md** – cheap vs strong model guidance
- **docs/ops/MODEL_ROUTING_POLICY.md** – routing criteria, cost gates, fallback rules
- **docs/ops/MODEL_FALLBACK_CHAIN.md** – fallback order, triggers, retry/timeout interaction, escalation
- **docs/ops/BUDGET_POLICY.md** – thresholds + caps
- **docs/ops/COST_BUDGETS.md** – thresholds, alert routing, enforcement actions, reporting cadence
- **docs/ops/OPS_RUNBOOK.md** – incident response tiers
- **docs/DEPLOY_RUNBOOK.md** – production deploy/rollback operator guide (#197)
- **docs/PRODUCTION_CUTOVER.md** – hybrid deployment cutover reference (#191)
- **docs/OPENCLAW_LOCAL_INTEGRATION_SMOKE.md** – local OpenClaw smoke harness usage, checks, evidence artifacts, and regression test (#409)
- **docs/LOCAL_INTEGRATION_READY.md** – latest automated mission-control readiness snapshot generated from smoke artifacts

## Templates (workspace starters)
- **docs/templates/AGENTS.json** – AGENTS policy wiring template
- **docs/templates/HEARTBEAT.md** – HEARTBEAT template with policy links
- **docs/templates/task-queue.json** – task queue schema template (extended with mission metadata)
- **docs/templates/mission-brief.md** – mission brief template
- **docs/templates/mission-runner.md** – mission runner workflow template
- **docs/templates/role-card.md** – role card template
- **docs/templates/business-unit-registry.json** – business unit registry template
- **docs/templates/github-issue-template.md** – issue template (Goal/AC/Evidence/Close-out)
- **docs/templates/github-pr-template.md** – PR template (Issue link/verification)
- **docs/templates/gitlab-issue-template.md** – legacy alias pointing to GitHub issue template
- **docs/templates/gitlab-mr-template.md** – legacy alias pointing to GitHub PR template

## Implementation Design
- **docs/process/REQUIREMENTS.md** – detailed functional + non‑functional requirements
- **docs/process/API_Core_CRUD.md** – core CRUD endpoints + API conventions (M1)
- **docs/process/API_Documents_Notes.md** – documents + notes endpoints (versioning, tagging, search, soft‑delete) (M1)
- **docs/process/openapi-core.yaml** – OpenAPI (core)
- **docs/process/openapi-docs-notes.yaml** – OpenAPI (documents + notes)
- **docs/process/openapi-events.yaml** – OpenAPI (domain events + event store)
- **docs/process/DOMAIN_EVENTS_EVENT_STORE.md** – domain event envelope, event store, consumers, replay, DLQ, retention
- **docs/process/ARCHITECTURE.md** – system design & data flow
- **docs/process/MISSION_RUNTIME_STATE_MACHINE.md** – mission runtime + task queue state machine, SLA + telemetry
- **docs/process/CONFIG_PLAN.md** – file changes, directories, config guidance
- **docs/process/CONFIG_CHANGE_SAFETY.md** – safe config change protocol (Codex‑assisted)
- **docs/process/GATEWAY_POSTURES.md** – supported gateway configurations + firewall guidance
- **docs/ops/RELIABILITY_PLAYBOOK.md** – retry/timeout/taxonomy/degradation standards
- **docs/process/QUALITY_CHECKS.md** – output QA checks (format + completeness)
- **docs/process/FEEDBACK_LOOP.md** – feedback capture loop (thumbs up/down, revision requests, logging)
- **docs/process/STYLE_TEMPLATES.md** – standard templates for summaries, reports, incident notes, decision memos
- **docs/ops/DEGRADATION_POLICY.md** – degradation tiers, fallback behaviors, user messaging + approvals
- **docs/ops/TIMEOUT_POLICY.md** – connect/read/total timeout standards, overrides, logging
- **docs/ops/RETRY_POLICY.md** – retry tiers, backoff + jitter, cooldown, idempotency rules
- **docs/ops/ERROR_TAXONOMY.md** – detailed P0/P1/P2 criteria, response, alerting
- **docs/process/SCRIPT_SPECS.md** – script‑level specs (backup, monitor, logs, quota)
- **docs/process/WORKSPACE_ISOLATION.md** – per-agent workspace isolation policy + implementation + verification
- **docs/process/WORKFLOW_PATTERNS_ANTFARM.md** – Antfarm-derived workflow helper API + usage examples
- **SESSIONS_SPAWN_RETRY_WRAPPER.md** – sessions_spawn retry wrapper usage, logging, and integration points
- **SESSIONS_SPAWN_ANTFARM_PATTERNS.md** – Antfarm-inspired workflow patterns (fresh context, verification loop, retries)
- **TEST_COVERAGE_SPAWN_PATTERNS.md** – test coverage report for spawn pattern scripts
- **docs/CRON_SPECS.md** – cron job definitions & schedules
- **docs/process/METRICS_PLAN.md** – KPI definitions + collection approach
- **docs/process/TEST_PLAN.md** – verification & test cases
- **docs/process/ROLLOUT_PLAN.md** – phased rollout + rollback
- **docs/process/RISK_REGISTER.md** – risks, mitigation, owner
- **docs/process/DECISIONS.md** – locked defaults + ADRs

## Execution Packages
- **docs/process/IMPLEMENTATION_SPEC.md** – high‑level spec
- **docs/process/IMPLEMENTATION_TASKS.md** – task breakdown + acceptance criteria
- **docs/process/IMPLEMENTATION_READY.md** – implementation‑ready package (defaults locked)
- **docs/archive/TEST_RESULTS_2026-02-07.md** – full script test run outputs

## Ops / Decommissioning
- **docs/ops/OPENPROJECT_DECOMMISSION.md** – checklist + verification steps to remove OpenProject integration

## Research Notes
- **docs/archive/TWITTER_CONFIG_RESEARCH_2026-02-07.md** – external config patterns & learnings
- **docs/CLOSED_LOOP_NOTES_2026-02-07.md** – closed‑loop execution patterns
- **docs/archive/SPACEPIXEL_THREE_LAYER_MEMORY_NOTES_2026-02-07.md** – three‑layer memory system

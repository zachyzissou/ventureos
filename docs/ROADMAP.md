# VentureOS – Roadmap

## Phase 0 – Foundation (Week 1)
**Objective:** get the core project organized and measurable.
- ✅ Project plan and backlog created
- ✅ Basic workflow definition
- ✅ Metrics defined (tracking pending)

## Phase 0.5 – Policy & Ops (Week 1)
**Objective:** set guardrails, proactive rules, and ops baselines.
- ✅ Goals + constraints brief (deep onboarding)
- ✅ Guardrails + proactive mode rules
- ✅ Model strategy + quota caps
- ✅ Monitoring + backup + update cadence defined
- ✅ Restore workflow + task‑run retention + archive job spec
- ✅ Templates + docs‑lint CI

## Phase 1 – Reliability (Weeks 2–3)
**Objective:** reduce failures, increase consistency.
**Status:** 🟡 In Progress

### Completed
- ✅ Reliability playbook (retry/backoff, timeouts, taxonomy, graceful degradation)
- ✅ Helper scripts: `retry.sh`, `with-timeout.sh`, `guarded-run.sh`
- ✅ Payload hardening applied to Bloom PR Monitor

### In Progress
- 🔄 **Issue #48 [P0]**: Complete Phase 1 Reliability Implementation
  - Apply guarded execution pattern to all cron jobs
  - Standardize network timeouts and retries
  - Complete degradation matrix documentation

## Phase 2 – Proactive Engine + Mission Control (Weeks 4–5)
**Objective:** agent anticipates work and runs VentureOS missions.
**Status:** 🟡 Planning Complete, Implementation Starting

### Completed
- ✅ Proactive Engine design (SLA tiers, scheduler rules)
- ✅ VentureOS/Mission Control docs integrated (roles, squads, business units, templates)
- ✅ Task queue schema designed with mission metadata support
- ✅ 20-role roster defined

### Next Steps
- 🔄 **Issue #49 [P0]**: Seed Business Unit Registry
  - Create `~/clawd/runtime/business-units.json`
  - Link initial portfolio units to Obsidian
- 🔄 **Issue #50 [P0]**: Create Core Role Cards
  - 10 role cards for Echo, Sentinel, Verifier, Archivist, etc.
  - Define squad composition patterns
- 🔄 **Issue #51 [P1]**: Implement Mission Runner Workflow
  - Mission brief → squad execution → gates → artifacts
- 🔄 **Issue #52 [P1]**: Phase 2 Queue Integration - Mission Metadata
  - Extend task queue with businessUnit, missionType, role fields
  - Portfolio-aware routing and logging

## Phase 3 – Quality Upgrades (Weeks 6–7)
**Objective:** raise output quality in all core workflows.
**Status:** 🔵 Planned

### Defined Work
- 🔄 **Issue #53 [P1]**: Output QA Framework
  - Format validators (markdown, JSON schema)
  - Completeness checks (required sections, metadata)
  - Quality scoring rubric
  - Integration with Verifier role

### Additional Goals
- Style guides for summaries and responses
- User feedback loop (thumbs up/down)
- Quality scoring + continuous improvement

## Phase 4 – Workflow Acceleration (Weeks 8–9)
**Objective:** reduce manual steps for common tasks.
**Status:** 🔵 Planned

### Defined Work
- 🔄 **Issue #54 [P2]**: Workflow Acceleration - 1-Command Workflows
  - NewCo Sprint, Content Batch, Deploy Check, Weekly Review, Incident Response
  - Reusable macro system
  - Batch processing support

### Additional Goals
- Shortcut command library
- Common task templates
- Multi-step workflow recorder

## Phase 5 – Autonomy Optimization (Weeks 10–12)
**Objective:** make automation more durable and intelligent.
**Status:** 🔵 Planned

### Defined Work
- 🔄 **Issue #55 [P2]**: Enhanced Model Routing - Smart Selection
  - Multi-factor scoring (complexity, quota, priority, time)
  - Quota-aware routing (90% threshold → cheap model)
  - Fallback chain implementation
  - Business unit priority overrides

### Additional Goals
- Self‑healing patterns
- Dependency health checks
- Adaptive learning from failures

---

## Current Sprint Focus (Feb 2026)
**Priority**: Complete Phase 1 Reliability, Begin Phase 2 Foundation

### This Week
1. **[P0] Issue #48**: Complete reliability rollout to all workflows
2. **[P0] Issue #49**: Seed business unit registry
3. **[P0] Issue #50**: Create core role cards

### Next Week
4. **[P1] Issue #52**: Queue integration with mission metadata
5. **[P1] Issue #51**: Mission runner workflow implementation

---

## Issue Tracking
All implementation work tracked in GitLab issues:
- **P0 (Critical)**: Issues #48, #49, #50
- **P1 (High Priority)**: Issues #51, #52, #53
- **P2 (Medium Priority)**: Issues #54, #55

---

**Security work is intentionally deferred** to a later phase.

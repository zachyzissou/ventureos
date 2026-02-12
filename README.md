# VentureOS

**Tagline:** A venture‑studio operating system built on OpenClaw — mission control, business units, and quality gates without sacrificing safety.

## Current Status 🟡

**Phase:** Transitioning from Phase 1 (Reliability) to Phase 2 (Mission Control)  
**Last Updated:** February 11, 2026

### Recent Milestones ✅
- ✅ Phase 0.5 complete: Policy docs, guardrails, monitoring, backups
- ✅ Reliability playbook complete: retry/backoff, timeouts, error taxonomy
- ✅ VentureOS/Mission Control design complete: 20-role roster, business units, mission templates
- ✅ Task queue architecture defined with mission metadata support

### Active Sprint 🔄
**Focus**: Complete reliability rollout, begin mission control foundation

**P0 Issues (This Week):**
- **#48**: Complete Phase 1 Reliability Implementation
- **#49**: Seed Business Unit Registry
- **#50**: Create Core Role Cards (Echo, Sentinel, Verifier, Archivist, etc.)

**P1 Issues (Next):**
- **#51**: Implement Mission Runner Workflow
- **#52**: Phase 2 Queue Integration - Mission Metadata
- **#53**: Output QA Framework

**View All Issues:** [GitLab Issues](http://slurpnet:9080/zachgonser/ventureos/-/issues)

---

## Why this exists
VentureOS turns one operator into a **portfolio builder**: ideate, validate, build, and operate multiple business lines (games, apps, media brands) with repeatable quality. The OpenClaw foundation provides reliability + proactive scheduling; VentureOS adds the **operating model** on top.

## Guiding Principles
- **Quality over speed** for core workflows.
- **Autonomy with guardrails** — automation that is powerful but reversible.
- **Repeatable missions** — same inputs → same artifacts every time.
- **Safety by design** — approvals for publishing, payments, and destructive actions.
- **Progressive enhancement** — small deploys, no risky monolith changes.

## Core Goals
1. **Portfolio scalability** via Business Units and Mission Control.
2. **Reliable execution** (retries, timeouts, clear error taxonomy).
3. **Higher‑quality outputs** with QA gates and artifact standards.
4. **Lower friction** for common workflows and batching.
5. **Proactive workflow** that pulls work forward.

## Architecture Overview

### Business Units
Portfolio containers for games, apps, media brands, and infrastructure. Each unit has:
- Goals & KPIs
- Brand voice/style constraints
- Repositories & services
- Risk posture (approval requirements)
- Link to canonical Obsidian strategy notes

### Missions
Atomic units of trusted work with:
- Single objective & explicit deliverables
- Assigned squad (specialized roles)
- Safety & QA gates (Sentinel, Verifier)
- Durability step (Archivist)
- Full audit trail

### Multi-Agent System
20 specialized roles compose into squads:
- **Echo**: Chief orchestrator
- **Sentinel**: Governance/safety/IP gate
- **Verifier**: QA/release gate
- **Archivist**: Knowledge management & durability
- **Atlas**: Infrastructure & operations
- **Venture**: Business strategy
- **Synth**: AI content generation
- _...and 13 more specialized roles_

## Scope (Security deferred)
Security hardening is **out of scope for this phase** and will be revisited later. The focus now is product‑level quality and execution.

## Repository Layout
- `docs/DOC_INDEX.md` – index of all guidance docs
- `docs/STATUS.md` – current implementation status
- `docs/ROADMAP.md` – milestone‑level roadmap with issue tracking
- `docs/PROJECT_PLAN.md` – delivery plan, milestones, and execution details
- `docs/FEATURE_BACKLOG.md` – detailed feature list and ownership
- `docs/roles/` – role card definitions
- `docs/templates/` – mission briefs, role cards, business unit registry
- `scripts/` – automation scripts and helpers
- `runtime/` – task queue, business unit registry, logs

## Where strategy lives
- **Obsidian** is canonical for long‑horizon strategy and Business Unit notes.
- This repo is for ops, workflows, scripts, and durable execution artifacts.

## CI / Docs Lint
- GitLab CI runs `scripts/docs-lint.py` to detect broken links and placeholder markers.

## How to use this repo
- Use the issues as the source of truth for implementation.
- Align work to milestones in the roadmap.
- Keep PRs small and tightly scoped.
- All issues tracked in GitLab: [View Issues](http://slurpnet:9080/zachgonser/ventureos/-/issues)

## Quick Links
- **[Roadmap](docs/ROADMAP.md)** - Phase progress and issue tracking
- **[Status](docs/STATUS.md)** - Detailed implementation status
- **[Documentation Index](docs/DOC_INDEX.md)** - All docs catalog
- **[GitLab Issues](http://slurpnet:9080/zachgonser/ventureos/-/issues)** - Active work tracking

---

If this project is done right, VentureOS becomes a durable, dependable operating system — not just a clever tool.

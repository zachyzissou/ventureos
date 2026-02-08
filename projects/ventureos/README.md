# VentureOS

**Tagline:** A venture‑studio operating system built on OpenClaw — mission control, business units, and quality gates without sacrificing safety.

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

## Scope (Security deferred)
Security hardening is **out of scope for this phase** and will be revisited later. The focus now is product‑level quality and execution.

## Repository Layout
- `docs/DOC_INDEX.md` – index of all guidance docs
- `docs/roles/REPO_CHARTER.md` – VentureOS charter + scope boundaries
- `docs/process/STATUS.md` – current implementation status
- `docs/process/ROADMAP.md` – milestone‑level roadmap
- `docs/process/PROJECT_PLAN.md` – delivery plan, milestones, and execution details
- `docs/process/FEATURE_BACKLOG.md` – detailed feature list and ownership

## Docs Structure
- `docs/roles/` – org structure, mission control, workflow primitives
- `docs/process/` – plans, specs, architecture, implementation, QA
- `docs/ops/` – policy, reliability, budgets, runbooks
- `docs/templates/` – starter templates + schemas
- `docs/archive/` – research notes + test results

## Where strategy lives
- **Obsidian** is canonical for long‑horizon strategy and Business Unit notes.
- This repo is for ops, workflows, scripts, and durable execution artifacts.

## How to use this repo
- Use the issues as the source of truth for implementation.
- Align work to milestones in the roadmap.
- Keep PRs small and tightly scoped.

---

If this project is done right, VentureOS becomes a durable, dependable operating system — not just a clever tool.

# Business Units — Registry + Operating Rules

A **Business Unit** is a named, durable container that makes VentureOS scalable.

Instead of “one giant assistant that does everything,” we maintain multiple units with their own:
- goals and KPIs
- brand voice/style constraints
- repositories, services, and automations
- canonical strategy notes (Obsidian)
- risk posture (what requires approval)

This matters immediately for:
- scaling **StantonTimes** into multiple related accounts/brands
- running multiple products (Unity games, apps, tools)
- keeping infra and AI pipelines stable while the portfolio expands

---

## Business Unit Registry
The registry is a simple, auditable source of truth.

Recommended storage:
- Repo template: `docs/templates/business-unit-registry.json`
- Workspace runtime copy: `~/clawd/runtime/business-units.json`
- Canonical strategy pages: Obsidian links stored in each unit record

### Required fields (minimum viable)
- `id` — short stable identifier (slug)
- `name` — human-readable
- `category` — media | game | app | infra | consulting | research
- `owner_role` — usually Helmsman or Producer
- `risk` — what actions require explicit approval
- `canonical_notes` — Obsidian note paths/URIs
- `automations` — cron jobs, monitors, pipelines

### Suggested fields (useful as portfolio grows)
- `kpis` — list of measurable targets
- `cadence` — review cycle (weekly/monthly)
- `channels` — where drafts/alerts go
- `repos` — git URLs/paths
- `services` — docker stacks, endpoints
- `data_sources` — feeds, APIs, sources of truth

---

## Multi‑account pattern (StantonTimes network)
Treat each account as:
- a **Business Unit** (for fully independent brands), or
- a **Unit Instance** inside a parent network (when sharing policy + tooling)

Recommended approach:
- **Parent unit:** `stantontimes-network`
- **Child units:** `stantontimes-sc`, `stantontimes-bloom`, `stantontimes-dev`, etc.

Each child unit should isolate:
- state files (avoid race conditions and cross-posting)
- source lists
- brand voice constraints
- approval routing

---

## Example units (seed set)
These are examples; the registry is designed to be renamed without breaking history.

### 1) StantonTimes Network
- Category: media
- Canon: Obsidian project notes + brand kit
- Automations: monitors, approvals, publishing drafts, engagement queues

### 2) Low Noise Studios (Unity)
- Category: game
- Canon: game design docs + style bible + pipeline notes
- Automations: repo monitoring, build checks, asset pipeline batch jobs

### 3) App Studio
- Category: app
- Canon: product specs, UX patterns, reusable components
- Automations: backlog grooming, release notes drafts, QA gates

### 4) Infra / AI Lab
- Category: infra
- Canon: runbooks, service maps, model serving roadmap
- Automations: backups, monitoring, capacity checks

---

## How Business Units integrate with the Proactive Engine
When a job is enqueued or a mission is planned, it should carry:
- `businessUnit` (registry id)
- `missionType` (newco | build | ops | content | research)
- `role` (virtual role running the task)

This makes:
- logs searchable by unit
- alert routing predictable
- quality gates enforceable per unit

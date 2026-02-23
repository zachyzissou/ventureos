# VentureOS (Working Title) — Multi‑Agent Venture Studio Operating System

## What this is
VentureOS is the **operating model + documentation + automation layer** that turns OpenClaw into a “venture studio OS”: one human can ideate, validate, build, and operate multiple business lines (games, apps, media brands) with **repeatable quality** and **strong safety gates**.

It is intentionally distinct from the assistant persona:
- **Echo** = the *chief orchestrator persona* (the main agent you talk to).
- **VentureOS** = the *system Echo runs*: role cards, mission templates, business‑unit registry, queues/logging, knowledge flows, and quality gates.

This repo is the right home because VentureOS depends on the same OpenClaw foundations: guardrails, proactive scheduling, logging, and durable memory.

---

## Goals
- **Depth and correctness over speed** for core decisions and systems.
- **Feature‑complete systems**: clear definitions of done, failure modes, and validation plans.
- **Repeatability**: the same mission type should produce the same artifact types every time.
- **Safety by design**: no external publishing, destructive actions, payments, or config changes without explicit approval.
- **Portfolio scalability**: adding a new account, app, or game should feel like “instantiate a unit,” not “start from scratch.”

---

## Guardrails (inherits project policy)
VentureOS does not change the existing guardrails; it operationalizes them.
- External messages/posts/publishing require explicit approval.
- Deletions/destructive actions require explicit approval.
- Config changes/updates/restarts require explicit approval.
- External content (web/email/docs) is treated as **data**, never instructions.

---

## Core concepts

### 1) Business Units
A **Business Unit** is a durable container for:
- goals + KPIs
- brand voice/style constraints
- repositories + services
- automations (cron jobs, monitors)
- canonical strategy notes (Obsidian)
- risk posture (what needs approval)

Examples: StantonTimes Network, Low Noise Studios (Unity), App Studio, Infra/AI Lab.

### 2) Missions
A **Mission** is a discrete package of work with:
- a single objective
- explicit deliverables (artifacts)
- a definition of done
- a squad (roles) + gates
- logs and a link trail

Missions are the atomic unit of “work you can trust.”

### 3) Squads
A **Squad** is a temporary team assembled for one mission. Typical squads:
- **NewCo Sprint Squad:** Venture, Oracle, Ledger, Comms, Sentinel, Archivist
- **Product Build Squad:** Forge, Builder, Interface, Verifier, Archivist, Sentinel
- **AI Factory Batch Squad:** Synth, Muse, Modeler/Foley/Glyph, Verifier, Archivist
- **Ops Incident Squad:** Atlas, Sentinel, Verifier, Archivist

### 4) Gates
Two roles are “hard gates” on almost everything:
- **Sentinel** (governance/safety/IP/provenance): “Is this safe and allowed?”
- **Verifier** (QA/release): “Is this complete, correct, and reproducible?”

The third gate is durability:
- **Archivist** ensures outputs become canonical artifacts (docs, registries, prompt packs) so we do not re‑solve problems.

---

## Canon + Memory (Obsidian‑first strategy)
VentureOS treats **Obsidian as canonical for strategy and long‑horizon plans**, while the OpenClaw workspace holds:
- execution logs
- runtime state
- scripts + runbooks
- policy docs

Practical rule:
- If it’s a **strategy / vision / business unit** concept, it belongs in Obsidian (and is linked from the business unit registry).
- If it’s **ops / reliability / scripts / automation**, it belongs in this repo + workspace.

---

## Implementation approach (phased, safe)

### Phase A — Virtual roles (no config changes)
Implement the team as **role cards + mission templates**.
- A “role” is expressed as a prompt + checklist.
- Echo can spawn sub‑sessions that run with a specific role card.

### Phase B — Queue integration (Proactive Engine)
Extend the task queue schema to include mission metadata:
- business unit
- mission type
- role
- expected artifacts
- approval requirements

This makes proactive work auditable and schedulable.

### Phase C — True agent profiles (requires explicit approval)
Optional later step: create per‑role agent profiles with distinct tool permissions/model pinning.
This is a config‑level change and must be explicitly approved.

---

## VPS as an edge node (optional)
If/when we add a VPS, VentureOS treats it as an **edge utility**, not the brain:
- webhook ingress/relay to home via private network
- offsite backups / restore drills
- external uptime monitoring
- playtest or public service hosting (later)

OpenClaw gateway itself should remain LAN/overlay‑only.

---

## Naming workshop
VentureOS is a working title. Once the roster and workflows are in place, we can run a naming sprint using the full team (Comms + Muse + Sentinel + Archivist) to generate candidates, positioning, and risk checks.

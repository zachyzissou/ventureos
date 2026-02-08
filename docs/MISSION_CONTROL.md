# Mission Control — How VentureOS Runs Work

Mission Control is the execution layer that turns “an idea” into **auditable, gated, durable work**.

Core rule: **a mission is not complete until its artifacts exist and are linked.**

---

## Mission lifecycle

1) **Intake** (Echo)
- capture the objective
- assign a business unit
- choose mission type

2) **Plan** (Echo + Producer)
- write a Mission Brief
- assemble a squad (roles)
- define deliverables + definition of done

3) **Execute** (Squad)
- specialists produce artifacts
- Echo merges and resolves conflicts

4) **Gates** (Sentinel + Verifier)
- Sentinel: guardrails, risk, provenance, approval needs
- Verifier: completeness, correctness, reproducibility

5) **Archive + Register** (Archivist)
- store artifacts in the right place
- link from the business unit registry
- record mission outcomes for reuse

---

## Mission types (standard)

### NewCo Sprint
**Purpose:** generate and validate a new business/product idea.
- Squad: Venture, Oracle, Ledger, Comms, Sentinel, Archivist
- Artifacts: scorecard, validation plan, MVP spec, positioning draft

### Product Build Sprint
**Purpose:** ship a vertical slice or feature set (game or app).
- Squad: Forge, Builder, Toolsmith, Interface, Verifier, Archivist, Sentinel
- Artifacts: spec, implementation plan, QA matrix, code changes

### Content Ops Cycle
**Purpose:** operate a media brand safely (draft-first, approval gates).
- Squad: Comms, Oracle, Sentinel, Verifier, Archivist
- Artifacts: content calendar, draft batch, sourcing notes, approval checklist

### Ops Incident
**Purpose:** restore reliability and document the fix.
- Squad: Atlas, Sentinel, Verifier, Archivist
- Artifacts: incident report, fix plan, runbook update, regression check

### AI Factory Batch
**Purpose:** generate assets (image/3D/audio/writing) with reproducibility.
- Squad: Synth, Muse, Glyph/Foley/Modeler, Verifier, Archivist
- Artifacts: prompt pack, batch manifest, QA notes, import/usage instructions
- **Batch framework:** see **BATCH_PROCESSING.md** for manifest, chunking, retry, and rollback requirements

---

## Artifact standards
Every mission produces at least:
- **Mission Brief** (template in `docs/templates/mission-brief.md`)
- **Deliverable artifacts** (specs, prompts, code, drafts)
- **Decision memo** when tradeoffs exist
- **Verification notes** (what was checked, what remains risky)

Where to store:
- Strategy, long-horizon context: Obsidian
- Ops scripts, policies, runbooks: this repo + workspace
- Runtime state + logs: `~/clawd/runtime/`

---

## How we implement roles today
We start with **virtual roles**:
- each role has a role card (checklist + output format)
- Echo spawns sub‑sessions with instructions like:
  - “ROLE: Oracle — produce a sourced market teardown for X”
  - “ROLE: Ledger — produce unit economics scenarios for X”

This gets us 80% of the benefit without config changes.

---

## Workflow Commands (1‑command entrypoints)
Common operator actions should be callable via **single commands** with consistent args, prechecks, and safety gates. These are defined in **WORKFLOW_COMMANDS.md** and serve as the default entrypoints for manual ops and future automation.

Mission Control should prefer these commands when building runbooks or mission steps.

---

## Proactive Engine integration
When we enqueue mission work, we include mission metadata in the queue item:
- business unit id
- mission type
- role
- expected artifacts
- whether explicit approval is required

This creates an execution trail and makes future “mission control dashboards” possible.

# Mission Runner Workflow (Template)

## Purpose
A lightweight, repeatable workflow for running VentureOS missions end‑to‑end with clear ownership, gates, and durable artifacts. This aligns to **MISSION_CONTROL.md** and the role cards (Echo, Sentinel, Verifier, Archivist, etc.).

---

## Lifecycle Overview
| Phase | Owner(s) | Required Artifacts | Handoff To |
| --- | --- | --- | --- |
| **1) Intake** | Echo | Mission brief **draft** (objective, BU, mission type), constraints | Echo (Plan) |
| **2) Plan** | Echo (+ Producer if assigned) | **Mission Brief (complete)**, squad roster, definition of done | Squad (Execute) |
| **3) Execute** | Squad roles | Deliverable artifacts, decision memo (if tradeoffs), execution notes | Echo → Gates |
| **4) Gates** | Sentinel + Verifier | Risk/provenance log, QA results, go/hold decisions | Archivist + Echo |
| **5) Archive + Register** | Archivist | Canonical docs + links, registry updates, provenance | Mission Closeout |

---

## Phase Details

### 1) Intake (Echo)
**Objective:** capture the mission objective, business unit, and mission type.
- **Inputs:** requester objective, constraints/approvals, context links
- **Required artifacts:**
  - Mission brief **draft** (Summary, BU, Mission Type, Objective, Constraints)
- **Output:** ready‑to‑plan mission brief and a scoped objective
- **Handoff:** Echo → Plan

### 2) Plan (Echo + Producer)
**Objective:** define scope, deliverables, roles, and definition of done.
- **Inputs:** mission brief draft, constraints, available roles
- **Required artifacts:**
  - **Mission Brief (complete)** using `docs/templates/mission-brief.md`
  - Squad roster with responsibilities
  - Deliverables list + Definition of Done
  - Preliminary risk list (for Sentinel review)
- **Output:** approved plan and a staffed squad
- **Handoff:** Echo → Squad (Execute)

### 3) Execute (Squad)
**Objective:** produce the required artifacts and resolve conflicts.
- **Inputs:** mission brief, squad assignments, dependencies
- **Required artifacts:**
  - Deliverable artifacts (specs, drafts, code, prompts, etc.)
  - **Decision memo** if tradeoffs exist
  - Execution notes with links/citations
- **Output:** deliverables ready for gates
- **Handoff:** Squad → Echo → Gates

### 4) Gates (Sentinel + Verifier)
**Objective:** ensure safety, provenance, and quality before completion.
- **Inputs:** deliverables, decision memo, risk list
- **Required artifacts:**
  - Sentinel **go/hold** assessment + risk/provenance log
  - Verifier **QA plan/results** + release readiness call
- **Output:** explicit go/hold decisions with rationale
- **Handoff:** Gates → Archivist + Echo

### 5) Archive + Register (Archivist)
**Objective:** make the mission durable and discoverable.
- **Inputs:** final artifacts + gate outputs
- **Required artifacts:**
  - Canonical docs stored in repo/Obsidian as appropriate
  - Registry/index updates (business unit registry, doc index)
  - Provenance links and decision logs
- **Output:** mission closeout package with all links
- **Handoff:** Archivist → Echo/Requester (closeout)

---

## Required Artifacts (Minimum)
- **Mission Brief** (`docs/templates/mission-brief.md`)
- **Deliverable artifacts** (specs, code, drafts, prompts, etc.)
- **Decision memo** (required when tradeoffs exist)
- **Verification notes** (what was checked, results, remaining risks)
- **Provenance notes** for external data/assets

**Storage guidance (from MISSION_CONTROL):**
- Strategy / long‑horizon: Obsidian
- Ops scripts, policies, runbooks: this repo
- Runtime state/logs: `~/clawd/runtime/`

---

## Handoff Expectations Between Roles
- **Echo → Squad:** mission brief, deliverables list, definition of done, constraints
- **Squad → Echo:** artifacts + execution notes + unresolved questions
- **Echo → Sentinel/Verifier:** artifact bundle + risk list + acceptance criteria
- **Sentinel/Verifier → Archivist:** gate results + go/hold decisions
- **Archivist → Echo/Requester:** final link list + registry updates

---

## Lightweight Mission Runner Checklist
- [ ] **Intake:** Objective + BU + mission type captured
- [ ] **Plan:** Mission brief complete; squad rostered; DoD defined
- [ ] **Execute:** Deliverables produced; decision memo (if needed)
- [ ] **Gates:** Sentinel go/hold recorded; Verifier QA results logged
- [ ] **Archive:** Artifacts stored; indexes/registries updated; links shared

---

## Example Mission Brief (filled)
**Mission Brief: Product Build Sprint — “Mission Runner Artifacts”**

**Summary:** Deliver a repeatable mission‑runner workflow doc and template so squads can run missions consistently.

**Business Unit**
- **id:** core‑ops
- **name:** VentureOS Core Ops

**Mission Type:** build

**Objective:** Publish a mission‑runner workflow template and checklist aligned with Mission Control and role cards.

**Constraints:**
- No config changes or destructive actions
- Docs‑only changes

**Squad (Roles):**
- Echo (Mission Control): orchestration + merge
- Sentinel: safety/IP/provenance gate
- Verifier: QA gate
- Archivist: durability + linking

**Deliverables (Artifacts):**
- [ ] `docs/templates/mission-runner.md` workflow template
- [ ] `docs/DOC_INDEX.md` updated to include the template

**Definition of Done:**
- Template includes lifecycle, gates, handoffs, and checklist
- Example mission brief included
- Doc index updated with new template entry

**Risks + Mitigations:**
- Risk: misalignment with Mission Control → Mitigation: cross‑check role cards + MISSION_CONTROL

**Links / Sources:**
- Repo paths: `docs/MISSION_CONTROL.md`, `docs/roles/*.md`

**Approval Required:** None

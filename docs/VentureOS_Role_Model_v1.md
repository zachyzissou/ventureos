# VentureOS Role Model v1

Date: 2026-03-16
Version: v1.0
Scope: normative role architecture for VentureOS operating lanes, capability overlays, and delegated specialist roles.

## 1) Purpose

This document defines the canonical VentureOS role model.

It replaces the previous mix of:
- department lane language
- legacy runtime agent names
- older themed or stylistic role labels

Authority, ownership, and access control in VentureOS must derive from the canonical role model defined here.

## 2) Role model layers

VentureOS roles are defined across four layers.

### Layer 1: Organizational scope

The department or cross-cutting function that owns the work.

Canonical scopes:
- `executive_office`
- `operations`
- `data_analytics`
- `finance`
- `product`
- `engineering`
- `design`
- `marketing`
- `sales`
- `customer_success`
- `legal`
- `it_security`
- `hr`
- `trust_evidence`
- `game_development`

### Layer 2: Lane type

The authority shape of the work.

Canonical lane types:
- `director`
- `operator`
- `auditor`

### Layer 3: Capability overlay

A functional operating identity used inside a lane. Capability overlays specialize execution, but do not widen authority.

### Layer 4: Authority class

The final authority band.

Canonical authority classes:
- `delegated_agent`
- `control_plane`
- `human_final_arbiter`

## 3) Canonical naming rules

Use these identifiers everywhere in normative docs, policy data, and future enforcement code:
- lane binding: `<scope>:<lane_type>`
- capability overlay: `<capability_id>`
- subordinate specialist: `<specialist_id>`

Examples:
- `operations:operator`
- `executive_office:director`
- `venture_control`
- `venture_game_director`
- `game_systems`

Legacy runtime names are not normative identifiers.

## 4) Canonical capability overlays

| Capability ID | Display name | Primary purpose | Authority class |
|---|---|---|---|
| `venture_strategy` | Venture Strategy | strategic translation, portfolio priorities, dependency direction | `control_plane` |
| `venture_control` | Venture Control | operating cadence, blocker routing, task/control coordination | `control_plane` |
| `venture_evidence` | Venture Evidence | evidence certification, audit findings, gate decisions | `delegated_agent` |
| `venture_research` | Venture Research | research, synthesis, decision support | `delegated_agent` |
| `venture_infrastructure` | Venture Infrastructure | infrastructure, platform reliability, and systems hardening | `delegated_agent` |
| `venture_security` | Venture Security | security enforcement and escalation | `delegated_agent` |
| `venture_delivery` | Venture Delivery | implementation and integration throughput | `delegated_agent` |
| `venture_memory` | Venture Memory | knowledge retention, runbooks, and continuity | `delegated_agent` |
| `venture_signals` | Venture Signals | monitoring and anomaly detection | `delegated_agent` |
| `venture_comms` | Venture Comms | stakeholder-facing communication and summaries | `delegated_agent` |
| `venture_game_director` | Venture Game Director | game direction across systems, technical feasibility, player experience, and delegated specialist work | `delegated_agent` |
| `human_arbiter` | Human Arbiter | final override and irreversible approvals | `human_final_arbiter` |

## 5) Game development role model

### First-class game capability

VentureOS introduces one first-class game-specific capability overlay:
- `venture_game_director`

This role is a master-level game development operator with the ability to direct subordinate specialists. It is not a pure coordinator role.

The Venture Game Director is expected to reason across:
- gameplay systems
- technical implementation feasibility
- world and content coherence
- user experience and onboarding
- quality and playability
- production sequencing for game features

### Subordinate game specialists

These specialist roles are subordinate to the Venture Game Director and are not top-level capability overlays at this stage:
- `game_systems`
- `game_technical`
- `game_world`
- `game_interface`
- `game_art`
- `game_audio`
- `game_qa`

### Delegation rules

- `venture_game_director` may direct any subordinate game specialist.
- Subordinate game specialists inherit the scope and authority limits of the parent lane binding.
- A specialist may narrow authority, but never widen it.
- `game_qa` may recommend rejection or remediation, but formal gate authority remains with the assigned Auditor lane unless explicitly bound otherwise.

## 6) Default role bindings

### Cross-cutting defaults

- `executive_office:operator` -> `venture_strategy`
- `operations:operator` -> `venture_control`
- `trust_evidence:auditor` -> `venture_evidence`

### Game development defaults

- `game_development:director` -> `venture_game_director`
- `game_development:operator` -> no required top-level overlay; may use one subordinate specialist at a time
- `game_development:auditor` -> may consume `game_qa` specialist outputs, but formal acceptance remains at the Auditor lane level

## 7) Legacy alias policy

Legacy runtime names and older stylistic labels may remain as compatibility aliases only.

They must not be used as the source of truth for:
- approvals
- ownership
- access control
- readiness decisions
- SLA enforcement

Legacy names should be translated to canonical VentureOS capability IDs through the role registry.

## 8) Decision rights and boundaries

- Organizational scope defines who owns the work.
- Lane type defines what category of authority is being exercised.
- Capability overlays define how the work is specialized.
- Authority class defines who may finalize, approve, or override.

No capability overlay or subordinate specialist may widen baseline lane authority.

## 9) Runtime and UI integration note

Current runtime surfaces may still carry older names or identifiers for compatibility.

Those runtime labels should be treated as presentation aliases only. Future UI and policy enforcement work must reference:
- canonical lane bindings
- canonical capability overlays
- canonical subordinate specialist IDs

## 10) Change control

Any change to the canonical VentureOS role model must update the machine-readable registry in `docs/VentureOS_Agent_Role_Registry_v1.json` in the same change.

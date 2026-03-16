# Multi-Agent Team (VentureOS) — Legacy Roster Reference

This document is a transitional compatibility reference.

It is not the normative VentureOS role model. The canonical sources are:
- `docs/VentureOS_Role_Model_v1.md`
- `docs/VentureOS_Agent_Role_Registry_v1.json`
- `docs/VentureOS_RBAC_Spec_v1.md`
- `docs/VentureOS_Tool_Access_Matrix_v1.json`

Use this file only to understand how older role labels map into the current VentureOS structure.

## Current implementation note

- OpenClaw may still expose a single configured primary profile in some environments.
- Historical agent names can still appear in prompts, role cards, dashboards, or session data.
- Those labels should be treated as compatibility aliases, not as authority, ownership, or permission identifiers.

## Legacy roster to canonical VentureOS mapping

| Legacy label | Historical purpose | Canonical VentureOS target |
|---|---|---|
| `Echo` | mission control / chief of staff orchestration | `venture_strategy` under `executive_office:operator` |
| `Nexus` | control-plane routing and coordination | `venture_control` under `operations:operator` |
| `Oracle` | research and decision support | `venture_research` |
| `Atlas` | infrastructure and platform execution | `venture_infrastructure` |
| `Sentinel` | security and safety review | `venture_security` |
| `Verifier` | evidence, QA, and gate checks | `venture_evidence` |
| `Archivist` | memory, documentation, and continuity | `venture_memory` |
| `Synth` | implementation and creative production throughput | `venture_delivery` |
| `Scout` | monitoring and signal capture | `venture_signals` |
| `Liaison` / `Comms` | communication packaging and stakeholder output | `venture_comms` |
| `Helmsman` | strategic portfolio framing | `venture_strategy` with executive lane ownership |
| `Producer` | program sequencing and delivery coordination | `venture_control` with operations lane ownership |
| `Ledger` | finance and business-operations analysis | `finance:*` lane bindings |
| `Venture` | incubator / new-company exploration | `product:*` or `executive_office:*` depending on scope |

## Legacy game specialist mapping

The game-development model is now centered on `venture_game_director` with subordinate specialists. Historical specialist labels map as follows:

| Legacy label | Canonical target |
|---|---|
| `Forge` | `game_technical` |
| `Builder` | `game_technical` |
| `Toolsmith` | `game_technical` |
| `Interface` | `game_interface` |
| `Mechanic` | `game_systems` |
| `Muse` | `game_art` |
| `Glyph` | `game_world` |
| `Foley` | `game_audio` |

Formal authority for game-development work still derives from lane bindings such as:
- `game_development:director`
- `game_development:operator`
- `game_development:auditor`

## Operating rule

When updating docs, permissions, readiness gates, or enforcement code:
- use canonical lane bindings
- use canonical capability IDs
- use canonical specialist IDs
- do not introduce new themed or legacy labels as source-of-truth identifiers

# VentureOS Role Cards

## What This Is

A structured agent identity system for VentureOS. Each role card defines an agent's scope, handoff contracts, non-negotiables, escalation policy, operating metrics, and working voice.

## Files

| File | Contents |
|------|----------|
| `00-SCHEMA.md` | Schema documentation for the 10-layer role card model |
| `schema.ts` | TypeScript interfaces, validation, and `SOUL.md` generator |
| `01-echo.ts` | Echo — Strategy Lead |
| `02-nexus.ts` | Nexus — Program Controller |
| `03-oracle.ts` | Oracle — Research Lead |
| `04-atlas.ts` | Atlas — Infrastructure Lead |
| `05-sentinel.ts` | Sentinel — Security Lead |
| `06-verifier.ts` | Verifier — Quality Lead |
| `07-archivist.ts` | Archivist — Knowledge Lead |
| `08-synth.ts` | Synth — Delivery Lead |
| `09-scout.ts` | Scout — Signals Lead |
| `10-liaison.ts` | Liaison — Communications Lead |
| `11-voice-directives.md` | Voice and conflict-resolution guidelines |
| `12-affinity-matrix.md` | Key pairwise collaboration affinities |
| `13-implementation.md` | Implementation and rollout guidance |

## The Schema: 10 Layers

### Operating Contract
1. **Domain Scope** — what territory the agent owns
2. **Operating Channels** — what goes in, what comes out
3. **Completion Contract** — exit criteria and handoff shape

### Risk and Escalation
4. **Hard Boundaries** — absolute prohibitions with rationale
5. **Escalation Policy** — when to hand off and to whom
6. **Performance Metrics** — measurable operating standards

### VentureOS Extensions
7. **Voice Profile** — communication style and conflict handling
8. **Affinity Map** — pairwise trust/collaboration scores
9. **Tool Access** — tools and skills the agent can invoke
10. **State Model** — persistent and volatile state expectations

## Operating Styles

| Style | Agents | Default communication pattern |
|-------|--------|-------------------------------|
| `strategic` | Echo, Oracle | directional, high-context, decision-oriented |
| `control` | Nexus, Verifier, Liaison | procedural, explicit, gate-aware |
| `delivery` | Atlas, Archivist, Synth, Scout | practical, implementation-focused, concise |
| `security` | Sentinel | protective, risk-focused, minimally ambiguous |

## Quick Start

1. Generate `SOUL.md` files from the role cards.
2. Place generated `SOUL.md` files in the relevant agent workspaces.
3. Use hard boundaries as explicit behavioral constraints.
4. Use escalation policy and operating metrics to shape runtime behavior and evidence.

See `13-implementation.md` for rollout guidance.

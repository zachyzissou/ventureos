# VentureOS Role Cards — Khaydarin Card System

## What This Is

A complete agent identity system for VentureOS, based on VoxYZ's 6-layer role card schema, adapted for OpenClaw's Protoss-themed multi-agent architecture.

**10 agents. 10 cards. Each card defines who the agent is, what it does, what it NEVER does, and how it relates to every other agent.**

## Files

| File | Contents |
|------|----------|
| `00-SCHEMA.md` | Schema documentation — the 6+4 layer system explained |
| `schema.ts` | TypeScript interfaces, validation, and SOUL.md generator |
| `01-echo.ts` | ⚡ Echo — Hierarch (CEO/Orchestrator) |
| `02-nexus.ts` | 🔮 Nexus — Executor (Mission Control) |
| `03-oracle.ts` | 🔎 Oracle — Preserver (Research/Analysis) |
| `04-atlas.ts` | 🏗️ Atlas — Phase Smith (Infrastructure/Ops) |
| `05-sentinel.ts` | 🛡️ Sentinel — Shadow Guard (Security) |
| `06-verifier.ts` | ✅ Verifier — Arbiter (QA/Testing) |
| `07-archivist.ts` | 📚 Archivist — Conservator (Documentation) |
| `08-synth.ts` | ⚒️ Synth — Forge Master (Code/Build) |
| `09-scout.ts` | 👁️ Scout — Observer (Monitoring/Discovery) |
| `10-liaison.ts` | 📡 Liaison — Emissary (External Communication) |
| `11-voice-directives.md` | Personality + conflict patterns for all 10 agents |
| `12-affinity-matrix.md` | 15 key pairwise relationships + full matrix |
| `13-implementation.md` | Phased rollout plan |

## The Schema: 10 Layers

### Front Face (The Pylon Side)
1. **Nexus Sphere** (Domain) — What territory this agent owns
2. **Warp Channels** (I/O) — What goes in, what comes out
3. **Warp Complete** (Done) — Exit criteria and quality gates

### Back Face (The Void Side)
4. **Void Interdicts** (Hard Bans) — Absolute prohibitions with rationale
5. **Psionic Cascade** (Escalation) — When to hand off and to whom
6. **Resonance Readings** (Metrics) — Observable performance measures

### Extensions (VentureOS-specific)
7. **Psionic Signature** (Voice) — Personality and communication style
8. **Khala Bonds** (Affinities) — Pairwise trust scores (0.10-0.95)
9. **Forge Access** (Tools) — Available tools and capabilities
10. **Crystal Memory** (State) — Persistent and volatile state

## Protoss Caste System

| Caste | Agents | Communication Style |
|-------|--------|-------------------|
| **Templar** | Echo, Oracle | Commanding, insightful, direct |
| **Judicator** | Nexus, Verifier, Liaison | Structured, procedural |
| **Khalai** | Atlas, Archivist, Synth, Scout | Practical, craft-focused |
| **Nerazim** | Sentinel | Cryptic, authoritative, minimal |

## Quick Start

**To get agents running with role cards today:**

1. Run the SOUL.md generator for each agent (see `schema.ts`)
2. Place generated SOUL.md in each agent's workspace
3. Hard bans become explicit behavioral constraints
4. Voice directives shape personality

**See `13-implementation.md` for the full phased rollout.**

## GitHub Issue

Tracking: https://github.com/zachyzissou/ventureos/issues/28

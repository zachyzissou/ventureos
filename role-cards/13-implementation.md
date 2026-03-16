# Implementation Recommendations

## Overview

This document covers how to turn the role card designs into working VentureOS behavior.

## Phase 1: Card-as-SOUL.md

### Approach
The fastest path to value is to convert each role card into an agent `SOUL.md` file. No database or runtime system is required for the initial cut.

### Steps
1. Generate a `SOUL.md` from each role card.
2. Add hard boundaries as explicit behavioral constraints.
3. Add escalation policy as runtime handoff guidance.
4. Test each agent in isolation against representative tasks.

### SOUL.md Template
```markdown
# SOUL.md — {Agent Name} ({Title})

## Identity
{glyph} {name} — {title} ({operating style} operating style)
{domain one-liner}

## Jurisdiction
{jurisdiction bullets}

## NOT My Domain
{boundaries bullets}

## How I Work
### Inputs I Accept
{operating channel inputs}

### What I Produce
{operating channel outputs}

### When I'm Done
{completion conditions}

## Voice
{voice description}
{personality traits}

## Non-Negotiables
{hard bans}

## When to Escalate
{escalation triggers}
Timeout: {timeout}
Fallback: {fallback}

## My Standards
{metrics with targets}
```

## Phase 2: Card-as-Config

### Approach
Move role cards from markdown into a structured JSON/TypeScript config system that can be loaded during agent initialization.

### Architecture
```text
ventureos/
├── role-cards/
│   ├── schema.ts
│   ├── cards/
│   │   ├── echo.json
│   │   ├── nexus.json
│   │   └── ...
│   ├── affinity-matrix.json
│   └── loader.ts
```

### Loader sketch
```typescript
function loadCard(agentId: string): AgentRoleCard {
  const card = require(`./cards/${agentId}.json`);
  return validateCard(card);
}

function generateSoul(card: AgentRoleCard): string {
  return generateSoulMd(card);
}
```

## Phase 3: Dynamic Affinities

### Approach
Store affinity scores in the evidence or state backend and update them based on collaboration outcomes.

### Guidelines
- keep affinity bounded between `0.10` and `0.95`
- decay old collaboration scores slowly toward neutral
- prefer explicit event hooks over implicit heuristics

## Phase 4: Metrics and Health

### Priority metrics
1. Echo: delegation accuracy
2. Nexus: task completion rate
3. Sentinel: review coverage
4. Scout: detection latency

### Implementation
- reuse VentureOS logging where possible
- expose daily/weekly rollups through the evidence pipeline
- let Archivist document metric definitions and drift history

## What to Build First

1. Generate `SOUL.md` files from cards.
2. Enforce hard boundaries in runtime guards.
3. Apply voice directives through structured prompts.
4. Move cards into validated runtime config.
5. Layer in dynamic affinities and longer-term metrics once the execution loop is stable.

# Implementation Recommendations

## Overview

This document covers how to turn the Khaydarin Card designs into a working system within OpenClaw/VentureOS.

## Phase 1: Card-as-SOUL.md (Week 1)

### Approach
The fastest path to value: convert each role card into the agent's `SOUL.md` file. No database, no runtime system — just structured prompts.

### Steps
1. For each agent, generate a `SOUL.md` from the card's front face + voice directive
2. Add the back face (hard bans) as explicit constraints in the SOUL
3. Add escalation rules as behavioral instructions
4. Test each agent in isolation: give it 10 representative tasks, verify behavior

### SOUL.md Template
```markdown
# SOUL.md — {Agent Name} ({Title})

## Identity
{glyph} {name} — {title} of the {caste} caste.
{domain one-liner}

## Jurisdiction
{jurisdiction bullets}

## NOT My Domain
{boundaries bullets}

## How I Work
### Inputs I Accept
{warp channels inputs}

### What I Produce  
{warp channels outputs}

### When I'm Done
{warp complete conditions}

## Voice
{psionic signature voice description}
{personality traits}

## Hard Rules (Void Interdicts)
{hard bans — formatted as NEVER statements}

## When to Escalate
{escalation triggers → targets}
Timeout: {timeout}
Fallback: {fallback}

## My Standards
{metrics with targets}
```

### Estimated Effort: 2-3 hours
### Risk: Low — this is just structured prompt engineering

---

## Phase 2: Card-as-Config (Week 2-3)

### Approach
Move role cards from markdown into a structured JSON/TypeScript config system that can be loaded at agent initialization time.

### Architecture
```
ventureos/
├── role-cards/
│   ├── schema.ts          # TypeScript interfaces (from 00-SCHEMA.md)
│   ├── cards/
│   │   ├── echo.json      # Compiled from .ts definitions
│   │   ├── nexus.json
│   │   └── ...
│   ├── affinity-matrix.json
│   └── loader.ts          # Loads card → generates SOUL.md at runtime
```

### Key Implementation Detail: Card Loader
```typescript
function loadCard(agentId: string): KhaydarinCard {
  const card = require(`./cards/${agentId}.json`);
  return validateCard(card); // Runtime validation against schema
}

function generateSoul(card: KhaydarinCard): string {
  // Transforms structured card into SOUL.md prose
  // This is the key bridge: structured data → natural language prompt
  return generateSoulMd(card);
}

function getAffinity(agentA: string, agentB: string): number {
  const [a, b] = [agentA, agentB].sort(); // Alphabetical ordering
  return affinityMatrix[`${a}-${b}`] ?? 0.50; // Default neutral
}
```

### Estimated Effort: 1 week
### Risk: Medium — requires runtime integration with OpenClaw agent initialization

---

## Phase 3: Dynamic Affinities (Week 3-4)

### Approach
Store affinity scores in Supabase and update them based on collaboration events.

### Database Schema
```sql
CREATE TABLE agent_relationships (
  agent_a TEXT NOT NULL,
  agent_b TEXT NOT NULL,
  affinity REAL NOT NULL DEFAULT 0.50,
  last_interaction TIMESTAMPTZ,
  interaction_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  PRIMARY KEY (agent_a, agent_b),
  CHECK (agent_a < agent_b),  -- Alphabetical ordering (VoxYZ pattern)
  CHECK (affinity >= 0.10 AND affinity <= 0.95)
);

CREATE TABLE affinity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_a TEXT NOT NULL,
  agent_b TEXT NOT NULL,
  delta REAL NOT NULL,  -- -0.05 to +0.05
  reason TEXT NOT NULL,
  task_id TEXT,          -- Optional: link to originating task
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Weekly decay job
CREATE OR REPLACE FUNCTION decay_affinities() RETURNS void AS $$
  UPDATE agent_relationships
  SET affinity = GREATEST(0.10, affinity + (0.50 - affinity) * 0.02)
  WHERE last_interaction < NOW() - INTERVAL '7 days';
$$ LANGUAGE SQL;
```

### Affinity Influence on Behavior
When Agent A needs to delegate or request help:
```typescript
function selectCollaborator(fromAgent: string, candidates: string[]): string {
  // Sort by affinity, but don't make it deterministic —
  // add noise to prevent the system from calcifying
  return candidates
    .map(c => ({ 
      agent: c, 
      score: getAffinity(fromAgent, c) + (Math.random() * 0.1 - 0.05)
    }))
    .sort((a, b) => b.score - a.score)[0].agent;
}
```

### Estimated Effort: 1 week
### Risk: Medium-High — requires event hooks in the task system

---

## Phase 4: Metrics & Health (Week 4+)

### Approach
Implement the resonanceReadings from each card as actual observables.

### Priority Metrics (Start Here)
1. **Echo**: Delegation accuracy (are tasks going to the right agent?)
2. **Nexus**: Task completion rate (are things getting done?)
3. **Sentinel**: Review coverage (is everything getting security review?)
4. **Scout**: Detection latency (how fast are alerts?)

### Implementation
- Use OpenClaw's existing logging to capture events
- Build a simple dashboard (could be a cron job that generates a daily report)
- Archivist documents metric definitions and tracks trends

### Estimated Effort: Ongoing
### Risk: Low — it's just instrumentation

---

## Integration with Existing VentureOS Systems

### GitHub Issues
- Each role card should have a corresponding label in GitHub (e.g., `agent:echo`, `agent:oracle`)
- Issues are assigned based on nexusSphere jurisdiction
- Affinity scores influence who reviews whose PRs

### Plane Project Management
- Card metadata maps to Plane work item properties
- Priority tiers (P0-P3) align with Echo's priority arbitration
- Sprint planning uses Nexus's decomposition patterns

### Discord Channels
- Each agent could have a dedicated channel or thread
- Voice directives inform bot personality per channel
- Escalation cascade determines mention/notification routing

---

## What to Build First

**Recommendation (strong opinion):**

1. **Start with SOUL.md generation** — immediate value, zero infrastructure
2. **Skip to hard bans enforcement** — the void interdicts are the most valuable part of the system. An agent that knows what NOT to do is more reliable than one that only knows what to do.
3. **Affinity matrix is nice-to-have for v1** — the static matrix is enough. Dynamic affinities are a v2 feature.
4. **Voice directives are high-value, low-cost** — just personality prompts in SOUL.md
5. **Metrics are a v2/v3 concern** — you need the agents running first

### Priority Order
```
P0: Generate SOUL.md files from cards (this week)
P1: Implement hard bans as explicit constraints (this week)
P2: Voice directives in SOUL.md (this week)
P3: Structured card config system (next week)
P4: Static affinity matrix in config (next week)
P5: Dynamic affinities in Supabase (v2)
P6: Metrics dashboard (v2)
```

---

## Open Questions

1. **How do cards evolve?** — Should cards be version-controlled like code? (Recommendation: yes, in the role-cards/ directory)
2. **Who edits cards?** — Only the human? Or can Echo propose card modifications? (Recommendation: human approves, Echo can propose)
3. **Card conflicts** — What happens when two cards' jurisdictions overlap? (Recommendation: this is a design bug — overlap should be resolved before deployment)
4. **Cross-VentureOS reuse** — Should the card schema be generic enough for other multi-agent systems? (Recommendation: design for OpenClaw specifically first, generalize later)
5. **Token cost** — Full card as prompt context is expensive. How much of the card needs to be in-context vs. referenced? (Recommendation: SOUL.md gets front face + voice + hard bans. Full card is reference documentation.)

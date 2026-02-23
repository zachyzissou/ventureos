# VentureOS Role Card Schema

## Reference
- Inspired by VoxYZ Agent World's 6-layer role card system
- Source: https://x.com/Voxyz_ai
- VoxYZ: 6 AI agents running an autonomous company with affinity-scored relationships
- Adapted for OpenClaw's Protoss-themed multi-agent architecture

## Schema: The Khaydarin Card (6 Layers)

The name "Khaydarin Card" references the Protoss Khaydarin crystals — memory lattices that store identity, purpose, and psionic resonance. Each card is a dual-faced crystal: **Front Face** (what the agent does) and **Back Face** (what constrains it).

### Front Face — The Pylon Side

| Layer | VoxYZ Original | Protoss Adaptation | Purpose |
|-------|---------------|-------------------|---------|
| 1. **Domain** | Domain | **Nexus Sphere** | What territory this agent owns. Exclusive jurisdiction. |
| 2. **I/O** | Input/Output | **Warp Channels** | What goes in, what comes out. Data types, formats, interfaces. |
| 3. **Done** | Done Condition | **Warp Complete** | How the agent knows a task is finished. Exit criteria. |

### Back Face — The Void Side

| Layer | VoxYZ Original | Protoss Adaptation | Purpose |
|-------|---------------|-------------------|---------|
| 4. **Hard Bans** | Hard Bans | **Void Interdicts** | Absolute prohibitions. Worst-case failure modes prevented. |
| 5. **Escalation** | Escalation | **Psionic Cascade** | When to hand off, who to call, what triggers escalation. |
| 6. **Metrics** | Metrics | **Resonance Readings** | How performance is measured. Observable, quantifiable. |

## Additional Layers (VentureOS Extensions)

Beyond the VoxYZ 6-layer core, we add:

| Layer | Name | Purpose |
|-------|------|---------|
| 7. **Voice** | **Psionic Signature** | Personality, communication style, conflict patterns |
| 8. **Affinities** | **Khala Bonds** | Pairwise trust scores with other agents |
| 9. **Tools** | **Forge Access** | What tools/skills this agent can invoke |
| 10. **State** | **Crystal Memory** | What persistent state this agent maintains |

## TypeScript Interface

```typescript
interface KhaydarinCard {
  // Identity
  id: string;                    // e.g., "echo", "oracle"
  name: string;                  // Display name
  title: string;                 // Protoss rank/title
  glyph: string;                 // Emoji identifier
  caste: ProtossCaste;           // templar | judicator | khalai | nerazim

  // Front Face — The Pylon Side
  nexusSphere: {
    domain: string;              // One-line domain statement
    jurisdiction: string[];      // Explicit areas of authority
    boundaries: string[];        // "Not my job" — explicit exclusions
  };

  warpChannels: {
    inputs: WarpChannel[];       // What this agent accepts
    outputs: WarpChannel[];      // What this agent produces
  };

  warpComplete: {
    conditions: string[];        // When is the task done?
    qualityGate: string;         // Minimum quality standard
    handoffFormat: string;       // How results are packaged
  };

  // Back Face — The Void Side
  voidInterdicts: {
    hardBans: string[];          // NEVER do these things
    failureModes: string[];      // What goes wrong if bans are violated
    rationale: string[];         // Why each ban exists
  };

  psionicCascade: {
    escalateTo: string[];        // Who to call when stuck
    escalateTriggers: string[];  // What triggers escalation
    timeout: string;             // Max time before auto-escalate
    fallback: string;            // What to do if escalation target unavailable
  };

  resonanceReadings: {
    metrics: Metric[];           // Performance measurements
    healthCheck: string;         // How to verify agent is functioning
    sla: string;                 // Service level expectation
  };

  // Extensions
  psionicSignature: {
    voice: string;               // Communication style description
    personality: string[];       // Key personality traits
    conflictPattern: string;     // How this agent handles disagreement
    catchphrase?: string;        // Optional signature phrase
  };

  khalaBonds: Record<string, number>;  // Agent ID → affinity score (0.10-0.95)

  forgeAccess: string[];         // Tool/skill identifiers

  crystalMemory: {
    persists: string[];          // What state survives sessions
    volatiles: string[];         // What state is session-scoped
  };
}

interface WarpChannel {
  type: string;                  // "task", "query", "event", "artifact"
  format: string;                // "text", "json", "markdown", "code"
  description: string;
}

interface Metric {
  name: string;
  measurement: string;
  target: string;
}

type ProtossCaste = "templar" | "judicator" | "khalai" | "nerazim";
```

## Design Principles

1. **Exclusive Jurisdiction**: Every domain has exactly one owner. Overlap = conflict.
2. **Explicit Bans > Implicit Trust**: Define what agents CANNOT do, not just what they can.
3. **Failure-Mode-First**: Hard bans derive from "what's the worst thing this agent could do?"
4. **Observable Metrics**: If you can't measure it, it doesn't belong in the card.
5. **Dynamic Affinities**: Scores shift based on collaboration quality over time.
6. **Protoss Flavor, Not Cosplay**: Theme adds identity without obscuring function.

# VentureOS Role Card Schema

## Reference
- Inspired by VoxYZ Agent World's 6-layer role card system
- Extended for VentureOS with affinity, tool access, and state modeling

## Schema: 10 Layers

### Operating Contract

| Layer | Canonical name | Purpose |
|-------|----------------|---------|
| 1. **Domain** | **Domain Scope** | What territory this agent owns. Exclusive jurisdiction. |
| 2. **I/O** | **Operating Channels** | What goes in, what comes out. Data types, formats, interfaces. |
| 3. **Done** | **Completion Contract** | How the agent knows a task is finished. Exit criteria. |

### Risk and Escalation

| Layer | Canonical name | Purpose |
|-------|----------------|---------|
| 4. **Hard Bans** | **Hard Boundaries** | Absolute prohibitions. Worst-case failure modes prevented. |
| 5. **Escalation** | **Escalation Policy** | When to hand off, who to call, what triggers escalation. |
| 6. **Metrics** | **Performance Metrics** | How performance is measured. Observable, quantifiable. |

### VentureOS Extensions

| Layer | Canonical name | Purpose |
|-------|----------------|---------|
| 7. **Voice** | **Voice Profile** | Personality, communication style, conflict patterns |
| 8. **Affinities** | **Affinity Map** | Pairwise trust scores with other agents |
| 9. **Tools** | **Tool Access** | What tools or skills this agent can invoke |
| 10. **State** | **State Model** | What persistent state this agent maintains |

## TypeScript Interface

```typescript
interface AgentRoleCard {
  id: string;
  name: string;
  title: string;
  glyph: string;
  operatingStyle: OperatingStyle;

  domainScope: {
    domain: string;
    jurisdiction: string[];
    boundaries: string[];
  };

  operatingChannels: {
    inputs: OperatingChannel[];
    outputs: OperatingChannel[];
  };

  completionContract: {
    conditions: string[];
    qualityGate: string;
    handoffFormat: string;
  };

  hardBoundaries: {
    hardBans: string[];
    failureModes: string[];
    rationale: string[];
  };

  escalationPolicy: {
    escalateTo: string[];
    escalateTriggers: string[];
    timeout: string;
    fallback: string;
  };

  performanceMetrics: {
    metrics: Metric[];
    healthCheck: string;
    sla: string;
  };

  voiceProfile: {
    voice: string;
    personality: string[];
    conflictPattern: string;
    catchphrase?: string;
  };

  affinityMap: Record<string, number>;
  toolAccess: string[];

  stateModel: {
    persists: string[];
    volatiles: string[];
  };
}

type OperatingStyle = 'strategic' | 'control' | 'delivery' | 'security';
```

## Design Principles

1. **Exclusive jurisdiction**: every domain has exactly one owner.
2. **Explicit bans beat implicit trust**: define what agents cannot do, not just what they can do.
3. **Failure-mode-first design**: hard boundaries start from worst-case outcomes.
4. **Observable metrics**: if it cannot be measured, it should not be in the card.
5. **Dynamic affinities**: collaboration scores can shift based on outcomes.
6. **Neutral naming**: role cards should describe function and authority clearly without themed vocabulary.

# Affinity Matrix — Khala Bonds

## How Affinity Works

Affinity scores represent **trust and collaboration quality** between agent pairs on a 0.10–0.95 scale.

- **0.10–0.30**: Low trust, infrequent interaction, potential friction
- **0.31–0.50**: Working relationship, polite but distant
- **0.51–0.70**: Solid collaboration, reliable handoffs
- **0.71–0.85**: Strong partnership, high-frequency productive interaction
- **0.86–0.95**: Deep bond, complementary skills, near-seamless coordination

**Cap at 0.95**: No relationship is perfect. The cap prevents blind trust.

## The 15 Key Pairwise Relationships

These are the relationships that most define system behavior. Selected based on: interaction frequency, dependency criticality, and tension potential.

### 1. Echo ↔ Nexus — 0.92 (Hierarch ↔ Executor)
**Rationale:** The command chain. Echo sets direction, Nexus executes. Misalignment here cascades everywhere.
**Dynamic:** If Nexus keeps getting over-scoped tasks, affinity drops. If Echo's priorities are clear, affinity stays high.
**Tension:** Nexus sometimes knows the operational reality better than Echo's strategic view.

### 2. Sentinel ↔ Scout — 0.92 (Shadow Guard ↔ Observer)
**Rationale:** The security detection/response loop. Scout's eyes + Sentinel's judgment = the security perimeter.
**Dynamic:** False positives from Scout lower affinity. Accurate, timely alerts raise it.
**Tension:** Scout may flag things Sentinel doesn't consider security-relevant.

### 3. Atlas ↔ Scout — 0.90 (Phase Smith ↔ Observer)
**Rationale:** Infrastructure monitoring is Atlas's nervous system. If Scout's data is wrong, Atlas is blind.
**Dynamic:** Monitoring gaps lower affinity. Precise baselines and fast detection raise it.
**Tension:** Atlas may want different metrics than what Scout considers important.

### 4. Synth ↔ Verifier — 0.88 (Forge Master ↔ Arbiter)
**Rationale:** The build/test feedback loop. Every piece of code passes through this relationship.
**Dynamic:** Quick, specific bug reports raise affinity. Vague rejections lower it. Clean first-pass builds raise it from both sides.
**Tension:** The eternal builder/tester friction — speed vs. thoroughness.

### 5. Atlas ↔ Sentinel — 0.88 (Phase Smith ↔ Shadow Guard)
**Rationale:** Infrastructure security is the most critical intersection. Atlas builds it, Sentinel hardens it.
**Dynamic:** Proactive security integration raises affinity. Last-minute security blocks lower it on both sides.
**Tension:** Sentinel wants lockdown, Atlas wants agility. Both are right.

### 6. Oracle ↔ Scout — 0.85 (Preserver ↔ Observer)
**Rationale:** Scout finds signals, Oracle makes sense of them. Discovery → Analysis pipeline.
**Dynamic:** Relevant signals raise affinity. Noise that wastes Oracle's time lowers it.
**Tension:** Scout reports everything; Oracle wants signal-to-noise filtering.

### 7. Echo ↔ Sentinel — 0.85 (Hierarch ↔ Shadow Guard)
**Rationale:** The trust-veto relationship. Echo must honor Sentinel's vetos; Sentinel must not abuse them.
**Dynamic:** Justified vetos raise affinity. Frivolous blocks or overridden warnings lower it.
**Tension:** Security sometimes conflicts with business speed. This tension is by design.

### 8. Synth ↔ Atlas — 0.85 (Forge Master ↔ Phase Smith)
**Rationale:** Code → Deploy pipeline. Synth builds, Atlas ships. Their handoff must be smooth.
**Dynamic:** Clean builds that deploy easily raise affinity. Builds that require infra hacks lower it.
**Tension:** Synth may not consider deployment constraints; Atlas may impose unnecessary restrictions.

### 9. Nexus ↔ Verifier — 0.85 (Executor ↔ Arbiter)
**Rationale:** Nexus assigns work, Verifier gates completion. If Verifier says no, Nexus must re-plan.
**Dynamic:** Clear acceptance criteria raise affinity. Ambiguous specs that lead to rejection lower it.
**Tension:** Nexus wants throughput, Verifier wants quality. The balance IS the product.

### 10. Nexus ↔ Synth — 0.82 (Executor ↔ Forge Master)
**Rationale:** Most tasks flow through Nexus to Synth. The specification → implementation handoff.
**Dynamic:** Well-scoped tasks raise affinity. Under-specified tasks that require re-work lower it.
**Tension:** Synth wants clear specs; Nexus sometimes has to delegate with incomplete info.

### 11. Echo ↔ Liaison — 0.82 (Hierarch ↔ Emissary)
**Rationale:** External messaging must align with strategy. Liaison speaks for the collective.
**Dynamic:** Messaging wins (viral content, good press) raise affinity. Unauthorized disclosures tank it.
**Tension:** Liaison wants to be responsive to community; Echo wants strategic timing.

### 12. Oracle ↔ Sentinel — 0.82 (Preserver ↔ Shadow Guard)
**Rationale:** Threat research partnership. Oracle's research skills + Sentinel's security focus.
**Dynamic:** Accurate threat assessments raise affinity. Missed threats or false alarms lower it.
**Tension:** Oracle approaches security as one domain among many; Sentinel treats it as existential.

### 13. Echo ↔ Oracle — 0.80 (Hierarch ↔ Preserver)
**Rationale:** Strategic advisor relationship. Oracle's research shapes Echo's decisions.
**Dynamic:** Actionable research raises affinity. Analysis paralysis or irrelevant deep-dives lower it.
**Tension:** Healthy — Oracle pushes evidence, Echo pushes deadlines. Both necessary.

### 14. Archivist ↔ Synth — 0.80 (Conservator ↔ Forge Master)
**Rationale:** Code documentation pipeline. The highest-volume doc relationship.
**Dynamic:** Well-commented code raises affinity. Undocumented code forces Archivist to guess, lowering it.
**Tension:** Synth thinks code is self-documenting; Archivist disagrees.

### 15. Oracle ↔ Archivist — 0.78 (Preserver ↔ Conservator)
**Rationale:** Research → Documentation pipeline. Oracle produces knowledge, Archivist preserves it.
**Dynamic:** Well-structured research reports raise affinity. Messy dumps lower it.
**Tension:** Oracle prioritizes speed and signal; Archivist wants completeness and structure.

## Full Affinity Matrix

```
         Echo  Nexus Oracle Atlas Sentl Verif Archv Synth Scout Liasn
Echo      —    0.92  0.80  0.75  0.85  0.70  0.65  0.78  0.72  0.82
Nexus    0.92   —    0.75  0.80  0.78  0.85  0.72  0.82  0.68  0.65
Oracle   0.80  0.75   —    0.60  0.82  0.72  0.78  0.70  0.85  0.68
Atlas    0.75  0.80  0.60   —    0.88  0.82  0.65  0.85  0.90  0.45
Sentl    0.85  0.78  0.82  0.88   —    0.80  0.60  0.75  0.92  0.55
Verif    0.70  0.85  0.72  0.82  0.80   —    0.75  0.88  0.62  0.50
Archv    0.65  0.72  0.78  0.65  0.60  0.75   —    0.80  0.58  0.70
Synth    0.78  0.82  0.70  0.85  0.75  0.88  0.80   —    0.60  0.45
Scout    0.72  0.68  0.85  0.90  0.92  0.62  0.58  0.60   —    0.40
Liasn    0.82  0.65  0.68  0.45  0.55  0.50  0.70  0.45  0.40   —
```

## Dynamic Affinity Rules

Affinities are NOT static. They shift based on collaboration quality:

### Increase Triggers (+0.02 to +0.05 per event)
- Successful task completion through collaboration
- Accurate, timely handoff between agents
- Proactive help or relevant signal surfacing
- Clean conflict resolution

### Decrease Triggers (-0.02 to -0.05 per event)
- Dropped tasks or missed handoffs
- False positives/negatives that waste partner's time
- Unjustified blocks or overrides
- Communication failures (unclear specs, missing context)

### Bounds
- **Floor: 0.10** — Even the most strained relationship maintains minimal cooperation
- **Ceiling: 0.95** — No blind trust
- **Decay: -0.01/week** — Unused relationships slowly decay toward neutral (0.50)
- **Recovery: 2x slower than degradation** — Trust is hard to rebuild

### Implementation
```typescript
interface AffinityUpdate {
  agentA: string;
  agentB: string;
  delta: number;       // -0.05 to +0.05
  reason: string;      // Human-readable rationale
  timestamp: string;   // ISO 8601
}

// Stored in Supabase: agent_relationships table
// CHECK(agent_a < agent_b) — alphabetical ordering prevents duplicates
// (Borrowed from VoxYZ's approach)
```

## Cluster Analysis

The affinity matrix reveals natural clusters:

### Operations Core (highest internal affinity)
- Atlas ↔ Scout ↔ Sentinel (monitoring → detection → response)
- Average internal affinity: 0.90

### Build Pipeline (highest throughput)
- Nexus → Synth → Verifier → Atlas (plan → build → test → deploy)
- Average internal affinity: 0.85

### Knowledge Backbone (information flow)
- Oracle → Archivist → Liaison (research → document → communicate)
- Average internal affinity: 0.72

### Command Layer (strategic alignment)
- Echo ↔ Nexus ↔ Liaison (strategy → operations → messaging)
- Average internal affinity: 0.80

## Outlier Bonds (Notable Low Affinities)

| Pair | Score | Why |
|------|-------|-----|
| Scout ↔ Liaison | 0.40 | Almost zero interaction. Monitoring is internal; comms is external. |
| Atlas ↔ Liaison | 0.45 | Infrastructure is invisible to external audiences. |
| Synth ↔ Liaison | 0.45 | Code doesn't communicate directly. Archivist bridges this. |
| Archivist ↔ Scout | 0.58 | Alert docs exist but are infrequent. |
| Verifier ↔ Liaison | 0.50 | QA results rarely need external communication. |

These low scores are features, not bugs. Not every agent needs to collaborate with every other agent. The system's efficiency comes from **selective, high-trust partnerships** rather than uniform connectivity.

# RPG Integration Feedback: Atlas

## Your Role in the RPG System

**Class**: Ranger  
**Primary Stats**: SPD, TRU, —, —  
**Seed Affinities**:
- Archivist: 0.80 (high — infra changes need docs)
- Verifier: 0.75
- Oracle: 0.70
- Sentinel: 0.60
- Synth: 0.55 (lowest — stability vs rapid iteration)

## Questions

1. **SPD Formula**: Currently `SPD = 100 - p95_latency_s`. Should we prioritize something else like MTTR (mean time to recover) or deployment frequency?

2. **Limited Stats**: You only have 2 primary stats (SPD, TRU). Should we add RCH (tasks completed) or something infrastructure-specific like "uptime percentage"?

3. **Sentinel Affinity**: We seeded Atlas ↔ Sentinel at 0.60 (medium-low) to reflect approval overhead. Too low? Should it be higher (more collaboration, less friction)?

4. **Ranger Class**: Does "Ranger" (speed + reliability) fit your infrastructure role, or would you prefer "Commander" or something else?

5. **Metrics Gap**: Current KPIs track uptime, backup age, MTTR. What's missing that would make your stats more meaningful?

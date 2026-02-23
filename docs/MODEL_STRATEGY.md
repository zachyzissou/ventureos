# Model Strategy

**See:** `docs/MODEL_ROUTING_POLICY.md` for full routing rules, cost gates, and examples. **See:** `docs/MODEL_FALLBACK_CHAIN.md` for fallback triggers, retry/timeout interaction, and escalation.

## Cheap Model (default)
Use for: summaries, formatting, routine queries, simple tasks.

## Strong Model
Use for: multi‑step planning, code changes, ambiguous requirements, high‑risk actions.

## Fallback Chain
- **Strong‑required:** Strong → Cheap → Local (see policy for approval gates)
- **Cheap‑default:** Cheap → Strong (Local for read‑only continuity only)

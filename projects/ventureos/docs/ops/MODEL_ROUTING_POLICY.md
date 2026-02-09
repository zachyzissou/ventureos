# Model Routing Policy (v1)

## Goals
- Keep Mission Control + role agents **snappy**.
- Push routine work to **cheap/local** models.
- Escalate to strong cloud models only when the cost of being wrong is high.
- Keep routing **deterministic + auditable**.

## Mode
Delegation mode: **B** (agents autonomous for L1; explicit approval required before any L2).

## Tiers

### Tier 0 — No model (script-only)
Use for:
- parsing, counting, thresholds, diffs
- deterministic monitors

Output:
- `OK/WARN/FAIL` + evidence (log excerpts, metrics)

### Tier 1 — Local model (default)
**Default Tier 1 model:** `ollama/qwen3:14b`

Use for:
- summarizing script output
- classifying incidents (P0/P1/P2)
- deduping alerts
- templated digests

Hard rules:
- Tier 1 must not propose irreversible changes.
- Tier 1 may open issues, post alerts, and suggest next actions.

### Tier 2 — Cheap cloud
Use for:
- routine writing where local quality isn’t enough
- small plans and structured writeups

### Tier 3 — Strong cloud
Use for:
- ambiguous root-cause investigations
- architecture decisions
- drafting L2 proposals (diff/plan/risks/rollback)

## Job-Type Mapping (v1)
- Monitors (latency, gateway health, disk, cron export): Tier 0 + Tier 1
- Briefings/digests: Tier 1 (Tier 2 only if needed)
- Research synthesis: Tier 2–3 depending on stakes
- Anything that might lead to config/code changes (L2): Tier 3 for the writeup; **must ask approval before changes**

## Escalation Triggers
Escalate from Tier 1 → Tier 3 when:
- repeat failures (e.g., 2 WARNs in a row or 1 FAIL)
- conflicting signals / ambiguous cause
- user impact risk
- preparing an L2 approval ask

## Auditability
Every cron/agent workflow should record:
- tier used
- evidence inputs
- decision outcome (silent/alert/issue)

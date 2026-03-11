# Nexus 2.0 M4 — Observability + Replay Authority

Issue: #287

This document captures the replay-authority surfaces added for M4.

## Replay Authority Surfaces

- `GET /api/replay/explain?sessionId=<id>`
: replay-only explanation for route/verdict/arbitration outcomes.
- `GET /api/replay/control-health?sessionId=<id>`
: control-health summary for one replay session.
- `GET /api/replay/control-health?sessionLimit=<n>`
: aggregated control-health summary across recent replay sessions.

## Arena Timeline Events

`runArena(...)` now emits structured timeline events in `ArenaRunResult.timeline`:

- `route.evaluated`
- `verdict.generated`
- `verdict.advisory`
- `arbitration.accepted`
- `arbitration.rejected`

These events are mission-scoped and intended to be persisted into replay session event streams.

## Exit-Criteria Mapping

- Arbitration events in replay: satisfied via structured arena timeline event types.
- Mission timeline for route/verdict: satisfied via replay explanation timeline extraction.
- Control-health visibility: satisfied via replay control-health summary endpoint.
- Replay-only explanation of decisions: satisfied via `GET /api/replay/explain`.

# Bridge Server Decomposition Plan (Issues #375, #386)

## Goal
Reduce regression blast radius in `dashboard/server/bridge.ts` by splitting security and telemetry concerns into focused modules without changing endpoint behavior.

## Baseline (2026-02-21)
- `dashboard/server/bridge.ts`: 1880 LOC (53116 bytes)

## Progress Snapshot (2026-02-22)
- `dashboard/server/bridge.ts`: 1108 LOC (36727 bytes, ~30.9% smaller than #386 baseline)
- `dashboard/server/bridge-aggregation-helpers.ts`: 675 LOC (20585 bytes)

## Stage 1 (completed)
- Extract auth, allowlist, audit, and rate-limit logic into `dashboard/server/bridge-security.ts`.
- Extract live telemetry snapshot assembly + cache window logic into `dashboard/server/bridge-live-telemetry.ts`.
- Keep route semantics and response schemas unchanged.
- Add maintainability guardrail in `dashboard/tests/unit/maintainability/file-size-guard.test.ts`.

## Stage 1.1 (completed, Issue #386)
- Extract bridge aggregation and ops helpers (agent rollups, workflow patterns, mission-control shaping, cron/git/services/memory helpers) into `dashboard/server/bridge-aggregation-helpers.ts`.
- Keep auth, rate limiting, and proxy policy behavior unchanged while shrinking `bridge.ts`.

## Guardrails
- `dashboard/server/bridge.ts` budget: <= 1700 LOC.

## Next stage
- Split route handlers in `bridge.ts` into focused registrars by domain (`sessions`, `kpis`, `observations`, `ops`), leaving a thin router/dispatcher.

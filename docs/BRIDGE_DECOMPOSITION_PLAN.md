# Bridge Server Decomposition Plan (Issue #375)

## Goal
Reduce regression blast radius in `dashboard/server/bridge.ts` by splitting security and telemetry concerns into focused modules without changing endpoint behavior.

## Baseline (2026-02-21)
- `dashboard/server/bridge.ts`: 1880 LOC

## Stage 1 (completed)
- Extract auth, allowlist, audit, and rate-limit logic into `dashboard/server/bridge-security.ts`.
- Extract live telemetry snapshot assembly + cache window logic into `dashboard/server/bridge-live-telemetry.ts`.
- Keep route semantics and response schemas unchanged.
- Add maintainability guardrail in `dashboard/tests/unit/maintainability/file-size-guard.test.ts`.

## Guardrails
- `dashboard/server/bridge.ts` budget: <= 1700 LOC.

## Next stage
- Split route handlers in `bridge.ts` into focused registrars by domain (`sessions`, `kpis`, `observations`, `ops`), leaving a thin router/dispatcher.

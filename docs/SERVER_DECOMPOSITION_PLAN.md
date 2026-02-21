# Server Decomposition Plan (Issue #366)

## Goal
Reduce regression blast-radius from oversized dashboard server modules while preserving behavior parity.

## Baseline (2026-02-21)
- `dashboard/server/server.ts`: 4231 LOC
- `dashboard/server/routes/task-board.ts`: 2650 LOC

## Staged Plan
1. Stage 1 (completed)
- Extract static-file serving helpers from `server.ts` into `dashboard/server/static-serve.ts`.
- Extract task-board metrics/stuck-task logic from `task-board.ts` into `dashboard/server/routes/task-board-metrics.ts`.
- Add file-size guardrails in `dashboard/tests/unit/maintainability/file-size-guard.test.ts`.

2. Stage 2 (next)
- Split task-board API surface by concern (metrics/history/webhooks/escalations) into route-local modules.
- Keep `handleTaskBoard` as a thin dispatcher/composer.

3. Stage 3 (next)
- Group high-volume route wiring in `server.ts` into route registrars by domain.
- Preserve middleware ordering, auth boundaries, and existing response semantics.

## Guardrails
- `server.ts` budget: <= 4200 LOC
- `task-board.ts` budget: <= 2500 LOC
- Budgets enforced in dashboard unit tests to prevent re-monolithing.

# Server Decomposition Plan (Issues #366, #384, #385)

## Goal
Reduce regression blast-radius from oversized dashboard server modules while preserving behavior parity.

## Baseline (2026-02-21)
- `dashboard/server/server.ts`: 4231 LOC (142282 bytes)
- `dashboard/server/routes/task-board.ts`: 2650 LOC (86570 bytes)

## Progress Snapshot (2026-02-22)
- `dashboard/server/routes/task-board.ts`: 1609 LOC (60381 bytes, ~30.3% smaller than baseline)
- `dashboard/server/routes/task-board-templates.ts`: 519 LOC (17877 bytes)
- `dashboard/server/routes/task-board-operations.ts`: 426 LOC (11569 bytes)
- `dashboard/server/routes/task-board-utils.ts`: 15 LOC (408 bytes)

## Staged Plan
1. Stage 1 (completed)
- Extract static-file serving helpers from `server.ts` into `dashboard/server/static-serve.ts`.
- Extract task-board metrics/stuck-task logic from `task-board.ts` into `dashboard/server/routes/task-board-metrics.ts`.
- Add file-size guardrails in `dashboard/tests/unit/maintainability/file-size-guard.test.ts`.

2. Stage 1.1 (in progress, Issue #384)
- Extract shared request/file/auth utility helpers from `server.ts` into `dashboard/server/server-utils.ts`.
- Keep routing and response semantics unchanged while shrinking entrypoint responsibilities.

3. Stage 2 (in progress)
- Split task-board API surface by concern (metrics/history/webhooks/escalations) into route-local modules.
- Keep `handleTaskBoard` as a thin dispatcher/composer.

4. Stage 2.1 (completed, Issue #385)
- Extract pipeline template registry + normalization + template-based instantiation from `task-board.ts` into `dashboard/server/routes/task-board-templates.ts`.
- Keep route contract and response codes stable while reducing route-local complexity.

5. Stage 2.2 (completed, Issue #385)
- Extract batch operations + heartbeat pickup + recovery resume logic from `task-board.ts` into `dashboard/server/routes/task-board-operations.ts`.
- Keep external task-board endpoint behavior unchanged via route-local wrappers.

6. Stage 3 (next)
- Group high-volume route wiring in `server.ts` into route registrars by domain.
- Preserve middleware ordering, auth boundaries, and existing response semantics.

## Guardrails
- `server.ts` budget: <= 4200 LOC
- `task-board.ts` budget: <= 2500 LOC
- Budgets enforced in dashboard unit tests to prevent re-monolithing.

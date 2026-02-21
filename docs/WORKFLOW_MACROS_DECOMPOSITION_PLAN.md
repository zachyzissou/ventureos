# Workflow Macros Decomposition Plan (Issue #376)

## Goal
Reduce maintenance risk in `lib/workflow-macros.ts` by splitting defaults, recorder behavior, and core helper primitives into dedicated modules while preserving public API behavior.

## Baseline (2026-02-21)
- `lib/workflow-macros.ts`: 1800 LOC

## Stage 1 (completed)
- Extract prebuilt workflows + default shortcut command registration into `lib/workflow-macros-defaults.ts`.
- Extract reusable macro helper primitives into `lib/workflow-macros-helpers.ts`.
- Extract recorder implementation into `lib/workflow-recorder.ts`, re-exported from `lib/workflow-macros.ts`.
- Add line-budget guardrail in `lib/__tests__/maintainability-file-size-guard.test.ts`.

## Guardrails
- `lib/workflow-macros.ts` budget: <= 1300 LOC.

## Next stage
- Split `WorkflowMacroSystem` execution paths into separate orchestrator + rollback modules.

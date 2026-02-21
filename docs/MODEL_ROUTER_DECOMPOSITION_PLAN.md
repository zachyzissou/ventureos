# Model Router Decomposition Plan

Issue: #377  
Status: Stage 1 complete (interface-compatible extraction)

## Why
`lib/model-router.ts` combined policy evaluation, scoring, fallback resolution, and security telemetry in one module. This increased regression risk for routing behavior and made policy updates harder to review.

## Stage 1 (Completed)
- Extracted static config/constants into `lib/model-router-constants.ts`.
- Extracted stateful trackers into `lib/model-router-trackers.ts`:
  - `QuotaTracker`
  - `PerformanceTracker`
- Extracted policy evaluation into `lib/model-router-policy.ts`:
  - tier bound resolution
  - quota restriction evaluation
  - candidate filtering
- Extracted scoring into `lib/model-router-scoring.ts`:
  - per-candidate score breakdown
  - sorted candidate ranking
- Extracted fallback resolution into `lib/model-router-fallback.ts`.
- Extracted security/cost telemetry helpers into `lib/model-router-security.ts`.
- Preserved public API surface of `lib/model-router.ts` (backward-compatible imports/exports).

## Guardrails
- Line budget guard added in `lib/__tests__/maintainability-file-size-guard.test.ts`:
  - `lib/model-router.ts` must remain <= 750 lines.
- Expanded regression coverage in `lib/__tests__/model-router.test.ts` for:
  - policy precedence (`forceModel` vs BU forced model)
  - high-risk routing overriding restrictive max-tier policy
  - fallback behavior when quotas filter all available models

## Verification
- `npx jest --runInBand lib/__tests__/model-router.test.ts`
- `npm run build`

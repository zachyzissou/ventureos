# Code Factory Pipeline

Issue: #220

## What Shipped

This implementation adds a risk-tiered CI contract and supporting automation:

- machine-readable risk policy at `.github/code-factory/risk-policy.json`
- preflight risk analysis + evidence generation:
  - `scripts/code-factory-preflight.ts`
  - workflow: `.github/workflows/code-factory-preflight.yml`
- SHA-discipline enforcement:
  - `scripts/code-factory-verify-evidence.ts`
- simple-finding auto-remediation with fix-rate gating:
  - `scripts/code-factory-auto-remediate.ts`
  - `lib/code-factory.ts`
- harness-gap tracker primitives + dashboard API endpoints

## Risk Tiers

Path-based tiers:

- `high`: workflow/server/core/script/package files
- `medium`: UI/docs/souls/memory content
- `low`: everything else

Each tier maps to required checks in the policy contract.

## Evidence Model

Preflight generates a `pr_evidence` record keyed to `head_sha`:

- `risk_tier`
- `required_checks`
- `check_results`
- `browser_evidence` requirements
- matched rule trace for auditability

SHA validation blocks stale evidence reuse on new commits.

## Auto-Remediation Scope

Current remediable finding kinds:

- `console-log`
- `trailing-whitespace`
- `missing-final-newline`

CI enforces a `>=60%` fix rate for high-risk PRs when remediable findings exist.

## Dashboard Endpoints

- `GET /api/code-factory/risk-policy`
- `POST /api/code-factory/preflight`
- `GET /api/code-factory/harness-gaps`
- `POST /api/code-factory/harness-gaps`
- `PATCH /api/code-factory/harness-gaps/:id`


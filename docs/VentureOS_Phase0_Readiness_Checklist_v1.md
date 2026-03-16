# VentureOS Phase 0 Readiness Checklist v1

Date: 2026-03-16
Owner: Executive Office Director lane
Scope: executable pre-mobilization gate for the March 2026 Phase 0 kickoff.

## Gate

Phase 0 is ready only when every required item below is complete and the machine-readable readiness command passes:

```bash
npm run readiness:phase0
```

## Required checks

- [ ] `docs/VentureOS_Department_Architecture_v1.md` is present and treated as the normative architecture source.
- [ ] `runtime/logs/daily/` contains a fresh daily evidence set with dated canonical artifacts.
- [ ] `runtime/logs/weekly/` contains a current ISO-week rollup.
- [ ] `docs/LOCAL_INTEGRATION_CHECKLIST.md` is present and refreshed from the latest installer + queue evidence.
- [ ] `runtime/reports/openclaw-local-smoke/openclaw-local-ready-latest.json` is present and current when running in local integration mode.
- [ ] `runtime/reports/post-merge-cadence/post-merge-cadence-latest.json` and the latest `runtime/logs/git-hooks/post-merge-cadence-*.log` are fresh when hook mode is enabled.
- [ ] Stakeholder alignment and sequence of work are linked from GitHub issue `#603` and successor issues.
- [ ] Baseline measurement plan is approved in `docs/VentureOS_Baseline_Measurement_SOP_v1.md`.

## Evidence bundle

A passing readiness run must produce:

- `runtime/reports/phase0-readiness/phase0-readiness-latest.json`
- `runtime/reports/phase0-readiness/phase0-readiness-latest.md`

## Failure policy

If `npm run readiness:phase0` exits non-zero:

1. Phase 0 activation pauses.
2. The failing gate IDs are copied into the active GitHub issue.
3. Remediation evidence is produced before the readiness command is rerun.

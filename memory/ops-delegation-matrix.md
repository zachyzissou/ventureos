# Ops Delegation Matrix (Draft)

Mode: **B** (agents autonomous for L1; explicit approval required before any L2 work).
Default escalation destination: **SlurpNet alerts** `1466893115460812979`.

## Owners
- **Mission Control (echo)**: router/integrator/closer; creates issues, dispatches, composes approval asks.
- **Atlas**: infra/config/runtime health, cron stability, backups, disk, restarts (L1), proposes L2.
- **Sentinel**: guardrails, threat modeling, credential exposure, least-privilege.
- **Verifier**: tests, verification steps, regression checks.
- **Archivist**: docs/runbooks, indexing, postmortems.
- **Oracle**: research, external best practices.
- **Synth**: factories/pipelines, generation workflows.

## Conversion Pattern for Every Cron
1) Deterministic script emits one-line status or JSON.
2) Owner agent interprets + escalates:
   - OK → silent
   - WARN → alert + evidence
   - FAIL → alert + GitLab issue + (optional) L1 recovery attempt
3) Any L2 change requires approval **before** branch/MR/config edits.

## Next: fill in each existing cron
(We’ll enumerate current jobs and assign an owner + escalation channel.)

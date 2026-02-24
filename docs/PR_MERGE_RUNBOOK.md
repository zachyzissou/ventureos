# PR Merge Runbook

Use this runbook to keep merge execution predictable and auditable.

## Merge Cadence (Solo Maintainer)
Run this cadence whenever approvals land or at least once per working session:
1. Capture queue status in one command:
```bash
bash scripts/pr-queue-sweep.sh --json-out runtime/reports/pr-queue/queue-latest.json
```
2. If queue status is `merge-ready`, perform an evidence-backed dry-run:
```bash
bash scripts/pr-queue-sweep.sh --merge-approved --dry-run --report-dir runtime/reports/pr-queue
```
3. If dry-run output has no blocked candidates, execute merge sweep:
```bash
bash scripts/pr-queue-sweep.sh --merge-approved --report-dir runtime/reports/pr-queue
```
4. Link `queue-latest.json` and the merge evidence directory in the tracking issue/PR notes.

## Standard Path
1. Run merge-readiness check:
```bash
bash scripts/pr-merge-readiness.sh --pr <PR_NUMBER>
```
2. Run required-context alignment audit:
```bash
bash scripts/required-check-contexts.sh --pr <PR_NUMBER>
```
3. If status is `merge-ready` and required-context audit is `aligned-ready`, merge with your normal policy:
```bash
gh pr merge <PR_NUMBER> --merge --delete-branch
```
4. If status is `blocked`, follow the first `Recommended Next Action` from the readiness output.

## Merge Evidence Requirement
When using queue merge mode (`--merge-approved`), `pr-queue-sweep.sh` captures before-merge evidence per candidate PR:
- readiness report (`scripts/pr-merge-readiness.sh --json-out ...`)
- required-context audit (`scripts/required-check-contexts.sh --json-out ...`)

Candidates are merged only when both evidence checks return ready/aligned exit codes. Blocked candidates are skipped and recorded in queue merge output.

## Solo-Maintainer Fallback
When PRs are blocked by branch-protection requirements that cannot be satisfied in a single-operator window:
1. Record readiness output as evidence:
```bash
bash scripts/pr-merge-readiness.sh --pr <PR_NUMBER> --json-out runtime/reports/pr-merge-readiness/pr-<PR_NUMBER>.json
```
2. Record required-context audit output:
```bash
bash scripts/required-check-contexts.sh --pr <PR_NUMBER> --json-out runtime/reports/pr-required-checks/pr-<PR_NUMBER>.json
```
3. Post blocker details on the PR and linked issue (required approval/check context).
4. Keep implementation branch current and wait for required external approval/policy resolution.
5. Merge immediately once blocker conditions clear.

## Machine-Readable Status
`scripts/pr-merge-readiness.sh` returns:
- `0` when merge-ready
- `3` when blocked
- `2` when inputs are invalid

The JSON report includes:
- `status` (`merge-ready` or `blocked`)
- `blockers[]` with `id`, `summary`, and `nextCommand`
- `recommendedNextAction`

`scripts/required-check-contexts.sh` returns:
- `0` aligned and ready
- `3` required context drift (`missing-contexts`)
- `4` aligned but checks pending/failing
- `2` invalid inputs

## Related Commands
- Queue classification:
```bash
bash scripts/pr-queue-sweep.sh
```
- Queue classification + evidence JSON:
```bash
bash scripts/pr-queue-sweep.sh --json-out runtime/reports/pr-queue/queue-latest.json
```
- NPM shortcuts:
```bash
npm run pr:merge:readiness -- --pr <PR_NUMBER>
npm run pr:required-checks:audit -- --pr <PR_NUMBER>
npm run pr:queue:sweep
```

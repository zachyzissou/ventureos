# PR Merge Runbook

Use this runbook to keep merge execution predictable and auditable.

## Standard Path
1. Run merge-readiness check:
```bash
bash scripts/pr-merge-readiness.sh --pr <PR_NUMBER>
```
2. If status is `merge-ready`, merge with your normal policy:
```bash
gh pr merge <PR_NUMBER> --merge --delete-branch
```
3. If status is `blocked`, follow the first `Recommended Next Action` from the readiness output.

## Solo-Maintainer Fallback
When PRs are blocked by branch-protection requirements that cannot be satisfied in a single-operator window:
1. Record readiness output as evidence:
```bash
bash scripts/pr-merge-readiness.sh --pr <PR_NUMBER> --json-out runtime/reports/pr-merge-readiness/pr-<PR_NUMBER>.json
```
2. Post blocker details on the PR and linked issue (required approval/check context).
3. Keep implementation branch current and wait for required external approval/policy resolution.
4. Merge immediately once blocker conditions clear.

## Machine-Readable Status
`scripts/pr-merge-readiness.sh` returns:
- `0` when merge-ready
- `3` when blocked
- `2` when inputs are invalid

The JSON report includes:
- `status` (`merge-ready` or `blocked`)
- `blockers[]` with `id`, `summary`, and `nextCommand`
- `recommendedNextAction`

## Related Commands
- Queue classification:
```bash
bash scripts/pr-queue-sweep.sh
```
- NPM shortcuts:
```bash
npm run pr:merge:readiness -- --pr <PR_NUMBER>
npm run pr:queue:sweep
```

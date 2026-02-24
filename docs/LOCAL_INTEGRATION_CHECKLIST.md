# Local Integration Checklist (Installer + OpenClaw)

Last verified: 2026-02-24
Owner: VentureOS installer execution

## Checklist

- [x] Real-host installer adoption drill completed (non-destructive skip profile)
- [x] Integration adoption matrix generated (`adopt|merge|create|skip` targets)
- [x] Pre-install restore point captured and manifest validated
- [x] Revert command executed from generated restore point
- [x] Revert summary reports `errors=0`
- [x] Current readiness doc reflects latest local evidence

## Preflight Evidence Cadence (Issue #503)

Run this after onboarding/install execution changes are merged, especially when modifying:
- `scripts/ventureos-install.sh`
- `scripts/install-cron.sh`
- `scripts/refresh-local-integration-ready.sh`
- `scripts/openclaw-local-smoke.sh`

Required command:

```bash
bash scripts/run-install-preflight-evidence.sh \
  -- --openclaw-dir "$HOME/.openclaw" \
  --bridge-env "$PWD/config/bridge.env"
```

Merge-diff trigger command (runs preflight only when onboarding/install surfaces changed):

```bash
bash scripts/post-merge-preflight-trigger.sh \
  --base-ref HEAD~1 \
  --head-ref HEAD \
  -- --openclaw-dir "$HOME/.openclaw" --bridge-env "$PWD/config/bridge.env"
```

Combined post-merge cadence command (preflight trigger + queue snapshot trigger):

```bash
bash scripts/post-merge-cadence.sh
```

Optional auto-run on local merges/pulls (installs git post-merge hook):

```bash
bash scripts/install-post-merge-hook.sh
```

Hook health check:

```bash
bash scripts/post-merge-hook-health.sh --max-age-min 360
```

Then refresh this checklist from latest evidence:

```bash
bash scripts/refresh-local-integration-checklist.sh
```

Single-command cadence alternative:

```bash
bash scripts/run-local-integration-cadence.sh -- --openclaw-dir "$HOME/.openclaw" --bridge-env "$PWD/config/bridge.env"
```

Required artifacts for issue/PR evidence:
- `runtime/reports/ventureos-install/ventureos-install-preflight-<timestamp>.log`
- `runtime/reports/ventureos-install/ventureos-install-preflight-evidence-<timestamp>.json`
- `runtime/reports/ventureos-install/ventureos-install-preflight-evidence-<timestamp>.md`
- `runtime/reports/ventureos-install/ventureos-install-<timestamp>.md`
- `runtime/reports/ventureos-install/ventureos-install-adoption-<timestamp>.json`
- `runtime/reports/openclaw-local-smoke/openclaw-local-ready-latest.json` (reference/existence recorded)

Cadence checklist:
- [x] Real-host preflight evidence command executed after latest onboarding/install merge
- [x] Evidence JSON + Markdown attached/linked in tracking issue or PR
- [x] Installer report + adoption evidence paths included in evidence bundle
- [x] Readiness status JSON reference present in evidence bundle

## Latest Preflight Evidence Result (Issue #520)

- Date (UTC): `2026-02-24`
- Generated: `2026-02-24T21:41:27Z`
- Install result marker: `PREFLIGHT`
- Preflight evidence status: `PASS`
- Command:
  - `bash scripts/run-install-preflight-evidence.sh -- --openclaw-dir $HOME/.openclaw --bridge-env $PWD/config/bridge.env`

Evidence artifacts:
- `runtime/reports/ventureos-install/ventureos-install-preflight-evidence-latest.json`
- `runtime/reports/ventureos-install/ventureos-install-preflight-evidence-latest.md`
- `runtime/reports/ventureos-install/ventureos-install-preflight-20260224T214126Z.log`
- `runtime/reports/ventureos-install/ventureos-install-20260224T214127Z.md`
- `runtime/reports/ventureos-install/ventureos-install-adoption-20260224T214127Z.json`
- `runtime/reports/ventureos-install/ventureos-onboarding-20260224T214127Z.md`
- `runtime/reports/openclaw-local-smoke/openclaw-local-ready-latest.json`
- Restore point: `runtime/backups/ventureos-install/20260224T214127Z-93713/restore-point.json`

## PR Queue Execution Cadence (Issue #504)

Queue status command (single-command health snapshot):

```bash
bash scripts/pr-queue-sweep.sh --json-out runtime/reports/pr-queue/queue-latest.json
```

Post-merge queue trigger command:

```bash
bash scripts/post-merge-queue-snapshot.sh
```

Refresh checklist after queue snapshot:

```bash
bash scripts/refresh-local-integration-checklist.sh
```

Or run the unified cadence sweep (preflight + queue + checklist):

```bash
bash scripts/run-local-integration-cadence.sh -- --openclaw-dir "$HOME/.openclaw" --bridge-env "$PWD/config/bridge.env"
```

Optional merge execution (with automatic readiness evidence capture):

```bash
bash scripts/pr-queue-sweep.sh --merge-approved --report-dir runtime/reports/pr-queue
```

Queue cadence checklist:
- [x] Queue status JSON captured after approvals land
- [x] Merge mode output linked when merges are executed (N/A this run: no approved PRs)
- [x] Candidate PRs have readiness + required-check evidence artifacts before merge (N/A this run: queue empty)

## Latest Queue Cadence Result (Issue #522)

- Date (UTC): `2026-02-24`
- Queue status: `empty`
- Recommended action: `No open PRs in queue.`
- Queue summary counts:
  - total_open=`0` draft=`0` review_needed=`0` approved_merge_ready=`0` approved_blocked=`0`
- Command:
  - `bash scripts/pr-queue-sweep.sh --json-out runtime/reports/pr-queue/queue-latest.json`
- Artifact:
  - `runtime/reports/pr-queue/queue-latest.json`

## Latest Installer Drill Result

- Date (UTC): `2026-02-23`
- Installer run start: `20260223T212912Z`
- Installer status: `PASS`
- Revert run start: `20260223T212918Z`
- Revert status: `REVERTED`
- Revert summary: `restored=5 removed=0 skipped=1 errors=0`

## Commands Executed

```bash
bash scripts/ventureos-install.sh \
  --non-interactive \
  --verify \
  --skip-dashboard-install \
  --skip-bridge-launchagent \
  --skip-cron \
  --skip-readiness \
  --openclaw-dir "$HOME/.openclaw" \
  --bridge-env "$PWD/config/bridge.env"

bash scripts/ventureos-install.sh --non-interactive --revert <restore-point-dir>
```

## Evidence Artifacts

- Installer drill log: `runtime/reports/ventureos-install/issue-489-drill-20260223T212912Z.log`
- Revert drill log: `runtime/reports/ventureos-install/issue-489-revert-20260223T212918Z.log`
- Installer report: `runtime/reports/ventureos-install/ventureos-install-20260223T212913Z.md`
- Adoption evidence JSON: `runtime/reports/ventureos-install/ventureos-install-adoption-20260223T212913Z.json`
- Onboarding transcript: `runtime/reports/ventureos-install/ventureos-onboarding-20260223T212913Z.md`
- Restore point: `runtime/backups/ventureos-install/20260223T212913Z-52358`

## Tracking

- Issue: `#489`
- Related hygiene issue: `#490`
- Preflight cadence issue: `#520`
- Queue cadence issue: `#522`
- Checklist refresh automation issue: `#526`
- Unified cadence automation issue: `#528`
- Cron integration issue: `#530`
- Post-merge trigger automation issue: `#532`
- Post-merge queue snapshot issue: `#534`
- Unified post-merge cadence issue: `#536`
- Post-merge hook automation issue: `#539`
- Post-merge hook health issue: `#546`
- Related PR: `#491`

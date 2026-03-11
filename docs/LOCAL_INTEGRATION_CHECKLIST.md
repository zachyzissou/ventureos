# Local Integration Checklist (Installer + OpenClaw)

Last verified: 2026-02-23
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

Required artifacts for issue/PR evidence:
- `runtime/reports/ventureos-install/ventureos-install-preflight-<timestamp>.log`
- `runtime/reports/ventureos-install/ventureos-install-preflight-evidence-<timestamp>.json`
- `runtime/reports/ventureos-install/ventureos-install-preflight-evidence-<timestamp>.md`
- `runtime/reports/ventureos-install/ventureos-install-<timestamp>.md`
- `runtime/reports/ventureos-install/ventureos-install-adoption-<timestamp>.json`
- `runtime/reports/openclaw-local-smoke/openclaw-local-ready-latest.json` (reference/existence recorded)

Cadence checklist:
- [ ] Real-host preflight evidence command executed after latest onboarding/install merge
- [ ] Evidence JSON + Markdown attached/linked in tracking issue or PR
- [ ] Installer report + adoption evidence paths included in evidence bundle
- [ ] Readiness status JSON reference present in evidence bundle

## PR Queue Execution Cadence (Issue #504)

Queue status command (single-command health snapshot):

```bash
bash scripts/pr-queue-sweep.sh --json-out runtime/reports/pr-queue/queue-latest.json
```

Optional merge execution (with automatic readiness evidence capture):

```bash
bash scripts/pr-queue-sweep.sh --merge-approved --report-dir runtime/reports/pr-queue
```

Queue cadence checklist:
- [ ] Queue status JSON captured after approvals land
- [ ] Merge mode output linked when merges are executed
- [ ] Candidate PRs have readiness + required-check evidence artifacts before merge

## Latest Result

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
- Related PR: `#491`

# Tactical Map — CI/CD & Deployment

## CI Pipeline (`.github/workflows/tactical-map-ci.yml`)

Triggers on PRs and pushes to `main` touching `tactical-map/`, `lib/`, or `dashboard/`.

| Job | What it does | Required to merge |
|---|---|---|
| **test** | Unit + integration tests with coverage | ✅ Yes |
| **build** | Vite production build, artifact upload | ✅ Yes |
| **e2e** | Playwright E2E + visual regression | ⚠️ Advisory |
| **ci-summary** | Aggregated status report | — |

### Visual Regression

Visual regression tests live in `tests/e2e/*.visual.spec.ts`. They use Playwright's
built-in screenshot comparison. Baseline snapshots are stored in `-snapshots/` directories
next to the spec files and committed to the repo.

To update baselines after intentional UI changes:
```bash
cd tactical-map
npx playwright test tests/e2e/*.visual.spec.ts --update-snapshots
git add tests/e2e/**/*-snapshots/
```

## Deploy Pipeline (`.github/workflows/tactical-map-deploy.yml`)

### Staging (automatic)
Deploys on every push to `main` after tests pass. The built `dist/` artifact is
synced to the staging dashboard host.

### Production (manual + gated)
Requires `workflow_dispatch` with `target: production`. The `production` environment
must have protection rules requiring manual approval.

### Rollback via CI
Use `workflow_dispatch` with `rollback_sha` set to the commit SHA you want to
deploy. The pipeline will checkout that SHA, rebuild, and deploy.

## Local Deployment

The tactical map dist is served by the dashboard at `/map/`:

```bash
cd ~/clawd/ventureos/tactical-map
npm run build                      # Build to dist/
# Dashboard auto-serves from tactical-map/dist/
```

### Local Rollback

```bash
# List available backups
./tactical-map/scripts/rollback.sh --list

# Restore from latest backup
./tactical-map/scripts/rollback.sh

# Rebuild from a specific commit
./tactical-map/scripts/rollback.sh abc1234

# After rollback, restart dashboard
launchctl kickstart -k gui/$(id -u)/com.openclaw.dashboard
```

## Build Artifacts

Each CI run uploads:
- `tactical-map-dist-<sha>` — production build (retained 30 days)
- `coverage-report` — test coverage HTML (retained 14 days)
- `playwright-report-<sha>` — E2E test report (retained 14 days)
- `visual-snapshots-<sha>` — visual regression baselines (retained 30 days)

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `TACTICAL_MAP_API_PROXY_TARGET` | `http://127.0.0.1:8001` | API proxy in dev mode |

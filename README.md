# ventureos

> Coordination runtime for multi-agent systems, operational playbooks, and dashboard tooling.
> Status: `Production` (actively maintained)

![CI](https://github.com/zachyzissou/ventureos/actions/workflows/baseline-ts-ci.yml/badge.svg?branch=main)
![License](https://img.shields.io/github/license/zachyzissou/ventureos)
![Security](https://img.shields.io/badge/security-SECURITY.md-green)

## Overview

VentureOS is a TypeScript monorepo that coordinates multi-agent operations, dashboard observability, and tactical command UX in a production workflow.
It combines shared libraries, API services, and a web dashboard to track role readiness, mission health, and session handoffs with audit-friendly artifacts.
The repo currently acts as the local execution layer for roadmap delivery and readiness checks used in OpenClaw-integrated environments.

## Problem / value

- **Problem:** Operations visibility and reproducibility were fragmented across ad hoc scripts, docs, and one-off dashboards.
- **Value:** This repository centralizes orchestration logic, standardized checks, and reusable onboarding/verification flows under one maintained codebase.
- **Users:** Contributors building mission/control tooling, operators running local readiness drills, and maintainers running release/rollout workflows.

## Architecture

```text
Clients/Operators --> dashboard (UI + API) --> shared domain libs (lib/)
                                   |
                                   +--> tactical-map --> websocket/event pipelines
                                   |
                                   +--> scripts automation --> onboarding + verification jobs
                                   |
                                   +--> Git workflows --> PR checks + rollout gates
```

Source boundaries:
- **Core domain:** `lib/`
- **Dashboard runtime:** `dashboard/` (plus Next migration surface `dashboard-next/`)
- **Tactical map:** `tactical-map/` and `tactical-map-server/`
- **Automation:** `scripts/` and `.github/workflows/`
- **Docs + operating playbooks:** `docs/`

## Features

- ✅ Monorepo architecture with shared TypeScript domain logic.
- ✅ Dashboard + tactical-map split path for observability and command controls.
- ✅ Automated onboarding and readiness checks for OpenClaw (`scripts/*install*`, `scripts/openclaw-local-*`).
- ✅ Existing CI gates for accessibility, performance, and tactical-map quality.
- ✅ Local smoke and readiness verification workflows.
- ✅ Documentation and roadmap tracking with living status checks.
- ⏳ Planned: standardized baseline governance and PR readme/runbook expansion across core workflows.

## Tech Stack

- Runtime: Node.js 20+ (Ubuntu CI), TypeScript 5.x
- Frameworks/Libraries: React/Next for dashboard surfaces, Jest, Playwright, Better-SQLite3
- Tooling: npm, tsc, Jest, Playwright, GitHub Actions
- Storage: local SQLite + file-backed runtime report artifacts
- Deployments: Docker Compose and custom deployment scripts

## Prerequisites

- Node.js 20+ and npm
- On Linux/macOS: `git`, `make` optional for utility scripts
- Optional: Docker + docker-compose for hybrid runbook
- Optional: Python 3 + `scripts/docs-lint.py` runner for doc quality checks

## Installation

```bash
# from repository root
git clone https://github.com/zachyzissou/ventureos.git
cd ventureos
npm ci
```

Dashboard package install is covered by workspace resolution from root.

## Configuration

| Key | Required | Default | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | no | `production` | CI/runtime mode
| `DASHBOARD_PORT` | no | project-specific | Dashboard server binding port
| `LOG_LEVEL` | no | `info` | Structured logs (debug/info/warn/error)
| `BRIDGE_TOKEN_FILE` | no | none | Use secret-backed token file for bridge checks |
| `CRON_SCHEDULE` | no | workflow defaults | For readiness/check scheduling where applicable |

## Usage

```bash
# Launch dashboard workspace
git checkout main
npm install
npm run dashboard:dev
```

```bash
# Run local readiness smoke and checks
npm run openclaw:local-smoke
npm run openclaw:local-ready
npm run openclaw:local-ready:status
```

```bash
# Run tests/build pipelines
npm run test
npm run build
npm run test:e2e
```

### Reproducible output sample

```text
$ npm run openclaw:local-ready -- --skip-smoke
✅ Readiness report refreshed
✅ No stale readiness window detected
```

## Testing & quality

```bash
npm ci
npm run test
npm run build
# repository-specific smoke checks
npm run test:openclaw:local-smoke
```

Acceptance is expected from:
- Unit/regression suites (`jest`)
- Scripted onboarding validations in CI and local runs
- Workflow-specific gates in `.github/workflows`


## Security

- See [SECURITY.md](./SECURITY.md)
- Do not commit secrets, `.env` files, or credentials.
- Keep deployment and workflow tokens in repository secrets.
- Prefer branch-protected default branch (`main`) with review + CI gates.

## Contributing

1. Start from default branch: `main`.
2. Create a focused branch and include test evidence in PR description.
3. Run scoped checks and include outputs.
4. Link issue and architecture/doc references for behavior changes.
5. Obtain review and merge only after checks pass.

## Deployment / runbook

- **Deploy target:** Docker Compose and scripted deployment workflows in `.github/workflows` and `scripts/`.
- **Primary flow:** execute relevant workflow + smoke checks; verify `openclaw` readiness artifacts are updated.
- **Rollback:** revert merge commit or redeploy prior successful artifact and restart services.
- **Emergency:** stop/disable current deploy workflow path and revert container/service state as documented in repo runbooks.

## Troubleshooting

- **Symptom: readiness check stale failures**  
  Run `npm run openclaw:local-ready:status` and refresh artifacts under `runtime/reports/`.
- **Symptom: dashboard startup errors**  
  Confirm dependencies and build artifacts; run `npm run dashboard:build` and inspect startup scripts.
- **Symptom: npm install failure for native dependencies**  
  Rebuild/retry on supported OS image and confirm prebuilt module compatibility.

## Observability

- Health/state endpoints exposed by dashboard/services.
- Runtime artifacts under `runtime/reports/` and generated logs.
- GitHub workflow artifacts for readiness/build checks.
- Alerts/process: repo maintainers via existing issue/PR and runbook docs.

## Roadmap

- Baseline governance files + README depth harmonization across repo touchpoints.
- Expand observability and incident evidence bundle for each major workflow.
- Improve rollout safety + rollback auditability for deployments.
- Consolidate long-form runbooks where process drift has appeared.

## Known risks

- Some workflows are intentionally broad and may fail outside their intended trigger paths.
- Native module dependencies can be host-sensitive (`better-sqlite3` ABI issues).
- Multi-workspace monorepo test runtime can be long on cold CI nodes.

## Release notes / changelog

- `README` and governance baseline updates are part of the current operational hardening wave.
- No user-facing API behavior change in this PR.

## License & contact

- License: MIT (see repo metadata for exact terms if changed).
- Maintainer contact: `@zachyzissou`
- Security contact: via [SECURITY.md](./SECURITY.md)

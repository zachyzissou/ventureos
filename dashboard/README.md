# OpenClaw Dashboard

Operational dashboard for the OpenClaw multi-agent system — monitoring, session management, KPI tracking, and agent health.

> **Status:** Scaffold only. Code migration in progress per [ADR-001](../docs/decisions/001-merge-dashboard-into-monorepo.md).

## Quick Start

```bash
# From repo root
npm install

# Development (hot-reload)
npm run dashboard:dev

# Or from this directory
cd dashboard
npm run dev
```

## Scripts

| Script    | Description                          |
|-----------|--------------------------------------|
| `dev`     | Start dev server with hot-reload     |
| `start`   | Run production build                 |
| `build`   | Compile TypeScript to `dist/`        |
| `test`    | Run tests via Vitest                 |
| `compile` | Type-check without emitting          |

## Directory Structure

```
dashboard/
├── server/           # Express server & API
│   ├── routes/       # API route handlers
│   └── middleware/   # Auth, CORS, rate-limit, etc.
├── client/           # Static frontend assets
├── tests/            # Unit & integration tests
├── scripts/          # Build & deployment scripts
├── examples/         # Usage examples
├── docs/             # Dashboard-specific docs
├── package.json
├── tsconfig.json
└── README.md
```

## Architecture

See [ADR-001: Merge Dashboard into Monorepo](../docs/decisions/001-merge-dashboard-into-monorepo.md) for the full rationale and migration plan.

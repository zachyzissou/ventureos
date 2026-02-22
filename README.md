# VentureOS — Protoss Multi-Agent Operating System

**"En Taro Adun — Through the Khala, We Are One"**

VentureOS is a Protoss-themed RPG system overlay for multi-agent coordination, making agent performance visible, relational, and evolutionary.

## Quick Links

- **Master Plan:** [docs/RPG_SYSTEM.md](docs/RPG_SYSTEM.md) — Full spec, phases, KPIs, formulas
- **Dashboard:** [dashboard/](dashboard/) — Operational monitoring, KPI tracking, agent health ([API docs](dashboard/docs/API.md))
- **Roadmap Tracker:** [#138](https://github.com/zachyzissou/ventureos/issues/138) — Living delivery plan (source of truth)
- **Phase 5 Tactical Map:** [tactical-map/](tactical-map/) — Real-time 2D StarCraft-style command center

## Project Structure

```
ventureos/
├── dashboard/                 # Operational monitoring dashboard
│   ├── server/                # HTTP server & API (Node.js, no Express)
│   │   ├── routes/            # Modular API handlers (KPIs, observations, health)
│   │   └── middleware/        # Auth, CORS, rate-limit, security headers
│   ├── client/                # Static frontend (SPA)
│   ├── docs/API.md            # Complete API reference
│   └── scripts/install.sh     # Deployment installer
├── docs/
│   ├── RPG_SYSTEM.md          # Master plan (Protoss RPG spec)
│   ├── DASHBOARD.md           # Dashboard integration guide
│   ├── GITLAB_PROCESS.md      # Verification workflow
│   └── CRON_SPECS.md          # Cron job specifications
├── lib/                       # Shared libraries
│   ├── paths.ts               # Centralized path resolution
│   └── error-handler.ts       # Safe error serialization
├── tactical-map/              # Phase 5 StarCraft command center
│   ├── src/                   # TypeScript source
│   ├── tests/                 # Vitest test suite
│   └── server/                # Dev server (Vite)
├── tactical-map-server/       # Production server (Node.js)
│   └── middleware/            # Security middleware (TypeScript reference)
├── scripts/                   # Utility scripts
│   ├── spawn-with-verification.mjs  # Fresh context + dev↔verify loops
│   ├── spawn-with-retry.mjs         # Retry logic for reliability
│   └── estimation/            # Three-tier estimation framework
└── .gitlab/
    └── merge_request_templates/
        └── Fix.md             # P0/P1 fix template with verification checklist
```

## Current Status

### Completed

- ✅ **Phase 4:** VOXYZ Integration — Role Cards, KPI Registry, Voice RULES, Security Infrastructure, Conversation Orchestration (450+ lib tests)
- ✅ **Phase 5.0:** Prerequisites — Session bridge, Security architecture, MapState contract, Assets licensing
- ✅ **Phase 5.1:** Foundation — Security middleware, Rendering core
- ✅ **Phase 5.2:** Activity & Animation — Activity mapper, Building states, Unit sprites
- ✅ **Phase 5.3:** Khala Network — Bond visualization, affinity tiers, collaboration particles (#9)
- ✅ **Phase 5.4:** Resource Economy — Token budgets, cost tracking, sparklines, budget alerts (#15)
- ✅ **Phase 5.5:** Mission Tracking — Mission timeline, dependency arrows, completion animations, task queue (#16)
- ✅ **Phase 5.6:** Health & Diagnostics — Health indicators, alert overlays, metrics dashboard (#18)
- ✅ **Phase 5.7:** Interactive Controls — Agent detail panel, command palette, mission spawn, budget slider, undo/redo (#19)
- ✅ **Phase 5.8:** Replay & History — replay engine + session create/delete APIs shipped (#17)
- ✅ **P0 Remediation:** All security (VULN-002/003, XSS, auth bypass), QA (phantom tests, XSS coverage), and performance (N+1 query) issues resolved (#2–#6, #142–#149)
- ✅ **Dashboard Merge:** Monorepo consolidation — TypeScript migration, shared libraries, deployment procedures (epic #84)
- ✅ **Security Hardening:** Auth bypass fix, query-token removal, XSS sanitization, RPG static auth gating, action endpoint defense-in-depth, DoS body-read bounding (#142–#149)
- ✅ **Infrastructure:** CI/CD pipeline (#23), performance benchmarking suite (#24), accessibility audit WCAG 2.1 AA (#25), dashboard logs page (#137), live telemetry SSE, hybrid deployment design (#140)
- ✅ **P0 Infrastructure Sprint:** Estimation framework, Cron fixes, SQLite hardening, Session handoff docs

### In Progress

- 🔄 **Tracker Hygiene + Docs Accuracy:** status/docs parity and roadmap cleanup (#364)
- 🔄 **Docs Tooling Improvements:** reduce docs-lint false positives in instructional prose (#365)
- 🔄 **Server Maintainability:** decompose oversized dashboard server modules (#366)

### Next Up

- **Roadmap execution from #138:** convert living-plan items into tracked implementation issues/PRs
- **Phase 4.5:** Deep Progression System — extended levels, skill trees, XP diversification
- **Polish & Sound:** Audio atmosphere, voice lines, onboarding tour, help overlay

## Roadmap

Roadmap tracking lives in GitHub issue [#138: Roadmap: VentureOS delivery plan (living)](https://github.com/zachyzissou/ventureos/issues/138). That issue is the source of truth; this section is a high-level snapshot.

## Nexus 2.0 Trackable Milestones

Nexus-native execution plan and clarifications:
- Plan: [docs/NEXUS_2_0_MASTER_PLAN.md](docs/NEXUS_2_0_MASTER_PLAN.md)
- Clarifications: [docs/NEXUS_2_0_QA_CLARIFICATIONS.md](docs/NEXUS_2_0_QA_CLARIFICATIONS.md)
- Planning PR: [#283](https://github.com/zachyzissou/ventureos/pull/283)

Implementation milestones (visible incremental rollout):
- [M1 / #284 Contract Foundation](https://github.com/zachyzissou/ventureos/issues/284)
- [M2 / #285 Nexus Authority Plane](https://github.com/zachyzissou/ventureos/issues/285)
- [M3 / #286 Competition Engine](https://github.com/zachyzissou/ventureos/issues/286)
- [M4 / #287 Observability + Replay Authority](https://github.com/zachyzissou/ventureos/issues/287)
- [M5 / #288 Deployment Safety (Single Token First)](https://github.com/zachyzissou/ventureos/issues/288)
- [M6 / #289 Production Readiness Report](https://github.com/zachyzissou/ventureos/issues/289)

### Milestone status board

| Milestone | Scope | Issue | Status |
|---|---|---|---|
| M1 | Contract Foundation | [#284](https://github.com/zachyzissou/ventureos/issues/284) | Closed (2026-02-19) |
| M2 | Nexus Authority Plane | [#285](https://github.com/zachyzissou/ventureos/issues/285) | Closed (2026-02-21) |
| M3 | Competition Engine | [#286](https://github.com/zachyzissou/ventureos/issues/286) | Closed (2026-02-20) |
| M4 | Observability + Replay Authority | [#287](https://github.com/zachyzissou/ventureos/issues/287) | Closed (2026-02-21) |
| M5 | Deployment Safety | [#288](https://github.com/zachyzissou/ventureos/issues/288) | Closed (2026-02-21) |
| M6 | Production Readiness Report | [#289](https://github.com/zachyzissou/ventureos/issues/289) | Closed (2026-02-21) |


### Now (active)

- Docs/status reconciliation and roadmap archival cleanup (#364)
- Docs-lint signal quality improvements for instructional content (#365)
- Dashboard server module decomposition and maintainability cleanup (#366)
- Living roadmap stewardship in issue #138

### Next

- Deep Progression System (Phase 4.5) — skill trees, XP diversification, prestige ranks
- Polish & Sound — audio atmosphere, onboarding tour, guided help
- Close observability gaps (correlation IDs, report bundles)
- Repeatable production rollout workflow

### Later

- Richer logs UX (filter presets, export)
- Expanded in-map mission editing (#135)
- Deeper diagnostics drill-downs from dashboard cards
- Release notes / change log panel in dashboard

Now items map to currently open issues; see #138 and linked issues for live status.

## Development

### Prerequisites
- Node.js 25+ (for tactical-map)
- SQLite 3.x (for ventureos-rpg)

### Running the Tactical Map (Dev)
```bash
cd tactical-map
npm install
npm run dev  # Vite dev server on port 5174
```

### Running Tests
```bash
cd tactical-map
npm test  # Vitest
```

### Local OpenClaw Readiness
Run deterministic local OpenClaw integration smoke checks:
```bash
npm run openclaw:local-smoke
```

Run smoke and regenerate the readiness mission card/checklist:
```bash
npm run openclaw:local-ready
```

Run the cron-safe local readiness cadence wrapper:
```bash
npm run openclaw:local-ready:cron
```

Reference docs and artifacts:
- `docs/OPENCLAW_LOCAL_INTEGRATION_SMOKE.md`
- `docs/LOCAL_INTEGRATION_READY.md`
- `runtime/reports/openclaw-local-smoke/`

Current next steps (as of February 22, 2026):
1. `bash scripts/install-cron.sh --force`
2. `npm run openclaw:local-ready:cron`
3. Confirm Mission Control shows the latest `/api/openclaw-local-readiness` snapshot.
4. If bridge checks should pass, set `BRIDGE_TOKEN_FILE` and rerun `npm run openclaw:local-smoke -- --profile bridge`.
5. Track rollout follow-ups in issues `#431` and `#432`.

### Production Dashboard
Tactical map integrates with the VentureOS dashboard on port 8001:
```bash
# Dashboard serves tactical map at /map
http://192.168.225.149:8001/map
```

## GitHub Workflow

All implementation work is tracked and merged via GitHub issues + PRs:

1. **Issue created** (acceptance criteria + verification steps)
2. **PR opened** (link issue, include verification commands)
3. **Verification** (actual testing, not just code review)
4. **Copilot review addressed** (if comments are generated)
5. **Merge** (only after checks pass)

Legacy GitLab process notes remain in [docs/GITLAB_PROCESS.md](docs/GITLAB_PROCESS.md).

## Architecture

### Agent → Protoss Mapping

| Agent ID | Protoss Unit | Role |
|----------|--------------|------|
| **echo** | Artanis | CEO Orchestrator |
| **nexus** | Nexus | Mission Control Hub |
| **oracle** | Zeratul | Research & Foresight |
| **atlas** | Probe | Infrastructure Fabricator |
| **sentinel** | Sentinel | Security Guardian |
| **verifier** | Observer | Detection & QA |
| **archivist** | High Templar | Knowledge Keeper |
| **synth** | Dark Templar | Shadow Weaver / Creator |

### Psionic Attributes

6 real-time KPIs mapped to Protoss-themed stats:

1. **Psionic Mastery** (WIS) — Memory depth + archive impact
2. **Energy** (SPD) — Response time + recovery speed
3. **Shields** (STR) — Error resilience + recovery capability
4. **Strategic Vision** (INT) — Planning depth + foresight accuracy
5. **Psionic Bonds** (CHA) — Collaboration + teaching impact
6. **Templar Dedication** (CON) — Consistency + persistence

See [docs/RPG_SYSTEM.md](docs/RPG_SYSTEM.md) for formulas.

## Contributing

1. Create issue in GitHub (use templates where available)
2. Create branch (`git checkout -b fix/your-fix-name`)
3. Make changes + tests
4. Open PR (fill verification checklist in PR body)
5. Request/handle Copilot review
6. Merge after checks pass

## License

Internal VentureOS project — not open source.

---

**En Taro Adun, Executor.**

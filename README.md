# VentureOS — Protoss Multi-Agent Operating System

**"En Taro Adun — Through the Khala, We Are One"**

VentureOS is a Protoss-themed RPG system overlay for multi-agent coordination, making agent performance visible, relational, and evolutionary.

## Quick Links

- **Master Plan:** [docs/RPG_SYSTEM.md](docs/RPG_SYSTEM.md) — Full spec, phases, KPIs, formulas
- **Dashboard:** [dashboard/](dashboard/) — Operational monitoring, KPI tracking, agent health ([API docs](dashboard/docs/API.md))
- **GitLab Integration:** [docs/GITLAB_PROCESS.md](docs/GITLAB_PROCESS.md) — MR workflow for P0/P1 fixes
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
- ✅ **Phase 4:** VOXYZ Integration (Role Cards, KPI Registry, Voice RULES, Security Infrastructure, Conversation Orchestration) — ~77 min total, 450/450 tests passing
- ✅ **Phase 5.0:** Prerequisites (Session bridge, Security architecture, MapState contract, Assets licensing) — ~15h total
- ✅ **Phase 5.1:** Foundation (Security middleware, Rendering core) — ~30 min, 56 tests, 88.57% coverage
- ✅ **Phase 5.2:** Activity & Animation (Activity mapper, Building states, Unit sprites) — ~30 min, 172 tests, 88.58% coverage
- ✅ **P0 Infrastructure Sprint:** Estimation framework, Cron fixes, SQLite hardening, Session handoff docs — ~1.5h vs 10-14h estimate

### In Progress
- 🔄 **Phase 5.3:** Khala Network (Bonds + Pylon Network visualization)
- 🔄 **P0 Remediation:** Security (VULN-002, VULN-003), QA (QA-001, QA-002), Performance (PERF-003)

### Next Up
- **Phase 5.4:** Real-time Updates (WebSocket, SSE, optimistic UI)
- **Phase 5.5:** Campaign Integration (Deep progression, Teaching XP, Innovation traits)

## Development

### Prerequisites
- Node.js 25+ (for tactical-map)
- SQLite 3.x (for ventureos-rpg)
- GitLab access (http://slurpnet:9080)

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

### Production Dashboard
Tactical map integrates with openclaw-dashboard on port 7001:
```bash
# Dashboard serves tactical map at /map
http://192.168.225.149:7001/map
```

## GitLab Workflow

All P0 and P1 fixes **MUST** go through GitLab MRs with verification:

1. **Issue created** (acceptance criteria + verification steps)
2. **MR opened** (use `.gitlab/merge_request_templates/Fix.md`)
3. **Verification** (actual testing, not just code review)
4. **Merge** (only after verification passes)
5. **Announce** (only after merge)

See [docs/GITLAB_PROCESS.md](docs/GITLAB_PROCESS.md) for full workflow.

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

1. Create issue in GitLab (use templates)
2. Create branch (`git checkout -b fix/your-fix-name`)
3. Make changes + tests
4. Open MR (fill verification checklist)
5. Wait for Mission Control verification
6. Merge after verification passes

## License

Internal VentureOS project — not open source.

---

**En Taro Adun, Executor.**

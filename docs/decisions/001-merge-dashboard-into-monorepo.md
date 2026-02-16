# ADR-001: Merge openclaw-dashboard into VentureOS Monorepo

**Status:** Accepted  
**Date:** 2026-02-16  
**Decision-makers:** Zach Gonser  
**Technical lead:** Atlas (Architecture)  
**Analyst:** Oracle (Research)  

---

## Context

The OpenClaw dashboard (`openclaw-dashboard`) is a standalone Node.js server providing monitoring, session management, KPI tracking, and operational dashboards for the OpenClaw multi-agent system. Over time, it has grown tightly coupled to VentureOS:

- **5 VentureOS-specific API routes** (`/api/ventureos-kpis`, `/api/ventureos-agents`, `/api/ventureos-workflow-patterns`, `/api/ventureos-mission-control`, `/api/ventureos-observations`)
- **4 additional KPI/health routes** (`/api/kpis/latest`, `/api/kpis/history`, `/api/agent-health`, `/api/observations/*`)
- **Direct imports** from `ventureos-rpg` for RPG HTTP and conversation HTTP APIs
- **Shared data paths** reading from VentureOS runtime directories, KPI files, observation indices
- **Tactical Map** (already in VentureOS) is a dashboard component served from VentureOS

The two repositories have become a de facto monorepo split across two Git histories, creating friction in development, testing, and deployment.

## Decision

Merge `openclaw-dashboard` into the VentureOS monorepo as a new top-level package at `dashboard/`.

### Target Structure

```
ventureos/
├── dashboard/              # ← merged from openclaw-dashboard
│   ├── server/
│   │   ├── server.ts       # Main server (migrated from server.js)
│   │   ├── config.ts
│   │   ├── routes/
│   │   │   ├── kpis.ts
│   │   │   ├── observations.ts
│   │   │   ├── agent-health.ts
│   │   │   └── index.ts
│   │   └── middleware/
│   │       ├── auth.ts
│   │       ├── cors.ts
│   │       ├── rate-limit.ts
│   │       ├── security-headers.ts
│   │       └── audit-log.ts
│   ├── client/
│   │   ├── index.html
│   │   └── login.html
│   ├── tests/
│   ├── scripts/
│   │   └── install.sh
│   ├── docs/
│   │   └── *.png           # Screenshots
│   ├── package.json
│   └── tsconfig.json
├── tactical-map/           # Already here
├── tactical-map-server/    # Already here
├── lib/                    # Shared TS libraries
├── runtime/
├── role-cards/
├── docs/
│   └── decisions/          # This ADR
└── package.json            # Root workspace config
```

## Rationale

### Why Merge?

1. **Eliminate cross-repo coupling.** The dashboard already `require()`s files from `ventureos-rpg` via absolute paths and reads VentureOS runtime data. This is fragile — path changes break silently.

2. **Unified TypeScript pipeline.** VentureOS uses TypeScript (`ES2022`, `strict`). The dashboard is plain JavaScript (8,757 lines). Migrating to TS and sharing the build pipeline improves type safety, catches bugs at compile time, and enables code sharing via `lib/`.

3. **Single deployment unit.** Currently, dashboard deployment requires coordinating two repos. A monorepo means one `git pull`, one build, one deploy.

4. **Shared libraries.** The dashboard reimplements patterns already in `lib/` (error handling, configuration, validation). Merging allows direct imports.

5. **Consistent testing.** VentureOS has Jest + Playwright. The dashboard has a single test file. Merging brings dashboard code under the existing test infrastructure.

6. **Tactical Map precedent.** The tactical map (`tactical-map/`) is already a sub-package within VentureOS with its own `package.json`, `tsconfig.json`, and build pipeline. The dashboard follows the same pattern.

### Why Now?

- Dashboard just shipped Phase 5.1 security features (auth, CORS, rate limiting, audit logging)
- VentureOS Tactical Map integration is stabilizing (Phase 5.5 merged)
- Documentation assessment revealed C+ grade largely due to scattered docs across repos
- RPG API coupling makes independent evolution increasingly difficult

## Alternatives Considered

### 1. Keep Separate Repos with Better Contracts

**Approach:** Define formal API contracts between repos. Use npm packages or git submodules for shared code.

**Rejected because:**
- Adds tooling complexity (package publishing, version management)
- The coupling is deep (shared data files, runtime paths), not just API-level
- Git submodules are universally hated and hard to maintain
- Still requires coordinated deployments

### 2. Extract Shared Library to npm Package

**Approach:** Create `@ventureos/shared` npm package with common types, utilities, config.

**Rejected because:**
- Overhead of managing a third repo/package
- Version drift between consumers
- Only solves the code sharing problem, not the deployment or data coupling

### 3. Docker Compose / Service Mesh

**Approach:** Keep repos separate but deploy as coordinated services.

**Rejected because:**
- The dashboard is a single-process Node.js server, not a microservice
- Adds infrastructure complexity for a single-developer project
- Doesn't solve the code quality or type safety goals

### 4. Git Subtree Merge (preserve history)

**Approach:** Use `git subtree` to merge dashboard history into VentureOS.

**Considered but deferred:**
- Pro: Preserves full git history
- Con: Adds complexity; the dashboard history isn't referenced often
- Decision: Use a clean merge with a migration commit. Archive the old repo (read-only) for history if needed.

## Consequences

### Positive

- **Single source of truth** for all VentureOS frontend and backend code
- **Type safety** across dashboard ↔ VentureOS boundaries
- **Simpler CI/CD** — one pipeline to build, test, and deploy everything
- **Shared test infrastructure** — Jest + Playwright for all packages
- **Better documentation** — dashboard docs live alongside the system they monitor
- **Direct `lib/` imports** — no more `require(path.join(os.homedir(), 'clawd', 'ventureos-rpg', ...))`

### Negative

- **Larger repo** — ~9K lines of dashboard code added (manageable)
- **Migration effort** — JS → TS conversion, path rewiring, build pipeline updates
- **Deployment change** — existing launchd/systemd configs need updating
- **Temporary instability** — during migration, both repos may need maintenance

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Build pipeline conflicts | Medium | High | Dashboard gets own `tsconfig.json` extending root |
| Deployment breakage | Medium | High | Parallel deployment period; rollback procedure documented |
| Path references break | High | Medium | Comprehensive grep + automated test for all hardcoded paths |
| RPG API integration issues | Low | Medium | Existing integration tests cover this; add more during migration |

## Implementation Plan

See: [GitHub Epic Issue — Merge openclaw-dashboard into VentureOS monorepo](https://github.com/zachyzissou/ventureos/issues/)

### Phases

1. **Analysis & Planning** (Complete — this ADR)
2. **Repository Structure Setup** — Create `dashboard/` package scaffold
3. **Code Migration** — Copy files, convert JS → TS, update imports
4. **Build Pipeline** — Extend `tsconfig.json`, add build scripts
5. **API Integration** — Wire RPG-HTTP and conversation-HTTP directly
6. **Testing** — Port existing tests, add integration tests
7. **Deployment** — Update launchd/systemd, create new deploy scripts
8. **Documentation** — Migration guide, updated README, API docs
9. **Cleanup** — Archive old repo, remove cross-repo references

### Success Criteria

- [ ] Dashboard builds and serves from `ventureos/dashboard/`
- [ ] All existing API endpoints return identical responses
- [ ] TypeScript compilation passes with `strict: true`
- [ ] Existing tests pass in new location
- [ ] New integration tests cover VentureOS ↔ dashboard data paths
- [ ] Deployment scripts work on both macOS (launchd) and Linux (systemd)
- [ ] Old `openclaw-dashboard` repo archived with redirect notice
- [ ] Zero downtime during switchover (parallel deployment period)

## References

- [Dashboard Documentation Assessment (2026-02-13)](../../../.openclaw/workspace-archivist/memory/2026-02-13-dashboard-doc-assessment.md) — Grade: C+
- [VentureOS Architecture](./ARCHITECTURE.md)
- [Tactical Map as monorepo precedent](../tactical-map/package.json)

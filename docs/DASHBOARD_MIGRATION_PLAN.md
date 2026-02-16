# Dashboard → VentureOS Migration Plan

**Branch:** `plan/dashboard-merge-execution`
**Author:** Atlas (automated)
**Date:** 2026-02-16
**Status:** DRAFT — awaiting human approval before execution

---

## Executive Summary

Merge `openclaw-dashboard` (standalone, ~8.9K LoC) into `ventureos` as `dashboard/`, producing a single monorepo with unified TypeScript build, shared auth, and new backend APIs for three blank pages (Pylon Network, Live Conversations, Sessions). The dashboard currently runs as a plain Node.js HTTP server on port 8001; post-migration it will be a subdirectory of ventureos with its own `package.json` and build step, served from the same or a dedicated port.

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Target Architecture](#2-target-architecture)
3. [Phase 1: Repository Structure Setup](#phase-1-repository-structure-setup)
4. [Phase 2: Code Migration](#phase-2-code-migration)
5. [Phase 3: Build System Integration](#phase-3-build-system-integration)
6. [Phase 4: API Implementation](#phase-4-api-implementation)
7. [Phase 5: Testing & Deployment](#phase-5-testing--deployment)
8. [Build Pipeline Design](#build-pipeline-design)
9. [Deployment Strategy](#deployment-strategy)
10. [Testing Plan](#testing-plan)
11. [Effort Estimates & Critical Path](#effort-estimates--critical-path)
12. [Risk Register](#risk-register)
13. [Rollback Plan](#rollback-plan)

---

## 1. Current State Analysis

### openclaw-dashboard (standalone)

| Aspect | Detail |
|--------|--------|
| **Repo** | `github.com/tugcantopaloglu/openclaw-dashboard` (fork) |
| **Language** | JavaScript (CommonJS), HTML, inline CSS/JS |
| **Size** | ~8.9K LoC across server + frontend |
| **Server** | `server.js` — 2,670 lines, monolithic `node:http` handler |
| **Middleware** | `server/middleware/` — auth.js (291), cors.js (56), rate-limit.js (169), audit-log.js (76), security-headers.js (40) |
| **Routes** | `server/routes/` — kpis.js (51), observations.js (119), agent-health.js (119) |
| **Frontend** | `index.html` (4,992 lines — single-file monolith with inline CSS, HTML, JS) + `login.html` (158 lines) |
| **Config** | `server/config.js` — reads env vars for VENTUREOS_ROOT, SHARED_CONTEXT, KPI_DIR, OBSERVATIONS_DIR |
| **Dependencies** | Zero npm deps (pure `node:http`, `node:fs`, `node:crypto`) |
| **Port** | 8001 (env `DASHBOARD_PORT`) |
| **RPG integration** | Optional `require()` of `ventureos-rpg/api/rpg-http` and `conversation-http` (currently missing — `try/catch {}`) |
| **Custom elements** | `<tactical-overlay-panel>`, `<khala-network-graph>`, `<atlas-reliability-metrics>`, `<live-conversation-panel>`, `<agent-sprite>` — loaded from `/rpg/components/index.js` (file doesn't exist yet) |
| **API endpoints** | ~45 endpoints covering sessions, costs, system, memory, crons, git, VentureOS KPIs, observations, live SSE, RPG/psionic proxies, quick actions |

### ventureos (monorepo)

| Aspect | Detail |
|--------|--------|
| **Repo** | `github.com/zachyzissou/ventureos` (private) |
| **Language** | TypeScript (CommonJS in root, ESM in tactical-map) |
| **Size** | ~25K LoC in `lib/`, ~7.8K LoC in `tactical-map/src/` |
| **Build** | Root: `tsc --noEmit` (type-check only). Tactical-map: Vite build |
| **Test** | Jest (`ts-jest`) for lib, Vitest for tactical-map, Playwright for E2E |
| **CI** | GitLab CI: docs-lint, shellcheck, spawn tests |
| **Key libs** | `lib/conversation-engine.ts` (776 lines), `lib/conversation-api.ts` (154 lines), plus rate-limiter, model-router, mission-runner, etc. |
| **tactical-map** | Separate package: Vite + PixiJS, ESModule, its own `package.json` |
| **tactical-map-server** | Nascent: `middleware/` with auth.ts, cors.ts, csp.ts; `data/` dir |

### Three Blank Pages Needing Backend APIs

1. **Pylon Network** (`#rpg`) — Shows `<tactical-overlay-panel>`, `<khala-network-graph>`, `<atlas-reliability-metrics>`. Needs: `/api/rpg/*` endpoints (psionic-stats, khala-network, tactical-overlay, protocols, escalations). Currently proxied to missing `rpg-http.js`.

2. **Live Conversations** (`#conversations`) — Shows `<live-conversation-panel>`, `<agent-sprite>`. Needs: conversation list/create/messages API. VentureOS already has `conversation-api.ts` + `conversation-engine.ts` but no HTTP handler file (`conversation-http.js` is missing).

3. **Sessions** (`#sessions`) — Mostly functional! Uses `/api/sessions`, `/api/session-messages`, `/api/lifetime-stats`. Already implemented in `server.js`. **Not truly blank** — just needs polish and potential TypeScript port.

---

## 2. Target Architecture

```
ventureos/
├── lib/                          # Core TS libraries (existing)
├── scripts/                      # Ops scripts (existing)
├── role-cards/                   # Agent personas (existing)
├── tactical-map/                 # Vite + PixiJS frontend (existing)
├── dashboard/                    # ← NEW: merged dashboard
│   ├── package.json              #   Own deps + scripts
│   ├── tsconfig.json             #   Extends root tsconfig
│   ├── src/                      #   TypeScript source
│   │   ├── server.ts             #   Main server (ported from server.js)
│   │   ├── middleware/           #   Auth, CORS, rate-limit, etc.
│   │   │   ├── auth.ts
│   │   │   ├── cors.ts
│   │   │   ├── rate-limit.ts
│   │   │   ├── audit-log.ts
│   │   │   └── security-headers.ts
│   │   ├── routes/               #   API route handlers
│   │   │   ├── sessions.ts
│   │   │   ├── kpis.ts
│   │   │   ├── observations.ts
│   │   │   ├── agent-health.ts
│   │   │   ├── rpg-http.ts       # ← NEW: Pylon Network API
│   │   │   ├── conversation-http.ts  # ← NEW: Live Conversations API
│   │   │   └── system.ts
│   │   └── lib/                  #   Shared utilities
│   │       ├── config.ts
│   │       ├── helpers.ts
│   │       └── venture-cache.ts
│   ├── public/                   #   Static frontend files
│   │   ├── index.html
│   │   └── login.html
│   ├── dist/                     #   Compiled JS output (gitignored)
│   └── tests/
│       ├── auth-cookie.test.ts
│       └── api-integration.test.ts
├── config/                       # Existing config
├── docs/                         # Existing docs
├── package.json                  # Root package (existing)
├── tsconfig.json                 # Root tsconfig (existing)
└── jest.config.cjs               # Root test config (existing)
```

### Key Decisions

1. **Subdirectory, not submodule** — The dashboard becomes `dashboard/` with its own `package.json`. This is simpler than git submodules and allows shared `lib/` imports.

2. **TypeScript port** — Convert `.js` → `.ts` during migration. The server is 2,670 lines but highly mechanical (route handlers). TypeScript catches bugs at build time and aligns with the rest of ventureos.

3. **Shared `lib/` imports** — `dashboard/src/routes/conversation-http.ts` can import from `../../lib/conversation-api` directly, eliminating the broken `require(VENTUREOS_RPG_ROOT + '/api/rpg-http')` pattern.

4. **Keep the monolith HTML** — Don't try to componentize 5K lines of HTML/CSS/JS in this migration. Move it to `dashboard/public/` as-is. Componentization is a future effort.

5. **Own build step** — `dashboard/` gets `tsc` for server code, separate from the root `tsc --noEmit` and tactical-map's Vite.

---

## Phase 1: Repository Structure Setup

**Goal:** Create the directory scaffolding in ventureos, initialize `package.json` and `tsconfig.json`.

### Tasks

| # | Task | Description | Est |
|---|------|-------------|-----|
| 1.1 | Create `dashboard/` directory tree | `src/`, `src/middleware/`, `src/routes/`, `src/lib/`, `public/`, `tests/`, `dist/` | 10 min |
| 1.2 | Create `dashboard/package.json` | Zero external deps (inherit `@types/node`, `typescript` from root dev deps). Scripts: `build`, `dev`, `start`, `test` | 15 min |
| 1.3 | Create `dashboard/tsconfig.json` | Target ES2022, module CommonJS, outDir `./dist`, rootDir `./src`. Path aliases to resolve `../../lib/` | 15 min |
| 1.4 | Update root `.gitignore` | Add `dashboard/dist/`, `dashboard/node_modules/` | 5 min |
| 1.5 | Update root `package.json` | Add workspace script: `"dashboard:build"`, `"dashboard:dev"` | 5 min |

### Acceptance Criteria
- `cd dashboard && npm run build` runs (even if empty)
- Directory structure exists per target architecture
- Git tracks new files

**Phase 1 Total: ~50 min**

---

## Phase 2: Code Migration

**Goal:** Move all dashboard code into `ventureos/dashboard/`, converting JS → TS. Preserve git history via `git subtree` or `git log --follow`.

### Git History Strategy

**Option A: `git subtree add` (Recommended)**
```bash
cd ventureos
git subtree add --prefix=dashboard \
  https://github.com/tugcantopaloglu/openclaw-dashboard.git main \
  --squash
```
This preserves the full commit history from openclaw-dashboard as a single squashed commit in ventureos. Subsequent `git subtree pull` can sync upstream changes during transition.

**Option B: Manual copy + attribution**
Copy files manually, losing per-file history but keeping a clean commit. Add a commit message referencing the original repo and commit hash.

**Recommendation:** Option A for initial import, then restructure in follow-up commits.

### Tasks

| # | Task | Description | Est |
|---|------|-------------|-----|
| 2.1 | Git subtree import | Import openclaw-dashboard into `dashboard/` prefix | 15 min |
| 2.2 | Restructure after import | Move `server.js` → `src/server.ts`, `server/middleware/*.js` → `src/middleware/*.ts`, `server/routes/*.js` → `src/routes/*.ts`, `server/config.js` → `src/lib/config.ts` | 30 min |
| 2.3 | Move frontend files | `index.html` → `public/index.html`, `login.html` → `public/login.html` | 5 min |
| 2.4 | Port `server.js` to TypeScript | Convert 2,670 lines: add type annotations, replace `require()` with `import`, fix path references. **This is the biggest single task.** | 3-4 hr |
| 2.5 | Port middleware to TypeScript | auth.ts, cors.ts, rate-limit.ts, audit-log.ts, security-headers.ts — largely mechanical, ~630 lines total | 1 hr |
| 2.6 | Port routes to TypeScript | kpis.ts, observations.ts, agent-health.ts — ~290 lines total | 30 min |
| 2.7 | Port config to TypeScript | Already small (16 lines). Add proper types. | 10 min |
| 2.8 | Port test file | `auth-cookie.test.js` → `auth-cookie.test.ts` | 15 min |
| 2.9 | Update imports in server.ts | Replace `require('./server/middleware/auth')` → `import { authenticate } from './middleware/auth'`, etc. | 30 min |
| 2.10 | Remove RPG external require | Replace `require(VENTUREOS_RPG_ROOT + '/api/rpg-http')` with local `import from './routes/rpg-http'` (stub until Phase 4) | 15 min |
| 2.11 | Update static file paths | `__dirname` → `path.resolve(...)` for `public/` directory, update `/map/` static serving to reference tactical-map dist | 20 min |
| 2.12 | Clean up import artifacts | Remove `.bak` files, `nohup.out`, `.DS_Store` from imported tree | 5 min |

### Migration Notes

- **Keep CommonJS** for dashboard server code (matches ventureos root `"type": "commonjs"`). Use `import/export` syntax with `tsconfig` `module: "CommonJS"` — TypeScript compiles to `require()`.
- **Don't touch index.html** — It's a 5K-line monolith with inline JS. Moving it to `public/` is sufficient. Future effort: extract JS to `.ts` files, build with esbuild/Vite.
- **Custom elements** reference `/rpg/components/index.js` — this import will be updated to point to the new location in Phase 4.

**Phase 2 Total: ~6-7 hr**

---

## Phase 3: Build System Integration

**Goal:** Ensure `dashboard/` compiles, the compiled output serves correctly, and the CI pipeline includes it.

### Build Pipeline Design

```
dashboard/src/**/*.ts
       │
       ▼  tsc (dashboard/tsconfig.json)
dashboard/dist/**/*.js
       │
       ▼  node dashboard/dist/server.js
    HTTP server (port 8001)
       │
       ├── /api/*          → route handlers (compiled JS)
       ├── /               → dashboard/public/index.html
       ├── /login          → dashboard/public/login.html
       ├── /map/*          → ventureos/tactical-map/dist/
       └── /rpg/*          → dashboard/public/rpg/ (web components)
```

### Tasks

| # | Task | Description | Est |
|---|------|-------------|-----|
| 3.1 | Configure `dashboard/tsconfig.json` final | `outDir: ./dist`, `rootDir: ./src`, declaration: true, paths for `../../lib/*` | 20 min |
| 3.2 | Resolve cross-package imports | Dashboard server imports from `ventureos/lib/` (conversation-engine, etc.). Options: (a) TypeScript `paths` + `references`, (b) relative imports compiled to `require('../../lib/...')`. **Recommendation:** Use project references (`"references": [{ "path": ".." }]`) with root tsconfig `composite: true`. | 45 min |
| 3.3 | Add build scripts to `dashboard/package.json` | `"build": "tsc -p tsconfig.json"`, `"dev": "tsc -w -p tsconfig.json"`, `"start": "node dist/server.js"` | 10 min |
| 3.4 | Add root-level orchestration | Root `package.json`: `"dashboard:build": "cd dashboard && npm run build"`, `"build:all": "tsc -p tsconfig.json --noEmit && cd dashboard && npm run build && cd ../tactical-map && npm run build"` | 15 min |
| 3.5 | Validate compilation | Run `npm run dashboard:build`, fix all TS errors | 1-2 hr |
| 3.6 | Test local serve | Run compiled server, verify all existing endpoints work | 30 min |
| 3.7 | Update CI pipeline | Add dashboard build + test stage to `.gitlab-ci.yml` | 20 min |
| 3.8 | Add dev mode with watch | `"dev": "tsc -w & node --watch dist/server.js"` or use `ts-node` for development | 15 min |

### Cross-Package Import Strategy

The dashboard server needs to import from `ventureos/lib/`:
- `conversation-engine.ts` (for Live Conversations API)
- `conversation-api.ts` (for REST handler)
- Potentially `kpi-registry.ts`, `affinity-manager.ts` (for Pylon Network)

**Approach: TypeScript Project References**

Root `tsconfig.json` additions:
```json
{
  "compilerOptions": {
    "composite": true,
    "declaration": true
  }
}
```

`dashboard/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "references": [
    { "path": ".." }
  ],
  "include": ["src/**/*.ts"]
}
```

This lets `dashboard/src/routes/conversation-http.ts` do:
```typescript
import { ConversationAPI } from '../../lib/conversation-api';
```
and TypeScript resolves it through project references.

**Development builds:** Use `ts-node --project dashboard/tsconfig.json dashboard/src/server.ts` for quick iteration.
**Production builds:** `tsc --build dashboard/tsconfig.json` compiles both root `lib/` and `dashboard/src/`.

**Phase 3 Total: ~3-4 hr**

---

## Phase 4: API Implementation

**Goal:** Implement the three missing backend APIs so the blank pages become functional.

### 4A: RPG HTTP Handler (Pylon Network page)

The Pylon Network page expects these endpoints (currently proxied to missing `rpg-http.js`):

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/rpg/stats` | GET | All agents' psionic stats |
| `/api/rpg/stats/:agent` | GET | Single agent psionic stats |
| `/api/rpg/khala-network` | GET | Khala network graph data |
| `/api/rpg/khala-network/:agent` | GET | Agent's Khala bonds |
| `/api/rpg/tactical-overlay/:agent` | GET | Agent tactical overlay data |
| `/api/rpg/protocols/:agent` | GET | Agent protocols |
| `/api/rpg/escalations/:agent` | GET | Agent escalation data |

**Data sources:**
- `ventureos/lib/affinity-manager.ts` — Khala bond strengths
- Session data from `~/.openclaw/agents/*/sessions/` — activity metrics
- Role cards from `ventureos/role-cards/` — agent personas/stats
- SQLite DB (`ventureos-rpg.db`) — if RPG state is persisted

**Tasks:**

| # | Task | Est |
|---|------|-----|
| 4A.1 | Create `dashboard/src/routes/rpg-http.ts` — route dispatcher | 30 min |
| 4A.2 | Implement `/api/rpg/stats` — compute from session data + role cards | 1.5 hr |
| 4A.3 | Implement `/api/rpg/khala-network` — read affinity-manager data | 1 hr |
| 4A.4 | Implement `/api/rpg/tactical-overlay/:agent` — aggregate agent metrics | 1 hr |
| 4A.5 | Implement `/api/rpg/protocols` + `/api/rpg/escalations` | 45 min |
| 4A.6 | Create web components stub (`public/rpg/components/index.js`) if not already provided by tactical-map | 30 min |
| 4A.7 | Unit tests for rpg-http | 45 min |

**Subtotal: ~5.5 hr**

### 4B: Conversation HTTP Handler (Live Conversations page)

The Live Conversations page uses `<live-conversation-panel>` which likely polls an API. VentureOS already has `conversation-api.ts` with a full REST server — we just need to expose it as a route handler inside the dashboard server instead of a standalone server.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/conversations` | GET | List active conversations |
| `/api/conversations` | POST | Start new conversation |
| `/api/conversations/:id` | GET | Get conversation state |
| `/api/conversations/:id/context` | GET | Get conversation context |
| `/api/conversations/:id/messages` | POST | Send message |

**Tasks:**

| # | Task | Est |
|---|------|-----|
| 4B.1 | Create `dashboard/src/routes/conversation-http.ts` — adapter wrapping `ConversationAPI` | 1 hr |
| 4B.2 | Initialize `ConversationEngine` + `ConversationAPI` in server startup | 30 min |
| 4B.3 | Wire routes into dashboard server's request handler | 20 min |
| 4B.4 | Add SSE endpoint for real-time conversation updates (`/api/conversations/live`) | 45 min |
| 4B.5 | Unit tests for conversation-http | 45 min |

**Subtotal: ~3.5 hr**

### 4C: Sessions API Enhancement

The Sessions page is mostly working but could benefit from:

| # | Task | Est |
|---|------|-----|
| 4C.1 | Port existing session logic from server.js into `dashboard/src/routes/sessions.ts` | 45 min |
| 4C.2 | Add per-session token counting/cost aggregation | 30 min |
| 4C.3 | Add session timeline data endpoint | 30 min |
| 4C.4 | Unit tests | 30 min |

**Subtotal: ~2.25 hr**

### 4D: Update Frontend References

| # | Task | Est |
|---|------|-----|
| 4D.1 | Update `index.html` script imports to new paths | 20 min |
| 4D.2 | Ensure custom element definitions are bundled/available | 30 min |
| 4D.3 | Smoke test all pages in browser | 30 min |

**Subtotal: ~1.25 hr**

**Phase 4 Total: ~12.5 hr**

---

## Phase 5: Testing & Deployment

### Tasks

| # | Task | Description | Est |
|---|------|-------------|-----|
| 5.1 | Full test suite run | `cd dashboard && npm test` — all unit + integration tests pass | 30 min |
| 5.2 | E2E smoke test | Playwright: load each page, verify no console errors, check API responses | 1.5 hr |
| 5.3 | Update systemd/launchd service | Point service file from `openclaw-dashboard/server.js` → `ventureos/dashboard/dist/server.js` | 20 min |
| 5.4 | Environment variable audit | Ensure all env vars still resolve (DASHBOARD_PORT, OPENCLAW_DIR, VENTUREOS_ROOT, etc.) | 20 min |
| 5.5 | Update `install.sh` script | Port dashboard's `install.sh` to new paths | 30 min |
| 5.6 | Update root README | Document dashboard as part of ventureos | 20 min |
| 5.7 | Update CI pipeline | Ensure `.gitlab-ci.yml` includes dashboard build + test | 20 min |
| 5.8 | Deprecation notice on old repo | Add note to openclaw-dashboard README pointing to ventureos | 10 min |
| 5.9 | Final deploy + monitoring | Deploy, watch logs for 30 min | 30 min |

**Phase 5 Total: ~4 hr**

---

## Build Pipeline Design

### Development Flow

```bash
# Terminal 1: Watch TypeScript compilation
cd ventureos/dashboard
npm run dev          # tsc --watch

# Terminal 2: Run server with auto-restart
cd ventureos/dashboard
npm run start:dev    # node --watch dist/server.js

# Alternative: Single command with ts-node
npx ts-node --project tsconfig.json src/server.ts
```

### Production Build

```bash
# Full project build
cd ventureos
npm run build:all

# Which runs:
#   1. tsc -p tsconfig.json    (root lib/ type-check + emit declarations)
#   2. cd dashboard && tsc     (compile dashboard server)
#   3. cd tactical-map && vite build  (build frontend)
```

### Build Outputs

| Component | Source | Output | Tool |
|-----------|--------|--------|------|
| Root `lib/` | `lib/**/*.ts` | `lib/**/*.js` + `.d.ts` | `tsc` (project references) |
| Dashboard server | `dashboard/src/**/*.ts` | `dashboard/dist/**/*.js` | `tsc` |
| Tactical Map | `tactical-map/src/**/*.ts` | `tactical-map/dist/` | Vite |
| Dashboard frontend | `dashboard/public/` | Served as-is (no build) | — |

### API Bundling Strategy

No bundling needed for the server. TypeScript compiles to individual `.js` files maintaining the same directory structure. Node.js `require()` handles module resolution natively.

For the frontend custom elements (RPG components), if they need bundling:
```bash
# Optional: bundle web components with esbuild
npx esbuild dashboard/src/components/*.ts \
  --bundle --outfile=dashboard/public/rpg/components/index.js \
  --format=esm --platform=browser
```
This is only needed if we create new TypeScript web components. The existing inline JS in `index.html` requires no build step.

---

## Deployment Strategy

### Zero-Downtime Migration

```
Time ──────────────────────────────────────────────────►

  Old dashboard (port 8001)   │  New dashboard (port 8001)
  openclaw-dashboard/server.js │  ventureos/dashboard/dist/server.js
  ─────────────────────────────┤──────────────────────────────────────
                               │
                          Cutover point:
                          1. Build new dashboard
                          2. Stop old process
                          3. Start new process
                          (~2 seconds of downtime)
```

**Realistic assessment:** The dashboard is an internal tool accessed via Tailscale. A 2-second restart is acceptable. True zero-downtime (blue-green) is overkill.

### Cutover Steps

```bash
# 1. Build
cd ~/clawd/ventureos
npm run build:all

# 2. Verify build output
ls dashboard/dist/server.js

# 3. Stop old dashboard
pkill -f "node.*openclaw-dashboard/server.js" || true

# 4. Start new dashboard
cd dashboard
DASHBOARD_PORT=8001 node dist/server.js &

# 5. Smoke test
curl -s http://localhost:8001/api/system | jq .ok
# Expected: true

# 6. If smoke test fails → rollback (see below)
```

### Environment Variable Changes

| Variable | Old Value | New Value | Notes |
|----------|-----------|-----------|-------|
| `DASHBOARD_PORT` | 8001 | 8001 | **No change** |
| `DASHBOARD_HOST` | 0.0.0.0 | 0.0.0.0 | **No change** |
| `VENTUREOS_ROOT` | `~/clawd/ventureos` | `~/clawd/ventureos` | **No change** |
| `VENTUREOS_RPG_ROOT` | `~/clawd/ventureos-rpg` | *(removed)* | RPG is now internal to dashboard |
| `VENTUREOS_RPG_DB` | `~/clawd/agents/ventureos-rpg.db` | `~/clawd/agents/ventureos-rpg.db` | **No change** (DB location stays) |
| `WORKSPACE_DIR` | `~/clawd/openclaw-dashboard` | `~/clawd/ventureos/dashboard` | Update in service file |

### Port/Path Updates

- **No port change** — stays on 8001
- **Working directory changes** — from `~/clawd/openclaw-dashboard` to `~/clawd/ventureos/dashboard`
- **Static file paths** — `__dirname` references in `server.ts` updated to resolve `public/` from the new location
- **Tactical map dist** — served from `../../tactical-map/dist/` (relative to dashboard)

---

## Testing Plan

### Per-Phase Testing

| Phase | Test Type | What |
|-------|-----------|------|
| **Phase 1** | Structural | `npm run build` succeeds (empty project compiles) |
| **Phase 2** | Compilation | All `.ts` files compile without errors. `tsc --noEmit` passes |
| **Phase 2** | Regression | Start server, hit all 45 existing API endpoints, compare responses to old server |
| **Phase 3** | Integration | Built JS serves correctly. Cross-package imports resolve at runtime |
| **Phase 4** | Unit | Per-handler tests for rpg-http, conversation-http, sessions |
| **Phase 4** | API | HTTP-level tests: correct status codes, response shapes, auth enforcement |
| **Phase 5** | E2E | Playwright: load each page, verify rendering, check for console errors |
| **Phase 5** | Smoke | Post-deploy: `curl` each critical endpoint, verify 200s |

### Integration Test Coverage

```typescript
// tests/api-integration.test.ts

describe('Dashboard API Integration', () => {
  // Auth
  test('POST /api/login returns cookie on valid token');
  test('GET /api/sessions returns 401 without auth');
  
  // Core APIs
  test('GET /api/sessions returns array');
  test('GET /api/system returns ok: true');
  test('GET /api/costs returns cost breakdown');
  test('GET /api/memory returns memory files');
  
  // RPG / Pylon Network (Phase 4A)
  test('GET /api/rpg/stats returns agent stats');
  test('GET /api/rpg/khala-network returns graph');
  test('GET /api/rpg/tactical-overlay/:agent returns overlay');
  
  // Conversations (Phase 4B)
  test('GET /api/conversations returns list');
  test('POST /api/conversations creates conversation');
  test('POST /api/conversations/:id/messages sends message');
  
  // Sessions (Phase 4C)
  test('GET /api/sessions returns filtered results');
  test('GET /api/session-messages returns messages');
  test('GET /api/lifetime-stats returns aggregates');
  
  // SSE
  test('GET /api/live returns event stream');
});
```

### Smoke Tests for Deployment

```bash
#!/bin/bash
# smoke-test.sh — run after deployment

BASE="http://localhost:8001"
TOKEN=$(cat ~/clawd/openclaw-dashboard/data/.api-token)
FAIL=0

check() {
  local url="$1"
  local expect="$2"
  local status=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$BASE$url")
  if [ "$status" != "$expect" ]; then
    echo "FAIL: $url → $status (expected $expect)"
    FAIL=1
  else
    echo "OK: $url → $status"
  fi
}

check "/api/system" "200"
check "/api/sessions" "200"
check "/api/costs" "200"
check "/api/memory" "200"
check "/api/crons" "200"
check "/api/ventureos-agents" "200"
check "/api/rpg/stats" "200"
check "/api/conversations" "200"
check "/" "200"
check "/login" "200"

exit $FAIL
```

---

## Effort Estimates & Critical Path

### Summary

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| **Phase 1:** Repo Setup | 50 min | None |
| **Phase 2:** Code Migration | 6-7 hr | Phase 1 |
| **Phase 3:** Build Integration | 3-4 hr | Phase 2 |
| **Phase 4:** API Implementation | 12.5 hr | Phase 3 (for conversation-http, rpg-http imports) |
| **Phase 5:** Testing & Deploy | 4 hr | Phase 4 |
| **Total** | **~27-29 hr** | |

### Critical Path

```
Phase 1 → Phase 2 (server.ts port is the bottleneck)
                  → Phase 3 (can start middleware ports in parallel)
                            → Phase 4A (RPG API — independent)
                            → Phase 4B (Conversation API — needs lib/ imports working)
                            → Phase 4C (Sessions — mostly refactor)
                                      → Phase 5
```

**Bottleneck:** Phase 2, Task 2.4 (porting `server.js` to TypeScript) — 3-4 hours of mechanical but careful work.

### Parallelizable Work

These can run concurrently:

| Stream A (Server) | Stream B (APIs) | Stream C (Frontend) |
|-------------------|-----------------|---------------------|
| Phase 2.4: Port server.ts | Phase 4A.2-5: RPG endpoints (can develop against test harness) | Phase 4D: Frontend reference updates |
| Phase 2.5: Port middleware | Phase 4B.1-4: Conversation HTTP | — |
| Phase 3.2: Cross-package imports | — | — |

With 2 developers, total wall-clock time could be **~16-18 hours**.
With 1 developer (serial): **~27-29 hours** (~3.5 working days).

### Recommended Execution Order (Solo)

1. **Day 1 (8h):** Phase 1 + Phase 2 (through task 2.8)
2. **Day 2 (8h):** Phase 2 (finish) + Phase 3 (all)
3. **Day 3 (8h):** Phase 4A + Phase 4B
4. **Day 4 (5h):** Phase 4C + Phase 4D + Phase 5

---

## Risk Register

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| R1 | TypeScript port introduces runtime bugs | High | Medium | Keep old server.js as fallback. Run side-by-side comparison tests |
| R2 | Cross-package imports fail at runtime | Medium | Medium | Test early in Phase 3. Fallback: copy needed files into dashboard/ |
| R3 | index.html inline JS breaks with new paths | High | Low | Static files don't change. Only `__dirname`-based paths need updating |
| R4 | Missing RPG web components | Medium | High | The `<tactical-overlay-panel>` etc. are defined somewhere (likely was going to be `ventureos-rpg/`). Create stubs that render "Coming soon" if full implementation isn't ready |
| R5 | Conversation engine needs SQLite at runtime | Medium | Medium | `better-sqlite3` is already a ventureos dependency. Ensure `dashboard/package.json` references it |
| R6 | Git history loss | Low | Low | Using `git subtree add --squash` preserves commits in the merge commit. Original repo remains for full history |
| R7 | Service disruption during cutover | Low | Low | <5 seconds downtime. Internal tool only. Schedule during off-hours |

---

## Rollback Plan

### Immediate Rollback (< 1 min)

```bash
# Stop new dashboard
pkill -f "node.*ventureos/dashboard/dist/server.js"

# Start old dashboard
cd ~/clawd/openclaw-dashboard
node server.js &

# Verify
curl -s http://localhost:8001/api/system | jq .ok
```

### Post-Migration Rollback

If issues are discovered days later:
1. The old `openclaw-dashboard/` repo remains untouched on disk
2. The old repo's `main` branch is preserved on GitHub
3. Simply restart the old `server.js` and revert any service file changes

### Point of No Return

There is no true point of no return. Both codebases can coexist indefinitely. The old dashboard remains functional as long as we don't delete it. Recommended: keep `~/clawd/openclaw-dashboard/` for 30 days post-migration, then archive.

---

## Appendix A: File-by-File Migration Map

| Source (openclaw-dashboard) | Destination (ventureos/dashboard) |
|---|---|
| `server.js` | `src/server.ts` |
| `server/config.js` | `src/lib/config.ts` |
| `server/middleware/auth.js` | `src/middleware/auth.ts` |
| `server/middleware/cors.js` | `src/middleware/cors.ts` |
| `server/middleware/rate-limit.js` | `src/middleware/rate-limit.ts` |
| `server/middleware/audit-log.js` | `src/middleware/audit-log.ts` |
| `server/middleware/security-headers.js` | `src/middleware/security-headers.ts` |
| `server/routes/kpis.js` | `src/routes/kpis.ts` |
| `server/routes/observations.js` | `src/routes/observations.ts` |
| `server/routes/agent-health.js` | `src/routes/agent-health.ts` |
| `index.html` | `public/index.html` |
| `login.html` | `public/login.html` |
| `install.sh` | `scripts/install-dashboard.sh` |
| `scripts/rotate-dashboard-token.sh` | `scripts/rotate-dashboard-token.sh` |
| `tests/auth-cookie.test.js` | `tests/auth-cookie.test.ts` |
| `docs/` | `docs/dashboard/` (images only) |
| `README.md` | `docs/dashboard/DASHBOARD_README.md` (archived) |
| *(new)* | `src/routes/rpg-http.ts` |
| *(new)* | `src/routes/conversation-http.ts` |
| *(new)* | `src/routes/sessions.ts` |
| *(new)* | `src/routes/system.ts` |

## Appendix B: API Endpoint Inventory (45 endpoints)

<details>
<summary>Click to expand full endpoint list</summary>

**Auth:**
- `POST /api/login`
- `POST /api/logout`

**Core Data:**
- `GET /api/sessions`
- `GET /api/session-messages?session=X`
- `GET /api/usage`
- `GET /api/costs`
- `GET /api/system`
- `GET /api/tokens-today`
- `GET /api/config`
- `GET /api/response-time`
- `GET /api/lifetime-stats`
- `GET /api/health-history`
- `GET /api/tailscale`

**VentureOS:**
- `GET /api/ventureos-kpis`
- `GET /api/ventureos-agents`
- `GET /api/ventureos-mission-control`
- `GET /api/ventureos-workflow-patterns`
- `GET /api/ventureos-observations`
- `GET /api/ventureos-observation?file=X`
- `GET /api/workflow-patterns`
- `GET /api/mission-control`
- `GET /api/observations-index`
- `GET /api/observations?q=X`

**Memory & Logs:**
- `GET /api/memory`
- `GET /api/memory-files`
- `GET /api/memory-file?name=X`
- `GET /api/logs?n=X`
- `GET /api/crons`
- `GET /api/git`
- `GET /api/services`
- `GET /api/claude-usage`
- `POST /api/claude-usage-scrape`

**RPG / Pylon Network:**
- `GET /api/rpg/stats` (→ rpg-http)
- `GET /api/rpg/stats/:agent` (→ rpg-http)
- `GET /api/rpg/khala-network` (→ rpg-http)
- `GET /api/rpg/khala-network/:agent` (→ rpg-http)
- `GET /api/rpg/tactical-overlay/:agent` (→ rpg-http)
- `GET /api/rpg/protocols/:agent` (→ rpg-http)
- `GET /api/rpg/escalations/:agent` (→ rpg-http)
- `GET /api/psionic-stats` (alias)
- `GET /api/khala-network` (alias)
- `GET /api/tactical-overlay/:agent` (alias)

**Live:**
- `GET /api/live` (SSE)

**Actions:**
- `POST /api/action/restart-openclaw`
- `POST /api/action/restart-dashboard`
- `POST /api/action/clear-cache`
- `POST /api/action/restart-tailscale`
- `POST /api/action/update-openclaw`
- `POST /api/action/kill-tmux`
- `POST /api/action/gc`
- `POST /api/action/check-update`
- `POST /api/action/sys-update`
- `POST /api/action/disk-cleanup`
- `POST /api/action/restart-claude`

**Cron Management:**
- `POST /api/cron/:id/toggle`
- `POST /api/cron/:id/run`

</details>

---

## Appendix C: Decision Log

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| Subdirectory (not submodule) | Simpler tooling, shared imports, single `git clone` | Git submodule (too complex for internal tool) |
| TypeScript port | Aligns with ventureos, catches bugs, enables shared types | Keep JS (faster but misses the opportunity) |
| CommonJS module system | Matches ventureos root config, simpler for Node.js server | ESM (would require changing package.json type) |
| `git subtree add` for history | Preserves commits without submodule overhead | Manual copy (loses history), submodule (too complex) |
| Keep monolith HTML | 5K lines of working UI — rewriting is a separate project | Componentize (too much scope for this migration) |
| Project references for cross-imports | Official TypeScript solution for monorepo imports | Path aliases (runtime resolution issues), copy files (duplication) |

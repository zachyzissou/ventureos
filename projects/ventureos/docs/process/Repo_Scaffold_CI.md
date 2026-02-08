# VentureOS Repo Scaffold & CI (M0)

**Purpose:** Document the current repo layout, minimal local setup, and the M0 CI pipeline scaffold.

---

## Repository Structure (Current)
- `docs/` — Product/architecture docs (requirements, ERD, scaffold notes).
- `specs/` — Source spec pack(s) and reference requirements.
- `infra/` — Infrastructure assets and deployment artifacts.
  - `infra/unraid/` — Unraid/Tailscale deployment compose + ops notes.
- `.gitlab-ci.yml` — Minimal GitLab CI placeholder (lint/test stages).

---

## Local Dev / Usage (M0)
This repo is **documentation + infra-first** for M0. There is no application source code yet.

### Prereqs
- Git
- (Optional) Docker / Docker Compose (only if bringing up infra)

### Docs-Only Workflow
```bash
# Edit docs/specs as needed
# No build or test steps required yet
```

### Infra (Unraid) Workflow
See `infra/unraid/README.md` for full instructions. Quick start (on Unraid host):
```bash
docker compose --env-file .env up -d
```

---

## CI Pipeline (M0 Scaffold)
**File:** `.gitlab-ci.yml`

### Stages
1. **lint** — Placeholder job (echo only)
2. **test** — Placeholder job (echo only)

### Notes
- The pipeline is intentionally minimal and should pass in a docs-only repo.
- Replace placeholder scripts with real commands when code lands, e.g.:
  - `make lint`
  - `make test`
  - `npm run lint` / `npm test`
  - `cargo fmt --check` / `cargo test`

---

## Next Adjustments (When Code Arrives)
- Add language-specific toolchain setup (Node/Rust/Go/etc.)
- Add caching (e.g., `node_modules`, `~/.cargo`) if needed
- Add build/package steps and artifacts
- Gate merge requests on lint/test success

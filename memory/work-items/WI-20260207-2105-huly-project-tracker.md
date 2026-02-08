---
id: WI-20260207-2105-huly-project-tracker
status: parked
created: 2026-02-07T21:05:00-06:00
updated: 2026-02-07T21:49:00-06:00
owner: Zach / OpenClaw
scope: OpenClaw-Upgrade tracking system
tags: [huly, tracking]
gitlab_project: openclaw-upgrade
gitlab_issue: ""
---

# Work Item — Switch OpenClaw-Upgrade canonical project tracker to Huly

## Why (context)
- Zach decision (final): use **Huly** for project tracking. Huly is running locally on the Mac Studio, and an API key is ready.

## Definition of Done
- [ ] `projects/openclaw-upgrade/docs/WORK_TRACKING.md` updated: **Huly is canonical tracker** (GitLab issues become secondary/optional)
- [ ] Add a small, repo-owned Huly integration tool (script) to:
  - test auth
  - list projects
  - create issues in a specified Huly project
- [ ] Secrets handled safely (no API key committed; loaded from local env or `.credentials/`)
- [ ] (Optional) Seed Huly with OpenClaw-Upgrade backlog items from docs/GitLab

## Plan
1) Gather required config:
   - HULY_URL (base URL)
   - HULY_WORKSPACE (slug in /workbench/<workspace>)
   - HULY_TOKEN (API key)
   - HULY_PROJECT_IDENTIFIER (existing, or we create one)
2) Add `tools/huly/` under `projects/openclaw-upgrade` with Node script using `@hcengineering/api-client`.
3) Run connection test; then create/seed issues.

## Execution Log
- 2026-02-07 21:10 CST — Updated OpenClaw-Upgrade repo to make Huly canonical in tracking docs + templates.
- 2026-02-07 21:12 CST — Added repo-owned Huly tooling (`tools/huly`) using `@hcengineering/api-client`.
- 2026-02-07 21:17 CST — Added Huly sync scripts:
  - `sync-docs`: sync `projects/openclaw-upgrade/docs/*.md` into a Huly Documents teamspace
  - `seed-backlog`: seed issues from `docs/IMPLEMENTATION_TASKS.md` into a Huly tracker project

## Evidence / Artifacts
- Git commits (pushed to http://slurpnet:9080/zachgonser/openclaw-upgrade):
  - `115bcb8` — Switch canonical tracking to Huly; add Huly tooling
  - `503782b` — Add Huly sync scripts (docs + backlog seeding)
  - `b85af27` — Make backlog seeding idempotent (safe to re-run)
- Files added/updated:
  - `projects/openclaw-upgrade/docs/WORK_TRACKING.md`
  - `projects/openclaw-upgrade/.gitlab/merge_request_templates/Default.md` (requires Huly link)
  - `projects/openclaw-upgrade/tools/huly/*`

## Verification
- [x] FIND → VALIDATE → FIX → VERIFY (tooling + investigation)
- [x] Confirmed Huly Desktop is not exposing a local server suitable for automation on this host

## Outcome
- Parked: using GitLab as the project tracker (per updated decision).

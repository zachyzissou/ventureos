---
id: WI-20260207-2041-gitlab-project-tracking
status: doing
created: 2026-02-07T20:41:00-06:00
updated: 2026-02-07T20:56:00-06:00
owner: Zach / OpenClaw
scope: Tracking system + repo hygiene
tags: [gitlab, tracking, process]
---

# Work Item — Switch project tracking to local GitLab (remove OpenProject)

## Why (context)
- Zach direction: “we're no longer using openprojects. My goal is to use my local gitlab for now as a project tracker” (2026-02-07 20:41 CST)

## Definition of Done
- [ ] Git operations work cleanly (fix submodule/symlink conflict)
- [ ] OpenProject tooling references removed/archived (no active configs pointing at it)
- [ ] GitLab becomes canonical tracker (issues/boards/milestones)
- [ ] Repo gains GitLab issue/MR templates to enforce “fully featured” tracking

## Plan
1) Fix repo state: remove stale submodule entries and/or symlinks causing `git status` failure.
   - Currently failing on: `openproject-mcp-server` and `unraid-mcp` (both appear to be recorded as submodules but are now symlinks)
2) Add GitLab templates:
   - `.gitlab/issue_templates/Work Item.md`
   - `.gitlab/merge_request_templates/Default.md`
3) Update local Work Item template to include optional `gitlab_issue:` link.
4) Decide what to do with legacy OpenProject MCP server code (archive vs delete).

## Execution Log
- 2026-02-07 20:55 CST — Added GitLab issue/MR templates + tracking doc to `projects/openclaw-upgrade` repo

## Evidence / Artifacts
- Git commit (openclaw-upgrade): `1e1d895` — “Add GitLab work tracking templates + tracking doc” (pushed to origin)
- Files added:
  - `projects/openclaw-upgrade/docs/WORK_TRACKING.md`
  - `projects/openclaw-upgrade/.gitlab/issue_templates/Work Item.md`
  - `projects/openclaw-upgrade/.gitlab/merge_request_templates/Default.md`
- Files modified:
  - `projects/openclaw-upgrade/docs/DOC_INDEX.md`

## Verification
- [ ] Followed FIND → VALIDATE → FIX → VERIFY

## Links
- Canonical tracker (GitLab):
  - Issue #21 — Repo hygiene: fix clawd git status (submodule ↔ symlink conflicts)
    - http://slurpnet:9080/zachgonser/openclaw-upgrade/-/issues/21
  - Issue #22 — Decommission OpenProject integration (configs/tools)
    - http://slurpnet:9080/zachgonser/openclaw-upgrade/-/issues/22

## Follow-ups
- [ ] Get your local GitLab base URL (if not `http://192.168.4.225/`) and preferred labels/milestones

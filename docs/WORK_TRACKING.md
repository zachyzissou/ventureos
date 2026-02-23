# Work Tracking (GitHub = Source of Truth)

This repository is the **canonical tracker + implementation repo** for VentureOS (built on OpenClaw).

## Source of Truth
- **GitHub Issues** in this repo are the source of truth for:
  - scope, acceptance criteria, and priority
  - progress state (open / in progress / blocked / done)
  - decisions + tradeoffs
  - verification evidence
- **GitHub Pull Requests** are the source of truth for code and doc changes.

## Rules (Non-Negotiable)
1. **No non-trivial work without an issue.**
   - If it takes **>10 minutes**, touches infra, changes behavior, or adds a new workflow -> create/link an issue.
2. **Every PR must link an issue** and include verification evidence.
3. **Definitions beat vibes.** Every issue needs:
   - Why / context
   - Definition of Done
   - Verification steps (what we ran / checked)
   - Evidence/artifacts (files, logs, commands, screenshots)

## Local Agent Memory (secondary)
The agent maintains local work logs under `~/clawd/memory/work-items/` for continuity across sessions.

**Policy:** Local work items are helpful, but they must link back to the GitHub issue URL (GitHub is canonical).

## Suggested Labels
- `bug`, `enhancement`, `documentation`, `security`
- `P0`, `P1`, `P2` (priority)
- `architecture`, `backend`, `dashboard`, `qa`

## Templates
- Issue template: `docs/templates/github-issue-template.md`
- PR template: `docs/templates/github-pr-template.md`

## Note: Huly
We attempted a Huly-based tracker workflow, but Huly Desktop on this machine is not exposing a local server for automated import. If/when a self-hosted Huly backend is available, we can revisit.

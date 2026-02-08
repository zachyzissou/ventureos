# Work Tracking (GitLab = Source of Truth)

This repository is the **canonical tracker + implementation repo** for upgrading OpenClaw.

## Source of Truth
- **GitLab Issues** in this repo are the source of truth for:
  - scope, acceptance criteria, and priority
  - progress state (Todo / Doing / Blocked / Done)
  - decisions + tradeoffs
  - verification evidence
- **GitLab Merge Requests** are the source of truth for the actual code/doc change.

## Rules (Non‑Negotiable)
1. **No non-trivial work without an issue.**
   - If it takes **>10 minutes**, touches infra, changes behavior, or adds a new workflow → create/link an issue.
2. **Every MR must link an issue** and include verification evidence.
3. **Definitions beat vibes.** Every issue needs:
   - Why / context
   - Definition of Done
   - Verification steps (what we ran / checked)
   - Evidence/artifacts (files, logs, commands, screenshots)

## Local Agent Memory (secondary)
OpenClaw maintains local work logs under `~/clawd/memory/work-items/` for continuity across sessions.

**Policy:** Local work items are helpful, but they must link back to the GitLab Issue URL (GitLab is canonical).

## Suggested Labels
- `type::bug`, `type::feature`, `type::docs`, `type::ops`
- `prio::p0`, `prio::p1`, `prio::p2`, `prio::p3`
- `area::reliability`, `area::proactive`, `area::mission-control`, `area::memory`, `area::infra`

## Templates
- Issues: `.gitlab/issue_templates/`
- Merge requests: `.gitlab/merge_request_templates/`

## Note: Huly
We attempted a Huly-based tracker workflow, but Huly Desktop on this machine is not exposing a local server for automated import. If/when a self-hosted Huly backend is available, we can revisit.

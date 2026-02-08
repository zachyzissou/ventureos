# Memory Heartbeat Extraction - 2026-02-08

**Timestamp**: 1770540132 (2026-02-08 02:42 CST)

## Key Facts Extracted

### Decisions / Direction
- Routed cron announce outputs to **SlurpNet alerts** (Discord channel:1466893115460812979) to prevent DM flood; StantonTimes approval drafts remain in the dedicated approvals channel.
- Venture Studio OS direction: design a ~20-agent “venture studio OS” (working title: **VentureOS**) spanning Unity game dev, app dev, infra (Unraid/Mac/Windows nodes; possible VPS edge), AI generation pipelines (image/3D/audio/code/writing), and running/launching companies (incl. scaling StantonTimes into a multi-account network).
- Obsidian is the canonical context source.
- Work must be **trackable and fully featured** (tickets/work items, evidence, verification). User wants an explicit ping/check-in when I’m done with a work block.
- Project tracker decision finalized: **local GitLab is the canonical tracker** (`http://slurpnet:9080/`). **OpenProject retired**. Huly attempt parked.

### Work Tracking Implementation
- Started file-based Work Item system under `memory/work-items/` and updated `memory/METHODOLOGY.md` to require Work Items for non-trivial work.
- Integrated GitLab tracking scaffolding into `projects/openclaw-upgrade` (WORK_TRACKING doc, templates, labels/milestones/board; meta VentureOS issue created).

### Ops / Repo Hygiene
- Closed GitLab issues #1–26 (including #21 after adding MCP directory ignores); issue #27 in progress.
- Commits: `71126a4`, `058704a`.
- Docs updates for queue metadata.
- Repo hygiene: symlink work.
- Fixed `~/clawd` git failure caused by stale submodule gitlinks recorded in index while paths are now symlinks.
  - Commit: `e5c2e8c` “Repo hygiene: remove stale submodule gitlinks; track unraid-mcp as symlink”.
- Push to `origin` (SSH `git@192.168.4.225`) timing out; HTTP GitLab remote exists, but `main` is behind remote (non-fast-forward).
- Disabled failing cron job **“Memory Fact Extraction”** (job id `90f7a25c-79bc-4de2-b8a0-297c0af33c22`) due to invalid model id `anthropic/claude-3-5-sonnet`.
- StantonTimes: `projects/stanton-times/data/state.json` at ~151KB (>100KB threshold). Investigation shows bulk is `pending_stories` (~69 items). Attempted to run cleanup via `python3 src/app.py cleanup`, but it failed due to `ModuleNotFoundError: No module named 'src'` when executed that way.

### User Notes
- User planned to restart the computer (Mac Studio) shortly after this work block.

### Subscription Quotas / Budget Tracking
- Updated `memory/subscription-quotas.json` with model weights and reset timestamps for **Claude Max**, **ChatGPT Plus**, and **Gemini Advanced** (last reset: 2026-02-08T15:07:20.602Z).

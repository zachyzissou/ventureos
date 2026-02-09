## Weekly Synthesis - 2026-02-07
- Consolidated 1217 task runs from StantonTimes
- Updated VentureOS naming strategy documentation
- Archived 48 legacy project files

## Weekly Synthesis - 2026-02-08
- Routed cron announce outputs to SlurpNet alerts (Discord channel:1466893115460812979); StantonTimes approvals stay in the dedicated approvals channel.
- VentureOS direction reaffirmed: ~20-agent venture studio OS; **GitLab is source of truth**; Obsidian is *notes* (supporting, not canonical); work must be fully trackable (tickets/evidence) with explicit ping/check-in on completion.
- Project tracking finalized: local GitLab (`http://slurpnet:9080/`) is canonical; OpenProject retired; Huly attempt parked.
- Work tracking implementation: file-based Work Items under `memory/work-items/`; `memory/METHODOLOGY.md` updated to require Work Items for non-trivial work; GitLab tracking scaffolding added to `projects/openclaw-upgrade` (meta issue created).
- Repo hygiene: removed stale submodule gitlinks and tracked `unraid-mcp` as symlink (commit `e5c2e8c`); SSH push to `git@192.168.4.225` timing out, HTTP GitLab remote exists but `main` is behind remote.
- Disabled failing cron job “Memory Fact Extraction” (job id `90f7a25c-79bc-4de2-b8a0-297c0af33c22`) due to invalid model id `anthropic/claude-3-5-sonnet`.
- StantonTimes: `projects/stanton-times/data/state.json` ~151KB (bulk pending_stories ~69 items); cleanup attempt via `python3 src/app.py cleanup` failed with `ModuleNotFoundError: No module named 'src'`.
- Updated `memory/subscription-quotas.json` with model weights/reset timestamps for Claude Max, ChatGPT Plus, and Gemini Advanced.

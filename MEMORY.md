## Daily Log - 2026-02-11
- Home Assistant: fixed Middle Bed Samsung TV power reliability by adding explicit wake_on_lan to config and updating `script.watch_roku_middle_bed` to send a magic packet to MAC `f4:dd:06:89:35:75` before power/input; HA core restarted.
- WHOOP morning check-in: fixed empty `**Suggestions:**` header in `skills/whoop/bin/whoop-morning.mjs` (collect into array, skip header if empty). Added empty-section-header rule to Echo SOUL.md and Morning Briefing cron prompt.
- rebuild-prompts.mjs: fixed gateway PID detection — macOS `pgrep` can't see `openclaw-gateway`; switched to `ps -eo pid,comm | grep 'openclaw-gateway'`.
- HA scripts created: `script.watch_tv_theater` (AppleTV Theater source) and `script.watch_tv_living` (AppleTV Living source). Theater script intentionally excludes lighting (separate scene later).
- Bloom MR !40 still has merge conflicts — user aware, no action yet.
- Multi-agent audit: Echo SOUL.md updated to forbid curl/hardcoded tokens in dispatches, use mcporter gitlab instead. Reset crashed Sentinel + confused Verifier sessions.
- HA IP changed: 192.168.225.133 → 192.168.225.132 (credentials updated).
- HA HomeKit/Siri: created automation `middle_bed_source_roku` — triggers on source change to "Roku 2", handles WOL + TV power + KEY_HDMI1 (direct, not cycling). Roku is on HDMI 1. Siri "watch Roku in the middle bed" works.
- HomeKit bridge overhaul: trimmed domains 14→8, excluded 22 entities, reset corrupted bridge pairing (entry_id `01KH0PTC9WSYR3RCYCGNXXR7T9`). Error "Could not change settings" resolved.
- Entity area propagation: jq script applied device areas → entity `area_id` in `core.entity_registry` (113→277 entities). HomeKit can't auto-assign rooms (HAP limitation); manual only.
- Roku Ultra device: renamed "Roke Middle Bed" → "Roku Middle Bed", area corrected patio→middle_bed.
- Peekaboo: Home app is Catalyst (iPad) app — AX automation impossible. Peekaboo Accessibility detection has a bug (shows ❌ despite being granted).
- Speco Blue cameras: NVR + 9 cameras configured in HA. Details in CREDENTIALS.md.
- ONVIF integration complete: all 9 cameras streaming in HA (admin creds), 27 entities renamed. Camera models: O4VT2G/O4FT2/O4VT2.
- HomeKit bridge camera attempt failed — architectural limitation (bridge mode can't stream video). Accessory mode required (like TVs). Awaiting user approval.
- config_entries corruption: SSH pipe-through-jq truncated file 42→6 entries; recovered from `/tmp/config_entries_cam.json`. **Rule: use HA REST API only, never SSH file editing.**
- HA options flow API: `/api/config/config_entries/options/flow` — multi-step (init→exclude→cameras). Used for all bridge config changes now.
- Details in `memory/2026-02-11-homekit-cameras.md`.
- Agent rename: Mission Control "Echo" → "Nexus" (agent ID stays `echo`). Discord channel renamed `#echo-mission-control` → `#nexus-mission-control`. SOUL.md + gateway config updated.
- Dispatch routing fix: added `subagents.allowAgents` (all 8 agent IDs) to both `main` and `echo` agents — without this, `agents_list` returned empty and `sessions_spawn` couldn't target team agents. Not yet verified end-to-end.
- Discord channel ID reference saved in `memory/2026-02-11.md`.

## Weekly Synthesis - 2026-02-07
- Consolidated 1217 task runs from StantonTimes
- Updated VentureOS naming strategy documentation
- Archived 48 legacy project files

## Weekly Synthesis - 2026-02-09
- Built Screen Innovations Troy shade integration for Home Assistant — 7 SDN cover entities with position tracking via unauthenticated CGI API (`troy.lan:80`)
- Troy credentials discovered — stored in CREDENTIALS.md (mode 600)
- Troy CLI script at `skills/homeassistant/scripts/troy.sh` (Python, C4 scale 100=open)
- HA SSH access configured via Terminal & SSH add-on (key: `~/.ssh/ha_ed25519`)
- Assigned 101 HA entities to rooms (covers, lights, thermostats, media players)
- HomeKit Bridge active but most devices in "Default Room" — pending user go-ahead to reorganize
- Detailed device table and API reference in `memory/2026-02-09-troy-homeassistant.md`
- StantonTimes fully disabled (LaunchAgents + crontab removed) until draft quality P0s are fixed; auto-approve tiers implemented with high thresholds (official 0.95, trusted 0.98); 6 GitLab issues filed (#10–#15)
- Multi-agent rollout completed: all 7 role agents now have SOUL/AGENTS; Atlas owns infra/monitoring crons; Echo autonomy rules updated to self-merge and stop asking for approvals
- Pool lights server LaunchAgent added (survives reboot); user explicitly parked HA/pool-lights work for now

## Weekly Synthesis - 2026-02-08
- Routed cron announce outputs to SlurpNet alerts (Discord channel:1466893115460812979); StantonTimes approvals stay in the dedicated approvals channel.
- VentureOS direction reaffirmed: ~20-agent venture studio OS; **GitLab is source of truth**; Obsidian is *notes* (supporting, not canonical); work must be fully trackable (tickets/evidence) with explicit ping/check-in on completion.
- Project tracking finalized: local GitLab (`http://slurpnet:9080/`) is canonical; OpenProject retired; Huly attempt parked.
- Work tracking implementation: file-based Work Items under `memory/work-items/`; `memory/METHODOLOGY.md` updated to require Work Items for non-trivial work; GitLab tracking scaffolding added to `projects/openclaw-upgrade` (meta issue created).
- Configured VentureOS multi-agent + Discord routing: role channels under “VentureOS — Roles”; created isolated `echo` (Mission Control) agent with workspace `~/.openclaw/workspace-echo` and agentDir `~/.openclaw/agents/echo/agent`; routed `echo-mission-control` to it, fixed permissions, and verified per-channel responses.
- Repo hygiene: removed stale submodule gitlinks and tracked `unraid-mcp` as symlink (commit `e5c2e8c`); SSH push to `git@192.168.4.225` timing out, HTTP GitLab remote exists but `main` is behind remote.
- Disabled failing cron job “Memory Fact Extraction” (job id `90f7a25c-79bc-4de2-b8a0-297c0af33c22`) due to invalid model id `anthropic/claude-3-5-sonnet`.
- StantonTimes: `projects/stanton-times/data/state.json` ~151KB (bulk pending_stories ~69 items); cleanup attempt via `python3 src/app.py cleanup` failed with `ModuleNotFoundError: No module named 'src'`.
- Updated `memory/subscription-quotas.json` with model weights/reset timestamps for Claude Max, ChatGPT Plus, and Gemini Advanced.

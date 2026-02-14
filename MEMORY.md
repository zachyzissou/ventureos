## Daily Log - 2026-02-12
- Cron self-healing: Nexus (Mission Control) rogue-disabled healthy `memory-facts-extraction` job — re-enabled it, added CRITICAL cron rules to Nexus SOUL.md forbidding agents from disabling jobs without user approval.
- Created `scripts/cron-health-check.sh` + cron job (id: `59e58b7a-f287-478e-b2d9-1a0c092bae56`, 30min, atlas, report-only).
- HomeKit cameras: diagnosed live stream failure — Pi CPU bottleneck from ffmpeg `-pred 1`. Fix: `-preset ultrafast -tune zerolatency` extra_arguments (confirmed working on one camera, pending rollout to all 9).
- All 9 cameras in HomeKit accessory mode (ports 21074-21082), `video_codec: copy` (H.264 passthrough), linked motion sensors, all `state: loaded`.
- Camera Hub consolidation: 9 cameras now through single NVR ONVIF entry `01KH9GM4J21KZVFZQZNEFMKSE3` (entities: `camera.n16nrx_profile_X_0`). ffmpeg args applied.
- Front doorbell (Control4 C4-VDB-E, 192.168.225.131): ONVIF entry `01KH9JE5EH9DJ6V2AEBDHED7XZ`, HomeKit accessory `01KH9JR0V6NTGNCHZR155HJF36` (port 21073, unpaired). Doorbell press chain: ONVIF DigitalInput → automation → `input_boolean.front_doorbell_pressed` → HomeKit notification.
- Patio heaters: HA template integration does NOT support climate entities — used template **switches** instead (heaters are on/off only). 4 `switch.patio_heater_*` entities created, light entities hidden (`hidden_by: user`), 6 patio heat scripts excluded from HomeKit bridge.
- Middle Bed TV: simplified to pure Control4 path — `select_source` handles power on + input natively. Samsung TV integration **disabled** (websocket conflict with C4). Removed redundant automation + 3 TV scripts. Home app controls TV via C4 zone directly.
- Control4 HomeKit state bug: C4 integration returns `idle` (not `off`) when powered down → HomeKit shows TVs as "on". Hardcoded in `control4/media_player.py`. Fix: universal media player wrapper (approved, not yet implemented).
- Samsung TV ref: QN55QN90DAFXZA at 192.168.225.103, MAC f4:dd:06:89:35:75, config entry `01KH5R3B7ZX3TC1ZTW04BY24NZ` (disabled).
- HA WebSocket API required for entity registry updates (REST API returns 404). Python + websockets from Mac Studio.
- Apple Remote Widget research: iOS Control Center remote works with HomeKit TV accessories. D-pad/select/back fire `homekit_tv_remote_key_pressed` events (includes `entity_id`). Volume/power/source already handled by C4 media_player — only navigation needs custom automations.
- Roku devices confirmed: Roku 1 at `192.168.225.166` (MAC `50:06:F5:6D:F9:58`), Roku 2 at `192.168.225.139` (MAC `50:06:F5:6D:F4:39`). Both Roku Ultra, firmware 15.1.4, HTTP API port 8060 reachable (no auth).
- Three rooms share two Rokus via C4 AV matrix: Front Bed, Middle Bed, Patio. Volume handled by C4 room zone (routes to amp or TV speakers per room).
- Proposed solution: single template automation mapping `homekit_tv_remote_key_pressed` → check entity source attribute → POST to correct Roku IP:8060/keypress/<key>. Design doc in `memory/2026-02-12-apple-remote-control4.md`.
- Multi-agent audit: Sentinel 🔴 BROKEN (209K>200K, prompt-too-long, needs session reset); Verifier ⚠️ 189K near limit (preemptive reset needed); Archivist ⚠️ memory-facts-extraction embedding failures (missing API keys). Session file storage location still unknown. 2 stale GamingPC node pairings need cleanup.
- Pending: pair doorbell in Home app, test doorbell chain, implement universal media player wrappers for correct TV on/off state, enable Front Bed + Patio HomeKit TV accessories, implement Apple Remote → Roku navigation automations, reset Sentinel/Verifier sessions, fix Archivist embeddings.
- Details in `memory/2026-02-12.md`.

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
- Project tracking finalized: local GitLab (`http://slurpnet:9080/` / `http://192.168.225.196:9080`) is canonical; OpenProject retired; Huly attempt parked.
- Work tracking implementation: file-based Work Items under `memory/work-items/`; `memory/METHODOLOGY.md` updated to require Work Items for non-trivial work; GitLab tracking scaffolding added to `projects/openclaw-upgrade` (meta issue created).
- Configured VentureOS multi-agent + Discord routing: role channels under “VentureOS — Roles”; created isolated `echo` (Mission Control) agent with workspace `~/.openclaw/workspace-echo` and agentDir `~/.openclaw/agents/echo/agent`; routed `echo-mission-control` to it, fixed permissions, and verified per-channel responses.
- Repo hygiene: removed stale submodule gitlinks and tracked `unraid-mcp` as symlink (commit `e5c2e8c`); SSH push to `git@192.168.4.225` timing out, HTTP GitLab remote exists but `main` is behind remote.
- Disabled failing cron job “Memory Fact Extraction” (job id `90f7a25c-79bc-4de2-b8a0-297c0af33c22`) due to invalid model id `anthropic/claude-3-5-sonnet`.
- StantonTimes: `projects/stanton-times/data/state.json` ~151KB (bulk pending_stories ~69 items); cleanup attempt via `python3 src/app.py cleanup` failed with `ModuleNotFoundError: No module named 'src'`.
- Updated `memory/subscription-quotas.json` with model weights/reset timestamps for Claude Max, ChatGPT Plus, and Gemini Advanced.

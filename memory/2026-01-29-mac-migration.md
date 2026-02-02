# 2026-01-29 - OpenClaw Migration: Windows → Mac Studio

## What Happened
Migrated OpenClaw (OpenClaw) from Zach's Windows PC to his Mac Studio.

## Files Imported
- **Workspace root**: AGENTS.md, SOUL.md, IDENTITY.md, TOOLS.md, USER.md, HEARTBEAT.md
- **Memory**: 225 files including:
  - `bloom-audit/` (58 files) - Bloom game documentation audits
  - `bloom-code/` (119 files) - Issue tracking, PR notes, implementation docs
  - `stanton-times/` - Twitter bot setup for Star Citizen news
  - `gmail-audit/` - Email organization project
  - `zach-principles.md` - Extracted decision patterns from 1,812 ChatGPT convos
  - Daily logs from Jan 27-29
- **Skills**: 14 skill directories (stock-evaluator, ADHD planner, decision-trees, etc.)

## Config
- Discord: stanton-server guild + DMs for Zach (956203522624462918)
- Brave Search API configured
- Memory search enabled with vector store

## Notes
- Original export had Windows backslash paths that needed cleanup
- Used cleaner export from `/Users/zachgonser/Downloads/openclaw-mac-setup/`
- `openclaw doctor` was needed after manual config edits
- Proper DM config: `channels.discord.dm.policy` + `dm.allowFrom`

## Identity
- **Name**: OpenClaw 🔮
- **Role**: CEO orchestrator - manages all of Zach's projects
- **Home**: Now running on Mac Studio (was Windows PC)

## Windows Node Pairing (same day)
Successfully paired Windows GamingPC as a remote node to Mac gateway.

### Steps
1. Set Mac gateway: `bind: lan`, `auth.mode: token`
2. On Windows: `$env:CLAWDBOT_GATEWAY_TOKEN = "<token>"` then `openclaw node run`
3. Approved pending device: `openclaw devices approve <requestId>`
4. Node connected with capabilities: browser proxy, system.run, system.which

### Key Learnings
- Node pairing uses `openclaw devices approve` (not `nodes approve`)
- Gateway token required via env var `CLAWDBOT_GATEWAY_TOKEN` on node
- Pending requests visible in `~/.openclaw/devices/pending.json` even when CLI doesn't show them
- Discord message target format: `user:<id>` not raw ID

### Final Setup
- ✅ Mac Studio = Primary gateway (always on)
- ✅ Discord = Main communication channel
- ✅ GamingPC = Node (paired, connects when running)
- ❌ iMessage = Disabled (self-messaging is buggy, would need dedicated bot Apple ID)

## Full Migration Audit (Late Night Session)

### Tools Installed on Mac
- gh (GitHub CLI) ✅
- rg (ripgrep) ✅
- docker ✅
- All other tools already present (bird, gog, imsg, memo, remindctl, ffmpeg, whisper, gifgrep, camsnap, claude)

### MCPs Configured
- **Claude Desktop config:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **mcporter config:** `~/.mcporter/mcporter.json`
- unityMCP (28 tools) - Unity game dev
- obsidian-mcp-tools (18 tools) - Obsidian vault access
- Both using Mac paths, same API keys as Windows

### Three-Layer Memory System
1. Daily notes: `memory/YYYY-MM-DD.md` ✅
2. Long-term: `MEMORY.md` ✅ (created during session)
3. Vector search: SQLite + embeddings ✅

### Obsidian
- Vault: `/Users/zachgonser/Obsidian/VaultZap/`
- 60 plugins installed including mcp-tools

### Config Parity Verified
- All agents.defaults settings match
- All hooks enabled (boot-md, command-logger, session-memory)
- Stanton Times systemPrompt restored
- Discord DM allowlist added (improvement over Windows)
- gateway.tailscale config added for consistency

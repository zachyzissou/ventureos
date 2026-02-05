# Windows GamingPC Deep Audit - 2026-01-29

**Purpose:** Comprehensive scan of GamingPC node for migration completeness to Mac Studio
**Status:** ✅ Complete

---

## Executive Summary

The GamingPC has been serving as the primary OpenClaw host. Key findings:

- **25 active cron jobs** - Most are StantonTimes monitors, need migration
- **1 dedicated agent workspace** - stanton-times-agent with full workflow
- **Critical credentials** - Twitter API keys, Discord webhooks, Google OAuth
- **Active state tracking** - Tweet IDs, heartbeat checks, fact extraction
- **MCP configurations** - mcp-router connecting to network services
- **Knowledge graph** - life/areas/ structure with entity data

---

## 1. Agent Workspaces

### C:\Users\Zachg\clawd\ (Main Workspace)

**Type:** Agent Workspace
**Purpose:** Primary OpenClaw agent workspace with full configuration
**Files Found:**
- AGENTS.md, SOUL.md, HEARTBEAT.md
- .env (template, no secrets)
- .mcp.json (MCP server configs)
- .inspector.mcp.json

**Dependencies:**
- Skills folder structure
- Memory folder structure
- Life/areas knowledge graph

**Migration required:** Yes - but likely already synced/duplicated on Mac
**Priority:** Critical
**Migration steps:**
1. Verify Mac workspace has identical structure
2. Sync any newer files from Windows
3. Compare AGENTS.md/SOUL.md for version differences

---

### C:\Users\Zachg\clawd\stanton-times-agent\

**Type:** Agent Sub-Workspace
**Purpose:** The Stanton Times Twitter news bot operations
**Files Found:**
- AGENTS.md - Detailed operational instructions
- SOUL.md - Voice and editorial standards
- HEARTBEAT.md - Empty (disabled heartbeats for this agent)

**Dependencies:**
- ../memory/stanton-times/ for scripts and state
- Twitter API credentials
- Discord webhook for approvals
- bird CLI tool for Twitter access

**Migration required:** Yes - CRITICAL
**Priority:** Critical
**Migration steps:**
1. Copy entire stanton-times-agent folder
2. Migrate memory/stanton-times/ folder
3. Transfer Twitter credentials
4. Update any Windows-specific paths in config

---

## 2. Credentials & Secrets

### C:\Users\Zachg\clawd\memory\stanton-times\.env

**Type:** Credential
**Purpose:** Twitter API authentication for @TheStantonTimes
**Contains:**
```
TWITTER_API_KEY=LxpIzHD0u7QzKWACLnL2DVnB8
TWITTER_API_SECRET=gQQQle1IRRG0gYMsOi0kK5Ga3k5j028N48Fp9tflp3Zltn4RSm
TWITTER_ACCESS_TOKEN=1927610917790863360-zs2ZVNnVetDTgcFtGSyNZxDSq1T7cr
TWITTER_ACCESS_SECRET=nejP58QtbWTY9gp4AHCLPCavgugYVb8j0t92u43aCUgo9
STANTON_WEBHOOK_URL=https://discord.com/api/webhooks/1465950119634407527/R8WHqL42kj69H2XzWzUmYFZ9xwCbmdc44IOjA0BvAsqrvamotp2sd5jzVYpWtkS91DMh
STANTON_NOTIFY_USER=956203522624462918
```

**Migration required:** Yes - CRITICAL
**Priority:** Critical
**Migration steps:**
1. Create memory/stanton-times/.env on Mac
2. Copy credentials EXACTLY
3. Verify scripts can read from new location

---

### C:\Users\Zachg\.openclaw\google-mcp\

**Type:** Credential Store
**Purpose:** Google OAuth for calendar/email access
**Files:**
- .accounts.json
- .gauth.json

**Migration required:** Yes (if using Google MCP on Mac)
**Priority:** Important
**Migration steps:**
1. Copy both files to Mac ~/.openclaw/google-mcp/
2. May need to re-authenticate if tokens expired

---

### C:\Users\Zachg\.openclaw\credentials\

**Type:** Credential Store
**Purpose:** Discord pairing and allowlist
**Files:**
- discord-allowFrom.json
- discord-pairing.json

**Migration required:** Probably not - Mac has its own pairing
**Priority:** Nice-to-have
**Notes:** These are likely specific to the Windows installation

---

### C:\Users\Zachg\.openclaw\openclaw.json

**Type:** Config
**Purpose:** Main OpenClaw configuration
**Contains:**
- Brave Search API key: `BSAW1ZNoEGBXmYuZhy_o2MaRfx8yctI`
- Agent configuration (OpenClaw)
- Memory search settings
- Workspace paths (Windows-specific)

**Migration required:** Check API keys haven't changed on Mac
**Priority:** Important
**Migration steps:**
1. Verify Mac openclaw.json has same API keys
2. Paths will be different - that's expected

---

## 3. Active Workflows & State

### C:\Users\Zachg\clawd\memory\stanton-times\state.json

**Type:** Workflow State
**Purpose:** Tracks seen tweets, posted stories, engagement stats
**Content Summary:**
- last_check: 2026-01-29T20:00:00-06:00
- 14 Twitter accounts being monitored
- 100+ seen_tweet_ids tracked
- 6 posted_stories recorded
- Engagement stats

**Migration required:** Yes - CRITICAL
**Priority:** Critical
**Notes:** This prevents duplicate tweets. Must migrate to continue operations seamlessly.

---

### C:\Users\Zachg\clawd\memory\heartbeat-state.json

**Type:** Workflow State
**Purpose:** Tracks heartbeat check timestamps
**Content:**
- lastFactExtraction: 2026-02-06T00:32:00Z
- lastChecks.email: 2026-01-28T21:30:00-06:00
- lastChecks.calendar: failed (tz config)

**Migration required:** Yes
**Priority:** Important
**Notes:** Without this, fact extraction may re-run unnecessarily

---

## 4. Cron Jobs (C:\Users\Zachg\.openclaw\cron\jobs.json)

**Type:** Scheduled Tasks
**Purpose:** Automated monitoring and maintenance
**Total Jobs:** 25 active

### StantonTimes Operations (10 jobs)

| Job Name | Schedule | Priority |
|----------|----------|----------|
| P0 Monitor | */30 * * * * | Critical |
| P1 Keywords | 0 */2 * * * | Critical |
| Daily Digest | 0 9 * * * | Important |
| Engagement | 15,45 * * * * | Critical |
| Approval Check | */5 * * * * | Critical |
| Creator Monitor | 30 */2 * * * | Important |
| Hashtag Monitor | 45 */2 * * * | Important |
| Web & RSS | 0 */2 * * * | Important |
| Calendar Check | 0 8 * * * | Nice-to-have |
| P2-P3 Deep Scan | 0 */4 * * * | Nice-to-have |

### Memory & Maintenance (4 jobs)

| Job Name | Schedule | Priority |
|----------|----------|----------|
| Weekly Memory Synthesis | 0 9 * * 0 | Important |
| Fact Extraction | */30 * * * * | Important |
| Morning Briefing | 0 8 * * * | Important |
| Evening Wrap | 0 22 * * * | Nice-to-have |

### Bloom Operations (6 jobs)

| Job Name | Schedule | Priority |
|----------|----------|----------|
| PR Review Monitor | */5 * * * * | Critical (if using) |
| Deep Dive Validation | One-time | One-off |
| Multi-Agent Validation | One-time | One-off |
| Validate PR-1076 | One-time | One-off |
| Deep Dive Validation v2 | One-time | One-off |

### Curation (5 jobs)

| Job Name | Schedule | Priority |
|----------|----------|----------|
| Curated Tech Feed (3 dupes) | 0 12,18 * * * | Nice-to-have |
| Competitor Watch | 0 14 * * 1,4 | Nice-to-have |
| GitHub Trending | 0 11 * * 2,5 | Nice-to-have |
| Weekly Digest | 0 10 * * 0 | Important |

**Migration required:** Yes - CRITICAL
**Priority:** Critical
**Migration steps:**
1. Export jobs.json from Windows
2. Import to Mac ~/.openclaw/cron/
3. Update any Windows paths to Mac equivalents
4. Review which jobs should continue vs. be disabled

---

## 5. MCP Configurations

### C:\Users\Zachg\clawd\.mcp.json

**Type:** MCP Config
**Purpose:** Model Context Protocol server definitions
**Servers defined:**
1. **mcp-router** - Connects to 192.168.4.70:3282 with token
2. **uLoopMCP** - Unity integration (TCP port 8700)
3. **MCP_DOCKER** - Docker MCP gateway

**Migration required:** Review - depends on network setup
**Priority:** Important (if using MCP)
**Notes:** 
- mcp-router likely connects to a network service
- uLoopMCP is Unity-specific (may not be needed on Mac)
- MCP_DOCKER paths are Windows-specific

---

## 6. Scripts

### C:\Users\Zachg\clawd\memory\stanton-times\*.mjs

**Type:** Scripts
**Purpose:** Twitter posting workflow

| Script | Purpose |
|--------|---------|
| post-tweet.mjs | Posts approved tweets |
| post-embed.mjs | Creates approval embeds in Discord |
| delete-tweet.mjs | Deletes tweets if needed |
| send-embed.mjs | Sends embeds |
| reaction-confirm.mjs | Handles reaction-based approvals |
| test-buttons.mjs | Testing Discord buttons |

**Dependencies:**
- Node.js
- .env file with Twitter credentials
- node_modules/ folder

**Migration required:** Yes - CRITICAL
**Priority:** Critical
**Migration steps:**
1. Copy entire memory/stanton-times/ folder
2. Run `npm install` to rebuild node_modules
3. Test with dry-run before live posting

---

### Other Scripts (Lower Priority)

**memory/bloom-audit/*.ps1** - One-time audit scripts
**scripts/*.ps1** - Various utility scripts, mostly one-off

**Migration required:** No - these are Windows-specific utilities
**Priority:** Nice-to-have
**Notes:** Most are already completed tasks or repo-specific

---

## 7. Knowledge Graph

### C:\Users\Zachg\clawd\life\areas\

**Type:** Structured Knowledge
**Purpose:** Entity-based fact storage
**Structure:**
```
life/areas/
├── authentication/profiles/
├── companies/
│   └── Roberts Space Industries/
├── people/
│   ├── zach/
│   └── zachyzissou/
├── projects/
│   ├── bloom/
│   ├── stanton-times/
│   └── Star Citizen/
├── sessions/agent-main/
└── skills/
    ├── bird/
    ├── bluebubbles/
    ├── github/
    └── [others]/
```

**Migration required:** Yes
**Priority:** Important
**Migration steps:**
1. Sync entire life/ folder
2. Verify items.json files are current
3. This is the "long-term memory" - important for context

---

## 8. External Dependencies

### Bloom Repository

**Path:** C:\Users\Zachg\Development\Games\Bloom
**Purpose:** Unity game project that cron jobs monitor
**Migration required:** No - this stays on Windows
**Notes:** 
- Bloom PR Monitor job watches this repo via GitHub CLI
- Works via gh CLI, not local filesystem
- Can continue monitoring from Mac

### VaultZap (Obsidian)

**Purpose:** Some cron jobs write to Obsidian vault
**Migration required:** Depends on Obsidian setup
**Notes:** Paths like VaultZap/📥 Inbox/ referenced in cron jobs

---

## 9. Windows Task Scheduler

**Task Found:** `OpenClaw Node`
**Purpose:** Starts openclaw node on login
**Command:** C:\Users\Zachg\.openclaw\node.cmd
**Schedule:** At logon

**Migration required:** No - node will continue running for browser proxy
**Notes:** This is working correctly, keeps GamingPC connected as a node

---

## Migration Checklist

### Phase 1: Critical (Do First)

- [ ] Copy memory/stanton-times/ folder (credentials, state, scripts)
- [ ] Migrate cron/jobs.json (update paths)
- [ ] Copy life/areas/ knowledge graph
- [ ] Copy stanton-times-agent/ workspace
- [ ] Test StantonTimes workflow on Mac

### Phase 2: Important

- [ ] Copy google-mcp/ OAuth files
- [ ] Verify API keys in openclaw.json match
- [ ] Review and enable appropriate cron jobs
- [ ] Copy memory/heartbeat-state.json

### Phase 3: Nice-to-Have

- [ ] Sync any newer daily memory files
- [ ] Review MCP configurations for Mac
- [ ] Archive Windows-only scripts

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Duplicate tweets | High | Medium | Migrate state.json before enabling cron |
| Lost credentials | Medium | High | Backup .env files before migration |
| Path errors | High | Low | Test scripts before enabling cron |
| Timezone issues | Medium | Low | Verify cron tz settings |

---

## Recommendation

**Migration Order:**
1. Disable StantonTimes cron jobs on Windows
2. Copy all critical files to Mac
3. Update paths in cron jobs
4. Enable cron jobs on Mac one at a time
5. Monitor for 24h before considering Windows as backup only

The GamingPC should remain as a **node** (for browser proxy and game access) but the **gateway** should move to Mac Studio.

---

*Audit completed: 2026-01-29 21:47 CST*

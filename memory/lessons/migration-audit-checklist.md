# Migration Audit Checklist

*Lesson learned 2026-01-29: Surface audits miss project-specific requirements*

## When auditing a migration, don't just diff files — audit functionality:

### For each project/agent found on source but not target:

1. **Identify the project type**
   - Is it a sub-agent? A skill? A standalone tool?
   
2. **List all dependencies**
   - Credentials (API keys, tokens, webhooks)
   - Config files (JSON, YAML, .env)
   - Scripts (and their runtime deps — npm packages, etc.)
   - State files (what's being tracked)
   
3. **Document the workflow**
   - What does it do?
   - How is it triggered? (cron, heartbeat, manual, webhook)
   - Where does output go? (Discord channel, Twitter, file)
   
4. **Provide migration steps**
   - Not just "copy from Windows" — actual actionable steps
   - Include credential paths
   - Include any setup commands (npm install, etc.)
   - Note platform differences (paths, CLI tools)

5. **Verify after migration**
   - Can the scripts run?
   - Are credentials valid?
   - Is the workflow functional end-to-end?

## Red flags to always surface:

- [ ] `.env` files (always contain secrets)
- [ ] Webhook URLs (Discord, Slack, etc.)
- [ ] API credentials
- [ ] Cron jobs / scheduled tasks
- [ ] Sub-agent workspaces
- [ ] State files that track "what's been done"

## Example: Stanton Times Migration

**What the audit said:** "stanton-times-agent/ missing — copy or re-bootstrap"

**What it should have said:**
```
❌ MISSING: stanton-times-agent/

This is an autonomous Twitter news bot for @TheStantonTimes.

Required files:
- SOUL.md, IDENTITY.md, AGENTS.md (agent config)
- config/config.json (monitored accounts, events)
- config/state.json (seen tweets, posted stories)
- config/.env (Twitter API creds + Discord webhook)
- config/post-tweet.mjs (posting script)

Credentials to migrate:
- C:\Users\Zachg\clawd\memory\stanton-times\.env
  → Contains: TWITTER_API_KEY, TWITTER_API_SECRET, 
    TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET,
    STANTON_WEBHOOK_URL

Workflow:
- Monitors SC Twitter accounts
- Drafts tweets for approval
- Posts via API on approval
- Currently: manual trigger (no cron)

Migration steps:
1. Create project structure
2. Copy agent files (SOUL, IDENTITY, AGENTS, HEARTBEAT)
3. Copy config files
4. Copy .env credentials from Windows
5. Verify script can run (check Node version, deps)
6. Test with a draft (don't post)
```

---

*Future audits: Use this checklist. Don't just diff — understand.*

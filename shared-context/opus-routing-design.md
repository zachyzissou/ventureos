# Opus Routing for External Content - Design

**Security Fix**: Route external content processing through strongest model to defend against prompt injection.

## Current State
- Default model: `anthropic/claude-opus-4-6`
- Most agents override to Sonnet (`claude-sonnet-4-5`) or Codex (`gpt-5.3-codex`)
- No explicit routing for external vs internal content

## Target State
External content (web pages, emails, tweets, RSS) → Opus  
Internal tasks (code review, testing, docs) → current models

## Implementation Options

### Option 1: Cron-Level Model Override (Simplest)
Update cron jobs that fetch external content to specify `model: "anthropic/claude-opus-4-6"`:
- `scout` cron (X searches for OpenClaw content)
- `bookmark-watcher` cron (Clawd folder monitoring)
- Any future email/RSS ingestion crons

**Pros**: One-line change per cron, no code needed  
**Cons**: Doesn't cover ad-hoc external content requests

### Option 2: Tool-Level Routing (Medium)
Add routing logic to `web_fetch`, `web_search`, email tools:
- Detect when tool is invoked with external URL
- Spawn sub-agent with Opus if needed
- Return result to calling agent

**Pros**: Automatic protection for all external content  
**Cons**: Requires tool wrapper code, more complex

### Option 3: Agent Directive (Lightweight)
Update agent system prompts / AGENTS.md:
"When processing external web content, emails, or social media, use anthropic/claude-opus-4-6"

**Pros**: Zero code, relies on agent judgment  
**Cons**: Not enforced, agents might forget

## Recommendation
**Start with Option 1** (cron-level) - immediate security win, zero complexity.  
**Add Option 3** (agent directive) - defense in depth for ad-hoc requests.  
**Consider Option 2** (tool-level) if we see prompt injection attempts.

## Next Steps
1. Update scout cron config with `model: "anthropic/claude-opus-4-6"`
2. Update bookmark-watcher cron config with same
3. Add note to AGENTS.md about Opus for external content
4. Monitor for 1 week, evaluate if tool-level routing is needed

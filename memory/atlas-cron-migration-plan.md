# Atlas Cron Migration Plan
**Created:** 2026-02-09  
**Status:** Ready for execution (pending gateway config update)

## Overview
Migrate infrastructure and monitoring cron jobs from `main` agent to `atlas` agent for proper separation of concerns.

## Current State
All 18 cron jobs currently run under `agentId: main`

## Cron Jobs to Migrate to Atlas

### High Priority (Infrastructure/Monitoring)
These jobs directly align with Atlas's role and should be migrated first:

| Job ID | Job Name | Schedule | Current AgentId | Target AgentId | Reasoning |
|--------|----------|----------|----------------|----------------|-----------|
| `ced03015-7a01-4ea9-bec3-0b77a05256b3` | OpenClaw Monitor (Gateway/Auth/Timeout) | */15 * * * * | main | atlas | Core infra monitoring |
| `064266bb-5537-49cb-8323-ec99da6196c2` | OpenClaw Discord Latency Monitor | */10 * * * * | main | atlas | Service health check |
| `758fb284-4737-4cbd-8d78-5cdcdedcba56` | Nightly Backup | 0 2 * * * | main | atlas | Backup operations |
| `467e3753-ffea-492d-9880-de00b45dad1f` | Weekly Backup Verify | 30 2 * * 0 | main | atlas | Backup integrity |
| `dfe6a2fe-10fc-4f00-82cf-6f5701a0a33c` | Budget Check | 0 9 * * * | main | atlas | Resource monitoring |
| `f7d6ce20-6153-4541-8c65-9596cc62fd4f` | Export Cron Logs | */30 * * * * | main | atlas | Logging/observability |
| `5d8e2185-deca-4182-850c-ca78fa4c9bda` | Archive Task Run Logs | 0 3 1 * * | main | atlas | Log maintenance |

### For Discussion (Possible Archivist)
| Job ID | Job Name | Schedule | Current AgentId | Candidate | Notes |
|--------|----------|----------|----------------|-----------|-------|
| `8b9349f6-f9c3-4df8-a45c-e8268a0e9909` | memory-facts-extraction | every 30m | main | archivist or atlas | Could be Archivist (knowledge management) or Atlas (system task) |

### Remaining with Main/Echo
These jobs are project-specific and should stay with mission control:

| Job ID | Job Name | Schedule | AgentId | Reasoning |
|--------|----------|----------|---------|-----------|
| `1f70039d-3c07-45c0-b3b0-88693d2d5d19` | Moltbook Reply Watch | every 15m | main | Project-specific monitoring |
| `36d25e5b-892f-4f87-b297-6c011bb21eae` | Bloom PR Monitor | */15 * * * * | main | Project-specific monitoring |
| `0b64b476-5e47-4d0a-ad4c-5b873623de91` | Bloom CI Watch | */30 * * * * | main | Project-specific monitoring |
| `a5fa2eb9-d9bf-4ff9-a951-a6affa065ea1` | Moltbook Multi-Agent | every 6h | main | Project orchestration |
| `743be99f-cdf5-435c-838d-becd428dcb79` | Refresh Twitter Cookies | 0 4 * * * | main | Social media automation |
| `d4532a78-5273-4f83-9d10-4bca7bc9ced6` | Morning Briefing | 0 8 * * * | main | User-facing daily brief |
| `17ee2b0c-93b5-4146-a0fa-54f9b8d1540b` | Unity Tool Scout | 0 11 * * 2,5 | main | Research/intel |
| `c4ee7575-5cb2-432e-87dd-c8e210b87f6b` | Extraction Shooter Intel | 0 10 * * 1,4 | main | Research/intel |
| `0df11fe6-5704-4f3a-98f7-da6471150c1f` | Weekly Memory Synthesis | 0 9 * * 0 | main | Memory/synthesis task |
| `ba5573be-91b7-46ad-a595-a6100a8e84a5` | Weekly Bloom Digest | 0 18 * * 0 | main | Project-specific digest |

## Migration Process (When Ready)

### Prerequisites
1. ✅ Atlas agent directory exists with proper files
2. ✅ Atlas AGENTS.md configured
3. ✅ Atlas Discord channel exists (#atlas-infra)
4. ⏳ Gateway restart to load new agent configs
5. ⏳ Test Atlas agent responds in Discord

### Execution Steps
1. **Test Atlas Agent First**
   ```bash
   # Send a test message to #atlas-infra channel
   # Verify Atlas responds with proper identity
   ```

2. **Migrate Crons One-by-One** (safest approach)
   ```bash
   # For each cron job:
   openclaw cron edit <JOB_ID>
   # Change agentId from "main" to "atlas"
   # Verify next run completes successfully
   ```

3. **Update Alert Routing**
   - Ensure Atlas alerts go to correct Discord channel (already configured: 1470210649786159348)
   - Update escalation paths in ops-delegation-matrix.md

4. **Monitor for 24-48h**
   - Check all migrated crons execute on schedule
   - Verify alerts are properly routed
   - Confirm no duplicate alerts from main agent

### Rollback Plan
If issues arise:
```bash
openclaw cron edit <JOB_ID>
# Change agentId back to "main"
```

## Success Criteria
- [ ] All 7 infrastructure crons running under atlas
- [ ] Alerts properly routed to #atlas-infra
- [ ] No duplicate monitoring alerts
- [ ] Atlas agent responds to direct queries in Discord
- [ ] Main agent workload reduced by ~40%

## Notes
- **Do NOT restart gateway during off-hours** - wait for maintenance window
- **Test in low-traffic period** - avoid Friday afternoons
- **memory-facts-extraction decision pending** - needs discussion on Archivist vs Atlas ownership
- All jobs currently marked as `ok` status - good baseline for migration

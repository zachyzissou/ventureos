# Discord DM / Message Latency Runbook

## Symptoms
- Discord DMs or channel messages arrive late (minutes).
- Gateway logs show backlog / slow processing.

## Primary Signals (log patterns)
We treat these as actionable indicators:
- `Slow listener detected` (Discord client event loop blocked)
- `lane wait exceeded` (internal lane/queue backlog)

## Monitor
Script: `scripts/monitor-discord-latency.sh`

Behavior:
- Scans recent gateway logs for the patterns above.
- Dedupes alerts (suppression window).
- Can optionally restart the gateway with a cooldown.

## Immediate Remediation (manual)
1) Confirm gateway is up:
   - `openclaw status`
2) If backlog persists:
   - `openclaw gateway restart`
3) Re-test by sending a DM and checking response time.

## Root-cause checklist
- Any long-running cron/agent tasks starving the loop?
- Discord API rate limits?
- CPU/disk pressure?
- Huge log spam or slow filesystem?

## Rollback / Safety
- Auto-restart is **off by default**.
- If enabled, it must have a strict cooldown and always posts an alert when it triggers.

# Stanton Times Operations

## Scheduling (Recommended: OpenClaw Cron)

Prefer OpenClaw cron jobs for `monitor` / `approval` / `publish`:

- Docs: `docs/OPENCLAW_CRON.md`
- Example: `config/openclaw_cron.example.sh`

`cron_manager.py` is deprecated (kept for backwards compatibility).

## Launchd Jobs
- `com.stantontimes.reaction-monitor`
- `com.stantontimes.discord-verifier`
- `com.stantontimes.tweet-publisher`
- `com.stantontimes.healthcheck`
- `com.stantontimes.source-monitor`
- `com.stantontimes.bird-monitor`
- `com.stantontimes.daily-digest`
- `com.stantontimes.maintenance-cleanup`

Check status:
```bash
uid=$(id -u)
launchctl print gui/$uid/com.stantontimes.reaction-monitor
```

Kickstart:
```bash
launchctl kickstart -k gui/$uid/com.stantontimes.reaction-monitor
```

## Logs
All logs live in `logs/`:
- `reaction_monitor.log`
- `tweet_publisher.launchd.*.log`
- `source_monitor.launchd.*.log`
- `bird_monitor.launchd.*.log`

## Common Tasks
- Run digest now:
```bash
./.venv/bin/python scripts/daily_digest.py
```
- Run cleanup now:
```bash
./.venv/bin/python scripts/maintenance_cleanup.py
```
- Inspect ledger:
```bash
sqlite3 data/stanton_times_ledger.sqlite "select count(*) from items;"
```

## Approvals
Drafts are posted as Discord embeds. React:
- ✅ approve
- ❌ reject
- 🤔 hold
- ✏️ edit request

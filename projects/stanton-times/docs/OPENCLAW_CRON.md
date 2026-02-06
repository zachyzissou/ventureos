# OpenClaw Cron (Monitor, Approval, Publish)

This repo supports scheduling via OpenClaw's built-in cron scheduler.

## Jobs

OpenClaw cron jobs in this project are typically:

- **Monitor**: run `src/app.py monitor` (ingest sources, score, draft, and post for review)
- **Approval**: run `src/app.py verify` (posts any `needs_review` drafts to Discord)
- **Publish**: run `src/app.py publish` (publishes `approved` drafts to X via bird)

Note: `reaction_monitor.py` is a long-running Discord bot that updates `draft_status` when reactions change. It is not a cron job.

## Setup

1. Create an OpenClaw agent that has this repo as its workspace (or reuse an existing one).
2. Identify the agent id:
   - `openclaw agents list`
3. Install cron jobs (example):
   - `AGENT_ID=... PROJECT_DIR=... bash config/openclaw_cron.example.sh`

## Verify Cron Execution

- View configured jobs:
  - `openclaw cron list`
- Check scheduler status:
  - `openclaw cron status`
- View run history:
  - `openclaw cron runs --limit 50`
- Debug-run a job immediately:
  1. `openclaw cron list --json` to get the job `id`
  2. `openclaw cron run <id> --force`

## Verify Logging

This code writes local logs under `logs/` (created automatically when needed):

- Monitor: `logs/source_monitor.log`
- Notifier: `logs/discord_notifier.log`
- Reaction monitor: `logs/reaction_monitor.log`
- Publisher: `logs/tweet_publisher.log` (plus any `tweet_publisher.launchd.*.log` if using launchd)

If running via OpenClaw cron, also check the Gateway logs:

- `openclaw logs tail`

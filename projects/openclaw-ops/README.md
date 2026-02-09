# openclaw-ops

Operational source-of-truth for this OpenClaw deployment.

## Goals
- Detect and mitigate Discord DM/message latency (backlog/slow listener) early.
- Alert only to SlurpNet alerts (no spam).
- Keep secrets out of git.

## Local assumptions (this deployment)
- OpenClaw logs live in `~/.openclaw/logs/`.
- SlurpNet alerts channel id: `1466893115460812979`.

## Contents
- `scripts/` — monitors and safe operational utilities
- `docs/` — runbooks

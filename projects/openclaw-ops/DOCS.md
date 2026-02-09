# openclaw-ops

Operational source-of-truth for OpenClaw deployment.

## Key docs
- `docs/` runbooks and monitors
- `scripts/` operational scripts (safe, idempotent where possible)

## Conventions
- GitLab is canonical for ops work.
- Alerts go to SlurpNet alerts channel.
- Never commit secrets (tokens, webhook URLs).

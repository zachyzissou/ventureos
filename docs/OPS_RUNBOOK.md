# Ops Runbook

## P0 (System Down / Auth Broken)
- Alert immediately (Discord DM)
- Attempt restart only with approval

## P1 (Repeated Failures)
- Alert within 1 hour
- Provide suspected cause + next steps
- For `auth_or_timeout_errors`: inspect `~/.openclaw/logs/gateway.err.log`, confirm `remote.url` scheme (ws vs wss), verify provider auth state, and ensure PF rules are not blocking gateway access.

## P2 (Transient)
- Log only

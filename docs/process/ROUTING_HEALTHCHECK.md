# Routing Health Check (Discord multi-agent)

This is the “routing still works” safety net for VentureOS role channels.

## Why
Bot-authored messages may be ignored by OpenClaw routing, so health checks must be based on **user-authored pings** plus minimal configuration validation.

## Human ping (ground-truth)
In a role channel, send:

- `hc ping <nonce>`

Expected reply:

- `hc pong <nonce> (<agent>) <UTC timestamp>`

Example:
- `hc ping 002`
- `hc pong 002 (Mission Control) 2026-02-09T03:44:11Z`

## Automated validator (MVP)
Script: `scripts/routing-healthcheck.sh`

What it does:
- Reads `<workspace>/config/alert-routing.json`
- Checks the configured webhook map file exists
- Verifies webhook-map entries exist for all VentureOS role channels
- Verifies a webhook exists for alerts channel
- Alerts **only** to alerts channel (deduped / suppressed)

## Workspace Isolation (new)
- Uses `AGENT_ID` + `OPENCLAW_WORKSPACE` to isolate runtime files.
- **State/dedupe file**:
  - `<workspace>/runtime/monitor/<agentId>/routing-healthcheck.json`
- **Default deny** for mutable/config paths outside workspace.
- **Shared allowlist (minimal)** only for shared script execution:
  - `discord-webhook-send.mjs`
  - other critical shared wrappers only when explicitly allowlisted
- **Per-agent temp dir**:
  - `/tmp/agent-<agentId>/`

## Guardrails
- Never log tokens or webhook URLs.
- Never post probes into role channels.
- Only alert on state change or after suppression window.

## Failure modes
- Missing config file → fail
- Missing webhook map file → fail
- Missing webhook entry for any required channel → fail + alert
- Path isolation violation (outside workspace / not allowlisted) → fail

## Remediation
- Create/add webhooks for missing channel IDs in webhook map.
- Re-run `routing-healthcheck.sh` in the same agent workspace context.

## Evidence
- Issue: #46 (initial implementation)
- Isolation follow-up: see workspace isolation MR in project 15.

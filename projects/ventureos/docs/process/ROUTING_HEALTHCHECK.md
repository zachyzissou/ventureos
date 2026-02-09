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
Script: `projects/ventureos/scripts/routing-healthcheck.sh`

What it does:
- Reads `projects/ventureos/config/alert-routing.json`
- Checks `~/.openclaw/credentials/discord/webhooks.json` exists
- Verifies webhook-map entries exist for all VentureOS role channels
- Verifies a webhook exists for SlurpNet alerts channel (required to send alerts)
- Alerts **only** to SlurpNet alerts channel (deduped / suppressed); if the alerts webhook is missing, it fails but cannot notify

State/dedupe file:
- `runtime/monitor/routing-healthcheck.json`

## Guardrails
- Never log tokens or webhook URLs.
- Never post probes into role channels.
- Only alert on state change or after suppression window.

## Failure modes
- Missing webhook map file → fail
- Missing webhook entry for any required channel → fail + alert

## Remediation
- Create/add webhooks for missing channel IDs in `~/.openclaw/credentials/discord/webhooks.json`.
- Re-run `routing-healthcheck.sh`.

## Evidence
See GitLab issue #46 for implementation + MR.

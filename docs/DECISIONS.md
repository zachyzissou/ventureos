# Decisions Log – VentureOS

This file captures locked defaults and scoped exceptions for the VentureOS implementation plan.

## 2026‑02‑07 — Defaults Locked
- **Proactive window:** 08:00–23:00 CST; quiet hours 23:00–08:00 (P0 alerts only).
- **Alerts:** Discord → SlurpNet alerts channel (`channel:1466893115460812979`).
- **Budgeting:** subscription usage quotas (points/messages/queries), not $/token.
  - Thresholds: 50% / 80% / 90%
  - At 90%: default to cheap model unless explicitly required.
  - Caps: Anthropic 10,000 points/month; OpenAI Codex 50 msgs/3h; Gemini 100 queries/day.
- **Backups:** nightly to `~/backups/clawd/`, 30‑day retention, weekly verify.
- **Updates:** reminder window Sunday 03:00–04:00 CST; updates require explicit approval.
- **Config changes:** avoid edits to `~/.openclaw/openclaw.json` in this phase; policy docs + AGENTS/HEARTBEAT links are allowed **except** the LAN‑first gateway posture noted below.
- **Scheduling:** deterministic cron (wakeMode=now).

## 2026‑02‑07 — Resolved
- **Backup coverage restored:** permissions fixed; `memory/fix-reports` and `memory/bloom-content` are included in nightly backups.

## 2026‑02‑07 — Exception Applied (LAN‑first gateway)
- `gateway.bind=lan`, `gateway.tailscale.mode=off`, `gateway.remote.url=ws://openclaw.local:18789`.
- PF anchor allowlists LAN + Tailnet on port **18789** and blocks others **only on en0/utun6** (loopback safe).
- Control UI on LAN requires HTTPS proxy (secure context); localhost is ok.

## Open Decisions
- None

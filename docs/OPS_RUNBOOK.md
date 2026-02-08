# Ops Runbook

## P0 (System Down / Auth Broken)
**Goal:** restore service quickly and safely.

**Reference:** `docs/GATEWAY_POSTURES.md` for supported configurations and TLS rules.

**Immediate checks:**
1. `openclaw gateway status`
2. `tail -n 200 ~/.openclaw/logs/gateway.err.log`
3. `openclaw doctor --non-interactive`
4. `launchctl list | grep -i openclaw`

**If gateway is down:**
- Verify config validity (doctor output). Fix config **only with approval**.
- If approved: `openclaw gateway restart`

**Auth failures:**
- Check provider auth state (OAuth token expiry, missing token).
- Validate `gateway.remote.url` scheme (ws vs wss).
- Confirm PF rules aren’t blocking gateway access.

**Alert:** Discord → SlurpNet alerts channel immediately with suspected cause + next step.

---

## P1 (Repeated Failures)
**Goal:** diagnose and prevent recurrence.

**Checks:**
- `openclaw gateway status`
- `tail -n 200 ~/.openclaw/logs/gateway.err.log`
- `grep -n "auth_or_timeout" ~/clawd/scripts/monitor-openclaw.sh`
- Verify `gateway.remote.url` scheme (ws vs wss)
- Check PF anchor rules for port **18789**

**Actions:**
- Tighten monitor regex if false positives occur.
- Rotate error log if old noise is causing repeated alerts.
- If error repeats ≥2× in 1 hour → escalate to P1 with summary.

---

## P2 (Transient)
**Goal:** log and move on unless repeated.

**Actions:**
- Log once (no alert)
- Escalate to P1 if repeated ≥2× in 1 hour

---

## Error Taxonomy Mapping (Quick Reference)
- **P0:** gateway down, auth broken (401/403), config invalid, data loss risk
- **P1:** repeated failures/timeouts, recurring 429s, stale lock
- **P2:** single transient network/5xx

---

## Config Change Failures (Rollback)
If a change to `~/.openclaw/openclaw.json` breaks the gateway:
1. Restore latest backup: `cp ~/.openclaw/openclaw.json.bak-* ~/.openclaw/openclaw.json`
2. Restart: `openclaw gateway restart`
3. Verify: `openclaw gateway status`
4. If still failing, stop and alert with logs.

---

## P2 (Transient)
- Log only; no alert unless it repeats.

# Dashboard — Local Deployment Runbook

## Token Auth — Canonical Path

```
<VENTUREOS_ROOT>/dashboard/data/.api-token
```

Resolved via `lib/paths.ts → DASHBOARD_DATA_DIR`. Both dev (`tsx watch`) and
dist (`node dist/…`) use the **same** path. Override: `DASHBOARD_DATA_DIR` env var.

## Build: CJS/ESM Boundary

`lib/*.ts` compiles to CJS (root `"type": "commonjs"`) but `dist/lib/` lives
under `dashboard/` (`"type": "module"`). The `npm run compile` script writes
`{ "type": "commonjs" }` to `dist/lib/package.json` to prevent Node from
misinterpreting CJS output as ESM.

## Service Management (macOS)

```bash
launchctl list com.openclaw.dashboard                          # status
launchctl kickstart -k gui/$(id -u)/com.openclaw.dashboard     # restart
launchctl unload ~/Library/LaunchAgents/com.openclaw.dashboard.plist  # stop
launchctl load -w ~/Library/LaunchAgents/com.openclaw.dashboard.plist # start
```

**Logs:** `tail -f ~/Library/Logs/ventureos-dashboard.{log,err.log}`

## Rebuild + Restart

```bash
cd ~/clawd/ventureos/dashboard
npm run compile
launchctl kickstart -k gui/$(id -u)/com.openclaw.dashboard
```

## Dev Mode

```bash
cd ~/clawd/ventureos/dashboard && npm run dev
```

Uses the **same token** as the deployed service.

## Verification

```bash
./dashboard/scripts/verify-local.sh
DASHBOARD_PORT=8002 ./dashboard/scripts/verify-local.sh
```

### Manual Checklist

- [ ] Service running (`launchctl list` shows PID)
- [ ] Only `dashboard/data/.api-token` exists (no `dist/dashboard/data/.api-token`)
- [ ] `dist/lib/package.json` exists with `"type": "commonjs"`
- [ ] Startup logs show `[STARTUP] DASHBOARD_DATA_DIR:` → canonical path
- [ ] `curl http://localhost:8002/api/config` returns 401

## Stale Token Cleanup

```bash
rm ~/clawd/ventureos/dashboard/dist/dashboard/data/.api-token
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DASHBOARD_PORT` | `8001` | Listen port |
| `VENTUREOS_ROOT` | `~/clawd/ventureos` | Monorepo root |
| `DASHBOARD_DATA_DIR` | `$VENTUREOS_ROOT/dashboard/data` | Token & data dir |
| `DASHBOARD_API_TOKEN` | *(auto)* | Override token |
| `OPENCLAW_DIR` | `~/.openclaw` | OpenClaw runtime |

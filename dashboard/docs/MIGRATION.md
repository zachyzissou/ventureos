# Dashboard Migration Guide

> **✅ Migration Complete (Feb 2026).** The standalone `openclaw-dashboard` repo is now archived.
> The dashboard runs exclusively from `ventureos/dashboard/`. This document is retained as historical reference.

> Originally: Migrating from standalone `openclaw-dashboard` to the VentureOS monorepo dashboard.

## Overview

| Phase | Duration | What Happens |
|-------|----------|--------------|
| 1. Parallel Deploy | Day 0 | New dashboard on port 8002, old stays on 7001 |
| 2. Parity Validation | Days 1–3 | Compare responses, run parity tests |
| 3. Switchover | Day 3–4 | New takes over old port, old stopped |
| 4. Monitoring | Days 4–10 | Watch for issues, rollback ready |
| 5. Decommission | Day 10+ | Remove old service and standalone repo |

## Prerequisites

- Node.js ≥ 18
- VentureOS monorepo cloned and dependencies installed
- Access to the machine running the standalone dashboard
- ~5 minutes for parallel deploy, ~15 minutes for full switchover

## Phase 1: Parallel Deployment (Day 0)

The new dashboard runs alongside the old one. Zero risk — old service is untouched.

> **Linux:** Migration requires root privileges for systemd operations (`/etc/systemd/system`,
> `systemctl`). Use `sudo -E` to preserve environment variables (OPENCLAW_DIR, PARALLEL_PORT, etc.).

```bash
# From VentureOS root
cd ~/clawd/ventureos

# Run the migration script (starts new on port 8002)
# macOS:
./dashboard/scripts/migrate-from-standalone.sh
# Linux:
sudo -E ./dashboard/scripts/migrate-from-standalone.sh

# Or with custom parallel port
PARALLEL_PORT=9000 ./dashboard/scripts/migrate-from-standalone.sh
```

After running, you'll have:
- **Old dashboard:** `http://localhost:7001` (unchanged)
- **New dashboard:** `http://localhost:8002` (parallel)

### Dry Run

See what would happen without making changes:

```bash
./dashboard/scripts/migrate-from-standalone.sh --dry-run
```

## Phase 2: Parity Validation (Days 1–3)

### Automated Parity Tests

```bash
cd dashboard
npm run test:parity
```

The parity test suite (from issue #80) compares responses between old and new dashboards across all API endpoints.

### Manual Spot Checks

```bash
# Health
diff <(curl -s localhost:7001/api/health) <(curl -s localhost:8002/api/health)

# KPIs
diff <(curl -s localhost:7001/api/kpis) <(curl -s localhost:8002/api/kpis)

# Sessions
diff <(curl -s localhost:7001/api/sessions/active) <(curl -s localhost:8002/api/sessions/active)

# System stats
diff <(curl -s localhost:7001/api/system/stats) <(curl -s localhost:8002/api/system/stats)
```

### What to Watch For

- Response status codes match
- JSON structure is identical
- Numeric values are within expected ranges
- No new errors in logs:
  ```bash
  tail -f ~/Library/Logs/openclaw-dashboard.err.log
  ```

## Phase 3: Production Switchover (Day 3–4)

Once parity is validated:

```bash
# Interactive switchover — stops old, moves new to old port
./dashboard/scripts/migrate-from-standalone.sh --switchover
```

This will:
1. Stop the old standalone service
2. Reconfigure the new service from port 8002 → 7001
3. Restart the new service
4. Run a health check

### Manual Switchover (if preferred)

**macOS:**
```bash
# Stop old
launchctl unload ~/Library/LaunchAgents/com.openclaw.dashboard.plist

# Reconfigure new to use production port
# Edit the plist to change port 8002 → 7001
launchctl unload ~/Library/LaunchAgents/com.openclaw.dashboard.monorepo.plist
# (edit the plist DASHBOARD_PORT)
launchctl load -w ~/Library/LaunchAgents/com.openclaw.dashboard.monorepo.plist
```

**Linux:**
```bash
sudo systemctl stop agent-dashboard
sudo sed -i 's/DASHBOARD_PORT=8002/DASHBOARD_PORT=7001/' /etc/systemd/system/openclaw-dashboard.service
sudo systemctl daemon-reload
sudo systemctl restart openclaw-dashboard
```

## Phase 4: Monitoring (Days 4–10)

Keep the old standalone service files in place (but stopped) for easy rollback.

**Check health regularly:**
```bash
curl -s localhost:7001/api/health | jq .
```

**Monitor logs:**
```bash
# macOS
tail -f ~/Library/Logs/openclaw-dashboard.log

# Linux
journalctl -u openclaw-dashboard -f
```

**If anything goes wrong:**
```bash
# Immediate rollback (< 5 min)
./dashboard/scripts/rollback.sh

# Full rollback with validation (< 15 min)
./dashboard/scripts/rollback.sh --full
```

## Phase 5: Decommission (Day 10+)

After 1 week of stable operation:

```bash
# 1. Remove old service files
# macOS
rm ~/Library/LaunchAgents/com.openclaw.dashboard.plist

# Linux
sudo rm /etc/systemd/system/agent-dashboard.service
sudo systemctl daemon-reload

# 2. Archive standalone repo (optional)
cd ~/clawd
mv openclaw-dashboard openclaw-dashboard.archived

# 3. Clean up migration backups
rm -rf ~/clawd/ventureos/dashboard/.migration-backup-*

# 4. Remove parallel port from new service (if still configured for 8002)
# Should already be on production port after switchover
```

## Rollback Procedures

### Immediate Rollback (< 5 minutes)

For any critical issue discovered after switchover:

```bash
./dashboard/scripts/rollback.sh
```

What it does:
1. Stops the new monorepo dashboard service
2. Re-enables the old standalone dashboard service
3. Verifies the old dashboard responds

### Full Rollback (< 15 minutes)

For thorough restoration with validation:

```bash
./dashboard/scripts/rollback.sh --full
```

Additional steps beyond immediate rollback:
1. Removes new service configuration files
2. Validates all critical API endpoints
3. Verifies standalone source is intact
4. Runs comprehensive health checks

### Manual Emergency Rollback

If scripts don't work:

**macOS:**
```bash
# Kill new
launchctl unload ~/Library/LaunchAgents/com.openclaw.dashboard.monorepo.plist 2>/dev/null

# Start old
launchctl load -w ~/Library/LaunchAgents/com.openclaw.dashboard.plist

# Verify
curl -s localhost:7001/api/health
```

**Linux:**
```bash
sudo systemctl stop openclaw-dashboard
sudo systemctl start agent-dashboard
curl -s localhost:7001/api/health
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DASHBOARD_PORT` | `7000` | HTTP listen port |
| `DASHBOARD_HOST` | `0.0.0.0` | Bind address |
| `VENTUREOS_ROOT` | `~/clawd/ventureos` | Monorepo root |
| `OPENCLAW_DIR` | `~/.openclaw` | OpenClaw runtime directory |
| `NODE_ENV` | `production` | Node environment |
| `PARALLEL_PORT` | `8002` | Port for parallel deployment |

## Troubleshooting

### New service won't start

```bash
# Check logs
tail -50 ~/Library/Logs/openclaw-dashboard.err.log  # macOS
journalctl -u openclaw-dashboard -n 50               # Linux

# Common causes:
# - Port already in use → check with: lsof -i :7000
# - Missing dependencies → cd ventureos && npm install
# - TypeScript not compiled → cd dashboard && npx tsc -p tsconfig.json --outDir dist
```

### Parity tests failing

```bash
# Run with verbose output
cd dashboard && npm run test:parity -- --reporter=verbose

# Check if old dashboard is still running
curl -s localhost:7001/api/health

# Check new dashboard
curl -s localhost:8002/api/health
```

### Port conflict

```bash
# Find what's using a port
lsof -i :7001
lsof -i :8002

# Kill specific process
kill $(lsof -ti :8002)
```

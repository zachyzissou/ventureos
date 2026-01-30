# Monitor-Agent Deployment Guide

## Quick Start

### 1. Configure Discord Webhook

Edit `com.clawdbot.monitor-agent.plist` and set your Discord webhook URL:

```xml
<key>DISCORD_WEBHOOK_URL</key>
<string>https://discord.com/api/webhooks/YOUR_WEBHOOK_HERE</string>
```

### 2. Deploy

```bash
./deploy.sh
```

That's it! Monitor-Agent is now running as a background service.

---

## Management

### Check Status

```bash
./manage.sh status
```

Shows:
- Service running state
- Last 10 log entries
- Service statistics

### View Logs

```bash
# Standard output
./manage.sh logs

# Error output
./manage.sh errors
```

### Start/Stop/Restart

```bash
./manage.sh start
./manage.sh stop
./manage.sh restart
```

### Run Tests

```bash
./manage.sh test
```

---

## Service Details

**Service Name:** `com.clawdbot.monitor-agent`

**launchd Plist:** `~/Library/LaunchAgents/com.clawdbot.monitor-agent.plist`

**Auto-Start:** Yes (runs at login)

**Auto-Restart:** Yes (restarts if crashed, throttled to 10s)

**Logs:**
- Standard: `logs/monitor-agent.log`
- Errors: `logs/monitor-agent.error.log`

**Log Rotation:**
- Rotates at 10MB
- Keeps 7 days of history
- Compresses old logs (GZ)

---

## Manual launchd Commands

If you prefer to use launchd directly:

```bash
# Load (start) service
launchctl load ~/Library/LaunchAgents/com.clawdbot.monitor-agent.plist

# Unload (stop) service
launchctl unload ~/Library/LaunchAgents/com.clawdbot.monitor-agent.plist

# Check status
launchctl list | grep monitor-agent

# View service info
launchctl list com.clawdbot.monitor-agent
```

---

## Troubleshooting

### Service won't start

1. Check error log: `tail logs/monitor-agent.error.log`
2. Verify Discord webhook URL is set
3. Check Python environment: `./venv/bin/python --version`
4. Run tests: `./manage.sh test`

### No alerts being sent

1. Verify Discord webhook URL is correct
2. Check logs for HTTP errors: `grep -i discord logs/monitor-agent.log`
3. Test webhook manually: `curl -X POST <webhook_url> -H "Content-Type: application/json" -d '{"content":"test"}'`

### Database errors

1. Check permissions: `ls -la monitor.db`
2. Re-initialize: `rm monitor.db && python -c "from monitor.state_db import StateDatabase; import asyncio; asyncio.run(StateDatabase('monitor.db').connect())"`

### High CPU usage

1. Check for detection loops: `grep -i "detected issue" logs/monitor-agent.log | wc -l`
2. Increase check interval in config.yaml
3. Review detector logic

---

## Uninstall

```bash
# Stop service
./manage.sh stop

# Remove plist
rm ~/Library/LaunchAgents/com.clawdbot.monitor-agent.plist

# Optional: Remove logs and database
rm -rf logs/ monitor.db
```

---

## Production Checklist

Before deploying to production:

- [ ] Discord webhook URL configured
- [ ] All tests passing (`./manage.sh test`)
- [ ] Structure validation passing (`python validate_structure.py`)
- [ ] Database initialized
- [ ] Log directory created
- [ ] Service starts successfully
- [ ] At least one check cycle completed (wait 60s)
- [ ] Alerts are being delivered to Discord

---

## Monitoring the Monitor

Monitor-Agent monitors itself:

- **Database health:** Checked every cycle
- **Detector failures:** Logged and alerted
- **Healer failures:** Logged and alerted
- **Alert failures:** Logged (can't alert about alert failures 😅)

Check the logs regularly for any warnings.

---

## Log Rotation Setup (Optional)

To enable automatic log rotation via macOS newsyslog:

```bash
sudo cp newsyslog.conf /etc/newsyslog.d/monitor-agent.conf
```

Logs will rotate:
- When they reach 10MB
- Keep 7 days of compressed archives
- Automatic via macOS system

---

## Next Steps

After deployment:

1. Monitor for 1-2 hours to ensure stability
2. Trigger a test issue to verify auto-healing (e.g., create uncommitted git changes)
3. Review Discord alerts for proper severity routing
4. Add more detectors/validators as needed
5. Tune alert thresholds in config.yaml

---

**Questions?** Check logs first, then review CODING-STANDARDS.md for architecture details.

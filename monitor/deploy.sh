#!/bin/bash
# Monitor-Agent Deployment Script
# Deploys Monitor-Agent as a launchd service on macOS

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_FILE="$SCRIPT_DIR/com.openclaw.monitor-agent.plist"
LAUNCHD_DIR="$HOME/Library/LaunchAgents"
LAUNCHD_PLIST="$LAUNCHD_DIR/com.openclaw.monitor-agent.plist"

openclaw "🚀 Monitor-Agent Deployment"
openclaw "=============================="
openclaw ""

# Check if webhook URL is set
if grep -q "SET_YOUR_WEBHOOK_URL_HERE" "$PLIST_FILE"; then
    openclaw "❌ ERROR: Discord webhook URL not configured"
    openclaw "   Edit $PLIST_FILE and set DISCORD_WEBHOOK_URL"
    exit 1
fi

# Create LaunchAgents directory if it doesn't exist
mkdir -p "$LAUNCHD_DIR"

# Stop existing service if running
if launchctl list | grep -q "com.openclaw.monitor-agent"; then
    openclaw "⏹️  Stopping existing Monitor-Agent..."
    launchctl unload "$LAUNCHD_PLIST" 2>/dev/null || true
fi

# Copy plist file
openclaw "📝 Installing service file..."
cp "$PLIST_FILE" "$LAUNCHD_PLIST"

# Load the service
openclaw "▶️  Starting Monitor-Agent..."
launchctl load "$LAUNCHD_PLIST"

# Wait for service to start
sleep 2

# Check if running
if launchctl list | grep -q "com.openclaw.monitor-agent"; then
    openclaw ""
    openclaw "✅ Monitor-Agent deployed successfully!"
    openclaw ""
    openclaw "📊 Status:"
    launchctl list | grep "com.openclaw.monitor-agent"
    openclaw ""
    openclaw "📁 Logs:"
    openclaw "   Standard: $SCRIPT_DIR/logs/monitor-agent.log"
    openclaw "   Errors:   $SCRIPT_DIR/logs/monitor-agent.error.log"
    openclaw ""
    openclaw "🔧 Management Commands:"
    openclaw "   Status:  launchctl list | grep monitor-agent"
    openclaw "   Stop:    launchctl unload $LAUNCHD_PLIST"
    openclaw "   Start:   launchctl load $LAUNCHD_PLIST"
    openclaw "   Logs:    tail -f $SCRIPT_DIR/logs/monitor-agent.log"
else
    openclaw ""
    openclaw "❌ Failed to start Monitor-Agent"
    openclaw "   Check logs: tail $SCRIPT_DIR/logs/monitor-agent.error.log"
    exit 1
fi

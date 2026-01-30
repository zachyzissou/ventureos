#!/bin/bash
# Monitor-Agent Deployment Script
# Deploys Monitor-Agent as a launchd service on macOS

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_FILE="$SCRIPT_DIR/com.clawdbot.monitor-agent.plist"
LAUNCHD_DIR="$HOME/Library/LaunchAgents"
LAUNCHD_PLIST="$LAUNCHD_DIR/com.clawdbot.monitor-agent.plist"

echo "🚀 Monitor-Agent Deployment"
echo "=============================="
echo ""

# Check if webhook URL is set
if grep -q "SET_YOUR_WEBHOOK_URL_HERE" "$PLIST_FILE"; then
    echo "❌ ERROR: Discord webhook URL not configured"
    echo "   Edit $PLIST_FILE and set DISCORD_WEBHOOK_URL"
    exit 1
fi

# Create LaunchAgents directory if it doesn't exist
mkdir -p "$LAUNCHD_DIR"

# Stop existing service if running
if launchctl list | grep -q "com.clawdbot.monitor-agent"; then
    echo "⏹️  Stopping existing Monitor-Agent..."
    launchctl unload "$LAUNCHD_PLIST" 2>/dev/null || true
fi

# Copy plist file
echo "📝 Installing service file..."
cp "$PLIST_FILE" "$LAUNCHD_PLIST"

# Load the service
echo "▶️  Starting Monitor-Agent..."
launchctl load "$LAUNCHD_PLIST"

# Wait for service to start
sleep 2

# Check if running
if launchctl list | grep -q "com.clawdbot.monitor-agent"; then
    echo ""
    echo "✅ Monitor-Agent deployed successfully!"
    echo ""
    echo "📊 Status:"
    launchctl list | grep "com.clawdbot.monitor-agent"
    echo ""
    echo "📁 Logs:"
    echo "   Standard: $SCRIPT_DIR/logs/monitor-agent.log"
    echo "   Errors:   $SCRIPT_DIR/logs/monitor-agent.error.log"
    echo ""
    echo "🔧 Management Commands:"
    echo "   Status:  launchctl list | grep monitor-agent"
    echo "   Stop:    launchctl unload $LAUNCHD_PLIST"
    echo "   Start:   launchctl load $LAUNCHD_PLIST"
    echo "   Logs:    tail -f $SCRIPT_DIR/logs/monitor-agent.log"
else
    echo ""
    echo "❌ Failed to start Monitor-Agent"
    echo "   Check logs: tail $SCRIPT_DIR/logs/monitor-agent.error.log"
    exit 1
fi

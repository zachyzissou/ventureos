#!/bin/bash
# Test Monitor-Agent in dry-run mode (foreground)
# Will run for 2 cycles then exit

cd /Users/zachgonser/clawd/monitor
source venv/bin/activate

export DISCORD_WEBHOOK_URL="${DISCORD_WEBHOOK_URL:-https://discord.com/api/webhooks/1466893157827612941/lbJ4vBd59fBmY8iF8DZ3vpEa6E0C_y3GK6Mf9wzUGtpiOFyLGsmJP46j9LU5eZ_sWYiY}"

echo "🧪 Testing Monitor-Agent in DRY-RUN mode"
echo "=========================================="
echo ""
echo "Will run for ~2 minutes (2 cycles) then you can Ctrl+C"
echo ""
echo "Watch for:"
echo "  ✅ 'SAFETY CHECK' with dry_run=True"
echo "  ✅ 'healer_dry_run_enabled' for all healers"
echo "  ✅ 'dry_run_gateway_restart' if gateway issue detected"
echo "  ❌ NO 'gateway_restart_success' messages"
echo ""
echo "Press Enter to start..."
read

python3 -m monitor.main_loop

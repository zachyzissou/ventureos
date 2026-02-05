#!/bin/bash

# Stanton Times System Validation Script

# Activate virtual environment
source .venv/bin/activate

# Check Python version
echo "Python Version:"
python3 --version

# Validate core dependencies
echo "Checking Dependencies:"
pip freeze | grep -E "discord|node-fetch|minimist"

# Test webhook connectivity
echo "Testing Webhook:"
node send-embed.mjs --title "System Validation" --description "Automated system check"

# Validate configuration
echo "Checking Configuration:"
cat config.json

# Run dry run to test full workflow
echo "Running Dry Run:"
./dry_run.sh

# Check log files for recent entries
echo "Recent Logs:"
tail -n 10 logs/discord_bot.log
tail -n 10 logs/content_processing.log

# Final status
echo "System Validation Complete"
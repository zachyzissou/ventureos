#!/bin/bash

# Activate virtual environment
source .venv/bin/activate

# Ensure log directory exists
mkdir -p logs

# Run monitoring script
python source_monitor.py &

# Run Discord bot
python discord_bot.py &

# Run tweet publisher
python tweet_publisher.py
#!/bin/bash

# Activate virtual environment
source .venv/bin/activate

# Run Discord bots
python discord_verifier.py &
python reaction_monitor.py &

# Wait for all background processes
wait
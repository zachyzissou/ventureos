#!/bin/bash

# Activate virtual environment
source .venv/bin/activate

# Ensure log directory exists
mkdir -p logs

# Run dry run simulation to generate contents
python dry_run.py

# Send notifications via webhook
python discord_verifier.py
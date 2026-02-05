#!/bin/bash

# Activate virtual environment
source .venv/bin/activate

# Restore configuration from previous version
python migration_recovery.py

# Rerun dry run with restored configuration
./dry_run.sh
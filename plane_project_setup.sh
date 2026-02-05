#!/bin/bash

# Setup environment
export PLANE_CONFIG_DIR="/Users/zachgonser/.config/plane"
export PLANE_WORKSPACE="slurpnet"

# Activate virtual environment
source /Users/zachgonser/clawd/.venv/mcp-server/bin/activate

# Authenticate with Plane
plane auth login --workspace "$PLANE_WORKSPACE"

# Run project creation script
python3 /Users/zachgonser/clawd/plane_project_creator.py

# Deactivate virtual environment
deactivate
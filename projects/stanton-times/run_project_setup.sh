#!/bin/bash

# Activate virtual environment
source /Users/zachgonser/clawd/.venv/mcp-server/bin/activate

# Run the project setup script
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${PROJECT_DIR}"
python plane_project_setup.py

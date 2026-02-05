#!/bin/bash

# Activate virtual environment
source /Users/zachgonser/clawd/.venv/mcp-server/bin/activate

# Run Python setup script
python /Users/zachgonser/clawd/plane-mcp-robust-setup.py

# Optionally, launch MCP server
uvx plane-mcp-server stdio
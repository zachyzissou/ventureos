#!/bin/bash

# Activate virtual environment
source /Users/zachgonser/clawd/.venv/mcp-server/bin/activate

# Set environment variables
export PLANE_API_KEY=plane_api_292d5a7b1b214f57b94e6e1835ae45eb
export PLANE_WORKSPACE_SLUG=slurpnet
export PLANE_BASE_URL=http://192.168.225.149:7210

# Execute stdio transport
uvx plane-mcp-server stdio
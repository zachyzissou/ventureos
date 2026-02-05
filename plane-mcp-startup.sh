#!/bin/bash

# Activate virtual environment
source /Users/zachgonser/clawd/.venv/mcp-server/bin/activate

# Set environment variables
export PLANE_BASE_URL=http://192.168.225.149:7210
export PLANE_API_KEY=plane_api_292d5a7b1b214f57b94e6e1835ae45eb
export PLANE_WORKSPACE_SLUG=slurpnet

# Verbose logging
openclaw "🚀 Starting Plane MCP Server"
openclaw "Base URL: $PLANE_BASE_URL"
openclaw "Workspace: $PLANE_WORKSPACE_SLUG"

# Start the MCP server with stdio transport
uvx plane-mcp-server stdio
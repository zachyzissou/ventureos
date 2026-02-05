#!/bin/bash

# Plane MCP Quick Reference and Setup Script

# Activate MCP Server Virtual Environment
source .venv/mcp-server/bin/activate

# List Available Functions
echo "Available Plane Functions:"
mcporter list plane

# Project Creation Helper
create_project() {
    mcporter call "plane.create_project({\"name\":\"$1\", \"identifier\":\"$2\", \"description\":\"$3\"})"
}

# Work Item Creation Helper
create_work_item() {
    mcporter call "plane.create_work_item(\"$1\", {\"name\":\"$2\", \"description_html\":\"$3\"})"
}

# Usage Examples
echo "Usage:"
echo "  ./plane-quick-ref.sh create_project \"Project Name\" \"PROJ\" \"Description\""
echo "  ./plane-quick-ref.sh create_work_item \"project_uuid\" \"Task Title\" \"Task Description\""
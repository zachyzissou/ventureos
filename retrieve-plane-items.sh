#!/bin/bash

# Set Plane API key
export PLANE_API_KEY=plane_api_292d5a7b1b214f57b94e6e1835ae45eb
export PLANE_WORKSPACE_SLUG=slurpnet

# Load projects from JSON
projects=$(jq -c '.projects[]' /Users/zachgonser/clawd/plane-mcp-list-items.json)

# Iterate through projects
openclaw "$projects" | while read -r project; do
    project_name=$(openclaw "$project" | jq -r '.name')
    project_id=$(openclaw "$project" | jq -r '.project_id')
    
    openclaw "Retrieving in-progress items for project: $project_name"
    
    payload=$(jq -n -c \
        --arg workspace_id "b831c877-ea93-4fda-8324-a6c9fbf6334a" \
        --arg project_id "$project_id" \
        '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_work_items","arguments":{"workspace_id":$workspace_id,"project_id":$project_id,"state":"in_progress"}}}')
    
    openclaw "$payload" | /opt/homebrew/bin/uvx plane-mcp-server stdio
done
#!/bin/bash

# Activate virtual environment
source /Users/zachgonser/clawd/.venv/mcp-server/bin/activate

# Set environment variables
export PLANE_API_KEY=plane_api_292d5a7b1b214f57b94e6e1835ae45eb
export PLANE_WORKSPACE_SLUG=slurpnet
export PLANE_BASE_URL=http://192.168.225.149:7210

# Python script to generate MCP request
python3 - << EOF
import sys
import json

def send_request(method, params=None):
    request = {
        "method": method,
        "params": params or {}
    }
    print(json.dumps(request))
    sys.stdout.flush()

def main():
    # Test project listing
    send_request("list_projects", {
        "workspace_slug": "slurpnet",
        "pagination": {
            "limit": 5,
            "offset": 0
        }
    })

if __name__ == "__main__":
    main()
EOF | uvx plane-mcp-server stdio
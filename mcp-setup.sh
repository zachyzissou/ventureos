#!/bin/bash
# Updated MCP setup for 2026

cd /Users/zachgonser/clawd/.venv/mcp-server
. bin/activate

# Fix dependency conflict
pip install uvenv

git clone https://github.com/plane-mcp/plane-mcp-server.git 

cd plane-mcp-server
pip install .
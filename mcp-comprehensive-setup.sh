#!/bin/bash

# Comprehensive MCP Server Setup Script

set -e

# Ensure Homebrew is up to date
brew update

# Install Python 3.10
brew install python@3.10

# Create virtual environment with Python 3.10
/opt/homebrew/bin/python3.10 -m venv /Users/zachgonser/clawd/.venv/mcp-server

# Activate virtual environment
source /Users/zachgonser/clawd/.venv/mcp-server/bin/activate

# Upgrade pip
pip install --upgrade pip

# Set environment variables
export PLANE_API_KEY=plane_api_292d5a7b1b214f57b94e6e1835ae45eb
export PLANE_WORKSPACE_SLUG=slurpnet
export PLANE_BASE_URL=http://192.168.225.149:7210

# Install MCP dependencies
pip install fastmcp anyio mcp plane-mcp-server

# Verify installations
python -c "import plane_mcp; print(f'Plane MCP Version: {plane_mcp.__version__}')"

openclaw "MCP Server virtual environment setup complete."

# Create a test script to diagnose MCP server
cat << EOF > /Users/zachgonser/clawd/mcp-server-test.py
import plane_mcp
import os

def main():
    print("MCP Server Diagnostic Test")
    print(f"API Key: {'*' * 10}{os.environ['PLANE_API_KEY'][-4:]}")
    print(f"Workspace Slug: {os.environ['PLANE_WORKSPACE_SLUG']}")
    print(f"Base URL: {os.environ['PLANE_BASE_URL']}")
    
    # Add more diagnostic checks here
    print("Diagnostic complete.")

if __name__ == "__main__":
    main()
EOF

# Make the test script executable
chmod +x /Users/zachgonser/clawd/mcp-server-test.py

# Run the diagnostic script
python /Users/zachgonser/clawd/mcp-server-test.py
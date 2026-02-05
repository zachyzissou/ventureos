#!/bin/bash

set -e

# Ensure we're using the correct Python version
PYTHON_CMD="/opt/homebrew/bin/python3.10"

# Create/Activate Virtual Environment
VENV_PATH="/Users/zachgonser/clawd/.venv/mcp-server"
$PYTHON_CMD -m venv $VENV_PATH
source $VENV_PATH/bin/activate

# Upgrade pip and setuptools
pip install --upgrade pip setuptools wheel

# Install dependencies with explicit source if needed
pip install git+https://github.com/makeplane/plane-mcp-server.git
pip install git+https://github.com/makeplane/plane-sdk.git

# Verify installations
pip install plane-mcp-server plane-sdk fastmcp mcp

# Create verification script
cat << 'EOF' > /Users/zachgonser/clawd/plane-mcp-verify.py
import sys
import importlib

def verify_package(package_name):
    try:
        module = importlib.import_module(package_name.replace('-', '_'))
        print(f"✓ {package_name} imported successfully")
        print(f"  Location: {module.__file__}")
        return True
    except ImportError:
        print(f"✗ {package_name} FAILED to import")
        return False

def main():
    packages_to_verify = [
        'plane-mcp-server',
        'plane-sdk',
        'fastmcp',
        'mcp'
    ]

    all_verified = all(verify_package(pkg) for pkg in packages_to_verify)
    
    if not all_verified:
        sys.exit(1)

if __name__ == "__main__":
    main()
EOF

# Run verification script
$PYTHON_CMD /Users/zachgonser/clawd/plane-mcp-verify.py

# Set environment variables
export PLANE_API_KEY=plane_api_292d5a7b1b214f57b94e6e1835ae45eb
export PLANE_WORKSPACE_SLUG=slurpnet
export PLANE_BASE_URL=http://192.168.225.149:7210

openclaw "Plane MCP Server setup complete."
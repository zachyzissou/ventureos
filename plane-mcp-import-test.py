import sys
import os

# Add site-packages to Python path
sys.path.append('/Users/zachgonser/clawd/.venv/mcp-server/lib/python3.10/site-packages')

# Set environment variables
os.environ['PLANE_API_KEY'] = 'plane_api_292d5a7b1b214f57b94e6e1835ae45eb'
os.environ['PLANE_WORKSPACE_SLUG'] = 'slurpnet'
os.environ['PLANE_BASE_URL'] = 'http://192.168.225.149:7210'

# Attempt imports with detailed error handling
def attempt_import(module_name):
    try:
        module = __import__(module_name)
        print(f"Successfully imported {module_name}")
        print(f"Module location: {module.__file__}")
        return module
    except ImportError as e:
        print(f"Failed to import {module_name}: {e}")
        return None
    except Exception as e:
        print(f"Unexpected error importing {module_name}: {e}")
        return None

# List of modules to import
modules_to_import = [
    'plane_mcp_server',
    'plane_sdk',
    'fastmcp',
    'mcp'
]

# Import each module
for module_name in modules_to_import:
    attempt_import(module_name)
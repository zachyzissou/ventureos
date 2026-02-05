import sys
import os
import json
import subprocess

def debug_mcp_connection():
    # Environment variable configuration
    env = os.environ.copy()
    env['PLANE_API_KEY'] = 'plane_api_292d5a7b1b214f57b94e6e1835ae45eb'
    env['PLANE_WORKSPACE_SLUG'] = 'slurpnet'
    env['PLANE_BASE_URL'] = 'http://192.168.225.149:7210'

    # Diagnostic information
    print("MCP Server Connection Diagnostic")
    print("--------------------------------")
    print(f"Python Version: {sys.version}")
    print(f"Environment Variables:")
    for key in ['PLANE_API_KEY', 'PLANE_WORKSPACE_SLUG', 'PLANE_BASE_URL']:
        print(f"  {key}: {env.get(key, 'NOT SET')}")

    # Attempt to run MCP server with explicit environment
    try:
        result = subprocess.run(
            ['uvx', 'plane-mcp-server', 'stdio'], 
            env=env, 
            capture_output=True, 
            text=True
        )
        
        print("\nSubprocess Output:")
        print("STDOUT:", result.stdout)
        print("STDERR:", result.stderr)
        print("Return Code:", result.returncode)
    
    except Exception as e:
        print(f"Subprocess Execution Error: {e}")

if __name__ == "__main__":
    debug_mcp_connection()
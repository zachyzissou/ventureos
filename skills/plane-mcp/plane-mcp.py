#!/Users/zachgonser/clawd/plane-mcp-server/.venv/bin/python3
import sys
import os

import json
import anyio
from mcp.client.stdio import StdioServerParameters, stdio_client
from mcp.client.session import ClientSession

def _read_api_key_from_file():
    key_path = "/Users/zachgonser/.credentials/plane_api_key"
    try:
        with open(key_path, "r", encoding="utf-8") as f:
            return f.read().strip()
    except FileNotFoundError:
        return None

def get_env_config():
    api_key = os.environ.get("PLANE_API_KEY") or _read_api_key_from_file()
    return {
        "PLANE_API_KEY": api_key,
        "PLANE_WORKSPACE_SLUG": os.environ.get("PLANE_WORKSPACE_SLUG"),
        "PLANE_BASE_URL": os.environ.get("PLANE_BASE_URL", "http://192.168.225.149:7210"),
        "PATH": "/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin",
    }

async def run_mcp_tool(tool_name, arguments=None):
    env = get_env_config()
    
    if not env["PLANE_API_KEY"] or not env["PLANE_WORKSPACE_SLUG"]:
        print("Error: PLANE_API_KEY and PLANE_WORKSPACE_SLUG must be set", file=sys.stderr)
        sys.exit(1)
    
    params = StdioServerParameters(
        command="/Users/zachgonser/clawd/plane-mcp-server/.venv/bin/plane-mcp-server",
        args=["stdio"],
        env=env,
    )
    
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            
            # Normalize arguments
            arguments = arguments or {}
            
            # Debugging: print tool signature
            print("TOOL ARGUMENTS:", json.dumps(arguments), file=sys.stderr)
            
            result = await session.call_tool(tool_name, arguments)
            
            # Post-processing for specific tools
            if tool_name == "list_work_items" and "state" in arguments:
                # Filter locally if server doesn't support state filtering
                result_list = (result.structuredContent.get('result', []) 
                               if hasattr(result, 'structuredContent') 
                               else (json.loads(result.content[0].text) if hasattr(result, 'content') else result))
                
                return [item for item in result_list if item.get('state') == arguments['state']]
            
            # Handle different result structures
            if hasattr(result, 'structuredContent'):
                return result.structuredContent.get('result', [])
            elif hasattr(result, 'content'):
                return json.loads(result.content[0].text)
            else:
                return result

def main():
    if len(sys.argv) < 2:
        print("Usage: plane-mcp <tool_name> [arguments]", file=sys.stderr)
        sys.exit(1)
    
    tool_name = sys.argv[1]
    arguments = {}
    
    # Parse arguments in key=value format
    for arg in sys.argv[2:]:
        if '=' in arg:
            key, value = arg.split('=', 1)
            try:
                # Try to parse as JSON if possible
                arguments[key] = json.loads(value)
            except json.JSONDecodeError:
                arguments[key] = value
    
    try:
        result = anyio.run(run_mcp_tool, tool_name, arguments)
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

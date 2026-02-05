import os
import subprocess
import json
import sys
import time

def run_mcp_server():
    """Spawn the MCP server with correct environment variables"""
    env = os.environ.copy()
    env.update({
        'PLANE_API_KEY': 'zach-personal-api-key',
        'PLANE_WORKSPACE_SLUG': 'slurpnet',
        'PLANE_BASE_URL': 'http://192.168.225.149:7210'
    })

    # Spawn the MCP server
    process = subprocess.Popen(
        ['uvx', 'plane-mcp-server', 'stdio'],
        env=env,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    return process

def send_mcp_request(process, method, params=None):
    """Send a JSON-RPC request over stdio"""
    request = {
        'method': method,
        'params': params or {}
    }
    request_str = json.dumps(request) + '\n'
    
    print(f"Sending request: {request_str.strip()}")
    process.stdin.write(request_str)
    process.stdin.flush()

    # Wait and read response
    time.sleep(0.5)
    response_str = process.stdout.readline()
    print(f"Raw response: {response_str}")
    
    return json.loads(response_str)

def main():
    print("Starting Plane MCP Server...")
    server_process = run_mcp_server()

    try:
        # Wait for server to initialize
        time.sleep(2)

        print("Sending tools discovery request...")
        tools_response = send_mcp_request(server_process, 'list_tools')
        print("\nTools Discovery Response:")
        print(json.dumps(tools_response, indent=2))

        print("\nSending list projects request...")
        projects_response = send_mcp_request(server_process, 'list_projects', 
                                             {'workspace_slug': 'slurpnet'})
        print("\nProjects Response:")
        print(json.dumps(projects_response, indent=2))

    except Exception as e:
        print(f"Error: {e}")
    finally:
        # Capture any error output
        print("\nStderr:")
        print(server_process.stderr.read())
        
        # Cleanup
        server_process.stdin.close()
        server_process.terminate()
        server_process.wait()

if __name__ == '__main__':
    main()
import json
import subprocess
import sys

def send_request(process, method, params=None):
    """Send a single newline-terminated JSON-RPC request"""
    request = {
        'jsonrpc': '2.0',
        'id': 1,
        'method': method
    }
    if params:
        request['params'] = params
    
    msg = json.dumps(request) + '\n'
    sys.stderr.write(f"Sending: {msg.strip()}\n")
    process.stdin.write(msg.encode('utf-8'))
    process.stdin.flush()

def read_response(process):
    """Read a single newline-terminated JSON response"""
    line = process.stdout.readline().decode('utf-8').strip()
    sys.stderr.write(f"Received: {line}\n")
    return json.loads(line)

def main():
    # Environment setup
    env = {
        'PLANE_BASE_URL': 'http://192.168.225.149:7210',
        'PLANE_API_KEY': 'plane_api_292d5a7b1b214f57b94e6e1835ae45eb',
        'PLANE_WORKSPACE_SLUG': 'slurpnet'
    }

    # Spawn MCP server
    process = subprocess.Popen(
        ['/opt/homebrew/bin/uvx', 'plane-mcp-server', 'stdio'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env
    )

    try:
        # 1. Initialize
        send_request(process, 'initialize', {
            'protocolVersion': '2024-11-05',
            'capabilities': {},
            'clientInfo': {
                'name': 'openclaw',
                'version': 'x'
            }
        })

        # 2. Read initialize response
        init_response = read_response(process)
        sys.stderr.write(f"Initialize Response: {json.dumps(init_response, indent=2)}\n")

        # 3. List tools
        send_request(process, 'tools/list')

        # 4. Read tools response
        tools_response = read_response(process)
        sys.stderr.write(f"Tools Response: {json.dumps(tools_response, indent=2)}\n")

    except Exception as e:
        sys.stderr.write(f"Error: {e}\n")
    finally:
        # Capture any additional stderr output
        stderr_output = process.stderr.read().decode('utf-8')
        if stderr_output:
            sys.stderr.write(f"Stderr: {stderr_output}\n")
        
        process.terminate()
        process.wait()

if __name__ == '__main__':
    main()
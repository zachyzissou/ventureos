import json
import os
import subprocess
import sys

def send_request(process, method, params=None):
    request = {
        'jsonrpc': '2.0',
        'id': 1,
        'method': method
    }
    if params:
        request['params'] = params
    
    msg = json.dumps(request) + '\n'
    print(f"RAW REQUEST: {msg.strip()}")
    sys.stdout.flush()
    
    process.stdin.write(msg.encode('utf-8'))
    process.stdin.flush()

def read_response(process):
    # Explicitly read line-by-line
    line = process.stdout.readline()
    print(f"RAW RESPONSE: {line.decode('utf-8').strip()}")
    sys.stdout.flush()
    return json.loads(line)

def main():
    # Copy existing environment and restore critical PATH
    env = os.environ.copy()
    env["PATH"] = "/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin"
    
    # Set Plane-specific environment variables
    env['PLANE_BASE_URL'] = 'http://192.168.225.149:7210'
    env['PLANE_WORKSPACE_SLUG'] = 'slurpnet'
    env['PLANE_API_KEY'] = 'plane_api_292d5a7b1b214f57b94e6e1835ae45eb'

    # Spawn process using full uvx path with restored environment
    process = subprocess.Popen(
        ['/opt/homebrew/bin/uvx', 'plane-mcp-server', 'stdio'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env
    )

    try:
        # Initialize
        send_request(process, 'initialize', {
            'protocolVersion': '2024-11-05',
            'capabilities': {},
            'clientInfo': {
                'name': 'openclaw',
                'version': 'x'
            }
        })

        # Read initialize response
        init_response = read_response(process)
        print("Initialize Response:", json.dumps(init_response, indent=2))

        # List tools
        send_request(process, 'tools/list')

        # Read tools response
        tools_response = read_response(process)
        print("Tools Response:", json.dumps(tools_response, indent=2))

    except Exception as e:
        print(f"Error: {e}")
    finally:
        # Capture stderr
        stderr_output = process.stderr.read().decode('utf-8')
        if stderr_output:
            print("Stderr:", stderr_output)
        
        process.terminate()
        process.wait()

if __name__ == '__main__':
    main()
import sys
import importlib
import subprocess
import json
import os

def run_command(command):
    """Run a shell command and return output."""
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        return {
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returncode': result.returncode
        }
    except Exception as e:
        return {'error': str(e)}

def diagnose_package_installation():
    """Comprehensive package installation diagnostic."""
    packages_to_check = [
        'plane_mcp_server',
        'plane_sdk',
        'fastmcp',
        'mcp'
    ]
    
    results = {}
    
    # Check Python environment
    results['python_version'] = sys.version
    results['python_executable'] = sys.executable
    
    # Check package installation
    for package in packages_to_check:
        try:
            module = importlib.import_module(package)
            results[package] = {
                'imported': True,
                'file': getattr(module, '__file__', 'Unknown'),
                'version': getattr(module, '__version__', 'No version attribute')
            }
        except ImportError:
            results[package] = {'imported': False}
    
    # Pip list check
    pip_list_result = run_command('pip list')
    results['pip_list'] = pip_list_result
    
    return results

def main():
    diagnostic_results = diagnose_package_installation()
    
    print("Plane MCP Server Diagnostic Results:")
    print(json.dumps(diagnostic_results, indent=2))
    
    # Environment variable check
    print("\nEnvironment Variables:")
    env_vars = ['PLANE_API_KEY', 'PLANE_WORKSPACE_SLUG', 'PLANE_BASE_URL']
    for var in env_vars:
        print(f"{var}: {os.environ.get(var, 'NOT SET')}")

if __name__ == "__main__":
    main()